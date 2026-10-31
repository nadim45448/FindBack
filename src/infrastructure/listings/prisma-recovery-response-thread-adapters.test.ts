/**
 * The Recovery Response thread and withdrawal adapters' suite — against a
 * **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's guarantees become the database's rows.** The domain proves that
 * a body is bounded, that a thread is per-Response, and that only a
 * `Submitted` response may be withdrawn; the adapters prove that the rows
 * agree with all three.
 *
 * **Five properties are proven here that a mocked test could not:**
 *
 * 1. **The parent's own columns agree.** The repository writes
 *    `parent_id`, `parent_type`, and `claim_id` from one source, and the
 *    database's own CHECK constraints say they must agree — so a Lost-side
 *    thread can never be filed under a Claim, and never point at another
 *    Response.
 * 2. **The isolation is enforced in the query.** Two Responses on the same
 *    Lost report have separate threads, and a reader of one never sees the
 *    other's messages — which is what makes the isolation a rule rather than
 *    a convention.
 * 3. **The conditional write is the fact.** A withdrawal matches only a
 *    response still `Submitted`, so a response selected between the read
 *    and the write is not withdrawn — and the write lands nothing.
 * 4. **The database's constraints are live.** A body of 2001 characters, a
 *    `recovery_response` parent that names a Claim, and a parent kind the
 *    vocabulary does not own are all refused by PostgreSQL itself.
 * 5. **A deleted item takes its thread with it.** PRD §10 says a report's
 *    threads live exactly as long as the report does.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import { createRecoveryResponseThreadMessageBody } from '@/domain/recovery';

import { PrismaRecoveryResponseThreadReader } from './prisma-recovery-response-thread-reader';
import { PrismaRecoveryResponseThreadRepository } from './prisma-recovery-response-thread-repository';
import { PrismaRecoveryResponseWithdrawalRepository } from './prisma-recovery-response-withdrawal-repository';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the recovery response thread adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000811';
  const responderId = '00000000-0000-4000-8000-000000000812';
  const competingResponderId = '00000000-0000-4000-8000-000000000813';
  const administratorId = '00000000-0000-4000-8000-000000000814';

  /** The Lost report the Responses are made against. */
  let reportId = '';

  const reader = new PrismaRecoveryResponseThreadReader(prisma);
  const threads = new PrismaRecoveryResponseThreadRepository(prisma);
  const withdrawals = new PrismaRecoveryResponseWithdrawalRepository(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'The Owner', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'A Responder', 'Student', 'Active', false),
              ($5, $6, 'not-a-real-hash', 'A Competing Responder', 'Student', 'Active', false),
              ($7, $8, 'not-a-real-hash', 'The Administrator', 'Employee', 'Active', true)
       ON CONFLICT ("id") DO NOTHING`,
      ownerId,
      'owner-threads@example.test',
      responderId,
      'responder-threads@example.test',
      competingResponderId,
      'competing-responder-threads@example.test',
      administratorId,
      'administrator-threads@example.test',
    );

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A grey knitted scarf', 'Clothing',
               'A grey knitted scarf with a white stripe at one end.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    reportId = rows[0]!.id;
  });

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The rules are about what
    // the *database* holds, so a Response left behind by one test would
    // change the verdict of the next.
    await prisma.$executeRawUnsafe(`DELETE FROM "recovery_responses" WHERE "report_id" = $1`, reportId);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "thread_messages" WHERE "report_id" = $1 AND "parent_type" = 'recovery_response'`,
      reportId,
    );

    // **The report is recreated when it is missing,** because one test
    // deletes it outright to prove the cascade — and the next test needs a
    // report to make a Response against.
    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "reports" WHERE "id" = $1`,
      reportId,
    );

    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "reports" ("id", "type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         VALUES ($1, 'Lost', 'Open', 'A grey knitted scarf', 'Clothing',
                 'A grey knitted scarf with a white stripe at one end.',
                 DATE '2026-10-28', 'library', $2, NOW(), NOW())`,
        reportId,
        ownerId,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Open' WHERE "id" = $1`,
        reportId,
      );
    }
  });

  afterAll(async () => {
    // **The teardown is guarded,** because a `beforeAll` that never
    // completed leaves no report id — and a delete against an empty uuid
    // would fail for a reason that has nothing to do with the test.
    if (reportId.length > 0) {
      await prisma.$executeRawUnsafe(`DELETE FROM "recovery_responses" WHERE "report_id" = $1`, reportId);
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3, $4)`,
      ownerId,
      responderId,
      competingResponderId,
      administratorId,
    );
    await prisma.$disconnect();
  });

  /**
   * Insert a `Submitted` Recovery Response and return its id.
   */
  async function insertSubmittedResponse(responder = responderId): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "recovery_responses" ("report_id", "responder_id", "status", "submitted_at",
                                          "campus_area", "where_found_exact_place",
                                          "observed_identifying_details", "date_found",
                                          "created_at", "updated_at")
       VALUES ($1, $2, 'Submitted', NOW(), 'library', 'On the third bench',
               'A white stripe at one end.', DATE '2026-10-29', NOW(), NOW())
       RETURNING "id"`,
      reportId,
      responder,
    );

    return rows[0]!.id;
  }

  /**
   * Post a message through the repository, inside a transaction.
   */
  async function postMessage(
    responseId: string,
    body: string,
    authorId = responderId,
    authorDisplayName = 'A Responder',
  ): Promise<string> {
    return prisma.$transaction(async (tx) => {
      const handle: TransactionHandle = { transaction: tx };

      const stored = await threads.postMessage(
        {
          recoveryResponseId: responseId,
          lostReportId: reportId,
          authorId,
          authorDisplayName,
          body: createRecoveryResponseThreadMessageBody(body),
          postedAt: new Date(),
        },
        handle,
      );

      return stored.id;
    });
  }

  // ── The repository's write ───────────────────────────────────────────────

  describe('the recovery response thread repository', () => {
    it('writes a message whose parent columns agree with each other', async () => {
      const responseId = await insertSubmittedResponse();

      const messageId = await postMessage(responseId, 'Is it still by the library?');

      const rows = await prisma.$queryRawUnsafe<
        {
          parent_type: string;
          parent_id: string;
          claim_id: string | null;
          report_id: string;
          author_id: string;
          author_display_name: string;
          body: string;
        }[]
      >(
        `SELECT "parent_type", "parent_id", "claim_id", "report_id",
                "author_id", "author_display_name", "body"
         FROM "thread_messages" WHERE "id" = $1::uuid`,
        messageId,
      );

      // **The parent type is `recovery_response`,** because this repository
      // writes Lost-side threads only.
      expect(rows[0]?.parent_type).toBe('recovery_response');
      // **The parent id is the Response's id** — the thread is addressed by
      // its Response, and by nothing else.
      expect(rows[0]?.parent_id).toBe(responseId);
      // **And the Claim column is null.** A Recovery Response has no Claim,
      // and the database's `thread_messages_parent_claim_consistency_check`
      // says a `recovery_response` parent must name none.
      expect(rows[0]?.claim_id).toBeNull();
      expect(rows[0]?.report_id).toBe(reportId);
      expect(rows[0]?.author_id).toBe(responderId);
      expect(rows[0]?.author_display_name).toBe('A Responder');
      expect(rows[0]?.body).toBe('Is it still by the library?');
    });

    it('writes the trimmed body the domain measured', async () => {
      const responseId = await insertSubmittedResponse();

      const messageId = await postMessage(responseId, '  Hello there  ');

      const rows = await prisma.$queryRawUnsafe<{ body: string }[]>(
        `SELECT "body" FROM "thread_messages" WHERE "id" = $1::uuid`,
        messageId,
      );

      // **The row holds the text a reader will see,** so the database's
      // `char_length` check is checking the same string the domain bounded.
      expect(rows[0]?.body).toBe('Hello there');
    });

    it('refuses a write outside the caller\'s transaction', async () => {
      // **A message written outside the caller's transaction could commit
      // without its audit event** — and the trail is append-only with no
      // correction path, so that hole would be permanent.
      const responseId = await insertSubmittedResponse();

      await expect(
        threads.postMessage(
          {
            recoveryResponseId: responseId,
            lostReportId: reportId,
            authorId: responderId,
            authorDisplayName: 'A Responder',
            body: createRecoveryResponseThreadMessageBody('Hello'),
            postedAt: new Date(),
          },
          { transaction: { nothing: true } } as never,
        ),
      ).rejects.toThrow("must be written inside the caller's transaction");
    });

    it('refuses a write on a handle whose transaction is null', async () => {
      const responseId = await insertSubmittedResponse();

      await expect(
        threads.postMessage(
          {
            recoveryResponseId: responseId,
            lostReportId: reportId,
            authorId: responderId,
            authorDisplayName: 'A Responder',
            body: createRecoveryResponseThreadMessageBody('Hello'),
            postedAt: new Date(),
          },
          { transaction: null } as never,
        ),
      ).rejects.toThrow("must be written inside the caller's transaction");
    });

    it('rolls the message back when the transaction fails', async () => {
      // **The message and its audit event commit together or not at all.**
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$transaction(async (tx) => {
          const handle: TransactionHandle = { transaction: tx };

          await threads.postMessage(
            {
              recoveryResponseId: responseId,
              lostReportId: reportId,
              authorId: responderId,
              authorDisplayName: 'A Responder',
              body: createRecoveryResponseThreadMessageBody('Hello'),
              postedAt: new Date(),
            },
            handle,
          );

          throw new Error('The audit write failed.');
        }),
      ).rejects.toThrow('The audit write failed.');

      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS "count" FROM "thread_messages"
         WHERE "parent_type" = 'recovery_response' AND "parent_id" = $1::uuid`,
        responseId,
      );

      expect(rows[0]?.count).toBe(0n);
    });
  });

  // ── The reader's reads ───────────────────────────────────────────────────

  describe('the recovery response thread reader', () => {
    it('reads the subject with the facts the gate needs', async () => {
      const responseId = await insertSubmittedResponse();

      const subject = await reader.readThreadSubject(responseId);

      expect(subject?.recoveryResponseId).toBe(responseId);
      expect(subject?.lostReportId).toBe(reportId);
      expect(subject?.responseStatus).toBe('Submitted');
      expect(subject?.reportStatus).toBe('Open');
      // **The responder is the Response's own responder, and the owner is
      // the Lost report's reporter** — the two members the participation
      // rule names.
      expect(subject?.responderId).toBe(responderId);
      expect(subject?.lostReportOwnerId).toBe(ownerId);
    });

    it('reads a response that does not exist as absent', async () => {
      const subject = await reader.readThreadSubject(
        '00000000-0000-4000-8000-000000000819',
      );

      expect(subject).toBeNull();
    });

    it('reads the subject after the report has ended', async () => {
      const responseId = await insertSubmittedResponse();

      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Closed' WHERE "id" = $1`,
        reportId,
      );

      const subject = await reader.readThreadSubject(responseId);

      // **The report's status is read as it is,** because the writability
      // rule is a whitelist and a stale status would wave a message
      // through.
      expect(subject?.reportStatus).toBe('Closed');
    });

    it('reads the history oldest first', async () => {
      const responseId = await insertSubmittedResponse();

      await postMessage(responseId, 'First', responderId, 'A Responder');
      await postMessage(responseId, 'Second', ownerId, 'The Owner');
      await postMessage(responseId, 'Third', administratorId, 'The Administrator');

      const messages = await reader.listThreadMessages(responseId);

      expect(messages.map((message) => message.body)).toEqual(['First', 'Second', 'Third']);
      // **The display name is captured, not joined** — a conversation whose
      // authors were re-read from the accounts table would change its
      // wording every time an account was renamed.
      expect(messages.map((message) => message.authorDisplayName)).toEqual([
        'A Responder',
        'The Owner',
        'The Administrator',
      ]);
    });

    it('reads no messages for a thread that has none', async () => {
      const responseId = await insertSubmittedResponse();

      const messages = await reader.listThreadMessages(responseId);

      expect(messages).toEqual([]);
    });

    it('reads one response\'s thread without another response\'s', async () => {
      // **The isolation guarantee, enforced in the query.** Two Responses on
      // the same Lost report have separate threads, and a reader of one
      // never sees the other's messages.
      const first = await insertSubmittedResponse();
      const second = await insertSubmittedResponse(competingResponderId);

      await postMessage(first, 'About the first one');
      await postMessage(second, 'About the second one');

      const firstMessages = await reader.listThreadMessages(first);
      const secondMessages = await reader.listThreadMessages(second);

      expect(firstMessages.map((message) => message.body)).toEqual(['About the first one']);
      expect(secondMessages.map((message) => message.body)).toEqual(['About the second one']);
    });

    it('never reads another thread\'s messages into this one', async () => {
      // **A per-report thread would hand every candidate the conversation of
      // every other candidate.** The filter is on the parent pair, so the
      // competing responder's message is not in this thread.
      const first = await insertSubmittedResponse();
      const second = await insertSubmittedResponse(competingResponderId);

      await postMessage(second, 'A private word to the owner');

      const firstMessages = await reader.listThreadMessages(first);

      expect(firstMessages).toEqual([]);
    });

    it('reads the author\'s display name', async () => {
      const name = await reader.readAuthorDisplayName(responderId);

      expect(name).toBe('A Responder');
    });

    it('reads an author that does not exist as absent', async () => {
      const name = await reader.readAuthorDisplayName(
        '00000000-0000-4000-8000-000000000819',
      );

      expect(name).toBeNull();
    });

    it('reads inside the caller\'s transaction when one is supplied', async () => {
      const responseId = await insertSubmittedResponse();

      const subject = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return reader.readThreadSubject(responseId, handle);
      });

      expect(subject?.recoveryResponseId).toBe(responseId);
    });

    it('refuses an in-transaction read on a handle that carries no transaction', async () => {
      const responseId = await insertSubmittedResponse();

      await expect(
        reader.readThreadSubject(responseId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow("must be read inside the caller's transaction");
    });

    it('refuses an in-transaction history read on a handle that carries no transaction', async () => {
      const responseId = await insertSubmittedResponse();

      await expect(
        reader.listThreadMessages(responseId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow("must be read inside the caller's transaction");
    });
  });

  // ── The round trip ───────────────────────────────────────────────────────

  describe('the reader and the writer together', () => {
    it('round-trips a message through the repository and the reader', async () => {
      const responseId = await insertSubmittedResponse();
      const postedAt = new Date('2026-10-30T09:15:00.000Z');

      const messageId = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        const stored = await threads.postMessage(
          {
            recoveryResponseId: responseId,
            lostReportId: reportId,
            authorId: ownerId,
            authorDisplayName: 'The Owner',
            body: createRecoveryResponseThreadMessageBody('When can you collect it?'),
            postedAt,
          },
          handle,
        );

        return stored.id;
      });

      const messages = await reader.listThreadMessages(responseId);

      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe(messageId);
      expect(messages[0]?.authorId).toBe(ownerId);
      expect(messages[0]?.authorDisplayName).toBe('The Owner');
      expect(messages[0]?.body).toBe('When can you collect it?');
      expect(messages[0]?.postedAt).toBe('2026-10-30T09:15:00.000Z');
    });

    it('takes the thread with the report when the report is deleted', async () => {
      // **A hard delete of the report takes its Responses and their threads
      // with it** (FR-10).
      const responseId = await insertSubmittedResponse();

      await postMessage(responseId, 'About to be removed');

      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);

      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS "count" FROM "thread_messages"
         WHERE "parent_type" = 'recovery_response' AND "parent_id" = $1::uuid`,
        responseId,
      );

      expect(rows[0]?.count).toBe(0n);
    });
  });

  // ── The database's own constraints ───────────────────────────────────────

  describe('the thread messages constraints', () => {
    it('refuses a body longer than 2000 characters', async () => {
      // **The database holds the bound too.** The domain refuses such a
      // body; the constraint refuses it as well, so a write that bypassed
      // the domain still cannot leave an out-of-bounds message on the
      // record.
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('recovery_response', $1::uuid, NULL, $2::uuid, $3::uuid,
                   'A Responder', $4, NOW())`,
          responseId,
          reportId,
          responderId,
          'x'.repeat(2001),
        ),
      ).rejects.toThrow();
    });

    it('refuses an empty body', async () => {
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('recovery_response', $1::uuid, NULL, $2::uuid, $3::uuid,
                   'A Responder', '', NOW())`,
          responseId,
          reportId,
          responderId,
        ),
      ).rejects.toThrow();
    });

    it('accepts a body of exactly 2000 characters', async () => {
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('recovery_response', $1::uuid, NULL, $2::uuid, $3::uuid,
                   'A Responder', $4, NOW())`,
          responseId,
          reportId,
          responderId,
          'x'.repeat(2000),
        ),
      ).resolves.toBeDefined();
    });

    it('refuses a parent kind the vocabulary does not own', async () => {
      // **A kind nobody has thought about is refused, not stored and
      // ignored** — a row whose parent kind is misspelled would be
      // invisible to every reader.
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('comment', $1::uuid, NULL, $2::uuid, $3::uuid,
                   'A Responder', 'Hello', NOW())`,
          responseId,
          reportId,
          responderId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a recovery response parent that names a claim', async () => {
      // **The two parent kinds are exclusive.** A `recovery_response`
      // parent that also names a Claim would be read by the Claim thread's
      // reader — and the Claim's thread would show a Lost-side message.
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('recovery_response', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Responder', 'Hello', NOW())`,
          responseId,
          reportId,
          responderId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a message whose report does not exist', async () => {
      // **The foreign key is the second line of defence.** A report id that
      // names no report cannot be written even if the CHECK constraints
      // were somehow satisfied.
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('recovery_response', $1::uuid, NULL,
                   '00000000-0000-4000-8000-000000000819'::uuid, $2::uuid,
                   'A Responder', 'Hello', NOW())`,
          responseId,
          responderId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a message whose author does not exist', async () => {
      // **A message attributed to someone who does not exist** would be a
      // record of speech by a member who is not there.
      const responseId = await insertSubmittedResponse();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('recovery_response', $1::uuid, NULL, $2::uuid,
                   '00000000-0000-4000-8000-000000000819'::uuid,
                   'A Responder', 'Hello', NOW())`,
          responseId,
          reportId,
        ),
      ).rejects.toThrow();
    });
  });

  // ── The withdrawal repository ────────────────────────────────────────────

  describe('the recovery response withdrawal repository', () => {
    it('reads the withdrawal facts', async () => {
      const responseId = await insertSubmittedResponse();

      const facts = await withdrawals.readWithdrawalFacts(responseId);

      expect(facts?.recoveryResponseId).toBe(responseId);
      expect(facts?.lostReportId).toBe(reportId);
      expect(facts?.status).toBe('Submitted');
      expect(facts?.responderId).toBe(responderId);
    });

    it('reads a response that does not exist as absent', async () => {
      const facts = await withdrawals.readWithdrawalFacts(
        '00000000-0000-4000-8000-000000000819',
      );

      expect(facts).toBeNull();
    });

    it('withdraws a submitted response', async () => {
      const responseId = await insertSubmittedResponse();

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return withdrawals.withdraw(responseId, handle);
      });

      expect(landed).toBe(true);

      const facts = await withdrawals.readWithdrawalFacts(responseId);

      expect(facts?.status).toBe('Withdrawn');
    });

    it('lands nothing when the response is no longer Submitted', async () => {
      // **The conditional write is the fact that holds under a race.** A
      // response selected between the read and the write matches no rows.
      const responseId = await insertSubmittedResponse();

      await prisma.$executeRawUnsafe(
        `UPDATE "recovery_responses" SET "status" = 'Selected for Verification' WHERE "id" = $1::uuid`,
        responseId,
      );

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return withdrawals.withdraw(responseId, handle);
      });

      expect(landed).toBe(false);

      const facts = await withdrawals.readWithdrawalFacts(responseId);

      // **And the response is unchanged** — a withdrawal that did not happen
      // leaves no trace on the record.
      expect(facts?.status).toBe('Selected for Verification');
    });

    it('lands nothing when the response is already Withdrawn', async () => {
      const responseId = await insertSubmittedResponse();

      await prisma.$executeRawUnsafe(
        `UPDATE "recovery_responses" SET "status" = 'Withdrawn' WHERE "id" = $1::uuid`,
        responseId,
      );

      const landed = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return withdrawals.withdraw(responseId, handle);
      });

      expect(landed).toBe(false);
    });

    it('refuses a write outside the caller\'s transaction', async () => {
      // **A withdrawal written outside the caller's transaction could
      // commit without its audit event** — and the trail is append-only with
      // no correction path, so that hole would be permanent.
      const responseId = await insertSubmittedResponse();

      await expect(
        withdrawals.withdraw(responseId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow("must be written inside the caller's transaction");
    });

    it('refuses a write on a handle whose transaction is null', async () => {
      const responseId = await insertSubmittedResponse();

      await expect(
        withdrawals.withdraw(responseId, { transaction: null } as never),
      ).rejects.toThrow("must be written inside the caller's transaction");
    });

    it('leaves the report\'s status untouched', async () => {
      // **The report is not touched by a withdrawal.** A withdrawn response
      // leaves the Lost report's status unaffected — the report may be
      // `Verification Pending` because of a *different* selection.
      const responseId = await insertSubmittedResponse();

      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Verification Pending' WHERE "id" = $1`,
        reportId,
      );

      await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        await withdrawals.withdraw(responseId, handle);
      });

      const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      expect(rows[0]?.status).toBe('Verification Pending');
    });
  });
});
