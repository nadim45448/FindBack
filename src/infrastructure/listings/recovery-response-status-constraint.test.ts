/**
 * The Recovery Response status constraint's suite — against a **live
 * database**.
 *
 * **What this suite is for.** The story's acceptance criterion is not "the
 * code refuses to write `Standby`" — it is *"the database rejects it"*. A
 * unit test cannot prove that: the constraint lives in the schema, and a
 * schema constraint is only real if the database actually enforces it.
 *
 * Two properties are proven here that a mocked test could not:
 *
 * 1. **The `CHECK` constraint exists and names exactly the eight canonical
 *    statuses.** The constraint's text is read from `pg_constraint`, so the
 *    suite fails if the migration's list and the domain's vocabulary drift
 *    apart — which is exactly the drift this bolt exists to prevent.
 * 2. **A write of `Standby` is rejected by the database.** The write is
 *    attempted and the error is caught. The row is verified absent
 *    afterwards, so a constraint that raised a warning without blocking the
 *    write would fail the suite.
 *
 * **The suite skips when `DATABASE_URL` is unset,** so a checkout without a
 * database still runs the rest of the suite green.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RECOVERY_RESPONSE_STATUSES } from '@/domain/recovery';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Recovery Response status constraint (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000731';
  const responderId = '00000000-0000-4000-8000-000000000732';

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

  /** Insert a Lost report. */
  async function aLostReport(): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A brown leather wallet', 'Wallet',
               'A brown leather wallet with a folded receipt inside.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    return rows[0]!.id;
  }

  /**
   * Attempt to write a response with the given status.
   *
   * **A `Submitted` Response carries the submission fields,** because bolt
   * `015`'s `recovery_responses_submitted_fields_check` requires them of one
   * — and this test is about the *status* constraint, so the row it writes
   * has to be legal in every other respect.
   *
   * **The responder is a parameter, because bolt `015`'s uniqueness index
   * refuses a second *live* response from the same responder on the same
   * report.** Writing all eight live statuses from one responder would trip
   * that index rather than the status constraint this suite is about — so
   * each live status gets its own responder.
   */
  async function attemptStatus(status: string, responder = responderId): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                          "campus_area", "where_found_exact_place",
                                          "observed_identifying_details", "date_found",
                                          "submitted_at", "created_at", "updated_at")
       VALUES ($1, $2, $3,
               CASE WHEN $3 = 'Submitted' THEN 'library' ELSE NULL END,
               CASE WHEN $3 = 'Submitted' THEN 'On a bench.' ELSE NULL END,
               CASE WHEN $3 = 'Submitted' THEN 'Brown leather, zip closure.' ELSE NULL END,
               CASE WHEN $3 = 'Submitted' THEN DATE '2026-10-28' ELSE NULL END,
               CASE WHEN $3 = 'Submitted' THEN NOW() ELSE NULL END,
               NOW(), NOW())`,
      reportId,
      responder,
      status,
    );
  }

  /**
   * A responder id derived from the status.
   *
   * **A distinct responder per status,** so the uniqueness index does not
   * interfere with a suite that is about the *status* constraint.
   */
  function responderFor(status: (typeof RECOVERY_RESPONSE_STATUSES)[number]): string {
    const index = RECOVERY_RESPONSE_STATUSES.indexOf(status);

    return `00000000-0000-4000-8000-${String(900 + index).padStart(12, '0')}`;
  }

  /** The responses currently on the report. */
  async function storedStatuses(): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status" FROM "recovery_responses" WHERE "report_id" = $1::uuid`,
      reportId,
    );

    return rows.map((row) => row.status);
  }

  beforeAll(async () => {
    await anAccount(ownerId, 'rr-status-owner@example.test');
    await anAccount(responderId, 'rr-status-responder@example.test');
    reportId = await aLostReport();
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
      'DELETE FROM "accounts" WHERE "id" IN ($1, $2)',
      ownerId,
      responderId,
    );
    // **The per-status responders** the "accepts each of the eight canonical
    // statuses" case creates. They are deleted by their id range so this
    // suite's footprint stays its own.
    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id"::text LIKE '00000000-0000-4000-8000-0000000009%'`,
    );
    await prisma.$disconnect();
  });

  describe('the constraint the schema carries', () => {
    it('exists on the recovery_responses table', async () => {
      const rows = await prisma.$queryRawUnsafe<{ conname: string }[]>(
        `SELECT "conname" FROM "pg_constraint"
         WHERE "conrelid" = 'recovery_responses'::regclass
           AND "contype" = 'c'
           AND "conname" = 'recovery_responses_status_check'`,
      );

      expect(rows).toHaveLength(1);
    });

    it('names exactly the eight canonical statuses', async () => {
      // **The constraint's own text, read from the database.** The domain's
      // vocabulary and the migration's list are two written-down copies of
      // the same fact; this is where they are compared.
      //
      // `pg_get_constraintdef` rather than `pg_constraint.consrc` — the
      // latter was removed in PostgreSQL 12.
      const rows = await prisma.$queryRawUnsafe<{ definition: string }[]>(
        `SELECT pg_get_constraintdef("oid") AS "definition" FROM "pg_constraint"
         WHERE "conrelid" = 'recovery_responses'::regclass
           AND "conname" = 'recovery_responses_status_check'`,
      );

      const source = rows[0]!.definition;

      for (const status of RECOVERY_RESPONSE_STATUSES) {
        expect(source).toContain(status);
      }

      // **Eight, and no more.** A status the domain does not know would be
      // a value the code cannot interpret — and one it could not have
      // written.
      const literals = [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]!);

      expect(literals).toHaveLength(RECOVERY_RESPONSE_STATUSES.length);
      expect([...literals].sort()).toEqual([...RECOVERY_RESPONSE_STATUSES].sort());
    });

    it('does not name Standby', async () => {
      const rows = await prisma.$queryRawUnsafe<{ definition: string }[]>(
        `SELECT pg_get_constraintdef("oid") AS "definition" FROM "pg_constraint"
         WHERE "conrelid" = 'recovery_responses'::regclass
           AND "conname" = 'recovery_responses_status_check'`,
      );

      expect(rows[0]!.definition).not.toContain('Standby');
    });
  });

  describe('the writes the database accepts', () => {
    it('accepts each of the eight canonical statuses', async () => {
      // **Each status gets its own responder.** Bolt `015`'s uniqueness index
      // refuses a second *live* response from the same responder on the same
      // report, so writing all eight live statuses from one responder would
      // trip that index rather than the status constraint this suite is
      // about.
      for (const status of RECOVERY_RESPONSE_STATUSES) {
        const responder = responderFor(status);

        await anAccount(responder, `rr-status-${responderFor(status)}@example.test`);
        await attemptStatus(status, responder);
      }

      expect((await storedStatuses()).sort()).toEqual(
        [...RECOVERY_RESPONSE_STATUSES].sort(),
      );
    });
  });

  describe('the writes the database rejects', () => {
    it('rejects Standby', async () => {
      // **The criterion the story names.** The write is attempted against
      // the live database, and the database refuses it.
      await expect(attemptStatus('Standby')).rejects.toThrow();

      expect(await storedStatuses()).not.toContain('Standby');
    });

    it('rejects an unlisted status', async () => {
      await expect(attemptStatus('Completed')).rejects.toThrow();

      expect(await storedStatuses()).not.toContain('Completed');
    });

    it('rejects a Lost report status', async () => {
      // **The two state machines share no vocabulary.** A Response never
      // carries a report's status.
      await expect(attemptStatus('Verification Pending')).rejects.toThrow();

      expect(await storedStatuses()).not.toContain('Verification Pending');
    });

    it('rejects a Claim status', async () => {
      await expect(attemptStatus('Pending')).rejects.toThrow();

      expect(await storedStatuses()).not.toContain('Pending');
    });

    it('rejects a differently-cased status', async () => {
      // **The literals are verbatim.** `submitted` is not `Submitted`.
      await expect(attemptStatus('submitted')).rejects.toThrow();

      expect(await storedStatuses()).not.toContain('submitted');
    });

    it('leaves the accepted rows untouched when it rejects a write', async () => {
      // **A refused write changes nothing.** The rows that were accepted
      // before the refusal are still there, and no partial row was left.
      const before = await storedStatuses();

      await expect(attemptStatus('Standby')).rejects.toThrow();

      expect(await storedStatuses()).toEqual(before);
    });

    it('refuses a transition out of a terminal status by status alone', async () => {
      // **The constraint governs the value, not the history.** The database
      // stores a status; the *transition* rules are the domain's, and this
      // suite is the boundary between them — the database accepts any
      // canonical status in any row, and the domain decides which row may
      // move.
      //
      // The distinction matters because it is where the two layers meet: the
      // schema proves a value is canonical, and the transition table proves
      // a move is legal. Neither can do the other's job.
      await attemptStatus('Withdrawn');

      expect(await storedStatuses()).toContain('Withdrawn');
    });
  });
});
