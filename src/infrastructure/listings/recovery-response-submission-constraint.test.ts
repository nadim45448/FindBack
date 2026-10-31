/**
 * The Recovery Response submission constraints' suite — against a **live
 * database**.
 *
 * **What this suite is for.** The story's acceptance criterion is not "the
 * application refuses a second live response" — it is *"The one-live-
 * Response-per-responder rule is enforced by a database uniqueness
 * constraint, not only by an application check"*. A unit test cannot prove
 * that: the constraint lives in the schema, and a schema constraint is only
 * real if the database actually enforces it.
 *
 * Three properties are proven here that a mocked test could not:
 *
 * 1. **The uniqueness constraint exists.** Its definition is read from
 *    `pg_indexes`, so the suite fails if the migration's index is missing or
 *    is not the partial unique index the rule needs.
 * 2. **A second live Response from the same responder is rejected by the
 *    database.** The write is attempted and the error is caught, and the row
 *    is verified absent afterwards — so a constraint that raised a warning
 *    without blocking the write would fail the suite.
 * 3. **A terminal Response does not block a new live one.** The rule bounds
 *    *live* responses, and the history is retained — so the second write must
 *    succeed.
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
  RECOVERY_RESPONSE_OBSERVED_DETAILS_MAX_LENGTH,
  RECOVERY_RESPONSE_OBSERVED_DETAILS_MIN_LENGTH,
  RECOVERY_RESPONSE_WHERE_FOUND_MAX_LENGTH,
} from '@/domain/recovery';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Recovery Response submission constraints (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000781';
  const responderId = '00000000-0000-4000-8000-000000000782';
  const otherResponderId = '00000000-0000-4000-8000-000000000783';

  /** The Lost report the Responses are made against. */
  let reportId = '';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'An Owner', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'A Responder', 'Student', 'Active', false),
              ($5, $6, 'not-a-real-hash', 'Another Responder', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      ownerId,
      'owner-constraints@example.test',
      responderId,
      'responder-constraints@example.test',
      otherResponderId,
      'other-responder-constraints@example.test',
    );

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A brown leather wallet', 'Wallet',
               'A brown leather wallet with a folded receipt inside.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    reportId = rows[0]!.id;
  });

  /**
   * **Each test starts from an empty slate.** The uniqueness rule is about
   * what the *database* holds, so a Response left behind by one test would
   * change the verdict of the next. The Responses are deleted rather than
   * reset, because the rule that matters here is the one the index enforces
   * on the rows that are present.
   */
  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "recovery_responses" WHERE "report_id" = $1`,
      reportId,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "recovery_responses" WHERE "report_id" = $1`,
      reportId,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3)`,
      ownerId,
      responderId,
      otherResponderId,
    );
    await prisma.$disconnect();
  });

  /**
   * Insert a Recovery Response with the given status.
   *
   * **A terminal Response carries no submission fields,** because the
   * conditional `CHECK` only requires them of a `Submitted` Response — so
   * the rows a lifecycle path writes stay legal.
   */
  async function insertResponse(
    responder: string,
    status: string,
    whereFound: string | null = 'On a bench outside the east entrance.',
    observed: string | null = 'Brown leather, zip closure, scuffed corner.',
    dateFound: string | null = '2026-10-28',
  ): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                             "campus_area", "where_found_exact_place",
                             "observed_identifying_details", "date_found",
                             "submitted_at", "created_at", "updated_at")
       VALUES ($1, $2, $3,
               CASE WHEN $3 = 'Submitted' THEN 'library' ELSE NULL END,
               $4, $5, $6::date,
               CASE WHEN $3 = 'Submitted' THEN NOW() ELSE NULL END,
               NOW(), NOW())`,
      reportId,
      responder,
      status,
      whereFound,
      observed,
      dateFound,
    );
  }

  /** The number of Responses the responder holds on the report. */
  async function responseCount(responder: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM "recovery_responses"
       WHERE "report_id" = $1 AND "responder_id" = $2`,
      reportId,
      responder,
    );

    return Number(rows[0]!.count);
  }

  it('has the one-live-response-per-responder-per-report uniqueness constraint', async () => {
    const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'recovery_responses'
         AND indexname = 'uq_recovery_responses_one_live_per_report_per_responder'`,
    );

    expect(rows).toHaveLength(1);

    const definition = rows[0]!.indexdef;

    // **A UNIQUE index, over the pair, partial on the live statuses.** A
    // plain unique index would forbid the second Response the PRD allows
    // once the first is decided.
    expect(definition).toContain('CREATE UNIQUE INDEX');
    expect(definition).toContain('report_id');
    expect(definition).toContain('responder_id');
    expect(definition).toContain("'Submitted'::text");
    expect(definition).toContain("'Selected for Verification'::text");
    expect(definition).toContain("'Match Confirmed'::text");
  });

  it('rejects a second live response from the same responder', async () => {
    await insertResponse(responderId, 'Submitted');

    await expect(insertResponse(responderId, 'Submitted')).rejects.toThrow();

    // **The row is verified absent afterwards**, so a constraint that raised
    // a warning without blocking the write would fail this suite.
    expect(await responseCount(responderId)).toBe(1);
  });

  it('rejects a second live response from the same responder in a different live status', async () => {
    // The rule is *one live response*, not *one submitted response* — so a
    // `Selected for Verification` response still holds the slot.
    await insertResponse(responderId, 'Selected for Verification');

    await expect(insertResponse(responderId, 'Submitted')).rejects.toThrow();
  });

  it('rejects a second live response from a responder whose match is confirmed', async () => {
    // **`Match Confirmed` is non-terminal** (FR-41), so it holds the slot
    // too — the confirmed responder may not open a second response on a
    // report whose outcome is settled.
    await insertResponse(responderId, 'Match Confirmed');

    await expect(insertResponse(responderId, 'Submitted')).rejects.toThrow();
  });

  it('accepts a response from a different responder', async () => {
    // The rule bounds *this responder's* live responses on *this* report —
    // not the number of responses on the report. Multiple responders on one
    // Lost report are expected (PRD UJ-5).
    await insertResponse(responderId, 'Submitted');
    await insertResponse(otherResponderId, 'Submitted');

    expect(await responseCount(otherResponderId)).toBe(1);
  });

  it('accepts a new response from a responder whose earlier response was not a match', async () => {
    // The rule bounds *live* responses, and the history is retained — so a
    // responder whose response was `Not a Match` may respond again.
    await insertResponse(responderId, 'Not a Match', null, null, null);
    await insertResponse(responderId, 'Submitted');

    expect(await responseCount(responderId)).toBe(2);
  });

  it('accepts a new response from a responder whose earlier response was withdrawn', async () => {
    await insertResponse(responderId, 'Withdrawn', null, null, null);
    await insertResponse(responderId, 'Submitted');

    expect(await responseCount(responderId)).toBe(2);
  });

  it('rejects a submitted response whose exact place is too long', async () => {
    await expect(
      insertResponse(responderId, 'Submitted', 'a'.repeat(201)),
    ).rejects.toThrow();
  });

  it('rejects a submitted response whose observed details are too short', async () => {
    await expect(
      insertResponse(responderId, 'Submitted', undefined, 'short'),
    ).rejects.toThrow();
  });

  it('rejects a submitted response whose observed details are too long', async () => {
    await expect(
      insertResponse(responderId, 'Submitted', undefined, 'a'.repeat(501)),
    ).rejects.toThrow();
  });

  it('rejects a submitted response whose date found is in the future', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await expect(
      insertResponse(responderId, 'Submitted', undefined, undefined, tomorrow),
    ).rejects.toThrow();
  });

  it('rejects a submitted response whose date found is older than the bound', async () => {
    const tooOld = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString().slice(0, 10);

    await expect(
      insertResponse(responderId, 'Submitted', undefined, undefined, tooOld),
    ).rejects.toThrow();
  });

  it('rejects a submitted response that carries no campus area', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                 "where_found_exact_place", "observed_identifying_details",
                                 "date_found", "submitted_at", "created_at", "updated_at")
         VALUES ($1, $2, 'Submitted', 'On a bench.',
                 'Brown leather, zip closure, scuffed corner.',
                 DATE '2026-10-28', NOW(), NOW(), NOW())`,
        reportId,
        responderId,
      ),
    ).rejects.toThrow();
  });

  it('carries the exact-place bound in the check constraint', async () => {
    const rows = await prisma.$queryRawUnsafe<{ pg_get_constraintdef: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS pg_get_constraintdef FROM pg_constraint
       WHERE conrelid = 'recovery_responses'::regclass
         AND conname = 'recovery_responses_where_found_length_check'`,
    );

    expect(rows).toHaveLength(1);

    expect(rows[0]!.pg_get_constraintdef).toContain(
      `char_length(where_found_exact_place) <= ${RECOVERY_RESPONSE_WHERE_FOUND_MAX_LENGTH}`,
    );
  });

  it('carries the observed-details bound in the check constraint', async () => {
    const rows = await prisma.$queryRawUnsafe<{ pg_get_constraintdef: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS pg_get_constraintdef FROM pg_constraint
       WHERE conrelid = 'recovery_responses'::regclass
         AND conname = 'recovery_responses_observed_details_length_check'`,
    );

    expect(rows).toHaveLength(1);

    const definition = rows[0]!.pg_get_constraintdef;

    expect(definition).toContain(
      `char_length(observed_identifying_details) >= ${RECOVERY_RESPONSE_OBSERVED_DETAILS_MIN_LENGTH}`,
    );
    expect(definition).toContain(
      `char_length(observed_identifying_details) <= ${RECOVERY_RESPONSE_OBSERVED_DETAILS_MAX_LENGTH}`,
    );
  });

  it('carries the submitted-fields requirement in the check constraint', async () => {
    const rows = await prisma.$queryRawUnsafe<{ pg_get_constraintdef: string }[]>(
      `SELECT pg_get_constraintdef(oid) AS pg_get_constraintdef FROM pg_constraint
       WHERE conrelid = 'recovery_responses'::regclass
         AND conname = 'recovery_responses_submitted_fields_check'`,
    );

    expect(rows).toHaveLength(1);

    const definition = rows[0]!.pg_get_constraintdef;

    // **The constraint is anchored to the submission.** A Response that has
    // moved on from `Submitted` keeps what it had.
    expect(definition).toContain("status <> 'Submitted'::text");
    expect(definition).toContain('campus_area IS NOT NULL');
    expect(definition).toContain('observed_identifying_details IS NOT NULL');
    expect(definition).toContain('date_found IS NOT NULL');
    expect(definition).toContain('submitted_at IS NOT NULL');
  });
});
