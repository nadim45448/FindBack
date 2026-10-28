/**
 * The `DisplayName` value object.
 *
 * **Unicode-tolerant and length-bounded.** A member's name is accepted as
 * entered (story 001's edge case) — it is not transliterated, title-cased,
 * or otherwise rewritten, because a name is a person's own spelling of
 * themselves.
 *
 * The bound exists because the name is rendered on administrator surfaces
 * and carried on an audit record; an unbounded string is a denial-of-service
 * vector against those surfaces.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** The shortest display name accepted. */
export const MIN_DISPLAY_NAME_LENGTH = 1;

/** The longest display name accepted. */
export const MAX_DISPLAY_NAME_LENGTH = 200;

/** The member's display name. */
export interface DisplayName {
  readonly value: string;
}

/**
 * Build a display name.
 *
 * The value is trimmed and the internal whitespace is collapsed, so a name
 * typed with stray spaces renders as the member typed it without the stray
 * spaces.
 *
 * @throws {ValidationError} when the name is empty or too long.
 */
export function createDisplayName(raw: string): DisplayName {
  const value = raw.trim().replace(/\s+/g, ' ');

  if (value.length < MIN_DISPLAY_NAME_LENGTH) {
    throw new ValidationError('displayName', 'A name is required.');
  }

  if (value.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ValidationError(
      'displayName',
      `A name must be at most ${MAX_DISPLAY_NAME_LENGTH} characters.`,
    );
  }

  return { value };
}
