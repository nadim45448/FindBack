/**
 * The password-reset configuration, read from the environment.
 *
 * **Everything here follows the codebase's convention**: configured, not
 * hardcoded, with a chosen default, and an invalid value falls back to the
 * default rather than failing the request (ADR-15, ADR-12, ADR-17).
 *
 * **The two secrets are the exception, and deliberately so.** A missing
 * `AUTH_RESET_TOKEN_HASH_SECRET` or `AUTH_RESET_BUCKET_HASH_SECRET` is a
 * **startup failure**, not a fallback. The fallback for a missing bucket-key
 * secret would be an unkeyed digest, and an unkeyed digest is the thing
 * ADR-19 exists to forbid. A deployment that *appears* to be protected but
 * is not is worse than one that fails to start — so the failure is loud,
 * immediate, and impossible to mistake for working protection.
 *
 * **The two secrets are distinct**, and neither is derived from
 * `SESSION_SECRET`. Deriving one from another couples their rotation
 * schedules for no security gain, and the reset flow should survive a
 * session-secret rotation without invalidating outstanding reset tokens.
 *
 * Pure — no I/O, no framework imports.
 */

/** The reset flow's configuration. */
export interface ResetConfig {
  /** The token's lifetime, in seconds. Default 3600 (1 hour). */
  readonly tokenLifetimeSeconds: number;
  /**
   * The minimum response time, in milliseconds. Default 250.
   *
   * The anti-enumeration floor (ADR-18). Applied on **every** path,
   * including the rate-limited one.
   */
  readonly minResponseMs: number;
  /** The IP bucket's limit. Default 5. */
  readonly ipLimit: number;
  /** The IP bucket's window, in seconds. Default 3600. */
  readonly ipWindowSeconds: number;
  /** The email bucket's limit. Default 3. */
  readonly emailLimit: number;
  /** The email bucket's window, in seconds. Default 3600. */
  readonly emailWindowSeconds: number;
  /** The timing tolerance the acceptance test asserts, in milliseconds. */
  readonly timingToleranceMs: number;
}

/** The defaults ADR-17 and ADR-18 chose. */
export const DEFAULT_RESET_CONFIG: ResetConfig = {
  // 1 hour — the owner's decision, exposed as configuration.
  tokenLifetimeSeconds: 3600,

  // Comfortably above Argon2id's ~81 ms, so the sleep is usually a no-op.
  minResponseMs: 250,

  // A campus has many members behind one address, so the IP limit is loose.
  ipLimit: 5,
  ipWindowSeconds: 3600,

  // Three resets for one address in an hour is not a legitimate pattern.
  emailLimit: 3,
  emailWindowSeconds: 3600,

  // Roughly the run-to-run variance of an Argon2id verification.
  timingToleranceMs: 100,
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
 * Read the reset configuration from the environment.
 *
 * The `env` parameter exists so a test can supply its own configuration
 * without mutating `process.env`.
 */
export function readResetConfig(
  env: Record<string, string | undefined> = process.env,
): ResetConfig {
  return {
    tokenLifetimeSeconds:
      readPositiveInt(env.AUTH_RESET_TOKEN_TTL_SECONDS) ??
      DEFAULT_RESET_CONFIG.tokenLifetimeSeconds,
    minResponseMs:
      readPositiveInt(env.AUTH_RESET_MIN_RESPONSE_MS) ?? DEFAULT_RESET_CONFIG.minResponseMs,
    ipLimit: readPositiveInt(env.AUTH_RATE_RESET_IP_LIMIT) ?? DEFAULT_RESET_CONFIG.ipLimit,
    ipWindowSeconds:
      readPositiveInt(env.AUTH_RATE_RESET_IP_WINDOW_SECONDS) ??
      DEFAULT_RESET_CONFIG.ipWindowSeconds,
    emailLimit:
      readPositiveInt(env.AUTH_RATE_RESET_EMAIL_LIMIT) ?? DEFAULT_RESET_CONFIG.emailLimit,
    emailWindowSeconds:
      readPositiveInt(env.AUTH_RATE_RESET_EMAIL_WINDOW_SECONDS) ??
      DEFAULT_RESET_CONFIG.emailWindowSeconds,
    timingToleranceMs:
      readPositiveInt(env.AUTH_RESET_TIMING_TOLERANCE_MS) ??
      DEFAULT_RESET_CONFIG.timingToleranceMs,
  };
}

/**
 * The reset token's hashing secret.
 *
 * **Required.** A missing secret is a startup failure, because without it no
 * token can be hashed or looked up — and an unkeyed fallback would silently
 * downgrade the property the key exists to provide.
 */
export function readResetTokenHashSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env.AUTH_RESET_TOKEN_HASH_SECRET;

  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'AUTH_RESET_TOKEN_HASH_SECRET is not set. It keys the reset token digest, and a missing key cannot fall back to an unkeyed digest.',
    );
  }

  return secret;
}

/**
 * The rate-limit bucket key's secret.
 *
 * **Required.** A missing secret is a startup failure, because the fallback
 * would be a plaintext address in the counter table — which is precisely the
 * disclosure ADR-19 exists to prevent.
 */
export function readResetBucketHashSecret(
  env: Record<string, string | undefined> = process.env,
): string {
  const secret = env.AUTH_RESET_BUCKET_HASH_SECRET;

  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'AUTH_RESET_BUCKET_HASH_SECRET is not set. It keys the rate-limit bucket digest, and a missing key would leave the counter table as a list of addresses.',
    );
  }

  return secret;
}
