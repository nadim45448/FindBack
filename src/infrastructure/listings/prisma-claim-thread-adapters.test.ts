/**
 * The claim thread adapters' suite — against a **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's guarantees become the database's rows.** The domain proves that
 * a body is bounded and that a Claim thread names its Claim; the adapters
 * prove that the row the write leaves behind agrees with both.
 *
 * **Four properties are proven here that a mocked test could not:**
 *
 * 1. **The parent's own columns agree.** The repository writes
 *    `parent_id`, `parent_type`, and `claim_id` from one source, and the
 *    database's own CHECK constraints say they must agree — so a thread
 *    can never point at a Claim it does not belong to.
 * 2. **The constraints are live.** A body of 2001 characters, a `claim`
 *    parent with no `claim_id`, a `parent_id` that disagrees with the
 *    `claim_id`, and a parent kind the vocabulary does not own are all
 *    refused by PostgreSQL itself — so a write that bypassed the domain
 *    still cannot leave an illegal row on the record.
 * 3. **The reader and the writer agree.** A message written through the
 *    repository is read back through the reader, and it is read back
 *    against the same `(parent_type, parent_id)` pair the visibility reader
 *    filters on — so the two readers can never disagree about which
 *    messages belong to which thread.
 * 4. **A deleted item takes its thread with it.** PRD §10 says a report's
 *    threads live exactly as long as the report does, and the cascade is
 *    what makes that true.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import { createClaimThreadMessageBody } from '@/domain/listings';

import { PrismaClaimThreadReader } from './prisma-claim-thread-reader';
import { PrismaClaimThreadRepository } from './prisma-claim-thread-repository';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the claim thread adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const finderId = '00000000-0000-4000-8000-000000000791';
  const administratorId = '00000000-0000-4000-8000-000000000792';
  const claimantId = '00000000-0000-4000-8000-000000000793';
  const otherClaimantId = '00000000-0000-4000-8000-000000000794';

  /** The report the Claim is made against. */
  let reportId = '';

  const reader = new PrismaClaimThreadReader(prisma);
  const threads = new PrismaClaimThreadRepository(prisma);

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
      'finder-threads@example.test',
      administratorId,
      'administrator-threads@example.test',
      claimantId,
      'claimant-threads@example.test',
      otherClaimantId,
      'other-claimant-threads@example.test',
    );

    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "created_at", "updated_at")
       VALUES ('Found', 'Claim Requested', 'A canvas tote bag', 'Bag',
               'A canvas tote bag with a university logo on the corner.',
               DATE '2026-10-28', 'library', $1, NOW(), NOW())
       RETURNING "id"`,
      finderId,
    );

    reportId = rows[0]!.id;
  });

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The rules are about what
    // the *database* holds, so a message left behind by one test would
    // change the verdict of the next.
    await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "report_id" = $1`, reportId);

    // **The report is recreated when it is missing,** because one test
    // deletes it outright to prove the cascade — and the next test needs
    // a report to make a Claim against.
    const existing = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "reports" WHERE "id" = $1`,
      reportId,
    );

    if (existing.length === 0) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "reports" ("id", "type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         VALUES ($1, 'Found', 'Claim Requested', 'A canvas tote bag', 'Bag',
                 'A canvas tote bag with a university logo on the corner.',
                 DATE '2026-10-28', 'library', $2, NOW(), NOW())`,
        reportId,
        finderId,
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Claim Requested' WHERE "id" = $1`,
        reportId,
      );
    }
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
   *
   * **A second pending Claim needs a second claimant,** because the
   * schema holds one pending Claim per report per claimant.
   */
  async function insertPendingClaim(claimant = claimantId): Promise<string> {
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "claims" ("report_id", "claimant_id", "status", "submitted_at",
                              "reason", "identifying_details", "date_lost",
                              "created_at", "updated_at")
       VALUES ($1, $2, 'Pending', NOW(), 'It is my canvas tote bag.',
               'A university logo on the corner.', DATE '2026-10-20', NOW(), NOW())
       RETURNING "id"`,
      reportId,
      claimant,
    );

    return rows[0]!.id;
  }

  /**
   * Post a message through the repository, inside a transaction.
   */
  async function postMessage(
    claimId: string,
    body: string,
    authorId = claimantId,
    authorDisplayName = 'A Claimant',
  ): Promise<string> {
    return prisma.$transaction(async (tx) => {
      const handle: TransactionHandle = { transaction: tx };

      const stored = await threads.postMessage(
        {
          claimId,
          reportId,
          authorId,
          authorDisplayName,
          body: createClaimThreadMessageBody(body),
          postedAt: new Date(),
        },
        handle,
      );

      return stored.id;
    });
  }

  // ── The repository's write ───────────────────────────────────────────────

  describe('the claim thread repository', () => {
    it('writes a message whose parent columns agree with each other', async () => {
      const claimId = await insertPendingClaim();

      const messageId = await postMessage(claimId, 'Is the bag still at the library?');

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

      // **The parent type is `claim`,** because this repository writes
      // Claim threads only.
      expect(rows[0]?.parent_type).toBe('claim');
      // **And the parent id, the Claim id, and the report id are all the
      // ones the caller named** — written from one source, so they cannot
      // disagree.
      expect(rows[0]?.parent_id).toBe(claimId);
      expect(rows[0]?.claim_id).toBe(claimId);
      expect(rows[0]?.report_id).toBe(reportId);
      expect(rows[0]?.author_id).toBe(claimantId);
      expect(rows[0]?.author_display_name).toBe('A Claimant');
      expect(rows[0]?.body).toBe('Is the bag still at the library?');
    });

    it('writes the trimmed body the domain measured', async () => {
      const claimId = await insertPendingClaim();

      const messageId = await postMessage(claimId, '  Hello there  ');

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
      const claimId = await insertPendingClaim();

      await expect(
        threads.postMessage(
          {
            claimId,
            reportId,
            authorId: claimantId,
            authorDisplayName: 'A Claimant',
            body: createClaimThreadMessageBody('Hello'),
            postedAt: new Date(),
          },
          { transaction: { nothing: true } } as never,
        ),
      ).rejects.toThrow("must be written inside the caller's transaction");
    });

    it('refuses a write on a handle whose transaction is null', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        threads.postMessage(
          {
            claimId,
            reportId,
            authorId: claimantId,
            authorDisplayName: 'A Claimant',
            body: createClaimThreadMessageBody('Hello'),
            postedAt: new Date(),
          },
          { transaction: null } as never,
        ),
      ).rejects.toThrow("must be written inside the caller's transaction");
    });

    it('refuses a write on a handle whose transaction is not an object', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        threads.postMessage(
          {
            claimId,
            reportId,
            authorId: claimantId,
            authorDisplayName: 'A Claimant',
            body: createClaimThreadMessageBody('Hello'),
            postedAt: new Date(),
          },
          { transaction: 'not-a-transaction' } as never,
        ),
      ).rejects.toThrow("must be written inside the caller's transaction");
    });

    it('rolls the message back when the transaction fails', async () => {
      // **The message and its audit event commit together or not at all.**
      // Here the transaction fails *after* the write, and the row is gone
      // — so a half-committed thread cannot exist.
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$transaction(async (tx) => {
          const handle: TransactionHandle = { transaction: tx };

          await threads.postMessage(
            {
              claimId,
              reportId,
              authorId: claimantId,
              authorDisplayName: 'A Claimant',
              body: createClaimThreadMessageBody('Hello'),
              postedAt: new Date(),
            },
            handle,
          );

          throw new Error('The audit write failed.');
        }),
      ).rejects.toThrow('The audit write failed.');

      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS "count" FROM "thread_messages" WHERE "claim_id" = $1::uuid`,
        claimId,
      );

      expect(rows[0]?.count).toBe(0n);
    });
  });

  // ── The reader's reads ───────────────────────────────────────────────────

  describe('the claim thread reader', () => {
    it('reads the subject with the four facts the gate needs', async () => {
      const claimId = await insertPendingClaim();

      const subject = await reader.readThreadSubject(claimId);

      expect(subject?.claimId).toBe(claimId);
      expect(subject?.reportId).toBe(reportId);
      expect(subject?.claimStatus).toBe('Pending');
      expect(subject?.reportStatus).toBe('Claim Requested');
      // **The claimant is the Claim's own claimant, and the finder is the
      // report's reporter** — the two members the participation rule names.
      expect(subject?.claimantId).toBe(claimantId);
      expect(subject?.foundReportOwnerId).toBe(finderId);
      expect(subject?.claimantEmail).toBe('claimant-threads@example.test');
    });

    it('reads a claim that does not exist as absent', async () => {
      const subject = await reader.readThreadSubject(
        '00000000-0000-4000-8000-000000000799',
      );

      expect(subject).toBeNull();
    });

    it('reads the subject after the report has ended', async () => {
      const claimId = await insertPendingClaim();

      await prisma.$executeRawUnsafe(
        `UPDATE "reports" SET "status" = 'Closed' WHERE "id" = $1`,
        reportId,
      );

      const subject = await reader.readThreadSubject(claimId);

      // **The report's status is read as it is,** because the writability
      // rule is a whitelist and a stale status would wave a message
      // through.
      expect(subject?.reportStatus).toBe('Closed');
    });

    it('reads the history oldest first', async () => {
      const claimId = await insertPendingClaim();

      await postMessage(claimId, 'First', claimantId, 'A Claimant');
      await postMessage(claimId, 'Second', finderId, 'A Finder');
      await postMessage(claimId, 'Third', administratorId, 'The Administrator');

      const messages = await reader.listThreadMessages(claimId);

      expect(messages.map((message) => message.body)).toEqual([
        'First',
        'Second',
        'Third',
      ]);
      // **The display name is captured, not joined** — a conversation whose
      // authors were re-read from the accounts table would change its
      // wording every time an account was renamed.
      expect(messages.map((message) => message.authorDisplayName)).toEqual([
        'A Claimant',
        'A Finder',
        'The Administrator',
      ]);
    });

    it('reads no messages for a thread that has none', async () => {
      const claimId = await insertPendingClaim();

      const messages = await reader.listThreadMessages(claimId);

      expect(messages).toEqual([]);
    });

    it('reads one thread\'s messages without another thread\'s', async () => {
      // **The filter is on the parent pair,** so a message can never leak
      // across threads by a path that filtered on the wrong column.
      const first = await insertPendingClaim();
      const second = await insertPendingClaim(otherClaimantId);

      await postMessage(first, 'About the first one');
      await postMessage(second, 'About the second one');

      const firstMessages = await reader.listThreadMessages(first);
      const secondMessages = await reader.listThreadMessages(second);

      expect(firstMessages.map((message) => message.body)).toEqual(['About the first one']);
      expect(secondMessages.map((message) => message.body)).toEqual([
        'About the second one',
      ]);
    });

    it('reads the author\'s display name', async () => {
      const name = await reader.readAuthorDisplayName(claimantId);

      expect(name).toBe('A Claimant');
    });

    it('reads an author that does not exist as absent', async () => {
      const name = await reader.readAuthorDisplayName(
        '00000000-0000-4000-8000-000000000799',
      );

      expect(name).toBeNull();
    });

    it('reads inside the caller\'s transaction when one is supplied', async () => {
      const claimId = await insertPendingClaim();

      const subject = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        return reader.readThreadSubject(claimId, handle);
      });

      expect(subject?.claimId).toBe(claimId);
    });

    it('refuses an in-transaction read on a handle that carries no transaction', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        reader.readThreadSubject(claimId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow("must be read inside the caller's transaction");
    });

    it('refuses an in-transaction history read on a handle that carries no transaction', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        reader.listThreadMessages(claimId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow("must be read inside the caller's transaction");
    });

    it('refuses an in-transaction read on a handle whose transaction is null', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        reader.readThreadSubject(claimId, { transaction: null } as never),
      ).rejects.toThrow("must be read inside the caller's transaction");
    });

    it('refuses an in-transaction read on a handle whose transaction is not an object', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        reader.readThreadSubject(claimId, { transaction: 'not-a-transaction' } as never),
      ).rejects.toThrow("must be read inside the caller's transaction");
    });

    it('refuses an in-transaction display-name read on a handle that carries no transaction', async () => {
      await expect(
        reader.readAuthorDisplayName(claimantId, { transaction: { nothing: true } } as never),
      ).rejects.toThrow("must be read inside the caller's transaction");
    });
  });

  // ── The round trip ───────────────────────────────────────────────────────

  describe('the reader and the writer together', () => {
    it('round-trips a message through the repository and the reader', async () => {
      const claimId = await insertPendingClaim();
      const postedAt = new Date('2026-10-30T09:15:00.000Z');

      const messageId = await prisma.$transaction(async (tx) => {
        const handle: TransactionHandle = { transaction: tx };

        const stored = await threads.postMessage(
          {
            claimId,
            reportId,
            authorId: finderId,
            authorDisplayName: 'A Finder',
            body: createClaimThreadMessageBody('Yes, it is still at the library.'),
            postedAt,
          },
          handle,
        );

        return stored.id;
      });

      const messages = await reader.listThreadMessages(claimId);

      expect(messages).toHaveLength(1);
      expect(messages[0]?.id).toBe(messageId);
      expect(messages[0]?.authorId).toBe(finderId);
      expect(messages[0]?.authorDisplayName).toBe('A Finder');
      expect(messages[0]?.body).toBe('Yes, it is still at the library.');
      expect(messages[0]?.postedAt).toBe('2026-10-30T09:15:00.000Z');
    });

    it('takes the thread with the claim when the claim is deleted', async () => {
      // **PRD §10 says a report's threads live exactly as long as the
      // report does.** The cascade is what makes that true.
      const claimId = await insertPendingClaim();

      await postMessage(claimId, 'About to be removed');

      await prisma.$executeRawUnsafe(`DELETE FROM "claims" WHERE "id" = $1::uuid`, claimId);

      const messages = await reader.listThreadMessages(claimId);

      expect(messages).toEqual([]);
    });

    it('takes the thread with the report when the report is deleted', async () => {
      // **A hard delete of the report takes its Claims and their threads
      // with it** (FR-10).
      const claimId = await insertPendingClaim();

      await postMessage(claimId, 'About to be removed');

      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1`, reportId);

      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS "count" FROM "thread_messages" WHERE "claim_id" = $1::uuid`,
        claimId,
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
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('claim', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Claimant', $4, NOW())`,
          claimId,
          reportId,
          claimantId,
          'x'.repeat(2001),
        ),
      ).rejects.toThrow();
    });

    it('refuses an empty body', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('claim', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Claimant', '', NOW())`,
          claimId,
          reportId,
          claimantId,
        ),
      ).rejects.toThrow();
    });

    it('accepts a body of exactly 2000 characters', async () => {
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('claim', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Claimant', $4, NOW())`,
          claimId,
          reportId,
          claimantId,
          'x'.repeat(2000),
        ),
      ).resolves.toBeDefined();
    });

    it('refuses a parent kind the vocabulary does not own', async () => {
      // **A kind nobody has thought about is refused, not stored and
      // ignored** — a row whose parent kind is misspelled would be
      // invisible to every reader, which is a message written and lost.
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('comment', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Claimant', 'Hello', NOW())`,
          claimId,
          reportId,
          claimantId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a claim parent that names no claim', async () => {
      // **A `claim` parent without a `claim_id` is a thread nobody owns.**
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('claim', $1::uuid, NULL, $2::uuid, $3::uuid,
                   'A Claimant', 'Hello', NOW())`,
          claimId,
          reportId,
          claimantId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a recovery response parent that names a claim', async () => {
      // **The two parent kinds are exclusive.** A `recovery_response`
      // parent that also names a Claim would be read by the Claim thread's
      // reader.
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('recovery_response', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Claimant', 'Hello', NOW())`,
          claimId,
          reportId,
          claimantId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a parent id that disagrees with the claim id', async () => {
      // **The isolation guarantee.** A `claim` parent whose `parent_id`
      // and `claim_id` disagree would let the visibility reader — which
      // filters on `parent_id` — hand one Claim's thread to another's
      // reader.
      const first = await insertPendingClaim();
      const second = await insertPendingClaim(otherClaimantId);

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('claim', $1::uuid, $2::uuid, $3::uuid, $4::uuid,
                   'A Claimant', 'Hello', NOW())`,
          first,
          second,
          reportId,
          claimantId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a message whose claim does not exist', async () => {
      // **The foreign key is the second line of defence.** A `claim_id`
      // that names no Claim cannot be written even if the CHECK
      // constraints were somehow satisfied.
      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('claim', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Claimant', 'Hello', NOW())`,
          '00000000-0000-4000-8000-000000000799',
          reportId,
          claimantId,
        ),
      ).rejects.toThrow();
    });

    it('refuses a message whose author does not exist', async () => {
      // **A message attributed to someone who does not exist** would be a
      // record of speech by a member who is not there.
      const claimId = await insertPendingClaim();

      await expect(
        prisma.$executeRawUnsafe(
          `INSERT INTO "thread_messages"
             ("parent_type", "parent_id", "claim_id", "report_id",
              "author_id", "author_display_name", "body", "posted_at")
           VALUES ('claim', $1::uuid, $1::uuid, $2::uuid, $3::uuid,
                   'A Claimant', 'Hello', NOW())`,
          claimId,
          reportId,
          '00000000-0000-4000-8000-000000000799',
        ),
      ).rejects.toThrow();
    });
  });
});
