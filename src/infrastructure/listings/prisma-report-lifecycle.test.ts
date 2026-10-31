/**
 * The report lifecycle adapters' suite — against a **live database**.
 *
 * **Why a live database.** The lifecycle adapters' job is to be right about
 * the *schema and the statements*: the column set every read selects, the
 * `SET LOCAL` window that ADR-6's trigger reads, the `ON DELETE CASCADE`
 * that takes the dependent records with the report. A mock asserts only that
 * the code called the method it was told to call; it cannot catch a column
 * that does not exist, or a trigger that refuses the delete.
 *
 * **The read is complete, and that is the contract.** `findById` selects the
 * same column set for every read, so a caller comparing "did this field
 * change?" is not comparing against a half-empty projection.
 *
 * The suite is skipped when `DATABASE_URL` is not set, so a checkout without
 * a database still runs the unit suite.
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaAuditTrailDeletion } from './prisma-audit-trail-deletion';
import { PrismaReportRepository } from './prisma-report-repository';

import type { CampusArea, ValidatedReport } from '@/domain/listings';
import { validateReportDraft } from '@/domain/listings';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const AREAS: readonly CampusArea[] = [
  { value: 'library', label: 'Library', active: true },
];

const NOW = new Date('2026-10-29T12:00:00.000Z');

const REPORTER_ID = '00000000-0000-4000-8000-000000000901';

describeWithDatabase('the report lifecycle adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const repository = new PrismaReportRepository(prisma);
  const trailDeletion = new PrismaAuditTrailDeletion();

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("id") DO NOTHING`,
      REPORTER_ID,
      'reporter@example.test',
      'not-a-real-hash',
      'The Reporter',
      'Student',
      'Active',
      false,
    );
  });

  /**
   * Empty the trail.
   *
   * The trigger refuses a delete, so the cleanup has to open the same
   * transaction-scoped window the FR-10 path uses. Without this, rows from
   * one test would be visible to the next.
   */
  async function clearTrail(): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`,
      );
      await tx.auditEvent.deleteMany({});
    });
  }

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await clearTrail();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await clearTrail();
    await prisma.$executeRawUnsafe('DELETE FROM "accounts" WHERE "id" = $1', REPORTER_ID);
    await prisma.$disconnect();
  });

  /** A validated report, ready to write. */
  function aValidatedReport(overrides: Partial<ValidatedReport> = {}): ValidatedReport {
    const validated = validateReportDraft(
      {
        type: 'Found',
        name: 'Brown leather wallet',
        category: 'Wallet',
        description: 'A brown leather wallet with a folded receipt inside.',
        date: '2026-10-28',
        campusArea: 'library',
        exactPlace: 'Second floor, east stacks',
        identifyingDetails: 'Monogram A.B.',
      },
      { now: NOW, campusAreas: AREAS, imageRef: null },
    );

    return { ...validated, reporterId: REPORTER_ID, ...overrides };
  }

  /** Write a report inside a transaction. */
  async function write(report = aValidatedReport()) {
    return prisma.$transaction(async (tx) =>
      repository.create(crypto.randomUUID(), report, { transaction: tx }),
    );
  }

  describe('the read', () => {
    it('reads a report back into the domain shape', async () => {
      const created = await write();

      const found = await repository.findById(created.id);

      expect(found?.name.value).toBe('Brown leather wallet');
      expect(found?.description.value).toBe(
        'A brown leather wallet with a folded receipt inside.',
      );
      expect(found?.exactPlace?.value).toBe('Second floor, east stacks');
      expect(found?.identifyingDetails?.value).toBe('Monogram A.B.');
      expect(found?.date.isoDay).toBe('2026-10-28');
      expect(found?.reporterId).toBe(REPORTER_ID);
    });

    it('reads the Sensitive Fields too', async () => {
      // **The read is complete.** A read that dropped the Sensitive Fields
      // would make the edit path's "did this field change?" comparison
      // report a change every time.
      const created = await write();

      const found = await repository.findById(created.id);

      expect(found?.exactPlace?.value).toBe('Second floor, east stacks');
      expect(found?.identifyingDetails?.value).toBe('Monogram A.B.');
      expect(found?.imageRef).toBeNull();
    });

    it('returns null for a report that does not exist', async () => {
      const found = await repository.findById('00000000-0000-4000-8000-00000000dead');

      expect(found).toBeNull();
    });

    it('reads inside a transaction when one is given', async () => {
      const created = await write();

      const found = await prisma.$transaction(async (tx) =>
        repository.findById(created.id, { transaction: tx }),
      );

      expect(found?.id).toBe(created.id);
    });
  });

  describe('the update', () => {
    it('writes only the fields it was given', async () => {
      const created = await write();

      await prisma.$transaction(async (tx) =>
        repository.update(created.id, { name: 'A new name' }, { transaction: tx }),
      );

      const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        'SELECT * FROM "reports" WHERE "id" = $1::uuid',
        created.id,
      );

      expect(rows[0]?.['name']).toBe('A new name');
      expect(rows[0]?.['category']).toBe('Wallet');
      expect(rows[0]?.['description']).toBe(
        'A brown leather wallet with a folded receipt inside.',
      );
    });

    it('writes the status when the caller asks for it', async () => {
      // **The withdrawal path legitimately writes `{ status: 'Closed' }`.**
      const created = await write();

      await prisma.$transaction(async (tx) =>
        repository.update(created.id, { status: 'Closed' }, { transaction: tx }),
      );

      const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
        'SELECT "status" FROM "reports" WHERE "id" = $1::uuid',
        created.id,
      );

      expect(rows[0]?.status).toBe('Closed');
    });

    it('refuses a status the vocabulary does not name', async () => {
      const created = await write();

      await expect(
        prisma.$transaction(async (tx) =>
          repository.update(created.id, { status: 'Banished' as never }, { transaction: tx }),
        ),
      ).rejects.toThrow();
    });

    it('returns the updated report', async () => {
      const created = await write();

      const updated = await prisma.$transaction(async (tx) =>
        repository.update(created.id, { name: 'A new name' }, { transaction: tx }),
      );

      expect(updated.name.value).toBe('A new name');
      expect(updated.id).toBe(created.id);
    });

    it('moves the updated-at timestamp forward', async () => {
      const created = await write();

      const updated = await prisma.$transaction(async (tx) =>
        repository.update(created.id, { name: 'A new name' }, { transaction: tx }),
      );

      // **The column is set explicitly on every update** — it is not
      // Prisma's `@updatedAt`. The comparison is against the row as the
      // database now holds it, not against the fixture's timestamp.
      const rows = await prisma.$queryRawUnsafe<{ updated_at: Date }[]>(
        'SELECT "updated_at" FROM "reports" WHERE "id" = $1::uuid',
        created.id,
      );

      expect(updated.updatedAt.getTime()).toBe(rows[0]?.updated_at.getTime());
      expect(updated.updatedAt.getTime()).not.toBe(created.updatedAt.getTime());
    });

    it('refuses a handle that carries no usable transaction', async () => {
      const created = await write();

      await expect(
        repository.update(created.id, { name: 'A new name' }, { transaction: {} }),
      ).rejects.toThrow(/transaction/);
    });
  });

  describe('the delete', () => {
    it('removes the report', async () => {
      const created = await write();

      await prisma.$transaction(async (tx) =>
        repository.delete(created.id, { transaction: tx }),
      );

      const found = await repository.findById(created.id);

      expect(found).toBeNull();
    });

    it('refuses a handle that carries no usable transaction', async () => {
      const created = await write();

      await expect(repository.delete(created.id, { transaction: {} })).rejects.toThrow(
        /transaction/,
      );
    });
  });

  describe('the audit trail deletion', () => {
    /** Write an audit event against the report. */
    async function writeAuditEvent(reportId: string): Promise<void> {
      // The `audit_events` table predated the naming convention, so its
      // columns kept their camelCase names — only the table was renamed.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "audit_events" ("eventNumber", "eventType", "parentType", "parentId",
                                      "actorId", "actorRole", "occurredAt", "createdAt")
         VALUES (8, 'report.edited_by_reporter', 'report', $1::uuid,
                 $2::uuid, 'member', NOW(), NOW())`,
        reportId,
        REPORTER_ID,
      );
    }

    it('removes the report\'s audit entries', async () => {
      const created = await write();
      await writeAuditEvent(created.id);

      const deleted = await prisma.$transaction(async (tx) =>
        trailDeletion.deleteForParent('report', created.id, { transaction: tx }),
      );

      expect(deleted).toBe(1);

      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        'SELECT "id" FROM "audit_events" WHERE "parentId" = $1::uuid',
        created.id,
      );

      expect(rows).toEqual([]);
    });

    it('removes nothing for a parent with no entries', async () => {
      const created = await write();

      const deleted = await prisma.$transaction(async (tx) =>
        trailDeletion.deleteForParent('report', created.id, { transaction: tx }),
      );

      expect(deleted).toBe(0);
    });

    it('removes only the named parent\'s entries', async () => {
      const first = await write();
      const second = await write();
      await writeAuditEvent(first.id);
      await writeAuditEvent(second.id);

      await prisma.$transaction(async (tx) =>
        trailDeletion.deleteForParent('report', first.id, { transaction: tx }),
      );

      const rows = await prisma.$queryRawUnsafe<{ parentId: string }[]>(
        'SELECT "parentId" FROM "audit_events"',
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.parentId).toBe(second.id);
    });

    it('refuses a handle that carries no usable transaction', async () => {
      await expect(
        trailDeletion.deleteForParent('report', '00000000-0000-4000-8000-00000000dead', {
          transaction: {},
        }),
      ).rejects.toThrow();
    });

    it('the trigger refuses a delete that did not open the window', async () => {
      // **The append-only rule is enforced by the database,** so a path that
      // tried to delete audit rows without the flag fails at the trigger —
      // not merely at a convention.
      const created = await write();
      await writeAuditEvent(created.id);

      await expect(
        prisma.auditEvent.deleteMany({ where: { parentId: created.id } }),
      ).rejects.toThrow();
    });

    it('the window is transaction-scoped and does not leak', async () => {
      // **`SET LOCAL`, not `SET`.** The flag is discarded at commit, so a
      // reused pooled connection cannot inherit it.
      const created = await write();
      await writeAuditEvent(created.id);

      await prisma.$transaction(async (tx) =>
        trailDeletion.deleteForParent('report', created.id, { transaction: tx }),
      );

      await prisma.$transaction(async (tx) => {
        const flag = await tx.$queryRawUnsafe<{ setting: string }[]>(
          "SELECT current_setting('findback.allow_audit_delete', true) AS setting",
        );

        expect(flag[0]?.setting).not.toBe('on');
      });
    });
  });
});
