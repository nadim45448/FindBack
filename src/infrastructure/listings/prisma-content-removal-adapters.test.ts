/**
 * The content-removal adapters' suite — against a **live database**.
 *
 * **These are the bolt's own adapters, and they are the seam where the
 * domain's guarantees become the database's rows.** The domain proves that a
 * removal may proceed and that it records nothing on a repeat; these adapters
 * prove that the content is *marked* rather than deleted, that the removal's
 * row is written, and that the database's own constraints agree with the
 * domain's rules rather than merely restating them.
 *
 * **Five properties are proven here that a mocked test could not:**
 *
 * 1. **The content is withheld, not deleted.** The row survives; the marker
 *    is set. The trail is append-only (ADR-6), so a record naming removed
 *    content must remain verifiable.
 * 2. **The report's status is never touched by a removal.** A removal is
 *    not a lifecycle transition.
 * 3. **One removal per target.** The unique index refuses a second row
 *    beside a target that was already removed.
 * 4. **The target kind's set is closed.** The `CHECK` constraint refuses a
 *    kind the domain does not hold.
 * 5. **The reason's bound is enforced by the database too.** The `CHECK`
 *    constraint refuses a reason outside 10–500 characters.
 *
 * **The suite skips when `DATABASE_URL` is unset.**
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { TransactionHandle } from '@/application/ports/transaction-handle';

import { PrismaContentRemovalRepository } from './prisma-content-removal-repository';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the content removal adapters (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const ownerId = '00000000-0000-4000-8000-000000000841';
  const administratorId = '00000000-0000-4000-8000-000000000842';
  const authorId = '00000000-0000-4000-8000-000000000843';

  /** The report the content belongs to. */
  let reportId = '';

  /** The thread message on that report. */
  let messageId = '';

  /** The administrator's reason. */
  const REASON = 'The photograph shows another person and must be taken down.';

  const removals = new PrismaContentRemovalRepository(prisma);

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, 'not-a-real-hash', 'An Owner', 'Student', 'Active', false),
              ($3, $4, 'not-a-real-hash', 'The Administrator', 'Employee', 'Active', true),
              ($5, $6, 'not-a-real-hash', 'A Thread Author', 'Student', 'Active', false)
       ON CONFLICT ("id") DO NOTHING`,
      ownerId,
      'removal-owner@example.test',
      administratorId,
      'administrator-removal@example.test',
      authorId,
      'thread-author@example.test',
    );

    const reports = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                              "date", "campus_area", "reporter_id", "image_ref",
                              "created_at", "updated_at")
       VALUES ('Lost', 'Open', 'A set of house keys', 'Keys',
               'A set of house keys on a red fabric loop.',
               DATE '2026-10-28', 'library', $1, 'blob://reports/removal-image',
               NOW(), NOW())
       RETURNING "id"`,
      ownerId,
    );

    reportId = reports[0]!.id;

    const messages = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "thread_messages" ("parent_type", "parent_id", "report_id",
                                      "author_id", "author_display_name", "body",
                                      "posted_at", "created_at")
       VALUES ('recovery_response', gen_random_uuid(), $1, $2, 'A Thread Author',
               'This is the message that will be withheld.', NOW(), NOW())
       RETURNING "id"`,
      reportId,
      authorId,
    );

    messageId = messages[0]!.id;
  });

  beforeEach(async () => {
    // **Each test starts from an empty slate.** The rules are about what the
    // *database* holds, so a removal left behind by one test would change the
    // verdict of the next.
    await prisma.$executeRawUnsafe(
      `DELETE FROM "content_removals" WHERE "report_id" = $1::uuid`,
      reportId,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "reports"
       SET "image_withheld" = FALSE, "description_withheld" = FALSE
       WHERE "id" = $1::uuid`,
      reportId,
    );
    await prisma.$executeRawUnsafe(
      `UPDATE "thread_messages" SET "body_withheld" = FALSE WHERE "id" = $1::uuid`,
      messageId,
    );
  });

  afterAll(async () => {
    // **The teardown is guarded,** because a `beforeAll` that never completed
    // leaves no ids — and a delete against an empty uuid would fail for a
    // reason that has nothing to do with the test.
    if (reportId.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "content_removals" WHERE "report_id" = $1::uuid`,
        reportId,
      );
      await prisma.$executeRawUnsafe(
        `DELETE FROM "thread_messages" WHERE "report_id" = $1::uuid`,
        reportId,
      );
      await prisma.$executeRawUnsafe(`DELETE FROM "reports" WHERE "id" = $1::uuid`, reportId);
    }

    await prisma.$executeRawUnsafe(
      `DELETE FROM "accounts" WHERE "id" IN ($1, $2, $3)`,
      ownerId,
      administratorId,
      authorId,
    );
    await prisma.$disconnect();
  });

  /** Run the write inside a transaction, as the service does. */
  async function inTransaction<T>(work: (handle: TransactionHandle) => Promise<T>): Promise<T> {
    return prisma.$transaction(async (tx) => work({ transaction: tx }));
  }

  // ── The read ──────────────────────────────────────────────────────────────

  describe('the content removal repository — the read', () => {
    it('reads a report image that is not yet withheld', async () => {
      const state = await removals.readTargetState(reportId, {
        kind: 'report_image',
        targetId: reportId,
      });

      expect(state).toEqual({ alreadyRemoved: false });
    });

    it('reads a report description that is not yet withheld', async () => {
      const state = await removals.readTargetState(reportId, {
        kind: 'report_description',
        targetId: reportId,
      });

      expect(state).toEqual({ alreadyRemoved: false });
    });

    it('reads a thread message that is not yet withheld', async () => {
      const state = await removals.readTargetState(reportId, {
        kind: 'thread_message',
        targetId: messageId,
      });

      expect(state).toEqual({ alreadyRemoved: false });
    });

    it('finds nothing for a report with no image', async () => {
      const withoutImage = await prisma.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "reports" ("type", "status", "name", "category", "description",
                                "date", "campus_area", "reporter_id", "created_at", "updated_at")
         VALUES ('Lost', 'Open', 'A notebook', 'Other', 'A plain notebook.',
                 DATE '2026-10-28', 'library', $1, NOW(), NOW())
         RETURNING "id"`,
        ownerId,
      );

      const state = await removals.readTargetState(withoutImage[0]!.id, {
        kind: 'report_image',
        targetId: withoutImage[0]!.id,
      });

      // **A report with no image has no image to remove.** A removal of it
      // would record a moderation act against nothing.
      expect(state).toBeNull();

      await prisma.$executeRawUnsafe(
        `DELETE FROM "reports" WHERE "id" = $1::uuid`,
        withoutImage[0]!.id,
      );
    });

    it('finds nothing for a target on another report', async () => {
      const state = await removals.readTargetState(
        '00000000-0000-4000-8000-000000000999',
        { kind: 'report_image', targetId: reportId },
      );

      expect(state).toBeNull();
    });

    it('finds nothing for a report description on another report', async () => {
      const state = await removals.readTargetState(
        '00000000-0000-4000-8000-000000000999',
        { kind: 'report_description', targetId: reportId },
      );

      // **The report's description is read from the report's own row,** so
      // the same "does this content belong to this report" question is asked
      // of it as of the image — and the answer is the same: no.
      expect(state).toBeNull();
    });

    it('finds nothing for a thread message on another report', async () => {
      const state = await removals.readTargetState(
        '00000000-0000-4000-8000-000000000999',
        { kind: 'thread_message', targetId: messageId },
      );

      expect(state).toBeNull();
    });
  });

  // ── The write ─────────────────────────────────────────────────────────────

  describe('the content removal repository — the write', () => {
    it('marks the report image withheld and keeps the row', async () => {
      await inTransaction((handle) =>
        removals.withholdContent(
          { kind: 'report_image', targetId: reportId },
          handle,
        ),
      );

      const reports = await prisma.$queryRawUnsafe<
        { image_withheld: boolean; image_ref: string | null }[]
      >(`SELECT "image_withheld", "image_ref" FROM "reports" WHERE "id" = $1`, reportId);

      // **The content is marked, not deleted.** The audit trail is
      // append-only (ADR-6), so a record naming removed content must remain
      // verifiable — which means the content it names must still exist.
      expect(reports[0]?.image_withheld).toBe(true);
      expect(reports[0]?.image_ref).toBe('blob://reports/removal-image');
    });

    it('marks the report description withheld', async () => {
      await inTransaction((handle) =>
        removals.withholdContent(
          { kind: 'report_description', targetId: reportId },
          handle,
        ),
      );

      const reports = await prisma.$queryRawUnsafe<{ description_withheld: boolean }[]>(
        `SELECT "description_withheld" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      expect(reports[0]?.description_withheld).toBe(true);
    });

    it('marks the thread message withheld and keeps the body', async () => {
      await inTransaction((handle) =>
        removals.withholdContent(
          { kind: 'thread_message', targetId: messageId },
          handle,
        ),
      );

      const messages = await prisma.$queryRawUnsafe<
        { body_withheld: boolean; body: string }[]
      >(`SELECT "body_withheld", "body" FROM "thread_messages" WHERE "id" = $1`, messageId);

      expect(messages[0]?.body_withheld).toBe(true);
      expect(messages[0]?.body).toBe('This is the message that will be withheld.');
    });

    it('writes the removal row with the administrator and the reason', async () => {
      await inTransaction((handle) =>
        removals.recordRemoval(
          {
            reportId,
            target: { kind: 'report_image', targetId: reportId },
            reason: REASON,
            administratorId,
          },
          handle,
        ),
      );

      const rows = await prisma.$queryRawUnsafe<
        { target_kind: string; removal_reason: string; removed_by: string }[]
      >(
        `SELECT "target_kind", "removal_reason", "removed_by"
         FROM "content_removals" WHERE "report_id" = $1`,
        reportId,
      );

      expect(rows[0]?.target_kind).toBe('report_image');
      expect(rows[0]?.removal_reason).toBe(REASON);
      expect(rows[0]?.removed_by).toBe(administratorId);
    });

    it('refuses a second removal of the same target', async () => {
      // **One removal per target.** The unique index is the second line of
      // defence against a duplicate, and it refuses the row outright.
      await inTransaction((handle) =>
        removals.recordRemoval(
          {
            reportId,
            target: { kind: 'report_image', targetId: reportId },
            reason: REASON,
            administratorId,
          },
          handle,
        ),
      );

      await expect(
        inTransaction((handle) =>
          removals.recordRemoval(
            {
              reportId,
              target: { kind: 'report_image', targetId: reportId },
              reason: REASON,
              administratorId,
            },
            handle,
          ),
        ),
      ).rejects.toThrow();
    });

    it('refuses a target kind the system does not hold', async () => {
      // **The kinds are closed,** and the database's `CHECK` constraint
      // refuses a kind the domain does not hold — so a misspelled kind is
      // impossible rather than invisible.
      await expect(
        inTransaction((handle) =>
          removals.recordRemoval(
            {
              reportId,
              target: { kind: 'report' as 'report_image', targetId: reportId },
              reason: REASON,
              administratorId,
            },
            handle,
          ),
        ),
      ).rejects.toThrow();
    });

    it('refuses a reason outside the bound', async () => {
      // **The reason's bound is the domain's,** and the database's `CHECK`
      // constraint is the replica of it — so a write that bypassed the
      // domain is still refused.
      await expect(
        inTransaction((handle) =>
          removals.recordRemoval(
            {
              reportId,
              target: { kind: 'report_image', targetId: reportId },
              reason: 'Too short',
              administratorId,
            },
            handle,
          ),
        ),
      ).rejects.toThrow();
    });

    it('refuses a handle with no usable transaction', async () => {
      // **A removal written outside the transaction that also writes its
      // audit event would leave the trail recording a moderation act that
      // did not commit.**
      await expect(
        removals.withholdContent({ kind: 'report_image', targetId: reportId }, {
          transaction: { notATransaction: true },
        }),
      ).rejects.toThrow(/transaction/i);
    });

    it('never writes the report\'s status', async () => {
      await inTransaction(async (handle) => {
        await removals.recordRemoval(
          {
            reportId,
            target: { kind: 'report_image', targetId: reportId },
            reason: REASON,
            administratorId,
          },
          handle,
        );

        await removals.withholdContent(
          { kind: 'report_image', targetId: reportId },
          handle,
        );
      });

      const reports = await prisma.$queryRawUnsafe<{ status: string }[]>(
        `SELECT "status" FROM "reports" WHERE "id" = $1`,
        reportId,
      );

      // **A removal is not a lifecycle transition.** FR-36 says the report's
      // status is "unchanged unless closure was separately requested".
      expect(reports[0]?.status).toBe('Open');
    });
  });
});
