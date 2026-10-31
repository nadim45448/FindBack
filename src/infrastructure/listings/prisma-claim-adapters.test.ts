/**
 * The Claim adapters' suite — against a **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's rules become the database's rows.** The domain proves that a
 * Claim is valid; the adapters prove that the valid Claim is *stored* as
 * the domain said, *read back* as the domain said, and that the database's
 * own uniqueness constraint is translated into a **business** outcome rather
 * than a driver error.
 *
 * **Three properties are proven here that a mocked test could not:**
 *
 * 1. **The Sensitive Fields survive the round trip.** The reason and the
 *    identifying details are written and read back through their own
 *    constructors, so a row carrying an out-of-bounds value would be
 *    *refused* on the way out rather than carried into the domain unchecked.
 * 2. **The uniqueness violation is translated.** The `P2002` the driver
 *    raises becomes a `DuplicatePendingClaimError`, so the route's 409
 *    mapping is reached rather than a 500.
 * 3. **The pending-claim read asks about `Pending` Claims only.** A member
 *    whose claim was rejected may claim again — the read has to agree with
 *    the constraint's partial index, or the application check would refuse
 *    a claim the database permits.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DuplicatePendingClaimError } from '@/application/listings/ports/claim-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  validateClaimDraft,
  withClaimant,
  type ValidatedClaim,
} from '@/domain/listings';

import { PrismaClaimRepository } from './prisma-claim-repository';
import { PrismaClaimSubjectReader } from './prisma-claim-subject-reader';
import { PrismaPendingClaimReader } from './prisma-pending-claim-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Claim adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const finderId = '00000000-0000-4000-8000-000000000761';
  const claimantId = '00000000-0000-4000-8000-000000000762';
  const otherClaimantId = '00000000-0000-4000-8000-000000000763';

  /** The report the Claims are made against. */
  let reportId = '';

  const repository = new PrismaClaimRepository(prisma);
  const pendingClaims = new PrismaPendingClaimReader(prisma);
  const subjects = new PrismaClaimSubjectReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'A Finder', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'A Claimant', 'Student', 'Active', false),
              ($5, $6, 'not-a-real-hash', 'Another Claimant', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      finderId,
      'finder-adapters@example.test',
      claimantId,
      'claimant-adapters@example.test',
      otherClaimantId,
      'other-claimant-adapters@example.test',
    );

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Open', 'A brown leather wallet', 'Wallet',
               'A brown leather wallet with a folded receipt inside.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      finderId,
    );

    reportId = rows[0]!.id;
  });

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The uniqueness rule is about
    // what the *database* holds, so a Claim left behind by one test would
    // change the verdict of the next.
    await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "report_id" = $1`, reportId);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "report_id" = $1`, reportId);
    await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3)`,
      finderId,
      claimantId,
      otherClaimantId,
    );
    await prisma.$disconnect();
  });

  /** A validated Claim, ready to write. */
  function aValidatedClaim(
    claimant = claimantId,
    reason = 'It is my brown leather wallet.',
    details = 'Blue cardholder with a dent.',
  ): ValidatedClaim {
    // **The Claim is built through the validator**, which is the only path
    // to a validated Claim — so the adapter is fed exactly what the
    // submission path would have fed it.
    return withClaimant(
      validateClaimDraft(
        {
          reportId,
          reason,
          identifyingDetails: details,
          dateLost: '2026-10-20',
        },
        { now: new Date('2026-10-29T12:00:00.000Z') },
      ),
      claimant,
    );
  }

  /** Write a Claim inside a transaction. */
  async function write(
    claim: ValidatedClaim,
  ): Promise<{ id: string; status: string }> {
    return prisma.$transaction(async (tx) => {
      const handle: TransactionHandle = { transaction: tx };

      const created = await repository.create(claim, handle);

      return { id: created.id, status: created.status };
    });
  }

  describe('the claim repository', () => {
    it('stores the claim and returns it with its minted id', async () => {
      const created = await write(aValidatedClaim());

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(created.status).toBe('Pending');
    });

    it('stores the reason and the identifying details verbatim', async () => {
      const reason = 'It is my brown leather wallet, with the folded receipt.';
      const details = 'Blue cardholder with a dent in the corner.';

      const created = await write(aValidatedClaim(claimantId, reason, details));

      const rows = await prisma.$queryRawUnsafe<
        { reason: string; identifying_details: string }[]
      >(
        `SELECT "reason", "identifying_details" FROM "claims" WHERE "id" = $1::uuid`,
        created.id,
      );

      expect(rows[0]?.reason).toBe(reason);
      expect(rows[0]?.identifying_details).toBe(details);
    });

    it('reads the claim back with the reason and the details intact', async () => {
      const created = await write(aValidatedClaim());

      const found = await repository.findById(created.id);

      expect(found?.reason?.value).toBe('It is my brown leather wallet.');
      expect(found?.identifyingDetails?.value).toBe('Blue cardholder with a dent.');
      expect(found?.dateLost.isoDay).toBe('2026-10-20');
    });

    it('reads a claim that does not exist as absent', async () => {
      const found = await repository.findById('00000000-0000-4000-8000-000000000799');

      expect(found).toBeNull();
    });

    it('refuses a write outside a transaction', async () => {
      // **A Claim written outside the caller's transaction could commit
      // without its audit event** — and the audit trail is append-only with
      // no correction path, so that error would be permanent.
      await expect(
        repository.create(aValidatedClaim(), { transaction: { nothing: true } } as never),
      ).rejects.toThrow();
    });

    it('turns the uniqueness violation into a duplicate-pending-claim error', async () => {
      await write(aValidatedClaim());

      // **The second write is the one the database refuses.** The error the
      // member sees must be a business outcome, not a Prisma error code.
      await expect(write(aValidatedClaim())).rejects.toThrow(DuplicatePendingClaimError);
    });

    it('carries the member’s own message on the refusal', async () => {
      await write(aValidatedClaim());

      await expect(write(aValidatedClaim())).rejects.toThrow(
        'You already have a claim pending on this item.',
      );
    });

    it('accepts a second claim from a different member', async () => {
      await write(aValidatedClaim());

      const other = await write(aValidatedClaim(otherClaimantId));

      expect(other.id).toBeTruthy();
    });

    it('does not translate a failure that is not a uniqueness violation', async () => {
      // **Only the uniqueness violation becomes a business outcome.** A
      // foreign-key failure is a defect, and a defect must not be dressed
      // up as "you already have a claim pending".
      const claim = aValidatedClaim(claimantId);

      await expect(
        prisma.$transaction(async (tx) =>
          repository.create(
            { ...claim, reportId: '00000000-0000-4000-8000-000000000799' },
            { transaction: tx },
          ),
        ),
      ).rejects.not.toThrow(DuplicatePendingClaimError);
    });

    it('reads a decided claim that carries no submission fields', async () => {
      // **A decided Claim need not carry the submission fields.** One
      // written by a lifecycle path — a withdrawal's auto-rejection, say —
      // keeps whatever it had, and its reason, its details, and its date are
      // genuinely absent. The read must not fail on the missing fields, and
      // it must not fabricate them either.
      const inserted = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "rejection_reason",
                               "decided_at", "created_at", "updated_at")
         VALUES ($1, $2, 'Rejected', 'The item does not match.', NOW(), NOW(), NOW())
         RETURNING "id"`,
        reportId,
        claimantId,
      );

      const found = await repository.findById(inserted[0]!.id);

      expect(found).not.toBeNull();
      expect(found?.status).toBe('Rejected');
      expect(found?.reason).toBeNull();
      expect(found?.identifyingDetails).toBeNull();
      expect(found?.submittedAt).toBeNull();
    });
  });

  describe('the pending-claim reader', () => {
    it('reports no pending claim for a member who has not claimed', async () => {
      const has = await pendingClaims.hasPendingClaim(reportId, claimantId);

      expect(has).toBe(false);
    });

    it('reports a pending claim for a member who has claimed', async () => {
      await write(aValidatedClaim());

      const has = await pendingClaims.hasPendingClaim(reportId, claimantId);

      expect(has).toBe(true);
    });

    it('does not count a rejected claim', async () => {
      // **The rule bounds *pending* Claims.** A member whose claim was
      // rejected may claim again — so a `Rejected` Claim must not make the
      // read say yes.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "rejection_reason",
                               "decided_at", "created_at", "updated_at")
         VALUES ($1, $2, 'Rejected', 'The item does not match.', NOW(), NOW(), NOW())`,
        reportId,
        claimantId,
      );

      const has = await pendingClaims.hasPendingClaim(reportId, claimantId);

      expect(has).toBe(false);
    });

    it('does not count another member’s pending claim', async () => {
      await write(aValidatedClaim(otherClaimantId));

      const has = await pendingClaims.hasPendingClaim(reportId, claimantId);

      expect(has).toBe(false);
    });

    it('does not count a pending claim on another report', async () => {
      const other = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         VALUES ('Found', 'Open', 'A red bag', 'Bag', 'A red fabric bag with a torn strap.',
                 DATE '2026-10-28', 'library', $1, NOW(), NOW())
         RETURNING "id"`,
        finderId,
      );

      await prisma.$executeRawUnsafe(
        `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                               "reason", "identifying_details", "date_lost",
                               "created_at", "updated_at")
         VALUES ($1, $2, 'Pending', NOW(), 'It is my red fabric bag.',
                 'Red bag with a torn strap.', DATE '2026-10-20', NOW(), NOW())`,
        other[0]!.id,
        claimantId,
      );

      const has = await pendingClaims.hasPendingClaim(reportId, claimantId);

      expect(has).toBe(false);

      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, other[0]!.id);
    });

    it('reads the same answer inside a transaction', async () => {
      // **The transaction is optional, and the answer must not change** —
      // otherwise the same question would have two answers.
      await write(aValidatedClaim());

      const has = await prisma.$transaction(async (tx) =>
        pendingClaims.hasPendingClaim(reportId, claimantId, { transaction: tx }),
      );

      expect(has).toBe(true);
    });

    it('refuses a read on a handle that carries no transaction', async () => {
      await expect(
        pendingClaims.hasPendingClaim(reportId, claimantId, {
          transaction: { nothing: true },
        } as never),
      ).rejects.toThrow();
    });
  });

  describe('the claim subject reader', () => {
    it('reads the report with its owner and the owner\'s email', async () => {
      const subject = await subjects.readSubject(reportId);

      expect(subject?.id).toBe(reportId);
      expect(subject?.type).toBe('Found');
      expect(subject?.status).toBe('Open');
      expect(subject?.reporterId).toBe(finderId);
      expect(subject?.reporterEmail).toBe('finder-adapters@example.test');
      expect(subject?.name).toBe('A brown leather wallet');
    });

    it('reads a report that does not exist as absent', async () => {
      const subject = await subjects.readSubject(
        '00000000-0000-4000-8000-000000000799',
      );

      expect(subject).toBeNull();
    });

    it('reads the same subject inside a transaction', async () => {
      // **The transaction is optional, and the subject must not change** —
      // otherwise the gate and the notification would see different facts.
      const subject = await prisma.$transaction(async (tx) =>
        subjects.readSubject(reportId, { transaction: tx }),
      );

      expect(subject?.reporterEmail).toBe('finder-adapters@example.test');
    });

    it('refuses a read on a handle that carries no transaction', async () => {
      await expect(
        subjects.readSubject(reportId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow();
    });
  });
});
