/**
 * The report's identifying details — free text, ≤ 500 characters.
 *
 * **An FR-37 Sensitive Field.** Optional. It describes the item so its owner
 * can recognise it.
 *
 * Pure — no I/O, no framework imports.
 */

import { buildOptionalBoundedText, type BoundedText } from './bounded-text';

/** The inclusive maximum length of identifying details. */
export const IDENTIFYING_DETAILS_MAX_LENGTH = 500;

/**
 * A report's identifying details. A Sensitive Field.
 *
 * **Branded, so identifying details and any other bounded text are not
 * interchangeable.**
 */
export type IdentifyingDetails = BoundedText<'identifyingDetails'>;

/**
 * Build a report's identifying details.
 *
 * @throws {ValidationError} when the value is longer than 500 characters.
 */
export function createIdentifyingDetails(
  value: string | null | undefined,
): IdentifyingDetails | null {
  return buildOptionalBoundedText(
    'identifyingDetails',
    value,
    IDENTIFYING_DETAILS_MAX_LENGTH,
    'The identifying details must be 500 characters or fewer.',
    'identifyingDetails',
  );
}
