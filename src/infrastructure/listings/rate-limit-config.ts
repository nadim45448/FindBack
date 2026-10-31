/**
 * The listings rate limits, read from the environment (ADR-15).
 *
 * **The same convention the identity module's limits follow:** the numbers
 * below are the defaults, and an operator can change any of them per
 * environment without a code change. A malformed value falls back rather
 * than failing — a bad environment variable should not take the reporting
 * endpoints down, and the fallback is the ADR's own value, so the safe
 * behaviour is the documented behaviour.
 *
 * **The Claim bucket is keyed by member, not by IP.** A claim submission is
 * an authenticated, per-member operation: a campus NAT puts many members
 * behind one address, so an IP bucket would throttle one member's claims
 * because a hundred others had claimed. The member's own bucket is the one
 * that measures what the limit is for.
 *
 * **The limit is generous.** FR-15's rule that one member may hold one
 * `Pending` Claim per item is the *structural* bound; the rate limit is the
 * coarse bound on how fast a member may submit claims at all, and a member
 * claiming several items in a session must not be caught by it.
 *
 * Pure — no I/O, no framework imports.
 */

/** The rate limits the listings routes enforce. */
export interface ListingsRateLimitConfig {
  /** The Claim bucket's limit — `claim:member:<actorId>`. */
  readonly claimLimit: number;
  /** The Claim bucket's window, in seconds. */
  readonly claimWindowSeconds: number;
  /** The thread-message bucket's limit — `thread-message:member:<actorId>`. */
  readonly threadMessageLimit: number;
  /** The thread-message bucket's window, in seconds. */
  readonly threadMessageWindowSeconds: number;
  /** The Recovery Response bucket's limit — `recovery-response:member:<actorId>`. */
  readonly recoveryResponseLimit: number;
  /** The Recovery Response bucket's window, in seconds. */
  readonly recoveryResponseWindowSeconds: number;
}

/** The defaults ADR-15 chose for the Claim bucket. */
export const DEFAULT_LISTINGS_RATE_LIMIT_CONFIG: ListingsRateLimitConfig = {
  // Twenty claims an hour per member. Generous enough for a member claiming
  // several items in one session, tight enough that the endpoint is not a
  // write amplifier.
  claimLimit: 20,
  claimWindowSeconds: 60 * 60,
  // **Thirty messages an hour per member.** The thread is a conversation,
  // and a conversation needs more room than a claim submission — but it is
  // still a write to a shared table, so the bucket is keyed by member and
  // the limit is finite.
  threadMessageLimit: 30,
  threadMessageWindowSeconds: 60 * 60,
  // **Twenty recovery responses an hour per member**, mirroring the Claim
  // bucket. A Recovery Response is the Lost-side mirror of a Claim — one
  // write to a shared table, by a member, at a bounded rate — and a member
  // responding to several lost items in one session must not be caught by
  // it.
  recoveryResponseLimit: 20,
  recoveryResponseWindowSeconds: 60 * 60,
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
 * Read the listings rate limits from the environment.
 *
 * The `env` parameter exists so a test can supply its own configuration
 * without mutating `process.env`.
 */
export function readListingsRateLimitConfig(
  env: Record<string, string | undefined> = process.env,
): ListingsRateLimitConfig {
  return {
    claimLimit:
      readPositiveInt(env.CLAIMS_RATE_LIMIT) ?? DEFAULT_LISTINGS_RATE_LIMIT_CONFIG.claimLimit,
    claimWindowSeconds:
      readPositiveInt(env.CLAIMS_RATE_WINDOW_SECONDS) ??
      DEFAULT_LISTINGS_RATE_LIMIT_CONFIG.claimWindowSeconds,
    threadMessageLimit:
      readPositiveInt(env.THREAD_MESSAGES_RATE_LIMIT) ??
      DEFAULT_LISTINGS_RATE_LIMIT_CONFIG.threadMessageLimit,
    threadMessageWindowSeconds:
      readPositiveInt(env.THREAD_MESSAGES_RATE_WINDOW_SECONDS) ??
      DEFAULT_LISTINGS_RATE_LIMIT_CONFIG.threadMessageWindowSeconds,
    recoveryResponseLimit:
      readPositiveInt(env.RECOVERY_RESPONSES_RATE_LIMIT) ??
      DEFAULT_LISTINGS_RATE_LIMIT_CONFIG.recoveryResponseLimit,
    recoveryResponseWindowSeconds:
      readPositiveInt(env.RECOVERY_RESPONSES_RATE_WINDOW_SECONDS) ??
      DEFAULT_LISTINGS_RATE_LIMIT_CONFIG.recoveryResponseWindowSeconds,
  };
}
