/**
 * A test-only cleanup helper.
 *
 * The audit tables are append-only, and the read-log and quota-snapshot
 * triggers permit **no** deletion at all — not even through the FR-10 flag.
 * That is the intended production behaviour, and it is exactly what makes
 * test cleanup awkward: rows written by a test cannot be removed by ordinary
 * SQL.
 *
 * `session_replication_role = 'replica'` disables user triggers for the
 * duration of the transaction. Setting it with `SET LOCAL` scopes it to that
 * transaction, so it cannot leak onto a later request — the same discipline
 * the FR-10 flag uses.
 *
 * **This is for tests only.** It requires a role with the privilege to change
 * `session_replication_role`, which the application role does not have in
 * production. It lives here, behind an explicit name, so that no production
 * code path can reach it by accident.
 */

import type { PrismaClient } from '@prisma/client';

/**
 * Delete every row from the audit tables, bypassing their triggers.
 *
 * The delete is issued through Prisma's typed model delegates, so no value
 * is ever interpolated into SQL.
 */
export async function clearAuditTablesForTest(client: PrismaClient): Promise<void> {
  await client.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);

    await tx.auditEvent.deleteMany({});
    await tx.auditReadLog.deleteMany({});
    await tx.quotaSnapshot.deleteMany({});
  });
}
