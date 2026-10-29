/**
 * The Vercel Blob adapter for the image quota reader.
 *
 * **The store is the authority on what it holds.** The quota applies to
 * *stored bytes*, and the only place that number exists is the store. A
 * counter this application maintained would drift the moment a delete
 * failed or a write was lost, and the drift would be in the direction that
 * matters: the counter would say "room left" while the store said "full".
 *
 * **The bytes are read from the store's own listing.** `list()` reports each
 * blob's `size`, and the reader sums them. That is a real measurement of
 * what is stored, taken at the moment the upload is being considered —
 * which is what `image-handling.md` §4 requires: the budget is compared
 * against the quota *"on every upload, before writing"*.
 *
 * **Listing is paginated, and the reader follows every page.** A store with
 * more blobs than one page holds would be under-counted, and an under-count
 * is a silent over-run — the exact failure ADR-4 forbids. So the reader
 * walks the cursor to the end.
 */

import { list } from '@vercel/blob';

import {
  ImageQuotaUnavailableError,
  type ImageQuotaReader,
} from '@/application/listings/ports/image-quota-reader';
import { quotaBytesFromEnv, type StorageQuotaState } from '@/domain/listings';

/** The blobs fetched per listing call. */
const PAGE_SIZE = 1000;

/** The Vercel Blob image quota reader. */
export class BlobImageQuotaReader implements ImageQuotaReader {
  /**
   * The current storage state.
   *
   * @throws {ImageQuotaUnavailableError} when the store's usage cannot be
   * read. **The caller refuses the upload** rather than proceeding on an
   * unknown usage — an unmeasured budget is not a budget with room left.
   */
  async readUsage(): Promise<StorageQuotaState> {
    let usedBytes = 0;
    let cursor: string | undefined;

    try {
      // **The loop, not a single call.** `list()` returns at most one page
      // and a cursor; a store with more blobs than the page size holds would
      // be under-counted without the walk.
      do {
        const page = await list({
          limit: PAGE_SIZE,
          ...(cursor === undefined ? {} : { cursor }),
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });

        for (const blob of page.blobs) {
          usedBytes += blob.size;
        }

        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor !== undefined);
    } catch (error) {
      throw new ImageQuotaUnavailableError(
        `The image storage usage could not be read: ${
          error instanceof Error ? error.message : 'the blob store did not respond'
        }`,
      );
    }

    return { usedBytes, quotaBytes: quotaBytesFromEnv(process.env) };
  }
}
