/**
 * The claim decision adapters' suite — against a **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's guarantees become the database's rows.** The domain proves that
 * a Claim may be decided; the adapters prove that the decision is *written*
 * conditionally, that the row lock is *taken*, and that the database's own
 * constraints agree with the domain's rules.
 *
 * **Four properties are proven here that a mocked test could not:**
 *
 * 1. **The conditional write really is conditional.** A write against a
 *    Claim that is no longer `Pending` matches no row, so the repository
 *    reports "did not land" — which is what the service turns into the
 *    conflict the story requires.
 * 2. **The row lock really serialises.** Two transactions locking the same
 *    report row are ordered, so the second reads the first's move.
 * 3. **The decision columns are written.** The administrator and the
 *    decision time land on the row, and the database's own CHECK constraint
 *    holds — a decided Claim always carries a decision time.
 * 4. **The auto-rejection leaves the decider null.** A reporter-caused
 *    auto-rejection has no administrator, and the constraint leaves the
 *    decider optional for exactly that reason.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  decideFoundReportTransition,
  type ReportStatus,
} from '@/domain/listings';

import { PrismaClaimDecisionReader } from './prisma-claim-decision-reader';
import { PrismaClaimDecisionRepository } from './prisma-claim-decision-repository';
import { PrismaClaimReviewReader } from './prisma-claim-review-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the claim decision adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const finderId = '00000000-0000-4000-8000-000000000781';
  const administratorId = '00000000-0000-4000-8000-000000000782';
  const claimantId = '00000000-0000-4000-8000-000000000783';
  const otherClaimantId = '00000000-0000-4000-8000-000000000784';

  /** The report the Claims are made against. */
  let reportId = '';

  const reader = new PrismaClaimDecisionReader(prisma);
  const decisions = new PrismaClaimDecisionRepository(prisma);
  const reviews = new PrismaClaimReviewReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'A Finder', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'The Administrator', 'Employee', 'Active', true),
              ($5, $6, 'not-a-real-hash', 'A Claimant', 'Student', 'Active', false),
              ($7, $8, 'not-a-real-hash', 'Another Claimant', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      finderId,
      'finder-decisions@example.test',
      administratorId,
      'administrator-decisions@example.test',
      claimantId,
      'claimant-decisions@example.test',
      otherClaimantId,
      'other-claimant-decisions@example.test',
    );

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Claim Requested', 'A brown leather wallet', 'Wallet',
               'A brown leather wallet with a folded receipt inside.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      finderId,
    );

    reportId = rows[0]!.id;
  });

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The rules are about what
    // the *database* holds, so a Claim left behind by one test would change
    // the verdict of the next.
    await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "report_id" = $1`, reportId);
    await prisma.$executeRawUnsafe(
      `UPDATE "reports" SET "status" = 'Claim Requested' WHERE "id" = $1`,
      reportId,
    );
  });

  afterAll(async () => {
    // **The teardown is guarded,** because a `beforeAll` that never
    // completed leaves no report id — and a delete against an empty uuid
    // would fail for a reason that has nothing to do with the test.
    if (reportId.length > 0) {
      await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "report_id" = $1`, reportId);
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3, $4)`,
      finderId,
      administratorId,
      claimantId,
      otherClaimantId,
    );
    await prisma.$disconnect();
  });

  /**
   * Insert a `Pending` Claim and return its id.
   */
  async function insertPendingClaim(claimant = claimantId): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                              "reason", "identifying_details", "date_lost",
                              "created_at", "updated_at")
       VALUES ($1, $2, 'Pending', NOW(), 'It is my brown leather wallet.',
               'Blue cardholder with a dent.', DATE '2026-10-20', NOW(), NOW())
       RETURNING "id"`,
      reportId,
      claimant,
    );

    return rows[0]!.id;
  }

  // ── The conditional writes ───────────────────────────────────────────────

  describe('the claim decision repository', () => {
    it('approves a pending claim and records the decider and the time', async () => {
      const claimId = await insertPendingClaim();

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return decisions.approve(claimId, administratorId, new Date(), handle);
      });

      expect(landed).toBe(true);

      const rows = await prisma.$queryRawUnsafe<
        { status: string; decided_by: string | null; decided_at: Date | null }[]
      >(
        `SELECT "status", "decided_by_administrator_id" AS "decided_by", "decided_at"
         FROM "claims" WHERE "id" = $1::uuid`,
        claimId,
      );

      expect(rows[0]?.status).toBe('Approved');
      expect(rows[0]?.decided_by).toBe(administratorId);
      expect(rows[0]?.decided_at).not.toBeNull();
    });

    it('refuses to approve a claim that is no longer pending', async () => {
      // **The conditional write is the guarantee.** The reader's earlier
      // check is advisory; only the write's own `WHERE` clause can close
      // the window between the read and the write.
      const claimId = await insertPendingClaim();

      await prisma.$executeRawUnsafe(
        `UPDATE "claims" SET "status" = 'Approved', "decided_at" = NOW()
         WHERE "id" = $1::uuid`,
        claimId,
      );

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return decisions.approve(claimId, administratorId, new Date(), handle);
      });

      expect(landed).toBe(false);
    });

    it('rejects a pending claim with the administrator’s reason', async () => {
      const claimId = await insertPendingClaim();
      const reason = 'The item does not match the description given.';

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return decisions.reject(
          claimId,
          administratorId,
          { value: reason },
          new Date(),
          handle,
        );
      });

      expect(landed).toBe(true);

      const rows = await prisma.$queryRawUnsafe<
        { status: string; rejection_reason: string; decided_by: string | null }[]
      >(
        `SELECT "status", "rejection_reason", "decided_by_administrator_id" AS "decided_by"
         FROM "claims" WHERE "id" = $1::uuid`,
        claimId,
      );

      expect(rows[0]?.status).toBe('Rejected');
      expect(rows[0]?.rejection_reason).toBe(reason);
      expect(rows[0]?.decided_by).toBe(administratorId);
    });

    it('refuses to reject a claim that is no longer pending', async () => {
      const claimId = await insertPendingClaim();

      await prisma.$executeRawUnsafe(
        `UPDATE "claims" SET "status" = 'Rejected', "decided_at" = NOW(),
                             "rejection_reason" = 'Already decided.'
         WHERE "id" = $1::uuid`,
        claimId,
      );

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return decisions.reject(
          claimId,
          administratorId,
          { value: 'A different reason entirely.' },
          new Date(),
          handle,
        );
      });

      expect(landed).toBe(false);
    });

    it('auto-rejects a pending claim with the trigger’s reason', async () => {
      const claimId = await insertPendingClaim();

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return decisions.autoReject(
          claimId,
          'another claim was approved for this item',
          new Date(),
          handle,
        );
      });

      expect(landed).toBe(true);

      const rows = await prisma.$queryRawUnsafe<
        { status: string; rejection_reason: string; decided_by: string | null }[]
      >(
        `SELECT "status", "rejection_reason", "decided_by_administrator_id" AS "decided_by"
         FROM "claims" WHERE "id" = $1::uuid`,
        claimId,
      );

      expect(rows[0]?.status).toBe('Rejected');
      expect(rows[0]?.rejection_reason).toBe('another claim was approved for this item');
    });

    it('leaves the decider null on an auto-rejection', async () => {
      // **A reporter-caused auto-rejection has no administrator.** The
      // human who caused it is named by the audit event's `triggeredBy`,
      // not by the Claim's decider — so the column stays null and the
      // database's CHECK constraint leaves it optional for exactly this
      // reason.
      const claimId = await insertPendingClaim();

      await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        await decisions.autoReject(
          claimId,
          'the reporter withdrew this report',
          new Date(),
          handle,
        );
      });

      const rows = await prisma.$queryRawUnsafe<
        { decided_by: string | null; decided_at: Date | null }[]
      >(
        `SELECT "decided_by_administrator_id" AS "decided_by", "decided_at"
         FROM "claims" WHERE "id" = $1::uuid`,
        claimId,
      );

      expect(rows[0]?.decided_by).toBeNull();
      // **The decision *time* is still required** — the Claim was decided,
      // and the record says when.
      expect(rows[0]?.decided_at).not.toBeNull();
    });

    it('refuses to auto-reject a claim that is no longer pending', async () => {
      const claimId = await insertPendingClaim();

      await prisma.$executeRawUnsafe(
        `UPDATE "claims" SET "status" = 'Approved', "decided_at" = NOW()
         WHERE "id" = $1::uuid`,
        claimId,
      );

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return decisions.autoReject(
          claimId,
          'another claim was approved for this item',
          new Date(),
          handle,
        );
      });

      expect(landed).toBe(false);
    });

    it('refuses a write outside a transaction', async () => {
      // **A decision written outside the caller's transaction could commit
      // without the report's move and the audit events.**
      const claimId = await insertPendingClaim();

      await expect(
        decisions.approve(claimId, administratorId, new Date(), {
          transaction: { nothing: true },
        } as never),
      ).rejects.toThrow();
    });
  });

  // ── The reads ─────────────────────────────────────────────────────────────

  describe('the claim decision reader', () => {
    it('reads the claim’s state with the claimant’s email', async () => {
      const claimId = await insertPendingClaim();

      const state = await reader.readDecisionState(claimId);

      expect(state?.id).toBe(claimId);
      expect(state?.status).toBe('Pending');
      expect(state?.reportId).toBe(reportId);
      expect(state?.claimantEmail).toBe('claimant-decisions@example.test');
    });

    it('reads a claim that does not exist as absent', async () => {
      const state = await reader.readDecisionState(
        '00000000-0000-4000-8000-000000000799',
      );

      expect(state).toBeNull();
    });

    it('lists only the other pending claims', async () => {
      const first = await insertPendingClaim();
      const second = await insertPendingClaim(otherClaimantId);

      // A decided Claim is settled history, not competition.
      await prisma.$executeRawUnsafe(
        `UPDATE "claims" SET "status" = 'Rejected', "decided_at" = NOW(),
                             "rejection_reason" = 'Already decided.'
         WHERE "id" = $1::uuid`,
        second,
      );

      const competitors = await reader.listCompetingPendingClaims(reportId, first);

      expect(competitors.map((claim) => claim.claimId)).not.toContain(first);
      expect(competitors.map((claim) => claim.claimId)).not.toContain(second);
    });

    it('lists the competing pending claims with their submission times', async () => {
      const first = await insertPendingClaim();
      const second = await insertPendingClaim(otherClaimantId);

      const competitors = await reader.listCompetingPendingClaims(reportId, first);

      expect(competitors).toHaveLength(1);
      expect(competitors[0]?.claimId).toBe(second);
      expect(competitors[0]?.claimantEmail).toBe('other-claimant-decisions@example.test');
      expect(competitors[0]?.submittedAt).toBeInstanceOf(Date);
    });

    it('locks the report row and reads its status', async () => {
      const status = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return reader.lockReportStatus(reportId, handle);
      });

      expect(status).toBe('Claim Requested');
    });

    it('reads the report’s status after another transaction’s move', async () => {
      // **The lock is the serialisation point.** The first transaction
      // moves the report and commits; the second then reads the status
      // *after* that move — which is what refuses the second approval.
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Claim Approved' WHERE "id" = $1`,
        reportId,
      );

      const status = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return reader.lockReportStatus(reportId, handle);
      });

      expect(status).toBe('Claim Approved');
    });

    it('reads a report that does not exist as absent', async () => {
      const status = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return reader.lockReportStatus('00000000-0000-4000-8000-000000000799', handle);
      });

      expect(status).toBeNull();
    });

    it('refuses a lock on a handle that carries no transaction', async () => {
      await expect(
        reader.lockReportStatus(reportId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow();
    });

    it('refuses a read on a handle that carries no transaction', async () => {
      await expect(
        reader.readDecisionState(
          '00000000-0000-4000-8000-000000000799',
          { transaction: { nothing: true } } as never,
        ),
      ).rejects.toThrow();
    });

    it('refuses a competing-claim read on a handle that carries no transaction', async () => {
      await expect(
        reader.listCompetingPendingClaims(reportId, 'claim-1', {
          transaction: { nothing: true },
        } as never),
      ).rejects.toThrow();
    });

    it('reads a claim whose status the domain does not recognise as a refusable one', async () => {
      // **An unknown status is refused, not passed through.** The decision
      // gate is a whitelist, and a reader that handed it a status outside
      // the vocabulary would be handing it a value the gate cannot judge.
      // The gate refuses anything that is not `Pending`, so an unknown
      // status is refused as a non-`Pending` claim — which is the safe
      // direction.
      //
      // **The database's own `claims_status_check` already restricts the
      // column to the four canonical statuses,** so this row can only
      // exist if the constraint is dropped. That is the point: the reader's
      // coercion is a **defence against a row that bypassed the
      // constraint**, not a reachable state. Both constraints are dropped
      // for the statement and restored in a `finally` — so a failure
      // part-way through cannot leave the table unprotected for the rest
      // of the suite.
      const claimId = await insertPendingClaim();

      await prisma.$executeRawUnsafe(
        `ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "claims_decision_fields_check"`,
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "claims_status_check"`,
      );

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "claims" SET "status" = 'Verification Pending', "decided_at" = NOW()
           WHERE "id" = $1::uuid`,
          claimId,
        );

        // **The read happens while the row still carries the unknown
        // status** — reading it after the cleanup would prove nothing.
        const state = await reader.readDecisionState(claimId);

        // **The unknown status arrives as `Rejected`** — a value the gate
        // refuses, rather than one it would wave through.
        expect(state?.status).toBe('Rejected');
      } finally {
        // **The row is put back before the constraints are restored,** so
        // the restoration cannot fail on the very row it was testing.
        await prisma.$executeRawUnsafe(
          `UPDATE "claims" SET "status" = 'Pending', "decided_at" = NULL
           WHERE "id" = $1::uuid`,
          claimId,
        );

        await prisma.$executeRawUnsafe(
          `ALTER TABLE "claims" ADD CONSTRAINT "claims_decision_fields_check" CHECK (
              ("status" = 'Pending' AND "decided_at" IS NULL)
              OR ("status" <> 'Pending' AND "decided_at" IS NOT NULL)
           )`,
        );
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "claims" ADD CONSTRAINT "claims_status_check" CHECK (
              "status" IN ('Pending', 'Approved', 'Rejected', 'Returned')
           )`,
        );
      }
    });
  });

  // ── The row lock, as a serialisation ─────────────────────────────────────

  describe('the report row lock', () => {
    it('serialises two transactions that lock the same report', async () => {
      // **Two administrators approving two different Claims on the same
      // item are serialised here.** The second waits for the first to
      // commit, and then reads the report's status *after* the first's
      // move — so it sees `Claim Approved`.
      //
      // The helper below mirrors what the *service* does: it locks the
      // report, and it refuses the approval when the transition table says
      // the report's status does not permit the move. The refusal is the
      // domain's, not the adapter's — the adapter's job is to hand back the
      // status the service needs to decide with.
      const firstClaim = await insertPendingClaim();
      const secondClaim = await insertPendingClaim(otherClaimantId);

      const approve = async (
        claimId: string,
        pauseMs: number,
      ): Promise<{ landed: boolean; status: string | null }> =>
        prisma.$transaction(async (tx) => {
          const handle: TransactionHandle = { transaction: tx };

          const status = await reader.lockReportStatus(reportId, handle);

          // **The transition table is the gate.** A report at `Claim
          // Approved` has no pending claim left to approve, so the cause
          // does not apply and the approval is refused.
          const transition = decideFoundReportTransition({
            currentStatus: status as ReportStatus,
            cause: 'ClaimApproved',
          });

          if (transition.kind === 'Refused') {
            return { landed: false, status };
          }

          // **A pause inside the transaction,** so the second
          // administrator genuinely has to wait for this one to commit.
          await new Promise((resolve) => setTimeout(resolve, pauseMs));

          const landed = await decisions.approve(
            claimId,
            administratorId,
            new Date(),
            handle,
          );

          if (landed && transition.kind === 'Moved') {
            await tx.$executeRawUnsafe(
              `UPDATE "reports" SET "status" = $1 WHERE "id" = $2`,
              transition.to,
              reportId,
            );
          }

          return { landed, status };
        });

      // **The first administrator is started first,** so it takes the
      // lock. The second waits for it.
      const first = approve(firstClaim, 300);
      await new Promise((resolve) => setTimeout(resolve, 100));
      const second = approve(secondClaim, 0);

      const [firstResult, secondResult] = await Promise.all([first, second]);

      // **The first lands and the second is refused.** The second read
      // `Claim Approved` — the first's committed move — and the transition
      // table refused it. So there is no partial write and no second
      // approval.
      expect(firstResult.landed).toBe(true);
      expect(firstResult.status).toBe('Claim Requested');
      expect(secondResult.landed).toBe(false);
      expect(secondResult.status).toBe('Claim Approved');

      const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      expect(rows[0]?.status).toBe('Claim Approved');

      // **Exactly one Claim was approved.** The second administrator's
      // claim is still `Pending` — the refusal wrote nothing.
      const claims = await prisma.$queryRawUnsafe<{ id: string; status: string }[]>(
        `SELECT "id", "status" FROM "claims" WHERE "report_id" = $1`,
        reportId,
      );

      const approved = claims.filter((claim) => claim.status === 'Approved');
      const pending = claims.filter((claim) => claim.status === 'Pending');

      expect(approved).toHaveLength(1);
      expect(approved[0]?.id).toBe(firstClaim);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.id).toBe(secondClaim);
    });

    it('shows the second transaction the first one’s committed move', async () => {
      // **The lock is what makes the second transaction see the first's
      // move.** Without the `FOR UPDATE`, the second transaction would
      // read `Claim Requested` and both would approve.
      //
      // **The ordering is forced rather than hoped for:** the first
      // transaction is started and given time to take the lock, and only
      // then is the second started. A test that merely runs two
      // transactions concurrently would be asserting on a race — and it
      // would pass or fail depending on which transaction happened to win.
      await insertPendingClaim();
      await insertPendingClaim(otherClaimantId);

      const observed: (string | null)[] = [];

      /** Lock the report, pause, then move it. */
      const lockAndMove = async (): Promise<string | null> =>
        prisma.$transaction(async (tx) => {
          const handle: TransactionHandle = { transaction: tx };

          const status = await reader.lockReportStatus(reportId, handle);

          // **A pause inside the transaction,** so the second transaction
          // genuinely has to wait for this one.
          await new Promise((resolve) => setTimeout(resolve, 300));

          await tx.$executeRawUnsafe(
            `UPDATE "reports" SET "status" = 'Claim Approved' WHERE "id" = $1`,
            reportId,
          );

          observed.push(status);

          return status;
        });

      // **The first transaction is started first,** so it takes the lock.
      const first = lockAndMove();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const second = lockAndMove();

      const [firstStatus, secondStatus] = await Promise.all([first, second]);

      // **The second transaction read the first's committed move.** It
      // waited for the lock, and then read `Claim Approved` — the status
      // the first transaction had written.
      expect(firstStatus).toBe('Claim Requested');
      expect(secondStatus).toBe('Claim Approved');
      expect(observed).toContain('Claim Requested');
      expect(observed).toContain('Claim Approved');

      // The two claims are still pending — this helper read and moved the
      // report, but decided nothing.
      const pending = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `SELECT "id" FROM "claims" WHERE "report_id" = $1 AND "status" = 'Pending'`,
        reportId,
      );

      expect(pending).toHaveLength(2);
    });

    it('reads an unrecognised report status as one the transition table refuses', async () => {
      // **A status outside the vocabulary must reach the transition table
      // as something it can refuse.** `Closed` is terminal: every cause
      // refuses it, so an unknown status is refused in the same direction
      // a known terminal one is. Handing the table a value it does not own
      // would make the table's job impossible.
      //
      // **The database's own `reports_status_check` already restricts the
      // column,** so this row can only exist if the constraint is dropped.
      // The constraint is dropped for the statement and restored in a
      // `finally` — a failure part-way through cannot leave the table
      // unprotected for the rest of the suite.
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_status_check"`,
      );

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "reports" SET "status" = 'Awaiting Inspection' WHERE "id" = $1`,
          reportId,
        );

        const status = await prisma.$transaction(async (tx) => {
          const handle: TransactionHandle = { transaction: tx };

          return reader.lockReportStatus(reportId, handle);
        });

        expect(status).toBe('Closed');

        // **And the transition table refuses it.** The coercion and the
        // refusal are two halves of one guarantee.
        expect(
          decideFoundReportTransition({
            currentStatus: status as ReportStatus,
            cause: 'ClaimApproved',
          }),
        ).toEqual({ kind: 'Refused', reason: 'TerminalStatus' });
      } finally {
        await prisma.$executeRawUnsafe(
          `UPDATE "reports" SET "status" = 'Claim Requested' WHERE "id" = $1`,
          reportId,
        );

        await prisma.$executeRawUnsafe(
          `ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK (
              "status" IN ('Open', 'Claim Requested', 'Claim Approved', 'Closed', 'Returned', 'Verification Pending')
           )`,
        );
      }
    });
  });

  // ── The review reader ─────────────────────────────────────────────────────

  describe('the claim review reader', () => {
    it('reads the claim, the item, and the competing claims together', async () => {
      const claimId = await insertPendingClaim();
      const competitorId = await insertPendingClaim(otherClaimantId);

      const facts = await reviews.readReviewFacts(claimId);

      expect(facts?.claim.claimId).toBe(claimId);
      expect(facts?.claim.status).toBe('Pending');
      expect(facts?.claim.reason).toBe('It is my brown leather wallet.');
      expect(facts?.item.name).toBe('A brown leather wallet');
      expect(facts?.item.campusArea).toBe('library');
      expect(facts?.competingClaims.map((claim) => claim.claimId)).toEqual([competitorId]);
    });

    it('does not list the claim being reviewed as its own competitor', async () => {
      const claimId = await insertPendingClaim();

      const facts = await reviews.readReviewFacts(claimId);

      expect(facts?.competingClaims).toHaveLength(0);
    });

    it('does not list a decided claim as a competitor', async () => {
      const claimId = await insertPendingClaim();
      const competitorId = await insertPendingClaim(otherClaimantId);

      await prisma.$executeRawUnsafe(
        `UPDATE "claims" SET "status" = 'Rejected', "decided_at" = NOW(),
                             "rejection_reason" = 'Already decided.'
         WHERE "id" = $1::uuid`,
        competitorId,
      );

      const facts = await reviews.readReviewFacts(claimId);

      expect(facts?.competingClaims).toHaveLength(0);
    });

    it('reads a claim that does not exist as absent', async () => {
      const facts = await reviews.readReviewFacts('00000000-0000-4000-8000-000000000799');

      expect(facts).toBeNull();
    });

    it('renders the dates as calendar days', async () => {
      const claimId = await insertPendingClaim();

      const facts = await reviews.readReviewFacts(claimId);

      // **The calendar day, not an instant.** The report's and the claim's
      // dates are calendar days.
      expect(facts?.claim.dateLost).toBe('2026-10-20');
      expect(facts?.item.date).toBe('2026-10-28');
    });

    it('reads inside the caller’s transaction when one is supplied', async () => {
      // **The handle is honoured.** A read inside the caller's transaction
      // sees the caller's uncommitted writes; a read outside it does not.
      // The reader therefore takes the client from the handle rather than
      // falling back to the root client.
      const claimId = await insertPendingClaim();

      const facts = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return reviews.readReviewFacts(claimId, handle);
      });

      expect(facts?.claim.claimId).toBe(claimId);
    });

    it('refuses a read on a handle that carries no transaction', async () => {
      // **The handle is required for the in-transaction read,** and a
      // handle that carries no transaction is refused rather than silently
      // falling back to the root client — a read outside the caller's
      // transaction would not see the caller's uncommitted writes.
      //
      // **A real Claim's id,** so the refusal comes from the guard and not
      // from the "no such claim" path: a Claim that does not exist returns
      // `null` before the transaction client is ever extracted, and the
      // guard would never be reached.
      const claimId = await insertPendingClaim();

      await expect(
        reviews.readReviewFacts(claimId, {
          transaction: { nothing: true },
        } as never),
      ).rejects.toThrow('must read inside the caller');
    });

    it('shows the empty string for a claim that carries no evidence', async () => {
      // **A lifecycle-written Claim carries no submission fields,** and
      // the database's own constraint requires a decision time on a decided
      // Claim — so the row is written the way the auto-rejection writes
      // it.
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "rejection_reason",
                               "decided_at", "created_at", "updated_at")
         VALUES ($1, $2, 'Rejected', 'Already decided.', NOW(), NOW(), NOW())
         RETURNING "id"`,
        reportId,
        claimantId,
      );

      const facts = await reviews.readReviewFacts(rows[0]!.id);

      expect(facts?.claim.reason).toBe('');
      expect(facts?.claim.identifyingDetails).toBe('');
    });

    it('reads a claim with no dates at all without throwing', async () => {
      // **A lifecycle-written Claim has no submission time and no date
      // lost,** because it never went through the submission form. The
      // `claims_pending_fields_check` constraint requires those fields only
      // on a `Pending` Claim, so this row is legal.
      //
      // **The screen shows the absence rather than a placeholder.** The date
      // lost is the empty string — there is no day to show — and the
      // submission time is the epoch, which sorts it before every Claim
      // that has one.
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "rejection_reason",
                               "decided_at", "created_at", "updated_at")
         VALUES ($1, $2, 'Rejected', 'Already decided.', NOW(), NOW(), NOW())
         RETURNING "id"`,
        reportId,
        claimantId,
      );

      const facts = await reviews.readReviewFacts(rows[0]!.id);

      // **The date lost is empty,** because there is no calendar day.
      expect(facts?.claim.dateLost).toBe('');

      // **The submission time is the epoch** — the oldest possible value,
      // so a Claim with no submission time sorts first among competitors.
      expect(facts?.claim.submittedAt).toEqual(new Date(0));
    });

    it('sorts a competing claim with no submission time first', async () => {
      // **A Claim with no submission time is older than every Claim that
      // has one,** so it sorts first. The column is nullable because bolt
      // 008 created the table before the submission flow existed.
      //
      // **The competing set is the `Pending` Claims,** so the Claim with no
      // submission time must itself be `Pending` to appear — and the
      // `claims_pending_fields_check` constraint requires a submission time
      // on a `Pending` Claim. The constraint is dropped for the statement
      // and restored in a `finally`.
      const claimId = await insertPendingClaim();

      await prisma.$executeRawUnsafe(
        `ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "claims_pending_fields_check"`,
      );

      let competitorId = '';

      try {
        const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
          `INSERT INTO "claims" ("report_id", "claimant_id", "status",
                                 "reason", "identifying_details", "date_lost",
                                 "created_at", "updated_at")
           VALUES ($1, $2, 'Pending',
                   'It is my brown leather wallet.',
                   'A folded receipt inside.', DATE '2026-10-20', NOW(), NOW())
           RETURNING "id"`,
          reportId,
          otherClaimantId,
        );

        competitorId = rows[0]!.id;

        // **The read happens while the row still exists** — reading it
        // after the cleanup would find nothing.
        const facts = await reviews.readReviewFacts(claimId);

        // **The competitor with no submission time comes first,** and its
        // submission time is the epoch.
        expect(facts?.competingClaims).toHaveLength(1);
        expect(facts?.competingClaims[0]?.claimId).toBe(competitorId);
        expect(facts?.competingClaims[0]?.submittedAt).toEqual(new Date(0));
      } finally {
        // **The offending row is removed before the constraint is
        // restored,** because the constraint is exactly what forbids it —
        // restoring it while the row exists fails on the row.
        if (competitorId.length > 0) {
          await prisma.$executeRawUnsafe(
            `DELETE FROM "claims" WHERE "id" = $1::uuid`,
            competitorId,
          );
        }

        await prisma.$executeRawUnsafe(
          `ALTER TABLE "claims" ADD CONSTRAINT "claims_pending_fields_check" CHECK (
              ("status" <> 'Pending')
              OR ("reason" IS NOT NULL AND "identifying_details" IS NOT NULL
                  AND "date_lost" IS NOT NULL AND "submitted_at" IS NOT NULL)
           )`,
        );
      }
    });

    it('reads an unrecognised claim status as one the gate refuses', async () => {
      // **A status outside the vocabulary must reach the gate as something
      // it can refuse.** `Rejected` is terminal: the decision gate refuses
      // it, and so does the review screen's decision action.
      //
      // **The database's own `claims_status_check` already restricts the
      // column,** so this row can only exist if the constraint is dropped.
      // Both constraints are dropped for the statement and restored in a
      // `finally`.
      const claimId = await insertPendingClaim();

      await prisma.$executeRawUnsafe(
        `ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "claims_decision_fields_check"`,
      );
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "claims" DROP CONSTRAINT IF EXISTS "claims_status_check"`,
      );

      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "claims" SET "status" = 'Verification Pending', "decided_at" = NOW()
           WHERE "id" = $1::uuid`,
          claimId,
        );

        const facts = await reviews.readReviewFacts(claimId);

        // **The unknown status arrives as `Rejected`** — a value the gate
        // refuses, rather than one it would wave through.
        expect(facts?.claim.status).toBe('Rejected');
      } finally {
        await prisma.$executeRawUnsafe(
          `UPDATE "claims" SET "status" = 'Pending', "decided_at" = NULL
           WHERE "id" = $1::uuid`,
          claimId,
        );

        await prisma.$executeRawUnsafe(
          `ALTER TABLE "claims" ADD CONSTRAINT "claims_decision_fields_check" CHECK (
              ("status" = 'Pending' AND "decided_at" IS NULL)
              OR ("status" <> 'Pending' AND "decided_at" IS NOT NULL)
           )`,
        );
        await prisma.$executeRawUnsafe(
          `ALTER TABLE "claims" ADD CONSTRAINT "claims_status_check" CHECK (
              "status" IN ('Pending', 'Approved', 'Rejected', 'Returned')
           )`,
        );
      }
    });
  });

  // ── The database's own constraints ───────────────────────────────────────

  describe('the claims decision constraint', () => {
    it('refuses a decided claim with no decision time', async () => {
      // **The database holds the rule too.** The domain refuses such a
      // Claim; the constraint refuses it as well, so a write that bypassed
      // the domain still cannot leave a decided Claim with no decision time.
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "claims" SET "status" = 'Approved' WHERE "id" = $1::uuid`,
          await insertPendingClaim(),
        ),
      ).rejects.toThrow();
    });

    it('refuses a pending claim that carries a decision time', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "claims" SET "decided_at" = NOW() WHERE "id" = $1::uuid`,
          await insertPendingClaim(),
        ),
      ).rejects.toThrow();
    });
  });
});
