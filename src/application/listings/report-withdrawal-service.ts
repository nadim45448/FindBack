/**
 * The `ReportWithdrawalService` — FR-11's withdrawal.
 *
 * **Withdrawal is not a status transition. It is an operation.**
 *
 * A generic transition table would have `Returned` available to it, and
 * FR-11 says a reporter action **never** produces `Returned` — that status
 * means an administrator confirmed a physical return. So withdrawal is
 * modelled as its own use case whose only possible outcome is `Closed`.
 *
 * **The rules differ by report type**, and the difference is not incidental:
 *
 * - **Found:** allowed on `Open` or `Claim Requested`; blocked on `Claim
 *   Approved`, `Returned`, `Closed`. On withdrawal, **every Pending Claim
 *   transitions to `Rejected`** with the audit reason "report withdrawn by
 *   reporter", and **each affected claimant receives the FR-29 rejection
 *   email**.
 * - **Lost:** allowed on `Open` or `Verification Pending` **before Match
 *   Confirmed has been recorded**; blocked once Match Confirmed is recorded,
 *   and on `Returned` and `Closed`. On withdrawal, **every non-terminal
 *   Recovery Response transitions to `Resolved — Report Closed`** and **no
 *   email is sent** (FR-30).
 *
 * **The two sides differ in whether they notify.** The Found side sends the
 * FR-29 claim-rejection email; the Lost side sends nothing. That asymmetry is
 * the PRD's, and it is the reason the email step is inside the Found branch
 * rather than after it.
 *
 * **The sequence is the mechanism:**
 *
 * ```text
 * 1. read the report
 * 2. check ownership            → refuse a non-reporter
 * 3. read the interaction facts → decide the gate
 * 4. BEGIN
 * 5.   resolve the dependent records (Claims rejected / RRs resolved)
 * 6.   UPDATE reports → status Closed
 * 7.   INSERT audit_events (event 9 or event 23, plus the dependents')
 * 8. COMMIT
 * 9. send the emails (after the commit)
 * ```
 *
 * **The dependent resolutions are in the same transaction as the status
 * change.** FR-11 requires the report to be `Closed` *and* its Claims
 * `Rejected` — and a report that is `Closed` while a Claim is still `Pending`
 * would leave the two disagreeing, with a claimant waiting on a claim that
 * will never be decided.
 *
 * **The audit event is inside the transaction.** An audit entry for a
 * transition that did not happen is a defect (ADR-3) — the trail is
 * append-only with no correction path, so the error would be permanent.
 *
 * **The emails are after the commit.** ADR-3's decision 4: the email is sent
 * after the triggering transaction has committed, so there is no transaction
 * to join and a send failure never rolls back the withdrawal. A failed send
 * is recorded, not retried here — the PRD's SM-6 measures delivery, and the
 * operational path owns the retry.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { EmailSender } from '@/application/ports/email-sender';

import {
  buildReportWithdrawnEvent,
  decideWithdrawal,
  withdrawalBlockMessage,
  WITHDRAWAL_CLAIM_REJECTION_REASON,
  type InteractionFacts,
  type PersistedReport,
  type ReportWithdrawn,
} from '@/domain/listings';

import { ConflictError, PermissionDeniedError, NotFoundError } from '@/lib/errors';

import type { ReportInteractionReader } from './ports/report-interaction-reader';
import type {
  RejectedClaim,
  ReportInteractionResolver,
  ResolvedRecoveryResponse,
} from './ports/report-interaction-resolver';
import type { ReportRepository } from './ports/report-repository';

/** The reporter's identity. */
export interface ReportWithdrawalActor {
  readonly actorId: string;
}

/** What the caller supplies. */
export interface WithdrawReportRequest {
  readonly reportId: string;
  readonly actor: ReportWithdrawalActor;
}

/** What the service returns. */
export interface WithdrawReportResult {
  /** The report as it was, immediately before it was withdrawn. */
  readonly report: PersistedReport;
  /** The status it reached. Always `Closed`. */
  readonly status: 'Closed';
  /** The event the audit trail recorded. */
  readonly event: ReportWithdrawn;
  /** The Claims the withdrawal rejected. Found-side only. */
  readonly rejectedClaims: readonly RejectedClaim[];
  /** The Recovery Responses the withdrawal resolved. Lost-side only. */
  readonly resolvedRecoveryResponses: readonly ResolvedRecoveryResponse[];
  /** The claimant addresses the rejection email must reach. */
  readonly notificationTargets: readonly string[];
}

