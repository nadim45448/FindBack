/**
 * The `RecoveryResponseSelectionService` — FR-43's provisional selection.
 *
 * **The sequence is the mechanism.** The order is:
 *
 * ```text
 * 1.  read the Lost report                     → the owner and the status
 * 2.  read the report's selection facts        → the currently-selected response
 * 3.  decide the selection                      → permitted | no-op | refused
 * 4.  BEGIN
 * 5.    UPDATE recovery_responses (conditional) → the response moves
 * 6.    UPDATE reports                          → the report reaches Verification Pending
 * 7.    INSERT audit_events (events 17 and 29)  → the selection and the move
 * 8.  COMMIT
 * ```
 *
 * **Why the two reads come before the decision.** The decision is a pure
 * domain function, and it needs three facts: the actor is the owner, the
 * report is `Open`, and the selected response has not been confirmed. The
 * application layer is the only place that knows how to obtain them.
 *
 * **Why the writes are inside one transaction.** The response's move, the
 * report's move, and the two audit events are one act. A response that is
 * selected while the report stays `Open` would leave the workflow in a state
 * the PRD does not name — the owner's choice would have had no effect on the
 * report at all.
 *
 * **The sibling responses are not touched, and there is no code path that
 * could touch them.** The decision returns the one response's new status;
 * the writes address one response by id. There is no "update the siblings"
 * statement to go wrong.
 *
 * **The already-selected case writes nothing.** The owner clicking twice is
 * a repeated request for a state that already holds — not a mistake needing
 * an error message, and not a second audit entry.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  assertSelectionPermitted,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type { LostReportSubjectReader, LostReportSubject } from './ports/lost-report-subject-reader';
import type {
  RecoveryResponseSelectionRepository,
} from './ports/recovery-response-selection-repository';
import type {
  LostSideEventFactory,
  SelectedForVerificationDraft,
  ToVerificationPendingDraft,
} from '@/application/lost-side-event-factory';

/** The actor making the selection. */
export interface RecoveryResponseSelectionActor {
  readonly actorId: string;
  /**
   * Whether the actor's account is `Active`.
   *
   * **The account's capability is resolved once, at the `ActorContext`
   * boundary,** and this flag is that resolution.
   */
  readonly isAccountActive: boolean;
}

/** What the caller supplies. */
export interface SelectRecoveryResponseRequest {
  readonly reportId: string;
  readonly responseId: string;
  readonly actor: RecoveryResponseSelectionActor;
}

/** What the service returns. */
export interface SelectRecoveryResponseResult {
  readonly responseId: string;
  /** The response's status after the selection. */
  readonly status: RecoveryResponseStatus;
  /** The report's status after the selection. */
  readonly reportStatus: string;
  /** The event recorded for the selection itself (event 17). */
  readonly eventId: string;
  /**
   * Whether anything was written.
   *
   * **`false` for the idempotent no-op** — the response was already
   * selected, so the owner clicking twice writes nothing and records
   * nothing.
   */
  readonly changed: boolean;
}

/**
 * Selects one Recovery Response for verification on a Lost report.
 *
 * @throws {PermissionDeniedError} when the actor's account is not `Active`,
 * when the actor is not the Lost report's owner, when the report does not
 * exist, or when the report is not a Lost report. Nothing is written.
 * @throws {ConflictError} when the workflow's state refuses the selection —
 * the report is not `Open`, the match is already confirmed, or the response
 * is not awaiting review. Nothing is written.
 */
export class RecoveryResponseSelectionService {
  constructor(
    private readonly reports: LostReportSubjectReader,
    private readonly responses: RecoveryResponseSelectionRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly events: LostSideEventFactory,
  ) {}

