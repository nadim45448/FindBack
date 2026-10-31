/**
 * The `ClaimDecisionService` — FR-17's approval, FR-18's rejection, and
 * FR-22's Found-side auto-transitions.
 *
 * **The approval's atomicity is the whole design.** The story: "the claim
 * approval and every auto-rejection and the report status change were
 * written in a single transaction", and "two administrators approving two
 * different claims on the same item at the same time ... only the first
 * decision commits and the second receives a conflict response with no
 * partial write".
 *
 * That second requirement is not satisfiable by a transaction alone — a
 * transaction makes the *writes* atomic, but it does not stop two
 * transactions from each deciding a different Claim and both committing. So
 * the approval takes a **row lock on the Found report** before it decides
 * anything:
 *
 * ```text
 * 1.  read the Claim's state            → the gate's facts
 * 2.  decide the gate                    → permitted | blocked
 * 3.  BEGIN
 * 4.    SELECT … FOR UPDATE the report   → serialise on the shared resource
 * 5.    re-read the Claim's state        → is it still Pending?
 * 6.    approve the Claim                → conditional write
 * 7.    UPDATE reports → 'Claim Approved'
 * 8.    INSERT audit_events (event 3, then one event 5 per competitor)
 * 9.  COMMIT
 * 10. send the decision emails (after the commit)
 * ```
 *
 * **The lock is on the report, not on the Claim.** The shared resource is
 * the *item*: two administrators deciding two *different* Claims on the
 * same item is the race the story describes, and locking each Claim
 * separately would not prevent it. Two administrators deciding the *same*
 * Claim is prevented by the conditional write, which only lands on a
 * `Pending` Claim.
 *
 * **The re-read at step 5 is not redundant.** Step 1's read happened before
 * the transaction opened, so it is advisory — it lets the service refuse a
 * decision on an already-decided Claim without opening a transaction at
 * all. Between step 1 and step 5 another administrator may have decided
 * the Claim, and step 5 is what catches it. The conditional write at step 6
 * is the *last* line of defence: it lands only on a `Pending` Claim, so
 * even a claim decided between step 5 and step 6 cannot be overwritten.
 *
 * **The audit events are inside the transaction.** Event 3 is the approval;
 * event 5 is written **once per auto-rejected competitor**, each a
 * distinct separate event rather than a combined entry. An audit entry for
 * a transition that did not happen is a defect (ADR-3), and the trail is
 * append-only with no correction path.
 *
 * **The emails are after the commit.** ADR-3's decision 4: the email is
 * sent after the triggering transaction has committed, so a send failure
 * never rolls back or blocks the decision. The Claim is already decided;
 * the email only tells the claimant about a fact that is now true.
 *
 * **No decision email ever reaches the finder.** The service addresses
 * claimants only — the approved claimant and each auto-rejected claimant —
 * and the report's owner is never a recipient. Story 003 is explicit.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { EmailSender } from '@/application/ports/email-sender';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  buildClaimApprovedEvent,
  buildClaimAutoRejectedEvent,
  buildClaimRejectedByAdministratorEvent,
  claimDecisionBlockMessage,
  createClaimRejectionReason,
  decideClaimDecision,
  decideFoundReportTransition,
  rejectionCauseFor,
  APPROVAL_AUTO_REJECTION_TRIGGER,
  type ClaimAutoRejected,
  type ClaimApproved,
  type ClaimDecisionBlockReason,
  type ClaimRejectedByAdministrator,
  type ReportStatus,
} from '@/domain/listings';

import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

import type {
  ClaimDecisionReader,
  ClaimDecisionState,
  CompetingPendingClaim,
} from './ports/claim-decision-reader';
import type { ClaimDecisionRepository } from './ports/claim-decision-repository';
import type { ReportRepository } from './ports/report-repository';
import type { ClaimDecisionEmailBuilder } from './claim-decision-email';

/** The administrator who is deciding. */
export interface ClaimDecisionActor {
  readonly actorId: string;
}

/** What the caller supplies to approve a Claim. */
export interface ApproveClaimRequest {
  readonly claimId: string;
  readonly actor: ClaimDecisionActor;
}

