/**
 * The `EmailAddress` value object.
 *
 * **Normalized to trimmed lower-case before the uniqueness check**, so a
 * duplicate differing only in case is a duplicate and an address with
 * leading or trailing whitespace is the same address as the trimmed one
 * (story 001's edge cases).
 *
 * The normalization happens here, once, so no caller can accidentally skip
 * it. The database's functional unique index on `lower(btrim(email))` is the
 * final arbiter against a concurrent-registration race, which no
 * application-level check can be.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** The longest address the value object accepts. */
export const MAX_EMAIL_LENGTH = 254;

/** The email address, normalized. */
export interface EmailAddress {
  readonly value: string;
}

/**
 * Normalize an email address: trim, then lower-case.
 *
 * Exported separately so the normalization rule is one implementation, used
 * by the value object and by the login path's lookup.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Build a normalized email address.
 *
 * @throws {ValidationError} when the address is empty or too long. The
 * deeper shape check — an `@`, a dot — happens at the route boundary, where
 * the request's field names are known; a value object has no field to
 * attribute a failure to.
 */
export function createEmailAddress(raw: string): EmailAddress {
  const normalized = normalizeEmail(raw);

  if (normalized.length === 0) {
    throw new ValidationError('email', 'An email address is required.');
  }

  if (normalized.length > MAX_EMAIL_LENGTH) {
    throw new ValidationError(
      'email',
      `An email address must be at most ${MAX_EMAIL_LENGTH} characters.`,
    );
  }

  return { value: normalized };
}

/**
 * A rough shape check for an email address.
 *
 * Deliberately not a full RFC 5322 parser: the requirement is that a
 * plausible address is accepted and an obviously-wrong one is refused, and
 * a full parser rejects valid addresses more often than it catches typos.
 */
export function isPlausibleEmailShape(raw: string): boolean {
  const normalized = normalizeEmail(raw);

  if (normalized.length === 0 || normalized.length > MAX_EMAIL_LENGTH) {
    return false;
  }

  const atIndex = normalized.indexOf('@');

  if (atIndex <= 0 || atIndex !== normalized.lastIndexOf('@')) {
    return false;
  }

  const domain = normalized.slice(atIndex + 1);

  if (domain.length === 0 || !domain.includes('.')) {
    return false;
  }

  // A domain may not start or end with a dot, and may not have two in a row.
  if (domain.startsWith('.') || domain.endsWith('..') || domain.includes('..')) {
    return false;
  }

  // No whitespace anywhere.
  return !/\s/.test(normalized);
}
