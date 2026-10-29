/**
 * The adapter that satisfies the application layer's `AuditTrailDeletion`
 * port.
 *
 * **It is a thin wrapper, and that is the point.** The mechanism —
 * `SET LOCAL findback.allow_audit_delete = 'on'`, then the delete — lives in
 * the audit infrastructure module (`fr10-audit-deletion.ts`), because that
 * module owns the ADR-6 flag and the trigger that reads it. This adapter
 * exists so the application layer can depend on a **port** rather than on the
 * audit infrastructure, which the dependency rule forbids.
 *
 * **The flag is opened here, not by the caller.** The port's contract says
 * the caller has already established eligibility; the implementation is what
 * actually opens the window. So the two are separate statements of one rule,
 * and neither can be satisfied without the other.
 *
 * **The flag is transaction-scoped.** `SET LOCAL`, not `SET` — the setting is
 * discarded at commit or rollback and cannot leak onto a reused pooled
 * connection.
 */

import type { TransactionHandle } from '@/application/ports/transaction-handle';
import type { AuditTrailDeletion } from '@/application/listings/report-deletion-service';

import { deleteAuditTrailForParent } from '@/infrastructure/audit/fr10-audit-deletion';

/** The Prisma-backed audit trail deletion. */
export class PrismaAuditTrailDeletion implements AuditTrailDeletion {
  /**
   * Delete the audit entries for one parent, in the caller's transaction.
   *
   * @returns the number of entries removed.
   */
  async deleteForParent(
    parentType: string,
    parentId: string,
    transaction: TransactionHandle,
  ): Promise<number> {
    return deleteAuditTrailForParent(parentType, parentId, transaction);
  }
}