  async select(
    request: SelectRecoveryResponseRequest,
  ): Promise<SelectRecoveryResponseResult> {
    // ── 1. Read the Lost report ───────────────────────────────────────────
    //
    // **The read happens before the decision,** because the decision needs
    // the report's type, status, and owner.
    const report = await this.reports.readLostReport(request.reportId);

    if (!report) {
      throw new PermissionDeniedError(
        'This report does not exist, so a response cannot be selected.',
      );
    }

    // ── 2. The report's selection facts ────────────────────────────────────
    //
    // **Two facts, and the second is about the report's outcome.** The
    // currently-selected response is what makes a second selection a
    // conflict, and whether it has reached `Match Confirmed` is what locks
    // the workflow.
    const facts = await this.responses.readSelectionFacts(request.reportId);

    // ── 3. The response being selected ─────────────────────────────────────
    //
    // **The response's own status is needed for the decision.** It is read
    // from the selection facts' report when the response *is* the selected
    // one, and from the repository otherwise — so a response that is
    // `Submitted` and one that is already selected are told apart.
    const responseStatus = await this.readResponseStatus(request.reportId, request.responseId, facts);

    // ── 4. The decision ────────────────────────────────────────────────────
    //
    // **The domain decides.** The service supplies the facts and acts on
    // the verdict; it does not write its own rule.
    const decision = assertSelectionPermitted({
      actorId: request.actor.actorId,
      reportOwnerId: report.reporterId,
      reportStatus: report.status,
      responseStatus,
      hasMatchConfirmed:
        facts?.selectedResponseStatus === 'Match Confirmed',
    });

    // ── The idempotent no-op ───────────────────────────────────────────────
    //
    // **Nothing is written.** The state the owner asked for already holds,
    // and a second audit entry would misrepresent what happened.
    if (decision.kind === 'AlreadySelected') {
      return {
        responseId: request.responseId,
        status: 'Selected for Verification',
        reportStatus: decision.reportStatus,
        eventId: '',
        changed: false,
      };
    }

    // ── The permitted decision ────────────────────────────────────────────
    //
    // **The refusal case has already thrown,** so what remains is the
    // permitted decision — and the statuses it names are the statuses the
    // writes use. The narrowing is explicit rather than implied, because a
    // caller that assumed the decision's kind would be assuming the rule.
    if (decision.kind !== 'Permitted') {
      throw new ConflictError(
        'This response cannot be selected for verification.',
      );
    }

    // ── 5. The selection, the report's move, and the events, in one act ────
    const written = await this.transactions.run((transaction) =>
      this.writeSelection(request, report, decision, transaction),
    );

    return {
      responseId: request.responseId,
      status: decision.responseStatus,
      reportStatus: decision.reportStatus,
      eventId: written.eventId,
      changed: true,
    };
  }

  /**
   * Read the status of the response being selected.
   *
   * **The selection facts answer it when the response is the selected one**
   * — that is the idempotent-no-op case, and it is the one where a separate
   * read would be wasted. Otherwise the repository is asked for the
   * response's own status.
   */
  private async readResponseStatus(
    reportId: string,
    responseId: string,
    facts: { readonly selectedResponseId: string | null; readonly selectedResponseStatus: RecoveryResponseStatus | null } | null,
  ): Promise<RecoveryResponseStatus> {
    if (facts && facts.selectedResponseId === responseId && facts.selectedResponseStatus) {
      return facts.selectedResponseStatus;
    }

    const status = await this.responses.readResponseStatus(reportId, responseId);

    if (status === null) {
      throw new ConflictError(
        'This response does not exist on this report, so it cannot be selected.',
      );
    }

    return status;
  }

  /**
   * Write the selection, the report's move, and the two events — in the
   * caller's transaction.
   */
  private async writeSelection(
    request: SelectRecoveryResponseRequest,
    report: LostReportSubject,
    decision: { readonly responseStatus: RecoveryResponseStatus; readonly reportStatus: string },
    transaction: TransactionHandle,
  ): Promise<{ readonly eventId: string }> {
    // ── The response moves ─────────────────────────────────────────────────
    //
    // **The write is conditional on the response still being `Submitted`.**
    // A response decided between the read and this write is not selected,
    // and the write lands nothing.
    const selected = await this.responses.selectForVerification(
      request.responseId,
      transaction,
    );

    if (!selected) {
      // **The response was decided while we were deciding.** The write did
      // not land, so nothing else is written — and the transaction rolls
      // back with the conflict.
      throw new ConflictError(
        'This response is no longer awaiting review, so it cannot be selected for verification.',
      );
    }

    // ── The report moves ───────────────────────────────────────────────────
    //
    // **The report's move is part of the selection, not a consequence of it.**
    // A selection that left the report `Open` would mean the owner's choice
    // had no effect on the workflow.
    await this.reports.moveToVerificationPending(report.id, transaction);

    // ── Event 17 — the selection itself ────────────────────────────────────
    //
    // **The actor is the Lost-report owner,** who makes the selection.
    const selectionDraft: SelectedForVerificationDraft = {
      lostReportId: report.id,
      recoveryResponseId: request.responseId,
      ownerId: request.actor.actorId,
      occurredAt: report.occurredAt,
    };

    const selectionEvent = await this.events.recordSelectedForVerification(
      selectionDraft,
      transaction,
    );

    // ── Event 29 — the report entered `Verification Pending` ──────────────
    //
    // **The causing human is a plain member** — the owner who selected.
    const moveDraft: ToVerificationPendingDraft = {
      lostReportId: report.id,
      selectedResponseId: request.responseId,
      ownerId: request.actor.actorId,
      occurredAt: report.occurredAt,
    };

    await this.events.recordToVerificationPending(moveDraft, transaction);

    return { eventId: selectionEvent.id };
  }
}
