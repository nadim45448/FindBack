/**
 * The visibility readers' integration suite — against a **live database**.
 *
 * **This is bolt `006`'s outstanding obligation.** Bolt `006` wrote the five
 * visibility readers and proved that the Sensitive Fields are absent from the
 * *generated SQL* — but it could not prove the SQL **resolves against a real
 * schema**, because the `reports` table did not exist yet. This bolt created
 * it, and this suite closes the loop.
 *
 * **A query that names a column the database does not have fails at
 * runtime.** That is the whole risk: a reader whose `SELECT` list says
 * `r.campus_area` against a table whose column is `campusArea` fails on the
 * first real request, in production, with no test having noticed. So the
 * assertion is that the readers' `SELECT` lists resolve against the schema
 * this bolt actually created.
 *
 * **The column-set assertion is the contract.** `PHYSICAL.report` is one
 * artefact that all five readers use. If the `reports` table drifts from it,
 * the readers break — so the drift is asserted to be impossible.
 *
 * **Three of the five readers are still pending.** `claims`,
 * `recovery_responses`, and `thread_messages` are bolt `008`'s tables and
 * do not exist yet. Their readers are exercised by their own bolt; this
 * suite records the fact rather than pretending to cover them.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaAuditTrailVisibilityReader } from './prisma-audit-trail-visibility-reader';
import { PrismaClaimVisibilityReader } from './prisma-claim-visibility-reader';
import { PrismaRecoveryResponseVisibilityReader } from './prisma-recovery-response-visibility-reader';
import { PrismaReportVisibilityReader } from './prisma-report-visibility-reader';
import { PrismaThreadVisibilityReader } from './prisma-thread-visibility-reader';
import { PHYSICAL, TABLES } from './physical-columns';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

import {
  claimSelectColumns,
  reportSelectColumns,
  responseSelectColumns,
  threadSelectColumns,
} from './select-builder';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the visibility readers (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reports = new PrismaReportVisibilityReader(prisma);
  const trail = new PrismaAuditTrailVisibilityReader(prisma);
  const claims = new PrismaClaimVisibilityReader(prisma);
  const responses = new PrismaRecoveryResponseVisibilityReader(prisma);
  const threads = new PrismaThreadVisibilityReader(prisma);

  const reporterId = '00000000-0000-4000-8000-000000000701';

  let reportId = '';

  /** The physical column names of a table. */
  async function columnNames(table: string): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      table,
    );

    return rows.map((row) => row.column_name);
  }

  /** The tables that exist. */
  async function existingTables(): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'`,
    );

    return rows.map((row) => row.table_name);
  }

  beforeAll(async () => {
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
    await clearAuditTablesForTest(prisma);
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "exact_place", "identifying_details",
                              "image_ref", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'Brown leather wallet', 'Wallet',
               'A brown leather wallet with a folded receipt inside.',
               DATE '2026-10-28', 'library', 'Second floor, east stacks',
               'Monogram A.B.', 'reports/abc.jpg', $1, NOW(), NOW())
       RETURNING "id"`,
      reporterId,
    );

    reportId = rows[0]!.id;
  });

  afterAll(async () => {
    // The audit table is append-only — even the test role cannot delete
    // from it without disabling the trigger, which is what the shared
    // test-only helper does.
    await clearAuditTablesForTest(prisma);
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe('DELETE FROM "accounts" WHERE "id" = $1', reporterId);
    await prisma.$disconnect();
  });

  describe('the reports table satisfies PHYSICAL.report', () => {
    it('carries every column the readers select', async () => {
      const columns = await columnNames(TABLES.report);

      for (const name of Object.values(PHYSICAL.report)) {
        expect(columns).toContain(name);
      }
    });

    it('carries no column the readers do not name', async () => {
      const columns = await columnNames(TABLES.report);

      // The projection names eleven columns; the table carries those plus
      // the two timestamps. A column beyond that would be a column no
      // reader selects — a column that could be read by something else.
      const expected = [
        ...Object.values(PHYSICAL.report),
        'created_at',
        'updated_at',
      ];

      expect([...columns].sort()).toEqual([...expected].sort());
    });

    it('is named "reports", as the readers refer to it', async () => {
      const tables = await existingTables();

      expect(tables).toContain('reports');
      expect(tables).toContain('accounts');
      expect(tables).toContain('audit_events');
    });

    it('resolves the report reader\'s SELECT list against the real schema', async () => {
      const columns = await columnNames(TABLES.report);

      // The reader's SELECT list is built from the column set and mapped
      // through `PHYSICAL.report`. Every name it produces must be a real
      // column.
      for (const columnSet of [
        ['anonymous'],
        ['unrelatedMember'],
        ['unrelatedMember', 'claimant'],
        ['unrelatedMember', 'foundReportOwner'],
        ['administrator'],
      ] as const) {
        for (const field of reportSelectColumns(columnSet)) {
          const physicalName = PHYSICAL.report[field as keyof typeof PHYSICAL.report];

          expect(physicalName).toBeDefined();
          expect(columns).toContain(physicalName);
        }
      }
    });
  });

  describe('the report reader runs against the real schema', () => {
    it('loads a report for an unrelated member', async () => {
      const row = await reports.loadReportForViewer(reportId, ['unrelatedMember']);

      expect(row).not.toBeNull();
      expect(row?.id).toBe(reportId);
      expect(row?.name).toBe('Brown leather wallet');
      expect(row?.campusArea).toBe('library');
    });

    it('loads no Sensitive Field for an unrelated member', async () => {
      const row = await reports.loadReportForViewer(reportId, ['unrelatedMember']);

      // **The columns are absent, not empty.** The `SELECT` list omits
      // them, so the driver returns no such key at all — `undefined`, not
      // `null`. That distinction is the evidence: a `null` is
      // indistinguishable from "the column was selected and happens to be
      // empty", whereas an absent key can only mean "the column was
      // never selected". The value was **never loaded**, and then
      // filtered — it was never in the process at all.
      expect(row?.exactPlace).toBeUndefined();
      expect(row?.identifyingDetails).toBeUndefined();
      expect(row?.reporterEmail).toBeUndefined();

      // The reporter's phone is never collected at all — there is no
      // column for it, so it is absent for every viewer, including the
      // ones who may see the other Sensitive Fields.
      expect(row?.reporterPhone).toBeUndefined();
    });

    it('loads the Sensitive Fields for the report owner', async () => {
      const row = await reports.loadReportForViewer(reportId, [
        'unrelatedMember',
        'foundReportOwner',
      ]);

      expect(row?.exactPlace).toBe('Second floor, east stacks');
      expect(row?.identifyingDetails).toBe('Monogram A.B.');
      expect(row?.reporterEmail).toBe('reporter@example.test');
    });

    it('returns the reporter\'s display name for an unrelated member', async () => {
      const row = await reports.loadReportForViewer(reportId, ['unrelatedMember']);

      expect(row?.reporterDisplayName).toBe('The Reporter');
    });

    it('returns null for a report that does not exist', async () => {
      const row = await reports.loadReportForViewer(
        '00000000-0000-4000-8000-00000000dead',
        ['unrelatedMember'],
      );

      expect(row).toBeNull();
    });

    it('reads the last-action timestamp from the audit trail', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "audit_events" ("eventNumber", "eventType", "parentType", "parentId",
                                      "actorId", "actorRole", "occurredAt")
         VALUES (1, 'report.created', 'report', $1, $2, 'member', NOW())`,
        reportId,
        reporterId,
      );

      const row = await reports.loadReportForViewer(reportId, ['unrelatedMember']);

      // The timestamp alone — the event row's content is trail content
      // (FR-32), and is never selected for a non-administrator.
      expect(row?.lastActionAt).toBeTruthy();
    });
  });

  describe('the audit trail reader runs against the real schema', () => {
    it('returns an explicit absence for a non-administrator', async () => {
      const result = await trail.loadTrailForViewer(reportId, ['unrelatedMember']);

      // `null`, not an empty array — "forbidden" must be distinguishable
      // from "empty" (ADR-8).
      expect(result).toBeNull();
    });

    it('loads the trail for an administrator', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "audit_events" ("eventNumber", "eventType", "parentType", "parentId",
                                      "actorId", "actorRole", "occurredAt")
         VALUES (1, 'report.created', 'report', $1, $2, 'member', NOW())`,
        reportId,
        reporterId,
      );

      const result = await trail.loadTrailForViewer(reportId, ['administrator']);

      expect(result).toHaveLength(1);
      expect(result?.[0]?.eventType).toBe('report.created');
    });
  });

  describe('the three readers whose tables are bolt 008\'s', () => {
    it('records that their tables do not exist yet', async () => {
      const tables = await existingTables();

      // The Claim, Recovery Response, and Thread readers are written and
      // their SQL is asserted in `never-loaded.test.ts`. What could not be
      // asserted there is that the SQL resolves — because the tables did
      // not exist. Bolt `008` creates them, and this suite's assertion
      // becomes a run against real tables then.
      expect(tables).not.toContain(TABLES.claim);
      expect(tables).not.toContain(TABLES.response);
      expect(tables).not.toContain(TABLES.thread);
    });

    it('names the columns each of them will need', () => {
      // The obligation, stated now so it cannot be forgotten: when
      // bolt `008` creates these tables, the columns below are the ones
      // the readers already select.
      expect(claimSelectColumns(['administrator'])).toContain('identifyingDetails');
      expect(responseSelectColumns(['unrelatedMember', 'lostReportOwner'])).toContain(
        'whereFoundExactPlace',
      );
      expect(threadSelectColumns()).toEqual([
        'id',
        'parentType',
        'parentId',
        'authorDisplayName',
        'body',
        'postedAt',
      ]);
    });

    it('defers the relationship query, which joins both of them', async () => {
      // **The relationship query is deferred with them, and it is the
      // only reader that joins both.** `loadRelationship` reads the
      // report's existence, the viewer's Claim, and the viewer's Recovery
      // Response in one query — and PostgreSQL resolves a relation name
      // before it can apply a join's semantics, so the query fails
      // against a schema where either table is absent. It therefore
      // cannot run against this bolt's schema at all.
      //
      // The design says so: *"the readers that join `claims` and
      // `recovery_responses` are tested once their tables exist"* — and
      // the report's existence must never depend on the viewer's
      // relationships, which is exactly the property the query's
      // `LEFT JOIN`s protect.
      //
      // **This is not an omission.** The query's shape is asserted in
      // `never-loaded.test.ts` — it must `LEFT JOIN` both tables and
      // never `INNER JOIN` — and the report reader's own path, which is
      // what this bolt exercises, runs against the real schema.
      const tables = await existingTables();

      expect(tables).not.toContain(TABLES.claim);
      expect(tables).not.toContain(TABLES.response);

      // The relationship query needs both — which is the whole reason
      // it is deferred with them rather than tested here.
      expect(TABLES.claim).toBe('claims');
      expect(TABLES.response).toBe('recovery_responses');
    });
  });

  describe('the readers that refuse before they query', () => {
    it('issues no query for a Claim scope that is empty', async () => {
      // The Claim reader's scope is empty, so it must not touch the
      // database at all — a table that does not exist yet is not a reason
      // to issue a query against it.
      const rows = await claims.loadClaimsForViewer(reportId, ['unrelatedMember', 'claimant'], []);

      expect(rows).toEqual([]);
    });

    it('issues no query for a Response scope that is empty', async () => {
      const rows = await responses.loadResponsesForViewer(
        reportId,
        ['unrelatedMember'],
        [],
      );

      expect(rows).toEqual([]);
    });

    it('issues no query for a Thread scope that is empty', async () => {
      const rows = await threads.loadThreadsForViewer([], [], ['unrelatedMember']);

      expect(rows).toEqual([]);
    });
  });
});
