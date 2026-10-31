/**
 * The Claim's identifying details — free text, 10–500 characters.
 *
 * **Required, and an FR-37 Sensitive Field.** The identifying details are
 * what prove the item is the claimant's: a serial number, a distinctive
 * mark, a worn patch. The Found-report owner never sees them (FR-39).
 *
 * **This is a different value object from the report's identifying
 * details.** The report's are optional and capped at 500; the Claim's are
 * required and floored at 10. A Claim with no identifying details asserts
 * nothing about ownership — which is why the rule is a **minimum**, not
 * merely a maximum.
 *
 * **The bound is inclusive at both ends.** The story's edge case is
 * explicit: "Identifying details of exactly 10 characters | Accepted".
 *
 * Pure — no I/O, no framework imports.
 */

import { buildBoundedText, type BoundedText } from './bounded-text';

/** The inclusive minimum length of a Claim's identifying details. */
export const CLAIM_IDENTIFYING_DETAILS_MIN_LENGTH = 10;

/** The inclusive maximum length of a Claim's identifying details. */
export const CLAIM_IDENTIFYING_DETAILS_MAX_LENGTH = 500;

/**
 * A Claim's identifying details. A Sensitive Field.
 *
 * **Branded, so the Claim's identifying details and the report's are not
 * interchangeable** — they have different bounds and different visibility.
 */
export type ClaimIdentifyingDetails = BoundedText<'claimIdentifyingDetails'>;

/**
 * Build a Claim's identifying details.
 *
 * @throws {ValidationError} when the value is shorter than 10 or longer than
 * 500 characters. **Whitespace-only is rejected.**
 */
export function createClaimIdentifyingDetails(value: string): ClaimIdentifyingDetails {
  return buildBoundedText(
    'identifyingDetails',
    value,
    CLAIM_IDENTIFYING_DETAILS_MIN_LENGTH,
    CLAIM_IDENTIFYING_DETAILS_MAX_LENGTH,
    'The identifying details must be between 10 and 500 characters.',
    'claimIdentifyingDetails',
  );
}
