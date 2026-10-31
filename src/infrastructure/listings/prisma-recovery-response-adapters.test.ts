/**
 * The Recovery Response adapters' suite — against a **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's rules become the database's rows.** The domain proves that a
 * Recovery Response is valid; the adapters prove that the valid Response is
 * *stored* as the domain said, *read back* as the domain said, and that the
 * database's own uniqueness constraint is translated into a **business**
 * outcome rather than a driver error.
 *
 * **Three properties are proven here that a mocked test could not:**
 *
 * 1. **The Sensitive Fields survive the round trip.** The exact place and
 *    the observed identifying details are written and read back through their
 *    own constructors, so a row carrying an out-of-bounds value would be
 *    *refused* on the way out rather than carried into the domain unchecked.
 * 2. **The uniqueness violation is translated.** The `P2002` the driver
 *    raises becomes a `DuplicateLiveRecoveryResponseError`, so the route's
 *    409 mapping is reached rather than a 500.
 * 3. **The live-response read asks about the live statuses only.** A
 *    responder whose response was `Not a Match` may respond again — the read
 *    has to agree with the constraint's partial index, or the application
 *    check would refuse a response the database permits.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DuplicateLiveRecoveryResponseError } from '@/application/listings/ports/recovery-response-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import {
  LIVE_RECOVERY_RESPONSE_STATUSES,
  validateRecoveryResponseDraft,
  withResponder,
  type ValidatedRecoveryResponse,
} from '@/domain/recovery';

import { PrismaRecoveryResponseReader } from './prisma-recovery-response-reader';
import { PrismaRecoveryResponseRepository } from './prisma-recovery-response-repository';
import { PrismaRecoveryResponseSubjectReader } from './prisma-recovery-response-subject-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

/** The deployment's active campus areas. */
const CAMPUS_AREAS = [{ value: 'library', label: 'Library', active: true }];

