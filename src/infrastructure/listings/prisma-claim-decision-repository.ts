/**
 * The Prisma implementation of the claim decision repository.
 *
 * **Every write is conditional on the Claim still being `Pending`,** and
 * the method reports whether the write landed. The condition is the whole
 * guarantee: the reader's earlier check is *advisory* — it lets the
 * service refuse a decision on an already-decided Claim without opening a
 * transaction — but between that read and this write another administrator
 * may have decided the same Claim. Only the write's own condition can
 * close that window.
 *
 * **The write is a single `UPDATE … RETURNING`.** A read-then-write
 * implementation would have the same race the write's condition closes, and
 * the `RETURNING` clause is what reports whether the row was actually
 * claimed by this statement.
 *
 * **The transaction handle is required,** as it is on every write in this
 * codebase. An approval that wrote the Claim's status outside the
 * transaction that also wrote the report's move and the audit events would
 * leave the three disagreeing — and the audit trail is append-only with no
 * correction path.
 *
 * **The auto-rejection is a different method, not the same method with an
 * absent reason.** The auto-rejection's reason is the trigger's verbatim
 * reason, and the trigger — not an administrator — is what caused it. Two
 * methods make it impossible to write an auto-rejection with no reason and
 * impossible to mistake one for the other.
 */

import { Prisma, type PrismaClient } from '@prisma/client';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

import type { ClaimDecisionRepository } from '@/application/listings/ports/claim-decision-repository';

import {
  CLAIM_APPROVED_STATUS,
  CLAIM_PENDING_STATUS,
  CLAIM_REJECTED_STATUS,
  type ClaimRejectionReason,
} from '@/domain/listings';

/** The Prisma claim decision repository. */
export class PrismaClaimDecisionRepository implements ClaimDecisionRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Approve a `Pending` Claim.
   *
   * **The `WHERE` clause is the guard.** `status = 'Pending'` means the
   * write lands only on a Claim that had not been decided when the
   * statement executed.
   */
  async approve(
    claimId: string,
    administratorId: string,
    decidedAt: Date,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    const updated = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "claims"
      SET "status" = ${CLAIM_APPROVED_STATUS},
          "decided_by_administrator_id" = ${administratorId}::uuid,
          "decided_at" = ${decidedAt},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${claimId}::uuid
        AND "status" = ${CLAIM_PENDING_STATUS}
      RETURNING "id"
    `);

    return updated.length > 0;
  }

  /**
   * Reject a `Pending` Claim with an administrator's reason.
   *
   * **The reason is stored on the Claim,** so the rejection is on the
   * record with the Claim itself and not only on the trail.
   */
  async reject(
    claimId: string,
    administratorId: string,
    reason: ClaimRejectionReason,
    decidedAt: Date,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    const updated = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "claims"
      SET "status" = ${CLAIM_REJECTED_STATUS},
          "rejection_reason" = ${reason.value},
          "decided_by_administrator_id" = ${administratorId}::uuid,
          "decided_at" = ${decidedAt},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${claimId}::uuid
        AND "status" = ${CLAIM_PENDING_STATUS}
      RETURNING "id"
    `);

    return updated.length > 0;
  }

  /**
   * Auto-reject a `Pending` Claim.
   *
   * **The reason is the trigger's verbatim reason,** and it is stored in
   * the same column the administrator's reason uses — so a reader of the
   * Claim sees one reason field, and the trail's event 5 carries the
   * trigger's reason too.
   *
   * **No decider is recorded, and that is correct.** The auto-rejection was
   * not necessarily an administrator's decision — one of the three triggers
   * is a *reporter's* withdrawal, and the reporter is not an
   * administrator. The human who caused it is named by the audit event's
   * `triggeredBy` field, which is where an auditor reads it. The Claim's
   * own `decided_by_administrator_id` stays null, and the database's
   * `claims_decision_fields_check` leaves the decider optional for exactly
   * this reason.
   */
  async autoReject(
    claimId: string,
    reason: string,
    decidedAt: Date,
    transaction: TransactionHandle,
  ): Promise<boolean> {
    const client = transactionClient(transaction);

    // **The decider is left null, and that is correct.** The auto-rejection
    // was not necessarily an administrator's decision — one of the three
    // triggers is a *reporter's* withdrawal, and the reporter is not an
    // administrator. The human who caused it is named by the audit event's
    // `triggeredBy` field, which is where an auditor reads it. The
    // database's `claims_decision_fields_check` requires the decision
    // *time* and leaves the decider optional for exactly this reason.
    const updated = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "claims"
      SET "status" = ${CLAIM_REJECTED_STATUS},
          "rejection_reason" = ${reason},
          "decided_at" = ${decidedAt},
          "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = ${claimId}::uuid
        AND "status" = ${CLAIM_PENDING_STATUS}
      RETURNING "id"
    `);

    return updated.length > 0;
  }
}

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client. A decision written outside the
 * caller's transaction could commit without the report's move and the audit
 * events — leaving an approved Claim on an `Open` report.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('$queryRaw' in candidate)) {
    throw new Error(
      'A claim decision must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}
