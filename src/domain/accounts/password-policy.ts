/**
 * The `PasswordHash` value object and the password policy.
 *
 * The hash is constructed **only** by the hasher. It is never logged, never
 * audited, and never returned by a repository read path. Equality is not
 * meaningful — a hash is compared by verifying a candidate password against
 * it, never by comparing two hash strings.
 *
 * The **policy** lives here rather than in the route handler, because the
 * policy is a rule about what a password may be — a domain fact — while the
 * route handler's job is to attribute a failure to a field.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** The minimum password length. */
export const MIN_PASSWORD_LENGTH = 8;

/** The maximum password length. */
export const MAX_PASSWORD_LENGTH = 200;

/** The password hash, as the hasher encoded it. */
export interface PasswordHash {
  readonly value: string;
}

/**
 * Build a password hash from an encoded value.
 *
 * The only legitimate caller is the hasher's `hash` method. A repository
 * read path also produces one, from a value already in the database.
 */
export function createPasswordHash(encoded: string): PasswordHash {
  if (encoded.length === 0) {
    throw new ValidationError('passwordHash', 'A password hash is required.');
  }

  return { value: encoded };
}

/**
 * The outcome of evaluating a password against the policy.
 *
 * A discriminated union rather than a list of strings, so a caller cannot
 * render a failure it did not receive.
 */
export type PasswordPolicyResult =
  { readonly ok: true } | { readonly ok: false; readonly reason: PasswordPolicyFailure };

/** Why a password failed the policy. */
export type PasswordPolicyFailure = 'tooShort' | 'tooLong' | 'noLetter' | 'noNumber';

/**
 * Evaluate a password against the policy.
 *
 * The policy is the PRD's: **at least 8 characters, at least one letter, at
 * least one number** (FR-1, and the `EXPERIENCE.md` §9.3 client hint).
 *
 * The result is returned rather than thrown, because the route boundary
 * needs to name the specific failure in its error copy.
 */
export function evaluatePasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: 'tooShort' };
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: 'tooLong' };
  }

  if (!/[a-zA-Z]/.test(password)) {
    return { ok: false, reason: 'noLetter' };
  }

  if (!/[0-9]/.test(password)) {
    return { ok: false, reason: 'noNumber' };
  }

  return { ok: true };
}

/**
 * Enforce the policy, throwing on failure.
 *
 * @throws {ValidationError} when the password fails the policy.
 */
export function assertPasswordPolicy(password: string): void {
  const result = evaluatePasswordPolicy(password);

  if (result.ok) {
    return;
  }

  const messages: Record<PasswordPolicyFailure, string> = {
    tooShort: `Your password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    tooLong: `Your password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    noLetter: 'Your password must contain at least one letter.',
    noNumber: 'Your password must contain at least one number.',
  };

  throw new ValidationError('password', messages[result.reason]);
}
