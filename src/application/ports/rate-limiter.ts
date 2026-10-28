/**
 * The rate-limiter port.
 *
 * **A shared port** (ADR-15). The limiter will serve every rate-limited
 * route in the system, not just the identity ones, so it lives in the shared
 * `application/ports/` directory.
 *
 * The port decides nothing about *which* limits apply — that is the caller's
 * configuration. The port owns the mechanism: count the attempts in the
 * current window, and report whether this one is allowed.
 */

/** The decision a rate-limit check produced. */
export interface RateLimitDecision {
  /** Whether the request may proceed. */
  readonly allowed: boolean;
  /** The attempts left in the current window. Never negative. */
  readonly remaining: number;
  /** How long until the window resets, in seconds. */
  readonly retryAfterSeconds: number;
}

/**
 * Counts attempts in a fixed window.
 *
 * The counter lives in the database, not in memory: the runtime is
 * horizontally scaled and ephemeral, so an in-memory counter would be
 * per-instance and would not limit anything while appearing to (ADR-15).
 */
export interface RateLimiter {
  /**
   * Count one attempt against a bucket and report whether it is allowed.
   *
   * **A refused attempt still increments the counter.** A caller that is
   * being throttled must not be able to probe for the limit by watching
   * which attempts are refused — the counter measures *attempts*, which is
   * what costs the server.
   */
  consume(bucketKey: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}
