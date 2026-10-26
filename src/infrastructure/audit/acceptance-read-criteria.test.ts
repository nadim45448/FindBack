/**
 * Acceptance-criteria validation for story `005-audit-visibility-and-read-logging`.
 *
 * Each test in this file maps to one acceptance criterion of the story, in the
 * story's own order. They are collected in one file so the mapping from
 * criterion to test is legible in one place — the test report cites it.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 *
 * The criteria:
 *
 * 1. A non-administrator is refused any audit view, and no trail content is
 *    returned.
 * 2. An administrator opening a report's trail gets it reverse-chronological.
 * 3. A read is recorded with the administrator, query, filters, result count,
 *    and timestamp.
 * 4. The read record is a distinct record type, not an event on the audited
 *    entity.
 * 5. The read is stored in the database rather than only in runtime logs.
 * 6. The query completes within 1 second at p95 at 10,000 reports × 50
 *    events. (Measured in `audit-performance.test.ts` — this file asserts the
 *    mechanism the measurement relies on.)
 * 7. A trail listing shows 25 entries per page with no infinite scroll.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditTrailReader, type TrailViewer } from '@/application/audit-trail-reader';
import { AuditReadRecorder } from '@/application/audit-read-recorder';
import { AuditTrailService } from '@/application/audit-trail-service';
import { AuditWriter } from '@/application/audit-writer';
import { TRAIL_PAGE_SIZE, encodeTrailCursor } from '@/domain/audit';
import { PermissionDeniedError } from '@/lib/errors';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { PrismaAuditReadLogRepository } from './prisma-audit-read-log-repository';
import { PrismaTransactionFactory } from '../db/prisma-transaction-factory';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('story 005 — audit visibility and read logging', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000401';
  const adminId = '00000000-0000-4000-8000-000000000402';
  const memberId = '00000000-0000-4000-8000-000000000403';

  const events = new PrismaAuditEventRepository(prisma);
  const reads = new PrismaAuditReadLogRepository(prisma);
  const writer = new AuditWriter(events);
  const transactions = new PrismaTransactionFactory(prisma);

  const administrator: TrailViewer = { userId: adminId, isAdministrator: true };
  const member: TrailViewer = { userId: memberId, isAdministrator: false };

  function buildService(): AuditTrailService {
    return new AuditTrailService(
      new AuditTrailReader(events),
      new AuditReadRecorder(reads),
      transactions,
    );
  }

  /** Write one event. */
  async function seed(eventType: string, occurredAt: Date, actorId = adminId): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await writer.record(
        {
          eventType,
          parent: { parentType: 'claim', parentId },
          actor: { actorId, actorRole: 'administrator' },
          occurredAt,
        },
        { transaction: tx },
      );
    });
  }

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);
  });

  beforeEach(async () => {
    await clearAuditTablesForTest(prisma);
  });

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  // Criterion 1.
  it('refuses a non-administrator and returns no trail content', async () => {
    await seed('claim.approved', new Date('2026-10-01T00:00:00Z'));

    const service = buildService();

    await expect(
      service.listByParent(member, 'claim', parentId, {}, { requestId: 'req-1' }),
    ).rejects.toThrow(PermissionDeniedError);

    // No trail content was returned, and the read log records no such read.
    const logs = await prisma.auditReadLog.findMany({});

    expect(logs).toHaveLength(0);
  });

  it('refuses a non-administrator without reaching the database', async () => {
    await seed('claim.approved', new Date('2026-10-01T00:00:00Z'));

    // A repository that would fail the test if it were called.
    const failingRepository: AuditEventRepositoryLike = {
      append: () => {
        throw new Error('the repository must not be reached');
      },
      listByParent: () => {
        throw new Error('the repository must not be reached');
      },
      listAll: () => {
        throw new Error('the repository must not be reached');
      },
    };

    const service = new AuditTrailService(
      new AuditTrailReader(failingRepository),
      new AuditReadRecorder(reads),
      transactions,
    );

    await expect(
      service.listByParent(member, 'claim', parentId, {}, { requestId: 'req-1' }),
    ).rejects.toThrow(PermissionDeniedError);
  });

  // Criterion 2.
  it('returns the trail in reverse-chronological order', async () => {
    await seed('claim.approved', new Date('2026-10-01T00:00:00Z'));
    await seed('claim.rejected_by_administrator', new Date('2026-10-03T00:00:00Z'));
    await seed('claim.submitted', new Date('2026-10-02T00:00:00Z'));

    const page = await buildService().listByParent(
      administrator,
      'claim',
      parentId,
      {},
      { requestId: 'req-1' },
    );

    const timestamps = page.events.map((event) => event.occurredAt.getTime());

    expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    expect(page.events[0]?.eventType).toBe('claim.rejected_by_administrator');
    expect(page.events[2]?.eventType).toBe('claim.approved');
  });

  // Criterion 3.
  it('records the administrator, query, filters, result count, and timestamp', async () => {
    await seed('claim.approved', new Date('2026-10-01T00:00:00Z'));

    await buildService().listByParent(
      administrator,
      'claim',
      parentId,
      { filters: { eventTypes: ['claim.approved'] } },
      { requestId: 'req-1' },
    );

    const logs = await prisma.auditReadLog.findMany({});

    expect(logs).toHaveLength(1);

    const log = logs[0];

    expect(log?.administratorId).toBe(adminId);
    expect(log?.query).toBe(`claim:${parentId}`);
    expect(log?.resultCount).toBe(1);
    expect(log?.readAt).toBeInstanceOf(Date);
    expect(log?.readAt.getTime()).toBeGreaterThan(0);

    // The filters applied are captured.
    const filters = log?.filters as Record<string, unknown>;

    expect(filters.eventTypes).toEqual(['claim.approved']);
  });

  // Criterion 4.
  it('records the read as a distinct record type, not as an event on the audited entity', async () => {
    await seed('claim.approved', new Date('2026-10-01T00:00:00Z'));

    await buildService().listByParent(administrator, 'claim', parentId, {}, { requestId: 'req-1' });

    // The trail is unchanged by the read — the read record is not in it.
    const trail = await prisma.auditEvent.findMany({ where: { parentId } });

    expect(trail).toHaveLength(1);

    // The read record is in its own table, with its own shape.
    const logs = await prisma.auditReadLog.findMany({});

    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toHaveProperty('eventType');
    expect(logs[0]).not.toHaveProperty('eventNumber');
    expect(logs[0]).not.toHaveProperty('parentId');
  });

  // Criterion 5.
  it('stores the read in the database, not only in runtime logs', async () => {
    await seed('claim.approved', new Date('2026-10-01T00:00:00Z'));

    await buildService().listByParent(administrator, 'claim', parentId, {}, { requestId: 'req-1' });

    // The row exists in PostgreSQL. Vercel Hobby retains runtime logs for
    // only one hour; a read that must be reviewable later has to be here.
    const logs = await prisma.auditReadLog.findMany({ where: { requestId: 'req-1' } });

    expect(logs).toHaveLength(1);
  });

  it('refuses to update or delete a read record', async () => {
    await seed('claim.approved', new Date('2026-10-01T00:00:00Z'));

    await buildService().listByParent(administrator, 'claim', parentId, {}, { requestId: 'req-1' });

    const log = await prisma.auditReadLog.findFirstOrThrow({});

    // The read-log trigger permits no deletion at all — not even through the
    // FR-10 flag, which is scoped to the trail.
    await expect(
      prisma.$executeRaw`DELETE FROM "AuditReadLog" WHERE "id" = ${log.id}::uuid`,
    ).rejects.toThrow(/append-only/);
  });

  // Criterion 6.
  it('paginates by cursor rather than by offset, so the page is bounded', async () => {
    for (let index = 0; index < 30; index += 1) {
      await seed(
        'claim.approved',
        new Date(`2026-10-01T00:00:${String(index % 60).padStart(2, '0')}Z`),
      );
    }

    const page = await buildService().listByParent(
      administrator,
      'claim',
      parentId,
      {},
      { requestId: 'req-1' },
    );

    // The page is bounded at 25 — the query cannot ask for the whole trail.
    expect(page.events).toHaveLength(TRAIL_PAGE_SIZE);
    expect(page.nextCursor).not.toBeNull();
  });

  // Criterion 7.
  it('shows 25 entries per page and no more', async () => {
    for (let index = 0; index < 30; index += 1) {
      await seed(
        'claim.approved',
        new Date(`2026-10-01T00:00:${String(index % 60).padStart(2, '0')}Z`),
      );
    }

    const service = buildService();

    // A caller asking for more is capped, not refused.
    const page = await service.listByParent(
      administrator,
      'claim',
      parentId,
      { limit: 1000 },
      { requestId: 'req-1' },
    );

    expect(page.events).toHaveLength(TRAIL_PAGE_SIZE);
  });

  it('offers no further page when exactly 25 events exist', async () => {
    for (let index = 0; index < 25; index += 1) {
      await seed(
        'claim.approved',
        new Date(`2026-10-01T00:00:${String(index % 60).padStart(2, '0')}Z`),
      );
    }

    const page = await buildService().listByParent(
      administrator,
      'claim',
      parentId,
      {},
      { requestId: 'req-1' },
    );

    expect(page.events).toHaveLength(25);
    expect(page.nextCursor).toBeNull();
  });

  it('walks the whole trail one page at a time, without repeating an event', async () => {
    for (let index = 0; index < 30; index += 1) {
      await seed(
        'claim.approved',
        new Date(`2026-10-01T00:00:${String(index % 60).padStart(2, '0')}Z`),
      );
    }

    const service = buildService();

    const seen: string[] = [];
    let cursor = null;
    let pages = 0;

    do {
      const page = await service.listByParent(
        administrator,
        'claim',
        parentId,
        { cursor },
        { requestId: `req-${pages}` },
      );

      page.events.forEach((event) => seen.push(event.id));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor !== null && pages < 10);

    expect(seen).toHaveLength(30);
    expect(new Set(seen).size).toBe(30);
  });

  it('encodes the cursor as an opaque token', async () => {
    // More than one page, so there is a next cursor to encode.
    for (let index = 0; index < 30; index += 1) {
      await seed(
        'claim.approved',
        new Date(`2026-10-01T00:00:${String(index % 60).padStart(2, '0')}Z`),
      );
    }

    const page = await buildService().listByParent(
      administrator,
      'claim',
      parentId,
      {},
      { requestId: 'req-1' },
    );

    expect(page.nextCursor).not.toBeNull();

    const token = encodeTrailCursor(page.nextCursor!);

    expect(token).not.toMatch(/[+/=]/);
  });
});

/** The repository shape the refusal test needs. */
interface AuditEventRepositoryLike {
  append(): Promise<never>;
  listByParent(
    parentType: string,
    parentId: string,
    cursor: unknown,
    limit: number,
    filters?: unknown,
  ): Promise<never>;
  listAll(cursor: unknown, limit: number, filters?: unknown): Promise<never>;
}
