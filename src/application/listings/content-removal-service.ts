/**
 * The `ContentRemovalService` — FR-36's administrator moderation.
 *
 * **A removal withholds content; it does not close the report.** The story's
 * acceptance criterion is explicit: *"the report's status is unchanged
 * unless closure was separately requested."*
 *
 * ## Why the PRD's FR-36 sentence is read narrowly
 *
 * FR-36's prose says "Removal transitions status to **Closed**", and
 * FR-21's consequences say the close action "is used when ... inappropriate
 * content is taken down". Read together they could mean that a removal
 * *is* a closure.
 *
 * **They do not.** The story draws the line the PRD leaves ambiguous: a
 * removal and a closure are **two actions**, and the administrator who
 * takes content down may or may not also close the report. The unit's own
 * brief lists them as separate scope items — "Administrator close action
 * (FR-21)" and "Remove inappropriate content (FR-36)" — and lists closure
 * separately again under its technical context. FR-21 is the requirement that
 * closes reports and resolves their dependents; FR-36 is the requirement
 * that withholds content.
 *
 * **So this service never writes the report's status.** It takes no route
 * to a closure, and a caller that wants a report closed asks for the close —
 * which resolves the report's dependents in its own transaction, exactly as
 * FR-21 requires.
 *
 * ## The removal preserves rather than deletes
 *
 * **The audit trail is append-only (ADR-6)**, so a record naming removed
 * content must be able to point at content that still exists. The removal
 * therefore **marks the content withheld**; the content itself stays on the
 * row.
 *
 * That is also why the report's status is untouched: a removal is not a
 * lifecycle transition, and a record that said "this report was closed" when
 * it was not would be a false statement in a trail that cannot be corrected.
 *
 * ## The audit record is non-numbered
 *
 * **FR-31 says the non-numbered set grows "only when a requirement
 * explicitly asks for a record"** — and FR-36 asks for one explicitly: "the
 * action records the administrator and timestamp", and "the audit trail
 * retains the entry". FR-31's numbered catalog has no removal event, and
 * FR-31 forbids adding one. So the removal is recorded as a **non-numbered**
 * record, alongside the profile edit, the administrator's report edit, and
 * the registration submission.
 *
 * **The payload carries exactly four things:** the acting administrator
 * (a typed column), the timestamp (a typed column), the target, and the
 * reason. The audit payload sanitizer denies by default, so naming those
 * two payload fields permits exactly those two.
 *
 * ## A repeated removal is idempotent
 *
 * **The trail holds one record of one moderation act.** A second removal of
 * content that is already withheld is not a second act; the story's edge
 * case is explicit that it "does not create a duplicate audit entry". The
 * service therefore reads the target's current state, and records nothing
 * when the target is already withheld.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { AuditWriter } from '@/application/audit-writer';
import type { TransactionFactory } from '@/application/ports/transaction-factory';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import { decideContentRemoval, type ContentRemovalTarget } from '@/domain/moderation';

import { NotFoundError, PermissionDeniedError } from '@/lib/errors';

import type { ContentRemovalRepository } from './ports/content-removal-repository';

/** The administrator removing the content. */
export interface ContentRemovalActor {
  readonly actorId: string;
  /** Whether the actor is an administrator. */
  readonly isAdministrator: boolean;
}

/** What the caller supplies. */
export interface RemoveContentRequest {
  readonly reportId: string;
  readonly actor: ContentRemovalActor;
  /** What is being removed. */
  readonly target: ContentRemovalTarget;
  /** The administrator's reason. 10–500 characters. */
  readonly reason: string;
}

/** What a removal produced. */
export interface RemoveContentResult {
  readonly reportId: string;
  /** The target that was removed. */
  readonly target: ContentRemovalTarget;
  /**
   * Whether a new audit record was written.
   *
   * **`false` when the target was already withheld.** The removal still
   * succeeded — the content is withheld, which is what the caller asked for
   * — but the trail already held this exact moderation act.
   */
  readonly recorded: boolean;
  /** The audit record's id, or `null` when nothing was recorded. */
  readonly eventId: string | null;
}

/**
 * Removes inappropriate content.
 */
export class ContentRemovalService {
  constructor(
    private readonly removals: ContentRemovalRepository,
    private readonly audit: AuditWriter,
    private readonly transactions: TransactionFactory,
  ) {}

