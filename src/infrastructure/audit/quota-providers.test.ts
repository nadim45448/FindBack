/**
 * Tests for the quota-usage providers and the error-description helper.
 *
 * These are infrastructure modules whose behaviour is only partly reachable
 * through the application layer, so they are tested directly.
 */

import { describe, expect, it } from 'vitest';

import {
  DatabaseQuotaProvider,
  VercelBlobQuotaProvider,
  VercelPlatformQuotaProvider,
  type BlobQuotaClient,
} from './quota-usage-providers';
import { StaticQuotaLimitProvider } from './static-quota-limit-provider';
import { describeDatabaseError } from '../db/describe-database-error';

describe('StaticQuotaLimitProvider', () => {
  const provider = new StaticQuotaLimitProvider();

  it('returns the limit for a resource', async () => {
    const limit = await provider.limitFor('blob_storage_bytes');

    expect(limit?.limitAmount).toBe(1_000_000_000n);
    expect(limit?.refuses).toBe(true);
  });

  it('returns undefined for an unknown resource', async () => {
    expect(await provider.limitFor('nonsense' as never)).toBeUndefined();
  });

  it('returns every limit', async () => {
    const limits = await provider.allLimits();

    expect(limits.length).toBeGreaterThan(0);
    expect(limits.map((limit) => limit.resource)).toContain('function_invocations');
  });
});

describe('VercelPlatformQuotaProvider', () => {
  it('reports the usage the injected fetcher returns', async () => {
    const provider = new VercelPlatformQuotaProvider(async () => 42n);

    const usage = await provider.usage('function_invocations');

    expect(usage.usedAmount).toBe(42n);
    expect(usage.resource).toBe('function_invocations');
  });
});

describe('VercelBlobQuotaProvider', () => {
  it('sums the bytes across every page', async () => {
    const client: BlobQuotaClient = {
      async list(options) {
        if (!options?.cursor) {
          return {
            blobs: [
              { pathname: 'a.jpg', size: 100 },
              { pathname: 'b.jpg', size: 250 },
            ],
            hasMore: true,
            cursor: 'page-2',
          };
        }

        return {
          blobs: [{ pathname: 'c.jpg', size: 50 }],
          hasMore: false,
        };
      },
    };

    const provider = new VercelBlobQuotaProvider(client);
    const usage = await provider.usage('blob_storage_bytes');

    expect(usage.usedAmount).toBe(400n);
  });

  it('reports zero for an empty store', async () => {
    const client: BlobQuotaClient = {
      async list() {
        return { blobs: [] };
      },
    };

    const provider = new VercelBlobQuotaProvider(client);

    expect((await provider.usage('blob_storage_bytes')).usedAmount).toBe(0n);
  });

  it('refuses to report usage for a resource it does not measure', async () => {
    const client: BlobQuotaClient = {
      async list() {
        return { blobs: [] };
      },
    };

    const provider = new VercelBlobQuotaProvider(client);

    await expect(provider.usage('function_invocations')).rejects.toThrow();
  });
});

describe('DatabaseQuotaProvider', () => {
  it('refuses to report usage for a resource the database does not measure', async () => {
    const provider = new DatabaseQuotaProvider();

    await expect(provider.usage('blob_storage_bytes')).rejects.toThrow();
  });
});

describe('describeDatabaseError', () => {
  it('prefers the driver adapter original message', () => {
    const error = {
      message:
        '\nInvalid `prisma.auditEvent.update()` invocation:\n\nForeign key constraint violated',
      code: 'P2003',
      meta: {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            originalCode: '23001',
            originalMessage: 'audit table "AuditEvent" is append-only',
            kind: 'RestrictViolation',
          },
        },
      },
    };

    expect(describeDatabaseError(error)).toBe(
      'audit table "AuditEvent" is append-only (SQLSTATE 23001)',
    );
  });

  it('falls back to the error message when there is no driver cause', () => {
    const error = new Error('\nInvalid `prisma.auditEvent.create()` invocation:\n\nCheck failed');

    // Prisma's invocation banner is skipped, because it describes the call
    // rather than the failure.
    expect(describeDatabaseError(error)).toBe('Check failed');
  });

  it('handles a non-error value', () => {
    expect(describeDatabaseError('something went wrong')).toBe('something went wrong');
  });
});
