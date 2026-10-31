/**
 * The `ReturnConfirmationService` — FR-23, FR-24, and FR-25's one
 * implementation.
 *
 * **One service, both directions.** Unit 005's brief is explicit: *"Both
 * directions converge here. There must be exactly **one** Confirm Returned
 * implementation, not one per side — otherwise the receiver and substitute
 * rules drift apart."* This class holds no branch on the report's type: the
 * domain's decision carries the branch, and the service does what the
 * decision says.
 *
 * ## The sequence is the mechanism
 *
 * ```text
 * 1.  read the report's return facts   → the type, the status, the owner
 * 2.  decide the confirmation           → permitted | refused
 * 3.  BEGIN
 * 4.    UPDATE reports (conditional)      → the report reaches Returned
 * 5.    INSERT return_confirmations       → who received it
 * 6.    INSERT audit_events (6/7/21/22)   → the confirmation
 * 7.  COMMIT
 * ```
 *
 * **The report's move, the confirmation row, and the audit event are one
 * act.** A report that is `Returned` with no confirmation row would leave the
 * item marked recovered with nobody answerable for it — which is the exact
 * state FR-25 exists to prevent. And a confirmation row with no report status
 * would record a handover that did not happen.
 *
 * **The write is conditional on the report still being in its direction's
 * precondition status.** The read and the write are two moments, and between
 * them another administrator may confirm the same report. The conditional
 * write is what makes the refusal hold under a race; the domain's rule is
 * the user-facing half, and this is the fact.
 *
 * **The write lands nothing on a lost race,** and the conflict is the
 * outcome. The transaction rolls back with the conflict, so there is no
 * half-confirmed report, no confirmation row without a report, and no audit
 * event for a confirmation that did not happen.
 *
 * **The guard is absolute, and it is enforced twice.** FR-25's guard lives in
 * the domain decision — so an API caller cannot bypass it — and the
 * database's constraint on the `return_confirmations` table refuses a row
 * with no receiver. The two are replicas of one rule, and the domain is the
 * rule.
 *
 * **The default receiver is derived, never supplied.** The caller cannot
 * name the default receiver; the service derives it from the report's facts
 * and the domain's rule. A caller that *did* name one would be choosing the
 * person with a right to the item, which FR-23 does not allow.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  assertConfirmReturnedPermitted,
  buildReturnedConfirmationEvent,
  type SubstituteReceiver,
} from '@/domain/returns';

import { ConflictError, NotFoundError } from '@/lib/errors';

import type { LostReportCloseoutService } from './lost-report-closeout-service';
import type {
  ReturnConfirmationRepository,
  ReturnConfirmationWrite,
} from './ports/return-confirmation-repository';
import type { ReturnSubjectReader } from './ports/return-subject-reader';

/** The actor confirming the return. */
export interface ReturnConfirmationActor {
  readonly actorId: string;
  /**
   * Whether the actor is an administrator.
   *
   * **Returned is confirmed by an administrator only** (FR-23, FR-45) — never
   * by the member and never by the Lost-side owner. The flag comes from the
   * session; the route resolves it and the service checks it, so a client
   * cannot assert its own role.
   */
  readonly isAdministrator: boolean;
}

/**
 * The substitute the administrator recorded.
 *
 * **`null` means the default receiver physically received the item.** The
 * three fields are all-or-nothing (FR-24), and the domain validates them
 * together.
 */
export interface SubstituteReceiverInput {
  readonly name: string;
  readonly authorizationConfirmed: boolean;
  readonly relationship: string;
}

/** What the caller supplies. */
export interface ConfirmReturnedRequest {
  readonly reportId: string;
  readonly actor: ReturnConfirmationActor;
  /** The substitute, or `null` for a default-receiver confirmation. */
  readonly substitute: SubstituteReceiverInput | null;
}

/** What a confirmation produced. */
export interface ConfirmReturnedResult {
  readonly reportId: string;
  /** The report's status after the confirmation. Always `Returned`. */
  readonly status: 'Returned';
  /** The confirmation row's id. */
  readonly confirmationId: string;
  /** The default receiver's account id. */
  readonly defaultReceiverAccountId: string;
  /** The substitute, or `null`. */
  readonly substitute: SubstituteReceiver | null;
  /** The audit event's id. */
  readonly eventId: string;
  /**
   * The Lost-side closeout's outcome, or `null` for a Found report.
   *
   * **Present only on the Lost side,** because the closeout is the Lost
   * side's — it resolves the Recovery Responses and fires the two
   * notifications. A Found report has no responses to resolve.
   */
  readonly closeout: {
    readonly matchedResponseId: string;
    readonly resolvedCount: number;
  } | null;
}

