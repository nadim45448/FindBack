/**
 * The `ClaimThreadService` — FR-38's per-Claim conversation.
 *
 * **The thread has exactly three participants, and the service enforces that
 * before anything else happens.** The claimant, the finder of the Found
 * report the Claim was made against, and an administrator. A member who is
 * neither the claimant nor the finder "cannot view or post in it", and the
 * story says so without hedging. The decision is the domain's
 * (`decideClaimThreadParticipation`); the service supplies the facts and
 * acts on the answer.
 *
 * **Participation grants no private evidence.** The finder takes part in the
 * thread but never sees the claimant's reason or identifying details: those
 * are FR-37 Sensitive Fields, and FR-39's notes are explicit that
 * "participation is never permission". The thread carries **messages**, and
 * a message is not a reason and not an identifying detail. The service
 * therefore reads the thread's subject — the Claim's status, the report's
 * status, the two participants' ids — and never the Claim's reason or
 * identifying details at all. There is no field on the subject for them,
 * which is how "participation is never permission" is made structural
 * rather than promised.
 *
 * **A read-only thread keeps its full history.** The story says "messages
 * are never deleted; a locked thread keeps its full history", and the PRD's
 * retention rule says threads are retained for the parent report's
 * lifetime. Closing a thread changes **writability only** — so the read
 * path and the write path are separate decisions, and a locked thread is
 * still readable by its participants.
 *
 * **The message and the audit event commit together.** The message is a
 * fact that has happened, and the trail's event 14 records it. The trail
 * is append-only with no correction path (ADR-6), so an audit record for a
 * message that was never posted — or a posted message with no audit record
 * — is a permanent hole. Both are inside one transaction.
 *
 * **The message text is stored verbatim, and the audit payload carries it
 * too.** Event 14 names `messageText` as its one field, and names it as a
 * Sensitive Field — permitted here *only* because the PRD names it, and
 * only on the administrator-visible trail, never in an operational log. The
 * softening rule of story 006 applies to the *auto-rejection's* visible
 * copy, not to a message a member posted: the trail records what was said,
 * and an administrator reading the trail is reading the record of what
 * happened.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  buildClaimThreadMessagePostedEvent,
  claimThreadReadOnlyMessage,
  createClaimThreadMessageBody,
  decideClaimThreadParticipation,
  decideClaimThreadWritability,
  mayAccessClaimThread,
  CLAIM_THREAD_ACCESS_DENIED_MESSAGE,
  type ClaimStatus,
  type ClaimThreadMessageBody,
  type ClaimThreadMessagePosted,
  type ClaimThreadParticipation,
  type ReportStatus,
} from '@/domain/listings';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

import type {
  ClaimThreadReader,
  ClaimThreadSubject,
  ThreadMessageView,
} from './ports/claim-thread-reader';
import type { ClaimThreadRepository } from './ports/claim-thread-repository';

/** The member taking part in a thread. */
export interface ClaimThreadActor {
  readonly actorId: string;
  /** Whether the actor is an administrator. */
  readonly isAdministrator: boolean;
}

/** What the caller supplies to read a thread. */
export interface ReadClaimThreadRequest {
  readonly claimId: string;
  readonly actor: ClaimThreadActor;
}

/** What the caller supplies to post a message. */
export interface PostClaimThreadMessageRequest {
  readonly claimId: string;
  readonly actor: ClaimThreadActor;
  /** The message's plain-text body. 1–2000 characters. */
  readonly body: string;
}

/** What a thread read produced. */
export interface ClaimThreadView {
  readonly claimId: string;
  /** The viewer's relationship to the thread. */
  readonly participation: ClaimThreadParticipation;
  /** The messages, oldest first. */
  readonly messages: readonly ThreadMessageView[];
  /** Whether the thread may be posted to. */
  readonly writable: boolean;
  /**
   * Why the thread is read-only, when it is.
   *
   * `null` when the thread is writable — the field is a reason, and a
   * thread with no reason to refuse is not a thread with a reason of
   * `null`.
   */
  readonly readOnlyReason: 'ClaimDecided' | 'ReportEnded' | null;
  /**
   * The Claim's status.
   *
   * **The surface needs it to name the read-only notice.** §13.5 has four
   * distinct notices — approved, rejected, returned, closed — and the
   * coarse `readOnlyReason` cannot tell them apart. Carrying the Claim's
   * own status and the report's is what lets the domain resolve the exact
   * variant, without the surface making a second copy of the rule.
   */
  readonly claimStatus: ClaimStatus;
  /** The Found report's status. */
  readonly reportStatus: ReportStatus;
  /** The claimant's account id — the role tag for their messages. */
  readonly claimantId: string;
  /** The finder's account id — the role tag for their messages. */
  readonly foundReportOwnerId: string;
}