/** What the caller supplies to reject a Claim. */
export interface RejectClaimRequest {
  readonly claimId: string;
  readonly actor: ClaimDecisionActor;
  /** The administrator's reason. 10–500 characters. */
  readonly reason: string;
}

/** What an approval produced. */
export interface ApproveClaimResult {
  readonly claimId: string;
  /** The status the report reached. */
  readonly reportStatus: ReportStatus;
  /** The approval's audit event. */
  readonly event: ClaimApproved;
  /** The competing Claims the approval auto-rejected. */
  readonly autoRejected: readonly AutoRejectedClaim[];
}

/** What a rejection produced. */
export interface RejectClaimResult {
  readonly claimId: string;
  /** The status the report reached. */
  readonly reportStatus: ReportStatus;
  /** The rejection's audit event. */
  readonly event: ClaimRejectedByAdministrator;
}

/** A Claim the approval auto-rejected. */
export interface AutoRejectedClaim {
  readonly claimId: string;
  readonly claimantEmail: string;
  /** The audit event written for this auto-rejection. */
  readonly event: ClaimAutoRejected;
}

/** The clock, injected so the decision's timestamp is testable. */
export interface ClaimDecisionClock {
  now(): Date;
}

/**
 * Decides Claims.
 */
export class ClaimDecisionService {
  constructor(
    private readonly reader: ClaimDecisionReader,
    private readonly decisions: ClaimDecisionRepository,
    private readonly reports: ReportRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: ClaimDecisionClock,
    private readonly emails: EmailSender,
    private readonly emailBuilder: ClaimDecisionEmailBuilder,
  ) {}

  // ── Approval ───────────────────────────────────────────────────────────

  /**
   * Approve a `Pending` Claim.
   *
   * **The approval is atomic with the auto-rejections and the report's
   * move.** All three commit together or none of them do.
   *
   * @throws {NotFoundError} when no Claim carries that id.
   * @throws {ClaimDecisionConflictError} when the Claim is no longer
   * `Pending`, or when another administrator's decision committed first.
   * Nothing is written.
   * @throws {ValidationError} when the report's status does not permit the
   * approval. Nothing is written.
   */
  async approve(request: ApproveClaimRequest): Promise<ApproveClaimResult> {
    // ── The gate, before the transaction ──────────────────────────────────
    //
    // **The advisory read.** It lets the service refuse a decision on an
    // already-decided Claim without opening a transaction — and the refusal
    // is the same one the write would produce.
    const state = await this.reader.readDecisionState(request.claimId);

    if (!state) {
      throw new NotFoundError(claimDecisionBlockMessage('ClaimNotFound'));
    }

    const decision = decideClaimDecision({ claimStatus: state.status });

    if (decision.kind === 'Blocked') {
      throw this.refusal(decision.reason);
    }

    // ── The write, in one transaction ─────────────────────────────────────
    //
    // **The lock, the re-read, the approve, the move, and the events are
    // one act.** A claim that is `Approved` while a competitor is still
    // `Pending`, or a report that is `Claim Requested` while an approved
    // claim sits on it, would be a contradiction the finder could see.
    const written = await this.transactions.run((transaction) =>
      this.approveWithinTransaction(state, request.actor.actorId, transaction),
    );

    // ── The emails, after the commit ──────────────────────────────────────
    //
    // **The approved claimant and each auto-rejected claimant are the only
    // recipients.** The finder is never one of them.
    await this.notifyApproval(written);

    return {
      claimId: written.claimId,
      reportStatus: written.reportStatus,
      event: written.event,
      autoRejected: written.autoRejected,
    };
  }