/**
 * Confirms the physical return of an item.
 */
export class ReturnConfirmationService {
  constructor(
    private readonly reports: ReturnSubjectReader,
    private readonly confirmations: ReturnConfirmationRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    /**
     * The Lost-side closeout.
     *
     * **Optional, because the Lost side is the only one that has one.** A
     * Found report has no Recovery Responses to resolve and no FR-46 events
     * 7 and 8 to fire, so the closeout is absent there — and a service
     * that called it unconditionally would be reaching for a thing the
     * Found side does not have.
     *
     * When it *is* present, it runs **inside the confirmation's
     * transaction**. That is the whole point: the report's move and the
     * responses' resolution are one act, and a report that is `Returned`
     * with its matched response still at `Match Confirmed` would be a
     * report that says the item came home while the response that proved
     * it is still in play.
     */
    private closeout?: LostReportCloseoutService,
  ) {}

  /**
   * Attach the Lost-side closeout.
   *
   * **A setter, because the two services refer to each other.** The
   * confirmation holds the closeout, and the closeout's own wiring needs
   * the confirmation's reader and repository — but it does not need the
   * confirmation itself. A constructor argument would be a cycle, and a
   * cycle resolved by a setter is a cycle that is visible in the wiring
   * rather than hidden in a factory.
   *
   * **Attaching the closeout is what makes the Lost side complete.** A
   * confirmation service without one confirms the report and leaves its
   * Recovery Responses unresolved — so the stack attaches one, and the
   * absence is only ever the Found side's.
   */
  attachCloseout(closeout: LostReportCloseoutService): void {
    this.closeout = closeout;
  }

  /**
   * Confirm a report as `Returned`.
   *
   * @throws {NotFoundError} when no report carries that id. Nothing is
   * written.
   * @throws {PermissionDeniedError} when the actor is not an administrator.
   * Nothing is written.
   * @throws {ConflictError} when the report's state refuses the confirmation
   * — it is terminal, it is not in its direction's precondition status, or
   * it has no default receiver. Nothing is written.
   * @throws {ValidationError} when the substitute's fields are invalid.
   * Nothing is written.
   */
  async confirm(
    request: ConfirmReturnedRequest,
  ): Promise<ConfirmReturnedResult> {
    // ── 1. The report's return facts ───────────────────────────────────────
    const report = await this.reports.readReturnSubject(request.reportId);

    if (!report) {
      throw new NotFoundError('No report with that id.');
    }

    // ── 2. The decision ────────────────────────────────────────────────────
    //
    // **The domain decides.** The service supplies the facts and acts on the
    // verdict; it does not write its own rule. The domain owns the
    // administrator check, the precondition, the receiver derivation, and
    // FR-25's guard — and it owns them for both directions at once.
    const decision = assertConfirmReturnedPermitted({
      reportType: report.type,
      reportStatus: report.status,
      reporterId: report.reporterId,
      approvedClaimantId: report.approvedClaimantId,
      isAdministrator: request.actor.isAdministrator,
      substitute: request.substitute,
    });

    // ── The narrowing is explicit rather than implied ──────────────────────
    //
    // **A caller that assumed the decision's kind would be assuming the
    // rule.** The permitted decision always carries a default receiver — the
    // domain refuses a confirmation whose default receiver does not exist —
    // so the assertion below is the domain's promise made visible.
    if (decision.kind !== 'Permitted' || decision.defaultReceiver === null) {
      throw new ConflictError(
        'This report cannot be confirmed as returned.',
      );
    }

    // **The default receiver is bound once, here.** The narrowing above does
    // not survive the closure below, and a receiver read as
    // `decision.defaultReceiver.accountId` inside the closure would need the
    // null check repeated — a second chance to get it wrong. One binding,
    // one non-null value.
    const defaultReceiverAccountId = decision.defaultReceiver.accountId;

    // ── 3. The write, in one transaction ───────────────────────────────────
    //
    // **The Lost-side closeout runs inside this transaction.** The report's
    // move, the confirmation row, the responses' resolution, and the audit
    // events are one act — and the notifications that follow are outside
    // it, because a send failure must not roll back the transition.
    const written = await this.transactions.run((transaction) =>
      this.writeConfirmation(
        request,
        report,
        {
          defaultReceiverAccountId,
          substitute: decision.substitute,
        },
        transaction,
      ),
    );

    return {
      reportId: report.id,
      status: decision.reportStatus,
      confirmationId: written.confirmationId,
      defaultReceiverAccountId: decision.defaultReceiver.accountId,
      substitute: decision.substitute,
      eventId: written.eventId,
      closeout: written.closeout,
    };
  }

