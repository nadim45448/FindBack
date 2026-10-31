/**
 * The `RecoveryResponseSubmissionService` — FR-40's submit-a-Recovery-
 * Response.
 *
 * **The sequence is the mechanism.** The order is:
 *
 * ```text
 * 1.  read the report                         → the facts the gate needs
 * 2.  read the report's responses             → the cutoff and duplicate facts
 * 3.  decide the gate                          → permitted | blocked
 * 4.  validate the FR-44 fields                → ValidatedRecoveryResponse
 * 5.  BEGIN
 * 6.    INSERT recovery_responses
 * 7.    INSERT audit_events (event 15)
 * 8.  COMMIT
 * 9.  send the FR-46 event-4 email (after the commit)
 * ```
 *
 * **Why the gate runs before the validation.** The gate's refusals are
 * *permission* facts — this account is not active, this is your own report,
 * this report is closed, the match is already confirmed — and a responder who
 * responded to their own report should be told that, not that their details
 * are too short. Validating first would tell a responder whose Response could
 * never be accepted that they mistyped a field.
 *
 * **Why the validation runs before anything is written.** The story is
 * explicit: a refused submission writes nothing to the Response or the audit
 * trail. The validation is a pure domain call, and it throws before the
 * transaction opens — so there is no transaction to roll back.
 *
 * **Why the audit event is inside the transaction.** An audit entry for a
 * transition that did not happen is a defect (ADR-3). The trail is append-only
 * with no correction path, so the error would be permanent.
 *
 * **Why the email is after the commit.** ADR-3's decision 4: the email is
 * sent after the triggering transaction has committed, so there is no
 * transaction to join and a send failure never rolls back the Response.
 *
 * **The candidate image is written before the row, and compensated after a
 * failure.** The image is part of the FR-44 field set, so it is part of the
 * Response — but the blob lives in another system, so the resolution is
 * *ordering, not nesting* (image-handling §5). The blob is stored first; the
 * row is written only if the blob was stored; and if the row write fails the
 * blob is deleted. The delete is issued **after** the transaction has rolled
 * back, because a delete inside a transaction that is about to roll back
 * would be undone by that rollback and orphan the blob anyway.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { EmailSender } from '@/application/ports/email-sender';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  decideRecoveryResponseSubmission,
  recoveryResponseSubmissionBlockMessage,
  validateRecoveryResponseDraft,
  withCandidateImage,
  withResponder,
  type RecoveryResponseDraft,
  type RecoveryResponseSubmissionBlockReason,
  type ValidatedRecoveryResponse,
} from '@/domain/recovery';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type { CampusAreaReader } from './ports/campus-area-reader';
import type { ImageStore, ImageUpload, StoredImage } from './ports/image-store';
import type { RecoveryResponseReader } from './ports/recovery-response-reader';
import type { RecoveryResponseRepository } from './ports/recovery-response-repository';
import type { NewRecoveryResponseEmailBuilder } from './new-recovery-response-email';
import type { LostSideEventFactory, ResponseSubmittedDraft } from '@/application/lost-side-event-factory';

/** The actor the Recovery Response is attributed to. */
export interface RecoveryResponseSubmissionActor {
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
export interface SubmitRecoveryResponseRequest {
  readonly draft: RecoveryResponseDraft;
  readonly actor: RecoveryResponseSubmissionActor;
  /**
   * The candidate image, when the responder submitted one.
   *
   * **Optional** — FR-44 makes the image optional. When present it is
   * stored **before** the row is written, and deleted if the row write
   * fails.
   */
  readonly image?: ImageUpload;
}

/** What the service returns. */
export interface SubmitRecoveryResponseResult {
  /** The persisted Recovery Response. */
  readonly responseId: string;
  /** The status the Response was created with. Always `Submitted`. */
  readonly status: string;
  /**
   * When the Response was submitted.
   *
   * **The persisted row's own timestamp,** not a second reading of the
   * clock — the transport must not carry a clock of its own, because two
   * readings of the same instant can disagree and the member would be shown
   * a time the row does not carry.
   */
  readonly submittedAt: Date;
  /** The event the audit trail recorded. */
  readonly eventId: string;
}

/** The clock, injected so the date bound is testable. */
export interface RecoveryResponseSubmissionClock {
  /** The current instant. */
  now(): Date;
}

/**
 * Reads the facts the submission gate needs about the report.
 *
 * **A separate port, because the report repository reads a `Report` and the
 * gate needs the report's *owner* and *email*.** The owner is on the
 * report; the email is on the account. Neither is on the `Report` shape, and
 * putting an email on the report would leak it into every report read.
 */
export interface RecoveryResponseSubjectReader {
  /**
   * Read the report the Response is made against, with the facts the gate and
   * the notification need.
   *
   * @returns the subject, or `null` when no report carries that id.
   */
  readSubject(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseSubject | null>;
}

/** The report a Recovery Response is made against. */
export interface RecoveryResponseSubject {
  readonly id: string;
  readonly type: 'Lost' | 'Found';
  readonly status: string;
  /** The report's owner — the member who lost the item. */
  readonly reporterId: string;
  /** The report's owner's email address. */
  readonly reporterEmail: string;
  /** The report's name, for the notification. */
  readonly name: string;
}

/**
 * The Lost-report owner the notification targets.
 *
 * **The address and the item's name travel with the fact.** The email must
 * reach the report's owner, and the owner is not the actor — so the report
 * read is what supplies the recipient.
 */
export type RecoveryResponseNotificationTarget = RecoveryResponseSubject;

/**
 * Submits a Recovery Response against a Lost report.
 *
 * @throws {PermissionDeniedError} when the actor's account is not `Active`,
 * when the actor is responding to their own report, when the report does not
 * exist, when the report is not a Lost report, when the report has been
 * returned or closed, or when the match has already been confirmed. Nothing
 * is written.
 * @throws {ConflictError} when the actor already holds a live Response on the
 * report. Nothing is written.
 * @throws {ValidationError} naming the offending field, when one of the
 * FR-44 fields breaks its bound. Nothing is written.
 */
export class RecoveryResponseSubmissionService {
  constructor(
    private readonly responses: RecoveryResponseRepository,
    private readonly responseReader: RecoveryResponseReader,
    private readonly subjects: RecoveryResponseSubjectReader,
    private readonly campusAreas: CampusAreaReader,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly clock: RecoveryResponseSubmissionClock,
    private readonly events: LostSideEventFactory,
    private readonly images: ImageStore,
    private readonly emails: EmailSender,
    private readonly emailBuilder: NewRecoveryResponseEmailBuilder,
    /**
     * The base URL the notification's link points at.
     *
     * **Injected, never read from the ambient environment in the service.**
     * The link is a deployment's configuration, and a test must be able to
     * assert on it.
     */
    private readonly baseUrl: string,
  ) {}

