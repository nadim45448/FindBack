/**
 * **Test-only** builders for image bytes that carry real dimensions.
 *
 * ## Why these exist
 *
 * The store validates an image's **pixel count**, read from its header
 * (image-handling §1, "Dimensions"). A header that carries no dimensions is
 * therefore no longer a valid fixture — it is an image the store must
 * reject.
 *
 * The earlier fixtures were six-byte signature stubs. They were enough when
 * the only checks were the magic bytes and the byte ceiling; now the header
 * has to be **structurally real**, so that a test asserting "this image is
 * accepted" is asserting about a file the parser can actually read.
 *
 * **These are headers, not images.** They carry the signature and the
 * dimension fields and nothing else — no entropy-coded data, no complete
 * file. That is exactly what the dimension parser reads and exactly what the
 * store's check needs, and it is why a 45-megapixel fixture costs a few
 * dozen bytes rather than megabytes.
 *
 * **The pixel count is declared, not simulated.** `aJpeg(8000, 6000)`
 * really does encode 8000×6000, and the parser really does read those
 * numbers back out. A fixture cannot fake a large image into being small.
 */

/**
 * The bytes of a JPEG header carrying the given dimensions.
 *
 * **The structure:** `SOI` (`FF D8`), then an `APP0` segment, then the
 * `SOF0` marker (`FF C0`) whose segment payload holds the sample precision,
 * the height, and the width — and then the start of scan, so the marker walk
 * has somewhere to stop.
 */
export function aJpeg(width: number, height: number): Buffer {
  return Buffer.from([
    // SOI
    0xff, 0xd8,
    // APP0 (JFIF). The segment length counts every byte after the length
    // field itself, so a length of 16 means 14 payload bytes follow.
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    // SOF0, segment length 17: precision (1) + height (2) + width (2) +
    // three component bytes + the payload the length counts.
    0xff, 0xc0, 0x00, 0x11, 0x08,
    // Height, big-endian.
    (height >> 8) & 0xff, height & 0xff,
    // Width, big-endian.
    (width >> 8) & 0xff, width & 0xff,
    // Three components.
    0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    // SOS — the marker walk stops here.
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  ]);
}

/**
 * The bytes of a PNG header carrying the given dimensions.
 *
 * **The structure:** the 8-byte signature, then the `IHDR` chunk — its
 * length, its type, the width and height as big-endian 32-bit values, and
 * the bit depth and colour type — and then the `IEND` chunk.
 */
export function aPng(width: number, height: number): Buffer {
  return Buffer.from([
    // The signature.
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    // IHDR: length 13, type "IHDR".
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    // Width, big-endian.
    (width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff,
    // Height, big-endian.
    (height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff,
    // Bit depth, colour type, compression, filter, interlace.
    0x08, 0x06, 0x00, 0x00, 0x00,
    // IEND.
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
}

/**
 * The bytes of a WebP header carrying the given dimensions.
 *
 * **The structure:** `RIFF` and the file size, `WEBP`, then a `VP8X`
 * chunk — the extended variant.
 *
 * **The `VP8X` payload's own layout:** one flags byte, three reserved
 * bytes, then the 24-bit canvas width and height, each storing the size
 * minus one.
 */
export function aWebp(width: number, height: number): Buffer {
  const payload = Buffer.alloc(10);

  // **The flags and the reserved bytes come first.**
  payload.writeUInt8(0x10, 0);
  payload.writeUInt8(0x00, 1);
  payload.writeUInt8(0x00, 2);
  payload.writeUInt8(0x00, 3);

  // **The canvas size is stored minus one**, in 24 bits little-endian.
  payload.writeUIntLE(width - 1, 4, 3);
  payload.writeUIntLE(height - 1, 7, 3);

  const chunk = Buffer.concat([
    // The chunk's size, little-endian.
    Buffer.from([0x0a, 0x00, 0x00, 0x00]),
    Buffer.from('VP8X', 'ascii'),
    payload,
  ]);

  const body = Buffer.concat([
    Buffer.from('WEBP', 'ascii'),
    chunk,
  ]);

  const riff = Buffer.alloc(8);

  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);

  return Buffer.concat([riff, body]);
}
