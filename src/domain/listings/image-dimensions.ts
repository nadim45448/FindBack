/**
 * The image's **pixel count**, read from its header.
 *
 * ## Why this exists
 *
 * **A compressed file can be small and enormous.** A 40-megapixel PNG is a
 * few megabytes on disk and would occupy hundreds of megabytes decoded. The
 * decode cost is what an attacker controls, and the file size is not — so
 * bounding the file size alone does not bound the work.
 *
 * The standard's rule is therefore explicit:
 *
 * > *Dimensions | Decode header; reject absurd pixel counts (> 40 MP) to bound
 * > decode cost | Reject*
 *
 * and
 *
> > *Decompression-bomb defense: the pixel-count check must run before any
> > decode of full image data.*
 *
 * **This module decodes the header only.** It reads the bytes that carry the
 * dimensions and stops. It never decodes pixels, never allocates an image
 * buffer, and never touches anything past the header — so the cost of this
 * check is bounded by the header size, not by the picture.
 *
 * ## The three formats
 *
 * | Format | Where the dimensions live |
 * |---|---|
 * | **JPEG** | A **SOF** marker (Start Of Frame), which carries the height and width as two 16-bit values |
 * | **PNG** | The **IHDR** chunk, immediately after the 8-byte signature — height and width as two 32-bit values |
 * | **WebP** | One of three chunk types: `VP8X` (extended), `VP8 ` (lossy), `VP8L` (lossless) |
 *
 * **JPEG's marker walk is the only fiddly part.** The file is a sequence of
 * markers, and the dimensions live in one of several SOF variants — so the
 * parser walks the markers until it finds one, and stops at the first
 * **start-of-scan** marker (`SOS`), because everything after `SOS` is entropy-
 * coded pixel data and not a marker at all.
 *
 * ## What this module does not decide
 *
 * **It does not decide whether the file is a valid image.** That is the
 * magic-byte sniffer's job (`image-content-type.ts`), and this module is
 * called *after* it — so by the time a dimension is read, the bytes are
 * already known to be of the declared type.
 *
 * **It does not re-encode, resize, or coerce anything.** A file that fails
 * the check is **rejected**, not repaired. The standard's table says "Reject",
 * and the neighbouring row says "Reject, do not truncate" — so there is no
 * path here that produces a smaller image.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The pixel ceiling (image-handling §1).
 *
 * **Forty megapixels.** Above this the decode cost is unbounded relative to
 * the upload, which is exactly the shape of a decompression bomb.
 */
export const MAX_IMAGE_PIXELS = 40_000_000;

/**
 * The image's dimensions.
 */
export interface ImageDimensions {
  /** The width in pixels. */
  readonly width: number;
  /** The height in pixels. */
  readonly height: number;
}

/**
 * The image's pixel count.
 *
 * **Width times height.** Not the area in bytes and not the file size — the
 * point of the check is to bound the *decoded* size, and the decoded size is
 * the pixel count times the channels times the bytes per channel.
 */
export function pixelCount(dimensions: ImageDimensions): number {
  return dimensions.width * dimensions.height;
}

/**
 * The JPEG **SOF** marker identifiers.
 *
 * **Excluded on purpose:** `DHT` (`C4`), `JPG` (`C8`), and `DAC` (`CC`) are
 * *not* frame headers, and `RST` markers (`D0`–`D7`) are standalone rather
 * than length-prefixed.
 *
 * `SOF4` (`C4`) is excluded because `C4` is `DHT`; `SOF8` (`C8`) is `JPG`; and
 * `SOF12` (`CC`) is `DAC` — the arithmetic-progressiveness and arithmetic
 * coding extensions, not a start of frame.
 */
const JPEG_SOF_MARKERS: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * The JPEG **start of scan** marker — the end of the marker walk.
 *
 * Everything after `SOS` is entropy-coded pixel data. Continuing to walk
 * would read pixel bytes as if they were markers, which is both wrong and
 * unbounded.
 */
const JPEG_SOS_MARKER = 0xda;

/**
 * Read a 16-bit big-endian value.
 */
function readUint16BE(bytes: Buffer, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

/**
 * Read a 32-bit big-endian value.
 *
 * **`>>> 0` keeps the value unsigned.** A 32-bit read of a value with the
 * high bit set would otherwise be negative, and a negative width would
 * multiply out to a negative pixel count — which is *below* every ceiling,
 * and so would pass a check it should fail.
 */
function readUint32BE(bytes: Buffer, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      ((bytes[offset + 1] ?? 0) << 16) +
      ((bytes[offset + 2] ?? 0) << 8) +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

/**
 * The JPEG's dimensions, read from its SOF marker.
 *
 * `null` when the file has no SOF marker before its start-of-scan — which
 * means the file is not a decodable JPEG, and the caller's job is to reject
 * it rather than to accept it on a guess.
 */
function readJpegDimensions(bytes: Buffer): ImageDimensions | null {
  let offset = 2;

  // **The marker walk.** Each marker is a 0xFF byte, then the marker byte,
  // then a two-byte big-endian length covering the segment's own payload.
  // Standalone markers (0x01 and RSTn) carry no length, and 0xFF is a fill
  // byte that may repeat.
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // **Not on a marker boundary.** The file is malformed.
      return null;
    }

    // **Fill bytes.** A 0xFF may be followed by more 0xFF bytes.
    let markerOffset = offset + 1;

    while (markerOffset < bytes.length && bytes[markerOffset] === 0xff) {
      markerOffset += 1;
    }

    if (markerOffset >= bytes.length) {
      return null;
    }

    const marker = bytes[markerOffset] as number;

    // **End of image.**
    if (marker === 0xd9) {
      return null;
    }

    // **Standalone markers** carry no length segment.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset = markerOffset + 1;
      continue;
    }

    const segmentLength = readUint16BE(bytes, markerOffset + 1);

    if (JPEG_SOF_MARKERS.has(marker)) {
      // **The SOF segment's layout, from the marker byte:** the marker
      // itself, then the segment's two-byte length, then the payload — the
      // sample precision (one byte), the height (two bytes), and the width
      // (two bytes).
      //
      // So the payload starts three bytes after the marker byte, and the
      // height is at +4 and the width at +6.
      const height = readUint16BE(bytes, markerOffset + 4);
      const width = readUint16BE(bytes, markerOffset + 6);

      return { width, height };
    }

    // **Start of scan: the marker walk ends here.**
    if (marker === JPEG_SOS_MARKER) {
      return null;
    }

    // **Step over this segment's payload.**
    const next = markerOffset + 1 + segmentLength;

    if (next <= offset || next >= bytes.length) {
      return null;
    }

    offset = next;
  }

  return null;
}

