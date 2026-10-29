/**
 * The report's exact place — free text, ≤ 200 characters.
 *
 * **An FR-37 Sensitive Field.** Optional. It is the precise location, and it
 * is **never** stored in the campus-area field — the two are different facts,
 * and conflating them is what FR-39's `campusArea` (public) / `exactPlace`
 * (Sensitive) split forbids.
 *
 * Pure — no I/O, no framework imports.
 */

import { buildOptionalBoundedText, type BoundedText } from './bounded-text';

/** The inclusive maximum length of an exact place. */
export const EXACT_PLACE_MAX_LENGTH = 200;

/**
 * A report's exact place. A Sensitive Field.
 *
 * **Branded, so an exact place and any other bounded text are not
 * interchangeable.** It shares its shape with the identifying details and
 * the description; only the brand tells them apart.
 */
export type ExactPlace = BoundedText<'exactPlace'>;

/**
 * Build a report's exact place.
 *
 * @throws {ValidationError} when the value is longer than 200 characters.
 */
export function createExactPlace(value: string | null | undefined): ExactPlace | null {
  return buildOptionalBoundedText(
    'exactPlace',
    value,
    EXACT_PLACE_MAX_LENGTH,
    'The exact place must be 200 characters or fewer.',
    'exactPlace',
  );
}
