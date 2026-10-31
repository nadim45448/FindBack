/**
 * The identity endpoints' performance, measured against the PRD's NFRs.
 *
 * PRD §10's cross-cutting performance budgets are:
 *
 * | Endpoint class | Budget |
 * |---|---|
 * | API response for **read** endpoints | ≤ 500 ms at p95 |
 * | API response for **write** endpoints | ≤ 1 second at p95 |
 *
 * The identity endpoints fall into both classes: `GET /api/session` and
 * `GET /api/admin/registrations` are reads; the registration, login,
 * logout, and decision endpoints are writes.
 *
 * **The dominant cost on the login path is the Argon2id verification** —
 * ADR-12 measured it at ~160 ms with the production work factors (64 MiB,
 * 3 passes). That measurement is the one that matters for the write budget,
 * so it is repeated here against the **real** work factors rather than a
 * cheap test configuration, and the p95 is measured end to end through the
 * route handler rather than through the use case.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

import { POST as registerAccountRoute } from '@/app/api/auth/register/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { GET as sessionRoute } from '@/app/api/session/route';
import { GET as queueRoute } from '@/app/api/admin/registrations/route';

import { jsonRequest, requestContext, resetRequestContext } from '@/test/identity-harness';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

/** The PRD's read budget, in milliseconds. */
const READ_BUDGET_MS = 500;

/** The PRD's write budget, in milliseconds. */
const WRITE_BUDGET_MS = 1000;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === '__Host-fb' && requestContext.sessionToken !== null
        ? { value: requestContext.sessionToken }
        : undefined,
  }),
  headers: async () => ({
    get: (name: string) => {
      if (name === 'x-forwarded-for') {
        return requestContext.clientIp;
      }

      if (name === 'x-csrf-token') {
        return requestContext.csrfToken;
      }

      if (name === 'x-request-id') {
        return requestContext.requestId;
      }

      return null;
    },
  }),
}));

