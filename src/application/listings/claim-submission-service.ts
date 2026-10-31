/**
 * The `ClaimSubmissionService` — FR-15's submit-a-Claim.
 *
 * **The sequence is the mechanism.** The order is:
 *
 * ```text
 * 1.  read the report                         → the facts the gate needs
 * 2.  decide the gate                          → permitted | blocked
 * 3.  validate the three fields                → ValidatedClaim
 * 4.  BEGIN
 * 5.    INSERT claims
 * 6.    UPDATE reports → status 'Claim Requested'
 * 7.    INSERT audit_events (event 2)
 * 8.  COMMIT
 * 9.  send the FR-28 email (after the commit)
 * ```
 *
 * **Why the gate runs before the validation.** The gate's refusals are
 * *permission* facts — this account is not active, this is your own report,
 * this report is closed — and a member who has claimed their own report
 * should be told that, not that their reason is too short. Validating
 * first would tell a member whose Claim could never be accepted that they
 * mistyped a field.
 *
 * **Why the validation runs before anything is written.** The story is
 * explicit: "All three fields are validated before any row is written; a
 * refused submission writes nothing to the Claim, the report, or the audit
 * trail". The validation is a pure domain call, and it throws before the
 * transaction opens — so there is no transaction to roll back.
 *
 * **Why the report's status change is in the same transaction as the
 * Claim.** FR-22's auto-transition says a Claim submitted on an `Open`
 * report moves it to `Claim Requested` — and a report that is `Open` while
 * a `Pending` Claim sits on it would show the finder no claim against their
 * item. The two must agree, and only one transaction makes them agree.
 *
 * **Why the audit event is inside the transaction.** An audit entry for a
 * transition that did not happen is a defect (ADR-3). The trail is
 * append-only with no correction path, so the error would be permanent.
 *
 * **Why the email is after the commit.** ADR-3's decision 4: the email is
 * sent after the triggering transaction has committed, so there is no
 * transaction to join and a send failure never rolls back the Claim. The
 * Claim is already `Pending`; the email only tells the finder about a fact
 * that is now true.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { EmailSender } from '@/application/ports/email-sender';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  buildClaimSubmittedEvent,
  claimSubmissionBlockMessage,
  decideClaimSubmission,
  validateClaimDraft,
  withClaimant,
  type ClaimDraft,
  type ClaimSubmissionBlockReason,
  type ClaimSubmitted,
  type PersistedClaim,
  type ReportStatus,
  type ValidatedClaim,
} from '@/domain/listings';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type { ClaimRepository } from './ports/claim-repository';
import type { PendingClaimReader } from './ports/pending-claim-reader';
import type { NewClaimEmailBuilder } from './new-claim-email';
import type { ReportRepository } from './ports/report-repository';

/** The actor the Claim is attributed to. */
export interface ClaimSubmissionActor {
  readonly actorId: string;
  /**
   * Whether the actor's account is `Active`.
   *
   * **The account's capability is resolved once, at the `ActorContext`
   * boundary,** and this flag is that resolution — the service does not
   * re-read the account and does not write its own
   * `if (status !== 'Active')` guard.
   */
  readonly isAccountActive: boolean;
}

/** What the caller supplies. */
export interface SubmitClaimRequest {
  readonly draft: ClaimDraft;
  readonly actor: ClaimSubmissionActor;
}

/** What the service returns. */
export interface SubmitClaimResult {
  /** The persisted Claim. */
  readonly claim: PersistedClaim;
  /** The status the report reached. `Claim Requested` when it was `Open`. */
  readonly reportStatus: ReportStatus;
  /** The event the audit trail recorded. */
  readonly event: ClaimSubmitted;
}

/** The clock, injected so the date bound is testable. */
export interface ClaimSubmissionClock {
  /** The current instant. */
  now(): Date;
}

/**
 * The finder the notification targets.
 *
 * **The address and the item's name travel with the fact.** The email must
 * reach the report's owner, and the owner is not the actor — so the report
 * read is what supplies the recipient.
 */
export interface ClaimNotificationTarget {
  readonly reporterEmail: string;
  readonly reporterId: string;
  readonly itemName: string;
}

