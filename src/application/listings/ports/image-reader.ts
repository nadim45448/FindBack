/**
 * The image reader port — reading a stored image's bytes.
 *
 * **A separate port from the image store.** The store writes; this reads.
 * They are different capabilities with different failure modes — a write
 * fails differently from a read — and a read that returns the wrong bytes
 * is a privacy leak, not a storage problem.
 *
 * **The read is always private.** `access: 'private'` is passed on every
 * read, exactly as it is on every write: the store's access mode is
 * immutable after creation (ADR-2), so a read that asked for public access
 * would be asking for something the store cannot grant.
 *
 * **The path is the only handle.** No URL is ever passed to a read — a URL
 * would be a reference the caller could point at a different store, and
 * trusting one is how a cross-store read gets in.
 */

/** A stored image's bytes, ready to be streamed. */
export interface RetrievedImage {
  /** The image's bytes. */
  readonly bytes: Buffer;
  /**
   * The content type to serve the image as.
   *
   * **Server-set, from the bytes** — never from the upload's declared type
   * and never from the blob's stored metadata. The implementation derives
   * it from the image's own magic-byte signature.
   *
   * **The type is a plain `string` here, not the allowlist's union type.**
   * The reader detects what the bytes *are*, and that answer may be a type
   * the allowlist does not contain — a blob stored without passing
   * validation, or one that was never an image at all. The reader must be
   * able to *report* that, and the delivery service must be the one that
   * refuses it. A reader that could only return an allowlisted type would
   * have to either throw (losing the distinction between a missing image
   * and a corrupt one) or coerce it (serving an image under a type it does
   * not have).
   */
  readonly contentType: string;
}

/** Reads stored images. */
export interface ImageReader {
  /**
   * Read a stored image's bytes.
   *
   * @throws {ImageNotFoundError} when no image is stored at the path.
   * @throws {ImageReadError} when the store fails. **Never a partial or a
   * wrong-type body** (image-handling §5) — a half-read image would be
   * served as if it were whole.
   */
  read(path: string): Promise<RetrievedImage>;
}

/** No image is stored at the path. */
export class ImageNotFoundError extends Error {
  constructor(message?: string) {
    super(message ?? 'That image could not be found.');
    this.name = new.target.name;
  }
}

/** The store failed while reading. */
export class ImageReadError extends Error {
  constructor(message?: string) {
    super(message ?? 'The image could not be read.');
    this.name = new.target.name;
  }
}