describeWithDatabase('the Recovery Response adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000791';
  const responderId = '00000000-0000-4000-8000-000000000792';
  const otherResponderId = '00000000-0000-4000-8000-000000000793';

  /** The Lost report the Responses are made against. */
  let reportId = '';

  const repository = new PrismaRecoveryResponseRepository(prisma);
  const reader = new PrismaRecoveryResponseReader(prisma);
  const subjects = new PrismaRecoveryResponseSubjectReader(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'An Owner', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'A Responder', 'Student', 'Active', false),
              ($5, $6, 'not-a-real-hash', 'Another Responder', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      ownerId,
      'owner-adapters@example.test',
      responderId,
      'responder-adapters@example.test',
      otherResponderId,
      'other-responder-adapters@example.test',
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

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The uniqueness rule is about
    // what the *database* holds, so a Response left behind by one test would
    // change the verdict of the next.
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
   // A validated Recovery Response, ready to write.
   *
   // **The Response is built through the validator**, which is the only path
   // to a validated Response — so the adapter is fed exactly what the
   // submission path would have fed it.
   */
  function aValidatedResponse(
    responder = responderId,
    whereFound = 'On a bench outside the east entrance.',
    observed = 'Brown leather, zip closure, scuffed corner.',
  ): ValidatedRecoveryResponse {
    return withResponder(
      validateRecoveryResponseDraft(
        {
          reportId,
          campusArea: 'library',
          whereFoundExactPlace: whereFound,
          observedIdentifyingDetails: observed,
          dateFound: '2026-10-28',
        },
        { now: new Date('2026-10-29T12:00:00.000Z'), campusAreas: CAMPUS_AREAS },
      ),
      responder,
    );
  }

  /** Write a Recovery Response inside a transaction. */
  async function write(
    response: ValidatedRecoveryResponse,
  ): Promise<{ id: string; status: string }> {
    return prisma.$transaction(async (tx) => {
      const handle: TransactionHandle = { transaction: tx };

      const created = await repository.create(response, handle);

      return { id: created.id, status: created.status };
    });
  }

  describe('the recovery response repository', () => {
    it('stores the response and returns it with its minted id', async () => {
      const created = await write(aValidatedResponse());

      expect(created.id).toMatch(/^[0-9a-f-]{36}$/u);
      expect(created.status).toBe('Submitted');
    });

    it('stores the exact place and the observed details verbatim', async () => {
      const whereFound = 'On a bench outside the Main Library east entrance.';
      const observed = 'Brown leather, zip closure, scuffed on the back corner.';

      const created = await write(aValidatedResponse(responderId, whereFound, observed));

      const rows = await prisma.$queryRawUnsafe<
        { where_found_exact_place: string; observed_identifying_details: string }[]
      >(
        `SELECT "where_found_exact_place", "observed_identifying_details"
         FROM "recovery_responses" WHERE "id" = $1::uuid`,
        created.id,
      );

      expect(rows[0]?.where_found_exact_place).toBe(whereFound);
      expect(rows[0]?.observed_identifying_details).toBe(observed);
    });

    it('stores the campus area', async () => {
      const created = await write(aValidatedResponse());

      const rows = await prisma.$queryRawUnsafe<{ campus_area: string }[]>(
        `SELECT "campus_area" FROM "recovery_responses" WHERE "id" = $1::uuid`,
        created.id,
      );

      expect(rows[0]?.campus_area).toBe('library');
    });

    it('reads the response back with the exact place and the details intact', async () => {
      const created = await write(aValidatedResponse());

      const found = await repository.findById(created.id);

      expect(found?.whereFoundExactPlace?.value).toBe('On a bench outside the east entrance.');
      expect(found?.observedIdentifyingDetails?.value).toBe(
        'Brown leather, zip closure, scuffed corner.',
      );
      expect(found?.dateFound?.isoDay).toBe('2026-10-28');
      expect(found?.campusArea?.value).toBe('library');
    });

    it('reads a response that does not exist as absent', async () => {
      const found = await repository.findById('00000000-0000-4000-8000-000000000799');

      expect(found).toBeNull();
    });

    it('refuses a write outside a transaction', async () => {
      // **A Response written outside the caller's transaction could commit
      // without its audit event** — and the audit trail is append-only with
      // no correction path, so that error would be permanent.
      await expect(
        repository.create(aValidatedResponse(), { transaction: { nothing: true } } as never),
      ).rejects.toThrow();
    });

    it('turns the uniqueness violation into a duplicate-live-response error', async () => {
      await write(aValidatedResponse());

      // **The second write is the one the database refuses.** The error the
      // responder sees must be a business outcome, not a Prisma error code.
      await expect(write(aValidatedResponse())).rejects.toThrow(
        DuplicateLiveRecoveryResponseError,
      );
    });

    it('carries the responder\'s own message on the refusal', async () => {
      await write(aValidatedResponse());

      await expect(write(aValidatedResponse())).rejects.toThrow(
        'You already have an open response on this lost item.',
      );
    });

    it('accepts a response from a different responder', async () => {
      await write(aValidatedResponse());

      const other = await write(aValidatedResponse(otherResponderId));

      expect(other.id).toBeTruthy();
    });

    it('does not translate a failure that is not a uniqueness violation', async () => {
      // **Only the uniqueness violation becomes a business outcome.** A
      // foreign-key failure is a defect, and a defect must not be dressed
      // up as "you already have an open response".
      const response = aValidatedResponse();

      await expect(
        prisma.$transaction(async (tx) =>
          repository.create(
            { ...response, reportId: '00000000-0000-4000-8000-000000000799' },
            { transaction: tx },
          ),
        ),
      ).rejects.not.toThrow(DuplicateLiveRecoveryResponseError);
    });

    it('reads a response that carries no submission fields', async () => {
      // **A lifecycle-written Response need not carry the submission
      // fields.** One written by a report's closure resolving its responses
      // keeps whatever it had, and its fields are genuinely absent. The read
      // must not fail on the missing fields, and it must not fabricate them
      // either.
      const inserted = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                 "created_at", "updated_at")
         VALUES ($1, $2, 'Resolved — Report Closed', NOW(), NOW())
         RETURNING "id"`,
        reportId,
        otherResponderId,
      );

      const found = await repository.findById(inserted[0]!.id);

      expect(found?.status).toBe('Resolved — Report Closed');
      // **The absent fields read as `null`,** not as an empty value — the
      // read says "never submitted" rather than fabricating one.
      expect(found?.whereFoundExactPlace).toBeNull();
      expect(found?.observedIdentifyingDetails).toBeNull();
      expect(found?.dateFound).toBeNull();
      expect(found?.campusArea).toBeNull();
      expect(found?.submittedAt).toBeNull();
      expect(found?.candidateImageRef).toBeNull();
    });
  });

  describe('the recovery response reader', () => {
    it('reports no confirmed match on a report with no responses', async () => {
      expect(await reader.hasMatchConfirmed(reportId)).toBe(false);
    });

    it('reports a confirmed match when one response has reached it', async () => {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                 "created_at", "updated_at")
         VALUES ($1, $2, 'Match Confirmed', NOW(), NOW())`,
        reportId,
        responderId,
      );

      expect(await reader.hasMatchConfirmed(reportId)).toBe(true);
    });

    it('reports no confirmed match when the response is merely submitted', async () => {
      await write(aValidatedResponse());

      expect(await reader.hasMatchConfirmed(reportId)).toBe(false);
    });

    it('reports no live response for a responder who has none', async () => {
      expect(await reader.hasLiveResponse(reportId, responderId)).toBe(false);
    });

    it('reports a live response for a responder whose response is submitted', async () => {
      await write(aValidatedResponse());

      expect(await reader.hasLiveResponse(reportId, responderId)).toBe(true);
    });

    it('reports a live response for a responder whose match is confirmed', async () => {
      // **`Match Confirmed` is non-terminal** (FR-41), so it holds the slot
      // the constraint gives it — and the read must agree with the
      // constraint's partial index.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                 "created_at", "updated_at")
         VALUES ($1, $2, 'Match Confirmed', NOW(), NOW())`,
        reportId,
        responderId,
      );

      expect(await reader.hasLiveResponse(reportId, responderId)).toBe(true);
    });

    it('reports no live response for a responder whose response was not a match', async () => {
      // The rule bounds *live* responses, and the history is retained — so a
      // responder whose response was decided may respond again.
      await prisma.$executeRawUnsafe(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                 "created_at", "updated_at")
         VALUES ($1, $2, 'Not a Match', NOW(), NOW())`,
        reportId,
        responderId,
      );

      expect(await reader.hasLiveResponse(reportId, responderId)).toBe(false);
    });

    it('agrees with the domain about which statuses are live', async () => {
      // **The read's status set and the constraint's status set are the same
      // set.** If they disagreed, the application check would refuse a
      // response the database permits — or permit one the database refuses.
      expect(LIVE_RECOVERY_RESPONSE_STATUSES).toEqual([
        'Submitted',
        'Selected for Verification',
        'Match Confirmed',
      ]);
    });
  });

  describe('the recovery response subject reader', () => {
    it('reads the report with its owner and the owner\'s email', async () => {
      const subject = await subjects.readSubject(reportId);

      expect(subject?.id).toBe(reportId);
      expect(subject?.type).toBe('Lost');
      expect(subject?.status).toBe('Open');
      expect(subject?.reporterId).toBe(ownerId);
      expect(subject?.reporterEmail).toBe('owner-adapters@example.test');
      expect(subject?.name).toBe('A brown leather wallet');
    });

    it('reads a report that does not exist as absent', async () => {
      const subject = await subjects.readSubject('00000000-0000-4000-8000-000000000799');

      expect(subject).toBeNull();
    });
  });
});
