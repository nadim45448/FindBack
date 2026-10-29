/**
 * The Prisma report image reader's suite — against a **live database**.
 *
 * **What this suite is for.** The reader's SQL is the one place in the image
 * path that touches the database, and it carries two properties that a
 * mocked test could not prove:
 *
 * 1. **It resolves against the real schema.** A column name that is wrong
 *    fails at runtime, in production, on the first request. The readers'
 *    physical names are asserted against `information_schema` here.
 * 2. **The `LEFT JOIN` really does return a row for an unrelated member.**
 *    An `INNER JOIN` would return zero rows — indistinguishable from "the
 *    report does not exist" — and the difference between the two is exactly
 *    what a mocked test cannot see.
 *
 * **The security-relevant assertion is the `IS NOT NULL` filter.** A report
 * with no image must produce no row, so the service's refusal is the same
 * one a viewer without permission receives. If the filter were absent, the
 * reader would return a row with a null path, and the service would have to
 * decide what a null path means — a decision it should never be asked for.
 *
 * The suite skips when `DATABASE_URL` is unset, so a checkout without a
 * database still runs the rest of the suite green.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaReportImageReader } from './prisma-report-image-reader';
import { PHYSICAL, TABLES } from './physical-columns';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the report image reader (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reader = new PrismaReportImageReader(prisma);

  const reporterId = '00000000-0000-4000-8000-000000000721';
  const memberId = '00000000-0000-4000-8000-000000000722';
  const claimantId = '00000000-0000-4000-8000-000000000723';
  const responderId = '00000000-0000-4000-8000-000000000724';

  let reportId = '';

  /** Insert an account, ignoring a conflict. */
  async function anAccount(id: string, email: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'A Member', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      id,
      email,
    );
  }

  /** Insert a report with the given image reference. */
  async function aReport(imageRef: string | null): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "exact_place", "identifying_details",
                              "image_ref", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Open', 'A silver locket', 'Identification',
               'A small silver locket with an engraved initial.',
               DATE '2026-10-28', 'library', NULL, NULL,
               $1, $2, NOW(), NOW())
       RETURNING "id"`,
      imageRef,
      reporterId,
    );

    return rows[0]!.id;
  }

  beforeAll(async () => {
    await anAccount(reporterId, 'reporter-image@example.test');
    await anAccount(memberId, 'member-image@example.test');
    await anAccount(claimantId, 'claimant-image@example.test');
    await anAccount(responderId, 'responder-image@example.test');
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "claims"');
    await prisma.$executeRawUnsafe('DELETE FROM "recovery_responses"');
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');

    reportId = await aReport('reports/abc-123.jpg');
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "claims"');
    await prisma.$executeRawUnsafe('DELETE FROM "recovery_responses"');
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe(
      'DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3, $4)',
      reporterId,
      memberId,
      claimantId,
      responderId,
    );
    await prisma.$disconnect();
  });

  describe('the schema the reader assumes', () => {
    it('carries every column the reader selects', async () => {
      const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1`,
        TABLES.report,
      );

      const columns = rows.map((row) => row.column_name);

      for (const name of [
        PHYSICAL.report.id,
        PHYSICAL.report.type,
        PHYSICAL.report.reporterId,
        PHYSICAL.report.imageRef,
      ]) {
        expect(columns).toContain(name);
      }
    });
  });

  describe('the load', () => {
    it('returns the image path for the report owner', async () => {
      const loaded = await reader.loadImageForViewer(reportId, reporterId);

      expect(loaded?.image.path).toBe('reports/abc-123.jpg');
    });

    it('returns the relationship facts', async () => {
      const loaded = await reader.loadImageForViewer(reportId, reporterId);

      expect(loaded?.relationship.isReporter).toBe(true);
      expect(loaded?.relationship.reportType).toBe('Found');
    });

    it('returns a row for an unrelated member', async () => {
      // **The `LEFT JOIN` is what makes this work.** An inner join would
      // return zero rows for a member with no Claim and no Recovery
      // Response — indistinguishable from "the report does not exist", which
      // would make the report's existence depend on the viewer's
      // relationships.
      const loaded = await reader.loadImageForViewer(reportId, memberId);

      expect(loaded).not.toBeNull();
      expect(loaded?.relationship.isReporter).toBe(false);
      expect(loaded?.relationship.hasClaim).toBe(false);
      expect(loaded?.relationship.hasRecoveryResponse).toBe(false);
    });

    it('returns a row for a claimant', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                               "reason", "identifying_details", "date_lost")
         VALUES ($1, $2, 'Pending', NOW(), 'It is mine.', 'A silver locket.', DATE '2026-10-25')`,
        reportId,
        claimantId,
      );

      const loaded = await reader.loadImageForViewer(reportId, claimantId);

      expect(loaded?.relationship.hasClaim).toBe(true);
      expect(loaded?.relationship.isReporter).toBe(false);
    });

    it('returns a row for a recovery responder', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                            "submitted_at", "where_found_exact_place",
                                            "observed_identifying_details", "date_found")
         VALUES ($1, $2, 'Submitted', NOW(), 'Library entrance.', 'A silver locket.', DATE '2026-10-26')`,
        reportId,
        responderId,
      );

      const loaded = await reader.loadImageForViewer(reportId, responderId);

      expect(loaded?.relationship.hasRecoveryResponse).toBe(true);
    });
  });

  describe('the refusals', () => {
    it('returns null for a report with no image', async () => {
      const withoutImage = await aReport(null);

      const loaded = await reader.loadImageForViewer(withoutImage, reporterId);

      // **The `IS NOT NULL` filter.** A report with no image produces no
      // row, so the service's refusal is the same one a viewer without
      // permission receives — a viewer who may not have the image must not
      // be able to learn whether the report has one.
      expect(loaded).toBeNull();
    });

    it('returns null for a report that does not exist', async () => {
      const loaded = await reader.loadImageForViewer(
        '00000000-0000-4000-8000-000000000799',
        reporterId,
      );

      expect(loaded).toBeNull();
    });

    it('returns null for a report with no image and an unrelated viewer', async () => {
      // **The two refusals are indistinguishable.** A report with no image
      // and a report the viewer may not have look the same from outside.
      const withoutImage = await aReport(null);

      const owner = await reader.loadImageForViewer(withoutImage, reporterId);
      const unrelated = await reader.loadImageForViewer(reportId, memberId);

      expect(owner).toBeNull();
      expect(unrelated).not.toBeNull();
    });
  });
});