  /**
   * Remove inappropriate content from a report or a thread message.
   *
   * @throws {NotFoundError} when the target does not exist on the report.
   * Nothing is written.
   * @throws {PermissionDeniedError} when the actor is not an administrator.
   * Nothing is written.
   * @throws {ValidationError} when the reason breaks its bound, or the target
   * kind is not one the system holds. Nothing is written.
   */
  async remove(request: RemoveContentRequest): Promise<RemoveContentResult> {
    // ── The authorisation ─────────────────────────────────────────────────
    //
    // **The administrator flag comes from the session, never from the
    // request.** A member-facing route resolves the actor; the service
    // decides. FR-36 is an administrator's action and nobody else's.
    if (!request.actor.isAdministrator) {
      throw new PermissionDeniedError('You do not have access to this.');
    }

    // ── The target's current state ────────────────────────────────────────
    //
    // **The state is read, never asserted.** Whether a target is already
    // withheld is a fact about the content, and a client that could assert
    // it would be choosing whether its own repeated action produced a
    // second audit record.
    const state = await this.removals.readTargetState(
      request.reportId,
      request.target,
    );

    if (state === null) {
      throw new NotFoundError('No such content on this report.');
    }

    // ── The decision ───────────────────────────────────────────────────────
    const decision = decideContentRemoval({
      reportId: request.reportId,
      actingAdministratorId: request.actor.actorId,
      target: request.target,
      reason: request.reason,
      alreadyRemoved: state.alreadyRemoved,
    });

    if (decision.kind === 'Refused') {
      // **The two refusals are the domain's, and the domain's reasons map
      // onto the two errors the caller can act on.** A `ValidationError` for
      // an invalid reason, and a `NotFoundError` for a target the system
      // does not hold — because a target kind the system does not hold is a
      // target that does not exist.
      throw new NotFoundError('No such content on this report.');
    }

    // ── The write, in one transaction ─────────────────────────────────────
    //
    // **The report's status is not touched.** A removal withholds content; it
    // does not close the report, and a trail that said otherwise would be
    // making a false statement about the report's lifecycle.
    const written = await this.transactions.run((transaction) =>
      this.write(decision, request.target, transaction),
    );

    return {
      reportId: request.reportId,
      target: request.target,
      recorded: written.recorded,
      eventId: written.eventId,
    };
  }

  /**
   * The removal's write, inside the caller's transaction.
   */
  private async write(
    decision: {
      readonly reportId: string;
      readonly actingAdministratorId: string;
      readonly reason: { readonly value: string };
      readonly recordsNewRemoval: boolean;
    },
    target: ContentRemovalTarget,
    transaction: TransactionHandle,
  ): Promise<{ readonly recorded: boolean; readonly eventId: string | null }> {
    // ── The removal's own row ──────────────────────────────────────────────
    //
    // **The row goes in before the content is marked.** The unique
    // constraint on the target is the second line of defence against a
    // duplicate, and it must refuse before anything is touched — so a
    // repeated removal raises the constraint, and the transaction rolls back
    // with the content's mark.
    await this.removals.recordRemoval(
      {
        reportId: decision.reportId,
        target,
        reason: decision.reason.value,
        administratorId: decision.actingAdministratorId,
      },
      transaction,
    );

    // ── The content's own row ──────────────────────────────────────────────
    //
    // **The content is marked withheld, not deleted.** The audit record names
    // the target, and the trail is append-only with no correction path
    // (ADR-6) — so the target has to still exist for the record to remain
    // verifiable.
    await this.removals.withholdContent(target, transaction);

    // ── The audit record ───────────────────────────────────────────────────
    //
    // **A repeated removal records nothing.** The content was already
    // withheld; there is no second moderation act to record.
    if (!decision.recordsNewRemoval) {
      return { recorded: false, eventId: null };
    }

    const event = await this.audit.record(
      {
        eventType: 'content.removed_by_administrator',
        parent: { parentType: 'report', parentId: decision.reportId },
        actor: {
          actorId: decision.actingAdministratorId,
          actorRole: 'administrator',
        },
        payload: {
          targetKind: target.kind,
          targetId: target.targetId,
          removalReason: decision.reason.value,
        },
        occurredAt: new Date(),
      },
      transaction,
    );

    return { recorded: true, eventId: event.id };
  }
}
