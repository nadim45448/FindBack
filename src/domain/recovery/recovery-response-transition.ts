/**
 * The Recovery Response's transitions — FR-41's state machine.
 *
 * **The transition table is the machine.** A transition that is not in the
 * table does not exist, and attempting one throws. There is no "best effort"
 * path, no silent no-op, and no partial application: a response either moves
 * to a status the table permits, or it does not move at all.
 *
 * ```text
 * Submitted ──select──► Selected for Verification ──not match──► Not a Match (terminal)
 *                             │
 *                      match confirmed  (NON-TERMINAL)
 *                             ▼
 *                      Match Confirmed ──report Returned──► Completed — Report Returned (terminal)
 *
 * Any non-terminal ──report Returned (not the matched one)──► Resolved — Report Returned (terminal)
 * Any non-terminal ──report Closed──► Resolved — Report Closed (terminal)
 * Submitted (not selected) ──responder withdraws──► Withdrawn (terminal)
 * ```
 *
 * ## The table is a map, not a list
 *
 * Each status maps to the statuses reachable from it. **A status with no
 * outgoing transitions has an empty list**, and that is what makes a terminal
 * status terminal: the table has no key to look up, so there is nothing to
 * permit.
 *
 * This is why the table is written as a `Map` rather than as a list of
 * `(from, to)` pairs: an illegal transition is then a **lookup that misses**,
 * which is a total function — every status is a key — rather than an
 * absence that could be mistaken for "not yet implemented".
 *
 * ## `Match Confirmed` has outgoing transitions
 *
 * It is non-terminal, and the table reflects that. It can still become
 * `Completed — Report Returned` (the report was returned) or
 * `Resolved — Report Returned` / `Resolved — Report Closed`.
 *
 * **It cannot jump straight to `Completed`.** The story's edge case is
 * explicit: *"Attempt to move `Match Confirmed` directly to `Completed`
 * without the report being `Returned` — throws; the report Returned
 * transition is the only door."* Since the response's status is
 * `Completed — Report Returned` and not `Completed`, there is no such door to
 * name — but the distinction the edge case draws is preserved by the table:
 * **the report's lifecycle is the only thing that may complete a matched
 * response**, and this table is the response's, not the report's.
 *
 * Pure — no I/O, no framework imports.
 */

import { IllegalTransitionError } from '@/lib/errors';

import {
  type RecoveryResponseStatus,
  isRecoveryResponseStatus,
} from './recovery-response-status';

/**
 * The statuses reachable from each status.
 *
 * **Every one of the eight statuses is a key**, so the lookup is total. The
 * five terminal statuses map to an empty list — they accept no further
 * change, and the map says so rather than leaving it implied by absence.
 */
export const RECOVERY_RESPONSE_TRANSITIONS: Readonly<
  Record<RecoveryResponseStatus, readonly RecoveryResponseStatus[]>
> = Object.freeze({
  /** A submitted response may be selected, withdrawn, or resolved by the report. */
  Submitted: Object.freeze([
    'Selected for Verification',
    'Withdrawn',
    'Resolved — Report Returned',
    'Resolved — Report Closed',
  ] as const),

  /**
   * A selected response may be matched, ruled not a match, or resolved by the
   * report.
   *
   * **It may not be withdrawn.** The story is explicit: *"the withdrawal is
   * refused because selection is now the owner's decision in progress."*
   */
  'Selected for Verification': Object.freeze([
    'Match Confirmed',
    'Not a Match',
    'Resolved — Report Returned',
    'Resolved — Report Closed',
  ] as const),

  /**
   * A matched response may still be completed or resolved.
   *
   * **It may not be withdrawn and it may not become `Not a Match`** — the
   * owner's determination has been recorded, and only the report's lifecycle
   * moves it from here.
   */
  'Match Confirmed': Object.freeze([
    'Completed — Report Returned',
    'Resolved — Report Returned',
    'Resolved — Report Closed',
  ] as const),

  /** Terminal. */
  'Not a Match': Object.freeze([] as const),

  /** Terminal. */
  'Completed — Report Returned': Object.freeze([] as const),

  /** Terminal. */
  'Resolved — Report Returned': Object.freeze([] as const),

  /** Terminal. */
  'Resolved — Report Closed': Object.freeze([] as const),

  /** Terminal. */
  Withdrawn: Object.freeze([] as const),
});

/**
 * The statuses reachable from `status`.
 *
 * **An empty list for a terminal status** — not an error. A caller that wants
 * to know whether a move is possible asks `canTransition`; a caller that
 * wants to know *where* it can go reads the list.
 */
export function transitionsFrom(status: RecoveryResponseStatus): readonly RecoveryResponseStatus[] {
  return RECOVERY_RESPONSE_TRANSITIONS[status];
}

/** True when `status` may move directly to `target`. */
export function canTransition(
  status: RecoveryResponseStatus,
  target: RecoveryResponseStatus,
): boolean {
  return transitionsFrom(status).includes(target);
}

/**
 * True when `status` may not leave.
 *
 * **A terminal status has no outgoing transitions at all,** so this is read
 * from the table rather than from a second list — one implementation point
 * for the fact.
 */
export function hasOutgoingTransition(status: RecoveryResponseStatus): boolean {
  return transitionsFrom(status).length > 0;
}

/**
 * Move a response from one status to another, or refuse.
 *
 * **The refusal throws rather than returning a result.** A caller that
 * ignored a returned `false` would silently drop a transition — and the
 * story's requirement is explicit: *"the transition throws rather than
 * silently degrading or partially applying."*
 *
 * @throws {IllegalTransitionError} when the move is not in the table. The
 * error carries both statuses, because the question "why was this refused?"
 * is answered by the pair.
 */
export function assertRecoveryResponseTransition(
  from: RecoveryResponseStatus,
  to: RecoveryResponseStatus,
): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(
      `A Recovery Response cannot move from "${from}" to "${to}".`,
    );
  }
}

/**
 * The status a response moves to, or a refusal.
 *
 * **The functional form of `assertRecoveryResponseTransition`,** for callers
 * that would rather branch than catch. It is the same table and the same
 * refusal — there is no second answer to "may this response move?".
 */
export function decideRecoveryResponseTransition(
  from: RecoveryResponseStatus,
  to: RecoveryResponseStatus,
): { readonly kind: 'Permitted' } | { readonly kind: 'Refused'; readonly reason: string } {
  if (canTransition(from, to)) {
    return { kind: 'Permitted' };
  }

  return {
    kind: 'Refused',
    reason: `A Recovery Response cannot move from "${from}" to "${to}".`,
  };
}

/**
 * Parse a status read from storage.
 *
 * **A value the vocabulary does not name is refused, not coerced.** The
 * database's `CHECK` constraint already rejects such a write, so this guards
 * the read path: a value that is not a canonical status means the row was
 * written by something that did not go through the constraint, and treating
 * it as some nearby status would invent a fact.
 *
 * @throws {IllegalTransitionError} when `value` is not one of the eight.
 */
export function parseRecoveryResponseStatus(value: string): RecoveryResponseStatus {
  if (!isRecoveryResponseStatus(value)) {
    throw new IllegalTransitionError(
      `"${value}" is not a Recovery Response status.`,
    );
  }

  return value;
}
