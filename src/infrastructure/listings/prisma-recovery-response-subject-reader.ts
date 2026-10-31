/**
 * The Prisma implementation of the Recovery Response subject reader.
 *
 * **It reads the report and its owner together, in one query.** The
 * submission gate needs the report's type, status, and owner, and the
 * notification needs the owner's **email address** — and the email is on the
 * account, not the report. Reading the report and the account separately
 * would be two queries and two snapshots, and a report whose owner was
 * deactivated between the two reads would be decided on contradictory facts.
 *
 * **The email address is read here and nowhere else.** It travels with the
 * subject, from this read to the notification, and it is never put on a
 * report, a Response, or an audit payload.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  RecoveryResponseSubject,
  RecoveryResponseSubjectReader,
} from '@/application/listings/recovery-response-submission-service';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused** rather than
 * silently falling back to the root client.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('report' in candidate)) {
    throw new Error(
      'A report must be read inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's Recovery Response subject reader. */
export class PrismaRecoveryResponseSubjectReader implements RecoveryResponseSubjectReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the report the Response is made against, with the facts the gate
   * and the notification need.
   *
   * @returns the subject, or `null` when no report carries that id.
   */
  async readSubject(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseSubject | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.report.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        type: true,
        status: true,
        name: true,
        reporter: { select: { id: true, email: true } },
      },
    });

    if (found === null) {
      return null;
    }

    return {
      id: found.id,
      type: found.type as RecoveryResponseSubject['type'],
      status: found.status,
      reporterId: found.reporter.id,
      reporterEmail: found.reporter.email,
      name: found.name,
    };
  }
}

/** The Prisma client type the reader needs. */
export type { Prisma };
