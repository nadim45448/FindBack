/**
 * The Claim submission constraints' suite — against a **live database**.
 *
 * **What this suite is for.** The story's acceptance criterion is not "the
 * application refuses a second pending claim" — it is *"The one-`Pending`-
 * Claim-per-item-per-member rule is enforced by a database uniqueness
 * constraint, not only by an application check"*. A unit test cannot prove
 * that: the constraint lives in the schema, and a schema constraint is only
 * real if the database actually enforces it.
 *
 * Three properties are proven here that a mocked test could not:
 *
 * 1. **The uniqueness constraint exists.** Its definition is read from
 *    `pg_indexes`, so the suite fails if the migration's index is missing or
 *    is not the partial unique index the rule needs.
 * 2. **A second `Pending` Claim from the same member is rejected by the
 *    database.** The write is attempted and the error is caught, and the row
 *    is verified absent afterwards — so a constraint that raised a warning
 *    without blocking the write would fail the suite.
 * 3. **A `Rejected` Claim does not block a new `Pending` one.** The rule
 *    bounds *pending* Claims, and the history is retained — so the second
 *    write must succeed.
 *
 * **The `CHECK` constraints are read out of `pg_constraint` and compared
 * against the domain's bounds**, so a migration and the domain that drift
 * apart fail the suite rather than the bug reaching production.
 *
 * **The suite skips when `DATABASE_URL` is unset,** so a checkout without a
 * database still runs the rest of the suite green.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  CLAIM_DATE_LOST_MAX_AGE_DAYS,
  CLAIM_IDENTIFYING_DETAILS_MAX_LENGTH,
  CLAIM_IDENTIFYING_DETAILS_MIN_LENGTH,
  CLAIM_REASON_MAX_LENGTH,
  CLAIM_REASON_MIN_LENGTH,
} from '@/domain/listings';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Claim submission constraints (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const finderId = '00000000-0000-4000-8000-000000000741';
  const claimantId = '00000000-0000-4000-8000-000000000742';
  const otherClaimantId = '00000000-0000-4000-8000-000000000743';

  /** The report the Claims are made against. */
  let reportId = '';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'A Finder', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'A Claimant', 'Student', 'Active', false),
              ($5, $6, 'not-a-real-hash', 'Another Claimant', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      finderId,
      'finder-constraints@example.test',
      claimantId,
      'claimant-constraints@example.test',
      otherClaimantId,
      'other-claimant-constraints@example.test',
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

  /**
   * **Each test starts from an empty slate.** The uniqueness rule is about
   * what the *database* holds, so a Claim left behind by one test would
   * change the verdict of the next. The Claims are deleted rather than
   * reset, because the rule that matters here is the one the index enforces
   * on the rows that are present.
   */
  beforeEach(async () => {
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

  /**
   * Insert a Claim with the given status.
   *
   * **A `Rejected` Claim carries a rejection reason,** because bolt `008`'s
   * `claims_rejection_reason_check` requires one — a decided Claim has to say
   * why it was decided.
   *
   * **A decided Claim also carries a decision time,** because bolt `016`'s
   * `claims_decision_fields_check` requires one — the row records *that* it
   * was decided and *when*, and the trail records why.
   */
  async function insertClaim(
    claimant: string,
    status: string,
    reason = 'It is my brown leather wallet.',
    details = 'Blue cardholder with a dent.',
    dateLost = '2026-10-20',
  ): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "reason",
                             "identifying_details", "date_lost", "rejection_reason",
                             "decided_at", "submitted_at", "created_at", "updated_at")
       VALUES ($1, $2, $3, $4, $5, $6::date,
               CASE WHEN $3 = 'Rejected' THEN 'The item does not match.' ELSE NULL END,
               CASE WHEN $3 = 'Pending' THEN NULL ELSE NOW() END,
               NOW(), NOW(), NOW())`,
      reportId,
      claimant,
      status,
      reason,
      details,
      dateLost,
    );
  }

  /** The number of Claims the member holds on the report. */
  async function claimCount(claimant: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM "claims"
       WHERE "report_id" = $1 AND "claimant_id" = $2`,
      reportId,
      claimant,
    );

    return Number(rows[0]!.count);
  }

  it('has the one-pending-claim-per-item-per-member uniqueness constraint', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'claims' AND indexname = 'uq_claims_one_pending_per_report_per_claimant'`,
    );

    expect(rows).toHaveLength(1);

    const definition = rows[0]!.indexdef;

    // **A UNIQUE index, over the pair, partial on `Pending`.** A plain
    // unique index would forbid the second claim the PRD allows once the
    // first is decided.
    expect(definition).toContain('CREATE UNIQUE INDEX');
    expect(definition).toContain('report_id');
    expect(definition).toContain('claimant_id');
    expect(definition).toContain("WHERE (status = 'Pending'::text)");
  });

  it('rejects a second pending claim from the same member', async () => {
    await insertClaim(claimantId, 'Pending');

    await expect(insertClaim(claimantId, 'Pending')).rejects.toThrow();

    // **The row is verified absent afterwards**, so a constraint that raised
    // a warning without blocking the write would fail this suite.
    expect(await claimCount(claimantId)).toBe(1);
  });

  it('accepts a second claim from a different member', async () => {
    // The rule bounds *this member's* pending claims on *this* item — not
    // the number of claims on the item.
    await insertClaim(claimantId, 'Pending');
    await insertClaim(otherClaimantId, 'Pending');

    expect(await claimCount(otherClaimantId)).toBe(1);
  });

  it('accepts a new pending claim from a member whose earlier claim was rejected', async () => {
    // The rule bounds *pending* Claims, and the history is retained — so a
    // member whose claim was rejected may claim again.
    await insertClaim(
      claimantId,
      'Rejected',
      'It is my brown leather wallet.',
      'Blue cardholder.',
      '2026-10-20',
    );
    await insertClaim(claimantId, 'Pending');

    expect(await claimCount(claimantId)).toBe(2);
  });

  it('rejects a pending claim whose reason is too short', async () => {
    await expect(
      insertClaim(claimantId, 'Pending', 'too short', 'Blue cardholder with a dent.', '2026-10-20'),
    ).rejects.toThrow();
  });

  it('rejects a pending claim whose identifying details are too short', async () => {
    await expect(
      insertClaim(claimantId, 'Pending', 'It is my brown leather wallet.', 'short', '2026-10-20'),
    ).rejects.toThrow();
  });

  it('rejects a pending claim whose date lost is in the future', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await expect(
      insertClaim(claimantId, 'Pending', 'It is my brown leather wallet.', 'Blue cardholder with a dent.', tomorrow),
    ).rejects.toThrow();
  });

  it('rejects a pending claim whose date lost is older than the bound', async () => {
    const tooOld = new Date(
      Date.now() - (CLAIM_DATE_LOST_MAX_AGE_DAYS + 1) * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);

    await expect(
      insertClaim(claimantId, 'Pending', 'It is my brown leather wallet.', 'Blue cardholder with a dent.', tooOld),
    ).rejects.toThrow();
  });

  it('rejects a pending claim that carries no reason', async () => {
    await expect(
      insertClaim(claimantId, 'Pending', '', 'Blue cardholder with a dent.', '2026-10-20'),
    ).rejects.toThrow();
  });

  it('carries the reason and identifying-details bounds in the check constraint', async () => {
    const rows = await prisma.$queryRawUnsafe<{ pg_get_constraintdef: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS pg_get_constraintdef FROM pg_constraint
       WHERE conrelid = 'claims'::regclass AND conname = 'claims_reason_length_check'`,
    );

    expect(rows).toHaveLength(1);

    // **PostgreSQL normalises `BETWEEN` into two comparisons,** so the
    // constraint's own text is read in its normalised form — and the
    // *numbers* in it are still compared against the domain's bounds, so a
    // migration and the domain that drift apart fail here.
    const definition = rows[0]!.pg_get_constraintdef;

    expect(definition).toContain(`char_length(reason) >= ${CLAIM_REASON_MIN_LENGTH}`);
    expect(definition).toContain(`char_length(reason) <= ${CLAIM_REASON_MAX_LENGTH}`);
  });

  it('carries the identifying-details bound in the check constraint', async () => {
    const rows = await prisma.$queryRawUnsafe<{ pg_get_constraintdef: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS pg_get_constraintdef FROM pg_constraint
       WHERE conrelid = 'claims'::regclass AND conname = 'claims_identifying_details_length_check'`,
    );

    expect(rows).toHaveLength(1);

    const definition = rows[0]!.pg_get_constraintdef;

    expect(definition).toContain(
      `char_length(identifying_details) >= ${CLAIM_IDENTIFYING_DETAILS_MIN_LENGTH}`,
    );
    expect(definition).toContain(
      `char_length(identifying_details) <= ${CLAIM_IDENTIFYING_DETAILS_MAX_LENGTH}`,
    );
  });
});