/** What a posted message produced. */
export interface PostClaimThreadMessageResult {
  readonly claimId: string;
  /** The stored message, with the id the database minted. */
  readonly message: ThreadMessageView;
  /** The audit event written for the message. */
  readonly event: ClaimThreadMessagePosted;
}

/**
 * Reads and writes per-Claim threads.
 */
export class ClaimThreadService {
  constructor(
    private readonly reader: ClaimThreadReader,
    private readonly threads: ClaimThreadRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
  ) {}

  // ── Reading ────────────────────────────────────────────────────────────

  /**
   * Read a Claim's thread.
   *
   * **A member who may not take part is refused, and the refusal says
   * nothing about whether the Claim exists.** The message is "You do not
   * have access to this." — telling them whether the Claim is real would
   * leak a fact about another member's claim.
   *
   * @throws {PermissionDeniedError} when the actor may not take part — and
   * **also when no Claim carries that id,** because the Claim's existence is
   * a private fact and a missing Claim has no participants.
   */
  async readThread(request: ReadClaimThreadRequest): Promise<ClaimThreadView> {
    const subject = await this.reader.readThreadSubject(request.claimId);

    // **A missing Claim is the access-denied refusal, never a 404.**
    //
    // **The Claim's existence is itself a private fact.** A Claim is
    // another member's assertion that an item is theirs, and the fact that
    // one exists — or does not — is not a stranger's business. A 404 would
    // answer that question: "the claim you asked about is not real" is a
    // different answer from "you may not see this", and it leaks.
    //
    // **A participant can never be missing a Claim.** The three
    // participants are the claimant, the finder, and the administrator —
    // and the administrator's relationship is to the Claim, not to the id.
    // So a Claim that does not exist has no participants, and every reader
    // of a missing Claim is refused the same way.
    if (!subject) {
      throw new PermissionDeniedError(CLAIM_THREAD_ACCESS_DENIED_MESSAGE);
    }

    const participation = this.participationOf(subject, request.actor);

    if (!mayAccessClaimThread(participation)) {
      throw new PermissionDeniedError(CLAIM_THREAD_ACCESS_DENIED_MESSAGE);
    }

    const messages = await this.reader.listThreadMessages(subject.claimId);
    const writability = decideClaimThreadWritability({
      claimStatus: subject.claimStatus,
      reportStatus: subject.reportStatus,
    });

    return {
      claimId: subject.claimId,
      participation,
      messages,
      writable: writability.kind === 'Writable',
      readOnlyReason:
        writability.kind === 'ReadOnly' ? writability.reason : null,
      claimStatus: subject.claimStatus,
      reportStatus: subject.reportStatus,
      claimantId: subject.claimantId,
      foundReportOwnerId: subject.foundReportOwnerId,
    };
  }

  // ── Posting ────────────────────────────────────────────────────────────

