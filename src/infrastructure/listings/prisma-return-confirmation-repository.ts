/**
 * The Prisma implementation of the return-confirmation repository.
 *
 * **The report's move is a conditional write, and the condition is the
 * direction's precondition.** The `UPDATE` says `WHERE status = <the status
 * this direction requires>` — `Claim Approved` for a Found report,
 * `Verification Pending` for a Lost one. So two administrators confirming
 * the same report concurrently cannot both move it: the first write changes
 * the status, and the second matches no rows.
 *
 * **The condition is computed from the report's type, not supplied.** The
 * adapter holds the same precondition table the domain holds, because the
 * adapter is the *fact* and the domain is the *explanation*. A table in two
 * places would be a drift risk, so both read the same source: the domain's
 * `requiredPreconditionStatus`. The adapter imports it rather than restating
 * it — a status the domain adds would be enforced here without a second
 * edit.
 *
 * **The confirmation row is written after the move lands.** If the move
 * matched no rows, the adapter writes nothing at all — so a report that was
 * already confirmed by somebody else cannot acquire a second confirmation
 * row. The unique constraint on `report_id` is the second line of defence
 * against the same race.
 *
 * **The two writes are in the caller's transaction.** The report's status
 * and the confirmation row are one fact — "the item was returned, to
 * somebody" — and a report that is `Returned` with no confirmation row is
 * exactly the state FR-25 exists to prevent.
 *
 * **A handle with no usable transaction is refused, not worked around.** A
 * report moved outside the transaction that also writes its audit event
 * would leave the two disagreeing — and the audit trail is append-only with
 * no correction path (ADR-6).
 */

import { Prisma, type PrismaClient } from '@prisma/client';

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type {
  ReturnConfirmationRepository,
  ReturnConfirmationWrite,
  StoredReturnConfirmation,
} from '@/application/listings/ports/return-confirmation-repository';

import { requiredPreconditionStatus } from '@/domain/returns';

/**
 * Extract the transaction client from a handle.
 *
 * A handle that carries no usable transaction is **refused**, rather than
 * silently falling back to the root client.
 */
function transactionClient(transaction: TransactionHandle): Prisma.TransactionClient {
  const candidate = transaction.transaction;

  if (typeof candidate !== 'object' || candidate === null || !('report' in candidate)) {
    throw new Error(
      'A return confirmation must be written inside the caller\'s transaction. This is a defect.',
    );
  }

  return candidate as Prisma.TransactionClient;
}

/** Prisma's return-confirmation repository. */
export class PrismaReturnConfirmationRepository implements ReturnConfirmationRepository {
  constructor(private readonly client: PrismaClient) {}

  /**
   * Move the report to `Returned` and record the confirmation.
   *
   * @returns the confirmation's id when it landed, or `null` when the report
   * was no longer in its direction's precondition status.
   */
  async confirmReturned(
    confirmation: ReturnConfirmationWrite,
    transaction: TransactionHandle,
  ): Promise<string | null> {
    const client = transactionClient(transaction);

    // **The precondition comes from the domain's own table.** The adapter
    // does not restate the two statuses — it reads them from the one place
    // that owns them.
    const precondition = requiredPreconditionStatus(confirmation.reportType);

    // ── The report moves ───────────────────────────────────────────────────
    //
    // **The conditional `UPDATE` is what makes the race resolve to exactly
    // one commit.** The read that preceded it was advisory; this write is
    // the guarantee.
    const updated = await client.report.updateMany({
      where: {
        id: confirmation.reportId,
        type: confirmation.reportType,
        status: precondition,
      },
      data: { status: 'Returned', updatedAt: confirmation.confirmedAt },
    });

    if (updated.count !== 1) {
      // **The report was confirmed by somebody else between the read and
      // this write.** Nothing is written — no confirmation row, no audit
      // event — and the service turns this into the conflict.
      return null;
    }

    // ── The confirmation row ───────────────────────────────────────────────
    //
    // **The row records the default receiver always, and the substitute's
    // three fields only when there is a substitute.** The three are written
    // together or not at all — the `NOT NULL` on the default receiver and
    // the CHECK on the substitute's shape mean a partial row cannot exist.
    const created = await client.returnConfirmation.create({
      data: {
        reportId: confirmation.reportId,
        reportType: confirmation.reportType,
        defaultReceiverAccountId: confirmation.defaultReceiverAccountId,
        substituteReceiverName: confirmation.substitute?.name.value ?? null,
        authorizationAffirmation:
          confirmation.substitute === null
            ? null
            : 'Default receiver authorized the substitute',
        relationship: confirmation.substitute?.relationship ?? null,
        administratorId: confirmation.administratorId,
        confirmedAt: confirmation.confirmedAt,
      },
      select: { id: true },
    });

    return created.id;
  }

  /**
   * Read the confirmation recorded against a report.
   *
   * @returns the confirmation, or `null` when no confirmation carries that
   * report id.
   */
  async findByReportId(
    reportId: string,
    transaction?: TransactionHandle,
  ): Promise<StoredReturnConfirmation | null> {
    const client = transaction
      ? (transaction.transaction as Prisma.TransactionClient)
      : this.client;

    const found = await client.returnConfirmation.findUnique({
      where: { reportId },
      select: {
        id: true,
        reportId: true,
        reportType: true,
        defaultReceiverAccountId: true,
        substituteReceiverName: true,
        authorizationAffirmation: true,
        relationship: true,
        administratorId: true,
        confirmedAt: true,
      },
    });

    if (found === null) {
      return null;
    }

    return {
      id: found.id,
      reportId: found.reportId,
      reportType: found.reportType as StoredReturnConfirmation['reportType'],
      defaultReceiverAccountId: found.defaultReceiverAccountId,
      substituteReceiverName: found.substituteReceiverName,
      authorizationAffirmation: found.authorizationAffirmation,
      relationship: found.relationship,
      administratorId: found.administratorId,
      confirmedAt: found.confirmedAt,
    };
  }
}
