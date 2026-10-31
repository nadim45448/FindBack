/**
 * The Prisma implementation of the Lost report subject reader.
 *
 * **A Found report reads as `null`, not as a Found report.** The port's
 * contract says a subject read from it is always a `Lost` report, so the
 * query filters on `type = 'Lost'` rather than filtering in TypeScript. The
 * filter is in the `WHERE` clause, so the row never reaches the application
 * layer at all — a Found report is *absent*, not *wrong*.
 *
 * **The reads select only the columns the workflow reasons about.** The
 * report's Sensitive Fields — `exact_place` and `identifying_details` — are
 * not selected, so they cannot leak into a determination's audit payload or
 * into an email.
 *
 * **The moves are conditional writes.** `moveToVerificationPending` updates
 * only a report that is still `Open`; `moveToOpen` updates only a report that
 * is still `Verification Pending`. The conditional `UPDATE` is what makes two
 * concurrent owners resolve to exactly one commit — the second write matches
 * no rows and reports `false`.
 *
 * **The moves do not consult the domain's transition table.** The domain
 * decides *whether* a move is permitted; this adapter is the mechanism that
 * performs it. The condition in the `WHERE` clause mirrors the table's
 * precondition, and the adapter refuses to write a status it was not asked
 * to write.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  LostReportSubject,
  LostReportSubjectReader,
} from '@/application/listings/ports/lost-report-subject-reader';
import {
  VERIFICATION_PENDING_REPORT_STATUS,
} from '@/domain/recovery';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A report moved outside the
 * transaction that also writes its audit events would leave the two
 * disagreeing — and the audit trail is append-only with no correction path
 * (ADR-6).
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('report' in candidate)) {
    throw new Error(
      'A report must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The report status the not-a-match determination returns the report to. */
const OPEN_REPORT_STATUS = 'Open';

/** Prisma's Lost report subject reader. */
export class PrismaLostReportSubjectReader implements LostReportSubjectReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the Lost report the workflow acts on.
   *
   * @returns the subject, or `null` when no **Lost** report carries that id.
   */
  async readLostReport(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<LostReportSubject | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.report.findFirst({
      where: { id: reportId, type: 'Lost' },
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        reporterId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (found === null) {
      return null;
    }

    return {
      id: found.id,
      type: 'Lost',
      status: found.status as LostReportSubject['status'],
      reporterId: found.reporterId,
      name: found.name,
      // **The report's own creation time is the action's timestamp.** The
      // Lost-side events carry the moment the workflow act happened, and the
      // report's `created_at` is the closest server-side fact available
      // without a second clock. It is read, never written by a caller.
      occurredAt: found.updatedAt ?? found.createdAt,
    };
  }

  /**
   * Move the Lost report to `Verification Pending`.
   *
   * **Conditional on the report still being `Open`,** so two owners
   * selecting concurrently cannot both move the report.
   *
   * @returns `true` when the move landed, `false` when the report was no
   * longer `Open`.
   */
  async moveToVerificationPending(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    const updated = await client.report.updateMany({
      where: { id: reportId, type: 'Lost', status: OPEN_REPORT_STATUS },
      data: { status: VERIFICATION_PENDING_REPORT_STATUS, updatedAt: new Date() },
    });

    return updated.count === 1;
  }

  /**
   * Move the Lost report back to `Open`.
   *
   * **Conditional on the report being `Verification Pending`,** so a report
   * that has already left that status is not moved again — and so the
   * not-a-match determination's return leg cannot resurrect a report that
   * has moved on.
   *
   * @returns `true` when the move landed, `false` when the report was no
   * longer `Verification Pending`.
   */
  async moveToOpen(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    const updated = await client.report.updateMany({
      where: {
        id: reportId,
        type: 'Lost',
        status: VERIFICATION_PENDING_REPORT_STATUS,
      },
      data: { status: OPEN_REPORT_STATUS, updatedAt: new Date() },
    });

    return updated.count === 1;
  }
}
