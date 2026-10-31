/**
 * The `RecoveryResponseThreadService` — FR-47's per-Response conversation.
 *
 * **The thread has exactly three participants, and the service enforces that
 * before anything else happens.** The responder, the owner of the Lost report
 * the response was made against, and an administrator. A member who is
 * neither the responder nor the owner "cannot view or post in it", and the
 * story says so without hedging. The decision is the domain's
 * (`decideRecoveryResponseThreadParticipation`); the service supplies the
 * facts and acts on the answer.
 *
 * **The participants are derived from this response alone.** The owner comes
 * from the parent report, and the responder from this response's own row —
 * and the parent report's *other* responses' responders are never consulted.
 * A competing responder on the same Lost report is not a participant here,
 * and the rule has no way to name them. **This is what makes the isolation a
 * rule rather than a convention:** a per-report thread would hand every
 * candidate the conversation of every other candidate.
 *
 * **Participation grants no private evidence.** The owner takes part in the
 * thread but never sees the responder's where-found or observed identifying
 * details: those are FR-44's fields and FR-37's Sensitive Fields, and FR-39's
 * notes are explicit that "participation is never permission". The thread
 * carries **messages**, and a message is not a where-found and not an
 * identifying detail. The service therefore reads the thread's subject — the
 * Response's status, the report's status, the two participants' ids — and
 * never the Response's sensitive fields at all. **There is no field on the
 * subject for them,** which is how "participation is never permission" is
 * made structural rather than promised.
 *
 * **A read-only thread keeps its full history.** The story says "messages
 * are never deleted; a locked thread keeps its full history", and the PRD's
 * retention rule says threads are retained for the parent report's lifetime.
 * Closing a thread changes **writability only** — so the read path and the
 * write path are separate decisions, and a locked thread is still readable by
 * its participants.
 *
 * **The message and the audit event commit together.** The message is a fact
 * that has happened, and the trail's event 16 records it. The trail is
 * append-only with no correction path (ADR-6), so an audit record for a
 * message that was never posted — or a posted message with no audit record —
 * is a permanent hole. Both are inside one transaction.
 *
 * **The message text is stored verbatim, and the audit payload carries it
 * too.** Event 16 names `messageText` as its one field, and names it as a
 * Sensitive Field — permitted here *only* because the PRD names it, and only
 * on the administrator-visible trail, never in an operational log. The
 * softening rule of story 006 applies to the *auto-rejection's* visible copy,
 * not to a message a member posted: the trail records what was said, and an
 * administrator reading the trail is reading the record of what happened.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  createRecoveryResponseThreadMessageBody,
  decideRecoveryResponseThreadParticipation,
  decideRecoveryResponseThreadWritability,
  mayAccessRecoveryResponseThread,
  RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE,
  recoveryResponseThreadReadOnlyMessage,
  type RecoveryResponseStatus,
  type RecoveryResponseThreadMessageBody,
  type RecoveryResponseThreadParticipation,
} from '@/domain/recovery';

import type { ReportStatus } from '@/domain/listings';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

import type {
  LostSideEventFactory,
  ThreadMessagePostedDraft,
} from '@/application/lost-side-event-factory';

import type {
  RecoveryResponseThreadMessageView,
  RecoveryResponseThreadReader,
  RecoveryResponseThreadSubject,
} from './ports/recovery-response-thread-reader';
import type { RecoveryResponseThreadRepository } from './ports/recovery-response-thread-repository';

/** The member taking part in a thread. */
export interface RecoveryResponseThreadActor {
  readonly actorId: string;
  /** Whether the actor is an administrator. */
  readonly isAdministrator: boolean;
}

/** What the caller supplies to read a thread. */
export interface ReadRecoveryResponseThreadRequest {
  readonly responseId: string;
  readonly actor: RecoveryResponseThreadActor;
}

/** What the caller supplies to post a message. */
export interface PostRecoveryResponseThreadMessageRequest {
  readonly responseId: string;
  readonly actor: RecoveryResponseThreadActor;
  /** The message's plain-text body. 1–2000 characters. */
  readonly body: string;
}

