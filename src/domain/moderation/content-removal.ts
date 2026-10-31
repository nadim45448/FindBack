/**
 * The content removal — FR-36's moderation record and its gate.
 *
 * **A removal hides content from members; it does not delete it.** The
 * PRD's FR-36 removes inappropriate content from member-facing surfaces while
 * the audit trail preserves the record of what was removed and why. Those
 * two facts are in tension, and this module resolves the tension by making
 * them structural: the removal is a **row**, not a deletion.
 *
 * ## The trail is append-only, so the removal cannot be a deletion
 *
 * ADR-6 records that the audit trail has no correction path — a record is
 * appended, never edited and never removed. If a removal physically deleted
 * the content, then the audit record naming that content would be pointing
 * at something that no longer exists, and the trail would be describing a
 * fact it could no longer verify. A removal therefore **marks the content
 * as withheld**; the content itself stays on the row.
 *
 * That is also why the report's own status is untouched. **FR-36 says
 * explicitly:** *"the report's status is unchanged unless closure was
 * separately requested."* A removal is not a closure and never was one.
 *
 * ## The target is named, and the kinds are closed
 *
 * **A removal names what was removed.** The kinds are closed — a report's
 * image, a report's description, a thread message — because an open-ended
 * "remove this thing" would let a caller name a target the system does not
 * hold, and a removal with no real target would record a moderation action
 * that did not act on anything.
 *
 * ## The reason is required, and it is stored verbatim
 *
 * **A removal without a reason is refused.** The reason is what the audit
 * trail preserves, and it is the only record of why an administrator
 * withheld a member's content. The bound is the same 10–500 characters as
 * an administrator's closure reason — the two are the same kind of field:
 * administrator-supplied free text recorded on the trail — and the bound
 * lives in one place.
 *
 * **The reason is stored verbatim, and it is never rendered as HTML.** The
 * story's edge case is explicit: *"A reason containing markup is stored
 * verbatim and never rendered as HTML."* Storing it verbatim and rendering
 * it as text are two different things, and this module guarantees the first
 * while the rendering layer guarantees the second. The reason is plain text
 * with no markup interpretation anywhere in the domain.
 *
 * ## A repeated removal on the same target is idempotent
 *
 * **Removing the same target twice records one removal.** The story's edge
 * case is explicit: *"A repeated removal on the same target is idempotent —
 * no duplicate audit entry."* A second removal of content that is already
 * withheld is not a second moderation act; it is the same act, asked twice.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  createReportClosureReason,
  type ReportClosureReason,
} from '@/domain/listings';

/**
 * The kinds of content an administrator may remove.
 *
 * **Closed, and named after the PRD's surfaces.** Each names a column or a
 * row the database actually holds.
 */
export const CONTENT_REMOVAL_TARGET_KINDS = [
  /** The report's own image. */
  'report_image',
  /** The report's description. */
  'report_description',
  /** A message in a per-Claim or per-Recovery-Response thread. */
  'thread_message',
] as const;

/** The kind of content a removal acts on. */
export type ContentRemovalTargetKind = (typeof CONTENT_REMOVAL_TARGET_KINDS)[number];

/** True when `value` is one of the removal's target kinds. */
export function isContentRemovalTargetKind(value: string): value is ContentRemovalTargetKind {
  return (CONTENT_REMOVAL_TARGET_KINDS as readonly string[]).includes(value);
}

/**
 * The removal's target.
 *
 * **A kind and an id.** The kind says which column or table the id refers
 * to; the id alone would be ambiguous across three surfaces.
 */
export interface ContentRemovalTarget {
  readonly kind: ContentRemovalTargetKind;
  /** The id of the row the content lives on. */
  readonly targetId: string;
}

/** The facts the removal decision reads. */
export interface ContentRemovalFacts {
  /** The report the content belongs to. */
  readonly reportId: string;
  /** The administrator removing the content. */
  readonly actingAdministratorId: string;
  /** What is being removed. */
  readonly target: ContentRemovalTarget;
  /** The administrator's reason. 10–500 characters. */
  readonly reason: string;
  /**
   * Whether the target is **already** withheld.
   *
   * **Read from the database, never asserted by the client.** The
   * idempotence rule depends on the true state of the content, and a client
   * that could assert it would be choosing whether its own repeated action
   * produces a second audit record.
   */
  readonly alreadyRemoved: boolean;
}

/** Why a removal was refused. */
export type ContentRemovalRefusal =
  /** The target kind is not one the system holds. */
  | 'UnknownTargetKind'
  /** The reason breaks its bound. */
  | 'InvalidReason';

/** The outcome of deciding a removal. */
export type ContentRemovalDecision =
  | {
      readonly kind: 'Permitted';
      readonly reportId: string;
      readonly actingAdministratorId: string;
      readonly target: ContentRemovalTarget;
      readonly reason: ReportClosureReason;
      /**
       * Whether this call **records** a new removal.
       *
       * **False when the target is already withheld.** The removal still
       * succeeds — the content is withheld, which is what the caller asked
       * for — but it records no second audit entry, because there is no
       * second moderation act.
       */
      readonly recordsNewRemoval: boolean;
    }
  | { readonly kind: 'Refused'; readonly reason: ContentRemovalRefusal };

/**
 * Decide whether a content removal may proceed.
 *
 * **The reason is validated first,** because a removal with no usable reason
 * is refused before anything is read or written.
 */
export function decideContentRemoval(facts: ContentRemovalFacts): ContentRemovalDecision {
  // ── The target kind ─────────────────────────────────────────────────────
  //
  // **An unknown kind is refused.** A removal that named a target kind the
  // system does not hold would record a moderation act against nothing.
  if (!isContentRemovalTargetKind(facts.target.kind)) {
    return { kind: 'Refused', reason: 'UnknownTargetKind' };
  }

  // ── The reason ──────────────────────────────────────────────────────────
  const reason = createReportClosureReason(facts.reason);

  return {
    kind: 'Permitted',
    reportId: facts.reportId,
    actingAdministratorId: facts.actingAdministratorId,
    target: facts.target,
    reason,
    // **A repeated removal records nothing new.** The content is already
    // withheld, which is what the caller asked for, so the call succeeds;
    // but the trail already holds this exact moderation act.
    recordsNewRemoval: !facts.alreadyRemoved,
  };
}
