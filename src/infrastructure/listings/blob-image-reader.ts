/**
 * The Vercel Blob adapter for the image reader.
 *
 * **The read is always private.** `access: 'private'` is passed on every
 * read, exactly as it is on every write: the store's access mode is
 * immutable after creation (ADR-2), so a read that asked for public access
 * would be asking for something the store cannot grant.
 *
 * **The type comes from the bytes, not from the blob's metadata.** The blob
 * store records a `contentType` when the blob is written — but that value is
 * metadata, and metadata is what a client influences. `image-handling.md` §3
 * requires the served `Content-Type` to be server-set from a server-side
 * allowlist, *"never from user input or the blob's stored metadata"*. So the
 * reader sniffs the magic bytes it just read, using the **same** function
 * the store used to validate the upload. One implementation point: the type
 * an image was accepted as and the type it is served as cannot drift apart.
 *
 * **A blob whose bytes are not an allowed image is an unreadable image.**
 * The reader reports the detected type — including a type outside the
 * allowlist — and the delivery service refuses it. The reader does not
 * decide; it reports.
 *
 * **The whole blob is buffered before it is returned.** `image-handling.md`
 * §5 forbids a partial body: *"Blob read fails mid-stream | 500 with a
 * neutral message; never a partial or wrong-type body"*. Buffering first
 * means the caller either gets every byte or gets an error — there is no
 * third outcome in which half an image reaches a browser.
 */

import { get } from '@vercel/blob';

import {
  ImageNotFoundError,
  ImageReadError,
  type ImageReader,
  type RetrievedImage,
} from '@/application/listings/ports/image-reader';
import { detectImageContentType } from '@/domain/listings';

/** The Vercel Blob image reader. */
export class BlobImageReader implements ImageReader {
  /**
   * Read a stored image's bytes.
   *
   * @throws {ImageNotFoundError} when no blob is stored at the path.
   * @throws {ImageReadError} when the store fails, or when the bytes could
   * not be read in full.
   */
  async read(path: string): Promise<RetrievedImage> {
    let result: Awaited<ReturnType<typeof get>>;

    try {
      result = await get(path, {
        access: 'private',
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    } catch (error) {
      // A missing blob and a failing store are different failures, and the
      // caller answers them differently: a missing blob is a not-found, and
      // a failing store is a 500. The blob SDK distinguishes them by error
      // name, so the distinction is preserved rather than flattened.
      if (isNotFound(error)) {
        throw new ImageNotFoundError();
      }

      throw new ImageReadError(
        `The image could not be read: ${
          error instanceof Error ? error.message : 'the blob store did not respond'
        }`,
      );
    }

    if (!result) {
      throw new ImageNotFoundError();
    }

    // **A 304 is a failed read, not an empty image.** The SDK returns a null
    // stream when the store answers "not modified" — which only happens
    // against a conditional request, and this reader never makes one. A
    // null stream here means the store answered something this reader did
    // not ask for, and serving an empty body under an image's content type
    // would be exactly the "partial or wrong-type body" that
    // `image-handling.md` §5 forbids.
    if (result.statusCode !== 200 || result.stream === null) {
      throw new ImageReadError('The image could not be read: the store returned no body.');
    }

    const bytes = await this.collect(result.stream);

    return { bytes, contentType: detectImageContentType(bytes) ?? UNREADABLE_TYPE };
  }

  /**
   * The whole stream, or nothing.
   *
   * **A failed read is an error, not a short body.** If the stream errors
   * part-way, the bytes collected so far are discarded — a partial image
   * served as if it were whole would be a broken response that no header
   * could explain (image-handling §5).
   */
  private async collect(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
    const chunks: Uint8Array[] = [];

    try {
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    } catch (error) {
      throw new ImageReadError(
        `The image could not be read in full: ${
          error instanceof Error ? error.message : 'the blob store stream failed'
        }`,
      );
    }

    return Buffer.concat(chunks);
  }
}

/**
 * The type reported for bytes that are not a recognised image.
 *
 * **A sentinel, not a real content type.** It is deliberately not in the
 * server-side allowlist, so the delivery service refuses it — and it is
 * deliberately not a plausible media type either, so it cannot be served
 * under any circumstance. The value is a statement about the bytes: *this
 * is not an image we can serve*.
 */
const UNREADABLE_TYPE = 'application/x-findback-not-an-image';

/**
 * Whether the error means "no blob at that path".
 *
 * The blob SDK raises `BlobNotFoundError` for a missing blob and other
 * error types for a failing store. The check is by **name**, not by
 * `instanceof`, because the SDK's classes are not guaranteed to be stable
 * across versions and a class identity check that quietly stops matching
 * would turn a missing image into a 500.
 */
function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.name === 'BlobNotFoundError';
}