describeWithDatabase('bolt 004 — the identity performance budgets', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  /** The pending registrations the queue will read. */
  const PENDING_COUNT = 200;

  let counter = 0;

  function aUniqueEmail(): string {
    counter += 1;

    return `performance-${Date.now()}-${counter}@example.org`;
  }

  const PASSWORD = 'correct horse 1';

  async function clearTables(): Promise<void> {
    await prisma.session.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.rateLimitCounter.deleteMany({});
    await clearAuditTablesForTest(prisma);
  }

  /**
   * The percentile of a sample, at the 95th.
   *
   * The sample is sorted first, so the percentile is a real percentile and
   * not an average of a maximum.
   */
  function p95(samples: number[]): number {
    const sorted = [...samples].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));

    return sorted[index] ?? 0;
  }

  /** The 50th percentile. */
  function p50(samples: number[]): number {
    const sorted = [...samples].sort((left, right) => left - right);

    return sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  }

  beforeAll(async () => {
    await clearTables();
  }, 60_000);

  beforeEach(async () => {
    resetRequestContext();
  });

  afterAll(async () => {
    await clearTables();
    await prisma.$disconnect();
  });

  it('measures the Argon2id verification against the production work factors', async () => {
    // **The real work factors** — 64 MiB, 3 passes, parallelism 1 (ADR-12).
    // A test configuration would be faster and would prove nothing about
    // the write budget.
    const stack = buildIdentityStack();

    const samples: number[] = [];
    const sampleCount = 20;

    for (let index = 0; index < sampleCount; index += 1) {
      const started = performance.now();

      await stack.authenticate.execute(aUniqueEmail(), PASSWORD);

      samples.push(performance.now() - started);
    }

    const median = p50(samples);
    const ninetyFifth = p95(samples);

    console.log(
      `Argon2id verification at the production work factors: ` +
        `p50 ${median.toFixed(1)}ms, p95 ${ninetyFifth.toFixed(1)}ms`,
    );

    // The verification alone must leave room inside the write budget for
    // the session write and the round trips.
    expect(ninetyFifth).toBeLessThan(WRITE_BUDGET_MS / 2);
  }, 120_000);

  it('answers a login within the 1 second write budget', async () => {
    // A **failing** login is the expensive one: it performs the full
    // Argon2id verification against the dummy hash, exactly as a successful
    // login does against the stored one.
    const email = aUniqueEmail();

    requestContext.clientIp = '198.51.100.1';
    await registerAccountRoute(
      jsonRequest({
        displayName: 'Jane Doe',
        email,
        password: PASSWORD,
        selfDeclaredRole: 'Student',
      }),
    );

    const samples: number[] = [];
    const sampleCount = 30;

    for (let index = 0; index < sampleCount; index += 1) {
      requestContext.clientIp = '198.51.100.2';

      const started = performance.now();

      await loginRoute(jsonRequest({ email, password: PASSWORD }));

      samples.push(performance.now() - started);
    }

    const median = p50(samples);
    const ninetyFifth = p95(samples);

    console.log(
      `Login (Argon2id + session write): p50 ${median.toFixed(1)}ms, ` +
        `p95 ${ninetyFifth.toFixed(1)}ms (budget ${WRITE_BUDGET_MS}ms)`,
    );

    expect(ninetyFifth).toBeLessThan(WRITE_BUDGET_MS);
  }, 180_000);

  it('answers a registration within the 1 second write budget', async () => {
    const samples: number[] = [];
    const sampleCount = 30;

    for (let index = 0; index < sampleCount; index += 1) {
      requestContext.clientIp = `198.51.100.${10 + index}`;

      const started = performance.now();

      await registerAccountRoute(
        jsonRequest({
          displayName: 'Jane Doe',
          email: aUniqueEmail(),
          password: PASSWORD,
          selfDeclaredRole: 'Student',
        }),
      );

      samples.push(performance.now() - started);
    }

    const median = p50(samples);
    const ninetyFifth = p95(samples);

    console.log(
      `Registration (Argon2id + account write + audit write): ` +
        `p50 ${median.toFixed(1)}ms, p95 ${ninetyFifth.toFixed(1)}ms ` +
        `(budget ${WRITE_BUDGET_MS}ms)`,
    );

    expect(ninetyFifth).toBeLessThan(WRITE_BUDGET_MS);
  }, 180_000);

  it('answers the session read within the 500 ms read budget', async () => {
    // The session read is the **hottest** path in the product: it runs on
    // every authenticated request. It performs one indexed session lookup
    // and one account lookup.
    const email = aUniqueEmail();

    requestContext.clientIp = '198.51.100.200';
    await registerAccountRoute(
      jsonRequest({
        displayName: 'Jane Doe',
        email,
        password: PASSWORD,
        selfDeclaredRole: 'Student',
      }),
    );

    const stack = buildIdentityStack();

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "accounts"
      WHERE lower(btrim("email")) = lower(btrim(${email}))
      ORDER BY CASE WHEN "status" = 'Rejected' THEN 1 ELSE 0 END, "createdAt" DESC
      LIMIT 1
    `;

    const accountId = rows[0]?.id ?? '';

    const { token } = await stack.transactions.run((transaction) =>
      stack.sessions.issue(accountId, transaction),
    );

    requestContext.sessionToken = token;

    // Warm the page cache: the NFR is about the endpoint, not about cold
    // disk on a shared free-tier database.
    await sessionRoute();

    const samples: number[] = [];
    const sampleCount = 200;

    for (let index = 0; index < sampleCount; index += 1) {
      const started = performance.now();

      await sessionRoute();

      samples.push(performance.now() - started);
    }

    const median = p50(samples);
    const ninetyFifth = p95(samples);

    console.log(
      `Session read: p50 ${median.toFixed(1)}ms, p95 ${ninetyFifth.toFixed(1)}ms ` +
        `(budget ${READ_BUDGET_MS}ms)`,
    );

    expect(ninetyFifth).toBeLessThan(READ_BUDGET_MS);
  }, 120_000);

  it('answers the pending-queue read within the 500 ms read budget, at scale', async () => {
    // The queue is the administrator's main screen, so it is read often.
    // The query is an index range scan over the `Pending` rows, ordered by
    // submission time, and the page is capped at 25.
    for (let index = 0; index < PENDING_COUNT; index += 1) {
      requestContext.clientIp = `198.51.100.${(index % 200) + 1}`;

      await registerAccountRoute(
        jsonRequest({
          displayName: `Member ${index}`,
          email: aUniqueEmail(),
          password: PASSWORD,
          selfDeclaredRole: 'Student',
        }),
      );
    }

    const pending = await prisma.account.count({ where: { status: 'Pending' } });

    // **At least** the seeded count: the earlier tests in this file left
    // their own pending accounts behind, and the budget is about the size
    // of the queue, not about an exact row count.
    expect(pending).toBeGreaterThanOrEqual(PENDING_COUNT);

    // The administrator who reads the queue.
    const administratorEmail = aUniqueEmail();

    requestContext.clientIp = '198.51.100.250';
    await registerAccountRoute(
      jsonRequest({
        displayName: 'Riley Admin',
        email: administratorEmail,
        password: PASSWORD,
        selfDeclaredRole: 'Student',
      }),
    );

    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "accounts"
      WHERE lower(btrim("email")) = lower(btrim(${administratorEmail}))
      ORDER BY CASE WHEN "status" = 'Rejected' THEN 1 ELSE 0 END, "createdAt" DESC
      LIMIT 1
    `;

    await prisma.account.update({
      where: { id: rows[0]?.id ?? '' },
      data: { status: 'Active', isAdministrator: true },
    });

    const stack = buildIdentityStack();

    const { token } = await stack.transactions.run((transaction) =>
      stack.sessions.issue(rows[0]?.id ?? '', transaction),
    );

    requestContext.sessionToken = token;

    // Warm the cache.
    await queueRoute();

    const samples: number[] = [];
    const sampleCount = 100;

    for (let index = 0; index < sampleCount; index += 1) {
      const started = performance.now();

      await queueRoute();

      samples.push(performance.now() - started);
    }

    const median = p50(samples);
    const ninetyFifth = p95(samples);

    console.log(
      `Pending-queue read at ${PENDING_COUNT} pending registrations: ` +
        `p50 ${median.toFixed(1)}ms, p95 ${ninetyFifth.toFixed(1)}ms ` +
        `(budget ${READ_BUDGET_MS}ms)`,
    );

    expect(ninetyFifth).toBeLessThan(READ_BUDGET_MS);
  }, 300_000);

  it('uses the index for the pending-queue query', async () => {
    // The budget is met by an index range scan, not by luck — so the plan
    // is asserted, not just the timing.
    //
    // **The planner needs current statistics.** The rows were inserted
    // moments ago, so the table's row estimate is still whatever it was
    // before the seed — and on a stale estimate the planner costs a seq
    // scan as cheaper, which is a plan the production database would not
    // use once autovacuum had run. `ANALYZE` is the same fix the audit
    // performance suites apply after their bulk insert.
    await prisma.$executeRawUnsafe('ANALYZE "accounts"');

    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN (FORMAT JSON)
      SELECT "id", "email", "displayName", "selfDeclaredRole", "selfDeclaredRoleOther", "createdAt"
      FROM "accounts"
      WHERE "status" = 'Pending'
      ORDER BY "createdAt" ASC
      LIMIT 25
    `;

    const text = JSON.stringify(plan);

    // The composite index covers both the filter and the ordering, so the
    // plan is an index scan with **no sort**.
    expect(text).toContain('idx_accounts_status_created');
    expect(text).not.toContain('Sort');
  }, 60_000);
});
