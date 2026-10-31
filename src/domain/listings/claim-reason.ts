/**
 * The Claim's reason — free text, 20–1000 characters.
 *
 * **Required, and an FR-37 Sensitive Field.** The reason is the claimant's
 * own account of *why the item is theirs*; it is the one field on the Claim
 * that is never shown to the Found-report owner (FR-39's `claimant`
 * projection). It is not optional: a Claim with no reason asserts nothing.
 *
 * **This is a different value object from the report's identifying details.**
 * The report's identifying details are optional and capped at 500
 * characters; the Claim's are required, floored at 10, and capped at 500.
 * Reusing the report's object would silently accept an empty Claim and would
 * make the two fields interchangeable in a type that keeps them apart —
 * FR-37 treats them as different fields with different visibility.
 *
 * **The bounds are inclusive at both ends.** The story's edge cases are
 * explicit: "Reason of exactly 20 characters | Accepted" and "Identifying
 * details of exactly 10 characters | Accepted".
 *
 * Pure — no I/O, no framework imports.
 */

import { buildBoundedText, type BoundedText } from './bounded-text';

/** The inclusive minimum length of a Claim's reason. */
export const CLAIM_REASON_MIN_LENGTH = 20;

/** The inclusive maximum length of a Claim's reason. */
export const CLAIM_REASON_MAX_LENGTH = 1000;

/**
 * A Claim's reason. A Sensitive Field.
 *
 * **Branded, so a reason and any other bounded text are not
 * interchangeable.**
 */
export type ClaimReason = BoundedText<'claimReason'>;

/**
 * Build a Claim's reason.
 *
 * @throws {ValidationError} when the value is shorter than 20 or longer than
 * 1000 characters. **Whitespace-only is rejected**, because the minimum
 * length is not met by whitespace.
 */
export function createClaimReason(value: string): ClaimReason {
  return buildBoundedText(
    'reason',
    value,
    CLAIM_REASON_MIN_LENGTH,
    CLAIM_REASON_MAX_LENGTH,
    'The reason must be between 20 and 1000 characters.',
    'claimReason',
  );
}