/**
 * Reads the facts the submission gate needs.
 *
 * **A separate port, because the report repository reads a `Report` and the
 * gate needs the report's *owner* and *email*.** The owner is on the
 * report; the email is on the account. Neither is on the `Report` shape,
 * and putting an email on the report would leak it into every report read.
 */
export interface ClaimSubjectReader {
  /**
   * Read the report the Claim is made against, with the facts the gate and
   * the notification need.
   *
   * @returns the subject, or `null` when no report carries that id.
   */
  readSubject(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<ClaimSubject | null>;
}

/** The report a Claim is made against, with the facts the gate needs. */
export interface ClaimSubject {
  readonly id: string;
  readonly type: 'Lost' | 'Found';
  readonly status: ReportStatus;
  /** The report's owner — the finder. */
  readonly reporterId: string;
  /** The report's owner's email address. */
  readonly reporterEmail: string;
  /** The report's name, for the notification. */
  readonly name: string;
}

/**
 * Submits a Claim against a Found report.
 *
 * @throws {PermissionDeniedError} when the actor's account is not `Active`,
 * when the actor is claiming their own report, when the report does not
 * exist, when the report is not a Found report, or when the report has
 * already been decided. Nothing is written.
 * @throws {ConflictError} when the actor already has a `Pending` Claim on
 * the report. Nothing is written.
 * @throws {ValidationError} naming the offending field, when one of the
 * three fields breaks its bound. Nothing is written.
 */
export class ClaimSubmissionService {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly reports: ReportRepository,
    private readonly subjects: ClaimSubjectReader,
    private readonly pendingClaims: PendingClaimReader,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: ClaimSubmissionClock,
    private readonly emails: EmailSender,
    private readonly emailBuilder: NewClaimEmailBuilder,
    /**
     * The base URL the notification's link points at.
     *
     * **Injected, never read from the ambient environment in the service.**
     * The link is a deployment's configuration, and a test must be able to
     * assert on it.
     */
    private readonly baseUrl: string,
  ) {}

  async submit(request: SubmitClaimRequest): Promise<SubmitClaimResult> {
    // ── 1. Read the report ────────────────────────────────────────────────
    //
    // **The read happens before the gate**, because the gate needs the
    // report's type, status, and owner. A missing report is a distinct
    // refusal from a report of the wrong type.
    const subject = await this.subjects.readSubject(request.draft.reportId);

    if (!subject) {
      throw new PermissionDeniedError(claimSubmissionBlockMessage('NotFoundReport'));
    }

    // ── 2. The duplicate check, before the gate ────────────────────────────
    //
    // **The pending-Claim fact is read here rather than inside the gate**,
    // because it is a read of another table and the gate is a pure
    // function. The gate receives the fact; it does not obtain it.
    const hasPendingClaim = await this.pendingClaims.hasPendingClaim(
      subject.id,
      request.actor.actorId,
    );

    // ── 3. The gate ────────────────────────────────────────────────────────
    //
    // **The domain decides.** The service supplies the facts and acts on the
    // verdict; it does not write its own rule.
    const decision = decideClaimSubmission({
      claimantId: request.actor.actorId,
      isAccountActive: request.actor.isAccountActive,
      facts: {
        reportType: subject.type,
        reportStatus: subject.status,
        reportOwnerId: subject.reporterId,
        hasPendingClaim,
      },
    });

    if (decision.kind === 'Blocked') {
      throw this.refusal(decision.reason);
    }

    // ── 4. Validate the three fields, before anything is written ──────────
    //
    // **A refused submission writes nothing** — to the Claim, the report, or
    // the audit trail. The validation is a pure domain call and it throws
    // before the transaction opens, so there is nothing to roll back.
    const now = this.clock.now();

    const validated = withClaimant(
      validateClaimDraft(request.draft, { now }),
      request.actor.actorId,
    );

    // ── 5. Write the Claim, the report's status, and the audit event ─────
    //
    // **All three in one transaction.** A report that is `Open` while a
    // `Pending` Claim sits on it would show the finder no claim against
    // their item.
    const written = await this.transactions.run((transaction) =>
      this.writeClaimAndReportAndAudit(validated, subject, transaction),
    );

    // ── 6. The email, after the commit ────────────────────────────────────
    //
    // **The finder is told that a claim exists — and nothing more.** The
    // builder has no way to receive the reason or the identifying details,
    // so the message cannot carry them (FR-39, UJ-2).
    await this.notify(written.claim, subject);

    return {
      claim: written.claim,
      reportStatus: written.reportStatus,
      event: written.event,
    };
  }

