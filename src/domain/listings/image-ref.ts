/**
 * The report's image reference — a **blob path**, never a URL.
 *
 * **An FR-37 Sensitive Field.** Optional.
 *
 * **Why a path and not a URL.** A bare blob URL is not a reference that can
 * be authorised. ADR-2 requires the image to be served through an
 * authenticated route handler that resolves the requester, loads the owning
 * entity, applies the FR-39 matrix for that entity, and *only then* calls the
 * blob read. That handler needs a **path** to hand to `get(path, { access:
 * 'private' })`; a URL would either be re-parsed or trusted, and a trusted
 * URL is how a path-traversal or cross-store read gets in.
 *
 * The store's access mode is immutable after creation, so the reference is
 * private for the life of the blob.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/** A reference to a stored image. A Sensitive Field. */
export interface ImageRef {
  /** The blob path, relative to the private store's root. */
  readonly path: string;
}

/**
 * Build an image reference.
 *
 * @throws {ValidationError} when the path is empty or is a URL rather than a
 * path. A URL is rejected rather than accepted-and-normalised, because a
 * caller that has a URL has misunderstood the contract, and silently
 * stripping the scheme would hide that.
 */
export function createImageRef(path: string): ImageRef {
  const trimmed = path.trim();

  if (trimmed.length === 0) {
    throw new ValidationError('image', 'The image reference must not be empty.');
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) || trimmed.startsWith('/')) {
    throw new ValidationError('image', 'The image reference must be a blob path, not a URL.');
  }

  return { path: trimmed };
}
