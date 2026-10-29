/**
 * The image quota reader port — the deployment's current storage usage.
 *
 * **A reader, not a writer.** The quota is *read* before every upload and
 * the decision is made by the domain. Nothing writes a byte count: the
 * bytes are wherever the blob store put them, and a counter this system
 * maintained would drift from the store the moment a delete failed or a
 * write was lost.
 *
 * **The bytes come from the store itself.** The store is the authority on
 * what it holds. A number this application derived from its own writes would
 * be an estimate of the truth, and the truth is what the ceiling applies to.
 */

import type { StorageQuotaState } from '@/domain/listings';

/** Reads the deployment's blob storage usage. */
export interface ImageQuotaReader {
  /**
   * The current storage state.
   *
   * @throws {ImageQuotaUnavailableError} when the store's usage cannot be
   * read. **The caller must refuse the upload** rather than proceed on an
   * unknown usage: an unmeasured budget is not a budget with room left, and
   * proceeding would be exactly the silent over-run ADR-4 forbids.
   */
  readUsage(): Promise<StorageQuotaState>;
}

/** The store's usage could not be read. */
export class ImageQuotaUnavailableError extends Error {
  constructor(message?: string) {
    super(message ?? 'The image storage usage could not be read.');
    this.name = new.target.name;
  }
}
