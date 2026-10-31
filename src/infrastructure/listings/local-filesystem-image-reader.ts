import fs from 'node:fs/promises';

import {
  ImageNotFoundError,
  ImageReadError,
  type ImageReader,
  type RetrievedImage,
} from '@/application/listings/ports/image-reader';
import { detectImageContentType } from '@/domain/listings';

import { localBlobBaseDir, resolveStoragePath } from './local-filesystem-image-store';

const UNREADABLE_TYPE = 'application/x-findback-not-an-image';

/** Reads report images from the local development filesystem store. */
export class LocalFilesystemImageReader implements ImageReader {
  constructor(private readonly baseDir: string = localBlobBaseDir(process.env)) {}

  async read(storedPath: string): Promise<RetrievedImage> {
    let absolute: string;

    try {
      absolute = resolveStoragePath(this.baseDir, storedPath);
    } catch {
      throw new ImageReadError('The image could not be read: invalid path.');
    }

    let bytes: Buffer;

    try {
      bytes = await fs.readFile(absolute);
    } catch (error) {
      if (isMissingFile(error)) {
        throw new ImageNotFoundError();
      }

      throw new ImageReadError(
        `The image could not be read: ${
          error instanceof Error ? error.message : 'the local store did not respond'
        }`,
      );
    }

    return { bytes, contentType: detectImageContentType(bytes) ?? UNREADABLE_TYPE };
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
