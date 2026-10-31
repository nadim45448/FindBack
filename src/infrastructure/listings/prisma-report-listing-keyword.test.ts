/**
 * The FR-14 keyword suite — bolt `009`'s own suite for the partial match.
 *
 * **Why this suite exists separately.** The reader's suite proved the
 * keyword matches a **whole word**: `wallet` finds `A blue wallet`. It
 * never proved the thing FR-14 actually specifies.
 *
 * **FR-14 says "case-insensitive, partial match", and the PRD is
 * normative.** `requirements.md` states that where the PRD and the stories
 * differ, **the PRD wins**, and the PRD says: *"Keyword matches against item
 * name and description (case-insensitive, partial match)."*
 *
 * The previous implementation matched whole tokens — `plainto_tsquery`
 * splits the keyword into lexemes and requires each lexeme to be a token in
 * the document's vector. So a member searching for `walle` was looking for
 * `wallet`, and got **nothing**. Every test that passed was a test of a
 * whole-word match, which is a weaker claim than the one being made.
 *
 * **The partial match has to be index-backed too.** The naive repair —
 * `name ILIKE '%walle%'` — has the right semantics and the wrong plan: a
 * leading-wildcard `ILIKE` has no usable B-tree index, so every search
 * becomes a sequential scan over the reports table, which FR-14 forbids and
 * which the bolt's own success criteria make a claim about. So the suite
 * asserts **both** the matching semantics **and** the plan.
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

/** The reporter the fixtures are authored by. */
const REPORTER_ID = '00000000-0000-4000-8000-000000000941';

/** The statuses the default member view permits. */
const MEMBER_STATUSES = ['Open', 'Claim Requested', 'Claim Approved', 'Verification Pending'];

/** A one-based page of 25. */
const FIRST_PAGE: ReportPage = { number: 1, size: 25 };

