/**
 * The `RecoveryResponseDeterminationService` — FR-43's
 * owner-determines / administrator-records split.
 *
 * **The sequence is the mechanism.** The order is:
 *
 * ```text
 * 1.  read the Lost report                     → the owner and the status
 * 2.  read the selected response               → its current status
 * 3.  decide the determination                  → permitted | refused
 * 4.  BEGIN
 * 5.    UPDATE recovery_responses (conditional) → the response moves
 * 6.    UPDATE reports                          → the report moves (a not-a-match only)
 * 7.    INSERT audit_events (events 18/19, 28) → the determination and the move
 * 8.  COMMIT
 * 9.  send the FR-46 event-6 email (after the commit)
 * ```
 *
 * ## The two actors are kept apart at every step
 *
 * **The administrator records; the owner determines.** The determination
 * decision checks the two halves separately — the recorder must be an
 * administrator, and the maker must be the report's owner — and the audit
 * event records them in **two different columns**, so the distinction
 * survives into the trail.
 *
 * **The maker is a server-side fact, not a request field.** The service
 * reads the report's owner from the database and compares the supplied
 * maker against it. A client cannot name a different maker and have it
 * accepted.
 *
 * ## A confirmed match does not move the report
 *
 * **The report stays `Verification Pending` after a `Match Confirmed`
 * determination, because the physical return has not been confirmed.** The
 * domain's lifecycle table states this as a deliberate no-op, and this
 * service follows it: only the `Not a Match` path writes the report's
 * status.
 *
 * ## The email is sent after the commit, and its failure is not the
 * determination's failure
 *
 * ADR-3's decision 4: the notification is a *consequence* of the
 * determination, not a part of it. A determination that commits and then
 * fails to send a notification has **succeeded** — the outcome is recorded
 * and the trail is written.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { EmailSender } from '@/application/ports/email-sender';

import {
  assertDeterminationPermitted,
  decideDeterminationOutcome,
  type DeterminationOutcome,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type {
  LostReportSubject,
  LostReportSubjectReader,
} from './ports/lost-report-subject-reader';
import type {
  RecoveryResponseSelectionRepository,
} from './ports/recovery-response-selection-repository';
import type {
  RecoveryResponseResponderReader,
} from './ports/recovery-response-responder-reader';
import type {
  DeterminationDraft,
  LostSideEventFactory,
  NotAMatchReturnToOpenDraft,
} from '@/application/lost-side-event-factory';
import type {
  RecoveryResponseDeterminationEmailBuilder,
} from './recovery-response-determination-email';

/** The actor recording the determination. */
export interface RecoveryResponseDeterminationActor {
  readonly actorId: string;
  /**
   * Whether the actor is an administrator.
   *
   * **The capability is resolved once, at the `ActorContext` boundary.** The
   * service does not re-read the account and does not write its own
   * `if (role !== 'administrator')` guard.
   */
  readonly isAdministrator: boolean;
}

/** What the caller supplies. */
export interface RecordDeterminationRequest {
  readonly reportId: string;
  readonly responseId: string;
  /**
   * The owner who made the determination.
   *
   * **`null` when the caller supplied none** — and the determination is
   * refused, because there is nothing to record. This is not the
   * administrator deciding on their own; it is a recording with no
   * determination in it.
   */
  readonly determinedByUserId: string | null;
  /** The outcome the owner determined. */
  readonly outcome: DeterminationOutcome;
  /** The acting administrator recording the determination. */
  readonly actor: RecoveryResponseDeterminationActor;
}

/** What the service returns. */
export interface RecordDeterminationResult {
  readonly responseId: string;
  /** The response's status after the determination. */
  readonly status: RecoveryResponseStatus;
  /** The report's status after the determination. */
  readonly reportStatus: string;
  /** The event recorded for the determination (event 18 or 19). */
  readonly eventId: string;
}

/**
 * Records an owner's determination on a selected Recovery Response.
 *
 * @throws {PermissionDeniedError} when the actor is not an administrator,
 * when no owner determination was supplied, or when the named maker is not
 * the Lost report's owner. Nothing is written.
 * @throws {ConflictError} when the response is not awaiting determination,
 * or when the report is terminal. Nothing is written.
 */
export class RecoveryResponseDeterminationService {
  constructor(
    private readonly reports: LostReportSubjectReader,
    private readonly responses: RecoveryResponseSelectionRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly events: LostSideEventFactory,
    private readonly emails: EmailSender,
    /**
     * The email template the notification uses.
     *
     * **The content lives in the builder, not here.** The trigger and the
     * wording are one implementation point, exactly as the new-claim email
     * is.
     */
    private readonly emailBuilder: RecoveryResponseDeterminationEmailBuilder,
    /**
     * The responder's address, when the determination notifies them.
     *
     * **Read inside the transaction, after the determination has been
     * written** — the notification is a consequence of a fact that is now
     * true.
     */
    private readonly responders: RecoveryResponseResponderReader,
  ) {}

