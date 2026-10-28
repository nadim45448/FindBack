/**
 * The CSRF-token validator.
 *
 * The token is an **HMAC over the session's token hash**, keyed by
 * `SESSION_SECRET`. That gives three properties without a per-request store
 * or a table:
 *
 * - the token is **bound to the session**, so a token minted for one
 *   session is useless in another;
 * - there is **nothing to clean up** — the token is derived, not stored;
 * - and the validation is a **constant-time** comparison.
 *
 * **This is the design's weakest point, and it is recorded as such**: the
 * token is valid for the session's life rather than for a single request.
 * The PRD's requirement — a CSRF token on every state-changing request — is
 * met, and the trade-off is stated rather than hidden.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  CSRFTokenValidator,
  CsrfValidationResult,
} from '@/application/ports/csrf-token-validator';

/** The header the CSRF token arrives in. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** The HMAC-based CSRF validator. */
export class HmacCsrfTokenValidator implements CSRFTokenValidator {
  constructor(private readonly secret: string) {}

  /**
   * Validate a token against a session's token hash.
   *
   * A missing session or a missing token is **invalid**, not an error: a
   * refusal is an expected outcome, not a failure.
   */
  validate(sessionTokenHash: string | null, csrfToken: string | null): CsrfValidationResult {
    if (!sessionTokenHash || !csrfToken) {
      return { valid: false };
    }

    const expected = this.computeToken(sessionTokenHash);

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(csrfToken, 'utf8');

    if (expectedBuffer.length !== providedBuffer.length) {
      return { valid: false };
    }

    return { valid: timingSafeEqual(expectedBuffer, providedBuffer) };
  }

  /**
   * The CSRF token for a session.
   *
   * The token is derived from the session's token hash, so it is stable for
   * the session's life and carries no secret of its own.
   */
  computeToken(sessionTokenHash: string): string {
    return createHmac('sha256', this.secret).update(sessionTokenHash).digest('hex');
  }
}
