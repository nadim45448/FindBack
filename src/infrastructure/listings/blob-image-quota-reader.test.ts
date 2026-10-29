/**
 * The Vercel Blob image quota reader's suite — against a **fake blob
 * client**.
 *
 * **What this suite asserts.** The reader's job is to report what the store
 * actually holds. Two properties matter:
 *
 * - **The bytes are summed across every page.** A store with more blobs
 *   than one page holds would be under-counted without the walk, and an
 *   under-count is a silent over-run — the exact failure ADR-4 forbids.
 * - **A failing store is an unavailable usage, not a usage of zero.** A
 *   reader that reported `0` on a failure would tell the domain there is
 *   room for an infinite upload.
 *
 * The module `@vercel/blob` is mocked, so no network call is made and no
 * token is needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ImageQuotaUnavailableError,
} from '@/application/listings/ports/image-quota-reader';

/** One page of the fake listing. */
interface Page {
  readonly blobs: ReadonlyArray<{ readonly pathname: string; readonly size: number }>;
  readonly cursor?: string;
  readonly hasMore: boolean;
}

/** The fake blob client. */
const list = vi.fn<(options: { limit?: number; cursor?: string }) => Promise<Page>>();

vi.mock('@vercel/blob', () => ({
  list: (...args: Parameters<typeof list>) => list(...args),
}));

const { BlobImageQuotaReader } = await import('./blob-image-quota-reader');

/** The reader under test. */
const reader = new BlobImageQuotaReader();

describe('the blob image quota reader', () => {
  beforeEach(() => {
    list.mockReset();
  });

  describe('the usage', () => {
    it('sums the blobs on one page', async () => {
      list.mockResolvedValue({
        blobs: [
          { pathname: 'reports/a.jpg', size: 100 },
          { pathname: 'reports/b.jpg', size: 250 },
        ],
        hasMore: false,
      });

      const usage = await reader.readUsage();

      expect(usage.usedBytes).toBe(350);
    });

    it('follows the cursor to the end', async () => {
      // **A single page would under-count.** The reader walks the cursor,
      // because an under-count is a silent over-run.
      list
        .mockResolvedValueOnce({
          blobs: [{ pathname: 'reports/a.jpg', size: 100 }],
          cursor: 'page-2',
          hasMore: true,
        })
        .mockResolvedValueOnce({
          blobs: [{ pathname: 'reports/b.jpg', size: 250 }],
          hasMore: false,
        });

      const usage = await reader.readUsage();

      expect(usage.usedBytes).toBe(350);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('passes the cursor to the second call', async () => {
      list
        .mockResolvedValueOnce({
          blobs: [],
          cursor: 'page-2',
          hasMore: true,
        })
        .mockResolvedValueOnce({ blobs: [], hasMore: false });

      await reader.readUsage();

      expect(list.mock.calls[1]?.[0]?.cursor).toBe('page-2');
    });

    it('reports zero for an empty store', async () => {
      list.mockResolvedValue({ blobs: [], hasMore: false });

      const usage = await reader.readUsage();

      expect(usage.usedBytes).toBe(0);
    });

    it('reports the configured quota', async () => {
      list.mockResolvedValue({ blobs: [], hasMore: false });

      const usage = await reader.readUsage();

      // The ceiling is configuration, and the default is the verified
      // free-tier limit the deployment is actually on.
      expect(usage.quotaBytes).toBe(1024 * 1024 * 1024);
    });
  });

  describe('the failures', () => {
    it('reports a failing store as an unavailable usage', async () => {
      list.mockRejectedValue(new Error('the store is down'));

      await expect(reader.readUsage()).rejects.toBeInstanceOf(ImageQuotaUnavailableError);
    });

    it('does not report a failing store as zero usage', async () => {
      // **Zero would say "there is room for anything."** The caller must
      // refuse the upload rather than proceed on an unmeasured budget.
      list.mockRejectedValue(new Error('the store is down'));

      const error = await reader
        .readUsage()
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(ImageQuotaUnavailableError);
      expect((error as Error).message).not.toContain('usedBytes');
    });
  });
});
