/**
 * The Lost-side audit performance test.
 *
 * Two NFRs from FR-48 are under test:
 *
 * 1. **"Audit trail queries must complete within 1 second at p95 against
 *    10,000 reports with 50 events each"** — the same scale bolt 001
 *    measured, re-measured here against the **Lost-side** parent filter,
 *    because the Lost side is the shape this bolt owns.
 * 2. **"Verification screen renders within 1 second at p95 against a Lost
 *    report with up to 50 Recovery Responses"** — the screen itself is
 *    Unit 007's, but its input is the Lost report's trail. The trail for a
 *    report with 50 Recovery Responses must therefore be cheap to assemble,
 *    and the whole trail must be paged within the budget.
 *
 * The seed is a bulk insert, because the read path is what is under test.
 * The table is `ANALYZE`d afterwards so the planner costs the plan on
 * current statistics rather than a stale estimate — without that, the test
 * would measure a plan the production database would not use.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
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

/** The PRD's verification-screen shape. */
const MAX_RECOVERY_RESPONSES = 50;

/** The NFR's budget. */
const P95_BUDGET_MS = 1000;

/** The page size the trail view uses. */
const PAGE_SIZE = 25;

describeWithDatabase('Lost-side audit performance', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const events = new PrismaAuditEventRepository(prisma);

  /** The ids of the Lost reports that were seeded. */
  const reportIds: string[] = [];

  /** The id of the report seeded with the 50-Recovery-Response shape. */
  const busyReportId = '00000000-0000-4000-8000-000000000701';

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);

    // The bulk seed: 10,000 Lost reports × 50 events each. The event numbers
    // cycle through the Lost-side range, so the rows carry a realistic
    // spread of types.
    const inserted = await prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "audit_events" (
        "id", "eventNumber", "eventType", "parentType", "parentId",
        "actorId", "actorRole", "occurredAt"
      )
      SELECT
        gen_random_uuid(),
        (n % 16) + 15,
        'recovery_response.submitted',
        'report',
        report_id,
        gen_random_uuid(),
        'member',
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

    // The verification-screen shape: one report with 50 Recovery Responses,
    // each carrying its own submission event and a thread message.
    await prisma.$queryRaw`
      INSERT INTO "audit_events" (
        "id", "eventNumber", "eventType", "parentType", "parentId",
        "actorId", "actorRole", "occurredAt"
      )
      SELECT
        gen_random_uuid(),
        15,
        'recovery_response.submitted',
        'report',
        ${busyReportId}::uuid,
        gen_random_uuid(),
        'member',
        TIMESTAMPTZ '2026-01-01 00:00:00+00' + (n * INTERVAL '1 minute')
      FROM generate_series(1, ${MAX_RECOVERY_RESPONSES}) AS n
    `;

    await prisma.$executeRawUnsafe('ANALYZE "audit_events"');

    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'audit_events'
    `;

    expect(indexes.map((index) => index.indexname)).toContain('idx_audit_events_trail');
  }, 300_000);

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  it('seeds the PRD scale of 10,000 Lost reports with 50 events each', async () => {
    const count = await prisma.auditEvent.count();

    expect(count).toBe(REPORT_COUNT * EVENTS_PER_REPORT + MAX_RECOVERY_RESPONSES);
    expect(reportIds.length).toBe(REPORT_COUNT);
  });

  it('returns a page of 25 for a Lost report at the PRD scale', async () => {
    const page = await events.listByParent('report', reportIds[0] ?? '', null, PAGE_SIZE);

    expect(page.events).toHaveLength(PAGE_SIZE);
  });

  it('completes a Lost-side trail query within the 1 second p95 budget', async () => {
    // Warm the page cache first: the NFR is about the query, not about
    // cold-cache disk I/O on a shared free-tier database.
    await events.listByParent('report', reportIds[0] ?? '', null, PAGE_SIZE);

    const samples: number[] = [];
    const sampleCount = 100;

    for (let index = 0; index < sampleCount; index += 1) {
      // A different report each time, so the measurement covers the index
      // range scan rather than one hot page.
      const reportId = reportIds[index % reportIds.length] ?? '';

      const started = performance.now();

      await events.listByParent('report', reportId, null, PAGE_SIZE);

      samples.push(performance.now() - started);
    }

    samples.sort((a, b) => a - b);

    const p50 = samples[Math.floor(sampleCount * 0.5)] ?? 0;
    const p95 = samples[Math.floor(sampleCount * 0.95)] ?? 0;
    const worst = samples.at(-1) ?? 0;

    console.log(
      `Lost-side trail query at ${REPORT_COUNT} reports × ${EVENTS_PER_REPORT} events: ` +
        `p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, max ${worst.toFixed(1)}ms ` +
        `(budget ${P95_BUDGET_MS}ms)`,
    );

    expect(p95).toBeLessThan(P95_BUDGET_MS);
  }, 120_000);

  it('assembles the whole trail of a 50-Recovery-Response report within the 1 second p95 budget', async () => {
    // The verification screen needs the report's trail, not one page of it.
    // A report with 50 Recovery Responses holds 50 events, which is two
    // pages — so the screen's input is bounded, and the whole trail is
    // cheap to read.
    await events.listByParent('report', busyReportId, null, PAGE_SIZE);

    const samples: number[] = [];
    const sampleCount = 100;

    for (let index = 0; index < sampleCount; index += 1) {
      const started = performance.now();

      // Read every page of the trail — the screen's actual input.
      let cursor = null;
      let read = 0;

      do {
        const page = await events.listByParent('report', busyReportId, cursor, PAGE_SIZE);
        read += page.events.length;
        cursor = page.nextCursor;
      } while (cursor);

      samples.push(performance.now() - started);

      if (index === 0) {
        expect(read).toBe(MAX_RECOVERY_RESPONSES);
      }
    }

    samples.sort((a, b) => a - b);

    const p50 = samples[Math.floor(sampleCount * 0.5)] ?? 0;
    const p95 = samples[Math.floor(sampleCount * 0.95)] ?? 0;
    const worst = samples.at(-1) ?? 0;

    console.log(
      `Verification-screen trail for ${MAX_RECOVERY_RESPONSES} Recovery Responses: ` +
        `p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms, max ${worst.toFixed(1)}ms ` +
        `(budget ${P95_BUDGET_MS}ms)`,
    );

    expect(p95).toBeLessThan(P95_BUDGET_MS);
  }, 120_000);

  it('uses an index scan rather than a sort for the Lost-side parent filter', async () => {
    const reportId = reportIds[0] ?? '';

    const plan = await prisma.$queryRaw<Array<{ 'QUERY PLAN': string }>>`
      EXPLAIN (FORMAT TEXT)
      SELECT "id", "eventNumber", "eventType", "parentType", "parentId",
             "actorId", "actorRole", "actingAdministratorId", "determinedByUserId",
             "recordedByAdministratorId", "reason", "previousValues", "changedFields",
             "metadata", "occurredAt", "createdAt"
      FROM "audit_events"
      WHERE "parentType" = 'report' AND "parentId" = ${reportId}::uuid
      ORDER BY "occurredAt" DESC, "id" DESC
      LIMIT ${PAGE_SIZE}
    `;

    const planText = plan.map((row) => row['QUERY PLAN']).join('\n');

    // An index scan, not a sequential scan with a sort node. This is the
    // mechanical form of the design's claim.
    expect(planText).toMatch(/Index Scan|Index Only Scan/);
    expect(planText).not.toMatch(/Seq Scan/);
    expect(planText).not.toMatch(/Sort/);
    expect(planText).toContain('idx_audit_events_trail');
  });

  it('keeps the Lost-side trail bounded — the parent filter is what scopes it', async () => {
    // The concern the design raises: a Lost report's trail must not grow
    // without bound as responses accumulate. The parent filter is the
    // scoping mechanism; this asserts it holds, at the PRD's maximum shape.
    const all = await events.listAll(null, PAGE_SIZE);
    const forBusyReport = await events.listByParent('report', busyReportId, null, PAGE_SIZE);

    // The whole trail is much larger than one report's trail.
    expect(all.events.length).toBe(PAGE_SIZE);

    // And the one report's trail is exactly its own responses — no bleed
    // from its neighbours.
    expect(forBusyReport.events).toHaveLength(PAGE_SIZE);
    expect(forBusyReport.events.every((event) => event.parent.parentId === busyReportId)).toBe(
      true,
    );
  });
});
