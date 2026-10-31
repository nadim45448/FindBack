/**
 * The Prisma implementation of the Recovery Response withdrawal repository.
 *
 * **The write is a conditional `UPDATE`.** It matches only a response still
 * `Submitted`, so a response that was selected or decided between the
 * caller's read and this write is not withdrawn — the write matches no rows
 * and reports `false`. **The conditionality is the point:** the domain's rule
 * is the user-facing half, and this is the fact that holds under a race.
 *
 * **The write is inside the caller's transaction.** The port takes a
 * `TransactionHandle` as a required parameter — there is no overload that
 * opens its own transaction — so the response's move and its audit event
 * commit together or not at all (ADR-3, ADR-6).
 *
 * **The read carries no Sensitive Field.** The `select` below does not ask
 * for the response's where-found, its observed identifying details, or its
 * date found — the facts a withdrawal needs are the response's id, its
 * report, its status, and its responder.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  RecoveryResponseWithdrawalFacts,
  RecoveryResponseWithdrawalRepository,
} from '@/application/listings/ports/recovery-response-withdrawal-repository';
import type { RecoveryResponseStatus } from '@/domain/recovery';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A response written outside the
 * transaction that also wrote its audit event would leave the two
 * disagreeing — and the audit trail is append-only with no correction path
 * (ADR-6), so that error would be permanent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('recoveryResponse' in candidate)
  ) {
    throw new Error(
      'A recovery response must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The status a response holds before it is selected. */
const SUBMITTED = 'Submitted';

/** The status a response holds when the responder has withdrawn it. */
const WITHDRAWN = 'Withdrawn';

/** Prisma's Recovery Response withdrawal repository. */
export class PrismaRecoveryResponseWithdrawalRepository
  implements RecoveryResponseWithdrawalRepository
{
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read one response's withdrawal facts.
   *
   * @returns the facts, or `null` when no response carries that id.
   */
  async readWithdrawalFacts(
    responseId: string,
    transaction?: TransactionHandle,
  ): Promise<RecoveryResponseWithdrawalFacts | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const found = await client.recoveryResponse.findUnique({
      where: { id: responseId },
      select: {
        id: true,
        reportId: true,
        status: true,
        responderId: true,
      },
    });

    if (found === null) {
      return null;
    }

    return {
      recoveryResponseId: found.id,
      lostReportId: found.reportId,
      status: found.status as RecoveryResponseStatus,
      responderId: found.responderId,
    };
  }

  /**
   * Move a response to `Withdrawn`.
   *
   * **The write is conditional on the response still being `Submitted`.** A
   * response selected or decided between the caller's read and this write is
   * not withdrawn, and the write lands nothing — so the service refuses the
   * request and the transaction rolls back with it.
   */
  async withdraw(
    responseId: string,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    const updated = await client.recoveryResponse.updateMany({
      where: { id: responseId, status: SUBMITTED },
      data: { status: WITHDRAWN, updatedAt: new Date() },
    });

    return updated.count === 1;
  }
}

/** The Prisma client type the repository needs. */
export type { Prisma };