  /**
   * Post a message into a Claim's thread.
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
   * **also when no Claim carries that id,** because the Claim's existence is
   * a private fact and a missing Claim has no participants.
   * @throws {ConflictError} when the thread is read-only — the claim was
   * decided, or the report has ended. Nothing is written.
   */
  async postMessage(
    request: PostClaimThreadMessageRequest,
  ): Promise<PostClaimThreadMessageResult> {
    // ── The body, first ───────────────────────────────────────────────────
    //
    // **A body that breaks its bound is refused before anything else.** The
    // domain owns the bound, and the domain's constructor is what throws.
    const body = createClaimThreadMessageBody(request.body);

    // ── The gate, before the transaction ──────────────────────────────────
    const subject = await this.reader.readThreadSubject(request.claimId);

    // **A missing Claim is the access-denied refusal, never a 404** — the
    // same reason the read path refuses it. The Claim's existence is a
    // private fact about another member's assertion.
    if (!subject) {
      throw new PermissionDeniedError(CLAIM_THREAD_ACCESS_DENIED_MESSAGE);
    }

    const participation = this.participationOf(subject, request.actor);

    if (!mayAccessClaimThread(participation)) {
      throw new PermissionDeniedError(CLAIM_THREAD_ACCESS_DENIED_MESSAGE);
    }

    // ── The writability ───────────────────────────────────────────────────
    //
    // **The read-only refusal names the path forward.** The message says
    // *why* the thread is closed — the claim was decided, or the report is
    // no longer active — rather than saying "you may not post", which
    // says nothing about what to do next.
    const writability = decideClaimThreadWritability({
      claimStatus: subject.claimStatus,
      reportStatus: subject.reportStatus,
    });

    if (writability.kind === 'ReadOnly') {
      throw new ConflictError(claimThreadReadOnlyMessage(writability.reason));
    }

    // ── The write, in one transaction ─────────────────────────────────────
    //
    // **The message and the audit event commit together.** The event is
    // event 14, whose parent is the Claim — a thread is addressed by its
    // Claim, and the Claim is what decides the trail's retention rule.
    const written = await this.transactions.run((transaction) =>
      this.writeMessage(subject, request.actor, body, transaction),
    );

    return {
      claimId: written.claimId,
      message: written.message,
      event: written.event,
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
    subject: ClaimThreadSubject,
    actor: ClaimThreadActor,
    body: ClaimThreadMessageBody,
    transaction: TransactionHandle,
  ): Promise<{
    readonly claimId: string;
    readonly message: ThreadMessageView;
    readonly event: ClaimThreadMessagePosted;
  }> {
    const authorDisplayName =
      (await this.reader.readAuthorDisplayName(actor.actorId, transaction)) ?? 'Member';

    const stored = await this.threads.postMessage(
      {
        claimId: subject.claimId,
        reportId: subject.reportId,
        authorId: actor.actorId,
        authorDisplayName,
        body,
        postedAt: new Date(),
      },
      transaction,
    );

    // ── The audit event ───────────────────────────────────────────────────
    //
    // **The payload carries exactly `messageText`,** the one field the
    // catalog names for event 14. The sanitizer denies by default, so the
    // payload is typed to carry exactly that field and the compiler is the
    // check that it does.
    const event = buildClaimThreadMessagePostedEvent({
      claimId: subject.claimId,
      reportId: subject.reportId,
      messageId: stored.id,
      authorId: actor.actorId,
      body,
    });

    await this.audit.record(
      {
        eventType: event.type,
        parent: { parentType: 'claim', parentId: event.claimId },
        // **The role is the poster's role, not a fixed one.** An
        // administrator posting in a thread is recorded as an
        // administrator — the trail is read by administrators, and a
        // message from an administrator that reads as a member's is a
        // trail that misrepresents who said what.
        actor: {
          actorId: event.authorId,
          actorRole: actor.isAdministrator ? 'administrator' : 'member',
        },
        payload: { messageText: event.payload.messageText },
        occurredAt: stored.postedAt,
      },
      transaction,
    );

    return {
      claimId: subject.claimId,
      message: {
        id: stored.id,
        authorId: stored.authorId,
        authorDisplayName: stored.authorDisplayName,
        body: stored.body.value,
        postedAt: stored.postedAt.toISOString(),
      },
      event,
    };
  }

  /**
   * The viewer's relationship to the thread.
   *
   * **The domain decides; the service supplies the facts.** The Claim's
   * claimant, the Found report's owner, and the administrator flag are all
   * the decision reads.
   */
  private participationOf(
    subject: ClaimThreadSubject,
    actor: ClaimThreadActor,
  ): ClaimThreadParticipation {
    return decideClaimThreadParticipation({
      viewerId: actor.actorId,
      claimantId: subject.claimantId,
      foundReportOwnerId: subject.foundReportOwnerId,
      isAdministrator: actor.isAdministrator,
    });
  }
}

export { ValidationError };
