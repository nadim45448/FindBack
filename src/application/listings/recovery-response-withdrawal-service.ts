/**
 * The `RecoveryResponseWithdrawalService` — FR-40's responder exit.
 *
 * **The withdrawal is the responder's own exit, and it is deliberately
 * narrow.** It is permitted only while the response is untouched `Submitted`
 * and unselected. Once the owner has selected it, **the decision belongs to
 * the owner and the administrator**, not to the responder — and the domain's
 * `decideWithdrawal` is what says so.
 *
 * **The sequence is the mechanism.**
 *
 * ```text
 * 1.  read the response's withdrawal facts   → the status and the responder
 * 2.  decide the withdrawal                    → permitted | refused
 * 3.  BEGIN
 * 4.    UPDATE recovery_responses (conditional) → the response becomes Withdrawn
 * 5.    INSERT audit_events (event 20)          → the withdrawal
 * 6.  COMMIT
 * ```
 *
 * **The write is conditional on the response still being `Submitted`.** The
 * read and the write are two moments, and between them the owner may have
 * selected the response — at which point the withdrawal is no longer
 * permitted. The conditional write is what makes the refusal hold under a
 * race; the domain's rule is the user-facing half, and this is the fact.
 *
 * **The write lands nothing on a lost race,** and the conflict is the
 * outcome. The transaction rolls back with the conflict, so there is no
 * half-withdrawn response and no audit event for a withdrawal that did not
 * happen.
 *
 * **The report is not touched.** A withdrawn response leaves the Lost
 * report's status **unaffected** — the report may be `Verification Pending`
 * because of a *different* selection, and withdrawing one response does not
 * change that. **There is no code path here that could touch the report**,
 * and the service does not even hold a report port — the isolation is
 * structural.
 *
 * **The message and the event commit together.** The trail is append-only
 * with no correction path (ADR-6), so an audit record for a withdrawal that
 * did not happen is permanent. Both are inside one transaction.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  decideWithdrawal,
  withdrawalRefusalMessage,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type {
  LostSideEventFactory,
  ResponseWithdrawnDraft,
} from '@/application/lost-side-event-factory';

import type { RecoveryResponseWithdrawalRepository } from './ports/recovery-response-withdrawal-repository';

/** The actor withdrawing. */
export interface RecoveryResponseWithdrawalActor {
  readonly actorId: string;
  /**
   * Whether the actor's account is `Active`.
   *
   * **A deactivated responder cannot withdraw.** FR-5 preserves their
   * responses — deactivation is not withdrawal — but it does stop them from
   * acting, and this flag is that resolution.
   */
  readonly isAccountActive: boolean;
}

/** What the caller supplies. */
export interface WithdrawRecoveryResponseRequest {
  readonly responseId: string;
  readonly actor: RecoveryResponseWithdrawalActor;
}

/** What the service returns. */
export interface WithdrawRecoveryResponseResult {
  readonly responseId: string;
  /** The response's status after the withdrawal. */
  readonly status: RecoveryResponseStatus;
  /** The event recorded for the withdrawal (event 20). */
  readonly eventId: string;
}

/**
 * Withdraws one Recovery Response on the responder's own behalf.
 *
 * @throws {PermissionDeniedError} when the actor's account is not `Active`,
 * when the actor is not the response's responder, or when no response carries
 * that id. Nothing is written.
 * @throws {ConflictError} when the response may no longer be withdrawn — it
 * has been selected, decided, or closed. Nothing is written.
 */
export class RecoveryResponseWithdrawalService {
  constructor(
    private readonly responses: RecoveryResponseWithdrawalRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly events: LostSideEventFactory,
  ) {}

  async withdraw(
    request: WithdrawRecoveryResponseRequest,
  ): Promise<WithdrawRecoveryResponseResult> {
    // ── 1. The account must be active ──────────────────────────────────────
    //
    // **FR-5 preserves the response; it does not stop the account from
    // acting.** A deactivated responder keeps their response, but they may
    // not withdraw it — and nothing cascades into a withdrawal either.
    if (!request.actor.isAccountActive) {
      throw new PermissionDeniedError(
        'Your account is not active, so you cannot withdraw this response.',
      );
    }

    // ── 2. The response's withdrawal facts ─────────────────────────────────
    const facts = await this.responses.readWithdrawalFacts(request.responseId);

    // **A missing response is the access-denied refusal.** A response the
    // actor does not own is a different refusal from a response that does
    // not exist, and the two are told apart — the responder's own exit is
    // about *their* response, so a stranger's id is a permission failure
    // rather than a state conflict.
    if (!facts) {
      throw new PermissionDeniedError(
        'This response does not exist, so it cannot be withdrawn.',
      );
    }

    // ── 3. Only the responder may withdraw ────────────────────────────────
    if (facts.responderId !== request.actor.actorId) {
      throw new PermissionDeniedError(
        'Only the member who made this response can withdraw it.',
      );
    }

    // ── 4. The decision ────────────────────────────────────────────────────
    //
    // **The domain decides.** The service supplies the fact and acts on the
    // verdict; it does not write its own rule.
    const decision = decideWithdrawal(facts.status);

    if (decision.kind === 'Refused') {
      throw new ConflictError(withdrawalRefusalMessage(decision.reason));
    }

    // ── 5. The write and the event, in one act ────────────────────────────
    const written = await this.transactions.run((transaction) =>
      this.writeWithdrawal(facts, request.actor, transaction),
    );

    return {
      responseId: facts.recoveryResponseId,
      status: decision.status,
      eventId: written.eventId,
    };
  }

  /**
   * Write the withdrawal and its event — in the caller's transaction.
   */
  private async writeWithdrawal(
    facts: { readonly recoveryResponseId: string; readonly lostReportId: string },
    actor: RecoveryResponseWithdrawalActor,
    transaction: TransactionHandle,
  ): Promise<{ readonly eventId: string }> {
    // ── The response moves ─────────────────────────────────────────────────
    //
    // **The write is conditional on the response still being `Submitted`.**
    // A response selected or decided between the read and this write is not
    // withdrawn, and the write lands nothing.
    const withdrawn = await this.responses.withdraw(facts.recoveryResponseId, transaction);

    if (!withdrawn) {
      // **The response was selected while we were deciding.** The write did
      // not land, so nothing else is written — and the transaction rolls
      // back with the conflict.
      throw new ConflictError(
        'This response is being reviewed, so it can no longer be withdrawn.',
      );
    }

    // ── Event 20 — the withdrawal ─────────────────────────────────────────
    //
    // **The actor is the responder**, who makes the withdrawal. The report
    // is untouched, and the event says nothing about it — because nothing
    // about it changed.
    const draft: ResponseWithdrawnDraft = {
      lostReportId: facts.lostReportId,
      recoveryResponseId: facts.recoveryResponseId,
      responderId: actor.actorId,
    };

    const event = await this.events.recordResponseWithdrawn(draft, transaction);

    return { eventId: event.id };
  }
}