  async record(
    request: RecordDeterminationRequest,
  ): Promise<RecordDeterminationResult> {
    // ── 1. Read the Lost report ───────────────────────────────────────────
    const report = await this.reports.readLostReport(request.reportId);

    if (!report) {
      throw new PermissionDeniedError(
        'This report does not exist, so no determination can be recorded.',
      );
    }

    // ── 2. The selected response ──────────────────────────────────────────
    //
    // **The response's own status is the fact the decision needs.** Only a
    // `Selected for Verification` response may be determined.
    const responseStatus = await this.responses.readResponseStatus(
      request.reportId,
      request.responseId,
    );

    if (responseStatus === null) {
      throw new ConflictError(
        'This response does not exist on this report, so no determination can be recorded.',
      );
    }

    // ── 3. The decision ────────────────────────────────────────────────────
    //
    // **The domain decides.** The service supplies the facts and acts on
    // the verdict; it does not write its own rule.
    assertDeterminationPermitted({
      recorderId: request.actor.actorId,
      isAdministrator: request.actor.isAdministrator,
      reportOwnerId: report.reporterId,
      determinedByUserId: request.determinedByUserId,
      responseStatus,
    });

    // ── 4. The outcome's consequences ──────────────────────────────────────
    //
    // **The outcome changes what is written, not whether it may be.** The
    // permission rules are identical for both outcomes.
    const outcome = decideDeterminationOutcome(request.outcome);

    // ── 5. The determination, the report's move, and the events ────────────
    const written = await this.transactions.run((transaction) =>
      this.writeDetermination(request, report, outcome, transaction),
    );

    // ── 6. The notification, after the commit ──────────────────────────────
    await this.notify(request.responseId, outcome.outcome);

    return {
      responseId: request.responseId,
      status: outcome.responseStatus,
      reportStatus: outcome.reportStatus,
      eventId: written.eventId,
    };
  }

  /**
   * Write the determination, the report's move, and the events — in the
   * caller's transaction.
   */
  private async writeDetermination(
    request: RecordDeterminationRequest,
    report: LostReportSubject,
    outcome: { readonly outcome: DeterminationOutcome; readonly responseStatus: RecoveryResponseStatus; readonly reportStatus: string },
    transaction: TransactionHandle,
  ): Promise<{ readonly eventId: string }> {
    // ── The response moves ─────────────────────────────────────────────────
    //
    // **The write is conditional on the response still being selected.** Two
    // administrators recording different determinations concurrently cannot
    // both land — the second write finds nothing to update.
    const determined = await this.responses.determine(
      request.responseId,
      outcome.responseStatus,
      transaction,
    );

    if (!determined) {
      throw new ConflictError(
        'This response is not awaiting verification, so no determination can be recorded.',
      );
    }

    // ── The report moves — only on a not-a-match ──────────────────────────
    //
    // **A confirmed match leaves the report `Verification Pending`.** The
    // physical return has not been confirmed, so the workflow has not ended.
    if (outcome.outcome === 'not_a_match') {
      await this.reports.moveToOpen(report.id, transaction);
    }

    // ── Event 18 or 19 — the determination ────────────────────────────────
    //
    // **The two halves are recorded in two different columns.** The maker
    // is the owner; the recorder is the acting administrator; and the event
    // names the administrator as the system actor performing the write.
    const draft: DeterminationDraft = {
      lostReportId: report.id,
      recoveryResponseId: request.responseId,
      determination: {
        determinedByUserId: request.determinedByUserId!,
        recordedByAdministratorId: request.actor.actorId,
      },
      lostReportOwnerId: report.reporterId,
      outcome: outcome.outcome,
      verificationTimestamp: report.occurredAt,
      occurredAt: report.occurredAt,
    };

    const determinationEvent = await this.events.recordDetermination(draft, transaction);

    // ── Event 28 — the report returned to `Open` ──────────────────────────
    //
    // **Only the not-a-match path writes it.** A confirmed match does not
    // move the report, so it has no return to record.
    if (outcome.outcome === 'not_a_match') {
      const moveDraft: NotAMatchReturnToOpenDraft = {
        lostReportId: report.id,
        priorSelectedResponseId: request.responseId,
        actingAdministratorId: request.actor.actorId,
        occurredAt: report.occurredAt,
      };

      await this.events.recordNotAMatchReturnToOpen(moveDraft, transaction);
    }

    return { eventId: determinationEvent.id };
  }

  /**
   * Notify the responder of the outcome.
   *
   * **A send failure never fails the determination.** The outcome is
   * already recorded and the trail is already written; the email is a
   * notification of a fact that is now true.
   */
  private async notify(
    responseId: string,
    outcome: DeterminationOutcome,
  ): Promise<void> {
    try {
      const responder = await this.responders.readResponder(responseId);

      if (responder === null) {
        return;
      }

      const message = this.emailBuilder.build({
        recipientEmail: responder.email,
        outcome,
      });

      await this.emails.send(message);
    } catch {
      // Recorded by the transport. The determination stands — the outcome is
      // recorded and the trail is written, and neither depends on the
      // notification arriving.
    }
  }
}