  async submit(
    request: SubmitRecoveryResponseRequest,
  ): Promise<SubmitRecoveryResponseResult> {
    // ── 1. Read the report ────────────────────────────────────────────────
    //
    // **The read happens before the gate**, because the gate needs the
    // report's type, status, and owner. A missing report is a distinct
    // refusal from a report of the wrong type.
    const subject = await this.subjects.readSubject(request.draft.reportId);

    if (!subject) {
      throw new PermissionDeniedError(
        recoveryResponseSubmissionBlockMessage('NotFoundReport'),
      );
    }

    // ── 2. The report's response facts ────────────────────────────────────
    //
    // **Two facts, two questions about the response table.** The cutoff
    // (`Match Confirmed`) and the duplicate (one live response per
    // responder). Neither is answered by the report, and neither is read
    // inside the gate — the gate is a pure function, and the application
    // layer is the only place that knows how to obtain a fact.
    const hasMatchConfirmed = await this.responseReader.hasMatchConfirmed(subject.id);
    const hasLiveResponse = await this.responseReader.hasLiveResponse(
      subject.id,
      request.actor.actorId,
    );

    // ── 3. The gate ────────────────────────────────────────────────────────
    //
    // **The domain decides.** The service supplies the facts and acts on the
    // verdict; it does not write its own rule.
    const decision = decideRecoveryResponseSubmission({
      responderId: request.actor.actorId,
      isAccountActive: request.actor.isAccountActive,
      facts: {
        reportType: subject.type,
        reportStatus: subject.status as RecoveryResponseSubmissionFactsStatus,
        reportOwnerId: subject.reporterId,
        hasMatchConfirmed,
        hasLiveResponse,
      },
    });

    if (decision.kind === 'Blocked') {
      throw this.refusal(decision.reason);
    }

    // ── 4. Validate the FR-44 fields, before anything is written ──────────
    //
    // **A refused submission writes nothing** — to the Response or the audit
    // trail. The validation is a pure domain call and it throws before the
    // transaction opens, so there is nothing to roll back.
    const now = this.clock.now();

    const validated = withResponder(
      validateRecoveryResponseDraft(request.draft, {
        now,
        campusAreas: await this.campusAreas.listActive(),
      }),
      request.actor.actorId,
    );

    // ── 5. The candidate image, before the row ────────────────────────────
    //
    // **The blob is stored first, and the row is written only if it was.**
    // The image is part of the FR-44 field set, so a Response with an image
    // that was never stored would point at nothing — and the PRD's rule is
    // *"a failed image means no response"*.
    const stored = await this.storeImage(request.image);

    try {
      // ── 6. Write the Response and the audit event, in one transaction ───
      const written = await this.transactions.run((transaction) =>
        this.writeResponseAndAudit(validated, stored, subject, transaction),
      );

      // ── 7. The email, after the commit ─────────────────────────────────
      //
      // **The owner is told that a response exists — and nothing more.** The
      // email says a response was received; it does not carry the response's
      // contents, because the owner reaches them through the authenticated
      // surface (FR-39), not through an email.
      await this.notify(written.responseId, subject);

      return {
        responseId: written.responseId,
        status: written.status,
        submittedAt: written.submittedAt,
        eventId: written.eventId,
      };
    } catch (error) {
      // ── The compensating delete ──────────────────────────────────────────
      //
      // **The delete is issued after the transaction has rolled back.** A
      // delete inside a transaction that is about to roll back would be
      // undone by that rollback and orphan the blob anyway.
      await this.compensate(stored);

      throw error;
    }
  }

