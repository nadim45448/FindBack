/**
 * Acceptance-criteria validation for the Lost-side audit events.
 *
 * Each test in this file maps to one acceptance criterion of story
 * `002-lost-side-audit-events`, or to one success criterion of bolt
 * `003-audit-lost-side-events`. They are collected in one file so the mapping
 * from criterion to test is legible in one place — the test report cites it.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('bolt 003 — the Lost-side acceptance criteria', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reportId = '00000000-0000-4000-8000-000000000501';
  const ownerId = '00000000-0000-4000-8000-000000000502';
  const adminId = '00000000-0000-4000-8000-000000000503';
  const responderId = '00000000-0000-4000-8000-000000000504';
  const matchedResponseId = '00000000-0000-4000-8000-000000000505';
  const standbyResponseId = '00000000-0000-4000-8000-000000000506';

  const events = new PrismaAuditEventRepository(prisma);
  const factory = new LostSideEventFactory(new AuditWriter(events));

  /** The rows written for the report under test. */
  async function rowsForReport() {
    return prisma.auditEvent.findMany({
      where: { parentId: reportId },
      orderBy: { occurredAt: 'asc' },
    });
  }

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

  // ── Criterion 1 — every FR-48 event from 15 to 30 is recorded ──────────────

  it('records every one of the sixteen FR-48 events with its actor and timestamp', async () => {
    // Each event is fired through the factory, the way its firing module will
    // fire it, so this asserts the whole catalog rather than a hand-built row.
    await prisma.$transaction(async (tx) => {
      const handle = { transaction: tx };

      await factory.recordResponseSubmitted(
        {
          lostReportId: reportId,
          recoveryResponseId: matchedResponseId,
          responderId,
          whereFound: 'Outside the Main Library east entrance',
          observedIdentifyingDetails: 'Brown leather, zip closure',
          dateFound: new Date('2026-10-20T00:00:00Z'),
          imagePresent: false,
        },
        handle,
      );

      await factory.recordThreadMessagePosted(
        {
          lostReportId: reportId,
          recoveryResponseId: matchedResponseId,
          threadMessageId: '00000000-0000-4000-8000-000000000509',
          actorId: ownerId,
          actorRole: 'member',
          messageText: 'I am checking the east entrance tomorrow.',
        },
        handle,
      );

      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: matchedResponseId, ownerId },
        handle,
      );

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

      await factory.recordDetermination(
        {
          lostReportId: reportId,
          recoveryResponseId: standbyResponseId,
          determination: {
            determinedByUserId: ownerId,
            recordedByAdministratorId: adminId,
          },
          lostReportOwnerId: ownerId,
          outcome: 'not_a_match',
          verificationTimestamp: new Date('2026-10-23T10:00:00Z'),
        },
        handle,
      );

      await factory.recordResponseWithdrawn(
        { lostReportId: reportId, recoveryResponseId: standbyResponseId, responderId },
        handle,
      );

      await factory.recordReturnedConfirmed(
        { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
        handle,
      );

      await factory.recordReturnedConfirmed(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          substituteReceiverName: "Maya's colleague",
          authorizationAffirmation: 'Authorised in writing',
          relationship: 'Colleague',
        },
        handle,
      );

      await factory.recordLostWithdrawn(
        { lostReportId: reportId, ownerId, priorLostStatus: 'Open' },
        handle,
      );

      await factory.recordAdministratorClosed(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          reason: 'Moderation — the report violated the community rules',
          priorLostStatus: 'Open',
        },
        handle,
      );

      await factory.recordExceptionalCancellation(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          exceptionalReason: 'Owner could not be contacted after three attempts',
          priorLostStatus: 'Verification Pending',
          priorSelectedResponseId: matchedResponseId,
          priorSelectedResponseStatus: 'Match Confirmed',
        },
        handle,
      );

      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
          matchedResponseId,
        },
        handle,
      );

      await factory.recordClosedCloseout(
        {
          lostReportId: reportId,
          cause: {
            actingAdministratorId: adminId,
            actingMemberId: null,
            triggeredByRole: 'administrator',
          },
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
        },
        handle,
      );

      await factory.recordNotAMatchReturnToOpen(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          priorSelectedResponseId: matchedResponseId,
        },
        handle,
      );

      await factory.recordToVerificationPending(
        { lostReportId: reportId, ownerId, selectedResponseId: matchedResponseId },
        handle,
      );
    });

    const rows = await rowsForReport();
    const numbers = rows.map((row) => row.eventNumber).sort((a, b) => (a ?? 0) - (b ?? 0));

    // Fifteen of the sixteen numbers, 15 through 30, each present. Event 16
    // is the sixteenth, and it hangs under the thread message rather than the
    // report — the trail's retention follows the parent entity's own
    // lifetime, and a per-Recovery-Response thread message is its own parent
    // type, the same way FR-31 event 14 hangs from the per-Claim thread
    // message.
    expect(numbers).toEqual([15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);

    const threadEvent = await prisma.auditEvent.findFirstOrThrow({
      where: { eventNumber: 16 },
    });

    expect(threadEvent.parentType).toBe('recovery_response_thread_message');
    expect(threadEvent.parentId).toBe('00000000-0000-4000-8000-000000000509');
    expect(threadEvent.actorId).toBe(ownerId);
    expect(threadEvent.occurredAt).toBeInstanceOf(Date);

    // Every event carries an actor and a timestamp.
    for (const row of rows) {
      expect(row.actorId).toBeTruthy();
      expect(row.occurredAt).toBeInstanceOf(Date);
      expect(row.createdAt).toBeInstanceOf(Date);
    }

    // Every actor role is one of the three the schema's CHECK admits.
    for (const row of rows) {
      expect(['member', 'administrator', 'system']).toContain(row.actorRole);
    }
  });

  // ── Criterion 2 — events 18/19 carry the two halves ────────────────────────

  it('stores determined_by and recorded_by as two distinct values on events 18 and 19', async () => {
    await prisma.$transaction(async (tx) => {
      const handle = { transaction: tx };

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

      await factory.recordDetermination(
        {
          lostReportId: reportId,
          recoveryResponseId: standbyResponseId,
          determination: {
            determinedByUserId: ownerId,
            recordedByAdministratorId: adminId,
          },
          lostReportOwnerId: ownerId,
          outcome: 'not_a_match',
          verificationTimestamp: new Date('2026-10-23T10:00:00Z'),
        },
        handle,
      );
    });

    const rows = await prisma.auditEvent.findMany({
      where: { eventNumber: { in: [18, 19] } },
      orderBy: { eventNumber: 'asc' },
    });

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      // Both halves present.
      expect(row.determinedByUserId).toBe(ownerId);
      expect(row.recordedByAdministratorId).toBe(adminId);

      // Two distinct columns, and the maker is the report's owner.
      expect(row.determinedByUserId).not.toBeNull();
      expect(row.recordedByAdministratorId).not.toBeNull();
      expect(row.determinedByUserId).toBe(ownerId);
    }
  });

  // ── Criterion 3 — the Returned closeout writes 21/22, 26, and 30 ──────────

  it('records events 21, 26, and 30 in the same transaction as the Returned closeout', async () => {
    await prisma.$transaction(async (tx) => {
      const handle = { transaction: tx };

      await factory.recordReturnedConfirmed(
        { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
        handle,
      );

      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
          matchedResponseId,
        },
        handle,
      );
    });

    const rows = await rowsForReport();

    expect(rows.map((row) => row.eventNumber).sort()).toEqual([21, 26, 30]);
  });

  it('records the substitute-receiver variant as event 22 instead of 21', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordReturnedConfirmed(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          substituteReceiverName: "Maya's colleague",
          authorizationAffirmation: 'Authorised in writing',
          relationship: 'Colleague',
        },
        { transaction: tx },
      );
    });

    const rows = await rowsForReport();

    expect(rows.map((row) => row.eventNumber)).toEqual([22]);
  });

  it('never writes a closure event inside a Returned transaction', async () => {
    // The PRD's rule: `Returned` is terminal, so events 24 and 25 — the
    // Closed-path events — cannot occur in a Returned closeout.
    await prisma.$transaction(async (tx) => {
      const handle = { transaction: tx };

      await factory.recordReturnedConfirmed(
        { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
        handle,
      );

      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
          matchedResponseId,
        },
        handle,
      );
    });

    const rows = await rowsForReport();

    expect(rows.map((row) => row.eventNumber)).not.toContain(24);
    expect(rows.map((row) => row.eventNumber)).not.toContain(25);
  });

  // ── Criterion 4 — the trail covers the whole workflow ─────────────────────

  it('covers submission, selection, determination, closeout, and the reason for each terminal resolution', async () => {
    await prisma.$transaction(async (tx) => {
      const handle = { transaction: tx };

      await factory.recordResponseSubmitted(
        {
          lostReportId: reportId,
          recoveryResponseId: matchedResponseId,
          responderId,
          whereFound: 'Outside the Main Library east entrance',
          observedIdentifyingDetails: 'Brown leather, zip closure',
          dateFound: new Date('2026-10-20T00:00:00Z'),
          imagePresent: false,
        },
        handle,
      );

      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: matchedResponseId, ownerId },
        handle,
      );

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

      await factory.recordReturnedConfirmed(
        { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
        handle,
      );

      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
          matchedResponseId,
        },
        handle,
      );
    });

    const rows = await rowsForReport();
    const numbers = rows.map((row) => row.eventNumber);

    // Submission, selection, determination, closeout.
    expect(numbers).toContain(15);
    expect(numbers).toContain(17);
    expect(numbers).toContain(18);
    expect(numbers).toContain(21);

    // The reason for each terminal resolution: event 26 names every child it
    // resolved, with the status each was in.
    const batch = rows.find((row) => row.eventNumber === 26);
    const metadata = batch?.metadata as {
      childResponses: Array<{ recoveryResponseId: string; previousStatus: string }>;
    };

    expect(metadata.childResponses).toEqual([
      { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
    ]);
  });

  // ── Criterion 5 — no gap between units ────────────────────────────────────

  it('places the Unit 004 and Unit 005 events under the same parent with no gap', async () => {
    await prisma.$transaction(async (tx) => {
      const handle = { transaction: tx };

      // Unit 004 fires these: submission, selection, the report's own move to
      // Verification Pending, and the determination.
      await factory.recordResponseSubmitted(
        {
          lostReportId: reportId,
          recoveryResponseId: matchedResponseId,
          responderId,
          whereFound: 'Outside the Main Library east entrance',
          observedIdentifyingDetails: 'Brown leather, zip closure',
          dateFound: new Date('2026-10-20T00:00:00Z'),
          imagePresent: false,
        },
        handle,
      );

      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: matchedResponseId, ownerId },
        handle,
      );

      await factory.recordToVerificationPending(
        { lostReportId: reportId, ownerId, selectedResponseId: matchedResponseId },
        handle,
      );

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

      // Unit 005 fires these: the handoff and the closeout.
      await factory.recordReturnedConfirmed(
        { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
        handle,
      );

      await factory.recordReturnedCloseout(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          resolvedResponses: [
            { recoveryResponseId: standbyResponseId, previousStatus: 'Submitted' },
          ],
          matchedResponseId,
        },
        handle,
      );
    });

    const rows = await rowsForReport();

    // One parent for every event — no event hangs under a different report.
    expect(rows.every((row) => row.parentType === 'report')).toBe(true);
    expect(rows.every((row) => row.parentId === reportId)).toBe(true);

    // The complete trace, with no gap: the PRD names six events and event 29
    // is the seventh — the report's own transition to Verification Pending.
    expect(rows.map((row) => row.eventNumber).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      15, 17, 18, 21, 26, 29, 30,
    ]);
  });

  // ── Criterion 6 — reasons are verbatim ────────────────────────────────────

  it('stores the audit reason verbatim even where the user-facing copy was softened', async () => {
    const softenedCopy = 'This item was closed after a review.';
    const auditReason = 'another claim was approved for this item';

    await prisma.$transaction(async (tx) => {
      await factory.recordAdministratorClosed(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          reason: auditReason,
          priorLostStatus: 'Open',
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 24 } });

    expect(row.reason).toBe(auditReason);
    expect(row.reason).not.toBe(softenedCopy);
  });

  it('stores the exceptional cancellation reason verbatim', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordExceptionalCancellation(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          exceptionalReason: 'Owner could not be contacted after three attempts',
          priorLostStatus: 'Verification Pending',
          priorSelectedResponseId: matchedResponseId,
          priorSelectedResponseStatus: 'Match Confirmed',
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 25 } });

    expect(row.reason).toBe('Owner could not be contacted after three attempts');
  });

  // ── Edge case — a closeout that rolls back partway ───────────────────────

  it('leaves no closeout events behind when the transaction rolls back partway', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const handle = { transaction: tx };

        await factory.recordReturnedConfirmed(
          { lostReportId: reportId, actingAdministratorId: adminId, receiverId: ownerId },
          handle,
        );

        await factory.recordReturnedCloseout(
          {
            lostReportId: reportId,
            actingAdministratorId: adminId,
            resolvedResponses: [],
            matchedResponseId,
          },
          handle,
        );
      }),
    ).rejects.toThrow();

    const rows = await rowsForReport();

    // Neither event 21 nor event 26 nor event 30 survives the rollback.
    expect(rows).toHaveLength(0);
  });

  // ── Edge case — standby responders generate no events of their own ─────────

  it('records a standby response only inside the batch list, never as an event of its own', async () => {
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

    const rows = await rowsForReport();

    // The standby response appears only inside event 26's list.
    expect(rows.map((row) => row.eventNumber)).toEqual([26, 30]);

    const batch = rows.find((row) => row.eventNumber === 26);
    const metadata = batch?.metadata as {
      childResponses: Array<{ recoveryResponseId: string }>;
    };

    expect(metadata.childResponses.map((entry) => entry.recoveryResponseId)).toEqual([
      standbyResponseId,
    ]);

    // No event hangs under the standby response as its parent.
    const standbyOwn = await prisma.auditEvent.findMany({
      where: { parentId: standbyResponseId },
    });

    expect(standbyOwn).toHaveLength(0);
  });
});