/**
 * The PNG's dimensions, read from its `IHDR` chunk.
 *
 * **The `IHDR` chunk is always first.** The PNG specification puts it
 * immediately after the 8-byte signature, before any other chunk — so this
 * is a fixed-offset read rather than a walk.
 */
function readPngDimensions(bytes: Buffer): ImageDimensions | null {
  // 8 bytes of signature, then a 4-byte chunk length, then the 4-byte type.
  if (bytes.length < 24) {
    return null;
  }

  // **The chunk type must be `IHDR`.** If it is not, the file is not a PNG
  // with a leading header, and reading the dimensions anyway would be
  // reading whatever bytes happen to sit there.
  const type = bytes.subarray(12, 16).toString('ascii');

  if (type !== 'IHDR') {
    return null;
  }

  // **The IHDR chunk's payload is width first, then height.**
  const width = readUint32BE(bytes, 16);
  const height = readUint32BE(bytes, 20);

  return { width, height };
}

/**
 * The WebP's dimensions, read from its first chunk.
 *
 * **Three chunk types carry dimensions, and the file's variant decides
 * which:**
 *
 * | Chunk | Variant | Where the dimensions are |
 * |---|---|---|
 * | `VP8X` | Extended | The 24-bit canvas width and height minus one, at offsets 24 and 27 |
 * | `VP8 ` | Lossy | The 16-bit width and height at offsets 26 and 28, each read as 14 bits |
 * | `VP8L` | Lossless | The 14-bit width and height minus one, at offsets 21 and 22 |
 */
function readWebpDimensions(bytes: Buffer): ImageDimensions | null {
  /**
   * **The RIFF layout.** `RIFF` (four bytes), the file size (four bytes),
   * `WEBP` (four bytes), then the first chunk: its size (four bytes), its
   * type (four bytes), and its payload.
   *
   * So the chunk's type is at offset 16 and its payload at 20.
   */
  if (bytes.length < 30) {
    return null;
  }

  const chunkType = bytes.subarray(16, 20).toString('ascii');

  if (chunkType === 'VP8X') {
    // **The VP8X payload is:** one flags byte, three reserved bytes, then
    // the 24-bit canvas width and height, each storing the size minus one.
    const width = readUint24LE(bytes, 24) + 1;
    const height = readUint24LE(bytes, 27) + 1;

    return { width, height };
  }

  if (chunkType === 'VP8 ') {
    // **The lossy bitstream's key frame header.** The 16-bit values at
    // offsets 26 and 28 each carry their dimension in the low 14 bits, with
    // the two high bits being the scale and the sign.
    const width = readUint16LE(bytes, 26) & 0x3fff;
    const height = readUint16LE(bytes, 28) & 0x3fff;

    return { width, height };
  }

  if (chunkType === 'VP8L') {
    // **The lossless bitstream header.** Fourteen bits each, storing the
    // size minus one, packed across bytes 21 and 22.
    const bits = readUint16LE(bytes, 21);

    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;

    return { width, height };
  }

  return null;
}

/**
 * Read a 24-bit little-endian value.
 */
function readUint24LE(bytes: Buffer, offset: number): number {
  return (
    (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16)
  );
}

/**
 * Read a 16-bit little-endian value.
 */
function readUint16LE(bytes: Buffer, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/**
 * The image's dimensions, read from its header.
 *
 * `null` when the bytes carry no readable dimensions — which is a
 * **rejection**, not a pass. The standard's rule is to reject an image
 * whose dimensions cannot be bounded, because an image whose header cannot
 * be read is an image whose decode cost cannot be bounded either.
 *
 * **The format is chosen by the caller, not sniffed here.** The caller
 * already knows the type — `detectImageContentType` ran first and the
 * declared type was matched against it — and choosing by the *declared* type
 * would be wrong, because the declared type is the member's claim. The
 * caller therefore passes the **detected** type, which is the fact.
 */
export function readImageDimensions(
  bytes: Buffer,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
): ImageDimensions | null {
  if (contentType === 'image/jpeg') {
    return readJpegDimensions(bytes);
  }

  if (contentType === 'image/png') {
    return readPngDimensions(bytes);
  }

  return readWebpDimensions(bytes);
}

/**
 * Whether the image's pixel count is within the ceiling.
 *
 * **A missing dimension is over the ceiling.** A caller that gets `null`
 * from `readImageDimensions` has an image whose decode cost it cannot bound,
 * and the safe answer to "is this image small enough?" when the size is
 * unknown is **no**.
 */
export function isWithinPixelCeiling(
  bytes: Buffer,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
  ceiling: number = MAX_IMAGE_PIXELS,
): boolean {
  const dimensions = readImageDimensions(bytes, contentType);

  if (dimensions === null) {
    return false;
  }

  return pixelCount(dimensions) <= ceiling;
}
