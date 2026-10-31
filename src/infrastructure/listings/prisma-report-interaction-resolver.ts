/**
 * The Prisma implementation of the report interaction resolver.
 *
 * **The batch resolution set is obtained from `UPDATE … RETURNING`** (ADR-10),
 * not from a read followed by a write. The difference matters: a
 * read-then-write resolver resolves the Claims it read, and a Claim created
 * between the read and the write survives a withdrawal that was supposed to
 * end it. A single `UPDATE … RETURNING` resolves **every** row the statement
 * matched, and returns exactly those rows — so the set that was resolved and
 * the set that is reported are the same set by construction.
 *
 * **The transaction handle is required.** The dependent transitions and the
 * report's status change are one act, and the transaction is what makes them
 * one act.
 *
 * **The claimant's address is selected in the same statement.** The FR-29
 * notification must reach the claimants whose Claims were rejected, and the
 * `RETURNING` clause is the only place that knows both which rows were
 * affected and who owns them.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type {
  RejectedClaim,
  ReportInteractionResolver,
  ResolvedRecoveryResponse,
} from '@/application/listings/ports/report-interaction-resolver';

import {
  CLAIM_REJECTED_STATUS,
  RECOVERY_RESPONSE_RESOLVED_CLOSED_STATUS,
  WITHDRAWAL_CLAIM_REJECTION_REASON,
  WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES,
} from '@/domain/listings';

/** The Prisma report interaction resolver. */
export class PrismaReportInteractionResolver implements ReportInteractionResolver {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Reject the Pending Claims on a Found report.
   *
   * **The statement is one `UPDATE … RETURNING`.** Every Pending Claim on
   * the report is rejected, and the rows it affected are returned — so the
   * notification set and the resolved set cannot disagree.
   *
   * **The decision time is written with the rejection.** Bolt `016`'s
   * `claims_decision_fields_check` requires a decided Claim to carry a
   * decision time — the row records *that* it was decided and *when*, and
   * the trail records why and by whose action. The decider is left null,
   * because a withdrawal's auto-rejection was caused by a *member* and has
   * no administrator to name.
   */
  async rejectPendingClaims(
    reportId: string,
    reason: string,
    transaction: TransactionHandle,
  ): Promise<readonly RejectedClaim[]> {
    const client = transactionClient(transaction);

    const rejected = await client.$queryRaw<
      Array<{ id: string; status: string; email: string }>
    >(Prisma.sql`
      UPDATE "claims" AS c
      SET "status" = ${CLAIM_REJECTED_STATUS},
          "rejection_reason" = ${reason},
          "decided_at" = CURRENT_TIMESTAMP,
          "updated_at" = CURRENT_TIMESTAMP
      FROM "accounts" AS a
      WHERE c."report_id" = ${reportId}::uuid
        AND c."status" = 'Pending'
        AND a."id" = c."claimant_id"
      RETURNING c."id", c."status", a."email"
    `);

    return rejected.map((row) => ({
      claimId: row.id,
      claimStatus: row.status,
      reason,
      claimantEmail: row.email,
    }));
  }

  /**
   * Resolve the non-terminal Recovery Responses on a Lost report.
   *
   * **The statement is one `UPDATE … RETURNING`,** and it names only the two
   * non-terminal statuses. A `Match Confirmed` Response is never resolved
   * here — a withdrawal is blocked outright once one exists — and an
   * already-resolved Response is left alone.
   */
  async resolveWithdrawalResolvedRecoveryResponses(
    reportId: string,
    transaction: TransactionHandle,
  ): Promise<readonly ResolvedRecoveryResponse[]> {
    const client = transactionClient(transaction);

    const resolved = await client.$queryRaw<Array<{ id: string; status: string }>>(
      Prisma.sql`
        UPDATE "recovery_responses"
        SET "status" = ${RECOVERY_RESPONSE_RESOLVED_CLOSED_STATUS},
            "updated_at" = CURRENT_TIMESTAMP
        WHERE "report_id" = ${reportId}::uuid
          AND "status" IN (${Prisma.join(WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES)})
        RETURNING "id", "status"
      `,
    );

    return resolved.map((row) => ({
      recoveryResponseId: row.id,
      recoveryResponseStatus: row.status,
    }));
  }
}

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A dependent transition written
 * outside the caller's transaction could commit without the report's status
 * change — leaving a `Closed` report with `Pending` Claims.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('$queryRaw' in candidate)) {
    throw new Error(
      'A dependent record must be resolved inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** The rejection reason FR-11 records, re-exported for the resolver's callers. */
export { WITHDRAWAL_CLAIM_REJECTION_REASON };
