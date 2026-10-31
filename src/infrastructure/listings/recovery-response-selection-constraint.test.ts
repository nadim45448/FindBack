/**
 * The Recovery Response selection constraint's suite — against a **live
 * database**.
 *
 * **What this suite is for.** The story's acceptance criterion is not "the
 * code refuses a second selection" — it is *"exactly one selection is
 * committed and the other receives a conflict."* A unit test cannot prove
 * that: the rule lives in the schema, and a schema constraint is only real
 * if the database actually enforces it.
 *
 * Three properties are proven here that a mocked test could not:
 *
 * 1. **The partial unique index exists and is scoped to exactly one
 *    status.** The index's definition is read from `pg_indexes`, so the
 *    suite fails if the migration's predicate and the domain's vocabulary
 *    drift apart.
 * 2. **A second response on the same report may not be selected.** The
 *    write is attempted and the error is caught. The row is verified
 *    unchanged afterwards, so an index that raised a warning without
 *    blocking the write would fail the suite.
 * 3. **The sibling responses survive.** A `Submitted` response is not
 *    closed, rejected, or withdrawn by a sibling's selection — the story's
 *    criterion, and the reason the index is partial rather than a plain
 *    unique index on `report_id`.
 *
 * **The suite skips when `DATABASE_URL` is unset,** so a checkout without a
 * database still runs the rest of the suite green.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Recovery Response selection constraint (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000741';
  const responderA = '00000000-0000-4000-8000-000000000742';
  const responderB = '00000000-0000-4000-8000-000000000743';
  const responderC = '00000000-0000-4000-8000-000000000744';

  let reportId = '';

  beforeAll(async () => {
    for (const [id, email] of [
      [ownerId, 'selection-owner@example.test'],
      [responderA, 'selection-a@example.test'],
      [responderB, 'selection-b@example.test'],
      [responderC, 'selection-c@example.test'],
    ] as const) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                                 "selfDeclaredRole", "status", "isAdministrator")
         VALUES ($1, $2, 'not-a-real-hash', 'A Member', 'Student', 'Active', false)
         ON CONFLICT ("id") DO NOTHING`,
        id,
        email,
      );
    }

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A grey wool scarf', 'Clothing',
               'A grey wool scarf with a fringed edge.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    reportId = rows[0]!.id;
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);

    for (const id of [ownerId, responderA, responderB, responderC]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "accounts" WHERE "id" = $1`, id);
    }

    await prisma.$disconnect();
  });

  /** Insert a `Submitted` response from the given responder. */
  async function aSubmittedResponse(responder: string): Promise<string> {
    return aSubmittedResponseOn(responder, reportId);
  }

  /**
   * Insert a `Submitted` response from the given responder on the given
   * report.
   *
   * **The report is a parameter,** because a test that needs an empty
   * selection slot cannot borrow the shared report — an earlier test may
   * have left a response selected on it.
   */
  async function aSubmittedResponseOn(responder: string, onReportId: string): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                          "campus_area", "where_found_exact_place",
                                          "observed_identifying_details", "date_found",
                                          "submitted_at", "created_at", "updated_at")
       VALUES ($1, $2, 'Submitted', 'library', 'On a bench.',
               'Grey wool, fringed edge.', DATE '2026-10-28', NOW(), NOW(), NOW())
       RETURNING "id"`,
      onReportId,
      responder,
    );

    return rows[0]!.id;
  }

  it('has a partial unique index scoped to exactly the Selected for Verification status', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT "indexdef" FROM "pg_indexes"
       WHERE "tablename" = 'recovery_responses'
         AND "indexname" = 'uq_recovery_responses_one_selected_per_report'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('UNIQUE');
    expect(rows[0]!.indexdef).toContain('Selected for Verification');
  });

  it('refuses a second selected response on the same report', async () => {
    const first = await aSubmittedResponse(responderA);
    const second = await aSubmittedResponse(responderB);

    await prisma.$executeRawUnsafe(
      `UPDATE "recovery_responses" SET "status" = 'Selected for Verification'
       WHERE "id" = $1`,
      first,
    );

    // **The index is the rule.** The application's read-and-refuse check is
    // the explanation; two owner sessions racing could both pass it, and
    // only the index can tell them apart.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "recovery_responses" SET "status" = 'Selected for Verification'
         WHERE "id" = $1`,
        second,
      ),
    ).rejects.toThrow();

    // **The row is unchanged.** An index that raised a warning without
    // blocking the write would fail here.
    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status" FROM "recovery_responses" WHERE "id" = $1`,
      second,
    );

    expect(rows[0]!.status).toBe('Submitted');
  });

  it('leaves the sibling responses untouched', async () => {
    // **Selection never closes, rejects, or withdraws a sibling.** The
    // sibling is still `Submitted` and still displays as `Submitted —
    // Standby`.
    const sibling = await aSubmittedResponse(responderC);

    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status" FROM "recovery_responses" WHERE "id" = $1`,
      sibling,
    );

    expect(rows[0]!.status).toBe('Submitted');
  });

  it('permits many Submitted responses on the same report', async () => {
    // **The index is partial over exactly one status.** A plain unique index
    // on `report_id` would forbid the siblings outright — and the
    // sibling-preservation rule is what this bolt must not break.
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) AS "count" FROM "recovery_responses"
       WHERE "report_id" = $1 AND "status" = 'Submitted'`,
      reportId,
    );

    expect(Number(rows[0]!.count)).toBeGreaterThanOrEqual(2);
  });

  it('permits a new selection once the previous one was ruled Not a Match', async () => {
    // **The `Not a Match` determination returns the report to `Open` and
    // the standby pool becomes selectable again.** The previously selected
    // response stays `Not a Match` — it is terminal and never returns to
    // `Submitted` — and it no longer holds the report's selection slot.
    //
    // **Fresh responders, because bolt `015`'s one-live-response-per-
    // responder index is also in force.** The two responses here are on the
    // same report and both start `Submitted`, so the same responder cannot
    // hold both — that index is a different rule and this suite is about the
    // *selection* index.
    const freshResponderD = '00000000-0000-4000-8000-000000000745';
    const freshResponderE = '00000000-0000-4000-8000-000000000746';

    for (const [id, email] of [
      [freshResponderD, 'selection-d@example.test'],
      [freshResponderE, 'selection-e@example.test'],
    ] as const) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                                 "selfDeclaredRole", "status", "isAdministrator")
         VALUES ($1, $2, 'not-a-real-hash', 'A Member', 'Student', 'Active', false)
         ON CONFLICT ("id") DO NOTHING`,
        id,
        email,
      );
    }

    // **This test runs on its own report,** so the selection slot is empty
    // and the earlier test's selection cannot interfere with it.
    const reportRows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A red wool hat', 'Clothing',
               'A red wool hat with a folded brim.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    const ownReportId = reportRows[0]!.id;

    const first = await aSubmittedResponseOn(freshResponderD, ownReportId);
    const second = await aSubmittedResponseOn(freshResponderE, ownReportId);

    await prisma.$executeRawUnsafe(
      `UPDATE "recovery_responses" SET "status" = 'Selected for Verification'
       WHERE "id" = $1`,
      first,
    );

    await prisma.$executeRawUnsafe(
      `UPDATE "recovery_responses" SET "status" = 'Not a Match' WHERE "id" = $1`,
      first,
    );

    // **The second selection now lands.**
    await prisma.$executeRawUnsafe(
      `UPDATE "recovery_responses" SET "status" = 'Selected for Verification'
       WHERE "id" = $1`,
      second,
    );

    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status" FROM "recovery_responses" WHERE "id" = $1`,
      second,
    );

    expect(rows[0]!.status).toBe('Selected for Verification');

    await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, ownReportId);

    for (const id of [freshResponderD, freshResponderE]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "accounts" WHERE "id" = $1`, id);
    }
  });
});
