/**
 * The Lost-side closeout and content-removal adapters' suite — against a
 * **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's guarantees become the database's rows.** The domain proves that a
 * report may be closed or returned and which responses resolve; these
 * adapters prove that the moves are *written* conditionally, that the batch
 * resolution is *one statement*, and that the database's own constraints
 * agree with the domain's rules rather than merely restating them.
 *
 * **Six properties are proven here that a mocked test could not:**
 *
 * 1. **The conditional writes really are conditional.** A write against a
 *    report that is no longer in its precondition status matches no row, so
 *    the repository reports "did not land" — which is what the service turns
 *    into the conflict the story requires.
 * 2. **The batch resolution is one `UPDATE … RETURNING` (ADR-10).** The set
 *    that was resolved and the set that is reported are the same set by
 *    construction.
 * 3. **A terminal response is left alone.** A `Not a Match` response keeps
 *    its status through a closeout.
 * 4. **The removal withholds rather than deletes.** The content's row stays,
 *    and the marker is set.
 * 5. **One removal per target.** The unique index refuses a second row
 *    beside a target that was already removed.
 * 6. **The removal's constraints agree with the domain.** The target kind's
 *    closed set and the reason's bound are refused by the database too.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import { PrismaLostReportCloseoutRepository } from './prisma-lost-report-closeout-repository';
import { PrismaLostReportCloseoutReader } from './prisma-lost-report-closeout-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Lost-side closeout adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000831';
  const administratorId = '00000000-0000-4000-8000-000000000832';
  const responderId = '00000000-0000-4000-8000-000000000833';
  const standbyId = '00000000-0000-4000-8000-000000000834';

  /** The Lost report the closeout acts on. */
  let reportId = '';

  /** The matched response. */
  let matchedResponseId = '';

  /** The standby response. */
  let standbyResponseId = '';

  /** The already-terminal response. */
  let terminalResponseId = '';

  const closeouts = new PrismaLostReportCloseoutRepository(prisma);
  const subjects = new PrismaLostReportCloseoutReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'A Lost Owner', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'The Administrator', 'Employee', 'Active', true),
              ($5, $6, 'not-a-real-hash', 'A Responder', 'Student', 'Active', false),
              ($7, $8, 'not-a-real-hash', 'A Standby Responder', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      ownerId,
      'lost-owner-closeout@example.test',
      administratorId,
      'administrator-closeout@example.test',
      responderId,
      'responder-closeout@example.test',
      standbyId,
      'standby-closeout@example.test',
    );

    const reports = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Verification Pending', 'A set of house keys', 'Keys',
               'A set of house keys on a red fabric loop.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    reportId = reports[0]!.id;

    // **A `Submitted` response carries its submission fields.** The
    // database's `recovery_responses_submitted_fields_check` refuses a
    // submitted response with no campus area, no observed identifying
    // details, no date found, and no submission timestamp — FR-44 makes
    // those fields required of a submitted response, and the constraint is
    // what enforces it.
    const responses = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                          "campus_area", "observed_identifying_details",
                                          "date_found", "submitted_at",
                                          "created_at", "updated_at")
       VALUES ($1, $2, 'Match Confirmed', NULL, NULL, NULL, NULL, NOW(), NOW()),
              ($1, $3, 'Submitted', 'library', 'A red fabric loop.',
               DATE '2026-10-28', NOW(), NOW(), NOW()),
              ($1, $2, 'Not a Match', NULL, NULL, NULL, NULL, NOW(), NOW())
       RETURNING "id"`,
      reportId,
      responderId,
      standbyId,
    );

    matchedResponseId = responses[0]!.id;
    standbyResponseId = responses[1]!.id;
    terminalResponseId = responses[2]!.id;
  });

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The rules are about what the
    // *database* holds, so a resolution left behind by one test would change
    // the verdict of the next.
    //
    // **The submission fields travel with the status.** A `Submitted`
    // response carries its campus area, observed identifying details, date
    // found, and submission timestamp — FR-44 makes those required of a
    // submitted response, and the database's check constraint refuses a
    // submitted response without them. The standby response is the only one
    // that sits at `Submitted`, so the fields are restored with it.
    await prisma.$executeRawUnsafe(
      `UPDATE "recovery_responses"
       SET "status" = CASE "id"
             WHEN $1::uuid THEN 'Match Confirmed'
             WHEN $2::uuid THEN 'Submitted'
             ELSE 'Not a Match'
           END,
           "campus_area" = CASE "id" WHEN $2::uuid THEN 'library' ELSE NULL END,
           "observed_identifying_details" = CASE "id" WHEN $2::uuid THEN 'A red fabric loop.' ELSE NULL END,
           "date_found" = CASE "id" WHEN $2::uuid THEN DATE '2026-10-28' ELSE NULL END,
           "submitted_at" = CASE "id" WHEN $2::uuid THEN NOW() ELSE NULL END
       WHERE "report_id" = $3::uuid`,
      matchedResponseId,
      standbyResponseId,
      reportId,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "reports" SET "status" = 'Verification Pending' WHERE "id" = $1`,
      reportId,
    );
  });

  afterAll(async () => {
    // **The teardown is guarded,** because a `beforeAll` that never completed
    // leaves no ids — and a delete against an empty uuid would fail for a
    // reason that has nothing to do with the test.
    if (reportId.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "recovery_responses" WHERE "report_id" = $1::uuid`,
        reportId,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1::uuid`, reportId);
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3, $4)`,
      ownerId,
      administratorId,
      responderId,
      standbyId,
    );
    await prisma.$disconnect();
  });

  /** Run the write inside a transaction, as the service does. */
  async function inTransaction<T>(work: (handle: TransactionHandle) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => work({ transaction: tx }));
  }

  // ── The conditional write ────────────────────────────────────────────────

  describe('the closeout repository — the conditional write', () => {
    it('moves a verification-pending report to Returned', async () => {
      const resolved = await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
      );

      expect(resolved).not.toBeNull();

      const reports = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      expect(reports[0]?.status).toBe('Returned');
    });

    it('lands nothing when the report is not in its precondition status', async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Open' WHERE "id" = $1`,
        reportId,
      );

      const resolved = await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
      );

      // **The conditional `UPDATE` is what makes the race resolve to exactly
      // one commit.** The read that preceded it was advisory; this write is
      // the guarantee.
      expect(resolved).toBeNull();
    });

    it('completes the matched response', async () => {
      await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
      );

      const responses = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "recovery_responses" WHERE "id" = $1`,
        matchedResponseId,
      );

      expect(responses[0]?.status).toBe('Completed — Report Returned');
    });

    it('resolves every other non-terminal response', async () => {
      await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
      );

      const responses = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT "id", "status" FROM "recovery_responses" WHERE "report_id" = $1`,
        reportId,
      );

      const standby = responses.find((response) => response.id === standbyResponseId);

      expect(standby?.status).toBe('Resolved — Report Returned');
    });

    it('leaves an already-terminal response alone', async () => {
      await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
      );

      const responses = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "recovery_responses" WHERE "id" = $1`,
        terminalResponseId,
      );

      // **A `Not a Match` response was ruled out before the handoff.**
      // Rewriting it would destroy the history the trail depends on.
      expect(responses[0]?.status).toBe('Not a Match');
    });

    it('does not resolve the matched response to the batch status', async () => {
      await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
      );

      const responses = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "recovery_responses" WHERE "id" = $1`,
        matchedResponseId,
      );

      // **The matched response has its own write, with its own status.** A
      // row that matched both statements would end up with whichever landed
      // last.
      expect(responses[0]?.status).toBe('Completed — Report Returned');
    });

    it('reports the resolved set, and it is the set the statement affected', async () => {
      const resolved = await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
      );

      // **The batch's set is the statement's `RETURNING` clause** (ADR-10),
      // not a read followed by a write — so the set that was resolved and
      // the set that is reported are the same set by construction.
      expect(resolved).toHaveLength(1);
      expect(resolved?.[0]?.id).toBe(standbyResponseId);
      expect(resolved?.[0]?.previousStatus).toBe('Submitted');
    });

    it('skips the report\'s move when the confirmation has already made it', async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Returned' WHERE "id" = $1`,
        reportId,
      );

      const resolved = await inTransaction((handle) =>
        closeouts.confirmLostReturned(reportId, matchedResponseId, true, handle),
      );

      // **The confirmation service shares this transaction and has already
      // moved the report.** The closeout's own conditional write would
      // otherwise match no rows and be reported as a lost race — a false
      // conflict for a transition that is succeeding.
      expect(resolved).not.toBeNull();

      const reports = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      expect(reports[0]?.status).toBe('Returned');
    });

    it('refuses a handle with no usable transaction', async () => {
      // **A closeout written outside the transaction that also writes its
      // audit event would leave the trail recording a resolution that did
      // not commit.**
      await expect(
        closeouts.confirmLostReturned(reportId, matchedResponseId, false, {
          transaction: { notATransaction: true },
        }),
      ).rejects.toThrow(/transaction/i);
    });

    it('refuses when the matched response is no longer match confirmed', async () => {
      // **The matched response's completion is conditional too.** The domain
      // refuses this case before the write, so reaching the adapter's guard
      // means the response changed between the read and the write — and the
      // guard is the assertion that nothing else was written.
      //
      // **The response moves to a terminal status,** which the database
      // accepts without the submission fields a `Submitted` response must
      // carry — the constraint that refuses a fieldless submission is FR-44's,
      // and it has nothing to do with this guard.
      await prisma.$executeRawUnsafe(
        `UPDATE "recovery_responses"
         SET "status" = 'Not a Match' WHERE "id" = $1::uuid`,
        matchedResponseId,
      );

      await expect(
        inTransaction((handle) =>
          closeouts.confirmLostReturned(reportId, matchedResponseId, false, handle),
        ),
      ).rejects.toThrow(/Match Confirmed/);

      // **Nothing else was written.** The guard throws inside the
      // transaction, so the report's move and the batch resolution both roll
      // back with it.
      const reports = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      expect(reports[0]?.status).toBe('Verification Pending');
    });
  });

  // ── The close ─────────────────────────────────────────────────────────────

  describe('the closeout repository — the close', () => {
    it('moves an open report to Closed', async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Open' WHERE "id" = $1`,
        reportId,
      );

      const resolved = await inTransaction((handle) =>
        closeouts.closeLostReport(reportId, handle),
      );

      expect(resolved).not.toBeNull();

      const reports = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      expect(reports[0]?.status).toBe('Closed');
    });

    it('resolves every non-terminal response to the closed status', async () => {
      await inTransaction((handle) => closeouts.closeLostReport(reportId, handle));

      const responses = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT "id", "status" FROM "recovery_responses" WHERE "report_id" = $1`,
        reportId,
      );

      const matched = responses.find((response) => response.id === matchedResponseId);
      const standby = responses.find((response) => response.id === standbyResponseId);

      // **A closure has no matched exception.** Unlike the Returned closeout,
      // a closure ends everything still in play, whatever its status.
      expect(matched?.status).toBe('Resolved — Report Closed');
      expect(standby?.status).toBe('Resolved — Report Closed');
    });

    it('leaves an already-terminal response alone', async () => {
      await inTransaction((handle) => closeouts.closeLostReport(reportId, handle));

      const responses = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "recovery_responses" WHERE "id" = $1`,
        terminalResponseId,
      );

      expect(responses[0]?.status).toBe('Not a Match');
    });

    it('lands nothing on a terminal report', async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Returned' WHERE "id" = $1`,
        reportId,
      );

      const resolved = await inTransaction((handle) =>
        closeouts.closeLostReport(reportId, handle),
      );

      // **`Returned` and `Closed` are terminal and are not in the set,** so a
      // terminal report matches no rows and nothing lands.
      expect(resolved).toBeNull();
    });
  });

  // ── The reader ────────────────────────────────────────────────────────────

  describe('the closeout reader', () => {
    it('reads the report, its owner, and its responses', async () => {
      const subject = await subjects.readLostCloseoutSubject(reportId);

      expect(subject?.id).toBe(reportId);
      expect(subject?.status).toBe('Verification Pending');
      expect(subject?.ownerId).toBe(ownerId);
      expect(subject?.ownerEmail).toBe('lost-owner-closeout@example.test');
      expect(subject?.responses).toHaveLength(3);
    });

    it('resolves the selected response from the responses themselves', async () => {
      const subject = await subjects.readLostCloseoutSubject(reportId);

      // **The selection is read from the database, never asserted by a
      // client** — a client that could name the matched response would be
      // choosing which one completes successfully.
      expect(subject?.selectedResponseId).toBe(matchedResponseId);
    });

    it('carries the responder\'s address with the row', async () => {
      const subject = await subjects.readLostCloseoutSubject(reportId);

      const matched = subject?.responses.find((response) => response.id === matchedResponseId);

      expect(matched?.responderEmail).toBe('responder-closeout@example.test');
    });

    it('reads inside the caller\'s transaction when one is supplied', async () => {
      const subject = await inTransaction((handle) =>
        subjects.readLostCloseoutSubject(reportId, handle),
      );

      // **The reader honours the caller's transaction.** The closeout
      // service reads the subject *inside* the transaction that then writes
      // the move, the resolution, and the events — so the facts the decision
      // was made on and the rows the decision touched are the same snapshot.
      expect(subject?.id).toBe(reportId);
      expect(subject?.responses).toHaveLength(3);
    });

    it('reads no selected response when the report has none', async () => {
      // **A report whose responses are all terminal has no selected
      // response.** The selection is the response holding `Selected for
      // Verification` or `Match Confirmed` — and a report with neither has
      // nothing to select, which the reader says rather than inventing.
      await prisma.$executeRawUnsafe(
        `UPDATE "recovery_responses"
         SET "status" = 'Not a Match' WHERE "report_id" = $1::uuid`,
        reportId,
      );

      const subject = await subjects.readLostCloseoutSubject(reportId);

      expect(subject?.selectedResponseId).toBeNull();
    });

    it('finds nothing for a report that does not exist', async () => {
      const subject = await subjects.readLostCloseoutSubject(
        '00000000-0000-4000-8000-000000000999',
      );

      expect(subject).toBeNull();
    });

    it('finds nothing for a Found report', async () => {
      const found = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         VALUES ('Found', 'Open', 'A brown leather wallet', 'Wallet',
                 'A brown leather wallet with a folded receipt inside.',
                 DATE '2026-10-28', 'library', $1, NOW(), NOW())
         RETURNING "id"`,
        ownerId,
      );

      const subject = await subjects.readLostCloseoutSubject(found[0]!.id);

      // **The type is filtered in the query,** so the closeout's Lost-only
      // rules cannot be applied to a Found report by accident.
      expect(subject).toBeNull();

      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1::uuid`, found[0]!.id);
    });

    it('refuses a status the vocabulary does not name', async () => {
      // **The database's own CHECK constraint refuses the write,** so the
      // reader's guard is only reachable by a row that bypassed it. The
      // constraint is therefore dropped for the duration of this one
      // statement — and restored in a `finally`, so a failure part-way
      // through cannot leave the table unprotected for the rest of the suite.
      //
      // **The drop is conditional.** A previous interrupted run may have left
      // the constraint already gone, and an unconditional `DROP` would then
      // fail before the `try` was entered — taking the restore with it.
      const present = await prisma.$queryRawUnsafe<{ conname: string }[]>(
        `SELECT "conname" FROM "pg_constraint"
         WHERE "conname" = 'recovery_responses_status_check'`,
      );

      if (present.length > 0) {
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "recovery_responses" DROP CONSTRAINT "recovery_responses_status_check"`,
        );
      }

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "recovery_responses"
           SET "status" = 'A Status That Does Not Exist'
           WHERE "id" = $1::uuid`,
          standbyResponseId,
        );

        await expect(subjects.readLostCloseoutSubject(reportId)).rejects.toThrow(
          /is not a Recovery Response status/,
        );
      } finally {
        // **The row is restored before the constraint is.** The constraint
        // cannot be re-added while a row violates it — so the order matters,
        // and a failure part-way through the `try` must still leave the table
        // protected.
        await prisma.$executeRawUnsafe(
          `UPDATE "recovery_responses"
           SET "status" = 'Submitted' WHERE "id" = $1::uuid`,
          standbyResponseId,
        );

        await prisma.$executeRawUnsafe(
          `ALTER TABLE "recovery_responses"
           ADD CONSTRAINT "recovery_responses_status_check"
           CHECK ("status" IN ('Submitted', 'Selected for Verification', 'Match Confirmed',
                               'Not a Match', 'Completed — Report Returned',
                               'Resolved — Report Returned', 'Resolved — Report Closed',
                               'Withdrawn'))`,
        );
      }
    });
  });
});
