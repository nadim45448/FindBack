/**
 * Acceptance-criteria validation.
 *
 * Each test in this file maps to one acceptance criterion of one story in the
 * `006-audit-and-observability` unit. They are collected in one file so the
 * mapping from criterion to test is legible in one place — the test report
 * cites it.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { AuditTrailReader } from '@/application/audit-trail-reader';
import { QuotaMonitor } from '@/application/quota-monitor';
import {
  AUDIT_EVENT_CATALOG,
  NUMBERED_EVENT_CATALOG,
  VERCEL_HOBBY_LIMITS,
  decideRetention,
  type QuotaResource,
} from '@/domain/audit';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { PrismaQuotaSnapshotRepository } from './prisma-quota-snapshot-repository';
import { StaticQuotaLimitProvider } from './static-quota-limit-provider';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('story 001 — append-only audit writes', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000301';
  const adminId = '00000000-0000-4000-8000-000000000303';

  const events = new PrismaAuditEventRepository(prisma);
  const writer = new AuditWriter(events);

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);
  });

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearAuditTablesForTest(prisma);
  });

  it('records every one of the thirty numbered events with its actor and timestamp', async () => {
    for (const catalogEntry of NUMBERED_EVENT_CATALOG) {
      await prisma.$transaction(async (tx) => {
        await writer.record(
          {
            eventType: catalogEntry.type,
            parent: { parentType: 'report', parentId },
            actor: { actorId: adminId, actorRole: 'administrator' },
            occurredAt: new Date('2026-10-26T09:00:00Z'),
          },
          { transaction: tx },
        );
      });
    }

    const rows = await prisma.auditEvent.findMany({ where: { parentId } });

    expect(rows).toHaveLength(30);

    for (const row of rows) {
      expect(row.actorId).toBe(adminId);
      expect(row.occurredAt).toBeInstanceOf(Date);
      expect(row.eventNumber).not.toBeNull();
      expect(row.eventNumber).toBeGreaterThanOrEqual(1);
      expect(row.eventNumber).toBeLessThanOrEqual(30);
    }

    // Each catalog number appears exactly once.
    const numbers = rows.map((row) => row.eventNumber).sort((a, b) => (a ?? 0) - (b ?? 0));

    expect(numbers).toEqual(Array.from({ length: 30 }, (_, index) => index + 1));
  });

  it('carries the event number, actor, target, and timestamp on a stored record', async () => {
    await prisma.$transaction(async (tx) => {
      await writer.record(
        {
          eventType: 'claim.approved',
          parent: { parentType: 'claim', parentId },
          actor: { actorId: adminId, actorRole: 'administrator' },
          occurredAt: new Date('2026-10-26T09:00:00Z'),
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirst({ where: { parentId } });

    expect(row?.eventNumber).toBe(3);
    expect(row?.actorId).toBe(adminId);
    expect(row?.actorRole).toBe('administrator');
    expect(row?.parentType).toBe('claim');
    expect(row?.parentId).toBe(parentId);
    expect(row?.occurredAt).toEqual(new Date('2026-10-26T09:00:00Z'));
  });
});

describeWithDatabase('story 003 — non-numbered audit records', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const accountId = '00000000-0000-4000-8000-000000000311';
  const reportId = '00000000-0000-4000-8000-000000000312';
  const memberId = '00000000-0000-4000-8000-000000000313';
  const adminId = '00000000-0000-4000-8000-000000000314';

  const events = new PrismaAuditEventRepository(prisma);
  const writer = new AuditWriter(events);

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);
  });

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearAuditTablesForTest(prisma);
  });

  it('records an FR-52 profile edit with actor and timestamp and no event number', async () => {
    await prisma.$transaction(async (tx) => {
      await writer.recordNonNumbered(
        {
          eventType: 'member_profile.edited',
          parent: { parentType: 'account', parentId: accountId },
          actor: { actorId: memberId, actorRole: 'member' },
          changedFields: { displayName: 'New name' },
          previousValues: { displayName: 'Old name' },
          occurredAt: new Date('2026-10-26T09:00:00Z'),
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirst({ where: { parentId: accountId } });

    expect(row?.eventNumber).toBeNull();
    expect(row?.eventType).toBe('member_profile.edited');
    expect(row?.actorId).toBe(memberId);
    expect(row?.occurredAt).toBeInstanceOf(Date);
  });

  it('records an FR-53 administrator report edit with the acting administrator, changed fields, and previous values', async () => {
    await prisma.$transaction(async (tx) => {
      await writer.recordNonNumbered(
        {
          eventType: 'report.edited_by_administrator',
          parent: { parentType: 'report', parentId: reportId },
          actor: {
            actorId: adminId,
            actorRole: 'administrator',
            actingAdministratorId: adminId,
          },
          changedFields: { name: 'Edited name' },
          previousValues: { name: 'Original name' },
          occurredAt: new Date('2026-10-26T09:00:00Z'),
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirst({ where: { parentId: reportId } });

    expect(row?.eventNumber).toBeNull();
    expect(row?.actingAdministratorId).toBe(adminId);
    expect(row?.changedFields).toEqual({ name: 'Edited name' });
    expect(row?.previousValues).toEqual({ name: 'Original name' });
  });

  it('shows a non-numbered record alongside numbered events in the same trail', async () => {
    await prisma.$transaction(async (tx) => {
      await writer.record(
        {
          eventType: 'report.created',
          parent: { parentType: 'report', parentId: reportId },
          actor: { actorId: memberId, actorRole: 'member' },
        },
        { transaction: tx },
      );
      await writer.recordNonNumbered(
        {
          eventType: 'report.edited_by_administrator',
          parent: { parentType: 'report', parentId: reportId },
          actor: { actorId: adminId, actorRole: 'administrator' },
          changedFields: { name: 'Edited' },
          previousValues: { name: 'Original' },
        },
        { transaction: tx },
      );
    });

    const reader = new AuditTrailReader(events);
    const result = await reader.listByParent(
      { userId: adminId, isAdministrator: true },
      'report',
      reportId,
      null,
    );

    expect(result.events).toHaveLength(2);

    const numbered = result.events.filter((event) => event.eventNumber !== null);
    const nonNumbered = result.events.filter((event) => event.eventNumber === null);

    expect(numbered).toHaveLength(1);
    expect(nonNumbered).toHaveLength(1);
    expect(nonNumbered[0]?.eventType).toBe('report.edited_by_administrator');
  });

  it('introduces no new event numbers', async () => {
    // The catalog is the whole set of numbers the system may use. The
    // non-numbered records are in it with no number at all.
    const numbers = AUDIT_EVENT_CATALOG.map((entry) => entry.number).filter((number) =>
      Number.isInteger(number),
    );

    expect(numbers).toHaveLength(30);
    expect(Math.max(...numbers)).toBe(30);
    expect(Math.min(...numbers)).toBe(1);
  });
});

describeWithDatabase('story 004 — append-only enforcement', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000321';
  const adminId = '00000000-0000-4000-8000-000000000322';

  const events = new PrismaAuditEventRepository(prisma);
  const writer = new AuditWriter(events);

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);
  });

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearAuditTablesForTest(prisma);
  });

  it('refuses an administrator who attempts to modify a trail entry', async () => {
    const written = await prisma.$transaction(async (tx) => {
      return writer.record(
        {
          eventType: 'claim.approved',
          parent: { parentType: 'claim', parentId },
          actor: { actorId: adminId, actorRole: 'administrator' },
        },
        { transaction: tx },
      );
    });

    // There is no privilege that could succeed: the refusal comes from the
    // database, not from a role check the application performs.
    await expect(
      prisma.auditEvent.update({ where: { id: written.id }, data: { reason: 'tampered' } }),
    ).rejects.toThrow();
  });

  it('refuses an administrator who attempts to delete a trail entry', async () => {
    const written = await prisma.$transaction(async (tx) => {
      return writer.record(
        {
          eventType: 'claim.approved',
          parent: { parentType: 'claim', parentId },
          actor: { actorId: adminId, actorRole: 'administrator' },
        },
        { transaction: tx },
      );
    });

    await expect(prisma.auditEvent.delete({ where: { id: written.id } })).rejects.toThrow();
  });

  it('has no retention or cleanup path that prunes audit records', async () => {
    // The repository exposes no update, delete, or upsert. The database
    // refuses the delete even when it is attempted directly.
    const repository = new PrismaAuditEventRepository(prisma) as unknown as Record<string, unknown>;

    expect(repository.update).toBeUndefined();
    expect(repository.delete).toBeUndefined();
    expect(repository.upsert).toBeUndefined();
    expect(repository.deleteMany).toBeUndefined();

    // And there is no scheduled job in the repository that could do it.
    const jobs = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name ILIKE '%cron%'
    `;

    expect(jobs).toHaveLength(0);
  });

  it('retains the trail of a Returned or Closed report indefinitely', () => {
    expect(decideRetention('report', 'Returned', false).action).toBe('retain');
    expect(decideRetention('report', 'Closed', false).action).toBe('retain');
  });
});

describeWithDatabase('story 006 — operational logging and quota', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const snapshots = new PrismaQuotaSnapshotRepository(prisma);

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

  /** A monitor over a fixed usage reading. */
  function monitorFor(resource: QuotaResource, usedAmount: bigint): QuotaMonitor {
    return new QuotaMonitor(
      new StaticQuotaLimitProvider(),
      {
        async usage(queried: QuotaResource) {
          return { resource: queried, usedAmount };
        },
      },
      snapshots,
    );
  }

  it('surfaces a warning at 70% and at 90% of the Blob storage limit', async () => {
    const at70 = await monitorFor('blob_storage_bytes', 700_000_000n).observe('blob_storage_bytes');
    const at90 = await monitorFor('blob_storage_bytes', 900_000_000n).observe('blob_storage_bytes');

    expect(at70.reading.severity).toBe('warn');
    expect(at90.reading.severity).toBe('critical');
  });

  it('surfaces a warning at 70% and 90% for every other resource', async () => {
    const warningOnly = VERCEL_HOBBY_LIMITS.filter((limit) => !limit.refuses);

    expect(warningOnly.length).toBeGreaterThan(0);

    for (const limit of warningOnly) {
      const at70 = await monitorFor(limit.resource, (limit.limitAmount * 70n) / 100n).observe(
        limit.resource,
      );
      const at90 = await monitorFor(limit.resource, (limit.limitAmount * 90n) / 100n).observe(
        limit.resource,
      );

      expect(at70.reading.severity).toBe('warn');
      expect(at90.reading.severity).toBe('critical');

      // Warned, but never refused.
      expect(at70.reading.refuses).toBe(false);
      expect(at90.reading.refuses).toBe(false);
    }
  });

  it('has no path to purchase, upgrade, or scale out', () => {
    const monitor = new QuotaMonitor(
      new StaticQuotaLimitProvider(),
      {
        async usage(resource) {
          return { resource, usedAmount: 0n };
        },
      },
      snapshots,
    ) as unknown as Record<string, unknown>;

    // There is no upgrade method to call. The response to a quota condition
    // is to surface it, and that is all the interface permits.
    expect(monitor.upgrade).toBeUndefined();
    expect(monitor.purchase).toBeUndefined();
    expect(monitor.scale).toBeUndefined();
    expect(monitor.scaleOut).toBeUndefined();
  });

  it('records a quota reading as a snapshot, never as an action', async () => {
    await monitorFor('blob_storage_bytes', 500_000_000n).observe('blob_storage_bytes');

    const rows = await prisma.quotaSnapshot.findMany({
      where: { resource: 'blob_storage_bytes' },
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.limitAmount).toBe(1_000_000_000n);
  });
});
