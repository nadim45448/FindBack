/**
 * The append-only enforcement, verified against the real database.
 *
 * Story `004-append-only-enforcement` requires that no code path can update or
 * delete a record, and that this holds even against a direct database write
 * bypassing the application. That claim is only worth something if it is
 * tested against PostgreSQL, so this file talks to the database rather than
 * mocking it.
 *
 * The test is skipped when `DATABASE_URL` is not set, so a checkout without a
 * database still runs the unit suite.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('append-only enforcement (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const parentId = '00000000-0000-4000-8000-000000000001';
  const actorId = '00000000-0000-4000-8000-000000000002';

  beforeAll(async () => {
    await clearTrail();
  });

  /**
   * Empty the trail for this test's parent.
   *
   * The trigger refuses a delete, so the cleanup has to set the same
   * transaction-scoped flag the FR-10 path uses. Without this, rows from one
   * test would be visible to the next.
   */
  async function clearTrail(): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`,
      );
      await tx.auditEvent.deleteMany({ where: { parentId } });
    });
  }

  afterAll(async () => {
    await clearTrail();
    await prisma.$disconnect();
  });

  async function seed(): Promise<string> {
    const created = await prisma.auditEvent.create({
      data: {
        eventNumber: 3,
        eventType: 'claim.approved',
        parentType: 'claim',
        parentId,
        actorId,
        actorRole: 'administrator',
      },
    });

    return created.id;
  }

  it('refuses an update', async () => {
    const id = await seed();

    await expect(
      prisma.auditEvent.update({ where: { id }, data: { reason: 'tampered' } }),
    ).rejects.toThrow(/append-only/);
  });

  it('refuses a delete', async () => {
    const id = await seed();

    await expect(prisma.auditEvent.delete({ where: { id } })).rejects.toThrow(/append-only/);
  });

  it('refuses a deleteMany', async () => {
    await seed();

    await expect(prisma.auditEvent.deleteMany({ where: { parentId } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('refuses an out-of-catalog event number', async () => {
    await expect(
      prisma.auditEvent.create({
        data: {
          eventNumber: 31,
          eventType: 'claim.invented',
          parentType: 'claim',
          parentId,
          actorId,
          actorRole: 'administrator',
        },
      }),
    ).rejects.toThrow(/event_number_range/);
  });

  it('accepts any catalog-range number, and leaves the type match to the domain layer', async () => {
    // The database enforces the *range* (1–30). Which number belongs to
    // which type is asserted in the domain layer, by `resolveEventNumber`,
    // because the database has no catalog table to check against — the
    // catalog is code, not configuration.
    const created = await prisma.auditEvent.create({
      data: {
        eventNumber: 4,
        eventType: 'claim.approved',
        parentType: 'claim',
        parentId,
        actorId,
        actorRole: 'administrator',
      },
    });

    expect(created.eventNumber).toBe(4);
  });

  it('accepts a non-numbered record', async () => {
    const created = await prisma.auditEvent.create({
      data: {
        eventNumber: null,
        eventType: 'member_profile.edited',
        parentType: 'account',
        parentId,
        actorId,
        actorRole: 'member',
      },
    });

    expect(created.eventNumber).toBeNull();
  });

  it('refuses an unknown actor role', async () => {
    await expect(
      prisma.auditEvent.create({
        data: {
          eventType: 'claim.approved',
          parentType: 'claim',
          parentId,
          actorId,
          actorRole: 'root',
        },
      }),
    ).rejects.toThrow(/actor_role_check/);
  });

  it('allows a delete inside a transaction that sets the FR-10 flag', async () => {
    await seed();

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`,
      );

      return tx.auditEvent.deleteMany({ where: { parentId } });
    });

    expect(deleted.count).toBeGreaterThan(0);
  });

  it('does not carry the FR-10 flag onto a later transaction', async () => {
    await seed();

    // The previous transaction set the flag. This one did not, so the delete
    // must be refused — the capability cannot outlive the transaction that
    // needed it, which is what makes it safe on a pooled connection.
    await expect(prisma.auditEvent.deleteMany({ where: { parentId } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('reads the trail newest first with a cursor', async () => {
    await clearTrail();

    await prisma.auditEvent.create({
      data: {
        eventNumber: 3,
        eventType: 'claim.approved',
        parentType: 'claim',
        parentId,
        actorId,
        actorRole: 'administrator',
        occurredAt: new Date('2026-10-26T09:00:00Z'),
      },
    });

    await prisma.auditEvent.create({
      data: {
        eventNumber: 4,
        eventType: 'claim.rejected_by_administrator',
        parentType: 'claim',
        parentId,
        actorId,
        actorRole: 'administrator',
        occurredAt: new Date('2026-10-26T10:00:00Z'),
      },
    });

    const rows = await prisma.$queryRaw<Array<{ eventType: string; occurredAt: Date }>>`
      SELECT "eventType", "occurredAt"
      FROM "audit_events"
      WHERE "parentType" = 'claim' AND "parentId" = ${parentId}::uuid
      ORDER BY "occurredAt" DESC, "id" DESC
      LIMIT 25
    `;

    expect(rows[0]?.eventType).toBe('claim.rejected_by_administrator');
    expect(rows[1]?.eventType).toBe('claim.approved');
  });
});