/** What a thread read produced. */
export interface RecoveryResponseThreadView {
  readonly recoveryResponseId: string;
  /** The viewer's relationship to the thread. */
  readonly participation: RecoveryResponseThreadParticipation;
  /** The messages, oldest first. */
  readonly messages: readonly RecoveryResponseThreadMessageView[];
  /** Whether the thread may be posted to. */
  readonly writable: boolean;
  /**
   * Why the thread is read-only, when it is.
   *
   * `null` when the thread is writable — the field is a reason, and a thread
   * with no reason to refuse is not a thread with a reason of `null`.
   */
  readonly readOnlyReason: 'ResponseEnded' | 'ReportEnded' | null;
  /**
   * The Recovery Response's status.
   *
   * **The surface needs it to name the read-only notice.** §13.5b has four
   * distinct notices — not a match, withdrawn, parent resolved, terminal —
   * and the coarse `readOnlyReason` cannot tell them apart. Carrying the
   * Response's own status and the report's is what lets the domain resolve
   * the exact variant, without the surface making a second copy of the
   * rule.
   */
  readonly responseStatus: RecoveryResponseStatus;
  /** The Lost report's status. */
  readonly reportStatus: ReportStatus;
  /** The responder's account id — the role tag for their messages. */
  readonly responderId: string;
  /** The Lost-report owner's account id — the role tag for their messages. */
  readonly lostReportOwnerId: string;
}

/** What a posted message produced. */
export interface PostRecoveryResponseThreadMessageResult {
  readonly recoveryResponseId: string;
  /** The stored message, with the id the database minted. */
  readonly message: RecoveryResponseThreadMessageView;
  /** The audit event written for the message. */
  readonly eventId: string;
}

/**
 * Reads and writes per-Recovery-Response threads.
 */
