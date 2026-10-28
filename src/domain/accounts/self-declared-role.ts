/**
 * The `SelfDeclaredRole` value object.
 *
 * A self-declared role is the member's **own description** of their
 * relationship to the organization. It is stored as entered and it **grants
 * no capability** — it is not an authorization input (story 001's edge case:
 * "Self-declared role contains free text → stored as entered; does not grant
 * capabilities").
 *
 * The `Other` option carries free text alongside the choice, so the choice
 * and the text are kept in **separate** columns rather than encoded in one
 * string — one column would have to encode "which of four, and what text",
 * which is a parse.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import { isSelfDeclaredRole, type SelfDeclaredRole } from './account-status';

/** The longest free text the `Other` role may carry. */
export const MAX_ROLE_OTHER_LENGTH = 100;

/** The self-declared role, with the free text for the `Other` option. */
export interface SelfDeclaredRoleValue {
  readonly role: SelfDeclaredRole;
  /** The free text. Present only for the `Other` option. */
  readonly otherText: string | null;
}

/**
 * Build a self-declared role.
 *
 * @throws {ValidationError} when the role is not one of the four PRD
 * options, or when the `Other` option's free text is missing or too long.
 */
export function createSelfDeclaredRole(
  role: string,
  otherText?: string | null,
): SelfDeclaredRoleValue {
  if (!isSelfDeclaredRole(role)) {
    throw new ValidationError(
      'selfDeclaredRole',
      'Choose one of: Student, Employee, Visitor, Other.',
    );
  }

  if (role !== 'Other') {
    return { role, otherText: null };
  }

  const text = (otherText ?? '').trim();

  if (text.length === 0) {
    throw new ValidationError(
      'selfDeclaredRoleOther',
      'Tell us what your role is, or choose another option.',
    );
  }

  if (text.length > MAX_ROLE_OTHER_LENGTH) {
    throw new ValidationError(
      'selfDeclaredRoleOther',
      `Your role must be at most ${MAX_ROLE_OTHER_LENGTH} characters.`,
    );
  }

  return { role, otherText: text };
}
