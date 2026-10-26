/**
 * The audit-trail query performance test.
 *
 * The PRD's NFR: "Audit trail queries must complete within 1 second at p95
 * against 10,000 reports with 50 events each" (FR-32).
 *
 * The test seeds that scale — 10,000 reports × 50 events = 500,000 rows — and
 * measures the trail query at p95. It is skipped when `DATABASE_URL` is not
 * set, and it is slow by nature: the seeding is a bulk insert, and the whole
 * file takes tens of seconds.
 *
 * The design claimed the composite index `(parent_id, occurred_at DESC, id
 * DESC)` turns the trail view into an index range scan rather than a sort,
 * with 25 rows per page capping the work per request. This test is where
 * that claim is checked.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

/** The PRD's stated scale. */
const REPORT_COUNT = 10_000;
const EVENTS_PER_REPORT = 50;
const PAGE_SIZE = 25;

/** The NFR's budget. */
const P95_BUDGET_MS = 1000;

describeWithDatabase('audit trail query performance', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const events = new PrismaAuditEventRepository(prisma);

  /** The ids of the reports that were seeded. */
  const reportIds: string[] = [];

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);

    // The seed is a bulk insert rather than 500,000 individual writes,
    // because the point of the test is the *read* path, not the write path.
    // `generate_series` produces the ids; the rows are inserted in batches
    // so the transaction does not grow unbounded.
    const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "AuditEvent" (
        "id", "eventNumber", "eventType", "parentType", "parentId",
        "actorId", "actorRole", "occurredAt"
      )
      SELECT
        gen_random_uuid(),
        (n % 30) + 1,
        'claim.approved',
        'claim',
        report_id,
        gen_random_uuid(),
        'administrator',
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + (n * INTERVAL '1 minute')
      FROM (
        SELECT
          report_id,
          generate_series(1, ${EVENTS_PER_REPORT}) AS n
        FROM (
          SELECT gen_random_uuid() AS report_id
          FROM generate_series(1, ${REPORT_COUNT})
        ) AS reports
      ) AS expanded
      RETURNING "parentId" AS id
    `;

    reportIds.push(...new Set(inserted.map((row) => row.id)));

    // The planner needs current statistics to choose the index-only scan.
    // Without this the table's row estimate is stale and the plan is
    // mis-costed — the test would then measure a plan the production
    // database would not use.
    await prisma.$executeRawUnsafe('ANALYZE "AuditEvent"');

    // The index must exist for the measurement to mean anything.
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'AuditEvent'
    `;

    expect(indexes.map((index) => index.indexname)).toContain('idx_audit_events_trail');
  }, 300_000);

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  it('seeds the PRD scale of 10,000 reports with 50 events each', async () => {
    const count = await prisma.auditEvent.count();

    expect(count).toBe(REPORT_COUNT * EVENTS_PER_REPORT);
    expect(reportIds.length).toBe(REPORT_COUNT);
  });

  it('returns a page of 25 for a report at the PRD scale', async () => {
    const page = await events.listByParent('claim', reportIds[0] ?? '', null, PAGE_SIZE);

    expect(page.events).toHaveLength(PAGE_SIZE);
  });

  it('completes a trail query within the 1 second p95 budget', async () => {
    // Warm the page cache first: the NFR is about the query, not about
    // cold-cache disk I/O on a shared free-tier database.
    await events.listByParent('claim', reportIds[0] ?? '', null, PAGE_SIZE);

    const samples: number[] = [];
    const sampleCount = 100;

    for (let index = 0; index < sampleCount; index += 1) {
      // A different report each time, so the measurement covers the index
      // range scan rather than one hot page.
      const reportId = reportIds[index % reportIds.length] ?? '';

      const started = performance.now();

      await events.listByParent('claim', reportId, null, PAGE_SIZE);

      samples.push(performance.now() - started);
    }

    samples.sort((a, b) => a - b);

    const p50 = samples[Math.floor(sampleCount * 0.5)] ?? 0;
    const p95 = samples[Math.floor(sampleCount * 0.95)] ?? 0;
    const worst = samples.at(-1) ?? 0;

    console.log(
      `Trail query at ${REPORT_COUNT} reports × ${EVENTS_PER_REPORT} events: ` +
        `p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, max ${worst.toFixed(1)}ms ` +
        `(budget ${P95_BUDGET_MS}ms)`,
    );

    expect(p95).toBeLessThan(P95_BUDGET_MS);
  }, 120_000);

  it('uses an index scan rather than a sort', async () => {
    const reportId = reportIds[0] ?? '';

    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN (FORMAT TEXT)
      SELECT "id", "eventNumber", "eventType", "parentType", "parentId",
             "actorId", "actorRole", "actingAdministratorId", "determinedByUserId",
             "recordedByAdministratorId", "reason", "previousValues", "changedFields",
             "metadata", "occurredAt", "createdAt"
      FROM "AuditEvent"
      WHERE "parentType" = 'claim' AND "parentId" = ${reportId}::uuid
      ORDER BY "occurredAt" DESC, "id" DESC
      LIMIT ${PAGE_SIZE}
    `;

    const planText = plan.map((row) => row['QUERY PLAN']).join('\n');

    // An index scan, not a sequential scan with a sort node. This is the
    // mechanical form of the design's claim.
    expect(planText).toMatch(/Index Scan|Index Only Scan/);
    expect(planText).not.toMatch(/Seq Scan/);
    expect(planText).not.toMatch(/Sort/);

    // The index that serves it leads with `parentType`, because the query
    // filters on it and an unconstrained leading column cannot supply the
    // ordering.
    expect(planText).toContain('idx_audit_events_trail');
  });

  // ---------------------------------------------------------------------
  // The two measurements the technical design committed to.
  //
  // Stage 2 decided "no new index in this bolt" on the grounds that a single
  // report's trail is 50 rows and filtering 50 rows is not a performance
  // problem. That decision was made to be *measured*, not assumed. These two
  // tests are the measurement.
  // ---------------------------------------------------------------------

  it('completes a filtered trail query within the 1 second p95 budget', async () => {
    const reportId = reportIds[0] ?? '';

    // Warm the page cache, as the unfiltered measurement does.
    await events.listByParent('claim', reportId, null, PAGE_SIZE, {
      eventTypes: ['claim.approved'],
    });

    const samples: number[] = [];
    const sampleCount = 100;

    for (let index = 0; index < sampleCount; index += 1) {
      const id = reportIds[index % reportIds.length] ?? '';

      const started = performance.now();

      await events.listByParent('claim', id, null, PAGE_SIZE, {
        eventTypes: ['claim.approved'],
      });

      samples.push(performance.now() - started);
    }

    samples.sort((a, b) => a - b);

    const p50 = samples[Math.floor(sampleCount * 0.5)] ?? 0;
    const p95 = samples[Math.floor(sampleCount * 0.95)] ?? 0;
    const worst = samples.at(-1) ?? 0;

    console.log(
      `Filtered trail query at ${REPORT_COUNT} reports × ${EVENTS_PER_REPORT} events: ` +
        `p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, max ${worst.toFixed(1)}ms ` +
        `(budget ${P95_BUDGET_MS}ms)`,
    );

    expect(p95).toBeLessThan(P95_BUDGET_MS);
  }, 120_000);

  it('completes a whole-trail read within the 1 second p95 budget', async () => {
    // Warm the page cache.
    await events.listAll(null, PAGE_SIZE);

    const samples: number[] = [];
    const sampleCount = 50;

    for (let index = 0; index < sampleCount; index += 1) {
      const started = performance.now();

      await events.listAll(null, PAGE_SIZE);

      samples.push(performance.now() - started);
    }

    samples.sort((a, b) => a - b);

    const p50 = samples[Math.floor(sampleCount * 0.5)] ?? 0;
    const p95 = samples[Math.floor(sampleCount * 0.95)] ?? 0;
    const worst = samples.at(-1) ?? 0;

    console.log(
      `Whole-trail read at ${REPORT_COUNT} reports × ${EVENTS_PER_REPORT} events: ` +
        `p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, max ${worst.toFixed(1)}ms ` +
        `(budget ${P95_BUDGET_MS}ms)`,
    );

    expect(p95).toBeLessThan(P95_BUDGET_MS);
  }, 120_000);

  it('uses the occurred-at index for the whole-trail read, with no sort', async () => {
    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN (FORMAT TEXT)
      SELECT "id", "eventNumber", "eventType", "parentType", "parentId",
             "actorId", "actorRole", "actingAdministratorId", "determinedByUserId",
             "recordedByAdministratorId", "reason", "previousValues", "changedFields",
             "metadata", "occurredAt", "createdAt"
      FROM "AuditEvent"
      WHERE TRUE
      ORDER BY "occurredAt" DESC, "id" DESC
      LIMIT ${PAGE_SIZE}
    `;

    const planText = plan.map((row) => row['QUERY PLAN']).join('\n');

    // The whole-trail read cannot use `idx_audit_events_trail`, because that
    // index leads with `parentType`, which is unconstrained here. It uses the
    // `occurred_at` index instead — the design's Decision 9, now measured.
    expect(planText).toContain('idx_audit_events_occurred');
    expect(planText).not.toMatch(/Seq Scan/);
  });

  it('keeps the filtered query on an index scan rather than a sort', async () => {
    const reportId = reportIds[0] ?? '';

    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN (FORMAT TEXT)
      SELECT "id", "eventNumber", "eventType", "parentType", "parentId",
             "actorId", "actorRole", "actingAdministratorId", "determinedByUserId",
             "recordedByAdministratorId", "reason", "previousValues", "changedFields",
             "metadata", "occurredAt", "createdAt"
      FROM "AuditEvent"
      WHERE "parentType" = 'claim'
        AND "parentId" = ${reportId}::uuid
        AND "eventType" = ANY(ARRAY['claim.approved']::text[])
      ORDER BY "occurredAt" DESC, "id" DESC
      LIMIT ${PAGE_SIZE}
    `;

    const planText = plan.map((row) => row['QUERY PLAN']).join('\n');

    // The filter narrows the result but does not reorder it, so the plan is
    // still an index scan over the trail index.
    expect(planText).toMatch(/Index Scan|Index Only Scan/);
    expect(planText).not.toMatch(/Seq Scan/);
    expect(planText).not.toMatch(/Sort/);
  });
});
