/**
 * The database-backed rate limiter.
 *
 * **Why the database and not memory** (ADR-15): the runtime is Vercel's
 * Fluid Compute, which is horizontally scaled and ephemeral. An in-memory
 * counter would be per-instance, reset on every cold start, and would not
 * count across concurrent instances — it would provide no meaningful limit
 * at all while appearing to. And a hosted limiter is a paid add-on, against
 * a hard $0 ceiling.
 *
 * **The increment and the decision are one statement.** The unique
 * constraint on `(bucketKey, windowStart)` is what makes
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` atomic: two concurrent
 * requests for the same bucket cannot both read the same count and both be
 * allowed, because there is no read at all — the statement does the
 * increment and returns the new value.
 *
 * **A refused attempt still increments.** The counter measures *attempts*,
 * which is what costs the server. If refusals did not count, a caller being
 * throttled could probe for the limit.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { RateLimitDecision, RateLimiter } from '@/application/ports/rate-limiter';

/** The row shape the counter table returns. */
interface CounterRow {
  count: number;
}

/** Prisma's rate limiter. */
export class DatabaseRateLimiter implements RateLimiter {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Count one attempt against a bucket and report whether it is allowed.
   *
   * The window is **fixed**, not sliding: it starts at the first attempt in
   * the bucket and lasts `windowSeconds`. The known consequence is that up
   * to 2× the limit can pass across a window boundary, which is acceptable
   * because the limits carry generous headroom relative to legitimate
   * traffic and the purpose is to bound abuse cost, not to enforce a precise
   * quota.
   */
  async consume(
    bucketKey: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitDecision> {
    const now = new Date();
    const windowStart = startOfWindow(now, windowSeconds);
    const windowEnd = new Date(windowStart.getTime() + windowSeconds * 1000);

    // One statement: increment and read the new value. No read-then-write
    // race is possible, because there is no read.
    const rows = await this.client.$queryRaw<CounterRow[]>(Prisma.sql`
      INSERT INTO "RateLimitCounter" ("id", "bucketKey", "windowStart", "count")
      VALUES (gen_random_uuid(), ${bucketKey}, ${windowStart}, 1)
      ON CONFLICT ("bucketKey", "windowStart")
      DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
      RETURNING "count"
    `);

    const count = rows[0]?.count ?? 1;
    const allowed = count <= limit;
    const retryAfterSeconds = Math.max(0, Math.ceil((windowEnd.getTime() - now.getTime()) / 1000));

    return {
      allowed,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  }
}

/**
 * The start of the fixed window a moment falls into.
 *
 * The window is aligned to the epoch, so every request for the same bucket
 * computes the **same** `windowStart` — which is what makes the unique
 * constraint meaningful. An unaligned window (one that started at the first
 * attempt) would give concurrent requests different window starts and
 * defeat the constraint.
 */
function startOfWindow(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;

  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}
