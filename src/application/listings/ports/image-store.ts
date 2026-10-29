/**
 * The image store port.
 *
 * **A port, not a repository.** The blob store is not a database and does not
 * join the PostgreSQL transaction, so it cannot be given a
 * `TransactionHandle`. Calling it a repository would imply an atomicity that
 * does not exist.
 *
 * **The write is compensating, not atomic.** The blob is stored first, the
 * report row is written only if the blob was stored, and if the row write
 * fails the blob is deleted. That is the honest description — a blob store
 * cannot participate in a PostgreSQL transaction, and pretending otherwise
 * would be a lie about atomicity. The rule the member sees is the PRD's own
 * — *a failed image means no report* — and the ordering delivers it.
 *
 * **The reference is a path, never a URL** (ADR-2). The delivery route
 * resolves the requester, loads the owning entity, applies the FR-39 matrix,
 * and only then reads the blob.
 *
 * Pure — no I/O, no framework imports.
 */

/** An image to store. */
export interface ImageUpload {
  /** The bytes to store. */
  readonly bytes: Buffer;
  /** The content type, as validated server-side. */
  readonly contentType: string;
  /** The original filename. **Discarded** — never used in a pathname. */
  readonly originalFilename?: string;
}

/** A stored image's reference. */
export interface StoredImage {
  /** The blob path. Never a URL. */
  readonly path: string;
}

/** Stores and deletes report images. */
export interface ImageStore {
  /**
   * Store an image and return its reference.
   *
   * @throws {ImageRejectedError} when the image fails validation — nothing is
   * stored.
   * @throws {ImageStorageError} when the store fails. **The owning record is
   * not created** (image-handling §5): the upload is part of the write, not a
   * follow-up step.
   */
  store(image: ImageUpload, prefix: string): Promise<StoredImage>;

  /**
   * Delete a stored image.
   *
   * Used by the **compensating** write when the report row could not be
   * written, and by FR-10's hard delete. The delete is issued **after** the
   * database side has settled — a delete inside a transaction that is about
   * to roll back would be undone by that rollback and orphan the blob.
   *
   * A failed delete is recorded for retry rather than silently leaked
   * (image-handling §5). Retries are idempotent by pathname.
   */
  delete(path: string): Promise<void>;
}

/** The image failed validation. Nothing was stored. */
export class ImageRejectedError extends Error {
  constructor(message?: string) {
    super(message ?? 'That image could not be accepted.');
    this.name = new.target.name;
  }
}

/** The image store failed. The owning record is not created. */
export class ImageStorageError extends Error {
  constructor(message?: string) {
    super(message ?? 'The image could not be stored.');
    this.name = new.target.name;
  }
}
