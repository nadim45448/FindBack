import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { ImageUpload } from '@/application/listings/ports/image-store';
import { aJpeg } from '@/test/image-bytes';

import { LocalFilesystemImageReader } from './local-filesystem-image-reader';
import { LocalFilesystemImageStore } from './local-filesystem-image-store';

const JPEG = aJpeg(800, 600);

function anUpload(bytes: Buffer, contentType: string): ImageUpload {
  return { bytes, contentType };
}

describe('the local filesystem image store', () => {
  let baseDir = '';

  afterEach(async () => {
    if (baseDir) {
      await fs.rm(baseDir, { recursive: true, force: true });
      baseDir = '';
    }
  });

  it('stores and reads an image under the configured base directory', async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'findback-blob-'));
    const store = new LocalFilesystemImageStore(baseDir);
    const reader = new LocalFilesystemImageReader(baseDir);

    const stored = await store.store(anUpload(JPEG, 'image/jpeg'), 'reports/test-id');

    expect(stored.path.startsWith('reports/test-id/')).toBe(true);
    expect(stored.path.endsWith('.jpg')).toBe(true);

    const retrieved = await reader.read(stored.path);

    expect(retrieved.contentType).toBe('image/jpeg');
    expect(retrieved.bytes.equals(JPEG)).toBe(true);

    await store.delete(stored.path);
    await expect(reader.read(stored.path)).rejects.toMatchObject({ name: 'ImageNotFoundError' });
  });
});
