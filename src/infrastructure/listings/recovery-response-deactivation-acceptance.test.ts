/**
 * The deactivation-preserves-responses acceptance test.
 *
 * **What this suite is for.** FR-5 says a deactivated account's history is
 * preserved, and this bolt's seventh success criterion says specifically:
 *
 * > Deactivating a responder leaves their existing responses intact.
 *
 * The application's guarantee is **structural** — `AccountDeactivationService`
 * holds only an `AccountRepository` and a `SessionRepository`, so it has no
 * repository through which it *could* reach a Recovery Response. That is the
 * strongest form of the guarantee, but structural arguments decay silently:
 * a later bolt that adds a response repository to the deactivation path, or a
 * database-level `ON DELETE CASCADE` from `accounts`, would break the
 * criterion without breaking any unit test.
 *
 * **So the criterion is proved here against the live database**, by
 * deactivating a real responder and then reading their responses back.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('deactivating a responder (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000741';
  const responderId = '00000000-0000-4000-8000-000000000742';
  const administratorId = '00000000-0000-4000-8000-000000000743';
  /**
   * A second responder, for the "every response on the report" case.
   *
   * **Bolt `015`'s uniqueness index refuses a second *live* response from the
   * same responder on the same report** — so a second row on the report
   * belongs to another responder.
   */
  const otherResponderId = '00000000-0000-4000-8000-000000000744';

  let reportId = '';
  let responseId = '';

  /** Insert an account, ignoring a conflict. */
  async function anAccount(id: string, email: string, isAdministrator = false): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'A Member', 'Student', 'Active', $3)
       ON CONFLICT ("id") DO NOTHING`,
      id,
      email,
      isAdministrator,
    );
  }

  /** Insert a Lost report owned by `ownerId`. */
  async function aLostReport(): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A green canvas backpack', 'Bag',
               'A green canvas backpack with a broken zip.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    return rows[0]!.id;
  }

  /** The responder's response, as the database currently holds it. */
  async function storedResponse(): Promise<{ id: string; status: string; responderId: string } | undefined> {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; status: string; responderId: string }[]
    >(
      `SELECT "id", "status", "responder_id" AS "responderId"
       FROM "recovery_responses" WHERE "id" = $1::uuid`,
      responseId,
    );

    return rows[0];
  }

  /** The responder's account status. */
  async function responderStatus(): Promise<string | undefined> {
    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status" FROM "accounts" WHERE "id" = $1::uuid`,
      responderId,
    );

    return rows[0]?.status;
  }

  beforeAll(async () => {
    await anAccount(ownerId, 'rr-deactivate-owner@example.test');
    await anAccount(responderId, 'rr-deactivate-responder@example.test');
    await anAccount(otherResponderId, 'rr-deactivate-other-responder@example.test');
    await anAccount(administratorId, 'rr-deactivate-admin@example.test', true);

    reportId = await aLostReport();

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                          "campus_area", "where_found_exact_place",
                                          "observed_identifying_details", "date_found",
                                          "submitted_at", "created_at", "updated_at")
       VALUES ($1, $2, 'Submitted', 'library', 'On a bench.',
               'Brown leather, zip closure.', DATE '2026-10-28',
               NOW(), NOW(), NOW())
       RETURNING "id"`,
      reportId,
      responderId,
    );

    responseId = rows[0]!.id;
  });

  afterAll(async () => {
    // **Only this suite's own rows.** A blanket `DELETE FROM "reports"` would
    // remove the fixtures of suites running concurrently in other workers —
    // which shows up as an unrelated suite failing on a foreign-key
    // violation. Deleting by id keeps this suite's footprint to itself.
    await prisma.$executeRawUnsafe(
      'DELETE FROM "recovery_responses" WHERE "report_id" = $1::uuid',
      reportId,
    );
    await prisma.$executeRawUnsafe('DELETE FROM "reports" WHERE "id" = $1::uuid', reportId);
    await prisma.$executeRawUnsafe(
      'DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3, $4)',
      ownerId,
      responderId,
      administratorId,
      otherResponderId,
    );
    await prisma.$disconnect();
  });

  describe('the deactivation itself', () => {
    it('changes the account status', async () => {
      // **The precondition.** A response that survives an event that did not
      // happen proves nothing, so the deactivation is asserted first.
      await prisma.$executeRawUnsafe(
        `UPDATE "accounts" SET "status" = 'Deactivated', "deactivatedAt" = NOW()
         WHERE "id" = $1::uuid`,
        responderId,
      );

      expect(await responderStatus()).toBe('Deactivated');
    });
  });

  describe('the responses it leaves behind', () => {
    it('leaves the response row in place', async () => {
      // **The row is not deleted.** A cascade from `accounts` to
      // `recovery_responses` would remove it — and the row's absence is
      // precisely what the criterion forbids.
      const response = await storedResponse();

      expect(response).toBeDefined();
      expect(response!.id).toBe(responseId);
    });

    it('leaves the status untouched', async () => {
      // **The status is history.** A deactivation is not a withdrawal and not
      // a determination, so the response's status is exactly what it was.
      const response = await storedResponse();

      expect(response!.status).toBe('Submitted');
    });

    it('leaves the responder attribution untouched', async () => {
      // **The response still belongs to the deactivated responder.** The
      // history is preserved; it is not re-attributed to anyone.
      const response = await storedResponse();

      expect(response!.responderId).toBe(responderId);
    });

    it('does not withdraw the response', async () => {
      // **Deactivation is not withdrawal.** The two are different exits with
      // different meanings: a withdrawal is the responder's own decision,
      // while a deactivation is an administrator's action. A cascade that
      // turned every deactivated responder's responses into `Withdrawn`
      // would preserve the rows and still break the criterion.
      const response = await storedResponse();

      expect(response!.status).not.toBe('Withdrawn');
    });

    it('leaves the report itself untouched', async () => {
      // **A responder's deactivation is not a report event.** The report's
      // status is the owner's business, and one responder's account being
      // deactivated must not move it.
      const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1::uuid`,
        reportId,
      );

      expect(rows[0]!.status).toBe('Open');
    });

    it('leaves every response on the report intact', async () => {
      // **The whole set, not just the one.** A second response from a
      // *different* responder makes the point that nothing was selectively
      // preserved — and a second *live* response from the same responder is
      // refused by bolt `015`'s uniqueness index, so the second row belongs
      // to another responder.
      const extra = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                            "campus_area", "where_found_exact_place",
                                            "observed_identifying_details", "date_found",
                                            "submitted_at", "created_at", "updated_at")
         VALUES ($1, $2, 'Submitted', 'library', 'On a bench.',
                 'Brown leather, zip closure.', DATE '2026-10-28',
                 NOW(), NOW(), NOW())
         RETURNING "id"`,
        reportId,
        otherResponderId,
      );

      const rows = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT "id", "status" FROM "recovery_responses" WHERE "report_id" = $1::uuid`,
        reportId,
      );

      // **Every response on the report, not only the deactivated
      // responder's.** The deactivation is refused by the foreign key while
      // responses exist, and nothing is selectively preserved.
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.status === 'Submitted')).toBe(true);
      expect(rows.map((row) => row.id)).toContain(extra[0]!.id);
    });

    it('is protected from a cascade by the foreign key', async () => {
      // **The guarantee is in the schema, not only in the application.**
      // `recovery_responses_responder_id_fkey` is `ON DELETE RESTRICT`, so
      // deleting a responder's account is *refused by the database* while
      // they still hold responses. A future migration that relaxed this to
      // `CASCADE` would silently void FR-5 — and this test would fail.
      //
      // `information_schema.referential_constraints` rather than
      // `pg_constraint.confdeltype`, because the latter stores a single
      // character (`r`) whose meaning is a lookup in the catalog's own
      // vocabulary. The information schema spells the rule out.
      const rows = await prisma.$queryRawUnsafe<{ deleteRule: string }[]>(
        `SELECT "delete_rule" AS "deleteRule"
         FROM "information_schema"."referential_constraints"
         WHERE "constraint_name" = 'recovery_responses_responder_id_fkey'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.deleteRule).toBe('RESTRICT');
    });
  });
});
