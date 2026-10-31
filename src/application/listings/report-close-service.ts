/**
 * The `ReportCloseService` — FR-21's Found-side administrator close.
 *
 * **The close is an operation, and the dependent Claims are part of it.**
 * FR-21 says that closing a Found report in `Claim Requested` transitions
 * "any Pending Claims ... to `Rejected`", and FR-17's Trigger 3 says the
 * same with the verbatim reason "report closed by administrator". Both
 * happen in **one transaction**, so a report that is `Closed` while a Claim
 * is still `Pending` cannot exist — and a claimant waiting on a claim that
 * will never be decided cannot exist either.
 *
 * **The close reason is required, and it is the administrator's own words.**
 * "Close reason omitted | Refused; a reason is required" is the story's
 * edge case, and the reason is what the trail preserves: PRD FR-21 says the
 * audit event records "the administrator, the documented reason, the prior
 * report lifecycle status, and a timestamp". A close with no reason would
 * be an administrative action with nothing to explain it.
 *
 * **The audit event is inside the transaction, and there are two kinds.**
 * Event 10 (`report.found_closed_by_administrator`) records the close
 * itself. Event 5 (`claim.auto_rejected`) records **each** auto-rejected
 * Claim, as a distinct separate event — story 006 says "each auto-rejection
 * is a distinct separate event rather than a single combined entry", and an
 * administrator auditing one specific rejected Claim must find it.
 *
 * **The emails are after the commit, and they reach the claimants only.**
 * PRD FR-29 names "report closed by administrator" explicitly as one of the
 * auto-rejection reasons a claim-rejection email carries, and FR-29 says
 * "Sent to the claimant only". The finder receives **no** decision email —
 * the finder learns of the outcome through My Reports.
 *
 * **The exceptional `Claim Approved → Closed` close does not auto-reject
 * anything,** because by that point no Claim is `Pending` — the approved one
 * is `Approved`, and it stays `Approved` for historical accuracy. The
 * service does not treat that as an error; it simply finds no Pending
 * Claims to reject.
 *
 * **The Lost side is not this service's business.** FR-21's Lost-side
 * closure resolves Recovery Responses rather than Claims, and it is bolt
 * `020`'s story 005. This service is the Found side, and the report's type
 * is checked — a Lost report is refused here rather than closed without
 * its Recovery Responses being resolved.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { EmailSender } from '@/application/ports/email-sender';

import {
  buildClaimAutoRejectedEvent,
  buildReportFoundClosedByAdministratorEvent,
  autoRejectionReason,
  CLOSE_AUTO_REJECTION_TRIGGER,
  createReportClosureReason,
  decideFoundReportTransition,
  type ClaimAutoRejected,
  type PersistedReport,
  type ReportFoundClosedByAdministrator,
  type ReportStatus,
} from '@/domain/listings';

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

import type { ReportInteractionResolver, RejectedClaim } from './ports/report-interaction-resolver';
import type { ReportRepository } from './ports/report-repository';
import type { ClaimDecisionEmailBuilder } from './claim-decision-email';

/** The administrator who is closing. */
export interface ReportCloseActor {
  readonly actorId: string;
  /** Whether the actor is an administrator. */
  readonly isAdministrator: boolean;
}

/** What the caller supplies to close a report. */
export interface CloseReportRequest {
  readonly reportId: string;
  readonly actor: ReportCloseActor;
  /** The administrator's reason. 10–500 characters. */
  readonly reason: string;
}

/** What a close produced. */
export interface CloseReportResult {
  /** The report as it was, immediately before it was closed. */
  readonly report: PersistedReport;
  /** The status it reached. Always `Closed`. */
  readonly status: 'Closed';
  /** The close's audit event. */
  readonly event: ReportFoundClosedByAdministrator;
  /** The Claims the close auto-rejected. */
  readonly autoRejected: readonly AutoRejectedClaim[];
}

