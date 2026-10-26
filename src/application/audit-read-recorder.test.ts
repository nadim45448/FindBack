import { describe, expect, it } from 'vitest';

import { AuditReadRecorder } from './audit-read-recorder';
import type { AuditReadLog, AuditReadLogRepository } from './ports/audit-read-log-repository';
import type { TransactionHandle } from './ports/transaction-handle';

/** A repository that records what it was asked to append. */
class RecordingRepository {
  readonly appended: Parameters<AuditReadLogRepository['append']>[0][] = [];

  async append(read: Parameters<AuditReadLogRepository['append']>[0]): Promise<AuditReadLog> {
    this.appended.push(read);

    return {
      id: read.id,
      administratorId: read.administratorId,
      query: read.query,
      filters: read.filters,
      resultCount: read.resultCount,
      requestId: read.requestId,
      readAt: read.readAt,
    };
  }

  async listByAdministrator(): Promise<readonly AuditReadLog[]> {
    return [];
  }
}

const transaction: TransactionHandle = { transaction: { marker: true } };

describe('AuditReadRecorder', () => {
  it('records the administrator, query, filters, result count, and timestamp', async () => {
    const repository = new RecordingRepository();
    const recorder = new AuditReadRecorder(repository);

    await recorder.record(
      {
        administratorId: 'admin-1',
        query: 'claim.approved',
        filters: { eventType: 'claim.approved' },
        resultCount: 25,
        requestId: 'req-1',
      },
      transaction,
    );

    const appended = repository.appended[0];

    expect(appended?.administratorId).toBe('admin-1');
    expect(appended?.query).toBe('claim.approved');
    expect(appended?.filters).toEqual({ eventType: 'claim.approved' });
    expect(appended?.resultCount).toBe(25);
    expect(appended?.requestId).toBe('req-1');
    expect(appended?.readAt).toBeInstanceOf(Date);
  });

  it('records a read with no query, filters, or request id', async () => {
    const repository = new RecordingRepository();
    const recorder = new AuditReadRecorder(repository);

    await recorder.record({ administratorId: 'admin-1', resultCount: 0 }, transaction);

    const appended = repository.appended[0];

    expect(appended?.query).toBeNull();
    expect(appended?.filters).toBeNull();
    expect(appended?.requestId).toBeNull();
  });

  it('refuses to record outside a transaction', async () => {
    const repository = new RecordingRepository();
    const recorder = new AuditReadRecorder(repository);

    await expect(
      recorder.record(
        { id: 'read-1', administratorId: 'admin-1', resultCount: 0 },
        undefined as unknown as TransactionHandle,
      ),
    ).rejects.toThrow(/transaction/);
  });
});
