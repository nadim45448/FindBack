import { describe, expect, it } from 'vitest';

import { AuditWriter } from './audit-writer';
import { LostSideEventFactory } from './lost-side-event-factory';
import type { AuditEventRecord, TrailPage } from './ports/audit-event-repository';
import type { TransactionHandle } from './ports/transaction-handle';
import {
  AuditPayloadRejectedError,
  BatchResolutionError,
  DeterminationActorError,
  SystemActorCauseError,
  type AuditEvent,
} from '@/domain/audit';

/** A transaction handle that stands in for a Prisma transaction client. */
const transaction: TransactionHandle = { transaction: { marker: true } };

/** A repository that records what it was asked to append. */
class RecordingRepository {
  readonly appended: AuditEventRecord[] = [];

  async append(event: AuditEventRecord): Promise<AuditEvent> {
    this.appended.push(event);

    return {
      id: event.id,
      eventNumber: event.eventNumber,
      eventType: event.eventType,
      parent: {
        parentType: event.parentType as AuditEvent['parent']['parentType'],
        parentId: event.parentId,
      },
      actor: {
        actorId: event.actorId,
        actorRole: event.actorRole as AuditEvent['actor']['actorRole'],
        actingAdministratorId: event.actingAdministratorId,
        determinedByUserId: event.determinedByUserId,
        recordedByAdministratorId: event.recordedByAdministratorId,
      },
      payload: (event.metadata ?? {}) as Record<string, unknown>,
      reason: event.reason,
      previousValues: null,
      changedFields: null,
      occurredAt: event.occurredAt,
      createdAt: event.createdAt,
    };
  }

  async listByParent(): Promise<TrailPage> {
    return { events: [], nextCursor: null };
  }

  async listAll(): Promise<TrailPage> {
    return { events: [], nextCursor: null };
  }
}

/** A factory over a recording repository. */
function buildFactory(): { factory: LostSideEventFactory; repository: RecordingRepository } {
  const repository = new RecordingRepository();

  return { factory: new LostSideEventFactory(new AuditWriter(repository)), repository };
}

