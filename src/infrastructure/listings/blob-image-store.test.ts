/**
 * The Vercel Blob image store's suite — against a **fake blob client**.
 *
 * **What this suite asserts.** The blob store's job is to make three
 * promises the PRD makes about images: the blob is **private**, it is
 * **immutable**, and the reference the domain stores is a **path, never a
 * URL**. Each is asserted on the *call the adapter makes*, not on the value
 * it returns — a return-value assertion would pass even if the adapter had
 * uploaded with `access: 'public'`.
 *
 * **The validation happens before the store is touched.** Every rejection
 * test asserts that the fake was **never called**. A validation that ran
 * after the upload would store a hostile file and then refuse it, leaving
 * the payload in the store.
 *
 * The module `@vercel/blob` is mocked, so no network call is made and no
 * token is needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ImageRejectedError,
  ImageStorageError,
  type ImageUpload,
} from '@/application/listings/ports/image-store';

/** The call the adapter made to the blob client. */
interface PutCall {
  readonly pathname: string;
  readonly bytes: Buffer;
  readonly options: {
    readonly access?: string;
    readonly addRandomSuffix?: boolean;
    readonly token?: string;
    readonly contentType?: string;
  };
}

/** The fake blob client. */
const put = vi.fn<(pathname: string, bytes: Buffer, options: PutCall['options']) => Promise<{ url: string }>>();
const del = vi.fn<(path: string, options: { token?: string }) => Promise<void>>();

vi.mock('@vercel/blob', () => ({
  put: (...args: Parameters<typeof put>) => put(...args),
  del: (...args: Parameters<typeof del>) => del(...args),
}));

const { BlobImageStore, toPath } = await import('./blob-image-store');

/** The bytes of a real JPEG header. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** The bytes of a real PNG header. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The bytes of a real WebP header. */
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

/** The fake's URL for a pathname. */
function urlFor(pathname: string): string {
  return `https://store-id.private.blob.vercel-storage.com/${pathname}`;
}

