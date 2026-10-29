/**
 * The Prisma report repository's suite — against a **live database**.
 *
 * **Why a live database and not a mock.** This repository's job is to be
 * right about the *schema*: the `@@map` names, the CHECK constraints, the
 * foreign key, the column set. A mock asserts only that the code called the
 * method it was told to call; it cannot catch a column that does not exist,
 * a constraint that is not actually there, or a table that was renamed in
 * the migration but not in the schema.
 *
 * **The column-set assertion is the contract with bolt `006`.** The five
 * visibility readers from bolt `006` select by **physical** column name,
 * against a table whose physical name this bolt owns. If the `reports` table
 * drifts from `PHYSICAL.report`, those readers break at runtime — in
 * production, not in a unit test. So this suite asserts the drift cannot
 * happen silently.
 *
 * The suite is skipped when `DATABASE_URL` is not set, so a checkout
 * without a database still runs the unit suite.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaReportRepository } from './prisma-report-repository';
import { PHYSICAL, TABLES } from './physical-columns';

import { validateReportDraft } from '@/domain/listings';
import type { CampusArea, ValidatedReport } from '@/domain/listings';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const AREAS: readonly CampusArea[] = [
  { value: 'library', label: 'Library', active: true },
];

const NOW = new Date('2026-10-28T12:00:00.000Z');

describeWithDatabase('the report repository (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const repository = new PrismaReportRepository(prisma);

  const reporterId = '00000000-0000-4000-8000-000000000701';

  /** The rows the `reports` table holds, read through raw SQL. */
  async function reportRows(): Promise<Record<string, unknown>[]> {
    return prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT * FROM "reports" ORDER BY "created_at" ASC',
    );
  }

  /** The physical column names of the `reports` table. */
  async function reportColumnNames(): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      TABLES.report,
    );

    return rows.map((row) => row.column_name);
  }

  beforeAll(async () => {
    // The `accounts` table was renamed by this bolt's `@@map`, but its
    // **columns kept their Prisma names** — the rename was of the table
    // only, so these are camelCase. (The `reports` table, written here,
    // uses snake_case physical names throughout.)
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("id") DO NOTHING`,
      reporterId,
      'reporter@example.test',
      'not-a-real-hash',
      'The Reporter',
      'Student',
      'Active',
      false,
    );
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe('DELETE FROM "accounts" WHERE "id" = $1', reporterId);
    await prisma.$disconnect();
  });

  /** A validated report, ready to write. */
  function aValidatedReport(overrides: Partial<ValidatedReport> = {}): ValidatedReport {
    const validated = validateReportDraft(
      {
        type: 'Lost',
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

    return { ...validated, reporterId, ...overrides };
  }

  /** Write a report inside a transaction. */
  async function write(report: ValidatedReport) {
    return prisma.$transaction(async (tx) => repository.create(report, { transaction: tx }));
  }

  describe('the insert', () => {
    it('writes a report and mints its id', async () => {
      const created = await write(aValidatedReport());

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

      const rows = await reportRows();

      expect(rows).toHaveLength(1);
    });

    it('mints an id the caller cannot supply', async () => {
      // The validated report has **no** id — the repository is the only
      // thing that knows how one is produced.
      const report = aValidatedReport();

      expect('id' in report).toBe(false);

      const created = await write(report);

      expect(created.id).toBeTruthy();
    });

    it('writes every field it was given', async () => {
      await write(aValidatedReport());

      const [row] = await reportRows();

      expect(row).toMatchObject({
        type: 'Lost',
        status: 'Open',
        name: 'Brown leather wallet',
        category: 'Wallet',
        description: 'A brown leather wallet with a folded receipt inside.',
        campus_area: 'library',
        exact_place: 'Second floor, east stacks',
        identifying_details: 'Monogram A.B.',
        reporter_id: reporterId,
      });
    });

    it('stores an absent optional field as null, not as an empty string', async () => {
      await write(
        aValidatedReport({ exactPlace: null, identifyingDetails: null, imageRef: null }),
      );

      const [row] = await reportRows();

      // ADR-8: an absent value is `null`. An empty string would make
      // "not provided" indistinguishable from "provided nothing".
      expect(row?.exact_place).toBeNull();
      expect(row?.identifying_details).toBeNull();
      expect(row?.image_ref).toBeNull();
    });

    it('stores the date as a calendar day', async () => {
      await write(aValidatedReport());

      const [row] = await reportRows();

      // The column is a `DATE`, so PostgreSQL returns it at midnight UTC.
      expect(row?.date).toBeInstanceOf(Date);
      expect((row?.date as Date).toISOString().slice(0, 10)).toBe('2026-10-28');
    });

    it('round-trips the report back into the domain shape', async () => {
      const created = await write(aValidatedReport());

      expect(created.name.value).toBe('Brown leather wallet');
      expect(created.description.value).toBe(
        'A brown leather wallet with a folded receipt inside.',
      );
      expect(created.exactPlace?.value).toBe('Second floor, east stacks');
      expect(created.identifyingDetails?.value).toBe('Monogram A.B.');
      expect(created.date.isoDay).toBe('2026-10-28');
    });
  });

  describe('the transaction is required', () => {
    it('refuses a handle that carries no usable transaction', async () => {
      // Falling back to the root client would let a report commit without
      // its audit event — and the audit trail has no correction path.
      await expect(repository.create(aValidatedReport(), { transaction: {} })).rejects.toThrow(
        /transaction/,
      );
    });
  });

  describe('the constraints', () => {
    it('refuses a report whose reporter does not exist', async () => {
      await expect(
        write(aValidatedReport({ reporterId: '00000000-0000-4000-8000-00000000dead' })),
      ).rejects.toThrow();
    });

    it('refuses a name that is too long', async () => {
      await expect(write(aValidatedReport({ name: { value: 'x'.repeat(81), brand: 'name' } }))).rejects.toThrow();
    });

    it('refuses a description that is too long', async () => {
      await expect(
        write(aValidatedReport({ description: { value: 'x'.repeat(2001), brand: 'description' } })),
      ).rejects.toThrow();
    });

    it('refuses a category that is not one of the nine', async () => {
      // The category's CHECK is the database's half of the closed set: even
      // a caller that skipped the domain validator cannot write a category
      // the PRD does not name.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                  "date", "campus_area", "reporter_id", "created_at", "updated_at")
           VALUES ('Lost', 'Open', 'A name', 'Vehicle', 'A description',
                   CURRENT_DATE, 'library', $1, NOW(), NOW())`,
          reporterId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a type that is neither Lost nor Found', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                  "date", "campus_area", "reporter_id", "created_at", "updated_at")
           VALUES ('Misplaced', 'Open', 'A name', 'Wallet', 'A description',
                   CURRENT_DATE, 'library', $1, NOW(), NOW())`,
          reporterId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a date in the future', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                  "date", "campus_area", "reporter_id", "created_at", "updated_at")
           VALUES ('Lost', 'Open', 'A name', 'Wallet', 'A description',
                   CURRENT_DATE + 1, 'library', $1, NOW(), NOW())`,
          reporterId,
        ),
      ).rejects.toThrow();
    });
  });

  describe('the physical schema — the contract with bolt 006', () => {
    it('stores the report in a table named "reports"', async () => {
      const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name IN ($1, $2, $3, $4, $5, $6)`,
        TABLES.report,
        TABLES.account,
        TABLES.claim,
        TABLES.response,
        TABLES.thread,
        TABLES.audit,
      );

      const names = tables.map((row) => row.table_name);

      // The `@@map` renames are what bolt `006`'s readers expect. If a
      // rename were dropped, the readers would fail at runtime.
      expect(names).toContain('reports');
      expect(names).toContain('accounts');
      expect(names).toContain('audit_events');
    });

    it('carries every physical column the visibility readers select', async () => {
      const columns = await reportColumnNames();

      // The readers select by physical name. A column that is missing here
      // would break them — and the failure would only show up in
      // production.
      for (const [field, physicalName] of Object.entries(PHYSICAL.report)) {
        expect(columns).toContain(physicalName);
        expect(field).toBeTruthy();
      }
    });

    it('carries no column beyond the fourteen the design names', async () => {
      const columns = await reportColumnNames();

      // Exactly the fourteen: the eleven the projection names, plus
      // `created_at` and `updated_at`.
      expect([...columns].sort()).toEqual(
        [
          'campus_area',
          'category',
          'created_at',
          'date',
          'description',
          'exact_place',
          'id',
          'identifying_details',
          'image_ref',
          'name',
          'reporter_id',
          'status',
          'type',
          'updated_at',
        ].sort(),
      );
    });

    it('stores no column beyond FR-8 for a report with no extra input', async () => {
      // The "never stored beyond FR-8" assertion, on the **database row**.
      await write(aValidatedReport());

      const rows = await reportRows();

      // The row has exactly the table's columns — no more. An unknown key
      // in a request body cannot become a column or a value.
      expect(Object.keys(rows[0] ?? {}).sort()).toEqual((await reportColumnNames()).sort());
    });

    it('names the sensitive columns exactly as the readers expect', async () => {
      const columns = await reportColumnNames();

      // FR-37's three Sensitive Fields, by physical name.
      expect(columns).toContain('exact_place');
      expect(columns).toContain('identifying_details');
      expect(columns).toContain('image_ref');
    });
  });
});
