/**
 * The Prisma implementation of the Recovery Response selection repository.
 *
 * **The atomic-selection rule is enforced by the database's partial unique
 * index, and this adapter translates its violation.** FR-41's "exactly one
 * Recovery Response in `Selected for Verification` status at any time" is a
 * `UNIQUE ... WHERE status = 'Selected for Verification'` index on
 * `report_id`. The application check in `decideSelection` is the
 * *explanation*; the index is the *rule*. Two owners selecting concurrently
 * both pass the read, and only the index can tell them apart.
 *
 * **The status moves are conditional `UPDATE`s.** `selectForVerification`
 * matches only a response still `Submitted`; `determine` matches only one
 * still `Selected for Verification`. A response that moved between the
 * caller's read and this write is not moved again — the write matches no
 * rows and reports `false`.
 *
 * **A concurrent write is a business outcome, not a 500.** The index's
 * violation is translated into `ConcurrentSelectionError`, so the caller can
 * refuse the request with the owner's own words rather than surfacing a
 * Prisma error code.
 *
 * **The writes are inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter — there is no overload that
 * opens its own transaction — so the response's move and its audit event
 * commit together or not at all (ADR-3, ADR-6).
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import {
  ConcurrentSelectionError,
  type RecoveryResponseSelectionFacts,
  type RecoveryResponseSelectionRepository,
} from '@/application/listings/ports/recovery-response-selection-repository';
import type { RecoveryResponseStatus } from '@/domain/recovery';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A response written outside the
 * transaction that also writes its audit event would leave the two
 * disagreeing — and the audit trail is append-only with no correction path
 * (ADR-6), so that error would be permanent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('recoveryResponse' in candidate)) {
    throw new Error(
      'A recovery response must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The status a response holds while it is the report's one candidate. */
const SELECTED_FOR_VERIFICATION = 'Selected for Verification';

/** The status a response holds before it is selected. */
const SUBMITTED = 'Submitted';

/** The status a response holds when it is selected and awaiting a decision. */
const SELECTED_STATUS_FILTER = SELECTED_FOR_VERIFICATION;

/**
 * The PostgreSQL error code for a unique-constraint violation.
 *
 * **23505** is `unique_violation`. It is the driver's own code, and Prisma
 * surfaces it on the error's `code` property.
 */
const UNIQUE_VIOLATION = 'P2002';

/** Prisma's Recovery Response selection repository. */
export class PrismaRecoveryResponseSelectionRepository
  implements RecoveryResponseSelectionRepository
{
  constructor(private readonly client: PrismaClient) {}

  /**
   * Move a response to `Selected for Verification`.
   *
   * @throws {ConcurrentSelectionError} when another response already holds
   * the report's selection slot — **the database's partial unique index
   * firing**, not the application's check.
   */
  async selectForVerification(
    responseId: string,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    try {
      const updated = await client.recoveryResponse.updateMany({
        where: { id: responseId, status: SUBMITTED },
        data: { status: SELECTED_FOR_VERIFICATION, updatedAt: new Date() },
      });

      return updated.count === 1;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConcurrentSelectionError(
          'Another response has already been selected for verification on this report.',
        );
      }

      throw error;
    }
  }

  /**
   * Move a response to a determination's status.
   *
   * **The write is conditional on the response still being selected.** A
   * response that was determined between the caller's read and this write is
   * not determined again — the write lands nothing.
   */
  async determine(
    responseId: string,
    status: RecoveryResponseStatus,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    const updated = await client.recoveryResponse.updateMany({
      where: { id: responseId, status: SELECTED_STATUS_FILTER },
      data: { status, updatedAt: new Date() },
    });

    return updated.count === 1;
  }

  /**
   * Read the report's selection facts.
   *
   * **Only the report's one selected response is read,** and the query is
   * conditional on the status — so a report with no selected response reads
   * as "nothing is selected", which is the fact the decision needs.
   *
   * @returns the facts, or `null` when no report carries that id.
   */
  async readSelectionFacts(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseSelectionFacts | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const report = await client.report.findUnique({
      where: { id: reportId },
      select: { id: true },
    });

    if (report === null) {
      return null;
    }

    const selected = await client.recoveryResponse.findFirst({
      where: { reportId, status: SELECTED_STATUS_FILTER },
      select: { id: true, status: true },
    });

    if (selected === null) {
      return { selectedResponseId: null, selectedResponseStatus: null };
    }

    return {
      selectedResponseId: selected.id,
      selectedResponseStatus: selected.status as RecoveryResponseStatus,
    };
  }

  /**
   * Read the status of one response on a report.
   *
   * **The report is part of the `WHERE` clause,** so a response that belongs
   * to a different report reads as `null` — the caller cannot ask about a
   * response that is not on the report it names.
   *
   * @returns the response's status, or `null` when no response carries that
   * id on that report.
   */
  async readResponseStatus(
    reportId: string,
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseStatus | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.recoveryResponse.findFirst({
      where: { id: responseId, reportId },
      select: { status: true },
    });

    return found === null ? null : (found.status as RecoveryResponseStatus);
  }
}

/**
 * True when the error is a unique-constraint violation.
 *
 * **The code is checked, not the message.** Prisma's error codes are a
 * stable, documented part of its surface; the message is not.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
  );
}
