/**
 * The FR-49 partition suite — bolt `009`'s own suite for the four disjoint
 * member views.
 *
 * **Why this suite exists separately from `prisma-report-listing-reader.test.ts`.**
 * The reader's suite proves the reader works; this suite proves the
 * *partition* is what the story says it is. The two are different claims, and
 * the partition is the one FR-49 makes:
 *
 * 1. **The participation partitions exclude the member's own reports.**
 *    FR-49 says the `claims` partition holds "only Claims they submitted on
 *    **other members'** Found reports". A reader that returned a member's own
 *    Claim on their own report would put the same report in two partitions —
 *    the disjointness the story calls the whole point.
 * 2. **A participation row carries the link to its thread.** FR-49 says the
 *    row shows "a link to the per-Claim thread". A row with a `null`
 *    `threadId` has no link, and the member cannot reach their conversation.
 * 3. **The thread id is the participation's own id.** A thread has no entity
 *    of its own — it is the set of messages hanging from a Claim — and the
 *    route that serves it is `/api/claims/[id]/thread`. So the link is the
 *    Claim's id, and a reader that invented a message id would produce a link
 *    that resolves to nothing.
 *
 * **The suite is against a live database,** because the exclusion has to be
 * *in the query* — and only a real query can show that. A reader that loaded
 * the participation rows and then filtered out the member's own reports
 * would pass a functional test and fail the partition's actual requirement.
 *
 * The suite is skipped when `DATABASE_URL` is not set, so a checkout without
 * a database still runs the unit suite.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { emptyFilter, type ReportPage } from '@/domain/listings';

import { PrismaReportListingReader } from './prisma-report-listing-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

/** The member whose partitions are under test. */
const MEMBER_ID = '00000000-0000-4000-8000-000000000931';

/** The other member whose reports the member's participations hang from. */
const OTHER_MEMBER_ID = '00000000-0000-4000-8000-000000000932';

/** The statuses the default member view permits. */
const MEMBER_STATUSES = ['Open', 'Claim Requested', 'Claim Approved', 'Verification Pending'];

/** A one-based page of 25. */
const FIRST_PAGE: ReportPage = { number: 1, size: 25 };

