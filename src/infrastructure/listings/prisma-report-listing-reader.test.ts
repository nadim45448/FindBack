/**
 * The report listing reader's suite — against a **live database**.
 *
 * **Why a live database.** Three of this reader's properties are only
 * observable against a real PostgreSQL:
 *
 * 1. **The search is index-backed.** The reader emits a `tsvector` match, and
 *    the migration built a GIN index over the *same expression*. Whether
 *    PostgreSQL uses that index depends on the expression matching
 *    *exactly* — a near-miss silently falls back to a sequential scan, and a
 *    sequential scan is functionally identical. Only `EXPLAIN` can tell the
 *    two apart.
 * 2. **The partition is disjoint by construction.** The `browse` exclusion
 *    has to be *in the query* for the partitions to be disjoint, and only a
 *    real query can show that the exclusion is applied rather than applied
 *    afterwards.
 * 3. **The Sensitive Fields are absent from the result.** The reader selects
 *    a fixed column list, and a real row proves what the list actually
 *    carried.
 *
 * **The query-plan assertion is the load-bearing one.** FR-14's performance
 * target — ≤ 500 ms p95 at 10,000 active reports — is not deliverable
 * without the index, and a functional test cannot detect its absence: the
 * search returns the right rows with or without it, just slowly. The plan
 * assertion is what makes "index-backed" a fact rather than a hope.
 *
 * The suite is skipped when `DATABASE_URL` is not set, so a checkout without
 * a database still runs the unit suite.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  emptyFilter,
  type ReportPage,
} from '@/domain/listings';

import { PrismaReportListingReader, searchVectorExpression } from './prisma-report-listing-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const REPORTER_ID = '00000000-0000-4000-8000-000000000901';
const OTHER_REPORTER_ID = '00000000-0000-4000-8000-000000000902';
const CLAIMANT_ID = '00000000-0000-4000-8000-000000000903';
const RESPONDER_ID = '00000000-0000-4000-8000-000000000904';

/** The statuses the default member view permits. */
const MEMBER_STATUSES = ['Open', 'Claim Requested', 'Claim Approved', 'Verification Pending'];

/** A one-based page of 25. */
const FIRST_PAGE: ReportPage = { number: 1, size: 25 };

