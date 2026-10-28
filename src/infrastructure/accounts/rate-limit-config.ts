/**
 * The rate limits, read from the environment (ADR-15).
 *
 * ADR-15 says the limits are **configured, not hardcoded, with the chosen
 * values as defaults**. This module is where that promise is kept: the
 * numbers below are the defaults the ADR chose, and an operator can change
 * any of them per environment without a code change.
 *
 * **Why the limits are separate values rather than one number.** The login
 * path has **two** buckets — one by IP and one by normalized email — and the
 * route requires **both** to pass. The IP bucket must be loose enough for a
 * campus NAT to work; the email bucket must be tight enough that one
 * account's failures are individually meaningful.
 *
 * **Why an invalid value falls back rather than failing.** A malformed
 * environment variable should not take the identity endpoints down. The
 * fallback is the ADR's own value, so the safe behaviour is the documented
 * behaviour — and the same convention the Argon2id parameters already use.
 *
 * Pure — no I/O, no framework imports.
 */

/** The rate limits the identity routes enforce. */
export interface RateLimitConfig {
  /** The registration bucket's limit — `register:ip:<ip>`. */
  readonly registerLimit: number;
  /** The registration bucket's window, in seconds. */
  readonly registerWindowSeconds: number;
  /** The login IP bucket's limit — `login:ip:<ip>`. */
  readonly loginIpLimit: number;
  /** The login IP bucket's window, in seconds. */
  readonly loginIpWindowSeconds: number;
  /** The login email bucket's limit — `login:email:<email>`. */
  readonly loginEmailLimit: number;
  /** The login email bucket's window, in seconds. */
  readonly loginEmailWindowSeconds: number;
}

/** The defaults ADR-15 chose. */
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  // Account creation is the most valuable thing an attacker can do here.
  registerLimit: 5,
  registerWindowSeconds: 60 * 60,

  // A campus has many members behind one address, so the IP limit is loose.
  loginIpLimit: 20,
  loginIpWindowSeconds: 15 * 60,

  // One account's failures are individually meaningful.
  loginEmailLimit: 10,
  loginEmailWindowSeconds: 15 * 60,
};

/**
 * Parse a positive integer from the environment.
 *
 * Anything that is not a positive integer — absent, blank, non-numeric, zero,
 * or negative — yields `null`, and the caller uses the default.
 */
function readPositiveInt(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') {
    return null;
  }

  const parsed = Number(raw);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Read the rate limits from the environment.
 *
 * The `env` parameter exists so a test can supply its own configuration
 * without mutating `process.env`.
 */
export function readRateLimitConfig(
  env: Record<string, string | undefined> = process.env,
): RateLimitConfig {
  return {
    registerLimit:
      readPositiveInt(env.AUTH_RATE_REGISTER_LIMIT) ?? DEFAULT_RATE_LIMIT_CONFIG.registerLimit,
    registerWindowSeconds:
      readPositiveInt(env.AUTH_RATE_REGISTER_WINDOW_SECONDS) ??
      DEFAULT_RATE_LIMIT_CONFIG.registerWindowSeconds,
    loginIpLimit:
      readPositiveInt(env.AUTH_RATE_LOGIN_IP_LIMIT) ?? DEFAULT_RATE_LIMIT_CONFIG.loginIpLimit,
    loginIpWindowSeconds:
      readPositiveInt(env.AUTH_RATE_LOGIN_IP_WINDOW_SECONDS) ??
      DEFAULT_RATE_LIMIT_CONFIG.loginIpWindowSeconds,
    loginEmailLimit:
      readPositiveInt(env.AUTH_RATE_LOGIN_EMAIL_LIMIT) ?? DEFAULT_RATE_LIMIT_CONFIG.loginEmailLimit,
    loginEmailWindowSeconds:
      readPositiveInt(env.AUTH_RATE_LOGIN_EMAIL_WINDOW_SECONDS) ??
      DEFAULT_RATE_LIMIT_CONFIG.loginEmailWindowSeconds,
  };
}
