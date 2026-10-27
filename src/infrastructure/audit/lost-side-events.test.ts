/**
 * The Lost-side (FR-48) events against the live database.
 *
 * These tests exercise the bolt `003-audit-lost-side-events` contract at the
 * layer where it matters: the events are written through the real
 * insert-only repository, inside a real transaction, against the real
 * append-only trigger.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import { AuditCatalogViolationError, resolveEventNumber } from '@/domain/audit';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('bolt 003 — the Lost-side events', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reportId = '00000000-0000-4000-8000-000000000401';
  const ownerId = '00000000-0000-4000-8000-000000000402';
  const adminId = '00000000-0000-4000-8000-000000000403';
  const responderId = '00000000-0000-4000-8000-000000000404';
  const matchedResponseId = '00000000-0000-4000-8000-000000000405';
  const standbyResponseId = '00000000-0000-4000-8000-000000000406';
  const secondResponseId = '00000000-0000-4000-8000-000000000407';

  const events = new PrismaAuditEventRepository(prisma);
  const factory = new LostSideEventFactory(new AuditWriter(events));

  beforeAll(async () => {
    await clearAuditTablesForTest(prisma);
  });

  afterAll(async () => {
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await clearAuditTablesForTest(prisma);
  });

  it('writes the whole no-gap trace under one parent, in order', async () => {
    await prisma.$transaction(async (tx) => {
      const handle = { transaction: tx };

      // Sam submits a response.
      await factory.recordResponseSubmitted(
        {
          lostReportId: reportId,
          recoveryResponseId: matchedResponseId,
          responderId,
          whereFound: 'On a bench outside the Main Library east entrance',
          observedIdentifyingDetails: 'brown leather, zip closure',
          dateFound: new Date('2026-10-20T00:00:00Z'),
          imagePresent: true,
        },
        handle,
      );

      // Maya selects Sam's response.
      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: matchedResponseId, ownerId },
        handle,
      );

      // The report enters Verification Pending.
      await factory.recordToVerificationPending(
        { lostReportId: reportId, ownerId, selectedResponseId: matchedResponseId },
        handle,
      );

      // Riley records Maya's Match Confirmed.
      await factory.recordDetermination(
        {
          lostReportId: reportId,
          recoveryResponseId: matchedResponseId,
          determination: {
            determinedByUserId: ownerId,
            recordedByAdministratorId: adminId,
          },
          lostReportOwnerId: ownerId,
          outcome: 'match_confirmed',
          verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
        },
        handle,
      );

      // Riley confirms physical return to Maya.
      await factory.recordReturnedConfirmed(
        { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
        handle,
      );

      // The parent batch resolution, and the matched response's own terminal record.
      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
            { recoveryResponseId: secondResponseId, previousStatus: 'Selected for Verification' },
          ],
          matchedResponseId,
        },
        handle,
      );
    });

    const rows = await prisma.auditEvent.findMany({
      where: { parentId: reportId },
      orderBy: { occurredAt: 'asc' },
    });

    // The complete trace is seven events: the PRD names six, and event 29 is
    // the report's own transition to Verification Pending.
    expect(rows.map((row) => row.eventNumber).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      15, 17, 18, 21, 26, 29, 30,
    ]);

    // Every one of them hangs from the same parent.
    expect(rows.every((row) => row.parentType === 'report')).toBe(true);
    expect(rows.every((row) => row.parentId === reportId)).toBe(true);
  });

  it('records the determination pair in two distinct columns', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordDetermination(
        {
          lostReportId: reportId,
          recoveryResponseId: matchedResponseId,
          determination: {
            determinedByUserId: ownerId,
            recordedByAdministratorId: adminId,
          },
          lostReportOwnerId: ownerId,
          outcome: 'match_confirmed',
          verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 18 } });

    expect(row.determinedByUserId).toBe(ownerId);
    expect(row.recordedByAdministratorId).toBe(adminId);
    expect(row.determinedByUserId).not.toBeNull();
    expect(row.recordedByAdministratorId).not.toBeNull();
  });

  it('records the batch child list with each response prior status', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
            { recoveryResponseId: secondResponseId, previousStatus: 'Selected for Verification' },
          ],
          matchedResponseId,
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 26 } });
    const metadata = row.metadata as {
      childResponses: Array<{ recoveryResponseId: string; previousStatus: string }>;
      matchedSelectedResponseId: string;
    };

    expect(metadata.childResponses).toEqual([
      { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
      { recoveryResponseId: secondResponseId, previousStatus: 'Selected for Verification' },
    ]);
    expect(metadata.matchedSelectedResponseId).toBe(matchedResponseId);
  });

  it('writes the matched response terminal event beside the batch event', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
          matchedResponseId,
        },
        { transaction: tx },
      );
    });

    const rows = await prisma.auditEvent.findMany({
      where: { parentId: reportId },
      orderBy: { eventNumber: 'asc' },
    });

    expect(rows.map((row) => row.eventNumber)).toEqual([26, 30]);

    const terminal = rows.find((row) => row.eventNumber === 30);
    const metadata = terminal?.metadata as {
      recoveryResponseId: string;
      newCanonicalStatus: string;
    };

    expect(metadata.recoveryResponseId).toBe(matchedResponseId);
    expect(metadata.newCanonicalStatus).toBe('Completed — Report Returned');
  });

  it('rolls the whole closeout back when the determination is refused', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordDetermination(
          {
            lostReportId: reportId,
            recoveryResponseId: matchedResponseId,
            determination: {
              determinedByUserId: responderId,
              recordedByAdministratorId: adminId,
            },
            // The maker is not the report's owner, so the write is refused.
            lostReportOwnerId: ownerId,
            outcome: 'match_confirmed',
            verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
          },
          { transaction: tx },
        );
      }),
    ).rejects.toThrow();

    const rows = await prisma.auditEvent.findMany({ where: { parentId: reportId } });

    expect(rows).toHaveLength(0);
  });

  it('rolls the whole closeout back when the batch set is empty', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordReturnedCloseout(
          {
            lostReportId: reportId,
            actingAdministratorId: adminId,
            resolvedResponses: [],
            matchedResponseId,
          },
          { transaction: tx },
        );
      }),
    ).rejects.toThrow();

    const rows = await prisma.auditEvent.findMany({ where: { parentId: reportId } });

    expect(rows).toHaveLength(0);
  });

  it('refuses to update a Lost-side event', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: matchedResponseId, ownerId },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 17 } });

    await expect(
      prisma.auditEvent.update({
        where: { id: row.id },
        data: { eventType: 'tampered' },
      }),
    ).rejects.toThrow();
  });

  it('refuses to delete a Lost-side event', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: matchedResponseId, ownerId },
        { transaction: tx },
      );
    });

    await expect(prisma.auditEvent.deleteMany({ where: { eventNumber: 17 } })).rejects.toThrow();
  });

  it('refuses an event number outside the frozen catalog', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.auditEvent.create({
          data: {
            eventNumber: 31,
            eventType: 'report.lost_returned_child_response_resolution',
            parentType: 'report',
            parentId: reportId,
            actorId: adminId,
            actorRole: 'system',
          },
        });
      }),
    ).rejects.toThrow();
  });

  it('records a Lost-side event under the number its catalog type names', async () => {
    // The number is **derived** from the catalog by the write path, never
    // taken on trust, so a Lost-side type cannot be stored under another
    // number. The database enforces the 1–30 range; the type↔number mapping
    // is enforced in the domain layer, which is where Stage 2 put it.
    await prisma.$transaction(async (tx) => {
      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
          matchedResponseId,
        },
        { transaction: tx },
      );
    });

    const terminal = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 30 } });

    expect(terminal.eventType).toBe('recovery_response.completed_report_returned');
    expect(terminal.eventNumber).toBe(30);
  });

  it('refuses a mismatched number for a Lost-side type in the domain layer', () => {
    expect(() => resolveEventNumber('recovery_response.completed_report_returned', 16)).toThrow(
      AuditCatalogViolationError,
    );
  });
});