  /**
   * Write the Response and record the audit event — in the caller's
   * transaction.
   */
  private async writeResponseAndAudit(
    validated: ValidatedRecoveryResponse,
    stored: StoredImage | null,
    subject: RecoveryResponseSubject,
    transaction: TransactionHandle,
  ): Promise<{
    readonly responseId: string;
    readonly status: string;
    readonly submittedAt: Date;
    readonly eventId: string;
  }> {
    // ── The Response ───────────────────────────────────────────────────────
    const created = await this.responses.create(
      stored === null ? validated : withCandidateImage(validated, stored.path),
      transaction,
    );

    // ── The audit event ───────────────────────────────────────────────────
    //
    // **Event 15 — "a Recovery Response was submitted".** The factory owns
    // the event's shape, so the payload's fields are named in exactly one
    // place.
    const draft: ResponseSubmittedDraft = {
      lostReportId: subject.id,
      recoveryResponseId: created.id,
      responderId: created.responderId,
      // **The exact place and the observed details are catalog-named for
      // this event**, and the event is administrator-only. They are never
      // written to the operational log.
      //
      // **The values come from the *validated* Response, not the persisted
      // one.** The persisted shape carries them as nullable — because a
      // lifecycle-written Response has none — and this path wrote a
      // *submitted* Response, which by construction carries all of them.
      // Reading them from the validated Response makes that structural
      // rather than a null-check the compiler cannot verify.
      whereFound: validated.whereFoundExactPlace.value,
      observedIdentifyingDetails: validated.observedIdentifyingDetails.value,
      dateFound: validated.dateFound.value,
      imagePresent: created.candidateImageRef !== null,
      occurredAt: created.createdAt,
    };

    const event = await this.events.recordResponseSubmitted(draft, transaction);

    return {
      responseId: created.id,
      status: created.status,
      // **The persisted row's own timestamp.** The row was written with the
      // validated Response's `submittedAt`, so this is that value — not a
      // fresh reading of the clock.
      //
      // **The validated Response's own timestamp**, for the same reason the
      // event's fields come from there: this path wrote a *submitted*
      // Response, which by construction carries one.
      submittedAt: validated.submittedAt,
      eventId: event.id,
    };
  }