/** The clock, injected so the timestamp is testable. */
export interface ReportWithdrawalClock {
  now(): Date;
}

/** The email template the Found-side withdrawal uses. */
export interface ClaimRejectionEmailBuilder {
  /**
   * Build the FR-29 claim-rejection email.
   *
   * @param recipientEmail the claimant's address
   * @param claimId the rejected claim, for the email's reference
   * @param reason the rejection reason — "report withdrawn by reporter"
   */
  build(recipientEmail: string, claimId: string, reason: string): {
    readonly to: string;
    readonly subject: string;
    readonly textBody: string;
    readonly htmlBody: string;
  };
}

/**
 * Withdraws a report.
 *
 * @throws {NotFoundError} when no report carries that id.
 * @throws {PermissionDeniedError} when the actor is not the reporter.
 * @throws {TerminalStateError} when the report is `Returned` or `Closed`.
 * @throws {ConflictError} when the report's own status or its dependent
 * records block the withdrawal — a `Claim Approved` Found report, or a Lost
 * report whose Match Confirmed has been recorded.
 */
export class ReportWithdrawalService {
  constructor(
    private readonly reports: ReportRepository,
    private readonly interactions: ReportInteractionReader,
    private readonly resolver: ReportInteractionResolver,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: ReportWithdrawalClock,
    private readonly emails: EmailSender,
    private readonly emailBuilder: ClaimRejectionEmailBuilder,
  ) {}

  async withdraw(request: WithdrawReportRequest): Promise<WithdrawReportResult> {
    const report = await this.reports.findById(request.reportId);

    if (!report) {
      throw new NotFoundError('No report with that id.');
    }

    // ── Ownership ───────────────────────────────────────────────────────────
    //
    // **The reporter is derived from the session, never from the request.**
    if (report.reporterId !== request.actor.actorId) {
      throw new PermissionDeniedError('You do not have access to this.');
    }

    // ── The gate ────────────────────────────────────────────────────────────
    //
    // **The decision consults the dependent records' state, not only the
    // report's own status.** The Found-side block turns on an *approved*
    // Claim and the Lost-side block turns on a *Match Confirmed* Recovery
    // Response — and `Match Confirmed` is a Recovery Response status, **not**
    // a Lost-report lifecycle status, so the report's own status cannot
    // express it.
    const facts = await this.interactions.read(request.reportId);

    const decision = decideWithdrawal(report.status, report.type, facts);

    if (decision.kind === 'Blocked') {
      // **The message is the domain's.** `withdrawalBlockMessage` distinguishes
      // the three reasons because the member's remedy differs.
      throw new WithdrawalRefusedError(withdrawalBlockMessage(decision.reason));
    }

    // ── The event, before the write ────────────────────────────────────────
    //
    // **The event's type depends on the report's type** — event 9 for a
    // Found report, event 23 for a Lost report. They are separate numbers
    // for separate sides of the product, and the payload field is different
    // too: `previousFoundStatus` against `previousLostStatus`.
    const event = buildReportWithdrawnEvent({
      reportId: report.id,
      reporterId: request.actor.actorId,
      type: report.type,
      previousStatus: report.status,
    });

    // ── The write, in one transaction ──────────────────────────────────────
    //
    // **The dependent resolutions are in the same transaction as the status
    // change.** A report that is `Closed` while its Claims are still `Pending`
    // would leave a claimant waiting on a claim that will never be decided.
    const written = await this.transactions.run((transaction) =>
      this.withdrawAndResolve(report, event, transaction),
    );

    // ── The emails, after the commit ───────────────────────────────────────
    //
    // **The Found side sends the FR-29 rejection email to each affected
    // claimant; the Lost side sends nothing** (FR-30: no closure email to
    // responders).
    await this.notify(written);

    return {
      report,
      status: 'Closed',
      event,
      rejectedClaims: written.rejectedClaims,
      resolvedRecoveryResponses: written.resolvedRecoveryResponses,
      notificationTargets: written.notificationTargets,
    };
  }