  /**
   * The approval's write, inside the caller's transaction.
   */
  private async approveWithinTransaction(
    state: ClaimDecisionState,
    administratorId: string,
    transaction: TransactionHandle,
  ): Promise<{
    readonly claimId: string;
    readonly reportStatus: ReportStatus;
    readonly event: ClaimApproved;
    readonly autoRejected: readonly AutoRejectedClaim[];
    readonly approvedClaimantEmail: string;
  }> {
    // ── 4. The report's row lock ──────────────────────────────────────────
    //
    // **This is the serialisation point.** Two administrators approving two
    // different Claims on the same item are serialised here: the second
    // waits for the first to commit, and then reads the report's status
    // *after* the first's move.
    const reportStatus = await this.reader.lockReportStatus(state.reportId, transaction);

    if (reportStatus === null) {
      throw new NotFoundError('No report with that id.');
    }

    // ── 5. The re-read ────────────────────────────────────────────────────
    //
    // **The Claim's state is re-read inside the transaction, after the
    // lock.** The advisory read at the top of `approve` happened before
    // the transaction opened, so it cannot be the guarantee.
    const current = await this.reader.readDecisionState(state.id, transaction);

    if (!current) {
      throw new NotFoundError(claimDecisionBlockMessage('ClaimNotFound'));
    }

    const reDecision = decideClaimDecision({ claimStatus: current.status });

    if (reDecision.kind === 'Blocked') {
      throw this.refusal(reDecision.reason);
    }

    // ── 6. The approval ───────────────────────────────────────────────────
    //
    // **The write is conditional on the Claim still being `Pending`.** If
    // it does not land, another administrator decided the Claim between the
    // re-read and the write — and the decision is refused rather than
    // applied on top of theirs.
    const decidedAt = this.clock.now();
    const landed = await this.decisions.approve(current.id, administratorId, decidedAt, transaction);

    if (!landed) {
      throw new ClaimDecisionConflictError(
        claimDecisionBlockMessage('ClaimNotPending'),
      );
    }

    // ── 7. The report's move ──────────────────────────────────────────────
    //
    // **The transition is the domain's.** The cause is `ClaimApproved`,
    // and the machine decides whether the move applies.
    const transition = decideFoundReportTransition({
      currentStatus: reportStatus,
      cause: 'ClaimApproved',
    });

    if (transition.kind === 'Refused') {
      throw new ClaimDecisionConflictError(
        'This item is no longer in a state that can accept a claim decision.',
      );
    }

    let nextStatus: ReportStatus = reportStatus;

    if (transition.kind === 'Moved') {
      await this.reports.update(current.reportId, { status: transition.to }, transaction);
      nextStatus = transition.to;
    }

    // ── 8. The competitors, and their events ──────────────────────────────
    //
    // **The competing Claims are read inside the transaction, after the
    // lock.** A read outside it would be a read-then-write race — the exact
    // race the story forbids.
    const competitors = await this.reader.listCompetingPendingClaims(
      current.reportId,
      current.id,
      transaction,
    );

    const autoRejected: AutoRejectedClaim[] = [];

    for (const competitor of competitors) {
      const event = buildClaimAutoRejectedEvent({
        claimId: competitor.claimId,
        reportId: current.reportId,
        trigger: APPROVAL_AUTO_REJECTION_TRIGGER,
        triggeredBy: administratorId,
      });

      await this.autoRejectCompetitor(competitor, event, administratorId, decidedAt, transaction);

      autoRejected.push({
        claimId: competitor.claimId,
        claimantEmail: competitor.claimantEmail,
        event,
      });
    }

    // ── The approval's own event ──────────────────────────────────────────
    //
    // **Event 3 names no additional fields,** so the payload is empty. The
    // sanitizer denies by default, and an empty payload is what the catalog
    // permits.
    const event = buildClaimApprovedEvent({
      claimId: current.id,
      reportId: current.reportId,
      administratorId,
    });

    await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'claim', parentId: event.claimId },
        actor: { actorId: event.administratorId, actorRole: 'administrator' },
        payload: {},
        occurredAt: decidedAt,
      },
      transaction,
    );

    return {
      claimId: current.id,
      reportStatus: nextStatus,
      event,
      autoRejected,
      approvedClaimantEmail: current.claimantEmail,
    };
  }

  /**
   * Auto-reject one competing Claim, and write its event.
   *
   * **Each auto-rejection is a separate event.** Story 006: "each
   * auto-rejection is a distinct separate event rather than a single
   * combined entry". A combined entry would say that *something* happened
   * to *some* claims, and an administrator auditing one specific rejected
   * Claim would find nothing.
   */
  private async autoRejectCompetitor(
    competitor: CompetingPendingClaim,
    event: ClaimAutoRejected,
    administratorId: string,
    decidedAt: Date,
    transaction: TransactionHandle,
  ): Promise<void> {
    // **The write is conditional on the Claim still being `Pending`.** A
    // competitor that was decided between the read and the write is left
    // alone — and its own decision's event stands.
    const landed = await this.decisions.autoReject(
      competitor.claimId,
      event.payload.autoRejectionReason,
      decidedAt,
      transaction,
    );

    if (!landed) {
      return;
    }

    await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'claim', parentId: competitor.claimId },
        // **The actor is the system; `triggeredBy` names the human.** The
        // catalog's field is what makes the decision traceable to a person.
        actor: { actorId: 'system', actorRole: 'system', actingAdministratorId: administratorId },
        payload: {
          triggeredBy: event.payload.triggeredBy,
          triggeringAction: event.payload.triggeringAction,
          foundReportId: event.payload.foundReportId,
          autoRejectionReason: event.payload.autoRejectionReason,
        },
        occurredAt: decidedAt,
      },
      transaction,
    );
  }

  // ── Rejection ──────────────────────────────────────────────────────────

  /**
   * Reject a `Pending` Claim with a reason.
   *
   * **The report returns to `Open` only when no `Pending` Claim remains.**
   * The count is read inside the transaction, after the lock, so the answer
   * is the count as of the decision — not as of some earlier read.
   *
   * @throws {NotFoundError} when no Claim carries that id.
   * @throws {ValidationError} when the reason breaks its bound, or when the
   * report's status does not permit the rejection. Nothing is written.
   * @throws {ClaimDecisionConflictError} when the Claim is no longer
   * `Pending`. Nothing is written.
   */
  async reject(request: RejectClaimRequest): Promise<RejectClaimResult> {
    // ── The reason, before the transaction ────────────────────────────────
    //
    // **The reason is validated first.** A rejection with no usable reason
    // is refused before anything is written, and the Claim stays `Pending`
    // — exactly as the story requires.
    const reason = createClaimRejectionReason(request.reason);

    // ── The gate ──────────────────────────────────────────────────────────
    const state = await this.reader.readDecisionState(request.claimId);

    if (!state) {
      throw new NotFoundError(claimDecisionBlockMessage('ClaimNotFound'));
    }

    const decision = decideClaimDecision({ claimStatus: state.status });

    if (decision.kind === 'Blocked') {
      throw this.refusal(decision.reason);
    }

    // ── The write, in one transaction ─────────────────────────────────────
    const written = await this.transactions.run((transaction) =>
      this.rejectWithinTransaction(state, request.actor.actorId, reason, transaction),
    );

    // ── The email, after the commit ───────────────────────────────────────
    await this.notifyRejection(written.claimId, state.claimantEmail, reason.value);

    return {
      claimId: written.claimId,
      reportStatus: written.reportStatus,
      event: written.event,
    };
  }

  /**
   * The rejection's write, inside the caller's transaction.
   */
  private async rejectWithinTransaction(
    state: ClaimDecisionState,
    administratorId: string,
    reason: { readonly value: string },
    transaction: TransactionHandle,
  ): Promise<{
    readonly claimId: string;
    readonly reportStatus: ReportStatus;
    readonly event: ClaimRejectedByAdministrator;
  }> {
    // ── The lock and the re-read ─────────────────────────────────────────
    //
    // **The same serialisation as the approval.** A rejection and an
    // approval on the same item must not interleave.
    const reportStatus = await this.reader.lockReportStatus(state.reportId, transaction);

    if (reportStatus === null) {
      throw new NotFoundError('No report with that id.');
    }

    const current = await this.reader.readDecisionState(state.id, transaction);

    if (!current) {
      throw new NotFoundError(claimDecisionBlockMessage('ClaimNotFound'));
    }

    const reDecision = decideClaimDecision({ claimStatus: current.status });

    if (reDecision.kind === 'Blocked') {
      throw this.refusal(reDecision.reason);
    }

    // ── The rejection ────────────────────────────────────────────────────
    const decidedAt = this.clock.now();
    const landed = await this.decisions.reject(
      current.id,
      administratorId,
      { value: reason.value },
      decidedAt,
      transaction,
    );

    if (!landed) {
      throw new ClaimDecisionConflictError(claimDecisionBlockMessage('ClaimNotPending'));
    }

    // ── The report's move ────────────────────────────────────────────────
    //
    // **The report returns to `Open` only when no `Pending` Claim
    // remains.** The count is read inside the transaction, after the
    // rejection — so it is the count as of the decision.
    const remaining = await this.reader.listCompetingPendingClaims(
      current.reportId,
      current.id,
      transaction,
    );

    const cause = rejectionCauseFor(remaining.length);
    let nextStatus: ReportStatus = reportStatus;

    if (cause !== 'NoChange') {
      const transition = decideFoundReportTransition({
        currentStatus: reportStatus,
        cause,
      });

      if (transition.kind === 'Refused') {
        throw new ClaimDecisionConflictError(
          'This item is no longer in a state that can accept a claim decision.',
        );
      }

      if (transition.kind === 'Moved') {
        await this.reports.update(current.reportId, { status: transition.to }, transaction);
        nextStatus = transition.to;
      }
    }

    // ── The event ─────────────────────────────────────────────────────────
    //
    // **Event 4 names exactly `reason`,** and the payload carries exactly
    // that one field. The sanitizer denies by default, so naming one field
    // permits one field.
    const event = buildClaimRejectedByAdministratorEvent({
      claimId: current.id,
      reportId: current.reportId,
      administratorId,
      reason: { value: reason.value },
    });

    await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'claim', parentId: event.claimId },
        actor: { actorId: event.administratorId, actorRole: 'administrator' },
        payload: { reason: event.payload.reason },
        occurredAt: decidedAt,
      },
      transaction,
    );

    return { claimId: current.id, reportStatus: nextStatus, event };
  }

  // ── The notifications ──────────────────────────────────────────────────

  /**
   * Send the approval's emails.
   *
   * **The approved claimant and each auto-rejected claimant — and nobody
   * else.** The finder is never a recipient: story 003 says "no claim
   * decision email of any kind is sent to the finder (reporter) of the
   * Found report", and the service has no address for the finder at all.
   *
   * **A send failure never fails the decision.** The Claim is already
   * `Approved`; the email is a notification of a fact that is now true.
   */
  private async notifyApproval(written: {
    readonly claimId: string;
    readonly autoRejected: readonly AutoRejectedClaim[];
    readonly approvedClaimantEmail: string;
  }): Promise<void> {
    try {
      await this.emails.send(
        this.emailBuilder.buildApproved(written.approvedClaimantEmail, written.claimId),
      );
    } catch {
      // Recorded by the transport. The approval stands.
    }

    for (const rejected of written.autoRejected) {
      try {
        await this.emails.send(
          this.emailBuilder.buildAutoRejected(
            rejected.claimantEmail,
            rejected.claimId,
            APPROVAL_AUTO_REJECTION_TRIGGER,
          ),
        );
      } catch {
        // Recorded by the transport. The auto-rejection stands.
      }
    }
  }

  /**
   * Send the rejection's email.
   *
   * **A send failure never fails the rejection.**
   */
  private async notifyRejection(
    claimId: string,
    claimantEmail: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.emails.send(
        this.emailBuilder.buildRejected(claimantEmail, claimId, reason),
      );
    } catch {
      // Recorded by the transport. The rejection stands.
    }
  }

  /**
   * Map a blocked decision to the error the transport maps.
   *
   * **A missing Claim is a 404; an already-decided Claim is a 409.** The
   * administrator who lost a race needs to know they were not wrong — they
   * were simply second.
   *
   * **`ClaimNotFound` is handled here as well as at the reader,** because
   * the gate names it and a reason the gate can produce must not be
   * silently turned into a conflict. The service's own "no such claim"
   * check catches the common case first, so this branch is the
   * belt-and-braces one.
   */
  private refusal(reason: ClaimDecisionBlockReason): Error {
    if (reason === 'ClaimNotFound') {
      return new NotFoundError(claimDecisionBlockMessage(reason));
    }

    return new ClaimDecisionConflictError(claimDecisionBlockMessage(reason));
  }
}

/**
 * The decision was refused because the Claim's state moved under it.
 *
 * **A named kind of `ConflictError`,** because the transport maps a
 * conflict to a **409** and a plain `Error` would fall through to a 500 —
 * which tells the administrator the request failed for an unknown reason
 * rather than that their decision lost a race.
 */
export class ClaimDecisionConflictError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The rejection reason's validation error, re-exported for the route's
 * tests.
 */
export { ValidationError };