describe('the blob image store', () => {
  beforeEach(() => {
    put.mockReset();
    del.mockReset();

    put.mockImplementation(async (pathname: string) => ({ url: urlFor(pathname) }));
    del.mockImplementation(async () => undefined);
  });

  /** An upload of the given bytes and type. */
  function anUpload(bytes: Buffer, contentType: string): ImageUpload {
    return { bytes, contentType };
  }

  describe('the store call', () => {
    it('stores the blob privately, always', async () => {
      await new BlobImageStore().store(anUpload(JPEG, 'image/jpeg'), 'reports');

      // ADR-2: the access mode is immutable after the store's creation, so
      // this one-way decision is made on every single upload.
      expect(put).toHaveBeenCalledTimes(1);
      expect(put.mock.calls[0]?.[2]).toMatchObject({ access: 'private' });
    });

    it('stores the blob with a random suffix, so an upload never overwrites', async () => {
      await new BlobImageStore().store(anUpload(JPEG, 'image/jpeg'), 'reports');

      expect(put.mock.calls[0]?.[2]).toMatchObject({ addRandomSuffix: true });
    });

    it('declares the content type to the store', async () => {
      await new BlobImageStore().store(anUpload(PNG, 'image/png'), 'reports');

      expect(put.mock.calls[0]?.[2]).toMatchObject({ contentType: 'image/png' });
    });

    it('passes the bytes through unchanged', async () => {
      await new BlobImageStore().store(anUpload(JPEG, 'image/jpeg'), 'reports');

      expect(put.mock.calls[0]?.[1].equals(JPEG)).toBe(true);
    });

    it('puts the blob under the prefix it was given', async () => {
      await new BlobImageStore().store(anUpload(JPEG, 'image/jpeg'), 'reports');

      expect(put.mock.calls[0]?.[0]).toMatch(/^reports\//);
    });

    it('gives two uploads of the same file two different pathnames', async () => {
      const store = new BlobImageStore();

      const first = await store.store(anUpload(JPEG, 'image/jpeg'), 'reports');
      const second = await store.store(anUpload(JPEG, 'image/jpeg'), 'reports');

      // The blobs are immutable: a pathname never changes what it refers
      // to, so a second upload must not reuse the first's path.
      expect(first.path).not.toBe(second.path);
    });

    it('discards the original filename entirely', async () => {
      const store = new BlobImageStore();

      const stored = await store.store(
        {
          bytes: JPEG,
          contentType: 'image/jpeg',
          originalFilename: '../../etc/passwd.png',
        },
        'reports',
      );

      // A hostile filename cannot escape the prefix or influence the path.
      expect(stored.path).toMatch(/^reports\/[0-9a-f-]{36}\.jpg$/);
      expect(stored.path).not.toContain('passwd');
      expect(stored.path).not.toContain('..');
    });

    it('uses the extension that matches the content type', async () => {
      const store = new BlobImageStore();

      const jpeg = await store.store(anUpload(JPEG, 'image/jpeg'), 'reports');
      const png = await store.store(anUpload(PNG, 'image/png'), 'reports');
      const webp = await store.store(anUpload(WEBP, 'image/webp'), 'reports');

      expect(jpeg.path.endsWith('.jpg')).toBe(true);
      expect(png.path.endsWith('.png')).toBe(true);
      expect(webp.path.endsWith('.webp')).toBe(true);
    });
  });

  describe('the reference', () => {
    it('returns a path, never a URL', async () => {
      const stored = await new BlobImageStore().store(anUpload(JPEG, 'image/jpeg'), 'reports');

      // ADR-2: the domain stores a path, so the database does not
      // accumulate a dependency on one store's hostname.
      expect(stored.path).not.toContain('http');
      expect(stored.path).not.toContain('vercel-storage.com');
      expect(stored.path).toMatch(/^reports\//);
    });

    it('strips the scheme and the host from the store URL', () => {
      expect(
        toPath('https://store-id.private.blob.vercel-storage.com/reports/abc.jpg'),
      ).toBe('reports/abc.jpg');
    });

    it('refuses a URL with no path at all', () => {
      // The path is the whole reference, so a URL with no path leaves
      // nothing to keep.
      expect(() => toPath('https://store-id.private.blob.vercel-storage.com')).toThrow(
        ImageStorageError,
      );
    });
  });

  describe('the validation, which happens before the store is touched', () => {
    it('refuses a content type the PRD does not name', async () => {
      await expect(
        new BlobImageStore().store(anUpload(JPEG, 'image/gif'), 'reports'),
      ).rejects.toThrow(ImageRejectedError);

      // Nothing was stored — the validation runs first.
      expect(put).not.toHaveBeenCalled();
    });

    it('refuses an empty image', async () => {
      await expect(
        new BlobImageStore().store(anUpload(Buffer.alloc(0), 'image/jpeg'), 'reports'),
      ).rejects.toThrow(ImageRejectedError);

      expect(put).not.toHaveBeenCalled();
    });

    it('refuses an image larger than 5 MB', async () => {
      const oversized = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]);

      await expect(
        new BlobImageStore().store(anUpload(oversized, 'image/jpeg'), 'reports'),
      ).rejects.toThrow(ImageRejectedError);

      expect(put).not.toHaveBeenCalled();
    });

    it('accepts an image of exactly 5 MB', async () => {
      const exact = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024 - JPEG.length)]);

      const stored = await new BlobImageStore().store(anUpload(exact, 'image/jpeg'), 'reports');

      expect(stored.path).toMatch(/^reports\//);
      expect(put).toHaveBeenCalledTimes(1);
    });

    it('refuses a file whose bytes match no image signature', async () => {
      const html = Buffer.from('<html><script>alert(1)</script></html>', 'utf8');

      await expect(
        new BlobImageStore().store(anUpload(html, 'image/jpeg'), 'reports'),
      ).rejects.toThrow(ImageRejectedError);

      expect(put).not.toHaveBeenCalled();
    });

    it('refuses a file whose bytes disagree with its declared type', async () => {
      // The declared type is the member's claim; the magic bytes are the
      // fact. A PNG declared as a JPEG is refused.
      await expect(
        new BlobImageStore().store(anUpload(PNG, 'image/jpeg'), 'reports'),
      ).rejects.toThrow(ImageRejectedError);

      expect(put).not.toHaveBeenCalled();
    });

    it('accepts every one of the three allowed types', async () => {
      const store = new BlobImageStore();

      await store.store(anUpload(JPEG, 'image/jpeg'), 'reports');
      await store.store(anUpload(PNG, 'image/png'), 'reports');
      await store.store(anUpload(WEBP, 'image/webp'), 'reports');

      expect(put).toHaveBeenCalledTimes(3);
    });
  });

  describe('the failures', () => {
    it('raises a storage error when the store fails', async () => {
      put.mockRejectedValueOnce(new Error('the blob store did not respond'));

      // A store failure is **not** a rejection: the member's submission was
      // fine, and the infrastructure was not.
      await expect(
        new BlobImageStore().store(anUpload(JPEG, 'image/jpeg'), 'reports'),
      ).rejects.toThrow(ImageStorageError);
    });

    it('raises a storage error when the delete fails', async () => {
      del.mockRejectedValueOnce(new Error('the blob store did not respond'));

      // The delete is thrown, not swallowed — the caller records it for
      // retry rather than leaking the blob.
      await expect(new BlobImageStore().delete('reports/abc.jpg')).rejects.toThrow(
        ImageStorageError,
      );
    });

    it('deletes the blob by its path', async () => {
      await new BlobImageStore().delete('reports/abc.jpg');

      expect(del).toHaveBeenCalledTimes(1);
      expect(del.mock.calls[0]?.[0]).toBe('reports/abc.jpg');
    });

    it('deletes successfully when the store is healthy', async () => {
      await expect(new BlobImageStore().delete('reports/abc.jpg')).resolves.toBeUndefined();
    });
  });
});
