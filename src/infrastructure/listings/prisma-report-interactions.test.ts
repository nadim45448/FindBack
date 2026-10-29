/**
 * The report interaction adapters' suite — against a **live database**.
 *
 * **Why a live database.** These adapters' job is to be right about the
 * *statements*: the `UPDATE … RETURNING` that both resolves and reports in
 * one act (ADR-10), the CHECK constraints on the status vocabularies, the
 * `ON DELETE CASCADE` that makes FR-10's hard delete take the dependent
 * records with it. A mock asserts only that the code called the method it
 * was told to call; it cannot catch a column that does not exist or a
 * constraint that is not actually there.
 *
 * **The batch property is the load-bearing assertion.** The set of rows a
 * resolver reports must be exactly the set it changed. That is only
 * observable against a real database — a fake `RETURNING` proves nothing.
 *
 * The suite is skipped when `DATABASE_URL` is not set, so a checkout without
 * a database still runs the unit suite.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaReportInteractionReader } from './prisma-report-interaction-reader';
import { PrismaReportInteractionResolver } from './prisma-report-interaction-resolver';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const REPORTER_ID = '00000000-0000-4000-8000-000000000801';
const CLAIMANT_ID = '00000000-0000-4000-8000-000000000802';
const RESPONDER_ID = '00000000-0000-4000-8000-000000000803';

describeWithDatabase('the report interaction adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reader = new PrismaReportInteractionReader(prisma);
  const resolver = new PrismaReportInteractionResolver(prisma);

  /** The id of the report the fixtures write into. */
  let reportId = '';

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, $3, $4, $5, $6, $7),
              ($8, $9, $3, $10, $5, $6, $7),
              ($11, $12, $3, $13, $5, $6, $7)
       ON CONFLICT ("id") DO NOTHING`,
      REPORTER_ID,
      'reporter@example.test',
      'not-a-real-hash',
      'The Reporter',
      'Student',
      'Active',
      false,
      CLAIMANT_ID,
      'claimant@example.test',
      'The Claimant',
      RESPONDER_ID,
      'responder@example.test',
      'The Responder',
    );
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');

    const inserted = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Open', 'A name', 'Wallet', 'A description',
               CURRENT_DATE, 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      REPORTER_ID,
    );

    reportId = inserted[0]?.id ?? '';
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe(
      'DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3)',
      REPORTER_ID,
      CLAIMANT_ID,
      RESPONDER_ID,
    );
    await prisma.$disconnect();
  });

  /** Write a Claim against the fixture report. */
  async function writeClaim(status: string, claimantId = CLAIMANT_ID): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "rejection_reason")
       VALUES ($1::uuid, $2::uuid, $3,
               CASE WHEN $3 = 'Rejected' THEN 'a prior reason' ELSE NULL END)
       RETURNING "id"`,
      reportId,
      claimantId,
      status,
    );

    return rows[0]?.id ?? '';
  }

  /** Write a Recovery Response against the fixture report. */
  async function writeResponse(status: string, responderId = RESPONDER_ID): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status")
       VALUES ($1::uuid, $2::uuid, $3)
       RETURNING "id"`,
      reportId,
      responderId,
      status,
    );

    return rows[0]?.id ?? '';
  }

  /** The status of a Claim, read through raw SQL. */
  async function claimStatus(claimId: string): Promise<string | undefined> {
    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      'SELECT "status" FROM "claims" WHERE "id" = $1::uuid',
      claimId,
    );

    return rows[0]?.status;
  }

  /** The status of a Recovery Response, read through raw SQL. */
  async function responseStatus(responseId: string): Promise<string | undefined> {
    const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
      'SELECT "status" FROM "recovery_responses" WHERE "id" = $1::uuid',
      responseId,
    );

    return rows[0]?.status;
  }

  describe('the interaction facts', () => {
    it('reports no interaction for a report that carries none', async () => {
      const facts = await reader.read(reportId);

      expect(facts).toEqual({
        hasClaim: false,
        hasRecoveryResponse: false,
        hasApprovedClaim: false,
        hasMatchConfirmed: false,
      });
    });

    it('reports a Claim of any status as a Claim', async () => {
      await writeClaim('Rejected');

      const facts = await reader.read(reportId);

      // **Existence, not activity.** A rejected Claim is terminal, and its
      // existence still blocks a hard delete.
      expect(facts.hasClaim).toBe(true);
    });

    it('reports a Recovery Response of any status as a Response', async () => {
      await writeResponse('Resolved — Report Closed');

      const facts = await reader.read(reportId);

      expect(facts.hasRecoveryResponse).toBe(true);
    });

    it('reports an approved Claim specifically', async () => {
      await writeClaim('Approved');

      const facts = await reader.read(reportId);

      expect(facts.hasApprovedClaim).toBe(true);
    });

    it('does not report a Pending Claim as approved', async () => {
      await writeClaim('Pending');

      const facts = await reader.read(reportId);

      expect(facts.hasApprovedClaim).toBe(false);
    });

    it('reports a Match Confirmed Response specifically', async () => {
      await writeResponse('Match Confirmed');

      const facts = await reader.read(reportId);

      expect(facts.hasMatchConfirmed).toBe(true);
    });

    it('does not report a Submitted Response as matched', async () => {
      await writeResponse('Submitted');

      const facts = await reader.read(reportId);

      expect(facts.hasMatchConfirmed).toBe(false);
    });

    it('does not see another report\'s interactions', async () => {
      await writeClaim('Pending');

      const other = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         VALUES ('Found', 'Open', 'Another', 'Wallet', 'A description',
                 CURRENT_DATE, 'library', $1, NOW(), NOW())
         RETURNING "id"`,
        REPORTER_ID,
      );

      const facts = await reader.read(other[0]?.id ?? '');

      expect(facts.hasClaim).toBe(false);
    });
  });

  describe('the Pending Claims', () => {
    it('reads only the Pending Claims', async () => {
      await writeClaim('Pending');
      await writeClaim('Approved');

      const claims = await reader.readPendingClaims(reportId);

      expect(claims).toHaveLength(1);
      expect(claims[0]?.claimStatus).toBe('Pending');
    });

    it('carries the claimant\'s address with the Claim', async () => {
      await writeClaim('Pending');

      const claims = await reader.readPendingClaims(reportId);

      // **The FR-29 notification must reach the claimant,** and the claim's
      // owner is the only place that knows the address.
      expect(claims[0]?.claimantEmail).toBe('claimant@example.test');
    });

    it('reads no Claims from a report that carries none', async () => {
      const claims = await reader.readPendingClaims(reportId);

      expect(claims).toEqual([]);
    });
  });

  describe('the non-terminal Recovery Responses', () => {
    it('reads a Submitted Response', async () => {
      await writeResponse('Submitted');

      const responses = await reader.readNonTerminalRecoveryResponses(reportId);

      expect(responses).toHaveLength(1);
      expect(responses[0]?.recoveryResponseStatus).toBe('Submitted');
    });

    it('reads a Selected for Verification Response', async () => {
      await writeResponse('Selected for Verification');

      const responses = await reader.readNonTerminalRecoveryResponses(reportId);

      expect(responses).toHaveLength(1);
    });

    it('does not read a Match Confirmed Response', async () => {
      // **Match Confirmed is terminal for this purpose** — a withdrawal is
      // blocked outright once one exists.
      await writeResponse('Match Confirmed');

      const responses = await reader.readNonTerminalRecoveryResponses(reportId);

      expect(responses).toEqual([]);
    });

    it('does not read an already-resolved Response', async () => {
      await writeResponse('Resolved — Report Closed');

      const responses = await reader.readNonTerminalRecoveryResponses(reportId);

      expect(responses).toEqual([]);
    });
  });

  describe('the rejection of the Pending Claims', () => {
    it('rejects every Pending Claim on the report', async () => {
      const first = await writeClaim('Pending');
      const second = await writeClaim('Pending', RESPONDER_ID);

      const rejected = await prisma.$transaction(async (tx) =>
        resolver.rejectPendingClaims(reportId, 'report withdrawn by reporter', {
          transaction: tx,
        }),
      );

      expect(rejected).toHaveLength(2);
      expect(await claimStatus(first)).toBe('Rejected');
      expect(await claimStatus(second)).toBe('Rejected');
    });

    it('returns exactly the rows it changed', async () => {
      // **The batch property (ADR-10).** The set that was rejected and the
      // set that is reported are the same set, by construction.
      const first = await writeClaim('Pending');
      const second = await writeClaim('Pending', RESPONDER_ID);

      const rejected = await prisma.$transaction(async (tx) =>
        resolver.rejectPendingClaims(reportId, 'report withdrawn by reporter', {
          transaction: tx,
        }),
      );

      const ids = rejected.map((claim) => claim.claimId).sort();

      expect(ids).toEqual([first, second].sort());
    });

    it('leaves a non-Pending Claim alone', async () => {
      const approved = await writeClaim('Approved');

      const rejected = await prisma.$transaction(async (tx) =>
        resolver.rejectPendingClaims(reportId, 'report withdrawn by reporter', {
          transaction: tx,
        }),
      );

      expect(rejected).toEqual([]);
      expect(await claimStatus(approved)).toBe('Approved');
    });

    it('records the rejection reason', async () => {
      const claimId = await writeClaim('Pending');

      await prisma.$transaction(async (tx) =>
        resolver.rejectPendingClaims(reportId, 'report withdrawn by reporter', {
          transaction: tx,
        }),
      );

      const rows = await prisma.$queryRawUnsafe<{ rejection_reason: string }[]>(
        'SELECT "rejection_reason" FROM "claims" WHERE "id" = $1::uuid',
        claimId,
      );

      expect(rows[0]?.rejection_reason).toBe('report withdrawn by reporter');
    });

    it('carries the claimant\'s address with each rejected Claim', async () => {
      await writeClaim('Pending');

      const rejected = await prisma.$transaction(async (tx) =>
        resolver.rejectPendingClaims(reportId, 'report withdrawn by reporter', {
          transaction: tx,
        }),
      );

      expect(rejected[0]?.claimantEmail).toBe('claimant@example.test');
    });

    it('rejects nothing when there is nothing Pending', async () => {
      const rejected = await prisma.$transaction(async (tx) =>
        resolver.rejectPendingClaims(reportId, 'report withdrawn by reporter', {
          transaction: tx,
        }),
      );

      expect(rejected).toEqual([]);
    });

    it('refuses a handle that carries no usable transaction', async () => {
      // Falling back to the root client could commit the rejection without
      // the report's status change — leaving a `Closed` report with a
      // `Pending` Claim.
      await expect(
        resolver.rejectPendingClaims(reportId, 'report withdrawn by reporter', {
          transaction: {},
        }),
      ).rejects.toThrow(/transaction/);
    });
  });

  describe('the resolution of the non-terminal Recovery Responses', () => {
    it('resolves every non-terminal Response on the report', async () => {
      const submitted = await writeResponse('Submitted');
      const selected = await writeResponse('Selected for Verification', RESPONDER_ID);

      const resolved = await prisma.$transaction(async (tx) =>
        resolver.resolveNonTerminalRecoveryResponses(reportId, { transaction: tx }),
      );

      expect(resolved).toHaveLength(2);
      expect(await responseStatus(submitted)).toBe('Resolved — Report Closed');
      expect(await responseStatus(selected)).toBe('Resolved — Report Closed');
    });

    it('returns exactly the rows it changed', async () => {
      const submitted = await writeResponse('Submitted');
      const selected = await writeResponse('Selected for Verification', RESPONDER_ID);

      const resolved = await prisma.$transaction(async (tx) =>
        resolver.resolveNonTerminalRecoveryResponses(reportId, { transaction: tx }),
      );

      const ids = resolved.map((response) => response.recoveryResponseId).sort();

      expect(ids).toEqual([submitted, selected].sort());
    });

    it('does not resolve a Match Confirmed Response', async () => {
      const confirmed = await writeResponse('Match Confirmed');

      const resolved = await prisma.$transaction(async (tx) =>
        resolver.resolveNonTerminalRecoveryResponses(reportId, { transaction: tx }),
      );

      expect(resolved).toEqual([]);
      expect(await responseStatus(confirmed)).toBe('Match Confirmed');
    });

    it('does not resolve an already-resolved Response', async () => {
      const resolvedId = await writeResponse('Resolved — Report Closed');

      const resolved = await prisma.$transaction(async (tx) =>
        resolver.resolveNonTerminalRecoveryResponses(reportId, { transaction: tx }),
      );

      expect(resolved).toEqual([]);
      expect(await responseStatus(resolvedId)).toBe('Resolved — Report Closed');
    });

    it('refuses a handle that carries no usable transaction', async () => {
      await expect(
        resolver.resolveNonTerminalRecoveryResponses(reportId, { transaction: {} }),
      ).rejects.toThrow(/transaction/);
    });
  });

  describe('the constraints', () => {
    it('refuses a Claim whose status is not one of the four', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "claims" ("report_id", "claimant_id", "status")
           VALUES ($1::uuid, $2::uuid, 'Maybe')`,
          reportId,
          CLAIMANT_ID,
        ),
      ).rejects.toThrow();
    });

    it('refuses a Rejected Claim that carries no reason', async () => {
      // **A rejected Claim carries the reason it was rejected.** The CHECK
      // holds the invariant even if a path bypasses the application.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "claims" ("report_id", "claimant_id", "status", "rejection_reason")
           VALUES ($1::uuid, $2::uuid, 'Rejected', NULL)`,
          reportId,
          CLAIMANT_ID,
        ),
      ).rejects.toThrow();
    });

    it('refuses a Recovery Response whose status is not one of the eight', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status")
           VALUES ($1::uuid, $2::uuid, 'Perhaps')`,
          reportId,
          RESPONDER_ID,
        ),
      ).rejects.toThrow();
    });

    it('refuses a Claim against a report that does not exist', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "claims" ("report_id", "claimant_id", "status")
           VALUES ('00000000-0000-4000-8000-00000000dead'::uuid, $1::uuid, 'Pending')`,
          CLAIMANT_ID,
        ),
      ).rejects.toThrow();
    });

    it('removes a report\'s Claims with it', async () => {
      // **PRD §10: the related Claims are removed with the report** under
      // FR-10's hard delete.
      await writeClaim('Pending');
      await writeResponse('Submitted');

      await prisma.$executeRawUnsafe('DELETE FROM "reports" WHERE "id" = $1::uuid', reportId);

      const claims = await prisma.$queryRawUnsafe<{ id: string }[]>(
        'SELECT "id" FROM "claims" WHERE "report_id" = $1::uuid',
        reportId,
      );
      const responses = await prisma.$queryRawUnsafe<{ id: string }[]>(
        'SELECT "id" FROM "recovery_responses" WHERE "report_id" = $1::uuid',
        reportId,
      );

      expect(claims).toEqual([]);
      expect(responses).toEqual([]);
    });
  });
});
