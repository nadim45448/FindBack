/**
 * The Recovery Response's observed identifying details — 10–500 characters.
 *
 * **What the responder saw from outside the item.** FR-44 makes this a
 * *required* field of 10–500 characters, and the PRD's own example is a
 * description of what was visible without handling the item: *"brown leather,
 * zip closure, scuffed on the back corner"*.
 *
 * **This is an FR-37 Sensitive Field.** It is the responder's own observation,
 * and it is granted to the responder, the Lost-report owner, and
 * administrators — and to nobody else. The visibility rule lives in
 * `recovery-response-projection.ts`; this module only holds the value.
 *
 * **The bounds are the PRD's, verbatim** (coding-standards § Naming
 * conventions). Both ends are **inclusive**: a detail of exactly 10
 * characters is accepted and one of 11 is not.
 *
 * **It is a separate value object from the Claim's identifying details.** A
 * Claim's identifying details describe an item the claimant *owns*; a
 * Response's describe an item the responder *observed*. The two workflows are
 * deliberately kept apart (PRD §1, §4.4, §4.12), and their evidence is not
 * interchangeable — a type that let them be swapped would let a Claim's
 * ownership claim be submitted as a Response's observation.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/**
 * The observed identifying details' minimum length.
 *
 * **Origin:** FR-44 — "Observed identifying details | yes | string | 10-500
 * chars".
 */
export const RECOVERY_RESPONSE_OBSERVED_DETAILS_MIN_LENGTH = 10;

/**
 * The observed identifying details' maximum length.
 *
 * **Origin:** FR-44 — the same row.
 */
export const RECOVERY_RESPONSE_OBSERVED_DETAILS_MAX_LENGTH = 500;

/**
 * A Recovery Response's observed identifying details.
 *
 * **Branded, so a Response's observation is not interchangeable with a
 * Claim's identifying details.**
 */
export interface RecoveryResponseObservedDetails {
  /** The details as written. */
  readonly value: string;
  /**
   * The kind.
   *
   * **Never read, never compared, never serialized.** It exists so the
   * compiler knows which evidence this is.
   */
  readonly kind: 'recoveryResponseObservedDetails';
}

/**
 * Validate a submitted set of observed identifying details.
 *
 * @throws {ValidationError} when the details are missing, shorter than 10
 * characters, or longer than 500.
 */
export function createRecoveryResponseObservedDetails(
  value: string,
): RecoveryResponseObservedDetails {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(
      'observedIdentifyingDetails',
      'Describe the identifying details you noticed.',
    );
  }

  if (trimmed.length < RECOVERY_RESPONSE_OBSERVED_DETAILS_MIN_LENGTH) {
    throw new ValidationError(
      'observedIdentifyingDetails',
      'The identifying details must be at least 10 characters.',
    );
  }

  if (trimmed.length > RECOVERY_RESPONSE_OBSERVED_DETAILS_MAX_LENGTH) {
    throw new ValidationError(
      'observedIdentifyingDetails',
      'The identifying details must be at most 500 characters.',
    );
  }

  return { value: trimmed, kind: 'recoveryResponseObservedDetails' };
}