  /**
   * Write the report's move, the confirmation row, and the event — in the
   * caller's transaction.
   */
  private async writeConfirmation(
    request: ConfirmReturnedRequest,
    report: { readonly id: string; readonly type: 'Lost' | 'Found' },
    decision: {
      readonly defaultReceiverAccountId: string;
      readonly substitute: SubstituteReceiver | null;
    },
    transaction: TransactionHandle,
  ): Promise<{
    readonly confirmationId: string;
    readonly eventId: string;
    readonly closeout: {
      readonly matchedResponseId: string;
      readonly resolvedCount: number;
    } | null;
  }> {
    // ── The clock ──────────────────────────────────────────────────────────
    //
    // **One reading of the clock.** The confirmation's timestamp is taken
    // once and carried to the row, the event, and the result — so the client
    // is told the value the row actually carries.
    const confirmedAt = new Date();

    const confirmation: ReturnConfirmationWrite = {
      reportId: report.id,
      reportType: report.type,
      administratorId: request.actor.actorId,
      defaultReceiverAccountId: decision.defaultReceiverAccountId,
      substitute: decision.substitute,
      confirmedAt,
    };

    // ── The report moves, and the confirmation is recorded ─────────────────
    //
    // **The write is conditional on the report still being in its direction's
    // precondition status.** A report confirmed by another administrator
    // between the read and this write is not confirmed again, the write
    // lands nothing, and the conflict is the outcome.
    const confirmationId = await this.confirmations.confirmReturned(
      confirmation,
      transaction,
    );

    if (confirmationId === null) {
      // **The report was confirmed while we were confirming.** The write did
      // not land, so nothing else is written — and the transaction rolls
      // back with the conflict.
      throw new ConflictError(
        'This report was already confirmed as returned by someone else.',
      );
    }

    // ── The audit event ────────────────────────────────────────────────────
    //
    // **The event type is the direction's, chosen by the domain.** A Found
    // report writes event 6 or 7; a Lost report writes event 21 or 22. The
    // payload is the catalog's, exactly — one field for a default receiver,
    // three for a substitute.
    const event = buildReturnedConfirmationEvent({
      reportId: report.id,
      administratorId: request.actor.actorId,
      reportType: report.type,
      defaultReceiverAccountId: decision.defaultReceiverAccountId,
      substitute: decision.substitute,
    });

    const written = await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'report', parentId: report.id },
        actor: { actorId: request.actor.actorId, actorRole: 'administrator' },
        payload: event.payload,
        occurredAt: confirmedAt,
      },
      transaction,
    );

    // ── The Lost-side closeout ─────────────────────────────────────────────
    //
    // **It runs inside this transaction, and only on the Lost side.** The
    // closeout resolves the report's Recovery Responses and fires FR-46
    // events 7 and 8; a Found report has neither, and its closeout is
    // absent.
    //
    // **The closeout's own write is conditional on the report's status.**
    // By the time it runs, the report is already `Returned` — the
    // confirmation's write moved it — and the closeout's statement expects
    // `Verification Pending`. So the closeout's write is a *resolution*
    // write that does not move the report, and the report's move has
    // already happened above.
    const closeout =
      report.type === 'Lost' && this.closeout !== undefined
        ? await this.closeout.complete(
            {
              reportId: report.id,
              actor: {
                actorId: request.actor.actorId,
                isAdministrator: request.actor.isAdministrator,
              },
            },
            transaction,
            // **The confirmation has already moved the report.** The
            // closeout's job is the responses' resolution alone.
            true,
          )
        : null;

    return {
      confirmationId,
      eventId: written.id,
      closeout:
        closeout === null
          ? null
          : {
              matchedResponseId: closeout.matchedResponseId,
              resolvedCount: closeout.resolved.length,
            },
    };
  }
}
