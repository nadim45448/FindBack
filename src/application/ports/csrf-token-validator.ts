/**
 * The CSRF-token validation port.
 *
 * A CSRF token is required on **every** state-changing request
 * (coding-standards § Security coding rules; PRD §10).
 *
 * The token is an HMAC over the session's token hash, keyed by
 * `SESSION_SECRET`. That means:
 *
 * - there is **no per-request store** and no table to clean up;
 * - the token is **bound to the session**, so a token minted for one session
 *   is useless in another;
 * - and the validation is a constant-time comparison.
 *
 * The design records this as its **weakest point**: the token is valid for
 * the session's life rather than for a single request. The PRD's
 * requirement — a CSRF token on every state-changing request — is met, and
 * the trade-off is stated rather than hidden.
 */

/** The outcome of validating a CSRF token. */
export interface CsrfValidationResult {
  readonly valid: boolean;
}

/**
 * Validates a CSRF token against a session.
 */
export interface CSRFTokenValidator {
  /**
   * Validate a token against a session's token hash.
   *
   * Returns a result rather than throwing, because a missing or wrong token
   * is an expected outcome — a refusal, not a failure.
   */
  validate(sessionTokenHash: string | null, csrfToken: string | null): CsrfValidationResult;
}
