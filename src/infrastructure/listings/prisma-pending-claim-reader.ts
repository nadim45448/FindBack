/**
 * The Prisma implementation of the pending-claim reader.
 *
 * **It asks about `Pending` Claims only.** A `Rejected` or `Approved` Claim
 * does not count — a member whose claim was rejected may claim again, and
 * that new Claim sits alongside the retained history. The status filter is
 * therefore part of the question, not a detail of the answer.
 *
 * **It reads existence, not the Claims.** The port's contract is a boolean,
 * and the port's own comment is that a count would be better; but the
 * *domain* only needs to know whether the duplicate rule applies, and the
 * count's extra fidelity is not used by the gate. The implementation uses
 * `count` rather than `findMany` so it transfers one row rather than the
 * Claims themselves — and it selects **no columns of the Claim**, because
 * the reason and the identifying details are FR-37 Sensitive Fields and this
 * read has no need for them.
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { PendingClaimReader } from '@/application/listings/ports/pending-claim-reader';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused** rather than
 * silently falling back to the root client.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('claim' in candidate)) {
    throw new Error(
      'A claim must be read inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The Prisma pending-claim reader. */
export class PrismaPendingClaimReader implements PendingClaimReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Whether the member already has a `Pending` Claim on the report.
   *
   * **The transaction is optional here, and only here.** The duplicate check
   * runs *before* the write transaction opens — it is the user-facing half of
   * the rule, and the uniqueness constraint is the fact that settles the
   * race.
   */
  async hasPendingClaim(
    reportId: string,
    claimantId: string,
    transaction?: TransactionHandle,
  ): Promise<boolean> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const count = await client.claim.count({
      where: { reportId, claimantId, status: 'Pending' },
    });

    return count > 0;
  }
}

/** The Prisma client type the reader needs. */
export type { Prisma };
