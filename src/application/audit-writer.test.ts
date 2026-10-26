import { describe, expect, it } from 'vitest';

import { AuditWriter } from './audit-writer';
import type { AuditEventRecord, TrailPage } from './ports/audit-event-repository';
import type { TransactionHandle } from './ports/transaction-handle';
import {
  AuditPayloadRejectedError,
  AuditWriteOutsideTransactionError,
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

describe('AuditWriter', () => {
  it('refuses to write outside the caller transaction', async () => {
    const writer = new AuditWriter(new RecordingRepository());

    await expect(
      writer.record(
        {
          eventType: 'claim.approved',
          parent: { parentType: 'claim', parentId: 'claim-1' },
          actor: { actorId: 'admin-1', actorRole: 'administrator' },
        },
        undefined as unknown as TransactionHandle,
      ),
    ).rejects.toThrow(AuditWriteOutsideTransactionError);
  });

  it('refuses a batch outside the caller transaction', async () => {
    const writer = new AuditWriter(new RecordingRepository());

    await expect(writer.recordBatch([], undefined as unknown as TransactionHandle)).rejects.toThrow(
      AuditWriteOutsideTransactionError,
    );
  });

  it('refuses a payload field the catalog does not name', async () => {
    const writer = new AuditWriter(new RecordingRepository());

    await expect(
      writer.record(
        {
          eventType: 'claim.approved',
          parent: { parentType: 'claim', parentId: 'claim-1' },
          actor: { actorId: 'admin-1', actorRole: 'administrator' },
          payload: { reason: 'because' },
        },
        transaction,
      ),
    ).rejects.toThrow(AuditPayloadRejectedError);
  });

  it('appends an event with its catalog number and a minted id', async () => {
    const repository = new RecordingRepository();
    const writer = new AuditWriter(repository);

    await writer.record(
      {
        eventType: 'claim.approved',
        parent: { parentType: 'claim', parentId: 'claim-1' },
        actor: { actorId: 'admin-1', actorRole: 'administrator' },
        occurredAt: new Date('2026-10-26T09:00:00Z'),
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.eventNumber).toBe(3);
    expect(appended?.eventType).toBe('claim.approved');
    expect(appended?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(appended?.occurredAt).toEqual(new Date('2026-10-26T09:00:00Z'));
  });

  it('appends a non-numbered record with no event number', async () => {
    const repository = new RecordingRepository();
    const writer = new AuditWriter(repository);

    await writer.recordNonNumbered(
      {
        eventType: 'member_profile.edited',
        parent: { parentType: 'account', parentId: 'account-1' },
        actor: { actorId: 'user-1', actorRole: 'member' },
        changedFields: { displayName: 'New name' },
        previousValues: { displayName: 'Old name' },
      },
      transaction,
    );

    expect(repository.appended[0]?.eventNumber).toBeNull();
    expect(repository.appended[0]?.changedFields).toEqual({ displayName: 'New name' });
    expect(repository.appended[0]?.previousValues).toEqual({ displayName: 'Old name' });
  });

  it('writes a batch in order', async () => {
    const repository = new RecordingRepository();
    const writer = new AuditWriter(repository);

    await writer.recordBatch(
      [
        {
          eventType: 'returned.confirmed_lost_default_receiver',
          parent: { parentType: 'report', parentId: 'report-1' },
          actor: { actorId: 'admin-1', actorRole: 'administrator' },
        },
        {
          eventType: 'report.lost_returned_child_response_resolution',
          parent: { parentType: 'report', parentId: 'report-1' },
          actor: { actorId: 'admin-1', actorRole: 'system' },
        },
        {
          eventType: 'recovery_response.completed_report_returned',
          parent: { parentType: 'recovery_response', parentId: 'rr-1' },
          actor: { actorId: 'admin-1', actorRole: 'system' },
        },
      ],
      transaction,
    );

    expect(repository.appended.map((event) => event.eventNumber)).toEqual([21, 26, 30]);
  });
});
