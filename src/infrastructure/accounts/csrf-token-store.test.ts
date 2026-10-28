/**
 * The CSRF-token validator's tests.
 *
 * The token is an HMAC over the session's token hash, so it is **bound to
 * the session** — a token minted for one session is useless in another.
 */

import { describe, expect, it } from 'vitest';

import { CSRF_HEADER_NAME, HmacCsrfTokenValidator } from './csrf-token-store';

const SECRET = 'a-test-secret-that-is-long-enough-32';

describe('the CSRF token validator', () => {
  const validator = new HmacCsrfTokenValidator(SECRET);

  it('names the header the token arrives in', () => {
    expect(CSRF_HEADER_NAME).toBe('x-csrf-token');
  });

  it('accepts the token it computed for a session', () => {
    const tokenHash = 'a'.repeat(64);
    const token = validator.computeToken(tokenHash);

    expect(validator.validate(tokenHash, token).valid).toBe(true);
  });

  it('refuses a token computed for a different session', () => {
    // The token is bound to the session, so a token lifted from one session
    // does not work against another.
    const token = validator.computeToken('a'.repeat(64));

    expect(validator.validate('b'.repeat(64), token).valid).toBe(false);
  });

  it('refuses a missing token', () => {
    expect(validator.validate('a'.repeat(64), null).valid).toBe(false);
  });

  it('refuses a missing session', () => {
    const token = validator.computeToken('a'.repeat(64));

    expect(validator.validate(null, token).valid).toBe(false);
  });

  it('refuses a garbage token', () => {
    expect(validator.validate('a'.repeat(64), 'not-the-token').valid).toBe(false);
  });

  it('computes the same token for the same session', () => {
    // The token is derived, not stored, so there is nothing to clean up.
    expect(validator.computeToken('a'.repeat(64))).toBe(validator.computeToken('a'.repeat(64)));
  });

  it('computes a different token for a different secret', () => {
    const other = new HmacCsrfTokenValidator('a-different-secret-long-enough-32');

    expect(validator.computeToken('a'.repeat(64))).not.toBe(other.computeToken('a'.repeat(64)));
  });
});
