/**
 * The Prisma implementation of the claim decision reader.
 *
 * **The report's row lock is the mechanism that makes the approval
 * atomic.** `SELECT … FOR UPDATE` on the Found report row serialises two
 * administrators approving two *different* Claims on the *same item*: the
 * second waits for the first to commit, and then reads the report's status
 * **after** the first's move — so it sees `Claim Approved` and its own
 * approval is refused.
 *
 * **The lock is on the report, not on the Claim.** The shared resource is
 * the *item*. Two administrators deciding two different Claims on the same
 * item is the race the story describes, and locking each Claim separately
 * would not prevent it — each administrator would lock their own Claim,
 * find no contention, and both commit.
 *
 * **The lock is taken inside the caller's transaction,** so it is held
 * until the transaction commits or rolls back. A lock taken outside the
 * transaction would be released immediately and would serialise nothing.
 *
 * **The competing-claim read is inside the transaction too.** It is the
 * read that decides whether an approval auto-rejects anybody, and a read
 * outside the transaction would be a read-then-write race — the exact race
 * the story forbids.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type {
  ClaimDecisionReader,
  ClaimDecisionState,
  CompetingPendingClaim,
} from '@/application/listings/ports/claim-decision-reader';

import {
  CLAIM_PENDING_STATUS,
  isClaimStatus,
  isReportStatus,
  type ClaimStatus,
  type ReportStatus,
} from '@/domain/listings';

/** The Prisma claim decision reader. */
export class PrismaClaimDecisionReader implements ClaimDecisionReader {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Read the Claim's decision state.
   *
   * **The claimant's email is selected in the same statement.** The
   * decision email must reach the claimant, and the claimant is not the
   * actor — so the read is what supplies the recipient.
   */
  async readDecisionState(
    claimId: string,
    transaction?: TransactionHandle,
  ): Promise<ClaimDecisionState | null> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const rows = await client.$queryRaw<
      Array<{ id: string; status: string; report_id: string; claimant_id: string; email: string }>
    >(Prisma.sql`
      SELECT c."id", c."status", c."report_id", c."claimant_id", a."email"
      FROM "claims" AS c
      JOIN "accounts" AS a ON a."id" = c."claimant_id"
      WHERE c."id" = ${claimId}::uuid
    `);

    const row = rows[0];

    if (!row) {
      return null;
    }

    // **A status the domain does not recognise is refused, not passed
    // through.** The decision gate is a whitelist, and a reader that
    // handed it a status outside the vocabulary would be handing it a value
    // the gate cannot judge. The gate refuses anything that is not
    // `Pending`, so an unknown status is refused as a non-`Pending` claim —
    // which is the safe direction.
    const status: ClaimStatus = isClaimStatus(row.status) ? row.status : 'Rejected';

    return {
      id: row.id,
      status,
      reportId: row.report_id,
      claimantId: row.claimant_id,
      claimantEmail: row.email,
    };
  }

  /**
   * Read the **other** `Pending` Claims on the same item.
   *
   * **Only `Pending` Claims are returned,** and the Claim being decided is
   * excluded by id. A Claim is not its own competitor.
   */
  async listCompetingPendingClaims(
    reportId: string,
    excludeClaimId: string,
    transaction?: TransactionHandle,
  ): Promise<readonly CompetingPendingClaim[]> {
    const client = transaction ? transactionClient(transaction) : this.client;

    const rows = await client.$queryRaw<
      Array<{ id: string; claimant_id: string; email: string; submitted_at: Date }>
    >(Prisma.sql`
      SELECT c."id", c."claimant_id", a."email", c."submitted_at"
      FROM "claims" AS c
      JOIN "accounts" AS a ON a."id" = c."claimant_id"
      WHERE c."report_id" = ${reportId}::uuid
        AND c."status" = ${CLAIM_PENDING_STATUS}
        AND c."id" <> ${excludeClaimId}::uuid
      ORDER BY c."submitted_at" ASC, c."id" ASC
    `);

    return rows.map((row) => ({
      claimId: row.id,
      claimantId: row.claimant_id,
      claimantEmail: row.email,
      submittedAt: row.submitted_at,
    }));
  }

  /**
   * Lock the Found report row and read its status.
   *
   * **`SELECT … FOR UPDATE` is the whole point of this method.** The lock
   * is held until the caller's transaction ends, which is what serialises
   * two administrators' approvals of the same item.
   */
  async lockReportStatus(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<ReportStatus | null> {
    const client = transactionClient(transaction);

    const rows = await client.$queryRaw<Array<{ status: string }>>(Prisma.sql`
      SELECT "status"
      FROM "reports"
      WHERE "id" = ${reportId}::uuid
      FOR UPDATE
    `);

    const row = rows[0];

    if (!row) {
      return null;
    }

    // **A status the domain does not recognise is refused.** The transition
    // machine refuses every status it does not own, and a status outside
    // the vocabulary must reach it as something it can refuse rather than
    // as a value it would wave through.
    return isReportStatus(row.status) ? row.status : 'Closed';
  }
}

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A lock taken outside the
 * caller's transaction would be released immediately and would serialise
 * nothing — which is exactly the race the lock exists to prevent.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('$queryRaw' in candidate)) {
    throw new Error(
      'A claim decision must read inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}