export class RecoveryResponseThreadService {
  constructor(
    private readonly reader: RecoveryResponseThreadReader,
    private readonly threads: RecoveryResponseThreadRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
    private readonly events: LostSideEventFactory,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────

  /**
   * Read a Recovery Response's thread.
   *
   * **A member who may not take part is refused, and the refusal says
   * nothing about whether the Response exists.** The message is "You do not
   * have access to this." — telling them whether the Response is real would
   * leak a fact about another member's response.
   *
   * @throws {PermissionDeniedError} when the actor may not take part — and
   * **also when no Response carries that id,** because the Response's
   * existence is a private fact and a missing Response has no participants.
   */
  async readThread(
    request: ReadRecoveryResponseThreadRequest,
  ): Promise<RecoveryResponseThreadView> {
    const subject = await this.reader.readThreadSubject(request.responseId);

    // **A missing Response is the access-denied refusal, never a 404.**
    //
    // **The Response's existence is itself a private fact.** A Recovery
    // Response is another member's assertion that they found the item, and
    // the fact that one exists — or does not — is not a stranger's business.
    // A 404 would answer that question: "the response you asked about is not
    // real" is a different answer from "you may not see this", and it leaks.
    if (!subject) {
      throw new PermissionDeniedError(RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE);
    }

    const participation = this.participationOf(subject, request.actor);

    if (!mayAccessRecoveryResponseThread(participation)) {
      throw new PermissionDeniedError(RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE);
    }

    const messages = await this.reader.listThreadMessages(subject.recoveryResponseId);
    const writability = decideRecoveryResponseThreadWritability({
      responseStatus: subject.responseStatus,
      reportStatus: subject.reportStatus,
    });

    return {
      recoveryResponseId: subject.recoveryResponseId,
      participation,
      messages,
      writable: writability.kind === 'Writable',
      readOnlyReason: writability.kind === 'ReadOnly' ? writability.reason : null,
      responseStatus: subject.responseStatus,
      reportStatus: subject.reportStatus,
      responderId: subject.responderId,
      lostReportOwnerId: subject.lostReportOwnerId,
    };
  }

  // ── Posting ────────────────────────────────────────────────────────────

  /**
   * Post a message into a Recovery Response's thread.
   *
   * **The body is validated before the gate.** A body that breaks its bound
   * is refused before anything is read or written, and the thread is
   * untouched.
   *
   * **The gate is decided before the transaction opens,** so a refused post
   * writes nothing at all — no message, no audit event.
   *
   * @throws {ValidationError} when the body breaks its 1–2000 bound.
   * Nothing is written.
   * @throws {PermissionDeniedError} when the actor may not take part — and
   * **also when no Response carries that id,** because the Response's
   * existence is a private fact and a missing Response has no participants.
   * @throws {ConflictError} when the thread is read-only — the response ended,
   * or the report has ended. Nothing is written.
   */
  async postMessage(
    request: PostRecoveryResponseThreadMessageRequest,
  ): Promise<PostRecoveryResponseThreadMessageResult> {
    // ── The body, first ───────────────────────────────────────────────────
    //
    // **A body that breaks its bound is refused before anything else.** The
    // domain owns the bound, and the domain's constructor is what throws.
    const body = createRecoveryResponseThreadMessageBody(request.body);

    // ── The gate, before the transaction ──────────────────────────────────
    const subject = await this.reader.readThreadSubject(request.responseId);

    // **A missing Response is the access-denied refusal, never a 404** — the
    // same reason the read path refuses it. The Response's existence is a
    // private fact about another member's assertion.
    if (!subject) {
      throw new PermissionDeniedError(RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE);
    }

    const participation = this.participationOf(subject, request.actor);

    if (!mayAccessRecoveryResponseThread(participation)) {
      throw new PermissionDeniedError(RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE);
    }

    // ── The writability ───────────────────────────────────────────────────
    //
    // **The read-only refusal names the path forward.** The message says
    // *why* the thread is closed — the response is closed, or the report is
    // no longer active — rather than saying "you may not post", which says
    // nothing about what to do next.
    const writability = decideRecoveryResponseThreadWritability({
      responseStatus: subject.responseStatus,
      reportStatus: subject.reportStatus,
    });

    if (writability.kind === 'ReadOnly') {
      throw new ConflictError(
        recoveryResponseThreadReadOnlyMessage(writability.reason),
      );
    }

    // ── The write, in one transaction ─────────────────────────────────────
    //
    // **The message and the audit event commit together.** The event is
    // event 16, whose parent is the *message* — the trail's retention
    // follows the parent entity's own lifetime, and the design specifies
    // `parent_id = message`. The response id is carried in the payload, so
    // the event is still queryable by response.
    const written = await this.transactions.run((transaction) =>
      this.writeMessage(subject, request.actor, body, transaction),
    );

    return {
      recoveryResponseId: written.recoveryResponseId,
      message: written.message,
      eventId: written.eventId,
    };
  }

  /**
   * The post's write, inside the caller's transaction.
   *
   * **The author's display name is read inside the transaction** and
   * captured onto the message, so a later rename does not rewrite the
   * conversation.
   */
  private async writeMessage(
    subject: RecoveryResponseThreadSubject,
    actor: RecoveryResponseThreadActor,
    body: RecoveryResponseThreadMessageBody,
    transaction: TransactionHandle,
  ): Promise<{
    readonly recoveryResponseId: string;
    readonly message: RecoveryResponseThreadMessageView;
    readonly eventId: string;
  }> {
    const authorDisplayName =
      (await this.reader.readAuthorDisplayName(actor.actorId, transaction)) ?? 'Member';

    const stored = await this.threads.postMessage(
      {
        recoveryResponseId: subject.recoveryResponseId,
        lostReportId: subject.lostReportId,
        authorId: actor.actorId,
        authorDisplayName,
        body,
        postedAt: new Date(),
      },
      transaction,
    );

    // ── The audit event ───────────────────────────────────────────────────
    //
    // **The payload carries exactly `messageText` and the response id,** the
    // two fields the catalog names for event 16. The sanitizer denies by
    // default, so the payload is typed to carry exactly those fields and the
    // compiler is the check that it does.
    const draft: ThreadMessagePostedDraft = {
      lostReportId: subject.lostReportId,
      recoveryResponseId: subject.recoveryResponseId,
      threadMessageId: stored.id,
      actorId: actor.actorId,
      actorRole: actor.isAdministrator ? 'administrator' : 'member',
      messageText: body.value,
    };

    const event = await this.events.recordThreadMessagePosted(draft, transaction);

    return {
      recoveryResponseId: subject.recoveryResponseId,
      message: {
        id: stored.id,
        authorId: stored.authorId,
        authorDisplayName: stored.authorDisplayName,
        body: stored.body.value,
        postedAt: stored.postedAt.toISOString(),
      },
      eventId: event.id,
    };
  }

  /**
   * The viewer's relationship to the thread.
   *
   * **The domain decides; the service supplies the facts.** The responder,
   * the Lost report's owner, and the administrator flag are all the decision
   * reads — and the parent report's *other* responders are not among them.
   */
  private participationOf(
    subject: RecoveryResponseThreadSubject,
    actor: RecoveryResponseThreadActor,
  ): RecoveryResponseThreadParticipation {
    return decideRecoveryResponseThreadParticipation({
      viewerId: actor.actorId,
      responderId: subject.responderId,
      lostReportOwnerId: subject.lostReportOwnerId,
      isAdministrator: actor.isAdministrator,
    });
  }
}

export { ValidationError };