describeWithDatabase('the FR-49 view partition', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reader = new PrismaReportListingReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'The Partition Member', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'The Other Partition Member', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      MEMBER_ID,
      'partition-member@example.test',
      OTHER_MEMBER_ID,
      'partition-other@example.test',
    );
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe(
      'DELETE FROM "accounts" WHERE "id" IN ($1, $2)',
      MEMBER_ID,
      OTHER_MEMBER_ID,
    );
    await prisma.$disconnect();
  });

  /** Write a report and return its id. */
  async function writeReport(
    options: { reporterId?: string; type?: string; name?: string } = {},
  ): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ($1, 'Open', $3, 'Wallet', 'A partition report description',
               DATE '2026-10-01', 'library', $2::uuid, NOW(), NOW())
       RETURNING "id"`,
      options.type ?? 'Found',
      options.reporterId ?? OTHER_MEMBER_ID,
      options.name ?? 'A partition report',
    );

    return rows[0]?.id ?? '';
  }

  /** Submit a Pending Claim on a report and return its id. */
  async function writeClaim(reportId: string, claimantId: string): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                              "reason", "identifying_details", "date_lost",
                              "created_at", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Pending', NOW(),
               'It is my brown leather wallet.', 'Blue cardholder with a dent.',
               DATE '2026-10-20', NOW(), NOW())
       RETURNING "id"`,
      reportId,
      claimantId,
    );

    return rows[0]?.id ?? '';
  }

  /** Submit a Recovery Response on a report and return its id. */
  async function writeResponse(reportId: string, responderId: string): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                          "campus_area", "where_found_exact_place",
                                          "observed_identifying_details", "date_found",
                                          "submitted_at", "created_at", "updated_at")
       VALUES ($1::uuid, $2::uuid, 'Submitted', 'library', 'Library entrance.',
               'A silver locket.', DATE '2026-10-26',
               NOW(), NOW(), NOW())
       RETURNING "id"`,
      reportId,
      responderId,
    );

    return rows[0]?.id ?? '';
  }

  describe('the participation partitions exclude the member’s own reports', () => {
    it('omits a Claim the member submitted on their own report', async () => {
      // **FR-49 says "other members' Found reports".** A member's own report
      // is in `mine`; a Claim on it would put the report in two partitions.
      const ownReportId = await writeReport({ reporterId: MEMBER_ID });

      await writeClaim(ownReportId, MEMBER_ID);

      const page = await reader.listClaims(
        MEMBER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(0);
      expect(page.total).toBe(0);
    });

    it('omits a Recovery Response the member submitted on their own report', async () => {
      const ownReportId = await writeReport({ reporterId: MEMBER_ID, type: 'Lost' });

      await writeResponse(ownReportId, MEMBER_ID);

      const page = await reader.listRecoveryResponses(
        MEMBER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(0);
      expect(page.total).toBe(0);
    });

    it('keeps a Claim the member submitted on another member’s report', async () => {
      // **The exclusion must not over-reach.** A Claim on someone else's
      // report is exactly what the partition is for.
      const otherReportId = await writeReport({ reporterId: OTHER_MEMBER_ID });

      await writeClaim(otherReportId, MEMBER_ID);

      const page = await reader.listClaims(
        MEMBER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.report.id).toBe(otherReportId);
    });

    it('keeps a Recovery Response the member submitted on another member’s report', async () => {
      const otherReportId = await writeReport({ reporterId: OTHER_MEMBER_ID, type: 'Lost' });

      await writeResponse(otherReportId, MEMBER_ID);

      const page = await reader.listRecoveryResponses(
        MEMBER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.report.id).toBe(otherReportId);
    });

    it('excludes the member’s own report even under a filter that matches it', async () => {
      // **The exclusion is in the query, so it survives every filter.** A
      // keyword that names the member's own report must not bring it back.
      const ownReportId = await writeReport({ reporterId: MEMBER_ID, type: 'Found' });

      await writeClaim(ownReportId, MEMBER_ID);

      const page = await reader.listClaims(
        MEMBER_ID,
        { ...emptyFilter(), keyword: 'partition' },
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(0);
    });
  });

  describe('the participation rows carry the thread link', () => {
    it('links a Claim row to its thread by the Claim’s own id', async () => {
      // **A thread has no entity of its own.** It is the set of messages
      // hanging from a Claim, and the route that serves it is
      // `/api/claims/[id]/thread` — the Claim's id in the path. So the link
      // is the Claim's id, and a reader that invented a message id would
      // produce a link that resolves to nothing.
      const reportId = await writeReport({ reporterId: OTHER_MEMBER_ID });

      const claimId = await writeClaim(reportId, MEMBER_ID);

      const page = await reader.listClaims(
        MEMBER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.threadId).toBe(claimId);
    });

    it('links a Recovery Response row to its thread by the Response’s own id', async () => {
      const reportId = await writeReport({ reporterId: OTHER_MEMBER_ID, type: 'Lost' });

      const responseId = await writeResponse(reportId, MEMBER_ID);

      const page = await reader.listRecoveryResponses(
        MEMBER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows).toHaveLength(1);
      expect(page.rows[0]?.threadId).toBe(responseId);
    });

    it('carries the thread link on a participation whose thread has no messages yet', async () => {
      // **The link is to the conversation, not to a message in it.** A thread
      // with no messages is still the Claim's thread — it is where the member
      // would post — so a `null` here would claim the conversation does not
      // exist, which is a different and wrong claim.
      const reportId = await writeReport({ reporterId: OTHER_MEMBER_ID });

      await writeClaim(reportId, MEMBER_ID);

      const page = await reader.listClaims(
        MEMBER_ID,
        emptyFilter(),
        MEMBER_STATUSES,
        FIRST_PAGE,
      );

      expect(page.rows[0]?.threadId).not.toBeNull();
    });
  });

  describe('the four views are disjoint', () => {
    it('never places the same report in the member’s own two report partitions', async () => {
      // **The property FR-49 calls the point of the partition.** A report the
      // member authored is in `mine` and in no other partition — and the
      // exclusion holds in both directions, whichever partition is read.
      await writeReport({ reporterId: MEMBER_ID, name: 'Mine' });
      await writeReport({ reporterId: OTHER_MEMBER_ID, name: 'Browse' });

      const mine = await reader.listReports(
        'mine',
        emptyFilter(),
        MEMBER_STATUSES,
        MEMBER_ID,
        FIRST_PAGE,
      );

      const browse = await reader.listReports(
        'browse',
        emptyFilter(),
        MEMBER_STATUSES,
        MEMBER_ID,
        FIRST_PAGE,
      );

      const mineIds = new Set(mine.rows.map((row) => row.id));
      const browseIds = browse.rows.map((row) => row.id);

      expect(mineIds.size).toBe(1);
      expect(browseIds).toHaveLength(1);
      expect(browseIds.some((id) => mineIds.has(id))).toBe(false);
    });
  });
});
