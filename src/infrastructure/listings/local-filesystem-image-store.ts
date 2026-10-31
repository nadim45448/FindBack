import fs from 'node:fs/promises';
import path from 'node:path';

import {
  ImageStorageError,
  type ImageStore,
  type ImageUpload,
  type StoredImage,
} from '@/application/listings/ports/image-store';

import { validateImageUpload } from './image-upload-validation';

/** The extension each allowed content type is stored under. */
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const DEFAULT_BASE_DIR = path.join(process.cwd(), '.local', 'blob');

/**
 * Local disk image store for development when Vercel Blob is not configured.
 *
 * Paths match the blob adapter (`reports/{id}/{uuid}.ext`) so the database
 * references stay portable.
 */
export class LocalFilesystemImageStore implements ImageStore {
  constructor(private readonly baseDir: string = localBlobBaseDir(process.env)) {}

  async store(image: ImageUpload, prefix: string): Promise<StoredImage> {
    validateImageUpload(image);

    const extension = EXTENSION_BY_CONTENT_TYPE[image.contentType] ?? 'bin';
    const storedPath = `${prefix}/${crypto.randomUUID()}.${extension}`;
    const absolute = resolveStoragePath(this.baseDir, storedPath);

    try {
      await fs.mkdir(path.dirname(absolute), { recursive: true });
      await fs.writeFile(absolute, image.bytes);
    } catch (error) {
      throw new ImageStorageError(
        `The image could not be stored: ${
          error instanceof Error ? error.message : 'the local store did not respond'
        }`,
      );
    }

    return { path: storedPath };
  }

  async delete(storedPath: string): Promise<void> {
    const absolute = resolveStoragePath(this.baseDir, storedPath);

    try {
      await fs.unlink(absolute);
    } catch (error) {
      if (isMissingFile(error)) {
        return;
      }

      throw new ImageStorageError(
        `The image could not be deleted: ${
          error instanceof Error ? error.message : 'the local store did not respond'
        }`,
      );
    }
  }
}

/** Resolve the local blob directory from the environment. */
export function localBlobBaseDir(env: NodeJS.ProcessEnv): string {
  const configured = env.LOCAL_BLOB_STORAGE_DIR?.trim();

  return configured && configured.length > 0 ? configured : DEFAULT_BASE_DIR;
}

/** Resolve a stored path under the base directory, rejecting traversal. */
export function resolveStoragePath(baseDir: string, storedPath: string): string {
  const base = path.resolve(baseDir);
  const full = path.resolve(base, storedPath);

  if (full !== base && !full.startsWith(`${base}${path.sep}`)) {
    throw new ImageStorageError('Invalid image path.');
  }

  return full;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