  /**
   * Write the Claim, move the report, and record the audit event — in the
   * caller's transaction.
   */
  private async writeClaimAndReportAndAudit(
    validated: ValidatedClaim,
    subject: ClaimSubject,
    transaction: Parameters<Parameters<TransactionFactory['run']>[0]>[0],
  ): Promise<{
    readonly claim: PersistedClaim;
    readonly reportStatus: ReportStatus;
    readonly event: ClaimSubmitted;
  }> {
    // ── The Claim ─────────────────────────────────────────────────────────
    const created = await this.claims.create(validated, transaction);

    // ── The report's status ───────────────────────────────────────────────
    //
    // **Only an `Open` report moves.** A report already at `Claim Requested`
    // stays there — a second member's Claim is legitimate, and the status
    // it already carries is the right one. Moving it again would write a
    // transition that did not happen.
    const nextStatus: ReportStatus =
      subject.status === 'Open' ? 'Claim Requested' : subject.status;

    if (nextStatus !== subject.status) {
      await this.reports.update(subject.id, { status: nextStatus }, transaction);
    }

    // ── The audit event ───────────────────────────────────────────────────
    //
    // **The payload carries exactly the three fields the catalog names** for
    // event 2 — `reason`, `identifyingDetails`, `dateLost`. The sanitizer
    // denies by default, so naming those three permits those three.
    //
    // **The event is built from the *validated* Claim, not the persisted
    // one.** The event describes what was *submitted*, and the validated
    // Claim is exactly that — the persisted one carries the id as well, and
    // a lifecycle-written Claim may carry no reason at all.
    const event = buildClaimSubmittedEvent({ ...validated, id: created.id });

    await this.audit.record(
      {
        eventType: 'claim.submitted',
        parent: { parentType: 'report', parentId: subject.id },
        actor: { actorId: created.claimantId, actorRole: 'member' },
        payload: {
          reason: event.payload.reason,
          identifyingDetails: event.payload.identifyingDetails,
          dateLost: event.payload.dateLost,
        },
        occurredAt: created.createdAt,
      },
      transaction,
    );

    return { claim: created, reportStatus: nextStatus, event };
  }

  /**
   * Send the FR-28 new-claim email to the finder.
   *
   * **A send failure never fails the submission.** The Claim is already
   * `Pending` and the report is already `Claim Requested`; the email is a
   * notification of a fact that is now true. The transport's own logging is
   * the record.
   */
  private async notify(claim: PersistedClaim, subject: ClaimSubject): Promise<void> {
    try {
      await this.emails.send(
        this.emailBuilder.build({
          recipientEmail: subject.reporterEmail,
          itemName: subject.name,
          claimPath: `${this.baseUrl}/claims/${claim.id}`,
        }),
      );
    } catch {
      // Recorded by the transport. The Claim stands — the member's claim is
      // pending, and neither of those facts depends on the notification
      // arriving.
    }
  }

  /**
   * Map a blocked decision to the error the transport maps.
   *
   * **The duplicate is a conflict; the rest are permission failures.** The
   * member who already has a pending claim must wait — that is a conflict
   * with an existing state. The member claiming their own report has no
   * right to make the claim at all.
   */
  private refusal(reason: ClaimSubmissionBlockReason): Error {
    const message = claimSubmissionBlockMessage(reason);

    if (reason === 'AlreadyPendingClaim') {
      return new ClaimSubmissionRefusedError(message);
    }

    return new PermissionDeniedError(message);
  }
}

/**
 * The submission was refused.
 *
 * **A named kind of `ConflictError`,** because the reasons differ in kind: a
 * duplicate pending Claim is a conflict with an existing state, while
 * claiming one's own report is a permission failure. The transport maps a
 * conflict to a **409** and a permission failure to a **403**, and the two
 * refusals call for different member remedies.
 */
export class ClaimSubmissionRefusedError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