describeWithDatabase('the FR-14 keyword match', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reader = new PrismaReportListingReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'The Keyword Reporter', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      REPORTER_ID,
      'keyword-reporter@example.test',
    );
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe('DELETE FROM "accounts" WHERE "id" = $1', REPORTER_ID);
    await prisma.$disconnect();
  });

  /** Write a report and return its id. */
  async function writeReport(options: { name?: string; description?: string } = {}): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Open', $1, 'Wallet', $2,
               DATE '2026-10-01', 'library', $3::uuid, NOW(), NOW())
       RETURNING "id"`,
      options.name ?? 'A report name',
      options.description ?? 'A report description',
      REPORTER_ID,
    );

    return rows[0]?.id ?? '';
  }

  /** Search the public partition and return the names that matched. */
  async function search(keyword: string): Promise<string[]> {
    const page = await reader.listReports(
      'public',
      { ...emptyFilter(), keyword },
      MEMBER_STATUSES,
      null,
      FIRST_PAGE,
    );

    return page.rows.map((row) => row.name);
  }

  describe('the partial match', () => {
    it('matches a prefix of the item name', async () => {
      // **The claim FR-14 makes.** A member searching for `walle` is
      // looking for `wallet`.
      await writeReport({ name: 'A blue wallet' });
      await writeReport({ name: 'A red bag' });

      expect(await search('walle')).toEqual(['A blue wallet']);
    });

    it('matches a prefix of the description', async () => {
      await writeReport({ name: 'An object', description: 'It is made of denim' });
      await writeReport({ name: 'Another object', description: 'It is made of wood' });

      expect(await search('deni')).toEqual(['An object']);
    });

    it('matches a substring in the middle of the name', async () => {
      // **Not only a prefix.** A substring anywhere in the field is a
      // partial match.
      await writeReport({ name: 'A blue wallet' });
      await writeReport({ name: 'A red bag' });

      expect(await search('lue wal')).toEqual(['A blue wallet']);
    });

    it('matches the whole word as well as the prefix', async () => {
      // **The whole-word match must survive.** The partial form is an
      // addition to the matching, not a replacement of it.
      await writeReport({ name: 'A blue wallet' });

      expect(await search('wallet')).toEqual(['A blue wallet']);
    });

    it('matches case-insensitively', async () => {
      await writeReport({ name: 'A Blue Wallet' });
      await writeReport({ name: 'A red bag' });

      expect(await search('WALLE')).toEqual(['A Blue Wallet']);
      expect(await search('blUe')).toEqual(['A Blue Wallet']);
    });

    it('matches a keyword spanning more than one word', async () => {
      // **The words are AND-ed, and each is matched partially.** A member
      // searching "blue wal" is looking for the blue wallet.
      await writeReport({ name: 'A blue wallet' });
      await writeReport({ name: 'A red bag' });

      expect(await search('blue wal')).toEqual(['A blue wallet']);
    });

    it('matches nothing when the keyword names no part of the fields', async () => {
      await writeReport({ name: 'A blue wallet' });

      expect(await search('zzz')).toEqual([]);
    });

    it('does not match a keyword against an exact place', async () => {
      // **FR-14 says name and description only.** An exact place is an
      // FR-37 Sensitive Field, and the keyword search must not reach it.
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "exact_place",
                                "created_at", "updated_at")
         VALUES ('Found', 'Open', 'A plain name', 'Wallet', 'A plain description',
                 DATE '2026-10-01', 'library', $1::uuid, 'a secret place',
                 NOW(), NOW())
         RETURNING "id"`,
        REPORTER_ID,
      );

      expect(rows).toHaveLength(1);

      expect(await search('secret')).toEqual([]);
      expect(await search('secr')).toEqual([]);
    });

    it('does not match a keyword against identifying details', async () => {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "identifying_details",
                                "created_at", "updated_at")
         VALUES ('Found', 'Open', 'A plain name', 'Wallet', 'A plain description',
                 DATE '2026-10-01', 'library', $1::uuid, 'serial ABC123',
                 NOW(), NOW())
         RETURNING "id"`,
        REPORTER_ID,
      );

      expect(rows).toHaveLength(1);

      expect(await search('ABC123')).toEqual([]);
      expect(await search('ABC12')).toEqual([]);
    });
  });

  describe('the keyword is a literal, not a pattern', () => {
    it('does not treat an underscore as a single-character wildcard', async () => {
      // **`ILIKE` treats `_` as "any single character".** A member searching
      // for `blue_bag` means the underscore, not "blue, any character, bag".
      await writeReport({ name: 'A blueXbag' });
      await writeReport({ name: 'A blue_bag' });

      expect(await search('blue_bag')).toEqual(['A blue_bag']);
    });

    it('does not treat a percent sign as a wildcard', async () => {
      await writeReport({ name: 'A blue bag' });

      // **A bare `%` would match every row** if it reached `ILIKE` as a
      // wildcard.
      expect(await search('%')).toEqual([]);
    });

    it('does not raise on a keyword carrying a text-search operator', async () => {
      // **`!` is PostgreSQL's NOT operator.** `to_tsquery` reads it as
      // syntax, and a keyword carrying it is a syntax error — a 500, not a
      // search result. The domain reduces the keyword to its lexemes, so
      // the parser never sees it.
      await writeReport({ name: 'A blue wallet' });

      expect(await search('blue ! red')).toEqual([]);
      expect(await search('blue & red')).toEqual([]);
      expect(await search('blue | red')).toEqual([]);
      expect(await search('a "quoted phrase"')).toEqual([]);
    });

    it('does not treat a keyword of only punctuation as a match-everything', async () => {
      await writeReport({ name: 'A blue wallet' });

      // **A keyword with no lexemes has no text to match.** A match on
      // nothing is every row, which is not what a search for `!!!` means.
      expect(await search('!!!')).toEqual([]);
    });
  });

  describe('the query plan', () => {
    it('answers the partial match from the trigram index rather than a scan', async () => {
      // **The load-bearing assertion of this suite.** The partial match is
      // the *right* semantics and the *wrong* plan if it is a sequential
      // scan — and FR-14 forbids the scan outright: "Search and listing
      // queries must be index-backed. A full scan over reports is not
      // acceptable at this data volume."
      //
      // **Sequential scans are disabled for the plan assertion, because the
      // planner's choice is not the claim.** With sequential scans
      // unavailable the query *must* be answered by an index.
      //
      // **The table is seeded and analysed, and the query carries no
      // `ORDER BY`.** On an empty table the planner prefers *any* index it
      // can find and applies the keyword as a filter — a plan that is
      // index-backed but proves nothing about the search index. And an
      // `ORDER BY date` gives the planner a *better* alternative than the
      // trigram index: it walks the `date` index for the ordering and
      // filters as it goes, which it can do whether or not the search
      // index exists. Removing the ordering leaves the keyword predicate as
      // the only thing the plan has to satisfy — so with sequential scans
      // unavailable, the trigram index is the only plan left, and the query
      // would fail if the operator class did not match it.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         SELECT 'Found', 'Open', 'A bulk report ' || g, 'Wallet', 'A bulk description ' || g,
                CURRENT_DATE, 'library', $1::uuid, NOW(), NOW()
         FROM generate_series(1, 2000) g`,
        REPORTER_ID,
      );

      await prisma.$executeRawUnsafe('ANALYZE "reports"');

      const explained = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

        return tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
          `EXPLAIN (FORMAT TEXT)
           SELECT r."id"
           FROM "reports" r
           WHERE r."name" ILIKE '%walle%'`,
        );
      });

      const text = explained.map((row) => row['QUERY PLAN']).join('\n');

      // **A bitmap index scan on the trigram index** is the index-backed
      // plan. With sequential scans unavailable, any other plan would mean
      // the reader's operator class does not match the index's.
      expect(text).toMatch(/idx_reports_name_trgm/);
      expect(text).not.toMatch(/Seq Scan on "reports"/);
    });
  });
});
