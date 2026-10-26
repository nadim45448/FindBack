import { describe, expect, it } from 'vitest';

import { classifyWriteFailure, READ_RECORD_MAX_ATTEMPTS } from './classify-write-failure';

/** A Prisma error carrying a driver-adapter cause, as the pg adapter produces. */
function adapterError(kind: string, originalCode?: string): unknown {
  return {
    message: `prisma error`,
    code: 'P9999',
    meta: {
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          kind,
          ...(originalCode ? { originalCode } : {}),
          originalMessage: 'database said no',
        },
      },
    },
  };
}

describe('classifyWriteFailure', () => {
  it('treats a Prisma transaction write conflict as retryable', () => {
    expect(classifyWriteFailure({ code: 'P2034', message: 'write conflict' })).toBe('retryable');
  });

  it('treats a socket-level failure as retryable', () => {
    expect(classifyWriteFailure({ code: 'ECONNRESET', message: 'reset' })).toBe('retryable');
    expect(classifyWriteFailure({ code: 'ETIMEDOUT', message: 'timeout' })).toBe('retryable');
    expect(classifyWriteFailure({ code: 'ECONNREFUSED', message: 'refused' })).toBe('retryable');
  });

  it('treats a transient adapter kind as retryable', () => {
    expect(classifyWriteFailure(adapterError('ConnectionClosed'))).toBe('retryable');
    expect(classifyWriteFailure(adapterError('SocketTimeout'))).toBe('retryable');
    expect(classifyWriteFailure(adapterError('DatabaseNotReachable'))).toBe('retryable');
    expect(classifyWriteFailure(adapterError('TooManyConnections'))).toBe('retryable');
    expect(classifyWriteFailure(adapterError('TransactionWriteConflict'))).toBe('retryable');
  });

  it('treats a PostgreSQL serialization failure or deadlock as retryable', () => {
    expect(classifyWriteFailure(adapterError('postgres', '40001'))).toBe('retryable');
    expect(classifyWriteFailure(adapterError('postgres', '40P01'))).toBe('retryable');
  });

  it("treats the append-only trigger's refusal as permanent", () => {
    // SQLSTATE 23001 — the trigger that makes the audit tables append-only.
    expect(classifyWriteFailure(adapterError('RestrictViolation', '23001'))).toBe('permanent');
  });

  it('treats a constraint violation as permanent', () => {
    expect(classifyWriteFailure(adapterError('UniqueConstraintViolation', '23505'))).toBe(
      'permanent',
    );
    expect(classifyWriteFailure(adapterError('NotNullConstraintViolation', '23502'))).toBe(
      'permanent',
    );
    expect(classifyWriteFailure(adapterError('ForeignKeyConstraintViolation', '23503'))).toBe(
      'permanent',
    );
  });

  it('treats an out-of-range value as permanent', () => {
    expect(classifyWriteFailure(adapterError('ValueOutOfRange', '22003'))).toBe('permanent');
  });

  it('treats an unrecognised error as permanent, so a defect is not retried', () => {
    expect(classifyWriteFailure(new Error('something went wrong'))).toBe('permanent');
    expect(classifyWriteFailure('a string')).toBe('permanent');
    expect(classifyWriteFailure(undefined)).toBe('permanent');
    expect(classifyWriteFailure({})).toBe('permanent');
  });

  it('treats a non-transient PostgreSQL code as permanent', () => {
    expect(classifyWriteFailure(adapterError('postgres', '42P01'))).toBe('permanent');
  });
});

describe('the attempt bound', () => {
  it('is three attempts — one initial plus two retries', () => {
    expect(READ_RECORD_MAX_ATTEMPTS).toBe(3);
  });
});
