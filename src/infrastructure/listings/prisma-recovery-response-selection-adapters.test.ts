/**
 * The Lost-side selection and determination adapters' suite — against a
 * **live database**.
 *
 * **What this suite is for.** The adapters are the mechanism the services
 * call: the conditional `UPDATE` that makes two concurrent owners resolve to
 * exactly one commit, and the conditional report moves that keep the two
 * workflows apart. A unit test with a fake repository proves the *service*
 * behaves; only a real database proves the *write* is conditional.
 *
 * Four properties are proven here that a mocked test could not:
 *
 * 1. **The conditional write lands only once.** A second selection of the
 *    same response finds nothing to update and reports `false`.
 * 2. **The report's moves are conditional.** `moveToVerificationPending`
 *    lands only on an `Open` report; `moveToOpen` lands only on a
 *    `Verification Pending` one.
 * 3. **A Found report reads as absent.** The subject reader filters on
 *    `type = 'Lost'`, so a Found report is `null` rather than a Found
 *    report wearing a Lost report's shape.
 * 4. **The response's status is scoped to its report.** A response that
 *    belongs to another report reads as `null`.
 *
 * **The suite skips when `DATABASE_URL` is unset,** so a checkout without a
 * database still runs the rest of the suite green.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaLostReportSubjectReader } from './prisma-lost-report-subject-reader';
import { PrismaRecoveryResponseSelectionRepository } from './prisma-recovery-response-selection-repository';
import { PrismaRecoveryResponseResponderReader } from './prisma-recovery-response-responder-reader';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the Lost-side selection adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000751';
  const responderA = '00000000-0000-4000-8000-000000000752';
  const responderB = '00000000-0000-4000-8000-000000000753';

  const lostReports = new PrismaLostReportSubjectReader(prisma);
  const responses = new PrismaRecoveryResponseSelectionRepository(prisma);
  const responders = new PrismaRecoveryResponseResponderReader(prisma);

  let lostReportId = '';
  let foundReportId = '';
  let responseA = '';
  let responseB = '';

  beforeAll(async () => {
    for (const [id, email] of [
      [ownerId, 'adapter-owner@example.test'],
      [responderA, 'adapter-a@example.test'],
      [responderB, 'adapter-b@example.test'],
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

    const lost = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A green notebook', 'Books/Notebooks',
               'A green notebook with a sticky tab in the back cover.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    lostReportId = lost[0]!.id;

    const found = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Open', 'A set of keys', 'Keys',
               'A set of three keys on a red lanyard.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    foundReportId = found[0]!.id;

    const insert = async (responder: string): Promise<string> => {
      const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status",
                                            "campus_area", "where_found_exact_place",
                                            "observed_identifying_details", "date_found",
                                            "submitted_at", "created_at", "updated_at")
         VALUES ($1, $2, 'Submitted', 'library', 'On a bench.',
                 'Green cover, sticky tab inside.', DATE '2026-10-28', NOW(), NOW(), NOW())
         RETURNING "id"`,
        lostReportId,
        responder,
      );

      return rows[0]!.id;
    };

    responseA = await insert(responderA);
    responseB = await insert(responderB);
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" IN ($1, $2)`, lostReportId, foundReportId);

    for (const id of [ownerId, responderA, responderB]) {
      await prisma.$executeRawUnsafe(`DELETE FROM "accounts" WHERE "id" = $1`, id);
    }

    await prisma.$disconnect();
  });

  describe('the subject reader', () => {
    it('reads a Lost report with its owner', async () => {
      const subject = await lostReports.readLostReport(lostReportId);

      expect(subject?.type).toBe('Lost');
      expect(subject?.reporterId).toBe(ownerId);
      expect(subject?.status).toBe('Open');
      expect(subject?.name).toBe('A green notebook');
    });

    it('reads a Found report as absent', async () => {
      // **The port reads Lost reports.** A Found report is not one, so it is
      // absent rather than a Found report wearing a Lost report's shape.
      expect(await lostReports.readLostReport(foundReportId)).toBeNull();
    });

    it('reads a report that does not exist as absent', async () => {
      expect(
        await lostReports.readLostReport('00000000-0000-4000-8000-0000000000ff'),
      ).toBeNull();
    });
  });

  describe('the conditional report moves', () => {
    it('moves an Open report to Verification Pending exactly once', async () => {
      // **The write is conditional on the report still being `Open`,** so
      // two owners selecting concurrently cannot both move the report.
      const first = await prisma.$transaction(async (transaction) =>
        lostReports.moveToVerificationPending(lostReportId, { transaction }),
      );

      expect(first).toBe(true);

      const second = await prisma.$transaction(async (transaction) =>
        lostReports.moveToVerificationPending(lostReportId, { transaction }),
      );

      // **The second write lands nothing.** The report is no longer `Open`.
      expect(second).toBe(false);
    });

    it('refuses to move a report that is not Verification Pending back to Open', async () => {
      // **The move is conditional on the report being `Verification
      // Pending`,** so a report that has already left that status is not
      // moved again.
      const report = await lostReports.readLostReport(lostReportId);

      expect(report?.status).toBe('Verification Pending');

      const landed = await prisma.$transaction(async (transaction) =>
        lostReports.moveToOpen(lostReportId, { transaction }),
      );

      expect(landed).toBe(true);

      // **The second write lands nothing** — the report is `Open` now.
      const again = await prisma.$transaction(async (transaction) =>
        lostReports.moveToOpen(lostReportId, { transaction }),
      );

      expect(again).toBe(false);
    });

    it('refuses a write outside the caller’s transaction', async () => {
      // **A handle that carries no usable transaction is refused** rather
      // than silently falling back to the root client. A report moved
      // outside the transaction that also writes its audit events would
      // leave the two disagreeing.
      await expect(
        lostReports.moveToVerificationPending(lostReportId, { transaction: {} } as never),
      ).rejects.toThrow(/transaction/);
    });
  });

  describe('the selection repository', () => {
    it('reads the report’s selection facts', async () => {
      const facts = await responses.readSelectionFacts(lostReportId);

      expect(facts?.selectedResponseId).toBeNull();
      expect(facts?.selectedResponseStatus).toBeNull();
    });

    it('reads a response’s status', async () => {
      expect(await responses.readResponseStatus(lostReportId, responseA)).toBe('Submitted');
    });

    it('reads a response on another report as absent', async () => {
      // **The report is part of the `WHERE` clause,** so a response that
      // belongs to a different report reads as `null`.
      expect(await responses.readResponseStatus(foundReportId, responseA)).toBeNull();
    });

    it('reads the selection facts of a report that does not exist as absent', async () => {
      expect(
        await responses.readSelectionFacts('00000000-0000-4000-8000-0000000000ff'),
      ).toBeNull();
    });

    it('selects a Submitted response exactly once', async () => {
      // **The write is conditional on the response still being `Submitted`.**
      // A response decided between the read and the write is not selected.
      const selected = await prisma.$transaction(async (transaction) =>
        responses.selectForVerification(responseA, { transaction }),
      );

      expect(selected).toBe(true);

      const again = await prisma.$transaction(async (transaction) =>
        responses.selectForVerification(responseA, { transaction }),
      );

      expect(again).toBe(false);
    });

    it('reads the selected response as the report’s selection facts', async () => {
      const facts = await responses.readSelectionFacts(lostReportId);

      expect(facts?.selectedResponseId).toBe(responseA);
      expect(facts?.selectedResponseStatus).toBe('Selected for Verification');
    });

    it('determines a selected response exactly once', async () => {
      // **The write is conditional on the response still being selected.** A
      // response that was determined between the read and the write is not
      // determined again.
      const determined = await prisma.$transaction(async (transaction) =>
        responses.determine(responseA, 'Match Confirmed', { transaction }),
      );

      expect(determined).toBe(true);

      const again = await prisma.$transaction(async (transaction) =>
        responses.determine(responseA, 'Not a Match', { transaction }),
      );

      expect(again).toBe(false);

      expect(await responses.readResponseStatus(lostReportId, responseA)).toBe('Match Confirmed');
    });

    it('refuses a write outside the caller’s transaction', async () => {
      // **A handle that carries no usable transaction is refused** rather
      // than silently falling back to the root client.
      await expect(
        responses.selectForVerification(responseB, { transaction: {} } as never),
      ).rejects.toThrow(/transaction/);

      await expect(
        responses.determine(responseB, 'Match Confirmed', { transaction: {} } as never),
      ).rejects.toThrow(/transaction/);
    });
  });

  describe('the responder reader', () => {
    it('reads the responder’s address', async () => {
      const responder = await responders.readResponder(responseA);

      expect(responder?.email).toBe('adapter-a@example.test');
    });

    it('reads the responder’s address inside a transaction', async () => {
      const responder = await prisma.$transaction(async (transaction) =>
        responders.readResponder(responseA, { transaction }),
      );

      expect(responder?.email).toBe('adapter-a@example.test');
    });

    it('reads a response that does not exist as absent', async () => {
      expect(
        await responders.readResponder('00000000-0000-4000-8000-0000000000ff'),
      ).toBeNull();
    });

    it('refuses a read outside the caller’s transaction when one is required', async () => {
      // **A handle that carries no usable transaction is refused** rather
      // than silently falling back to the root client.
      await expect(
        responders.readResponder(responseA, { transaction: {} } as never),
      ).rejects.toThrow(/transaction/);
    });
  });
});
