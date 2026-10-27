/**
 * A smoke test for the Lost-side audit write path.
 *
 * The equivalent of clicking through the behaviour in the browser, for a path
 * that has no UI yet: Units 004, 005, and 007 are not built, so no Recovery
 * Response can be submitted through a screen. This drives the same factory the
 * firing modules will call, against the real database, and reads the trail
 * back the way the administrator's trail view will.
 *
 * Run with `npm run smoke:lost-side`.
 */

import { existsSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { AuditTrailReader } from '../src/application/audit-trail-reader';
import { AuditWriter } from '../src/application/audit-writer';
import { LostSideEventFactory } from '../src/application/lost-side-event-factory';
import { PrismaAuditEventRepository } from '../src/infrastructure/audit/prisma-audit-event-repository';

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

const reportId = '00000000-0000-4000-8000-0000000000f1';
const ownerId = '00000000-0000-4000-8000-0000000000f2';
const adminId = '00000000-0000-4000-8000-0000000000f3';
const responderId = '00000000-0000-4000-8000-0000000000f4';
const responseId = '00000000-0000-4000-8000-0000000000f5';
const standbyId = '00000000-0000-4000-8000-0000000000f6';
const messageId = '00000000-0000-4000-8000-0000000000f7';

async function main(): Promise<void> {
  console.log('FindBack — Lost-side audit path smoke test\n');

  const events = new PrismaAuditEventRepository(prisma);
  const factory = new LostSideEventFactory(new AuditWriter(events));

  const clear = async (): Promise<void> => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`,
      );
      await tx.auditEvent.deleteMany({
        where: { parentId: { in: [reportId, responseId, standbyId, messageId] } },
      });
    });
  };

  await clear();

  // 1. The whole Lost-side trace, in one transaction — the shape Unit 004
  //    and Unit 005 will produce.
  await prisma.$transaction(async (tx) => {
    const handle = { transaction: tx };

    await factory.recordResponseSubmitted(
      {
        lostReportId: reportId,
        recoveryResponseId: responseId,
        responderId,
        whereFound: 'On a bench outside the Main Library east entrance, ~3pm',
        observedIdentifyingDetails: 'brown leather, zip closure, scuffed on the back corner',
        dateFound: new Date('2026-10-20T00:00:00Z'),
        imagePresent: false,
      },
      handle,
    );

    await factory.recordThreadMessagePosted(
      {
        lostReportId: reportId,
        recoveryResponseId: responseId,
        threadMessageId: messageId,
        actorId: ownerId,
        actorRole: 'member',
        messageText: 'I am checking the east entrance tomorrow.',
      },
      handle,
    );

    await factory.recordSelectedForVerification(
      { lostReportId: reportId, recoveryResponseId: responseId, ownerId },
      handle,
    );

    await factory.recordToVerificationPending(
      { lostReportId: reportId, ownerId, selectedResponseId: responseId },
      handle,
    );

    await factory.recordDetermination(
      {
        lostReportId: reportId,
        recoveryResponseId: responseId,
        determination: { determinedByUserId: ownerId, recordedByAdministratorId: adminId },
        lostReportOwnerId: ownerId,
        outcome: 'match_confirmed',
        verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
      },
      handle,
    );

    await factory.recordReturnedConfirmed(
      { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
      handle,
    );

    await factory.recordReturnedCloseout(
      {
        lostReportId: reportId,
        actingAdministratorId: adminId,
        resolvedResponses: [{ recoveryResponseId: standbyId, previousStatus: 'Submitted' }],
        matchedResponseId: responseId,
      },
      handle,
    );
  });

  // 2. The report's trail reads back, newest first.
  const reader = new AuditTrailReader(events);
  const page = await reader.listByParent(
    { userId: adminId, isAdministrator: true },
    'report',
    reportId,
    null,
  );

  console.log(`1. Report trail: ${page.events.length} entries, newest first`);
  for (const event of page.events) {
    console.log(`   #${event.eventNumber} ${event.eventType}`);
  }

  // 3. The no-gap trace: 15, 17, 18, 21, 26, 29, 30.
  const numbers = page.events.map((event) => event.eventNumber).sort((a, b) => (a ?? 0) - (b ?? 0));
  const expected = [15, 17, 18, 21, 26, 29, 30];
  const traceOk = JSON.stringify(numbers) === JSON.stringify(expected);

  console.log(
    `2. No-gap trace [${numbers.join(', ')}] — ${
      traceOk ? 'OK' : `MISMATCH (expected ${expected.join(', ')})`
    }`,
  );

  // 4. The determination carries both halves.
  const determination = page.events.find((event) => event.eventNumber === 18);

  console.log(
    `3. Determination #18 — determined_by ${determination?.actor.determinedByUserId}, recorded_by ${determination?.actor.recordedByAdministratorId}`,
  );

  // 5. Event 16 hangs under the thread message, not the report.
  const threadEvent = await prisma.auditEvent.findFirst({ where: { eventNumber: 16 } });

  console.log(
    `4. Event #16 parent — ${threadEvent?.parentType} / ${threadEvent?.parentId} (the message id)`,
  );

  // 6. A forged determination is refused and leaves nothing behind.
  let forgedRefused = false;

  try {
    await prisma.$transaction(async (tx) => {
      await factory.recordDetermination(
        {
          lostReportId: reportId,
          recoveryResponseId: standbyId,
          determination: {
            determinedByUserId: responderId,
            recordedByAdministratorId: adminId,
          },
          lostReportOwnerId: ownerId,
          outcome: 'not_a_match',
          verificationTimestamp: new Date('2026-10-23T10:00:00Z'),
        },
        { transaction: tx },
      );
    });
  } catch {
    forgedRefused = true;
  }

  console.log(`5. Forged determination refused — ${forgedRefused ? 'OK' : 'NOT REFUSED'}`);

  // 7. A credential in the reason is refused.
  let credentialRefused = false;

  try {
    await prisma.$transaction(async (tx) => {
      await factory.recordAdministratorClosed(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          reason: '$2b$12$abcdefghijklmnopqrstuv',
          priorLostStatus: 'Open',
        },
        { transaction: tx },
      );
    });
  } catch {
    credentialRefused = true;
  }

  console.log(`6. Credential in the reason refused — ${credentialRefused ? 'OK' : 'NOT REFUSED'}`);

  // 8. A non-administrator is refused before the query runs.
  let memberRefused = false;

  try {
    await reader.listByParent(
      { userId: ownerId, isAdministrator: false },
      'report',
      reportId,
      null,
    );
  } catch {
    memberRefused = true;
  }

  console.log(`7. Non-administrator refused — ${memberRefused ? 'OK' : 'NOT REFUSED'}`);

  // 9. The trail is append-only: an update is refused by the database.
  let updateRefused = false;

  try {
    await prisma.auditEvent.update({
      where: { id: page.events[0]?.id ?? '' },
      data: { reason: 'tampered' },
    });
  } catch {
    updateRefused = true;
  }

  console.log(`8. Update of a trail entry refused — ${updateRefused ? 'OK' : 'NOT REFUSED'}`);

  await clear();

  await prisma.$disconnect();

  const allOk =
    traceOk &&
    forgedRefused &&
    credentialRefused &&
    memberRefused &&
    updateRefused &&
    page.events.length === 7;

  console.log(`\n${allOk ? 'All smoke checks passed.' : 'SMOKE CHECKS FAILED.'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
