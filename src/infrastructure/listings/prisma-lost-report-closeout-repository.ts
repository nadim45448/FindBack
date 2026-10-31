/**
 * The Prisma implementation of the Lost-report closeout repository.
 *
 * **The closeout is three writes in one transaction, and each is
 * conditional.**
 *
 * 1. The report moves to `Returned`, conditionally on it still being
 *    `Verification Pending` — the Lost side's precondition.
 * 2. The matched response moves to `Completed — Report Returned`,
 *    conditionally on it still being `Match Confirmed`.
 * 3. Every other non-terminal response moves to `Resolved — Report
 *    Returned`, in a single `UPDATE … RETURNING`.
 *
 * **The report's precondition comes from the domain's own table.** The
 * adapter imports it rather than restating it, so a status the domain adds
 * is enforced here without a second edit.
 *
 * **The batch's set is the statement's `RETURNING` clause** (ADR-10), not a
 * read followed by a write. A response created between a read and the write
 * would survive a closeout that was supposed to end it; the single
 * statement resolves every row it matched and returns exactly those rows, so
 * the set that was resolved and the set that is reported are the same set by
 * construction.
 *
 * **The matched response is excluded from the batch.** It has its own
 * write, with its own status, and a row that matched both statements would
 * end up with whichever landed last.
 *
 * **A write that lands nothing returns `null`,** and the caller turns it
 * into the conflict it is. A boolean would collapse "landed" and "did not
 * land" into one value.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  LostReportCloseoutRepository,
  ResolvedResponseRecord,
} from '@/application/listings/ports/lost-report-closeout-repository';

import {
  COMPLETED_REPORT_RETURNED_STATUS,
  RESOLVED_REPORT_CLOSED_STATUS,
  RESOLVED_REPORT_RETURNED_STATUS,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A closeout written outside the
 * transaction that also writes its audit event would leave the trail
 * recording a resolution that did not commit.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('$queryRaw' in candidate)
  ) {
    throw new Error(
      'A Lost report closeout must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's Lost-report closeout repository. */
