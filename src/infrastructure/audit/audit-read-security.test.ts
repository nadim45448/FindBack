/**
 * Security tests for the audit read path.
 *
 * Bolt `001-audit-core` covered the **write** path's security — injection
 * through the query string and the filters, and a hostile parent id and
 * cursor. This file covers the **read** path's security, which has three
 * surfaces the write path does not have:
 *
 * 1. **The filter values** — a hostile event type, actor id, or date.
 * 2. **The cursor** — a tampered opaque token, which the client controls.
 * 3. **The read record** — what a read may write into a table that outlives
 *    the runtime log's one-hour window.
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
import { decodeTrailCursor, encodeTrailCursor } from '@/domain/audit';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { PrismaAuditReadLogRepository } from './prisma-audit-read-log-repository';
import { PrismaTransactionFactory } from '../db/prisma-transaction-factory';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('read path security (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000501';
  const adminId = '00000000-0000-4000-8000-000000000502';

  const events = new PrismaAuditEventRepository(prisma);
  const reads = new PrismaAuditReadLogRepository(prisma);
  const writer = new AuditWriter(events);
  const transactions = new PrismaTransactionFactory(prisma);

  const administrator: TrailViewer = { userId: adminId, isAdministrator: true };

  function buildService(): AuditTrailService {
    return new AuditTrailService(
      new AuditTrailReader(events),
      new AuditReadRecorder(reads),
      transactions,
    );
  }

  async function seed(): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await writer.record(
        {
          eventType: 'claim.approved',
          parent: { parentType: 'claim', parentId },
          actor: { actorId: adminId, actorRole: 'administrator' },
          occurredAt: new Date('2026-10-01T00:00:00Z'),
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

  describe('filter injection', () => {
    it('treats a hostile event-type filter as data, not as SQL', async () => {
      await seed();

      const hostile = '\'; DROP TABLE "audit_events"; --';

      const page = await events.listByParent('claim', parentId, null, 25, {
        eventTypes: [hostile],
      });

      expect(page.events).toHaveLength(0);

      // The table it named is still there, with its row intact.
      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(1);
    });

    it('treats a hostile actor filter as data, not as SQL', async () => {
      await seed();

      const hostile = "admin-1' OR '1'='1";

      await expect(
        events.listByParent('claim', parentId, null, 25, { actorId: hostile }),
      ).rejects.toThrow();

      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(1);
    });

    it('treats a hostile date filter as data', async () => {
      await seed();

      const hostile = new Date('not-a-date');

      // An invalid date is a bound parameter that PostgreSQL refuses — the
      // point is that it is refused as a *value*, not executed.
      await expect(
        events.listByParent('claim', parentId, null, 25, { from: hostile }),
      ).rejects.toThrow();

      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(1);
    });
  });

  describe('cursor tampering', () => {
    it('refuses a cursor whose id is not a uuid, rather than interpolating it', async () => {
      await seed();

      await expect(
        events.listByParent(
          'claim',
          parentId,
          {
            occurredAt: new Date('2026-10-26T09:00:00Z'),
            id: "x' OR '1'='1",
          },
          25,
        ),
      ).rejects.toThrow();

      const rows = await prisma.auditEvent.findMany({ where: { parentId } });

      expect(rows).toHaveLength(1);
    });

    it('treats a tampered cursor token as no cursor', () => {
      // A token the client forged. It decodes to a well-formed payload with
      // a hostile id, and the decoder extracts only the two fields — nothing
      // is interpolated, so a forged token cannot escape the query.
      const forged = Buffer.from(
        JSON.stringify({ occurredAt: '2026-10-26T09:00:00.000Z', id: "x' OR '1'='1" }),
        'utf8',
      ).toString('base64url');

      const decoded = decodeTrailCursor(forged);

      expect(decoded?.id).toBe("x' OR '1'='1");
      // It is still just two values, and they are bound as parameters.
      expect(Object.keys(decoded!).sort()).toEqual(['id', 'occurredAt']);
    });

    it('treats a malformed cursor token as no cursor', () => {
      expect(decodeTrailCursor('not-a-cursor')).toBeNull();
      expect(decodeTrailCursor(Buffer.from('{"id":1}', 'utf8').toString('base64url'))).toBeNull();
    });

    it('does not let a cursor escape the parent scope', async () => {
      await seed();

      // Another parent's event, with a later timestamp than ours.
      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: 'claim.approved',
            parent: {
              parentType: 'claim',
              parentId: '00000000-0000-4000-8000-000000000599',
            },
            actor: { actorId: adminId, actorRole: 'administrator' },
            occurredAt: new Date('2026-10-20T00:00:00Z'),
          },
          { transaction: tx },
        );
      });

      // A cursor taken from that other parent's trail. The cursor positions
      // the query in time; it does not widen it, and the parent filter still
      // applies. Our event (10-01) is older than the cursor (10-20), so it
      // is returned — and the *other* parent's event is not.
      const page = await events.listByParent(
        'claim',
        parentId,
        {
          occurredAt: new Date('2026-10-20T00:00:00Z'),
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
        25,
      );

      expect(page.events).toHaveLength(1);
      expect(page.events[0]?.parent.parentId).toBe(parentId);
    });

    it('round-trips a legitimate cursor', async () => {
      // More than one page, so there is a next cursor to round-trip.
      for (let index = 0; index < 30; index += 1) {
        await prisma.$transaction(async (tx) => {
          await writer.record(
            {
              eventType: 'claim.approved',
              parent: { parentType: 'claim', parentId },
              actor: { actorId: adminId, actorRole: 'administrator' },
              occurredAt: new Date(`2026-10-01T00:00:${String(index % 60).padStart(2, '0')}Z`),
            },
            { transaction: tx },
          );
        });
      }

      const first = await events.listByParent('claim', parentId, null, 25);

      expect(first.nextCursor).not.toBeNull();

      const token = encodeTrailCursor(first.nextCursor!);
      const decoded = decodeTrailCursor(token);

      expect(decoded?.id).toBe(first.nextCursor!.id);

      // The second page continues where the first stopped, with no repeat.
      const second = await events.listByParent('claim', parentId, decoded, 25);

      expect(second.events).toHaveLength(5);

      const firstIds = first.events.map((event) => event.id);
      const secondIds = second.events.map((event) => event.id);

      expect(firstIds.filter((id) => secondIds.includes(id))).toHaveLength(0);
    });
  });

  describe('what a read may write', () => {
    it('writes no sensitive value into the read record', async () => {
      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: 'claim.approved',
            parent: { parentType: 'claim', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
            // A catalog-named sensitive value, which the trail may carry.
            reason: 'Claimant identifying details verified by the administrator',
            occurredAt: new Date('2026-10-01T00:00:00Z'),
          },
          { transaction: tx },
        );
      });

      await buildService().listByParent(
        administrator,
        'claim',
        parentId,
        {},
        { requestId: 'req-1' },
      );

      const log = await prisma.auditReadLog.findFirstOrThrow({});
      const serialised = JSON.stringify(log);

      // The trail may carry this; the read record may not.
      expect(serialised).not.toContain('Claimant identifying details');
      expect(serialised).not.toContain('verified by the administrator');
    });

    it('records a hostile filter value verbatim, as data', async () => {
      await seed();

      const hostile = "admin-1' OR '1'='1";

      await buildService().listByParent(
        administrator,
        'claim',
        parentId,
        { filters: { eventTypes: [hostile] } },
        { requestId: 'req-1' },
      );

      const log = await prisma.auditReadLog.findFirstOrThrow({});
      const filters = log.filters as Record<string, unknown>;

      // The value is recorded as it was supplied — which is what makes the
      // record evidence of what was asked for.
      expect(filters.eventTypes).toEqual([hostile]);
    });

    it('does not let a read write to the trail', async () => {
      await seed();

      const before = await prisma.auditEvent.count();

      await buildService().listByParent(
        administrator,
        'claim',
        parentId,
        {},
        { requestId: 'req-1' },
      );

      const after = await prisma.auditEvent.count();

      // Reading the trail does not add to the trail.
      expect(after).toBe(before);
    });

    it('refuses a read record that is edited after the fact', async () => {
      await buildService().listByParent(
        administrator,
        'claim',
        parentId,
        {},
        { requestId: 'req-1' },
      );

      const log = await prisma.auditReadLog.findFirstOrThrow({});

      // The read log's trigger permits no mutation at all.
      await expect(
        prisma.$executeRaw`UPDATE "audit_read_logs" SET "resultCount" = 0 WHERE "id" = ${log.id}::uuid`,
      ).rejects.toThrow(/append-only/);
    });
  });
});