describe('LostSideEventFactory — the single-event methods', () => {
  it('records event 15 with the response id and the sensitive fields', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordResponseSubmitted(
      {
        lostReportId: 'report-1',
        recoveryResponseId: 'rr-1',
        responderId: 'sam-1',
        whereFound: 'On a bench outside the Main Library east entrance',
        observedIdentifyingDetails: 'brown leather, zip closure, scuffed on the back corner',
        dateFound: new Date('2026-10-20T00:00:00Z'),
        imagePresent: true,
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(15);
    expect(appended?.actorRole).toBe('member');
    expect(appended?.actorId).toBe('sam-1');
    expect(appended?.parentType).toBe('report');
    expect(appended?.parentId).toBe('report-1');
    expect(appended?.metadata).toMatchObject({
      recoveryResponseId: 'rr-1',
      whereFound: 'On a bench outside the Main Library east entrance',
      imagePresence: true,
    });
  });

  it('records event 16 under the thread message, not the response', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordThreadMessagePosted(
      {
        lostReportId: 'report-1',
        recoveryResponseId: 'rr-1',
        threadMessageId: 'msg-1',
        actorId: 'maya-1',
        actorRole: 'member',
        messageText: 'I will check the east entrance tomorrow.',
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(16);
    expect(appended?.parentType).toBe('recovery_response_thread_message');
    // The parent is the thread message, not the response.
    expect(appended?.parentId).toBe('msg-1');
    expect(appended?.metadata).toMatchObject({
      recoveryResponseId: 'rr-1',
      messageText: 'I will check the east entrance tomorrow.',
    });
  });

  it('records event 17 with the owner as the actor', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordSelectedForVerification(
      { lostReportId: 'report-1', recoveryResponseId: 'rr-1', ownerId: 'maya-1' },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(17);
    expect(appended?.actorId).toBe('maya-1');
    expect(appended?.actorRole).toBe('member');
  });

  it('records event 20 with the responder as the actor', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordResponseWithdrawn(
      { lostReportId: 'report-1', recoveryResponseId: 'rr-1', responderId: 'sam-1' },
      transaction,
    );

    expect(repository.appended[0]?.eventNumber).toBe(20);
  });

  it('records event 23 with the owner as the actor', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordLostWithdrawn(
      { lostReportId: 'report-1', ownerId: 'maya-1', priorLostStatus: 'Open' },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(23);
    expect(appended?.actorId).toBe('maya-1');
    expect(appended?.metadata).toMatchObject({ previousLostStatus: 'Open' });
  });

  it('records event 29 with the owner in actor_id and no administrator', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordToVerificationPending(
      { lostReportId: 'report-1', ownerId: 'maya-1', selectedResponseId: 'rr-1' },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(29);
    expect(appended?.actorRole).toBe('system');
    expect(appended?.actorId).toBe('maya-1');
    expect(appended?.actingAdministratorId).toBeNull();
  });
});

describe('LostSideEventFactory — the determination', () => {
  it('records event 18 with the two halves in two separate columns', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordDetermination(
      {
        lostReportId: 'report-1',
        recoveryResponseId: 'rr-1',
        determination: {
          determinedByUserId: 'maya-1',
          recordedByAdministratorId: 'riley-1',
        },
        lostReportOwnerId: 'maya-1',
        outcome: 'match_confirmed',
        verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(18);
    expect(appended?.determinedByUserId).toBe('maya-1');
    expect(appended?.recordedByAdministratorId).toBe('riley-1');
    // The acting administrator is the system actor performing the write.
    expect(appended?.actorId).toBe('riley-1');
    expect(appended?.actorRole).toBe('administrator');
    expect(appended?.actingAdministratorId).toBe('riley-1');
  });

  it('records event 19 for a Not a Match', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordDetermination(
      {
        lostReportId: 'report-1',
        recoveryResponseId: 'rr-1',
        determination: {
          determinedByUserId: 'maya-1',
          recordedByAdministratorId: 'riley-1',
        },
        lostReportOwnerId: 'maya-1',
        outcome: 'not_a_match',
        verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
      },
      transaction,
    );

    expect(repository.appended[0]?.eventNumber).toBe(19);
  });

  it('refuses a determination whose maker is not the report owner', async () => {
    const { factory, repository } = buildFactory();

    await expect(
      factory.recordDetermination(
        {
          lostReportId: 'report-1',
          recoveryResponseId: 'rr-1',
          determination: {
            determinedByUserId: 'someone-else',
            recordedByAdministratorId: 'riley-1',
          },
          lostReportOwnerId: 'maya-1',
          outcome: 'match_confirmed',
          verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
        },
        transaction,
      ),
    ).rejects.toThrow(DeterminationActorError);

    // Nothing was written — the refusal happens before the insert.
    expect(repository.appended).toHaveLength(0);
  });

  it('refuses a determination missing one half of the pair', async () => {
    const { factory } = buildFactory();

    await expect(
      factory.recordDetermination(
        {
          lostReportId: 'report-1',
          recoveryResponseId: 'rr-1',
          determination: { determinedByUserId: '', recordedByAdministratorId: 'riley-1' },
          lostReportOwnerId: 'maya-1',
          outcome: 'match_confirmed',
          verificationTimestamp: new Date('2026-10-22T10:00:00Z'),
        },
        transaction,
      ),
    ).rejects.toThrow(DeterminationActorError);
  });
});

describe('LostSideEventFactory — the returned handoff', () => {
  it('records event 21 for the default receiver', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordReturnedConfirmed(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        receiverId: 'maya-1',
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(21);
    expect(appended?.metadata).toMatchObject({ receiver: 'maya-1' });
  });

  it('records event 22 for a substitute receiver', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordReturnedConfirmed(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        substituteReceiverName: "Maya's colleague",
        authorizationAffirmation: 'Authorised in writing',
        relationship: 'Colleague',
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(22);
    expect(appended?.metadata).toMatchObject({
      substituteReceiverName: "Maya's colleague",
      relationship: 'Colleague',
    });
  });

  it('refuses a substitute return missing one of its three fields', async () => {
    const { factory } = buildFactory();

    await expect(
      factory.recordReturnedConfirmed(
        {
          lostReportId: 'report-1',
          actingAdministratorId: 'riley-1',
          substituteReceiverName: "Maya's colleague",
        },
        transaction,
      ),
    ).rejects.toThrow();
  });

  it('refuses a default return that names no receiver', async () => {
    const { factory } = buildFactory();

    await expect(
      factory.recordReturnedConfirmed(
        { lostReportId: 'report-1', actingAdministratorId: 'riley-1' },
        transaction,
      ),
    ).rejects.toThrow();
  });
});

describe('LostSideEventFactory — the closures', () => {
  it('records event 24 with its reason verbatim', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordAdministratorClosed(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        reason: 'another claim was approved for this item',
        priorLostStatus: 'Verification Pending',
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(24);
    expect(appended?.reason).toBe('another claim was approved for this item');
    expect(appended?.metadata).toMatchObject({ previousLostStatus: 'Verification Pending' });
  });

  it('refuses an administrator closure with no reason', async () => {
    const { factory } = buildFactory();

    await expect(
      factory.recordAdministratorClosed(
        {
          lostReportId: 'report-1',
          actingAdministratorId: 'riley-1',
          reason: '',
          priorLostStatus: 'Open',
        },
        transaction,
      ),
    ).rejects.toThrow();
  });

  it('records event 25 with the prior selected response and its status', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordExceptionalCancellation(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        exceptionalReason: 'Owner could not be contacted after three attempts',
        priorLostStatus: 'Verification Pending',
        priorSelectedResponseId: 'rr-1',
        priorSelectedResponseStatus: 'Match Confirmed',
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(25);
    expect(appended?.reason).toBe('Owner could not be contacted after three attempts');
    expect(appended?.metadata).toMatchObject({
      priorSelectedResponseId: 'rr-1',
      priorSelectedResponseStatus: 'Match Confirmed',
    });
  });

  it('refuses a prior status outside the two the PRD names', async () => {
    const { factory } = buildFactory();

    await expect(
      factory.recordLostWithdrawn(
        {
          lostReportId: 'report-1',
          ownerId: 'maya-1',
          priorLostStatus: 'Match Confirmed' as never,
        },
        transaction,
      ),
    ).rejects.toThrow();
  });
});

describe('LostSideEventFactory — the batch closeouts', () => {
  const resolvedResponses = [
    { recoveryResponseId: 'rr-2', previousStatus: 'Submitted' as const },
    { recoveryResponseId: 'rr-3', previousStatus: 'Selected for Verification' as const },
  ];

  it('writes events 26 and 30 together, in that order', async () => {
    const { factory, repository } = buildFactory();

    const pair = await factory.recordReturnedCloseout(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        resolvedResponses,
        matchedResponseId: 'rr-1',
      },
      transaction,
    );

    expect(repository.appended.map((event) => event.eventNumber)).toEqual([26, 30]);
    expect(pair.batch.eventNumber).toBe(26);
    expect(pair.individual.eventNumber).toBe(30);
  });

  it('records the child list verbatim, with each prior status', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordReturnedCloseout(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        resolvedResponses,
        matchedResponseId: 'rr-1',
      },
      transaction,
    );

    expect(repository.appended[0]?.metadata).toMatchObject({
      childResponses: [
        { recoveryResponseId: 'rr-2', previousStatus: 'Submitted' },
        { recoveryResponseId: 'rr-3', previousStatus: 'Selected for Verification' },
      ],
      matchedSelectedResponseId: 'rr-1',
    });
  });

  it('records the matched response as a system actor naming the administrator', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordReturnedCloseout(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        resolvedResponses,
        matchedResponseId: 'rr-1',
      },
      transaction,
    );

    for (const appended of repository.appended) {
      expect(appended.actorRole).toBe('system');
      expect(appended.actorId).toBe('riley-1');
      expect(appended.actingAdministratorId).toBe('riley-1');
    }
  });

  it('records the matched response status under event 30', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordReturnedCloseout(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        resolvedResponses,
        matchedResponseId: 'rr-1',
      },
      transaction,
    );

    expect(repository.appended[1]?.metadata).toMatchObject({
      recoveryResponseId: 'rr-1',
      newCanonicalStatus: 'Completed — Report Returned',
    });
  });

  it('refuses an empty child set and writes neither event', async () => {
    const { factory, repository } = buildFactory();

    await expect(
      factory.recordReturnedCloseout(
        {
          lostReportId: 'report-1',
          actingAdministratorId: 'riley-1',
          resolvedResponses: [],
          matchedResponseId: 'rr-1',
        },
        transaction,
      ),
    ).rejects.toThrow(BatchResolutionError);

    expect(repository.appended).toHaveLength(0);
  });

  it('records event 27 with the trigger role in its metadata', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordClosedCloseout(
      {
        lostReportId: 'report-1',
        cause: {
          actingAdministratorId: null,
          actingMemberId: 'maya-1',
          triggeredByRole: 'reporter',
        },
        resolvedResponses,
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(27);
    expect(appended?.actorRole).toBe('system');
    expect(appended?.actorId).toBe('maya-1');
    expect(appended?.actingAdministratorId).toBeNull();
    expect(appended?.metadata).toMatchObject({ triggeredByRole: 'reporter' });
  });

  it('refuses a closed closeout that names no causing human', async () => {
    const { factory } = buildFactory();

    await expect(
      factory.recordClosedCloseout(
        {
          lostReportId: 'report-1',
          cause: {
            actingAdministratorId: null,
            actingMemberId: null,
            triggeredByRole: 'reporter',
          },
          resolvedResponses,
        },
        transaction,
      ),
    ).rejects.toThrow(SystemActorCauseError);
  });

  it('refuses a closed closeout with an empty child set', async () => {
    const { factory } = buildFactory();

    await expect(
      factory.recordClosedCloseout(
        {
          lostReportId: 'report-1',
          cause: {
            actingAdministratorId: 'riley-1',
            actingMemberId: null,
            triggeredByRole: 'administrator',
          },
          resolvedResponses: [],
        },
        transaction,
      ),
    ).rejects.toThrow(BatchResolutionError);
  });
});

describe('LostSideEventFactory — the not-a-match return to open', () => {
  it('records event 28 as a system actor naming the administrator', async () => {
    const { factory, repository } = buildFactory();

    await factory.recordNotAMatchReturnToOpen(
      {
        lostReportId: 'report-1',
        actingAdministratorId: 'riley-1',
        priorSelectedResponseId: 'rr-1',
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(28);
    expect(appended?.actorRole).toBe('system');
    expect(appended?.actingAdministratorId).toBe('riley-1');
    expect(appended?.metadata).toMatchObject({ priorSelectedResponseId: 'rr-1' });
  });
});

describe('LostSideEventFactory — the catalog-aware guard still applies', () => {
  it('refuses a payload field the catalog does not name', async () => {
    const repository = new RecordingRepository();
    const writer = new AuditWriter(repository);

    await expect(
      writer.record(
        {
          eventType: 'recovery_response.selected_for_verification',
          parent: { parentType: 'report', parentId: 'report-1' },
          actor: { actorId: 'maya-1', actorRole: 'member' },
          payload: { notACatalogField: 'x' },
        },
        transaction,
      ),
    ).rejects.toThrow(AuditPayloadRejectedError);
  });
});
