/**
 * The Recovery Response's where-found — an optional exact-place text of at
 * most 200 characters.
 *
 * **FR-44 splits "where the item was found" into two fields**, and this
 * module owns the second of them:
 *
 * | Field | Required | Constraint |
 * |---|---|---|
 * | Where the item was found (campus area) | **yes** | the deployment's enum |
 * | Where the item was found (exact place text) | **no** | 0–200 characters |
 *
 * The campus area is a **required** field and is validated by
 * `createCampusAreaValue` against the deployment's active set — the same
 * value object the report's own campus area uses, because it is the same
 * enumeration. This module owns only the free text.
 *
 * **The exact place is optional and may be empty.** A responder who found the
 * item in a courtyard may say "the library courtyard" and nothing more. The
 * PRD's bound of **0 characters** is what "optional" means here: the field
 * may be absent, and it may be present but blank.
 *
 * **This is an FR-37 Sensitive Field.** It is granted to the responder, the
 * Lost-report owner, and administrators — and to nobody else, and in
 * particular **not** to unrelated members and **not** to competing
 * responders. The visibility rule lives in `recovery-response-projection.ts`.
 *
 * **It is not the report's exact place.** The report's own exact place is a
 * *different* Sensitive Field belonging to the Lost-report owner — and the
 * responder must not see it, which is why the responder's own observation
 * exists as a separate field rather than as a read of the report's.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/**
 * The exact-place text's maximum length.
 *
 * **Origin:** FR-44 — "Where the item was found (exact place text) |
 * optional | string | 0-200 chars (Sensitive Field per D2)".
 */
export const RECOVERY_RESPONSE_WHERE_FOUND_MAX_LENGTH = 200;

/**
 * A Recovery Response's where-found exact-place text.
 *
 * **Branded, so a Response's observation is not interchangeable with a
 * report's own exact place.**
 */
export interface RecoveryResponseWhereFound {
  /** The exact place as written. Empty when the responder gave none. */
  readonly value: string;
  /**
   * The kind.
   *
   * **Never read, never compared, never serialized.** It exists so the
   * compiler knows which location this is.
   */
  readonly kind: 'recoveryResponseWhereFound';
}

/**
 * Validate a submitted where-found exact-place text.
 *
 * **An empty text is accepted** — the field is optional, and the PRD's bound
 * of 0 characters says so explicitly.
 *
 * @throws {ValidationError} when the text is longer than 200 characters.
 */
export function createRecoveryResponseWhereFound(
  value: string,
): RecoveryResponseWhereFound {
  const trimmed = value.trim();

  if (trimmed.length > RECOVERY_RESPONSE_WHERE_FOUND_MAX_LENGTH) {
    throw new ValidationError(
      'whereFoundExactPlace',
      'The place you found the item must be at most 200 characters.',
    );
  }

  return { value: trimmed, kind: 'recoveryResponseWhereFound' };
}
