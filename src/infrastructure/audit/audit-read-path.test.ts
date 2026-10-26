/**
 * Integration tests for the audit read path.
 *
 * These exercise the real stack — the driver adapter, the pooled connection,
 * the raw-SQL filtered trail query, the append-only trigger, and the
 * transaction factory — against the local Docker PostgreSQL.
 *
 * The two behaviours worth testing against a real database are:
 *
 * 1. **The filtered query.** A mock would not catch a mis-shaped clause, a
 *    wrongly bound parameter, or a filter that silently narrows nothing.
 * 2. **The idempotent retry.** The guarantee is that a retry writes the same
 *    id and the primary key refuses the duplicate. That guarantee is a
 *    database property, so only a real database can demonstrate it.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditTrailReader, type TrailViewer } from '@/application/audit-trail-reader';
import { AuditReadRecorder } from '@/application/audit-read-recorder';
import { AuditTrailService } from '@/application/audit-trail-service';
import { AuditWriter } from '@/application/audit-writer';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { PrismaAuditReadLogRepository } from './prisma-audit-read-log-repository';
import { PrismaTransactionFactory } from '../db/prisma-transaction-factory';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the audit read path (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000201';
  const otherParentId = '00000000-0000-4000-8000-000000000202';
  const adminId = '00000000-0000-4000-8000-000000000203';
  const otherActorId = '00000000-0000-4000-8000-000000000204';

  const events = new PrismaAuditEventRepository(prisma);
  const reads = new PrismaAuditReadLogRepository(prisma);
  const writer = new AuditWriter(events);
  const transactions = new PrismaTransactionFactory(prisma);

  const administrator: TrailViewer = { userId: adminId, isAdministrator: true };
  const member: TrailViewer = { userId: otherActorId, isAdministrator: false };

  async function clearAll(): Promise<void> {
    await clearAuditTablesForTest(prisma);
  }

  /** Write one event inside a transaction. */
  async function seed(
    eventType: string,
    actorId: string,
    occurredAt: Date,
    parent: string = parentId,
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await writer.record(
        {
          eventType,
          parent: { parentType: 'claim', parentId: parent },
          actor: { actorId, actorRole: 'administrator' },
          occurredAt,
        },
        { transaction: tx },
      );
    });
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

  describe('the filtered trail query', () => {
    it('returns only the events matching the action-type filter', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));
      await seed('claim.rejected_by_administrator', adminId, new Date('2026-10-02T00:00:00Z'));
      await seed('claim.approved', adminId, new Date('2026-10-03T00:00:00Z'));

      const page = await events.listByParent('claim', parentId, null, 25, {
        eventTypes: ['claim.approved'],
      });

      expect(page.events).toHaveLength(2);
      expect(page.events.every((event) => event.eventType === 'claim.approved')).toBe(true);
    });

    it('returns only the events matching the actor filter', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));
      await seed('claim.approved', otherActorId, new Date('2026-10-02T00:00:00Z'));

      const page = await events.listByParent('claim', parentId, null, 25, {
        actorId: otherActorId,
      });

      expect(page.events).toHaveLength(1);
      expect(page.events[0]?.actor.actorId).toBe(otherActorId);
    });

    it('returns only the events inside the date range', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));
      await seed('claim.approved', adminId, new Date('2026-10-15T00:00:00Z'));
      await seed('claim.approved', adminId, new Date('2026-10-30T00:00:00Z'));

      const page = await events.listByParent('claim', parentId, null, 25, {
        from: new Date('2026-10-10T00:00:00Z'),
        to: new Date('2026-10-20T00:00:00Z'),
      });

      expect(page.events).toHaveLength(1);
      expect(page.events[0]?.occurredAt.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    });

    it('applies the filters together', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));
      await seed('claim.approved', otherActorId, new Date('2026-10-15T00:00:00Z'));
      await seed('claim.rejected_by_administrator', otherActorId, new Date('2026-10-15T00:00:00Z'));

      const page = await events.listByParent('claim', parentId, null, 25, {
        eventTypes: ['claim.approved'],
        actorId: otherActorId,
        from: new Date('2026-10-10T00:00:00Z'),
      });

      expect(page.events).toHaveLength(1);
      expect(page.events[0]?.actor.actorId).toBe(otherActorId);
    });

    it('returns everything when no filter is applied', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));
      await seed('claim.rejected_by_administrator', adminId, new Date('2026-10-02T00:00:00Z'));

      const page = await events.listByParent('claim', parentId, null, 25, {});

      expect(page.events).toHaveLength(2);
    });

    it('returns nothing when a filter matches nothing', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));

      const page = await events.listByParent('claim', parentId, null, 25, {
        eventTypes: ['claim.rejected_by_administrator'],
      });

      expect(page.events).toHaveLength(0);
    });

    it('treats a hostile filter value as data, never as SQL', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));

      const page = await events.listByParent('claim', parentId, null, 25, {
        eventTypes: ['\'; DROP TABLE "AuditEvent"; --'],
      });

      expect(page.events).toHaveLength(0);

      // The table is still there.
      const rows = await prisma.auditEvent.findMany({ where: { parentId } });
      expect(rows).toHaveLength(1);
    });

    it('keeps the filters out of the parent scope', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'), parentId);
      await seed('claim.approved', adminId, new Date('2026-10-02T00:00:00Z'), otherParentId);

      const page = await events.listByParent('claim', parentId, null, 25, {
        eventTypes: ['claim.approved'],
      });

      expect(page.events).toHaveLength(1);
    });

    it('paginates the filtered result with a cursor', async () => {
      for (let index = 0; index < 5; index += 1) {
        await seed('claim.approved', adminId, new Date(`2026-10-0${index + 1}T00:00:00Z`));
      }

      const first = await events.listByParent('claim', parentId, null, 2, {
        eventTypes: ['claim.approved'],
      });

      expect(first.events).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await events.listByParent('claim', parentId, first.nextCursor, 2, {
        eventTypes: ['claim.approved'],
      });

      expect(second.events).toHaveLength(2);

      const firstIds = first.events.map((event) => event.id);
      const secondIds = second.events.map((event) => event.id);

      expect(firstIds.filter((id) => secondIds.includes(id))).toHaveLength(0);
    });
  });

  describe('the read record', () => {
    it('is written in its own transaction, after the read', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));

      const service = new AuditTrailService(
        new AuditTrailReader(events),
        new AuditReadRecorder(reads),
        transactions,
      );

      const result = await service.listByParent(
        administrator,
        'claim',
        parentId,
        {},
        { requestId: 'req-1' },
      );

      expect(result.events).toHaveLength(1);

      const logs = await prisma.auditReadLog.findMany({ where: { administratorId: adminId } });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.requestId).toBe('req-1');
      expect(logs[0]?.resultCount).toBe(1);
      expect(logs[0]?.query).toBe(`claim:${parentId}`);
    });

    it('carries no trail data', async () => {
      // A reason is trail content — the event's own data. The read record
      // must not carry it.
      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
            reason: 'Ownership verified against the original receipt',
            occurredAt: new Date('2026-10-01T00:00:00Z'),
          },
          { transaction: tx },
        );
      });

      const service = new AuditTrailService(
        new AuditTrailReader(events),
        new AuditReadRecorder(reads),
        transactions,
      );

      await service.listByParent(
        administrator,
        'claim',
        parentId,
        { filters: { eventTypes: ['claim.approved'] } },
        { requestId: 'req-1' },
      );

      const logs = await prisma.auditReadLog.findMany({ where: { administratorId: adminId } });
      const filters = logs[0]?.filters as Record<string, unknown>;

      // The filters are criteria, and the story requires them to be captured.
      expect(Object.keys(filters).sort()).toEqual(['actorId', 'eventTypes', 'from', 'to']);
      expect(filters.eventTypes).toEqual(['claim.approved']);

      // The event's own data is not copied into the read record.
      const serialised = JSON.stringify(logs[0]);

      expect(serialised).not.toContain('Ownership verified');
      expect(serialised).not.toContain('against the original receipt');
    });

    it('is written for a read of an empty trail', async () => {
      const service = new AuditTrailService(
        new AuditTrailReader(events),
        new AuditReadRecorder(reads),
        transactions,
      );

      await service.listByParent(administrator, 'claim', parentId, {}, { requestId: 'req-1' });

      const logs = await prisma.auditReadLog.findMany({ where: { administratorId: adminId } });

      expect(logs).toHaveLength(1);
      expect(logs[0]?.resultCount).toBe(0);
    });

    it('is written once per read, and reads are never deduplicated', async () => {
      const service = new AuditTrailService(
        new AuditTrailReader(events),
        new AuditReadRecorder(reads),
        transactions,
      );

      await service.listByParent(administrator, 'claim', parentId, {}, { requestId: 'req-1' });
      await service.listByParent(administrator, 'claim', parentId, {}, { requestId: 'req-2' });

      const logs = await prisma.auditReadLog.findMany({ where: { administratorId: adminId } });

      expect(logs).toHaveLength(2);
      expect(new Set(logs.map((log) => log.id)).size).toBe(2);
    });

    it('refuses a non-administrator without recording anything', async () => {
      const service = new AuditTrailService(
        new AuditTrailReader(events),
        new AuditReadRecorder(reads),
        transactions,
      );

      await expect(
        service.listByParent(member, 'claim', parentId, {}, { requestId: 'req-1' }),
      ).rejects.toThrow();

      const logs = await prisma.auditReadLog.findMany({});

      expect(logs).toHaveLength(0);
    });
  });

  describe('the idempotent retry', () => {
    it('writes one record when the same id is written twice', async () => {
      const recorder = new AuditReadRecorder(reads);
      const id = crypto.randomUUID();

      await transactions.run(async (transaction) => {
        await recorder.record(
          { id, administratorId: adminId, query: 'claim:1', resultCount: 1 },
          transaction,
        );
      });

      // The second write carries the same id, as a retry would.
      await expect(
        transactions.run(async (transaction) => {
          await recorder.record(
            { id, administratorId: adminId, query: 'claim:1', resultCount: 1 },
            transaction,
          );
        }),
      ).rejects.toThrow();

      const logs = await prisma.auditReadLog.findMany({ where: { id } });

      expect(logs).toHaveLength(1);
    });

    it('leaves the trail untouched when the read record cannot be written', async () => {
      await seed('claim.approved', adminId, new Date('2026-10-01T00:00:00Z'));

      // A factory whose transaction always fails, standing in for a database
      // that refuses the insert.
      const failingTransactions = {
        run: async () => {
          throw new Error('the database refused the write');
        },
      };

      const service = new AuditTrailService(
        new AuditTrailReader(events),
        new AuditReadRecorder(reads),
        failingTransactions,
      );

      const result = await service.listByParent(
        administrator,
        'claim',
        parentId,
        {},
        { requestId: 'req-1' },
      );

      // The trail is still returned.
      expect(result.events).toHaveLength(1);
    });
  });
});
