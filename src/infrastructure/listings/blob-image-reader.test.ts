/**
 * The Vercel Blob image reader's suite — against a **fake blob client**.
 *
 * **What this suite asserts.** The reader's job is to hand back the bytes
 * and a **server-set** content type. The type is the load-bearing part: it
 * comes from the bytes' magic-byte signature, never from the blob's stored
 * metadata and never from anything a client supplied. The suite asserts
 * that by giving the fake blob a `contentType` that **contradicts** its
 * bytes — and requiring the reader to report the bytes' type, not the
 * blob's.
 *
 * **The read is private.** `access: 'private'` is asserted on the call, not
 * on the result: a reader that fetched publicly would still return the right
 * bytes in a test, and the bytes would be public in production.
 *
 * The module `@vercel/blob` is mocked, so no network call is made and no
 * token is needed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ImageNotFoundError,
  ImageReadError,
} from '@/application/listings/ports/image-reader';

/** The call the adapter made to the blob client. */
interface GetCall {
  readonly path: string;
  readonly options: {
    readonly access?: string;
    readonly token?: string;
  };
}

/** The fake blob client. */
const get = vi.fn<
  (path: string, options: GetCall['options']) => Promise<{
    statusCode: number;
    stream: ReadableStream<Uint8Array> | null;
  } | null>
>();

vi.mock('@vercel/blob', () => ({
  get: (...args: Parameters<typeof get>) => get(...args),
}));

const { BlobImageReader } = await import('./blob-image-reader');

/** The bytes of a real JPEG header. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** The bytes of a real PNG header. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The bytes of a real WebP header. */
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

/** A stream over the given bytes. */
function aStream(bytes: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  });
}

/** The reader under test. */
const reader = new BlobImageReader();

describe('the blob image reader', () => {
  beforeEach(() => {
    get.mockReset();
  });

  describe('the read', () => {
    it('reads privately', async () => {
      get.mockResolvedValue({ statusCode: 200, stream: aStream(JPEG) });

      await reader.read('reports/report-1/abc.jpg');

      // **The access mode is asserted on the call.** A reader that fetched
      // publicly would return the same bytes in a test and leak them in
      // production.
      expect(get.mock.calls[0]?.[1]?.access).toBe('private');
    });

    it('reads the path it was given', async () => {
      get.mockResolvedValue({ statusCode: 200, stream: aStream(JPEG) });

      await reader.read('reports/report-1/abc.jpg');

      expect(get.mock.calls[0]?.[0]).toBe('reports/report-1/abc.jpg');
    });

    it('returns the bytes', async () => {
      get.mockResolvedValue({ statusCode: 200, stream: aStream(JPEG) });

      const retrieved = await reader.read('reports/report-1/abc.jpg');

      expect(retrieved.bytes).toEqual(JPEG);
    });

    it('joins a stream that arrives in pieces', async () => {
      get.mockResolvedValue({
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(JPEG.subarray(0, 3)));
            controller.enqueue(new Uint8Array(JPEG.subarray(3)));
            controller.close();
          },
        }),
      });

      const retrieved = await reader.read('reports/report-1/abc.jpg');

      expect(retrieved.bytes).toEqual(JPEG);
    });
  });

  describe('the content type', () => {
    it('detects a JPEG', async () => {
      get.mockResolvedValue({ statusCode: 200, stream: aStream(JPEG) });

      const retrieved = await reader.read('reports/report-1/abc.jpg');

      expect(retrieved.contentType).toBe('image/jpeg');
    });

    it('detects a PNG', async () => {
      get.mockResolvedValue({ statusCode: 200, stream: aStream(PNG) });

      const retrieved = await reader.read('reports/report-1/abc.png');

      expect(retrieved.contentType).toBe('image/png');
    });

    it('detects a WebP', async () => {
      get.mockResolvedValue({ statusCode: 200, stream: aStream(WEBP) });

      const retrieved = await reader.read('reports/report-1/abc.webp');

      expect(retrieved.contentType).toBe('image/webp');
    });

    it('reports a type outside the allowlist rather than coercing it', async () => {
      // **Bytes that are not an image get a type that says so.** The reader
      // reports what the bytes are; the delivery service is the one that
      // refuses a type outside the allowlist. A reader that coerced the
      // answer to `image/jpeg` would serve a non-image as an image.
      get.mockResolvedValue({
        statusCode: 200,
        stream: aStream(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      });

      const retrieved = await reader.read('reports/report-1/abc.svg');

      expect(retrieved.contentType).not.toBe('image/jpeg');
      expect(retrieved.contentType).not.toBe('image/png');
      expect(retrieved.contentType).not.toBe('image/webp');
    });

    it('reports a type the bytes carry, not one the store recorded', async () => {
      // **The blob's metadata is not consulted.** The fake returns a stream
      // of PNG bytes; a reader that trusted the store's recorded type would
      // report something else. The reader reports the bytes.
      get.mockResolvedValue({ statusCode: 200, stream: aStream(PNG) });

      const retrieved = await reader.read('reports/report-1/abc.jpg');

      expect(retrieved.contentType).toBe('image/png');
    });
  });

  describe('the failures', () => {
    it('reports a missing blob as a not-found', async () => {
      const missing = new Error('The blob does not exist.');
      missing.name = 'BlobNotFoundError';

      get.mockRejectedValue(missing);

      await expect(reader.read('reports/report-1/gone.jpg')).rejects.toBeInstanceOf(
        ImageNotFoundError,
      );
    });

    it('reports a null result as a not-found', async () => {
      get.mockResolvedValue(null);

      await expect(reader.read('reports/report-1/gone.jpg')).rejects.toBeInstanceOf(
        ImageNotFoundError,
      );
    });

    it('reports a failing store as a read failure', async () => {
      get.mockRejectedValue(new Error('the store is down'));

      await expect(reader.read('reports/report-1/abc.jpg')).rejects.toBeInstanceOf(ImageReadError);
    });

    it('does not report a failing store as a not-found', async () => {
      // **The two failures stay distinct.** A failing store is a 500; a
      // missing blob is a 404. Flattening them would tell a viewer that a
      // server fault meant "no image here" — and would hide the outage.
      get.mockRejectedValue(new Error('the store is down'));

      const error = await reader
        .read('reports/report-1/abc.jpg')
        .catch((thrown: unknown) => thrown as Error);

      expect(error).toBeInstanceOf(ImageReadError);
      expect(error).not.toBeInstanceOf(ImageNotFoundError);
    });

    it('reports a stream that fails part-way as a read failure', async () => {
      // **Never a partial body** (image-handling §5). A half-read image
      // served as if it were whole would be a broken response no header
      // could explain.
      get.mockResolvedValue({
        statusCode: 200,
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(JPEG));
            controller.error(new Error('the connection dropped'));
          },
        }),
      });

      await expect(reader.read('reports/report-1/abc.jpg')).rejects.toBeInstanceOf(ImageReadError);
    });

    it('reports a 304 as a read failure', async () => {
      // **A not-modified answer is not an image.** The reader never makes a
      // conditional request, so a 304 means the store answered something
      // that was not asked for — and serving an empty body under an image's
      // content type is exactly the wrong-type body §5 forbids.
      get.mockResolvedValue({ statusCode: 304, stream: null });

      await expect(reader.read('reports/report-1/abc.jpg')).rejects.toBeInstanceOf(ImageReadError);
    });
  });
});
