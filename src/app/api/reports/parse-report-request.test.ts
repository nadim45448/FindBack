/**
 * The report request parser's multipart suite.
 *
 * ## What this suite asserts
 *
 * **That the byte count comes from the stream, not from the claim.**
 * A client declares a size in `Content-Length` and in the part's own
 * metadata; both are *claims*. The rule in image-handling §1 is that the
 * image is measured by counting its bytes, so a part that lies about its
 * size is refused on the strength of the bytes actually read — never
 * truncated, never accepted on the strength of the declaration.
 *
 * **That the image part is required, and that the filename is carried but
 * never trusted.** The multipart parser's job is to hand the bytes over;
 * deciding whether a filename may be used is the blob store's job, and it
 * decides it by discarding it.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  MalformedRequestError,
  MAX_IMAGE_BYTES,
  parseMultipartBody,
  readImagePart,
} from './parse-report-request';

/** A minimal JPEG's magic bytes. */
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);

/**
 * A `File` whose declared size lies.
 *
 * **The `size` property is overridden**, because `File` computes it from the
 * bytes it is given. A part that reports one size and carries another is
 * exactly the shape of a client trying to get past a limit — and the
 * parser's second check exists for it.
 */
function aFileThatUnderReportsItsSize(bytes: ArrayBuffer, declaredSize: number): File {
  const file = new File([bytes], 'photo.jpg', { type: 'image/jpeg' });

  Object.defineProperty(file, 'size', { value: declaredSize, configurable: true });

  return file;
}

/** An `ArrayBuffer` of the given length, filled with a byte pattern. */
function bytesOf(length: number): ArrayBuffer {
  const buffer = new ArrayBuffer(length);

  new Uint8Array(buffer).fill(0x41);

  return buffer;
}

/** A multipart request carrying an image part and the report's fields. */
function multipartRequest(image: File | string): Request {
  const form = new FormData();

  form.set('type', 'Lost');
  form.set('name', 'Brown leather wallet');
  form.set('category', 'Wallet');
  form.set('description', 'A brown leather wallet with a folded receipt inside.');
  form.set('date', '2026-10-28');
  form.set('campusArea', 'library');

  form.set('image', image);

  return new Request('http://localhost/api/reports', {
    method: 'POST',
    body: form,
  });
}

describe('the image part reader', () => {
  it('reads a well-formed image', async () => {
    const image = await readImagePart(new File([JPEG_BYTES], 'photo.jpg', { type: 'image/jpeg' }));

    expect(image?.bytes).toEqual(JPEG_BYTES);
    expect(image?.contentType).toBe('image/jpeg');
  });

  it('counts the bytes it actually read, not the size the part claims', async () => {
    // **The claim is 10 bytes; the truth is more.** A parser that trusted
    // the claim would read the whole oversized body into memory and then
    // store it — which is exactly the over-run the 5 MB ceiling exists to
    // prevent.
    const oversized = bytesOf(MAX_IMAGE_BYTES + 1);

    const file = aFileThatUnderReportsItsSize(oversized, 10);

    await expect(readImagePart(file)).rejects.toThrow(ValidationError);
  });

  it('gives the FR-8 copy when the real byte length is over the ceiling', async () => {
    const oversized = bytesOf(MAX_IMAGE_BYTES + 1);

    const file = aFileThatUnderReportsItsSize(oversized, 10);

    await expect(readImagePart(file)).rejects.toThrow('That image is larger than 5 MB.');
  });

  it('refuses a part whose declared size is already over the ceiling', async () => {
    const oversized = bytesOf(MAX_IMAGE_BYTES + 1);

    const file = new File([oversized], 'photo.jpg', { type: 'image/jpeg' });

    await expect(readImagePart(file)).rejects.toThrow('That image is larger than 5 MB.');
  });

  it('refuses a content type the PRD does not name', async () => {
    const svg = new File([Buffer.from('<svg/>')], 'photo.svg', { type: 'image/svg+xml' });

    await expect(readImagePart(svg)).rejects.toThrow(ValidationError);
  });

  it('carries the filename without ever using it', async () => {
    const image = await readImagePart(
      new File([JPEG_BYTES], '../../etc/passwd.jpg', { type: 'image/jpeg' }),
    );

    // **The filename is carried, not used.** It is the blob store's
    // decision to discard it; the parser's job is to hand it over
    // faithfully so the store *can* discard it.
    expect(image?.originalFilename).toBe('../../etc/passwd.jpg');
  });
});

describe('the multipart report request', () => {
  it('reads the fields and the image', async () => {
    const parsed = await parseMultipartBody(
      multipartRequest(new File([JPEG_BYTES], 'photo.jpg', { type: 'image/jpeg' })),
    );

    expect(parsed.draft.type).toBe('Lost');
    expect(parsed.draft.name).toBe('Brown leather wallet');
    expect(parsed.image?.contentType).toBe('image/jpeg');
  });

  it('refuses a multipart request with no image part', async () => {
    // **The content type is decided by the presence of an image part.** A
    // multipart request without one is a malformed request, not a report
    // without an image.
    await expect(parseMultipartBody(multipartRequest('not-a-file'))).rejects.toThrow(
      MalformedRequestError,
    );
  });

  it('refuses an image part that is over the ceiling once counted', async () => {
    const oversized = bytesOf(MAX_IMAGE_BYTES + 1);

    await expect(
      parseMultipartBody(
        multipartRequest(aFileThatUnderReportsItsSize(oversized, 10)),
      ),
    ).rejects.toThrow('That image is larger than 5 MB.');
  });

  it('refuses an image part of a type the PRD does not name', async () => {
    const svg = new File([Buffer.from('<svg/>')], 'photo.svg', { type: 'image/svg+xml' });

    await expect(parseMultipartBody(multipartRequest(svg))).rejects.toThrow(
      ValidationError,
    );
  });
});
