/**
 * A smoke test for the audit write path.
 *
 * This exercises the real stack — the Prisma client, the pooled connection,
 * the database trigger — against the local Docker PostgreSQL. It is the
 * equivalent of clicking through the behaviour in the browser, for a path
 * that has no UI yet: the audit views belong to bolt `002-audit-reads`.
 *
 * Run with `npm run smoke:audit`.
 */

import { existsSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { describeDatabaseError } from '../src/infrastructure/db/describe-database-error';
import { AuditTrailReader } from '../src/application/audit-trail-reader';
import { AuditReadRecorder } from '../src/application/audit-read-recorder';
import { AuditTrailService } from '../src/application/audit-trail-service';
import { PrismaAuditEventRepository } from '../src/infrastructure/audit/prisma-audit-event-repository';
import { PrismaAuditReadLogRepository } from '../src/infrastructure/audit/prisma-audit-read-log-repository';
import { PrismaTransactionFactory } from '../src/infrastructure/db/prisma-transaction-factory';
import { PermissionDeniedError } from '../src/lib/errors';

// Load the local environment files, the same way `prisma.config.ts` does, so
// the script finds `DATABASE_URL` without an extra dependency.
for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const parentId = '00000000-0000-4000-8000-0000000000aa';
const actorId = '00000000-0000-4000-8000-0000000000bb';

async function main(): Promise<void> {
  console.log('FindBack — audit write path smoke test\n');

  await clearTrail();

  // 1. An audit write inside a transaction, with the catalog number derived.
  const written = await prisma.$transaction(async (tx) => {
    const event = await tx.auditEvent.create({
      data: {
        eventNumber: 3,
        eventType: 'claim.approved',
        parentType: 'claim',
        parentId,
        actorId,
        actorRole: 'administrator',
        reason: 'Verified ownership',
      },
    });

    return event;
  });

  console.log(`1. Wrote audit event ${written.eventType} (#${written.eventNumber})`);
  console.log(`   id ${written.id}`);

  // 2. The trail reads back newest first.
  const rows = await prisma.$queryRaw<Array<{ eventType: string; reason: string | null }>>`
    SELECT "eventType", "reason"
    FROM "audit_events"
    WHERE "parentType" = 'claim' AND "parentId" = ${parentId}::uuid
    ORDER BY "occurredAt" DESC, "id" DESC
    LIMIT 25
  `;

  console.log(`2. Trail reads back ${rows.length} entry/entries, newest first`);
  console.log(`   first: ${rows[0]?.eventType} — reason "${rows[0]?.reason}"`);

  // 3. An update is refused — the append-only guarantee, at the database.
  let updateRefused = false;
  try {
    await prisma.auditEvent.update({ where: { id: written.id }, data: { reason: 'tampered' } });
  } catch (error) {
    updateRefused = true;
    console.log(`3. Update refused: ${describe(error)}`);
  }

  if (!updateRefused) {
    throw new Error('The update was NOT refused. The append-only guarantee is broken.');
  }

  // 4. A delete is refused — with no privilege that could succeed.
  let deleteRefused = false;
  try {
    await prisma.auditEvent.delete({ where: { id: written.id } });
  } catch (error) {
    deleteRefused = true;
    console.log(`4. Delete refused: ${describe(error)}`);
  }

  if (!deleteRefused) {
    throw new Error('The delete was NOT refused. The append-only guarantee is broken.');
  }

  // 5. An out-of-catalog event number is refused by the CHECK constraint.
  let rangeRefused = false;
  try {
    await prisma.auditEvent.create({
      data: {
        eventNumber: 31,
        eventType: 'claim.invented',
        parentType: 'claim',
        parentId,
        actorId,
        actorRole: 'administrator',
      },
    });
  } catch (error) {
    rangeRefused = true;
    console.log(`5. Event 31 refused: ${describe(error)}`);
  }

  if (!rangeRefused) {
    throw new Error('Event 31 was accepted. The catalog range is not enforced.');
  }

  // 6. The FR-10 path removes the trail inside a transaction that sets the flag.
  const deleted = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`);

    return tx.auditEvent.deleteMany({ where: { parentId } });
  });

  console.log(`6. FR-10 path removed ${deleted.count} entry/entries`);

  // 7. The flag does not survive the transaction that set it.
  //
  // A row must exist for this check: the trigger is a row-level trigger, so
  // a delete that matches no rows never fires it and raises nothing. Without
  // a row, this check would pass for the wrong reason.
  await prisma.auditEvent.create({
    data: {
      eventNumber: 3,
      eventType: 'claim.approved',
      parentType: 'claim',
      parentId,
      actorId,
      actorRole: 'administrator',
    },
  });

  let flagDidNotLeak = false;
  try {
    await prisma.auditEvent.deleteMany({ where: { parentId } });
  } catch (error) {
    flagDidNotLeak = true;
    console.log(`7. Flag did not leak: a later delete was still refused — ${describe(error)}`);
  }

  if (!flagDidNotLeak) {
    throw new Error('The FR-10 flag leaked past its transaction.');
  }

  // 8. The read path: authorize → query → record.
  await smokeReadPath();

  console.log('\nAll smoke checks passed.');
}

/**
 * The read path, end to end.
 *
 * Exercises the whole read use case against the real database: a
 * non-administrator is refused before the query runs, an administrator's read
 * is filtered, and the read is recorded in its own transaction.
 */
async function smokeReadPath(): Promise<void> {
  const events = new PrismaAuditEventRepository(prisma);
  const reads = new PrismaAuditReadLogRepository(prisma);
  const transactions = new PrismaTransactionFactory(prisma);
  const service = new AuditTrailService(
    new AuditTrailReader(events),
    new AuditReadRecorder(reads),
    transactions,
  );

  const administrator = { userId: actorId, isAdministrator: true };
  const member = { userId: '00000000-0000-4000-8000-0000000000cc', isAdministrator: false };

  // 8a. A non-administrator is refused, and the refusal never reaches the
  // database — no trail content, no count, no existence signal.
  let refused = false;
  try {
    await service.listByParent(member, 'claim', parentId, {}, { requestId: 'smoke-refused' });
  } catch (error) {
    refused = error instanceof PermissionDeniedError;
  }

  if (!refused) {
    throw new Error('A non-administrator was NOT refused the audit trail.');
  }

  console.log('8. A non-administrator was refused the trail before the query ran');

  // 8b. An administrator reads the trail, and the read is recorded.
  //
  // The request id is unique per run, because the read log is append-only
  // and permits no deletion — a fixed id would accumulate records across
  // runs and the count below would grow every time.
  const readRequestId = `smoke-read-${Date.now()}`;

  const result = await service.listByParent(
    administrator,
    'claim',
    parentId,
    { filters: { eventTypes: ['claim.approved'] } },
    { requestId: readRequestId },
  );

  console.log(`9. An administrator read ${result.events.length} filtered event(s)`);

  const logs = await prisma.auditReadLog.findMany({
    where: { requestId: readRequestId },
  });

  if (logs.length !== 1) {
    throw new Error(`Expected 1 read record, found ${logs.length}.`);
  }

  console.log(`10. The read was recorded: ${logs[0]?.query} — ${logs[0]?.resultCount} result(s)`);

  // 8c. A refused read is not recorded in the read log.
  const refusalRequestId = `smoke-refused-${Date.now()}`;

  let refusedAgain = false;
  try {
    await service.listByParent(member, 'claim', parentId, {}, { requestId: refusalRequestId });
  } catch (error) {
    refusedAgain = error instanceof PermissionDeniedError;
  }

  if (!refusedAgain) {
    throw new Error('A non-administrator was NOT refused the audit trail.');
  }

  const refusalLogs = await prisma.auditReadLog.findMany({
    where: { requestId: refusalRequestId },
  });

  if (refusalLogs.length !== 0) {
    throw new Error('A refused read was recorded in the read log.');
  }

  console.log('11. The refused read was not recorded in the read log');
}

/**
 * The database's own explanation of a refusal, for readable output.
 *
 * Prisma maps a trigger's SQLSTATE onto a generic message that does not
 * describe what happened, so the driver adapter's original message is read
 * instead — that is the line that names the trigger or the constraint.
 */
function describe(error: unknown): string {
  return describeDatabaseError(error);
}

/** Empty the trail for the smoke test's parent. */
async function clearTrail(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`);
    await tx.auditEvent.deleteMany({ where: { parentId } });
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('\nSmoke test failed:');
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
