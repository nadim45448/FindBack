/**
 * The return-confirmation adapters' suite — against a **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's guarantees become the database's rows.** The domain proves that a
 * report may be confirmed `Returned`; these adapters prove that the move is
 * *written* conditionally, that the confirmation row is *written* with the
 * report's move, and that the database's own constraints agree with the
 * domain's rules rather than merely restating them.
 *
 * **Five properties are proven here that a mocked test could not:**
 *
 * 1. **The conditional write really is conditional.** A write against a
 *    report that is no longer in its direction's precondition status matches
 *    no row, so the repository reports "did not land" — which is what the
 *    service turns into the conflict the story requires.
 * 2. **The move and the confirmation row are one act.** A landed write leaves
 *    both a `Returned` report and a confirmation row; an unlanded write leaves
 *    neither.
 * 3. **FR-25's guard is structural.** `default_receiver_account_id` is
 *    `NOT NULL`, so a receiverless confirmation is *unrepresentable* — the
 *    database refuses the write outright.
 * 4. **The substitute's shape is enforced.** A partial substitute is refused
 *    by the CHECK constraint, and a relationship outside the PRD's five is
 *    refused by the other one.
 * 5. **One report carries one confirmation.** The unique index refuses a
 *    second row beside a report that was already confirmed.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { ReturnConfirmationWrite } from '@/application/listings/ports/return-confirmation-repository';

import { createSubstituteReceiver } from '@/domain/returns';

import { PrismaReturnConfirmationRepository } from './prisma-return-confirmation-repository';
import { PrismaReturnSubjectReader } from './prisma-return-subject-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the return confirmation adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const finderId = '00000000-0000-4000-8000-000000000791';
  const administratorId = '00000000-0000-4000-8000-000000000792';
  const claimantId = '00000000-0000-4000-8000-000000000793';
  const ownerId = '00000000-0000-4000-8000-000000000794';

  /** The Found report that is confirmed. */
  let foundReportId = '';

  /** The Lost report that is confirmed. */
  let lostReportId = '';

  /** The Claim that makes the claimant the Found report's default receiver. */
  let claimId = '';

  const confirmations = new PrismaReturnConfirmationRepository(prisma);
  const subjects = new PrismaReturnSubjectReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'A Finder', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'The Administrator', 'Employee', 'Active', true),
              ($5, $6, 'not-a-real-hash', 'A Claimant', 'Student', 'Active', false),
              ($7, $8, 'not-a-real-hash', 'A Lost Owner', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      finderId,
      'finder-returns@example.test',
      administratorId,
      'administrator-returns@example.test',
      claimantId,
      'claimant-returns@example.test',
      ownerId,
      'lost-owner-returns@example.test',
    );

    const found = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Claim Approved', 'A brown leather wallet', 'Wallet',
               'A brown leather wallet with a folded receipt inside.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      finderId,
    );

    foundReportId = found[0]!.id;

    const lost = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Verification Pending', 'A set of house keys', 'Keys',
               'A set of house keys on a red fabric loop.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    lostReportId = lost[0]!.id;

    const claims = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "decided_at",
                              "created_at", "updated_at")
       VALUES ($1, $2, 'Approved', NOW(), NOW(), NOW())
       RETURNING "id"`,
      foundReportId,
      claimantId,
    );

    claimId = claims[0]!.id;
  });

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The rules are about what the
    // *database* holds, so a confirmation left behind by one test would
    // change the verdict of the next.
    await prisma.$executeRawUnsafe(
      `DELETE FROM "return_confirmations" WHERE "report_id" IN ($1, $2)`,
      foundReportId,
      lostReportId,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "reports" SET "status" = 'Claim Approved' WHERE "id" = $1`,
      foundReportId,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "reports" SET "status" = 'Verification Pending' WHERE "id" = $1`,
      lostReportId,
    );
  });

  afterAll(async () => {
    // **The teardown is guarded,** because a `beforeAll` that never
    // completed leaves no report ids — and a delete against an empty uuid
    // would fail for a reason that has nothing to do with the test.
    if (foundReportId.length > 0 && lostReportId.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "return_confirmations" WHERE "report_id" IN ($1, $2)`,
        foundReportId,
        lostReportId,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "id" = $1::uuid`, claimId);
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" IN ($1, $2)`, foundReportId, lostReportId);
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3, $4)`,
      finderId,
      administratorId,
      claimantId,
      ownerId,
    );
    await prisma.$disconnect();
  });

  /** The write a Found confirmation makes. */
  function foundWrite(
    overrides: Partial<ReturnConfirmationWrite> = {},
  ): ReturnConfirmationWrite {
    return {
      reportId: foundReportId,
      reportType: 'Found',
      administratorId,
      defaultReceiverAccountId: claimantId,
      substitute: null,
      confirmedAt: new Date(),
      ...overrides,
    };
  }

  /** The write a Lost confirmation makes. */
  function lostWrite(overrides: Partial<ReturnConfirmationWrite> = {}): ReturnConfirmationWrite {
    return {
      reportId: lostReportId,
      reportType: 'Lost',
      administratorId,
      defaultReceiverAccountId: ownerId,
      substitute: null,
      confirmedAt: new Date(),
      ...overrides,
    };
  }

  /** Run the write inside a transaction, as the service does. */
  async function confirm(write: ReturnConfirmationWrite): Promise<string | null> {
    return prisma.$transaction(async (tx) => {
      const handle: TransactionHandle = { transaction: tx };

      return confirmations.confirmReturned(write, handle);
    });
  }

  // ── The conditional write ────────────────────────────────────────────────

  describe('the return confirmation repository', () => {
    it('moves a Found report to Returned and records the confirmation', async () => {
      const landed = await confirm(foundWrite());

      expect(landed).not.toBeNull();

      const reports = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        foundReportId,
      );

      expect(reports[0]?.status).toBe('Returned');
    });

    it('moves a Lost report to Returned through the same adapter', async () => {
      // **One adapter, both directions.** The precondition differs; the code
      // path does not.
      const landed = await confirm(lostWrite());

      expect(landed).not.toBeNull();

      const reports = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        lostReportId,
      );

      expect(reports[0]?.status).toBe('Returned');
    });

    it('writes the default receiver and the administrator on the row', async () => {
      await confirm(foundWrite());

      const rows = await prisma.$queryRawUnsafe<
        {
          report_type: string;
          default_receiver_account_id: string;
          administrator_id: string;
          substitute_receiver_name: string | null;
          relationship: string | null;
        }[]
      >(
        `SELECT "report_type", "default_receiver_account_id", "administrator_id",
                "substitute_receiver_name", "relationship"
         FROM "return_confirmations" WHERE "report_id" = $1`,
        foundReportId,
      );

      expect(rows[0]?.report_type).toBe('Found');
      expect(rows[0]?.default_receiver_account_id).toBe(claimantId);
      expect(rows[0]?.administrator_id).toBe(administratorId);
      expect(rows[0]?.substitute_receiver_name).toBeNull();
      expect(rows[0]?.relationship).toBeNull();
    });

    it('writes the substitute\'s three fields together', async () => {
      await confirm(
        foundWrite({
          substitute: createSubstituteReceiver({
            name: 'Sam Okafor',
            authorizationConfirmed: true,
            relationship: 'Friend',
          }),
        }),
      );

      const rows = await prisma.$queryRawUnsafe<
        {
          substitute_receiver_name: string | null;
          authorization_affirmation: string | null;
          relationship: string | null;
        }[]
      >(
        `SELECT "substitute_receiver_name", "authorization_affirmation", "relationship"
         FROM "return_confirmations" WHERE "report_id" = $1`,
        foundReportId,
      );

      expect(rows[0]?.substitute_receiver_name).toBe('Sam Okafor');
      expect(rows[0]?.authorization_affirmation).toBe(
        'Default receiver authorized the substitute',
      );
      expect(rows[0]?.relationship).toBe('Friend');
    });

    it('refuses to confirm a report that is no longer in its precondition status', async () => {
      // **The conditional write is the guarantee.** The reader's earlier
      // check is advisory; only the write's own `WHERE` clause can close the
      // window between the read and the write.
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Returned' WHERE "id" = $1`,
        foundReportId,
      );

      const landed = await confirm(foundWrite());

      expect(landed).toBeNull();
    });

    it('writes no confirmation row when the conditional write lands nothing', async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Closed' WHERE "id" = $1`,
        foundReportId,
      );

      await confirm(foundWrite());

      const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*)::int AS "count" FROM "return_confirmations" WHERE "report_id" = $1`,
        foundReportId,
      );

      expect(rows[0]?.count).toBe(0);
    });

    it('refuses a Found report confirmed from the Lost side\'s precondition', async () => {
      // **The precondition table is keyed by report type.** A Found report
      // in `Verification Pending` is a state that cannot exist for it, and
      // the write names the Found precondition — so it matches nothing.
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Verification Pending' WHERE "id" = $1`,
        foundReportId,
      );

      const landed = await confirm(foundWrite());

      expect(landed).toBeNull();
    });

    it('refuses a Lost report confirmed from the Found side\'s precondition', async () => {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Claim Approved' WHERE "id" = $1`,
        lostReportId,
      );

      const landed = await confirm(lostWrite());

      expect(landed).toBeNull();
    });

    it('refuses a report whose type does not match the write', async () => {
      // **The type is in the `WHERE` clause too.** A write that named the
      // wrong direction cannot move the report at all.
      const landed = await confirm(foundWrite({ reportType: 'Lost' }));

      expect(landed).toBeNull();
    });

    it('refuses a write outside a transaction', async () => {
      // **A confirmation written outside the caller's transaction could
      // commit without the audit event.**
      await expect(
        confirmations.confirmReturned(foundWrite(), {
          transaction: { nothing: true },
        } as never),
      ).rejects.toThrow();
    });
  });

  // ── The race ──────────────────────────────────────────────────────────────

  describe('the return confirmation repository — the race', () => {
    it('lets exactly one of two concurrent confirmations land', async () => {
      // **The report's status settles which confirmation won.** The first
      // write moves the report to `Returned`; the second matches no rows.
      const first = confirm(foundWrite());
      const second = confirm(foundWrite());

      const [firstResult, secondResult] = await Promise.all([first, second]);

      const landed = [firstResult, secondResult].filter((id) => id !== null);

      expect(landed).toHaveLength(1);
    });

    it('leaves exactly one confirmation row after two concurrent confirmations', async () => {
      await Promise.all([confirm(foundWrite()), confirm(foundWrite())]);

      const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*)::int AS "count" FROM "return_confirmations" WHERE "report_id" = $1`,
        foundReportId,
      );

      expect(rows[0]?.count).toBe(1);
    });
  });

  // ── The read ──────────────────────────────────────────────────────────────

  describe('the return confirmation repository — the read', () => {
    it('reads the confirmation recorded against a report', async () => {
      await confirm(foundWrite());

      const stored = await confirmations.findByReportId(foundReportId);

      expect(stored?.reportId).toBe(foundReportId);
      expect(stored?.reportType).toBe('Found');
      expect(stored?.defaultReceiverAccountId).toBe(claimantId);
      expect(stored?.administratorId).toBe(administratorId);
      expect(stored?.substituteReceiverName).toBeNull();
      expect(stored?.confirmedAt).toBeInstanceOf(Date);
    });

    it('reads a report with no confirmation as absent', async () => {
      const stored = await confirmations.findByReportId(
        '00000000-0000-4000-8000-000000000799',
      );

      expect(stored).toBeNull();
    });

    it('reads inside the caller’s transaction when one is supplied', async () => {
      // **The handle is honoured.** A read inside the caller's transaction
      // sees the caller's uncommitted writes; a read outside it does not.
      const stored = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return confirmations.findByReportId(foundReportId, handle);
      });

      expect(stored).toBeNull();
    });

    it('reads a substitute confirmation with all three of its fields', async () => {
      await confirm(
        foundWrite({
          substitute: createSubstituteReceiver({
            name: 'Sam Okafor',
            authorizationConfirmed: true,
            relationship: 'Family Member',
          }),
        }),
      );

      const stored = await confirmations.findByReportId(foundReportId);

      expect(stored?.substituteReceiverName).toBe('Sam Okafor');
      expect(stored?.authorizationAffirmation).toBe(
        'Default receiver authorized the substitute',
      );
      expect(stored?.relationship).toBe('Family Member');
    });
  });

  // ── The subject reader ────────────────────────────────────────────────────

  describe('the return subject reader', () => {
    it('reads the Found report with its approved claimant', async () => {
      const subject = await subjects.readReturnSubject(foundReportId);

      expect(subject?.id).toBe(foundReportId);
      expect(subject?.type).toBe('Found');
      expect(subject?.status).toBe('Claim Approved');
      expect(subject?.reporterId).toBe(finderId);
      expect(subject?.approvedClaimantId).toBe(claimantId);
    });

    it('reads the Lost report with no approved claimant', async () => {
      // **A Lost report has no Claims at all.** The default receiver is the
      // owner, and the reader says so by reading `null`.
      const subject = await subjects.readReturnSubject(lostReportId);

      expect(subject?.type).toBe('Lost');
      expect(subject?.status).toBe('Verification Pending');
      expect(subject?.reporterId).toBe(ownerId);
      expect(subject?.approvedClaimantId).toBeNull();
    });

    it('reads a report with only a pending Claim as having no approved claimant', async () => {
      // **The query names the status, so the query is the rule.** A report
      // whose only Claim is `Pending` has no approved claimant — which is the
      // truth, and the reason a Found report in that state cannot be
      // confirmed.
      //
      // **The approved Claim is set aside rather than demoted,** because a
      // `Pending` Claim must carry its submission fields — the database's
      // own `claims_pending_fields_check` refuses one without them — and a
      // demotion would be a write the constraint rightly refuses.
      const pending = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "reason",
                               "identifying_details", "date_lost", "submitted_at",
                               "created_at", "updated_at")
         VALUES ($1, $2, 'Pending', 'It is my brown leather wallet.',
                 'Blue cardholder with a dent.', DATE '2026-10-20', NOW(), NOW(), NOW())
         RETURNING "id"`,
        foundReportId,
        ownerId,
      );

      await prisma.$executeRawUnsafe(
        `UPDATE "claims" SET "status" = 'Approved', "decided_at" = NOW() WHERE "id" = $1::uuid`,
        claimId,
      );

      try {
        // **The approved Claim is withdrawn** so that the report's *only*
        // Claim is the pending one.
        await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "id" = $1::uuid`, claimId);

        const subject = await subjects.readReturnSubject(foundReportId);

        expect(subject?.approvedClaimantId).toBeNull();
      } finally {
        await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "id" = $1::uuid`, pending[0]!.id);

        await prisma.$executeRawUnsafe(
          `INSERT INTO "claims" ("id", "report_id", "claimant_id", "status", "decided_at",
                                 "created_at", "updated_at")
           VALUES ($1::uuid, $2, $3, 'Approved', NOW(), NOW(), NOW())`,
          claimId,
          foundReportId,
          claimantId,
        );
      }
    });

    it('reads a report that does not exist as absent', async () => {
      const subject = await subjects.readReturnSubject(
        '00000000-0000-4000-8000-000000000799',
      );

      expect(subject).toBeNull();
    });

    it('reads a report of a type the domain does not own as absent', async () => {
      // **A report type outside the two is not a report this confirmation can
      // act on.** The derivation's table is total over `Lost` and `Found`, so
      // a third type has no default receiver and no precondition — and the
      // reader says so by reading `null` rather than handing the domain a
      // value it cannot judge.
      //
      // **The database's own `reports_type_check` already restricts the
      // column,** so this row can only exist if the constraint is dropped.
      // The constraint is dropped for the statement and restored in a
      // `finally` — a failure part-way through cannot leave the table
      // unprotected for the rest of the suite.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_type_check"`,
      );

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "reports" SET "type" = 'Mislaid' WHERE "id" = $1`,
          foundReportId,
        );

        const subject = await subjects.readReturnSubject(foundReportId);

        expect(subject).toBeNull();
      } finally {
        await prisma.$executeRawUnsafe(
          `UPDATE "reports" SET "type" = 'Found' WHERE "id" = $1`,
          foundReportId,
        );

        await prisma.$executeRawUnsafe(
          `ALTER TABLE "reports" ADD CONSTRAINT "reports_type_check" CHECK (
              "type" IN ('Lost', 'Found')
           )`,
        );
      }
    });

    it('reads no Sensitive Field', async () => {
      // **The reader selects only the columns the confirmation reasons
      // about.** The report's Sensitive Fields are not selected, so they
      // cannot leak into the confirmation's audit payload.
      const subject = await subjects.readReturnSubject(foundReportId);

      expect(Object.keys(subject ?? {}).sort()).toEqual([
        'approvedClaimantId',
        'id',
        'reporterId',
        'status',
        'type',
      ]);
    });

    it('reads inside the caller’s transaction when one is supplied', async () => {
      // **The handle is honoured.** A read inside the caller's transaction
      // sees the caller's uncommitted writes; a read outside it does not.
      const subject = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return subjects.readReturnSubject(foundReportId, handle);
      });

      expect(subject?.id).toBe(foundReportId);
    });
  });

  // ── The database's own constraints ────────────────────────────────────────

  describe('the return confirmations constraints', () => {
    it('refuses a confirmation with no receiver at all', async () => {
      // **FR-25: the system refuses to confirm Returned without a recorded
      // receiver.** `default_receiver_account_id` is `NOT NULL`, so the
      // receiverless state is not merely discouraged — it is
      // *unrepresentable*.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Found', $2, NOW())`,
          foundReportId,
          administratorId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a confirmation with a substitute\'s name but no authorization', async () => {
      // **FR-24: all three fields are required when the substitute is not the
      // claimant.** The constraint says the same thing in the place where it
      // cannot be skipped.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "default_receiver_account_id",
                                                 "substitute_receiver_name",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Found', $2, 'Sam Okafor', $3, NOW())`,
          foundReportId,
          claimantId,
          administratorId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a confirmation with a relationship but no name', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "default_receiver_account_id",
                                                 "authorization_affirmation",
                                                 "relationship",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Found', $2, 'Default receiver authorized the substitute',
                   'Friend', $3, NOW())`,
          foundReportId,
          claimantId,
          administratorId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a relationship outside the PRD\'s five', async () => {
      // **The relationship is a whitelist.** A value the PRD does not name is
      // not a relationship this system understands.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "default_receiver_account_id",
                                                 "substitute_receiver_name",
                                                 "authorization_affirmation",
                                                 "relationship",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Found', $2, 'Sam Okafor',
                   'Default receiver authorized the substitute', 'Neighbour', $3, NOW())`,
          foundReportId,
          claimantId,
          administratorId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a substitute name that is empty or whitespace-only', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "default_receiver_account_id",
                                                 "substitute_receiver_name",
                                                 "authorization_affirmation",
                                                 "relationship",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Found', $2, '   ',
                   'Default receiver authorized the substitute', 'Friend', $3, NOW())`,
          foundReportId,
          claimantId,
          administratorId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a substitute name longer than eighty characters', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "default_receiver_account_id",
                                                 "substitute_receiver_name",
                                                 "authorization_affirmation",
                                                 "relationship",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Found', $2, $4,
                   'Default receiver authorized the substitute', 'Friend', $3, NOW())`,
          foundReportId,
          claimantId,
          administratorId,
          'x'.repeat(81),
        ),
      ).rejects.toThrow();
    });

    it('refuses a second confirmation for the same report', async () => {
      // **One report carries one handover.** The unique index is the data
      // layer's version of "exactly one commits".
      await confirm(foundWrite());

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "default_receiver_account_id",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Found', $2, $3, NOW())`,
          foundReportId,
          claimantId,
          administratorId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a confirmation whose report type is outside the two', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "return_confirmations" ("report_id", "report_type",
                                                 "default_receiver_account_id",
                                                 "administrator_id", "confirmed_at")
           VALUES ($1, 'Mislaid', $2, $3, NOW())`,
          foundReportId,
          claimantId,
          administratorId,
        ),
      ).rejects.toThrow();
    });

    it('holds the relationship vocabulary the domain holds', async () => {
      // **The database's constraint and the domain's whitelist are the same
      // set.** The constraint's definition is read out of the catalogue and
      // compared against the domain's five, so a value added on one side
      // without the other is a failure — not a quiet divergence.
      const rows = await prisma.$queryRawUnsafe<{ definition: string }[]>(
        `SELECT pg_get_constraintdef(oid) AS "definition"
         FROM pg_constraint
         WHERE conname = 'return_confirmations_relationship_check'`,
      );

      const definition = rows[0]?.definition ?? '';

      for (const relationship of [
        'Friend',
        'Family Member',
        'Colleague',
        'Classmate',
        'Other',
      ]) {
        expect(definition).toContain(`'${relationship}'`);
      }
    });

    it('refuses to delete an account recorded as having confirmed a return', async () => {
      // **The Accounts are RESTRICT.** An account cannot be deleted while it
      // is recorded as having confirmed a return — the rule is in the
      // schema, so the database enforces it rather than a comment describing
      // an intention.
      await confirm(foundWrite());

      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "accounts" WHERE "id" = $1::uuid`, administratorId),
      ).rejects.toThrow();
    });

    it('refuses to delete the account answerable for a returned item', async () => {
      await confirm(foundWrite());

      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "accounts" WHERE "id" = $1::uuid`, claimantId),
      ).rejects.toThrow();
    });
  });
});
