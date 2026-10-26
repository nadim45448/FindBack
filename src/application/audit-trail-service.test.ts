import { describe, expect, it } from 'vitest';

import { AuditTrailService, type ReadFailureContext } from './audit-trail-service';
import { AuditTrailReader, type TrailViewer } from './audit-trail-reader';
import { AuditReadRecorder } from './audit-read-recorder';
import type { AuditEventRepository, TrailPage } from './ports/audit-event-repository';
import type { AuditReadLog, AuditReadLogRepository } from './ports/audit-read-log-repository';
import type { TransactionFactory } from './ports/transaction-factory';
import type { TransactionHandle } from './ports/transaction-handle';
import { PermissionDeniedError, ValidationError } from '@/lib/errors';

/** A repository that records the calls it received. */
class SpyEventRepository implements AuditEventRepository {
  readonly listByParentCalls: unknown[][] = [];
  readonly listAllCalls: unknown[][] = [];

  constructor(private readonly page: TrailPage = { events: [], nextCursor: null }) {}

  async append(): Promise<never> {
    throw new Error('append is not used by the reader');
  }

  async listByParent(...args: unknown[]): Promise<TrailPage> {
    this.listByParentCalls.push(args);

    return this.page;
  }

  async listAll(...args: unknown[]): Promise<TrailPage> {
    this.listAllCalls.push(args);

    return this.page;
  }
}

/** A read-log repository whose append behaviour the test controls. */
class SpyReadLogRepository implements AuditReadLogRepository {
  readonly appended: Parameters<AuditReadLogRepository['append']>[0][] = [];
  attempts = 0;

  constructor(private readonly failures: unknown[] = []) {}

  async append(read: Parameters<AuditReadLogRepository['append']>[0]): Promise<AuditReadLog> {
    this.attempts += 1;

    const failure = this.failures[this.attempts - 1];

    if (failure) {
      throw failure;
    }

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

/** A transaction factory that counts how many transactions it opened. */
class CountingTransactionFactory implements TransactionFactory {
  transactions = 0;

  async run<T>(work: (transaction: TransactionHandle) => Promise<T>): Promise<T> {
    this.transactions += 1;

    return work({ transaction: { marker: true } });
  }
}

/** A logger that captures the failure lines. */
class CapturingLogger {
  readonly lines: ReadFailureContext[] = [];

  log(context: ReadFailureContext): void {
    this.lines.push(context);
  }
}

/** A Prisma-style transaction write conflict. */
const WRITE_CONFLICT = { code: 'P2034', message: 'Transaction failed due to a write conflict' };

/** The append-only trigger's refusal — permanent. */
const TRIGGER_REFUSAL = {
  code: 'P9999',
  meta: {
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: { kind: 'RestrictViolation', originalCode: '23001' },
    },
  },
};

const administrator: TrailViewer = { userId: 'admin-1', isAdministrator: true };
const member: TrailViewer = { userId: 'member-1', isAdministrator: false };

function buildService(
  events: SpyEventRepository,
  reads: SpyReadLogRepository,
  transactions: CountingTransactionFactory,
  logger?: CapturingLogger,
): AuditTrailService {
  return new AuditTrailService(
    new AuditTrailReader(events),
    new AuditReadRecorder(reads),
    transactions,
    logger,
  );
}

describe('AuditTrailService', () => {
  it('reads the trail and records the read', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const transactions = new CountingTransactionFactory();

    const service = buildService(events, reads, transactions);

    await service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' });

    expect(events.listByParentCalls).toHaveLength(1);
    expect(reads.appended).toHaveLength(1);

    const recorded = reads.appended[0];

    expect(recorded?.administratorId).toBe('admin-1');
    expect(recorded?.query).toBe('report:report-1');
    expect(recorded?.requestId).toBe('req-1');
  });

  it('refuses a non-administrator before the query runs', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const transactions = new CountingTransactionFactory();

    const service = buildService(events, reads, transactions);

    await expect(
      service.listByParent(member, 'report', 'report-1', {}, { requestId: 'req-1' }),
    ).rejects.toThrow(PermissionDeniedError);

    expect(events.listByParentCalls).toHaveLength(0);
    expect(reads.appended).toHaveLength(0);
    expect(transactions.transactions).toBe(0);
  });

