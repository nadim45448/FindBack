/**
 * The image's **server-set** content type.
 *
 * **The response's `Content-Type` comes from here, never from the upload.**
 *
 * The blob store records a `contentType` when the blob is written, and that
 * value is metadata — and metadata is exactly what an attacker controls.
 * If the served type came from the stored blob, an upload that declared
 * `image/jpeg` but carried a different payload could be served with whatever
 * type the store was told to record, and `nosniff` would then protect
 * nothing.
 *
 * So the type is derived from the **bytes themselves** — the magic-byte
 * signature — and then looked up in a closed allowlist. A type that is not
 * in the allowlist has no response at all: the image is refused rather than
 * served with a fallback type.
 *
 * **No active content.** SVG is not supported and cannot be: an SVG served
 * inline is a script running in the application's origin. The allowlist has
 * exactly the three FR-8 types, and it is closed.
 *
 * **One implementation point.** `detectImageContentType` is the *only*
 * place in the system that decides what an image's bytes are. The store
 * calls it before writing, and the reader calls it before serving — so the
 * type an image was validated as and the type it is served as cannot drift
 * apart. Two copies of a magic-byte table would be two chances for them to
 * disagree, and the disagreement would be silent: a payload stored as one
 * type and served as another.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

/**
 * The content types an image may be served as.
 *
 * **Closed.** FR-8 names JPEG, PNG, and WebP, and nothing else may be
 * served — in particular not SVG, which is active content.
 */
export const SERVABLE_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** One of the servable image content types. */
export type ServableImageContentType = (typeof SERVABLE_IMAGE_CONTENT_TYPES)[number];

/** True when the value is one of the servable content types. */
export function isServableImageContentType(value: string): value is ServableImageContentType {
  return (SERVABLE_IMAGE_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * The content type to serve an image as.
 *
 * @throws {ValidationError} when the type is not one of the servable types.
 * A refusal rather than a fallback: serving an image of an unknown type
 * under some other type would be serving it under a type nobody chose.
 */
export function servableContentType(value: string): ServableImageContentType {
  if (!isServableImageContentType(value)) {
    throw new ValidationError('image', 'That image type cannot be served.');
  }

  return value;
}

/**
 * The image store's magic-byte signatures.
 *
 * **Sniffing the header is a control, not a nicety.** A `.jpg` that is
 * actually an HTML or SVG payload can execute in the origin of whatever
 * serves it. The declared content type is the member's claim; the magic
 * bytes are the fact. The two must agree.
 */
const MAGIC_BYTES: ReadonlyArray<{ contentType: ServableImageContentType; bytes: readonly number[] }> = [
  // JPEG: FF D8 FF
  { contentType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    contentType: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // WebP: "RIFF" .... "WEBP"
  {
    contentType: 'image/webp',
    bytes: [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
  },
];

/**
 * Whether the bytes begin with the given signature.
 *
 * The WebP signature has a four-byte length field in the middle
 * (`RIFF` + size + `WEBP`), which is why the comparison allows any four
 * bytes at positions 4–7.
 */
function matchesSignature(bytes: Buffer, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) {
    return false;
  }

  if (signature[0] === 0x52) {
    // WebP: "RIFF" then four arbitrary bytes then "WEBP".
    const riff = signature.slice(0, 4);
    const webp = signature.slice(8, 12);

    return (
      bytes.subarray(0, 4).equals(Buffer.from(riff)) &&
      bytes.subarray(8, 12).equals(Buffer.from(webp))
    );
  }

  return bytes.subarray(0, signature.length).equals(Buffer.from(signature));
}

/**
 * The content type the bytes actually are.
 *
 * `null` when the bytes match no allowed signature — which is a rejection,
 * not a fallback to the declared type. The whole point of sniffing is that
 * an unmatched file does not get to keep its claimed type.
 *
 * **The bytes, and nothing else.** This function never looks at a declared
 * type, a filename, a pathname extension, or stored metadata. It answers
 * one question: *what are these bytes?*
 */
export function detectImageContentType(bytes: Buffer): ServableImageContentType | null {
  for (const signature of MAGIC_BYTES) {
    if (matchesSignature(bytes, signature.bytes)) {
      return signature.contentType;
    }
  }

  return null;
}

/**
 * The `Content-Disposition` for a delivered image.
 *
 * **`inline`, never `attachment`.** The image is meant to be *seen* — a
 * member recognises an item from the picture — so the browser renders it in
 * place. `attachment` would force a download, which is not the product's
 * intent.
 *
 * It is also what keeps the image out of an executable context: `inline`
 * plus a server-set type plus `nosniff` is the combination that stops a
 * mislabelled payload from being interpreted as script.
 */
export const IMAGE_CONTENT_DISPOSITION = 'inline';

/**
 * The `Cache-Control` for a delivered image.
 *
 * **`private, no-cache`.** `private` keeps the response out of any shared
 * cache. `no-cache` does not forbid caching — it requires **revalidation**
 * before every use, so the authorisation check runs on every request and a
 * cheap `304` is still possible when nothing has changed.
 *
 * **`s-maxage` is never set** (image-handling §3, ADR-2). A shared cache
 * keyed on the URL would serve one member's image to another member, and no
 * header combination can undo that once the bytes are cached.
 */
export const IMAGE_CACHE_CONTROL = 'private, no-cache';

/**
 * The `X-Content-Type-Options` for a delivered image.
 *
 * **`nosniff`.** It stops the browser from second-guessing the
 * `Content-Type` and sniffing the bytes itself — which would defeat the
 * server-set type, and would let a mislabelled payload be interpreted as
 * script.
 */
export const IMAGE_CONTENT_TYPE_OPTIONS = 'nosniff';