  /**
   * Store the candidate image, when one was submitted.
   *
   * @returns the stored image's reference, or `null` when none was
   * submitted.
   */
  private async storeImage(image: ImageUpload | undefined): Promise<StoredImage | null> {
    if (image === undefined) {
      return null;
    }

    return this.images.store(image, 'recovery-response-candidates');
  }

  /**
   * Delete a stored candidate image after a failed write.
   *
   * **A failed delete is recorded for retry rather than silently leaked**
   * (image-handling §5). The transport's own logging is the record, and the
   * retries are idempotent by pathname.
   */
  private async compensate(stored: StoredImage | null): Promise<void> {
    if (stored === null) {
      return;
    }

    try {
      await this.images.delete(stored.path);
    } catch {
      // Recorded for retry by the transport. The Response was never
      // written, so the orphaned blob is a leak rather than a disclosure —
      // and the retry path is idempotent.
    }
  }

  /**
   * Send the FR-46 "new Recovery Response on your Lost report" email to the
   * Lost-report owner.
   *
   * **A send failure never fails the submission.** The Response is already
   * `Submitted` and the event is already recorded; the email is a
   * notification of a fact that is now true.
   */
  private async notify(
    responseId: string,
    subject: RecoveryResponseNotificationTarget,
  ): Promise<void> {
    try {
      await this.emails.send(
        this.emailBuilder.build({
          recipientEmail: subject.reporterEmail,
          itemName: subject.name,
          // **The link points at the Lost report, not the Response.** The
          // owner reviews the responses from their own report's detail page
          // — which is where FR-39 grants them visibility of every response
          // on it — so the path needs only the report's id.
          reportPath: `${this.baseUrl}/my/reports/${subject.id}/review-responses`,
        }),
      );
    } catch {
      // Recorded by the transport. The Response stands — the responder's
      // response is submitted, and neither that fact nor the event depends
      // on the notification arriving.
    }
  }

  /**
   * Map a blocked decision to the error the transport maps.
   *
   * **The duplicate is a conflict; the rest are permission failures.** The
   * responder who already holds a live response must wait — that is a
   * conflict with an existing state. The responder responding to their own
   * report has no right to make the response at all.
   */
  private refusal(reason: RecoveryResponseSubmissionBlockReason): Error {
    const message = recoveryResponseSubmissionBlockMessage(reason);

    if (reason === 'AlreadyHasLiveResponse') {
      return new RecoveryResponseSubmissionRefusedError(message);
    }

    return new PermissionDeniedError(message);
  }
}

/**
 * The submission was refused.
 *
 * **A named kind of `ConflictError`,** because the reasons differ in kind: a
 * duplicate live Response is a conflict with an existing state, while
 * responding to one's own report is a permission failure. The transport maps
 * a conflict to a **409** and a permission failure to a **403**, and the two
 * refusals call for different responder remedies.
 */
export class RecoveryResponseSubmissionRefusedError extends ConflictError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The report status the gate is given.
 *
 * **Aliased here so the service's import list names one thing.** The gate
 * accepts `ReportStatus | null`; the subject's status is a `string` because
 * it comes from storage, and the gate's whitelist is what refuses a status
 * it does not recognise.
 */
type RecoveryResponseSubmissionFactsStatus = Parameters<
  typeof decideRecoveryResponseSubmission
>[0]['facts']['reportStatus'];
