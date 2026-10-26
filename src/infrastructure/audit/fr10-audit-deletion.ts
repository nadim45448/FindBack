/**
 * The FR-10 hard-delete path for audit entries.
 *
 * **This is the only code in the system that can delete an audit row.**
 *
 * ADR-6 records the decision: the trail is append-only at the database layer,
 * and the single permitted deletion is the FR-10 hard delete of an
 * interaction-free `Open` report, which removes the report's trail with it.
 *
 * The mechanism has three parts, and each one is load-bearing:
 *
 * 1. `SET LOCAL findback.allow_audit_delete = 'on'` — transaction-scoped, so
 *    the flag is discarded at commit or rollback and cannot leak onto a
 *    reused pooled connection. `SET LOCAL`, not `SET`.
 * 2. The flag is set **only after** the FR-10 eligibility check has passed.
 *    A report that fails the check never opens a deletion window.
 * 3. The flag names its single permitted caller. There is no parameterised,
 *    general-purpose "may delete audit rows" switch.
 *
 * The database trigger enforces the rest: it refuses every mutation unless
 * that flag is on.
 */

import { Prisma } from '@prisma/client';
import type { TransactionHandle } from '@/application/ports/transaction-handle';
import { AuditWriteOutsideTransactionError } from '@/domain/audit';

/** The session setting the trigger reads. */
export const AUDIT_DELETE_FLAG = 'findback.allow_audit_delete';

/** The only value that opens the deletion window. */
export const AUDIT_DELETE_FLAG_VALUE = 'on';

/**
 * Delete a report's audit entries inside the FR-10 transaction.
 *
 * The caller must have already established that the report is eligible for
 * the FR-10 hard delete — an interaction-free `Open` report. This function
 * does not evaluate that rule; it is the reports context's rule, and the
 * audit context has no knowledge of it (the boundary rule in the domain
 * model).
 *
 * The flag is set inside this function, immediately before the delete, and
 * only for the rows of this one parent.
 */
export async function deleteAuditTrailForParent(
  parentType: string,
  parentId: string,
  transaction: TransactionHandle,
): Promise<number> {
  const client = extractTransactionClient(transaction);

  // `set_config(name, value, is_local)` with `is_local = true` is exactly
  // `SET LOCAL`: the setting is scoped to the current transaction and is
  // discarded at commit or rollback, so it cannot survive onto a reused
  // pooled connection. It is used rather than `SET LOCAL` directly because
  // `SET` does not accept bind parameters, while `set_config` does — the
  // statement is therefore fully parameterized like every other query.
  await client.$executeRaw(
    Prisma.sql`SELECT set_config(${AUDIT_DELETE_FLAG}, ${AUDIT_DELETE_FLAG_VALUE}, true)`,
  );

  const deleted = await client.auditEvent.deleteMany({
    where: { parentType, parentId },
  });

  return deleted.count;
}

/** Extract the transaction client from a handle. */
function extractTransactionClient(transaction: TransactionHandle): Prisma.TransactionClient & {
  $executeRaw(query: Prisma.Sql): Promise<number>;
} {
  const candidate = transaction.transaction;

  if (
    typeof candidate !== 'object' ||
    candidate === null ||
    !('auditEvent' in candidate) ||
    !('$executeRaw' in candidate)
  ) {
    throw new AuditWriteOutsideTransactionError();
  }

  return candidate as Prisma.TransactionClient & {
    $executeRaw(query: Prisma.Sql): Promise<number>;
  };
}