/** A Claim the close auto-rejected. */
export interface AutoRejectedClaim {
  readonly claimId: string;
  readonly claimantEmail: string;
  /** The audit event written for this auto-rejection. */
  readonly event: ClaimAutoRejected;
}

/** The clock, injected so the timestamp is testable. */
export interface ReportCloseClock {
  now(): Date;
}

/**
 * Closes reports.
 */
export class ReportCloseService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly resolver: ReportInteractionResolver,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: ReportCloseClock,
    private readonly emails: EmailSender,
    private readonly emailBuilder: ClaimDecisionEmailBuilder,
  ) {}

  /**
   * Close a Found report as an administrator.
   *
   * @throws {NotFoundError} when no report carries that id.
   * @throws {PermissionDeniedError} when the actor is not an administrator,
   * or when the report is a Lost report — the Lost side's closure resolves
   * Recovery Responses and is a different operation.
   * @throws {ValidationError} when the reason breaks its bound. Nothing is
   * written.
   * @throws {ConflictError} when the report is `Returned` or `Closed`.
   * Nothing is written.
   */
  async close(request: CloseReportRequest): Promise<CloseReportResult> {
    // ── The reason, first ─────────────────────────────────────────────────
    //
    // **A close with no usable reason is refused before anything is read or
    // written.** The reason is what the trail preserves, and a trail entry
    // with no reason explains nothing.
    const reason = createReportClosureReason(request.reason);

    // ── The authorisation ─────────────────────────────────────────────────
    //
    // **The administrator flag comes from the session, never from the
    // request.** The route resolves the actor; the service decides.
    if (!request.actor.isAdministrator) {
      throw new PermissionDeniedError('You do not have access to this.');
    }

    const report = await this.reports.findById(request.reportId);

    if (!report) {
      throw new NotFoundError('No report with that id.');
    }

    // **The Lost side is refused here.** FR-21's Lost-side closure resolves
    // Recovery Responses and writes FR-48 events 24 or 25 — a different
    // operation with a different audit trail. Closing a Lost report through
    // this service would close it and leave its Responses unresolved.
    if (report.type !== 'Found') {
      throw new PermissionDeniedError('This report cannot be closed this way.');
    }

    // ── The gate ──────────────────────────────────────────────────────────
    //
    // **The transition is the domain's.** The cause is `AdministratorClosed`,
    // and the machine refuses a terminal report. A `Returned` or `Closed`
    // report is refused because the story says so: "Given a report already
    // `Returned` or `Closed`, when closure is attempted, then it is refused
    // because the report is terminal".
    const transition = decideFoundReportTransition({
      currentStatus: report.status,
      cause: 'AdministratorClosed',
    });

    if (transition.kind === 'Refused') {
      throw new ReportCloseRefusedError(
        'This report is closed or returned, so it cannot be closed again.',
      );
    }

    // ── The event, before the write ───────────────────────────────────────
    const event = buildReportFoundClosedByAdministratorEvent({
      reportId: report.id,
      administratorId: request.actor.actorId,
      previousStatus: report.status,
      closureReason: reason,
    });

    // ── The write, in one transaction ─────────────────────────────────────
    //
    // **The close and the auto-rejections are one act.** A report that is
    // `Closed` while its Claims are still `Pending` would leave the two
    // disagreeing.
    const written = await this.transactions.run((transaction) =>
      this.closeAndReject(report, event, request.actor.actorId, reason, transaction),
    );

    // ── The emails, after the commit ──────────────────────────────────────
    //
    // **The claimants only.** The finder receives no decision email.
    await this.notify(written.autoRejected);

    return {
      report,
      status: 'Closed',
      event,
      autoRejected: written.autoRejected,
    };
  }

  /**
   * The close's write, inside the caller's transaction.
   */
  private async closeAndReject(
    report: PersistedReport,
    event: ReportFoundClosedByAdministrator,
    administratorId: string,
    reason: { readonly value: string },
    transaction: TransactionHandle,
  ): Promise<{
    readonly autoRejected: readonly AutoRejectedClaim[];
  }> {
    const closedAt = this.clock.now();

    // ── The dependent Claims ──────────────────────────────────────────────
    //
    // **The resolver's returned set is the set it rejected.** It is obtained
    // by the implementation's single `UPDATE … RETURNING`, so a Claim
    // created concurrently and rejected by the same update is included
    // rather than missed.
    const rejectedClaims = await this.resolver.rejectPendingClaims(
      report.id,
      autoRejectionReason(CLOSE_AUTO_REJECTION_TRIGGER),
      transaction,
    );

    // ── The report's own status ───────────────────────────────────────────
    //
    // **The update carries the status and nothing else.** A close is not an
    // edit; the report's content is untouched.
    await this.reports.update(report.id, { status: 'Closed' }, transaction);

    // ── The close's event ─────────────────────────────────────────────────
    //
    // **The payload carries exactly the catalog's two fields:** the previous
    // status and the closure reason. The sanitizer denies by default, so
    // naming two fields permits two fields.
    await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'report', parentId: event.reportId },
        actor: { actorId: event.administratorId, actorRole: 'administrator' },
        payload: {
          previousFoundStatus: event.payload.previousFoundStatus,
          closureReason: event.payload.closureReason,
        },
        occurredAt: closedAt,
      },
      transaction,
    );

    // ── Each auto-rejection's own event ───────────────────────────────────
    //
    // **One event per rejected Claim,** not a combined entry. Each event's
    // `triggeredBy` names the administrator who closed the report.
    const autoRejected: AutoRejectedClaim[] = [];

    for (const rejected of rejectedClaims) {
      const rejectionEvent = buildClaimAutoRejectedEvent({
        claimId: rejected.claimId,
        reportId: report.id,
        trigger: CLOSE_AUTO_REJECTION_TRIGGER,
        triggeredBy: administratorId,
      });

      await this.audit.record(
        {
          eventType: rejectionEvent.type,
          parent: { parentType: 'claim', parentId: rejected.claimId },
          actor: {
            actorId: 'system',
            actorRole: 'system',
            actingAdministratorId: administratorId,
          },
          payload: {
            triggeredBy: rejectionEvent.payload.triggeredBy,
            triggeringAction: rejectionEvent.payload.triggeringAction,
            foundReportId: rejectionEvent.payload.foundReportId,
            autoRejectionReason: rejectionEvent.payload.autoRejectionReason,
          },
          occurredAt: closedAt,
        },
        transaction,
      );

      autoRejected.push({
        claimId: rejected.claimId,
        claimantEmail: rejected.claimantEmail,
        event: rejectionEvent,
      });
    }

    return { autoRejected };
  }

  /**
   * Send the FR-29 claim-rejection emails.
   *
   * **The copy is the softened copy, not the stored reason.** The stored
   * reason "report closed by administrator" is the trail's wording; the
   * member reads "An administrator has closed the report your claim was
   * made against." The two live in separate modules and the mapping is
   * explicit — the same separation story 006 requires.
   *
   * **A send failure never fails the close.** The report is already
   * `Closed` and its Claims are already `Rejected`; the email is a
   * notification of a fact that is now true.
   */
  private async notify(autoRejected: readonly AutoRejectedClaim[]): Promise<void> {
    for (const rejected of autoRejected) {
      try {
        await this.emails.send(
          this.emailBuilder.buildAutoRejected(
            rejected.claimantEmail,
            rejected.claimId,
            CLOSE_AUTO_REJECTION_TRIGGER,
          ),
        );
      } catch {
        // Recorded by the transport. The close stands.
      }
    }
  }
}

/**
 * The close was refused because the report is terminal.
 *
 * **A named kind of `ConflictError`,** because the transport maps a
 * conflict to a **409** — the status a refused close answers with. A bare
 * `Error` would fall through to a 500, which tells the administrator the
 * request failed for an unknown reason rather than that the report is
 * already closed.
 */
export class ReportCloseRefusedError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The facts the close reports, re-exported for the route's tests. */
export type { RejectedClaim, ReportStatus };