export class PrismaLostReportCloseoutRepository implements LostReportCloseoutRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Perform the Lost-side Returned closeout.
   *
   * @returns the resolved responses the batch affected, or `null` when the
   * report was no longer `Verification Pending` and nothing landed.
   */
  async confirmLostReturned(
    reportId: string,
    matchedResponseId: string,
    reportAlreadyReturned: boolean,
    transaction: TransactionHandle,
  ): Promise<readonly ResolvedResponseRecord[] | null> {
    const client = transactionClient(transaction);

    // ── The report moves ───────────────────────────────────────────────────
    //
    // **The conditional `UPDATE` is what makes the race resolve to exactly
    // one commit.** The read that preceded it was advisory; this write is
    // the guarantee. The precondition is `Verification Pending` — the Lost
    // side's only precondition — and it is imported from the domain's table
    // rather than restated.
    //
    // **The move is skipped when the report has already been moved.** The
    // confirmation service shares this transaction and has already moved the
    // report to `Returned`; the closeout's job in that case is the
    // responses' resolution alone. The conditional write would otherwise
    // match no rows and be reported as a lost race — a false conflict for a
    // transition that is succeeding.
    if (!reportAlreadyReturned) {
      const updated = await client.report.updateMany({
        where: {
          id: reportId,
          type: 'Lost',
          status: 'Verification Pending',
        },
        data: { status: 'Returned', updatedAt: new Date() },
      });

      if (updated.count !== 1) {
        // **The report was confirmed or closed between the read and this
        // write.** Nothing is written — no response resolved, no audit event —
        // and the service turns this into the conflict.
        return null;
      }
    }

    // ── The matched response completes ─────────────────────────────────────
    //
    // **Its own write, with its own status, conditionally.** The condition
    // is `Match Confirmed` — the PRD's success path. A matched response
    // still at `Selected for Verification` has not been determined as a
    // match, and completing it would assert a determination nobody made.
    const completed = await client.recoveryResponse.updateMany({
      where: {
        id: matchedResponseId,
        reportId,
        status: 'Match Confirmed',
      },
      data: { status: COMPLETED_REPORT_RETURNED_STATUS, updatedAt: new Date() },
    });

    if (completed.count !== 1) {
      // **The matched response is not completable.** The domain refuses this
      // case before the write, so reaching here means the response changed
      // between the read and the write. Nothing else is written.
      throw new Error(
        'The matched Recovery Response is no longer at "Match Confirmed". This is a conflict.',
      );
    }

    // ── Every other non-terminal response resolves ─────────────────────────
    //
    // **One `UPDATE … RETURNING` (ADR-10).** The statement names the
    // non-terminal statuses, excludes the matched response, and returns the
    // rows it affected — so the set that was resolved and the set that is
    // reported are the same set.
    const resolved = await client.$queryRaw<
      Array<{ id: string; previous_status: string; status: string }>
    >(Prisma.sql`
      UPDATE "recovery_responses" AS r
      SET "status" = ${RESOLVED_REPORT_RETURNED_STATUS},
          "updated_at" = CURRENT_TIMESTAMP
      FROM (
        SELECT "id", "status" AS "previous_status"
        FROM "recovery_responses"
        WHERE "report_id" = ${reportId}::uuid
          AND "id" <> ${matchedResponseId}::uuid
          AND "status" IN ('Submitted', 'Selected for Verification', 'Match Confirmed')
        FOR UPDATE
      ) AS candidates
      WHERE r."id" = candidates."id"
      RETURNING r."id", candidates."previous_status", r."status"
    `);

    return resolved.map((row) => ({
      id: row.id,
      previousStatus: row.previous_status as RecoveryResponseStatus,
      status: row.status as RecoveryResponseStatus,
    }));
  }

  /**
   * Close a Lost report and resolve its non-terminal responses.
   *
   * @returns the resolved responses the batch affected, or `null` when the
   * report was no longer closable and nothing landed.
   */
  async closeLostReport(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<readonly ResolvedResponseRecord[] | null> {
    const client = transactionClient(transaction);

    // ── The report moves ───────────────────────────────────────────────────
    //
    // **The condition names the two statuses a Lost report may be closed
    // from.** `Returned` and `Closed` are terminal and are not in the set,
    // so a terminal report matches no rows and nothing lands.
    const updated = await client.report.updateMany({
      where: {
        id: reportId,
        type: 'Lost',
        status: { in: ['Open', 'Verification Pending'] },
      },
      data: { status: 'Closed', updatedAt: new Date() },
    });

    if (updated.count !== 1) {
      // **The report was closed or confirmed between the read and this
      // write.**
      return null;
    }

    // ── Every non-terminal response resolves ───────────────────────────────
    //
    // **One `UPDATE … RETURNING` (ADR-10),** and it names only the
    // non-terminal statuses. An already-terminal response is left alone —
    // a `Not a Match` response was ruled out before the closure, and
    // rewriting it would destroy the history the trail depends on.
    const resolved = await client.$queryRaw<
      Array<{ id: string; previous_status: string; status: string }>
    >(Prisma.sql`
      UPDATE "recovery_responses" AS r
      SET "status" = ${RESOLVED_REPORT_CLOSED_STATUS},
          "updated_at" = CURRENT_TIMESTAMP
      FROM (
        SELECT "id", "status" AS "previous_status"
        FROM "recovery_responses"
        WHERE "report_id" = ${reportId}::uuid
          AND "status" IN ('Submitted', 'Selected for Verification', 'Match Confirmed')
        FOR UPDATE
      ) AS candidates
      WHERE r."id" = candidates."id"
      RETURNING r."id", candidates."previous_status", r."status"
    `);

    return resolved.map((row) => ({
      id: row.id,
      previousStatus: row.previous_status as RecoveryResponseStatus,
      status: row.status as RecoveryResponseStatus,
    }));
  }
}