  /**
   * Resolve the dependent records, close the report, and write the audit
   * event — in the caller's transaction.
   */
  private async withdrawAndResolve(
    report: PersistedReport,
    event: ReportWithdrawn,
    transaction: Parameters<Parameters<TransactionFactory['run']>[0]>[0],
  ): Promise<{
    readonly rejectedClaims: readonly RejectedClaim[];
    readonly resolvedRecoveryResponses: readonly ResolvedRecoveryResponse[];
    readonly notificationTargets: readonly string[];
  }> {
    // ── The dependent records ──────────────────────────────────────────────
    //
    // The Found side rejects its Pending Claims; the Lost side resolves its
    // non-terminal Recovery Responses. **Only one of these runs**, because a
    // report is Found or Lost for its whole life.
    const rejectedClaims =
      report.type === 'Found'
        ? await this.resolver.rejectPendingClaims(
            report.id,
            WITHDRAWAL_CLAIM_REJECTION_REASON,
            transaction,
          )
        : [];

    const resolvedRecoveryResponses =
      report.type === 'Lost'
        ? await this.resolver.resolveWithdrawalResolvedRecoveryResponses(report.id, transaction)
        : [];

    // ── The report's own status ────────────────────────────────────────────
    //
    // **The update carries the status and nothing else.** The report's
    // content is untouched by a withdrawal — a withdrawal is not an edit.
    await this.reports.update(report.id, { status: 'Closed' }, transaction);

    // ── The audit event ────────────────────────────────────────────────────
    //
    // **The payload's top-level key is the catalog's field name**, and the
    // two sides name different fields: event 9 names `previousFoundStatus`
    // and event 23 names `previousLostStatus`. The sanitizer denies by
    // default, so the payload must carry exactly the field its event names.
    await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'report', parentId: report.id },
        actor: { actorId: event.reporterId, actorRole: 'member' },
        payload:
          'previousFoundStatus' in event.payload
            ? { previousFoundStatus: event.payload.previousFoundStatus }
            : { previousLostStatus: event.payload.previousLostStatus },
        occurredAt: this.clock.now(),
      },
      transaction,
    );

    // ── The notification targets ───────────────────────────────────────────
    //
    // **The addresses come from the Claims the withdrawal actually
    // rejected.** The resolver's returned set is the set it rejected, so a
    // Claim created concurrently and rejected by the same update is notified
    // — and a Claim rejected by an earlier withdrawal is not notified twice.
    const notificationTargets = rejectedClaims.map((claim) => claim.claimantEmail);

    return { rejectedClaims, resolvedRecoveryResponses, notificationTargets };
  }

  /**
   * Send the FR-29 claim-rejection emails.
   *
   * **A send failure never fails the withdrawal.** The report is already
   * `Closed` and its Claims are already `Rejected`; the email is a
   * notification of a fact that is now true. PRD §10 requires the failure to
   * be recorded, and the transport's own logging is that record.
   *
   * **The Claim id travels with the address,** so the email can name the
   * claim it concerns and a failed send is attributable to one claim rather
   * than to the withdrawal as a whole.
   */
  private async notify(written: {
    readonly rejectedClaims: readonly RejectedClaim[];
  }): Promise<void> {
    for (const claim of written.rejectedClaims) {
      try {
        await this.emails.send(
          this.emailBuilder.build(
            claim.claimantEmail,
            claim.claimId,
            WITHDRAWAL_CLAIM_REJECTION_REASON,
          ),
        );
      } catch {
        // Recorded by the transport. The withdrawal stands — the member's
        // report is closed and the claimant's claim is rejected, and neither
        // of those facts depends on the notification arriving.
      }
    }
  }
}

/**
 * The withdrawal was refused.
 *
 * **A named kind of `ConflictError`,** because the reasons differ in kind: a
 * `Returned` report is already closed and nothing can change it, while a
 * `Claim Approved` Found report is blocked by a *dependent record's* state
 * and the administrator must handle it. The message the member sees comes
 * from the domain, either way.
 *
 * **It is a `ConflictError` and not a bare `Error`,** because the transport
 * maps a conflict to a **409** — the status FR-11's refusals answer with.
 * An error that is not one of the mapped kinds falls through to the
 * transport's generic handler and becomes a **500**, which tells the member
 * the request failed for an unknown reason rather than that their report
 * cannot be withdrawn *yet*. The name is the distinguishing part; the
 * status is inherited.
 */
export class WithdrawalRefusedError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The facts the gate decided on, re-exported for the route's tests. */
export type { InteractionFacts };
