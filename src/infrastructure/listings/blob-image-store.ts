/**
 * The Vercel Blob adapter for the image store.
 *
 * **Private storage, always** (ADR-2). `access: 'private'` is passed on every
 * upload. The access mode is **immutable after the store's creation** — it
 * cannot be flipped later — so this is a one-way decision and it is made
 * here, once, for every image the system ever stores.
 *
 * **`addRandomSuffix: true` — blobs are immutable.** An upload never
 * overwrites. FR-53's image replacement uploads a *new* blob and deletes the
 * old one, so a pathname never changes what it refers to.
 *
 * **The filename is discarded entirely.** `image-handling.md` §1: the
 * original filename is never used in a pathname. The pathname is built from
 * the prefix and a random suffix only, so a hostile filename cannot escape
 * the prefix directory or influence the stored path.
 *
 * **The reference is a path, never a URL.** Vercel Blob's `put` returns a
 * URL; the domain stores the *path* portion. The delivery route resolves the
 * requester, applies the FR-39 matrix, and only then reads the blob — so a
 * stored URL would be a bypass waiting to happen, and would also leak the
 * store's hostname into the database.
 *
 * **A store failure and a validation failure are different errors.** A
 * validation failure means nothing was stored and the member's submission is
 * wrong; a store failure means the infrastructure is unavailable and no
 * report is created (image-handling §5). They are distinguished so the route
 * can answer 400 and 500 respectively.
 */

import { del, put } from '@vercel/blob';
import {
  ImageRejectedError,
  ImageStorageError,
  type ImageStore,
  type ImageUpload,
  type StoredImage,
} from '@/application/listings/ports/image-store';
import {
  detectImageContentType,
  SERVABLE_IMAGE_CONTENT_TYPES,
} from '@/domain/listings';

/** The declared byte ceiling (FR-8): 5 MB. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * The content types the PRD allows (FR-8).
 *
 * **The same allowlist the delivery path serves from** — one list, in the
 * domain, read by both sides. The store writes only what the reader may
 * serve, so the two can never disagree about what is acceptable.
 */
const ALLOWED_CONTENT_TYPES = new Set<string>(SERVABLE_IMAGE_CONTENT_TYPES);

/** The extension each allowed content type is stored under. */
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** The Vercel Blob image store. */
export class BlobImageStore implements ImageStore {
  /**
   * Store an image and return its path.
   *
   * @throws {ImageRejectedError} when the image fails validation — nothing is
   * stored.
   * @throws {ImageStorageError} when the store fails. **No report is created**
   * (image-handling §5).
   */
  async store(image: ImageUpload, prefix: string): Promise<StoredImage> {
    this.validate(image);

    const extension = EXTENSION_BY_CONTENT_TYPE[image.contentType] ?? 'bin';

    // The pathname is built from the prefix and a random suffix only. The
    // original filename is never part of it.
    const pathname = `${prefix}/${crypto.randomUUID()}.${extension}`;

    try {
      const result = await put(pathname, image.bytes, {
        access: 'private',
        addRandomSuffix: true,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        contentType: image.contentType,
      });

      return { path: toPath(result.url) };
    } catch (error) {
      throw new ImageStorageError(
        `The image could not be stored: ${
          error instanceof Error ? error.message : 'the blob store did not respond'
        }`,
      );
    }
  }

  /**
   * Delete a stored image.
   *
   * A delete failure is **thrown**, not swallowed — the caller records it
   * for retry rather than leaking the blob (image-handling §5). The
   * compensating path in `ReportCreationService` catches it deliberately.
   */
  async delete(path: string): Promise<void> {
    try {
      await del(path, { token: process.env.BLOB_READ_WRITE_TOKEN });
    } catch (error) {
      throw new ImageStorageError(
        `The image could not be deleted: ${
          error instanceof Error ? error.message : 'the blob store did not respond'
        }`,
      );
    }
  }

  /**
   * The server-side validation (image-handling §1).
   *
   * Everything here runs **before** the bytes are handed to the store:
   *
   * - the declared content type is one of the three FR-8 types;
   * - the **actual** byte length is within the ceiling — the declared
   *   `Content-Length` is never trusted;
   * - the magic bytes **match the declared type** — a `.jpg` that is
   *   actually an HTML payload is rejected;
   * - the filename is discarded.
   */
  private validate(image: ImageUpload): void {
    if (!ALLOWED_CONTENT_TYPES.has(image.contentType)) {
      throw new ImageRejectedError(
        'That image type is not accepted. Use a JPEG, PNG, or WebP image.',
      );
    }

    if (image.bytes.length === 0) {
      throw new ImageRejectedError('That image is empty.');
    }

    if (image.bytes.length > MAX_BYTES) {
      throw new ImageRejectedError('That image is larger than 5 MB.');
    }

    const detected = detectImageContentType(image.bytes);

    if (detected === null) {
      throw new ImageRejectedError(
        'That file is not a JPEG, PNG, or WebP image.',
      );
    }

    if (detected !== image.contentType) {
      throw new ImageRejectedError(
        'That file does not match its declared image type.',
      );
    }
  }
}

/**
 * The path portion of a blob URL.
 *
 * Vercel Blob's URLs are `https://<store-id>.private.blob.vercel-storage.com/<path>`.
 * The store's hostname is **not** part of the stored reference — only the
 * path is, so the database does not accumulate a dependency on one store's
 * hostname and the reference cannot be used to fetch the blob directly.
 */
export function toPath(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//, '');
  const slash = withoutScheme.indexOf('/');

  if (slash === -1) {
    // No path at all — the URL is malformed. The path is the whole
    // reference, so there is nothing to keep.
    throw new ImageStorageError('The blob store returned a URL with no path.');
  }

  return withoutScheme.slice(slash + 1);
}
