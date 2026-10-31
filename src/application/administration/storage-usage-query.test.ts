/**
 * The storage-usage query's suite — image-handling §4.
 *
 * ## What this suite asserts
 *
 * **That the authorisation is upstream.** A non-administrator is refused
 * *before* the quota reader runs — so no byte count, no percentage, and no
 * signal about how full the budget is reaches them.
 *
 * **That a failed read is a fact, not a crash.** The blob store may be
 * unreachable. The query reports that as an `error` and a `null` usage — it
 * never throws, and it never invents a number.
 *
 * **That the view is the domain's view.** The query's job is orchestration
 * only; the arithmetic lives in `buildStorageUsageView`, so the warning the
 * administrator reads and the refusal an uploader meets cannot drift.
 */

import { describe, expect, it, vi } from 'vitest';

import { PermissionDeniedError } from '@/lib/errors';

import type { ImageQuotaReader } from '@/application/listings/ports/image-quota-reader';

import { StorageUsageQuery, STORAGE_USAGE_READ_FAILED } from './storage-usage-query';

/** The quota the view is built against. */
const QUOTA = 1024 * 1024 * 1024;

/** The administrator viewer. */
const ADMIN = {
  userId: 'ffffffff-0000-0000-0000-00000000000f',
  isAdministrator: true,
};

/** The member viewer. */
const MEMBER = {
  userId: 'ffffffff-0000-0000-0000-00000000000e',
  isAdministrator: false,
};

/** A reader that reports a fixed state. */
function readerReporting(usedBytes: number, quotaBytes = QUOTA): ImageQuotaReader {
  return {
    readUsage: async () => ({ usedBytes, quotaBytes }),
  };
}

describe('the storage usage query', () => {
  it('refuses a non-administrator before the reader runs', async () => {
    const quota = { readUsage: vi.fn(async () => ({ usedBytes: 0, quotaBytes: QUOTA })) };

    await expect(new StorageUsageQuery(quota).read(MEMBER)).rejects.toThrow(
      PermissionDeniedError,
    );

    // **The refusal is upstream of the read,** so no byte count leaks.
    expect(quota.readUsage).not.toHaveBeenCalled();
  });

  it('reads the budget for an administrator', async () => {
    const result = await new StorageUsageQuery(
      readerReporting(400 * 1024 * 1024),
    ).read(ADMIN);

    expect(result.error).toBeUndefined();
    expect(result.usage?.usedBytes).toBe(400 * 1024 * 1024);
    expect(result.usage?.quotaBytes).toBe(QUOTA);
    expect(result.usage?.remainingBytes).toBe(QUOTA - 400 * 1024 * 1024);
  });

  it('builds the domain’s view of the budget', async () => {
    const result = await new StorageUsageQuery(readerReporting(QUOTA)).read(ADMIN);

    // **The refusal is the write path's, and this page says so.** A budget
    // that is spent must read as refused here too — otherwise the
    // administrator sees "fine" while every upload is being refused.
    expect(result.usage?.status).toBe('refused');
    expect(result.usage?.needsAttention).toBe(true);
  });

  it('warns at the warning band', async () => {
    const result = await new StorageUsageQuery(
      readerReporting(Math.ceil(QUOTA * 0.7)),
    ).read(ADMIN);

    expect(result.usage?.status).toBe('warning');
    expect(result.usage?.needsAttention).toBe(true);
  });

  it('reports a failed read as an error rather than throwing', async () => {
    const quota: ImageQuotaReader = {
      readUsage: async () => {
        throw new Error('the blob store is unreachable');
      },
    };

    const result = await new StorageUsageQuery(quota).read(ADMIN);

    // **A failed read is not a crash.** The page renders its calm error
    // state; the administrator is not shown a stack trace.
    expect(result.usage).toBeNull();
    expect(result.error).toBe(STORAGE_USAGE_READ_FAILED);
  });

  it('never reports a number it did not read', async () => {
    const quota: ImageQuotaReader = {
      readUsage: async () => {
        throw new Error('the blob store is unreachable');
      },
    };

    const result = await new StorageUsageQuery(quota).read(ADMIN);

    // **Zero is a fact about the budget.** A failed read is not a fact, so
    // the usage is absent rather than zero.
    expect(result.usage).not.toMatchObject({ usedBytes: 0 });
  });
});