  it('refuses a non-administrator reading the whole trail', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const service = buildService(events, reads, new CountingTransactionFactory());

    await expect(service.listAll(member, {}, { requestId: 'req-1' })).rejects.toThrow(
      PermissionDeniedError,
    );

    expect(events.listAllCalls).toHaveLength(0);
  });

  it('refuses an unknown parent type before the query runs', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const service = buildService(events, reads, new CountingTransactionFactory());

    await expect(
      service.listByParent(administrator, 'not_a_parent', 'id-1', {}, { requestId: 'req-1' }),
    ).rejects.toThrow(ValidationError);

    expect(events.listByParentCalls).toHaveLength(0);
  });

  it('records a read of an empty trail', async () => {
    const events = new SpyEventRepository({ events: [], nextCursor: null });
    const reads = new SpyReadLogRepository();
    const service = buildService(events, reads, new CountingTransactionFactory());

    await service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' });

    expect(reads.appended).toHaveLength(1);
    expect(reads.appended[0]?.resultCount).toBe(0);
  });

  it('caps the page size at 25', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const service = buildService(events, reads, new CountingTransactionFactory());

    await service.listByParent(
      administrator,
      'report',
      'report-1',
      { limit: 1000 },
      { requestId: 'req-1' },
    );

    expect(events.listByParentCalls[0]?.[3]).toBe(25);
  });

  it('passes the filters through to the query', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const service = buildService(events, reads, new CountingTransactionFactory());

    const filters = { eventTypes: ['claim.approved'], actorId: 'admin-1' };

    await service.listByParent(
      administrator,
      'report',
      'report-1',
      { filters },
      { requestId: 'req-1' },
    );

    expect(events.listByParentCalls[0]?.[4]).toEqual(filters);
  });

  it('records the filters that were applied', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const service = buildService(events, reads, new CountingTransactionFactory());

    await service.listByParent(
      administrator,
      'report',
      'report-1',
      { filters: { eventTypes: ['claim.approved'] } },
      { requestId: 'req-1' },
    );

    expect(reads.appended[0]?.filters).toEqual({
      eventTypes: ['claim.approved'],
      from: null,
      to: null,
      actorId: null,
    });
  });
});

describe('AuditTrailService — the read record is written after the query', () => {
  it('does not record a read when the query fails', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const service = buildService(events, reads, new CountingTransactionFactory());

    events.listByParent = async () => {
      throw new Error('the query failed');
    };

    await expect(
      service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' }),
    ).rejects.toThrow('the query failed');

    expect(reads.appended).toHaveLength(0);
  });
});

describe('AuditTrailService — ADR-7 durability', () => {
  it('retries a transient failure and succeeds', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository([WRITE_CONFLICT]);
    const service = buildService(events, reads, new CountingTransactionFactory());

    const result = await service.listByParent(
      administrator,
      'report',
      'report-1',
      {},
      { requestId: 'req-1' },
    );

    expect(result.events).toEqual([]);
    expect(reads.attempts).toBe(2);
    expect(reads.appended).toHaveLength(1);
  });

  it('retries at most three times', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository([WRITE_CONFLICT, WRITE_CONFLICT, WRITE_CONFLICT]);
    const logger = new CapturingLogger();
    const service = buildService(events, reads, new CountingTransactionFactory(), logger);

    await service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' });

    expect(reads.attempts).toBe(3);
    expect(logger.lines).toHaveLength(1);
  });

  it('returns the trail even when the read record cannot be written', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository([WRITE_CONFLICT, WRITE_CONFLICT, WRITE_CONFLICT]);
    const logger = new CapturingLogger();
    const service = buildService(events, reads, new CountingTransactionFactory(), logger);

    const result = await service.listByParent(
      administrator,
      'report',
      'report-1',
      {},
      { requestId: 'req-1' },
    );

    // The read succeeded and is returned.
    expect(result.events).toEqual([]);
    // The failure is logged, not swallowed silently.
    expect(logger.lines[0]?.outcome).toBe('error');
    expect(logger.lines[0]?.action).toBe('audit.read_record_failed');
    expect(logger.lines[0]?.requestId).toBe('req-1');
  });

  it('does not retry a permanent failure', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository([TRIGGER_REFUSAL]);
    const logger = new CapturingLogger();
    const service = buildService(events, reads, new CountingTransactionFactory(), logger);

    await service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' });

    expect(reads.attempts).toBe(1);
    expect(logger.lines).toHaveLength(1);
  });

  it('writes the same id on every attempt, so a retry cannot duplicate the record', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository([WRITE_CONFLICT]);
    const service = buildService(events, reads, new CountingTransactionFactory());

    await service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' });

    expect(reads.appended).toHaveLength(1);
    expect(reads.appended[0]?.id).toBeTruthy();
  });

  it('opens a fresh transaction for each attempt', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository([WRITE_CONFLICT]);
    const transactions = new CountingTransactionFactory();
    const service = buildService(events, reads, transactions);

    await service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' });

    // A failed statement aborts its PostgreSQL transaction, so each attempt
    // needs its own.
    expect(transactions.transactions).toBe(2);
  });

  it('opens exactly one transaction for a successful read record', async () => {
    const events = new SpyEventRepository();
    const reads = new SpyReadLogRepository();
    const transactions = new CountingTransactionFactory();
    const service = buildService(events, reads, transactions);

    await service.listByParent(administrator, 'report', 'report-1', {}, { requestId: 'req-1' });

    expect(transactions.transactions).toBe(1);
  });
});