describeWithDatabase('the report listing reader (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reader = new PrismaReportListingReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, $3, $4, $5, $6, $7),
              ($8, $9, $3, $10, $5, $6, $7),
              ($11, $12, $3, $13, $5, $6, $7),
              ($14, $15, $3, $16, $5, $6, $7)
       ON CONFLICT ("id") DO NOTHING`,
      REPORTER_ID,
      'listing-reporter@example.test',
      'not-a-real-hash',
      'The Listing Reporter',
      'Student',
      'Active',
      false,
      OTHER_REPORTER_ID,
      'other-reporter@example.test',
      'The Other Reporter',
      CLAIMANT_ID,
      'listing-claimant@example.test',
      'The Listing Claimant',
      RESPONDER_ID,
      'listing-responder@example.test',
      'The Listing Responder',
    );
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe(
      'DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3, $4)',
      REPORTER_ID,
      OTHER_REPORTER_ID,
      CLAIMANT_ID,
      RESPONDER_ID,
    );
    await prisma.$disconnect();
  });

  /** Write a report and return its id. */
  async function writeReport(
    options: {
      name?: string;
      description?: string;
      type?: string;
      status?: string;
      category?: string;
      campusArea?: string;
      reporterId?: string;
      date?: string;
      exactPlace?: string;
      identifyingDetails?: string;
    } = {},
  ): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "exact_place",
                              "identifying_details", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8::uuid, $9, $10, NOW(), NOW())
       RETURNING "id"`,
      options.type ?? 'Found',
      options.status ?? 'Open',
      options.name ?? 'A report name',
      options.category ?? 'Wallet',
      options.description ?? 'A report description',
      options.date ?? '2026-10-01',
      options.campusArea ?? 'library',
      options.reporterId ?? REPORTER_ID,
      options.exactPlace ?? null,
      options.identifyingDetails ?? null,
    );

    return rows[0]?.id ?? '';
  }

  describe('the partition', () => {
    it('gives the member their own reports in the mine partition', async () => {
      await writeReport({ name: 'Mine', reporterId: REPORTER_ID });
      await writeReport({ name: 'Theirs', reporterId: OTHER_REPORTER_ID });

      const page = await reader.listReports(
        'mine',
        emptyFilter(),
        MEMBER_STATUSES,
        REPORTER_ID,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['Mine']);
    });

    it('excludes the member’s own reports in the browse partition', async () => {
      await writeReport({ name: 'Mine', reporterId: REPORTER_ID });
      await writeReport({ name: 'Theirs', reporterId: OTHER_REPORTER_ID });

      const page = await reader.listReports(
        'browse',
        emptyFilter(),
        MEMBER_STATUSES,
        REPORTER_ID,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['Theirs']);
    });

    it('keeps the two partitions disjoint', async () => {
      // **The disjointness is the whole point of FR-49.** The same report
      // must never appear in both.
      await writeReport({ name: 'Mine', reporterId: REPORTER_ID });
      await writeReport({ name: 'Theirs', reporterId: OTHER_REPORTER_ID });

      const mine = await reader.listReports('mine', emptyFilter(), MEMBER_STATUSES, REPORTER_ID, FIRST_PAGE);
      const browse = await reader.listReports('browse', emptyFilter(), MEMBER_STATUSES, REPORTER_ID, FIRST_PAGE);

      const mineIds = new Set(mine.rows.map((row) => row.id));
      const browseIds = new Set(browse.rows.map((row) => row.id));

      for (const id of mineIds) {
        expect(browseIds.has(id)).toBe(false);
      }
    });

    it('places no reporter predicate in the public partition', async () => {
      await writeReport({ name: 'Mine', reporterId: REPORTER_ID });
      await writeReport({ name: 'Theirs', reporterId: OTHER_REPORTER_ID });

      const page = await reader.listReports(
        'public',
        emptyFilter(),
        MEMBER_STATUSES,
        REPORTER_ID,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name).sort()).toEqual(['Mine', 'Theirs']);
    });
  });

  describe('the status view', () => {
    it('excludes the terminal statuses from the member view', async () => {
      // **The reports belong to another member.** The `browse` partition
      // excludes the viewer's own reports, so a fixture authored by the
      // viewer would be excluded for a reason that has nothing to do with
      // the status view.
      await writeReport({ name: 'Open', status: 'Open', reporterId: OTHER_REPORTER_ID });
      await writeReport({ name: 'Returned', status: 'Returned', reporterId: OTHER_REPORTER_ID });
      await writeReport({ name: 'Closed', status: 'Closed', reporterId: OTHER_REPORTER_ID });

      const page = await reader.listReports(
        'browse',
        emptyFilter(),
        MEMBER_STATUSES,
        REPORTER_ID,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['Open']);
    });

    it('includes the terminal statuses for the mine partition', async () => {
      await writeReport({ name: 'Returned', status: 'Returned', reporterId: REPORTER_ID });

      const page = await reader.listReports(
        'mine',
        emptyFilter(),
        [...MEMBER_STATUSES, 'Returned', 'Closed'],
        REPORTER_ID,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['Returned']);
    });
  });

  describe('the filter', () => {
    it('matches the keyword against the name, case-insensitively', async () => {
      await writeReport({ name: 'A Blue Wallet' });
      await writeReport({ name: 'A Red Bag' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), keyword: 'BLUE' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['A Blue Wallet']);
    });

    it('matches the keyword against the description', async () => {
      await writeReport({ name: 'An object', description: 'It is made of denim' });
      await writeReport({ name: 'Another object', description: 'It is made of wood' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), keyword: 'denim' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['An object']);
    });

    it('does not match the keyword against an exact place', async () => {
      // **FR-14 says name and description only.** An exact place is an
      // FR-37 Sensitive Field, and the keyword search must not reach it.
      await writeReport({ name: 'A plain name', exactPlace: 'a secret place' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), keyword: 'secret' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(0);
    });

    it('does not match the keyword against identifying details', async () => {
      // **The same rule, for the other Sensitive Field.**
      await writeReport({ name: 'A plain name', identifyingDetails: 'serial ABC123' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), keyword: 'ABC123' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(0);
    });

    it('filters by the type', async () => {
      await writeReport({ name: 'A lost one', type: 'Lost' });
      await writeReport({ name: 'A found one', type: 'Found' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), type: 'Lost' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['A lost one']);
    });

    it('filters by the category', async () => {
      await writeReport({ name: 'A wallet', category: 'Wallet' });
      await writeReport({ name: 'A bag', category: 'Bag' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), category: 'Bag' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['A bag']);
    });

    it('filters by the campus area', async () => {
      await writeReport({ name: 'At the library', campusArea: 'library' });
      await writeReport({ name: 'At the cafe', campusArea: 'cafe' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), campusArea: 'cafe' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['At the cafe']);
    });

    it('filters by the date range, inclusive at both ends', async () => {
      // **The dates must be in the past.** The schema carries a
      // `reports_date_not_future_check` — a report's date cannot be in the
      // future — so the fixtures stay inside the range the constraint
      // allows.
      await writeReport({ name: 'Before', date: '2026-09-30' });
      await writeReport({ name: 'On the first', date: '2026-10-01' });
      await writeReport({ name: 'On the last', date: '2026-10-20' });
      await writeReport({ name: 'After', date: '2026-10-25' });

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), dateRange: { from: '2026-10-01', to: '2026-10-20' } },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name).sort()).toEqual(['On the first', 'On the last']);
    });

    it('orders by the report’s own date, most recent first', async () => {
      await writeReport({ name: 'Older', date: '2026-09-01' });
      await writeReport({ name: 'Newer', date: '2026-10-20' });

      const page = await reader.listReports(
        'public',
        emptyFilter(),
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows.map((row) => row.name)).toEqual(['Newer', 'Older']);
    });
  });

  describe('the pagination', () => {
    it('counts the whole filtered set, not the page', async () => {
      for (let index = 0; index < 5; index += 1) {
        await writeReport({ name: `Report ${index}` });
      }

      const page = await reader.listReports(
        'public',
        emptyFilter(),
        MEMBER_STATUSES,
        null,
        { number: 1, size: 2 },
      );

      expect(page.rows).toHaveLength(2);
      expect(page.total).toBe(5);
      expect(page.totalPages).toBe(3);
    });

    it('returns the second page', async () => {
      for (let index = 0; index < 5; index += 1) {
        await writeReport({ name: `Report ${index}`, date: `2026-10-0${index + 1}` });
      }

      const page = await reader.listReports(
        'public',
        emptyFilter(),
        MEMBER_STATUSES,
        null,
        { number: 2, size: 2 },
      );

      expect(page.rows).toHaveLength(2);
      expect(page.page).toBe(2);
    });

    it('returns an empty page for a page beyond the end', async () => {
      await writeReport({ name: 'Only one' });

      const page = await reader.listReports(
        'public',
        emptyFilter(),
        MEMBER_STATUSES,
        null,
        { number: 9, size: 25 },
      );

      expect(page.rows).toHaveLength(0);
      expect(page.total).toBe(1);
    });
  });

  describe('the row shape', () => {
    it('carries the FR-38 summary fields and nothing more', async () => {
      await writeReport({
        name: 'A wallet',
        description: 'A private description',
        exactPlace: 'A private place',
        identifyingDetails: 'A private detail',
      });

      const page = await reader.listReports(
        'public',
        emptyFilter(),
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      const row = page.rows[0];

      expect(row).toBeDefined();
      expect(Object.keys(row!).sort()).toEqual([
        'campusArea',
        'category',
        'date',
        'id',
        'name',
        'status',
        'type',
      ]);
    });

    it('reports the date as a calendar day', async () => {
      await writeReport({ name: 'A wallet', date: '2026-10-01' });

      const page = await reader.listReports(
        'public',
        emptyFilter(),
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.rows[0]?.date).toBe('2026-10-01');
    });
  });

  describe('the participation partitions', () => {
    it('lists only the member’s own Claims', async () => {
      const reportId = await writeReport({ name: 'A found wallet' });

      // **A `Pending` Claim carries the submission fields,** because the
      // schema's `claims_pending_fields_check` requires it — a Pending Claim
      // always came from a submission.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                               "reason", "identifying_details", "date_lost",
                               "created_at", "updated_at")
         VALUES ($1::uuid, $2::uuid, 'Pending', NOW(),
                 'It is my brown leather wallet.', 'Blue cardholder with a dent.',
                 DATE '2026-10-20', NOW(), NOW())`,
        reportId,
        CLAIMANT_ID,
      );

      await prisma.$executeRawUnsafe(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                               "reason", "identifying_details", "date_lost",
                               "created_at", "updated_at")
         VALUES ($1::uuid, $2::uuid, 'Pending', NOW(),
                 'It is my brown leather wallet.', 'Blue cardholder with a dent.',
                 DATE '2026-10-20', NOW(), NOW())`,
        reportId,
        RESPONDER_ID,
      );

      const page = await reader.listClaims(
        CLAIMANT_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.report.name).toBe('A found wallet');
      expect(page.rows[0]?.status).toBe('Pending');
    });

    it('lists only the member’s own Recovery Responses', async () => {
      const reportId = await writeReport({ name: 'A lost wallet', type: 'Lost' });

      await prisma.$executeRawUnsafe(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                            "campus_area", "where_found_exact_place",
                                            "observed_identifying_details", "date_found",
                                            "submitted_at", "created_at", "updated_at")
         VALUES ($1::uuid, $2::uuid, 'Submitted', 'library', 'Library entrance.',
                 'A silver locket.', DATE '2026-10-26',
                 NOW(), NOW(), NOW())`,
        reportId,
        RESPONDER_ID,
      );

      const page = await reader.listRecoveryResponses(
        RESPONDER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.report.name).toBe('A lost wallet');
    });

    it('applies the filter to the related report', async () => {
      const matching = await writeReport({ name: 'A blue wallet' });
      const other = await writeReport({ name: 'A red bag' });

      await prisma.$executeRawUnsafe(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                               "reason", "identifying_details", "date_lost",
                               "created_at", "updated_at")
         VALUES ($1::uuid, $3::uuid, 'Pending', NOW(),
                 'It is my blue leather wallet.', 'Blue cardholder with a dent.',
                 DATE '2026-10-20', NOW(), NOW()),
                ($2::uuid, $3::uuid, 'Pending', NOW(),
                 'It is my red fabric bag.', 'Red bag with a torn strap.',
                 DATE '2026-10-20', NOW(), NOW())`,
        matching,
        other,
        CLAIMANT_ID,
      );

      const page = await reader.listClaims(
        CLAIMANT_ID,
        { ...emptyFilter(), keyword: 'blue' },
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.report.name).toBe('A blue wallet');
    });
  });

  describe('the search index', () => {
    it('uses the GIN index rather than a sequential scan', async () => {
      // **The load-bearing assertion of this suite.** FR-14's performance
      // target is not deliverable without the index, and a functional test
      // cannot detect its absence — the rows are the same either way, only
      // the cost differs. The plan is what makes "index-backed" a fact.
      //
      // **Sequential scans are disabled, and that is the whole trick.**
      // PostgreSQL uses an index only when the query's expression matches
      // the index's expression *exactly*; a near-miss silently degrades to
      // a sequential scan. But a sequential scan is also the plan the
      // planner *chooses* when it thinks a scan is cheaper — so asserting
      // "the plan is a bitmap index scan" is asserting the planner's cost
      // arithmetic, which varies with the term, the table size, and the
      // statistics. It fails on a table of 2,000 rows and passes on a table
      // of 10,000 for reasons that have nothing to do with the index.
      //
      // Disabling sequential scans removes the planner's freedom to choose
      // one. The query must then be answered by an index — and if the
      // reader's expression had drifted from the index's, there would be no
      // index it could use and the query would fail outright.
      //
      // **The keyword names one row, and that matters too.** With
      // sequential scans unavailable, a keyword matching *many* rows can
      // still be answered by the `date` index — the planner walks it for
      // the ordering and applies the keyword as a filter. That plan is
      // legitimate, and it proves nothing about the search index. A keyword
      // matching one row has no such alternative: there is no ordering to
      // serve and no scan permitted, so the search index is the only plan
      // left — and the query would fail if the reader's expression did not
      // match it.
      //
      // **The query carries no `ORDER BY` and no status filter, and that is
      // what isolates the claim.** An `ORDER BY date` gives the planner a
      // *better* plan than the search index: it walks `idx_reports_date` for
      // the ordering and applies the keyword as a filter. A status filter
      // does the same through `idx_reports_status_date`. Both plans are
      // index-backed and fast, and both prove nothing about the search
      // index — which is why this assertion used to pass a query that could
      // have lost its search index entirely. With the keyword predicate as
      // the only thing the plan has to satisfy, the search index is the
      // only plan left.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         SELECT 'Found', 'Open', 'A bulk report ' || g, 'Wallet', 'A bulk description ' || g,
                CURRENT_DATE, 'library', $1::uuid, NOW(), NOW()
         FROM generate_series(1, 2000) g`,
        OTHER_REPORTER_ID,
      );

      await prisma.$executeRawUnsafe('ANALYZE "reports"');

      const explained = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

        return tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
          `EXPLAIN (FORMAT TEXT)
           SELECT r."id"
           FROM "reports" r
           WHERE ${searchVectorExpression('r')}
             @@ plainto_tsquery('simple', $1)`,
          '1337',
        );
      });

      const text = explained.map((row) => row['QUERY PLAN']).join('\n');

      // **A bitmap index scan on the search index** is the index-backed plan.
      // With sequential scans unavailable, any other plan would mean the
      // reader's expression does not match the index's.
      expect(text).toMatch(/Bitmap Index Scan on idx_reports_search/);
      expect(text).not.toMatch(/Seq Scan on "reports"/);
    });

    it('still finds the row the keyword names', async () => {
      // **The plan assertion is not enough on its own.** A bitmap index scan
      // over a *wrong* expression would also be index-backed and would also
      // be fast — and would return nothing. This asserts the index returns
      // the row it is supposed to.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         VALUES ('Found', 'Open', 'A silver locket', 'Wallet',
                 'A silver locket was left in the reading room',
                 '2026-10-01', 'library', $1::uuid, NOW(), NOW())`,
        OTHER_REPORTER_ID,
      );

      const page = await reader.listReports(
        'public',
        { ...emptyFilter(), keyword: 'locket' },
        MEMBER_STATUSES,
        null,
        FIRST_PAGE,
      );

      expect(page.total).toBe(1);
      expect(page.rows[0]?.name).toBe('A silver locket');
    });
  });
});
