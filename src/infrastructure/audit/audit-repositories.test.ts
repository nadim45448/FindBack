/**
 * Integration tests for the Prisma audit repositories.
 *
 * These exercise the real stack — the driver adapter, the pooled connection,
 * the raw-SQL trail query, the database trigger — against the local Docker
 * PostgreSQL. A mock would not catch a broken cursor comparison or a
 * mis-shaped query, which is exactly what these paths are for.
 *
 * The suite is skipped when `DATABASE_URL` is not set, so a checkout without
 * a database still runs the unit suite.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { AuditTrailReader } from '@/application/audit-trail-reader';
import { AuditReadRecorder } from '@/application/audit-read-recorder';
import { AuditWriteOutsideTransactionError } from '@/domain/audit';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { PrismaAuditReadLogRepository } from './prisma-audit-read-log-repository';
import { PrismaQuotaSnapshotRepository } from './prisma-quota-snapshot-repository';
import { deleteAuditTrailForParent } from './fr10-audit-deletion';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('audit repositories (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000101';
  const actorId = '00000000-0000-4000-8000-000000000102';
  const adminId = '00000000-0000-4000-8000-000000000103';

  const events = new PrismaAuditEventRepository(prisma);
  const reads = new PrismaAuditReadLogRepository(prisma);
  const snapshots = new PrismaQuotaSnapshotRepository(prisma);

  /**
   * Empty every audit table.
   *
   * The read-log and quota-snapshot triggers permit no deletion at all, so
   * the cleanup bypasses the triggers — a test-only privilege that the
   * application role does not have in production.
   */
  async function clearAll(): Promise<void> {
    await clearAuditTablesForTest(prisma);
  }

  beforeAll(async () => {
    await clearAll();
  });

  beforeEach(async () => {
    await clearAll();
  });

  afterAll(async () => {
    await clearAll();
    await prisma.$disconnect();
  });

  describe('append', () => {
    it('writes an event inside the caller transaction and reads it back', async () => {
      const writer = new AuditWriter(events);

      const written = await prisma.$transaction(async (tx) => {
        return writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
            reason: 'Ownership verified',
            occurredAt: new Date('2026-10-26T09:00:00Z'),
          },
          { transaction: tx },
        );
      });

      expect(written.eventNumber).toBe(3);
      expect(written.eventType).toBe('claim.approved');
      expect(written.reason).toBe('Ownership verified');

      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.reason).toBe('Ownership verified');
    });

    it('refuses a write outside a transaction', async () => {
      const writer = new AuditWriter(events);

      await expect(
        writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
          },
          { transaction: { notATransaction: true } },
        ),
      ).rejects.toThrow(AuditWriteOutsideTransactionError);
    });

    it('leaves no record when the transaction rolls back', async () => {
      const writer = new AuditWriter(events);

      await expect(
        prisma.$transaction(async (tx) => {
          await writer.record(
            {
              eventType: 'claim.approved',
              parent: { parentType: 'claim', parentId },
              actor: { actorId: adminId, actorRole: 'administrator' },
            },
            { transaction: tx },
          );

          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');

      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(0);
    });

    it('stores the determination pair for events 18 and 19', async () => {
      const writer = new AuditWriter(events);

      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: 'recovery_response.determined_match_confirmed',
            parent: { parentType: 'recovery_response', parentId },
            actor: {
              actorId: adminId,
              actorRole: 'administrator',
              actingAdministratorId: adminId,
              determinedByUserId: actorId,
              recordedByAdministratorId: adminId,
            },
          },
          { transaction: tx },
        );
      });

      const row = await prisma.auditEvent.findFirst({ where: { parentId } });

      expect(row?.determinedByUserId).toBe(actorId);
      expect(row?.recordedByAdministratorId).toBe(adminId);
    });
  });

  describe('trail reads', () => {
    /** Write `count` events with descending timestamps. */
    async function seedEvents(count: number): Promise<void> {
      const writer = new AuditWriter(events);

      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < count; index += 1) {
          await writer.record(
            {
              eventType: 'claim.approved',
              parent: { parentType: 'claim', parentId },
              actor: { actorId: adminId, actorRole: 'administrator' },
              occurredAt: new Date(Date.UTC(2026, 9, 26, 9, 0, index)),
            },
            { transaction: tx },
          );
        }
      });
    }

    it('returns the trail newest first', async () => {
      await seedEvents(3);

      const page = await events.listByParent('claim', parentId, null, 25);

      expect(page.events).toHaveLength(3);
      expect(page.nextCursor).toBeNull();

      const timestamps = page.events.map((event) => event.occurredAt.getTime());

      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
    });

    it('paginates with a cursor without repeating or skipping a row', async () => {
      await seedEvents(10);

      const seen: string[] = [];
      let cursor = null;

      // Walk the whole trail one page at a time.
      for (let page = 0; page < 5; page += 1) {
        const result: Awaited<ReturnType<typeof events.listByParent>> = await events.listByParent(
          'claim',
          parentId,
          cursor,
          3,
        );

        seen.push(...result.events.map((event) => event.id));

        if (!result.nextCursor) {
          break;
        }

        cursor = result.nextCursor;
      }

      expect(seen).toHaveLength(10);
      expect(new Set(seen).size).toBe(10);
    });

    it('breaks a tie on identical timestamps with the id tiebreaker', async () => {
      const writer = new AuditWriter(events);
      const sameInstant = new Date('2026-10-26T09:00:00Z');

      await prisma.$transaction(async (tx) => {
        for (let index = 0; index < 4; index += 1) {
          await writer.record(
            {
              eventType: 'claim.approved',
              parent: { parentType: 'claim', parentId },
              actor: { actorId: adminId, actorRole: 'administrator' },
              occurredAt: sameInstant,
            },
            { transaction: tx },
          );
        }
      });

      const seen: string[] = [];
      let cursor = null;

      for (let page = 0; page < 10; page += 1) {
        const result = await events.listByParent('claim', parentId, cursor, 2);

        seen.push(...result.events.map((event) => event.id));

        if (!result.nextCursor) {
          break;
        }

        cursor = result.nextCursor;
      }

      // Four events sharing one timestamp, paged two at a time: each must
      // appear exactly once, and the walk must terminate.
      expect(seen).toHaveLength(4);
      expect(new Set(seen).size).toBe(4);
    });

    it('reads the whole trail with listAll', async () => {
      await seedEvents(2);

      const page = await events.listAll(null, 25);

      expect(page.events.length).toBeGreaterThanOrEqual(2);
    });

    it('maps a row onto the domain shape', async () => {
      await seedEvents(1);

      const page = await events.listByParent('claim', parentId, null, 25);
      const event = page.events[0];

      expect(event?.parent.parentType).toBe('claim');
      expect(event?.parent.parentId).toBe(parentId);
      expect(event?.actor.actorRole).toBe('administrator');
      expect(event?.payload).toEqual({});
    });
  });

  describe('read logging', () => {
    it('records a trail read in the database', async () => {
      const recorder = new AuditReadRecorder(reads);

      const logged = await prisma.$transaction(async (tx) => {
        return recorder.record(
          {
            administratorId: adminId,
            query: 'claim.approved',
            filters: { eventType: 'claim.approved' },
            resultCount: 7,
            requestId: 'req-1',
          },
          { transaction: tx },
        );
      });

      expect(logged.resultCount).toBe(7);
      expect(logged.query).toBe('claim.approved');

      const rows = await prisma.auditReadLog.findMany({
        where: { administratorId: adminId },
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.requestId).toBe('req-1');
    });

    it('records two separate reads when the same trail is read twice', async () => {
      const recorder = new AuditReadRecorder(reads);

      for (const requestId of ['req-a', 'req-b']) {
        await prisma.$transaction(async (tx) => {
          await recorder.record(
            { administratorId: adminId, resultCount: 1, requestId },
            { transaction: tx },
          );
        });
      }

      const rows = await prisma.auditReadLog.findMany({
        where: { administratorId: adminId, requestId: { in: ['req-a', 'req-b'] } },
      });

      expect(rows).toHaveLength(2);
    });

    it('reads the read log back for an administrator', async () => {
      const recorder = new AuditReadRecorder(reads);

      await prisma.$transaction(async (tx) => {
        await recorder.record(
          { administratorId: adminId, resultCount: 3, requestId: 'req-list' },
          { transaction: tx },
        );
      });

      const listed = await reads.listByAdministrator(adminId, 10);

      expect(listed.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('quota snapshots', () => {
    it('appends a snapshot and finds the latest for a resource', async () => {
      await snapshots.append({
        resource: 'test_resource',
        usedAmount: 100n,
        limitAmount: 1000n,
        observedAt: new Date('2026-10-26T09:00:00Z'),
      });

      await snapshots.append({
        resource: 'test_resource',
        usedAmount: 200n,
        limitAmount: 1000n,
        observedAt: new Date('2026-10-26T10:00:00Z'),
      });

      const latest = await snapshots.findLatest('test_resource');

      expect(latest?.usedAmount).toBe(200n);
    });
  });

  describe('the trail reader', () => {
    it('refuses a non-administrator before the query runs', async () => {
      const reader = new AuditTrailReader(events);

      await expect(
        reader.listByParent({ userId: actorId, isAdministrator: false }, 'claim', parentId, null),
      ).rejects.toThrow(/administrators/);

      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(0);
    });

    it('returns the trail to an administrator', async () => {
      const writer = new AuditWriter(events);

      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
          },
          { transaction: tx },
        );
      });

      const reader = new AuditTrailReader(events);
      const result = await reader.listByParent(
        { userId: adminId, isAdministrator: true },
        'claim',
        parentId,
        null,
      );

      expect(result.events).toHaveLength(1);
    });
  });

  describe('the FR-10 deletion path', () => {
    it('removes the trail inside a transaction that sets the flag', async () => {
      const writer = new AuditWriter(events);

      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
          },
          { transaction: tx },
        );
      });

      const deleted = await prisma.$transaction(async (tx) => {
        return deleteAuditTrailForParent('claim', parentId, { transaction: tx });
      });

      expect(deleted).toBe(1);

      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(0);
    });

    it('removes only the named parent, leaving other trails alone', async () => {
      const otherParentId = '00000000-0000-4000-8000-000000000104';
      const writer = new AuditWriter(events);

      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
          },
          { transaction: tx },
        );
        await writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId: otherParentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
          },
          { transaction: tx },
        );
      });

      await prisma.$transaction(async (tx) => {
        await deleteAuditTrailForParent('claim', parentId, { transaction: tx });
      });

      const remaining = await prisma.auditEvent.findMany({
        where: { parentId: otherParentId },
      });

      expect(remaining).toHaveLength(1);
    });

    it('refuses to run outside a transaction', async () => {
      await expect(
        deleteAuditTrailForParent('claim', parentId, { transaction: {} }),
      ).rejects.toThrow(AuditWriteOutsideTransactionError);
    });
  });
});
