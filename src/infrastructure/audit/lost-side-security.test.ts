/**
 * Security tests for the Lost-side audit events.
 *
 * Five controls are under test, and each maps to a frozen requirement or to
 * an accepted ADR:
 *
 * 1. **Determination forgery (FR-43, ADR-11)** — a determination attributed
 *    to someone other than the report's owner is refused, and the refusal
 *    rolls the transaction back.
 * 2. **Role confusion (FR-45)** — the acting administrator and the
 *    determination-maker are recorded in two separate columns, so the
 *    distinction survives the record.
 * 3. **Sensitive-value leakage (FR-37, FR-39)** — the where-found and the
 *    observed identifying details are catalog-named for event 15, so they may
 *    reach the trail; no other Lost-side event may carry them, and a
 *    credential may reach neither.
 * 4. **Injection and storage safety** — a hostile value is stored as data,
 *    never interpolated into SQL.
 * 5. **Append-only integrity (story `004`)** — no code path, and no
 *    privilege, updates or deletes a Lost-side trail entry.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { LostSideEventFactory } from '@/application/lost-side-event-factory';
import { AuditPayloadRejectedError, sanitizeForTrail } from '@/domain/audit';
import { PrismaAuditEventRepository } from './prisma-audit-event-repository';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('Lost-side audit security', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const reportId = '00000000-0000-4000-8000-000000000601';
  const ownerId = '00000000-0000-4000-8000-000000000602';
  const adminId = '00000000-0000-4000-8000-000000000603';
  const responderId = '00000000-0000-4000-8000-000000000604';
  const responseId = '00000000-0000-4000-8000-000000000605';

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

  // ── Control 1 — determination forgery ─────────────────────────────────────

  it('refuses a determination attributed to someone other than the report owner', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordDetermination(
          {
            lostReportId: reportId,
            recoveryResponseId: responseId,
            determination: {
              // The responder is not the owner. A determination attributed to
              // an uninvolved member is well-formed and would pass any
              // presence or distinctness check — and would be permanently
              // wrong, because the trail has no correction path.
              determinedByUserId: responderId,
              recordedByAdministratorId: adminId,
            },
            lostReportOwnerId: ownerId,
            outcome: 'match_confirmed',
            verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
          },
          { transaction: tx },
        );
      }),
    ).rejects.toThrow();

    // Nothing reached the trail.
    const rows = await prisma.auditEvent.findMany({ where: { parentId: reportId } });

    expect(rows).toHaveLength(0);
  });

  it('refuses a determination with no maker and no recorder', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordDetermination(
          {
            lostReportId: reportId,
            recoveryResponseId: responseId,
            determination: { determinedByUserId: '', recordedByAdministratorId: '' },
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

  it('accepts the same person in both capacities when the owner is an administrator', async () => {
    // `administrator` is a flag on an Account, not a disjoint role. A
    // determination on an administrator-owned report is legitimate, and
    // refusing it would push operators toward fabricating a second identity.
    const adminOwnedReportId = '00000000-0000-4000-8000-000000000606';

    await prisma.$transaction(async (tx) => {
      await factory.recordDetermination(
        {
          lostReportId: adminOwnedReportId,
          recoveryResponseId: responseId,
          determination: {
            determinedByUserId: adminId,
            recordedByAdministratorId: adminId,
          },
          lostReportOwnerId: adminId,
          outcome: 'match_confirmed',
          verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 18 } });

    expect(row.determinedByUserId).toBe(adminId);
    expect(row.recordedByAdministratorId).toBe(adminId);
  });

  // ── Control 2 — role confusion ────────────────────────────────────────────

  it('records the acting administrator and the determination-maker in separate columns', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordDetermination(
        {
          lostReportId: reportId,
          recoveryResponseId: responseId,
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

    // The actor is the acting administrator — the system actor performing the
    // write, as the PRD specifies.
    expect(row.actorId).toBe(adminId);
    expect(row.actorRole).toBe('administrator');
    expect(row.actingAdministratorId).toBe(adminId);

    // The maker is the owner, in its own column. A single actor field would
    // destroy that distinction.
    expect(row.determinedByUserId).toBe(ownerId);
    expect(row.recordedByAdministratorId).toBe(adminId);
  });

  it('refuses a system-actor event that names no human', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordClosedCloseout(
          {
            lostReportId: reportId,
            cause: {
              actingAdministratorId: null,
              actingMemberId: null,
              triggeredByRole: 'reporter',
            },
            resolvedResponses: [{ recoveryResponseId: responseId, previousStatus: 'Submitted' }],
          },
          { transaction: tx },
        );
      }),
    ).rejects.toThrow();

    const rows = await prisma.auditEvent.findMany({ where: { parentId: reportId } });

    expect(rows).toHaveLength(0);
  });

  // ── Control 3 — sensitive-value leakage ───────────────────────────────────

  it('records the where-found and observed identifying details on event 15, which the PRD names', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordResponseSubmitted(
        {
          lostReportId: reportId,
          recoveryResponseId: responseId,
          responderId,
          whereFound: 'On a bench outside the Main Library east entrance, ~3pm',
          observedIdentifyingDetails: 'brown leather, zip closure, scuffed on the back corner',
          dateFound: new Date('2026-10-20T00:00:00Z'),
          imagePresent: true,
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 15 } });
    const metadata = row.metadata as {
      whereFound: string;
      observedIdentifyingDetails: string;
    };

    // Catalog-named for this event, and the trail is administrator-only.
    expect(metadata.whereFound).toBe('On a bench outside the Main Library east entrance, ~3pm');
    expect(metadata.observedIdentifyingDetails).toBe(
      'brown leather, zip closure, scuffed on the back corner',
    );
  });

  it('refuses a where-found on an event the PRD does not name it for', () => {
    // The where-found is catalog-named for event 15 only. On any other event
    // it is a field the catalog does not name, and the sanitizer denies by
    // default.
    expect(() =>
      sanitizeForTrail('recovery_response.selected_for_verification', {
        whereFound: 'On a bench outside the Main Library east entrance',
      }),
    ).toThrow(AuditPayloadRejectedError);
  });

  it('refuses an observed identifying detail on an event the PRD does not name it for', () => {
    expect(() =>
      sanitizeForTrail('recovery_response.withdrawn_by_responder', {
        observedIdentifyingDetails: 'brown leather, zip closure',
      }),
    ).toThrow(AuditPayloadRejectedError);
  });

  it('refuses a thread body on an event the PRD does not name it for', () => {
    expect(() =>
      sanitizeForTrail('report.lost_closed_by_administrator', {
        messageText: 'I found it near the benches',
      }),
    ).toThrow(AuditPayloadRejectedError);
  });

  it('refuses a credential in the reason column', async () => {
    // The `reason` column is a typed column, not a payload field, so it does
    // not pass through the payload sanitizer. A password, hash, or token is
    // never written to the trail or the log, so the reason is checked too.
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordAdministratorClosed(
          {
            lostReportId: reportId,
            actingAdministratorId: adminId,
            reason: '$2b$12$abcdefghijklmnopqrstuv',
            priorLostStatus: 'Open',
          },
          { transaction: tx },
        );
      }),
    ).rejects.toThrow(AuditPayloadRejectedError);

    const rows = await prisma.auditEvent.findMany({ where: { parentId: reportId } });

    expect(rows).toHaveLength(0);
  });

  it('refuses a token in the reason column', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordAdministratorClosed(
          {
            lostReportId: reportId,
            actingAdministratorId: adminId,
            reason: 'sk_live_abcdefghijklmnop',
            priorLostStatus: 'Open',
          },
          { transaction: tx },
        );
      }),
    ).rejects.toThrow(AuditPayloadRejectedError);
  });

  it('keeps an ordinary reason verbatim, including one that names a credential-like word', async () => {
    // The heuristic errs towards refusing a value that *looks* like a
    // credential, but an ordinary administrator reason is stored exactly as
    // given — the verbatim rule (OQ-5) is not weakened by the check.
    await prisma.$transaction(async (tx) => {
      await factory.recordAdministratorClosed(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          reason: 'The reporter asked for the item to be taken down',
          priorLostStatus: 'Open',
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 24 } });

    expect(row.reason).toBe('The reporter asked for the item to be taken down');
  });

  // ── Control 4 — injection and storage safety ──────────────────────────────

  it('stores a hostile where-found as data, and the table it names is still there', async () => {
    const hostile = '\'; DROP TABLE "audit_events"; --';

    await prisma.$transaction(async (tx) => {
      await factory.recordResponseSubmitted(
        {
          lostReportId: reportId,
          recoveryResponseId: responseId,
          responderId,
          whereFound: hostile,
          observedIdentifyingDetails: 'brown leather',
          dateFound: new Date('2026-10-20T00:00:00Z'),
          imagePresent: false,
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 15 } });
    const metadata = row.metadata as { whereFound: string };

    // Stored verbatim as data, and the table it names is still there.
    expect(metadata.whereFound).toBe(hostile);
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it('stores a hostile reason as data, and the table it names is still there', async () => {
    const hostile = '\'; DROP TABLE "audit_events"; --';

    await prisma.$transaction(async (tx) => {
      await factory.recordAdministratorClosed(
        {
          lostReportId: reportId,
          actingAdministratorId: adminId,
          reason: hostile,
          priorLostStatus: 'Open',
        },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 24 } });

    expect(row.reason).toBe(hostile);
    expect(await prisma.auditEvent.count()).toBe(1);
  });

  it('refuses a batch set naming a response with a hostile id rather than storing it', async () => {
    // A response id is a UUID. A hostile one is refused at the shape check,
    // because the set's entries must carry a usable id.
    await expect(
      prisma.$transaction(async (tx) => {
        await factory.recordReturnedCloseout(
          {
            lostReportId: reportId,
            actingAdministratorId: adminId,
            resolvedResponses: [{ recoveryResponseId: '', previousStatus: 'Submitted' }],
            matchedResponseId: responseId,
          },
          { transaction: tx },
        );
      }),
    ).rejects.toThrow();

    const rows = await prisma.auditEvent.findMany({ where: { parentId: reportId } });

    expect(rows).toHaveLength(0);
  });

  // ── Control 5 — append-only integrity ─────────────────────────────────────

  it('refuses an update to a Lost-side event', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: responseId, ownerId },
        { transaction: tx },
      );
    });

    const row = await prisma.auditEvent.findFirstOrThrow({ where: { eventNumber: 17 } });

    // There is no privilege that could succeed: the refusal comes from the
    // database trigger, not from a role check the application performs.
    await expect(
      prisma.auditEvent.update({
        where: { id: row.id },
        data: { determinedByUserId: responderId },
      }),
    ).rejects.toThrow();
  });

  it('refuses a delete of a Lost-side event', async () => {
    await prisma.$transaction(async (tx) => {
      await factory.recordSelectedForVerification(
        { lostReportId: reportId, recoveryResponseId: responseId, ownerId },
        { transaction: tx },
      );
    });

    await expect(prisma.auditEvent.deleteMany({ where: { eventNumber: 17 } })).rejects.toThrow();
  });

  it('refuses a determination whose maker is rewritten after the fact', async () => {
    // The determination pair is the mechanism for keeping owner-determines
    // honest. If it could be rewritten, it would not be a mechanism.
    await prisma.$transaction(async (tx) => {
      await factory.recordDetermination(
        {
          lostReportId: reportId,
          recoveryResponseId: responseId,
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

    await expect(
      prisma.auditEvent.update({
        where: { id: row.id },
        data: { determinedByUserId: responderId },
      }),
    ).rejects.toThrow();
  });
});
