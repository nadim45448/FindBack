/**
 * The database-backed rate limiter's tests, against the live database.
 *
 * The property that matters most is the **atomic increment**: two
 * concurrent requests for the same bucket must not both read the same count
 * and both be allowed. The unique constraint on
 * `(bucketKey, windowStart)` is what makes that true, and only a real
 * database can demonstrate it.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DatabaseRateLimiter } from './database-rate-limiter';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the rate limiter (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const limiter = new DatabaseRateLimiter(prisma);

  beforeEach(async () => {
    await prisma.rateLimitCounter.deleteMany({});
  });

  afterAll(async () => {
    await prisma.rateLimitCounter.deleteMany({});
    await prisma.$disconnect();
  });

  it('allows an attempt under the limit', async () => {
    const decision = await limiter.consume('test:bucket:a', 3, 60);

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(2);
  });

  it('refuses an attempt over the limit', async () => {
    await limiter.consume('test:bucket:b', 2, 60);
    await limiter.consume('test:bucket:b', 2, 60);

    const decision = await limiter.consume('test:bucket:b', 2, 60);

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
  });

  it('counts a refused attempt too', async () => {
    // The counter measures **attempts**, which is what costs the server. If
    // refusals did not count, a caller being throttled could probe for the
    // limit by watching which attempts are refused.
    await limiter.consume('test:bucket:c', 1, 60);
    await limiter.consume('test:bucket:c', 1, 60);

    const rows = await prisma.rateLimitCounter.findMany({
      where: { bucketKey: 'test:bucket:c' },
    });

    expect(rows[0]?.count).toBe(2);
  });

  it('keeps separate buckets separate', async () => {
    await limiter.consume('test:bucket:d', 1, 60);
    const other = await limiter.consume('test:bucket:e', 1, 60);

    expect(other.allowed).toBe(true);
  });

  it('reports a retry-after inside the window', async () => {
    const decision = await limiter.consume('test:bucket:f', 1, 60);

    expect(decision.retryAfterSeconds).toBeGreaterThan(0);
    expect(decision.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('does not lose a count under concurrency', async () => {
    // The increment and the decision are one statement, so concurrent
    // requests cannot both read the same count. Twenty concurrent attempts
    // against a limit of ten must produce exactly ten allowances.
    const decisions = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume('test:bucket:race', 10, 60)),
    );

    const allowed = decisions.filter((decision) => decision.allowed).length;

    expect(allowed).toBe(10);

    const rows = await prisma.rateLimitCounter.findMany({
      where: { bucketKey: 'test:bucket:race' },
    });

    expect(rows[0]?.count).toBe(20);
  });
});
