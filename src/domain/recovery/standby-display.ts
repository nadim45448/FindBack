/**
 * The `Standby` display condition — FR-41's derived status.
 *
 * **`Standby` is never persisted.** It is a **display condition**, derived at
 * render time for a response that is sitting behind another one (FR-41, D7).
 * The stored status of a standby response remains `Submitted`, and this
 * module exists so that the fact is derived in exactly one place.
 *
 * ## The rule
 *
 * A response renders as **`Submitted — Standby`** when:
 *
 * 1. its own stored status is `Submitted`, **and**
 * 2. **some other** response on the same Lost report is
 *    `Selected for Verification`.
 *
 * **"Some other" is load-bearing.** The selected response is not standing by
 * — it is the one doing the waiting. And the comparison is by **identity**,
 * not by status: a response cannot be its own sibling.
 *
 * ## When standby ends
 *
 * The story's edge case is explicit: *"Sibling response after the selected
 * one becomes `Not a Match` — no longer standby; displays plain `Submitted`."*
 *
 * The derivation reads the **current** statuses every time it is called, so
 * the moment the selected response leaves `Selected for Verification`, its
 * siblings stop being standby. **Nothing is stored to remember that a
 * response was ever in standby**, so there is no stale flag to fall out of
 * sync with the selection.
 *
 * ## The stored status never changes
 *
 * **The display condition is not a status and cannot become one.** A standby
 * response is `Submitted` in the database, is counted as `Submitted` by every
 * query that counts statuses, and is transitioned out of `Submitted`. The
 * standby label is a rendering concern and lives here.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  type RecoveryResponseStatus,
  isRecoveryResponseStatus,
} from './recovery-response-status';

/**
 * The label a standby response renders with.
 *
 * **The PRD's own string, including the em dash.** It is never assembled from
 * parts, because a response that renders `Submitted - Standby` with a hyphen
 * is not the string the PRD names.
 */
export const STANDBY_DISPLAY_STATUS = 'Submitted — Standby';

/**
 * One response on a Lost report, as the derivation needs to see it.
 *
 * **Both the identity and the status are needed:** the identity to exclude
 * the response itself from the sibling test, and the status to know whether
 * it is the selected one.
 */
export interface SiblingResponse {
  readonly id: string;
  readonly status: RecoveryResponseStatus;
}

/**
 * The status a response renders with.
 *
 * **The stored status, unless the response is in standby** — in which case
 * the derived label. The stored status is never rewritten: a standby
 * response is `Submitted` in the database and `Submitted — Standby` on
 * screen, and those are two different facts about two different things.
 */
export function deriveDisplayStatus(
  responseId: string,
  storedStatus: RecoveryResponseStatus,
  siblings: readonly SiblingResponse[],
): RecoveryResponseStatus | typeof STANDBY_DISPLAY_STATUS {
  if (storedStatus !== 'Submitted') {
    return storedStatus;
  }

  return isStandby(responseId, storedStatus, siblings)
    ? STANDBY_DISPLAY_STATUS
    : storedStatus;
}

/**
 * True when the response is in standby.
 *
 * **The same derivation as `deriveDisplayStatus`,** expressed as a question.
 * It is not a second implementation — both call the one predicate below.
 */
export function isStandby(
  responseId: string,
  storedStatus: RecoveryResponseStatus,
  siblings: readonly SiblingResponse[],
): boolean {
  return (
    storedStatus === 'Submitted' &&
    siblings.some(
      (sibling) => sibling.id !== responseId && sibling.status === 'Selected for Verification',
    )
  );
}

/**
 * The stored statuses of every response on a Lost report.
 *
 * **The derivation needs the whole set, not just the selected one,** because
 * a response leaves standby the moment the selection moves — and the
 * selection can move to a *different* response, not merely away.
 */
export function siblingStatuses(
  responses: readonly SiblingResponse[],
): readonly RecoveryResponseStatus[] {
  return responses.map((response) => response.status);
}

/**
 * The status of a response read from storage, or `null` when the stored value
 * is not a canonical status.
 *
 * **A stored value the vocabulary does not name is not a status.** The
 * database's `CHECK` constraint rejects such a write, so this only guards a
 * read — and a read of an impossible value returns `null` rather than
 * inventing one.
 */
export function storedStatusOf(value: string): RecoveryResponseStatus | null {
  return isRecoveryResponseStatus(value) ? value : null;
}
