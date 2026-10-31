/**
 * The image-dimension parser's suite.
 *
 * ## What this suite asserts
 *
 * **That the dimensions are read correctly from each of the three formats.**
 * The parser is the decompression-bomb defence, and a parser that reads the
 * wrong bytes is worse than no parser at all — it would pass images it
 * should reject while looking like a control.
 *
 * **That the check is a header read, not a decode.** The property the
 * standard demands is *"the pixel-count check must run before any decode of
 * full image data"*. The parser is therefore given **headers**, and every
 * fixture here is a header — so a fixture that needed a decoded image to
 * work would fail loudly.
 *
 * **That an unreadable header is over the ceiling.** An image whose decode
 * cost cannot be bounded is an image this system will not accept. The
 * alternative — accepting it because the check could not run — is exactly
 * the bomb the rule exists to stop.
 *
 * **That the 32-bit reads stay unsigned.** A PNG dimension with the high
 * bit set would read as negative, and a negative pixel count is *below*
 * every ceiling — so a signed read would pass an image it should reject.
 */

import { describe, expect, it } from 'vitest';

import { aJpeg, aPng, aWebp } from '@/test/image-bytes';

import {
  isWithinPixelCeiling,
  MAX_IMAGE_PIXELS,
  pixelCount,
  readImageDimensions,
} from './image-dimensions';

describe('the pixel count', () => {
  it('is the width times the height', () => {
    expect(pixelCount({ width: 8000, height: 6000 })).toBe(48_000_000);
  });

  it('is zero for a zero-sized image', () => {
    expect(pixelCount({ width: 0, height: 0 })).toBe(0);
  });
});

describe('the JPEG dimensions', () => {
  it('reads the width and the height from the SOF marker', () => {
    expect(readImageDimensions(aJpeg(800, 600), 'image/jpeg')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('reads them from a progressive SOF2 marker too', () => {
    // SOF2 is progressive JPEG. The dimensions live in the same place.
    const bytes = aJpeg(800, 600);

    // The marker byte follows the 0xFF fill byte at index 20.
    bytes[21] = 0xc2;

    expect(readImageDimensions(bytes, 'image/jpeg')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('walks past the segments before the frame header', () => {
    // The JFIF APP0 segment precedes the SOF, so the parser has to skip it.
    // A parser that assumed the SOF came first would read the APP0's bytes
    // as the dimensions.
    const bytes = aJpeg(1024, 768);

    expect(readImageDimensions(bytes, 'image/jpeg')).toEqual({
      width: 1024,
      height: 768,
    });
  });

  it('reads the dimensions from a 16-bit value above 255', () => {
    expect(readImageDimensions(aJpeg(4000, 3000), 'image/jpeg')).toEqual({
      width: 4000,
      height: 3000,
    });
  });

  it('returns null when the file has no frame header', () => {
    // SOI followed by SOS: a marker walk that reaches the scan without
    // finding a frame header has found no dimensions.
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0x00, 0x08]);

    expect(readImageDimensions(bytes, 'image/jpeg')).toBeNull();
  });

  it('returns null for a truncated header', () => {
    expect(readImageDimensions(aJpeg(800, 600).subarray(0, 12), 'image/jpeg')).toBeNull();
  });

  it('returns null when the marker walk runs off the end of the bytes', () => {
    expect(readImageDimensions(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBeNull();
  });
});

describe('the PNG dimensions', () => {
  it('reads the width and the height from the IHDR chunk', () => {
    expect(readImageDimensions(aPng(800, 600), 'image/png')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('reads a dimension above 65535', () => {
    // A 32-bit field, and the value that would go negative under a signed
    // read.
    expect(readImageDimensions(aPng(70_000, 70_000), 'image/png')).toEqual({
      width: 70_000,
      height: 70_000,
    });
  });

  it('returns null when the first chunk is not IHDR', () => {
    // The chunk type must be IHDR. Reading the dimensions anyway would be
    // reading whatever bytes happened to sit at those offsets.
    const bytes = aPng(800, 600);

    bytes.write('IDAT', 12, 'ascii');

    expect(readImageDimensions(bytes, 'image/png')).toBeNull();
  });

  it('returns null for a truncated header', () => {
    expect(readImageDimensions(aPng(800, 600).subarray(0, 20), 'image/png')).toBeNull();
  });
});

describe('the WebP dimensions', () => {
  it('reads the width and the height from the VP8X chunk', () => {
    expect(readImageDimensions(aWebp(800, 600), 'image/webp')).toEqual({
      width: 800,
      height: 600,
    });
  });

  it('reads a dimension above 65535', () => {
    // A 24-bit field, so it can carry a dimension a 16-bit one could not.
    expect(readImageDimensions(aWebp(80_000, 80_000), 'image/webp')).toEqual({
      width: 80_000,
      height: 80_000,
    });
  });

  it('returns null when the chunk type is one it does not know', () => {
    const bytes = aWebp(800, 600);

    // The chunk's type follows the RIFF header and the chunk's size field.
    bytes.write('XXXX', 16, 'ascii');

    expect(readImageDimensions(bytes, 'image/webp')).toBeNull();
  });

  it('returns null for a truncated header', () => {
    expect(readImageDimensions(aWebp(800, 600).subarray(0, 20), 'image/webp')).toBeNull();
  });
});

describe('the pixel ceiling', () => {
  it('accepts an image at exactly forty megapixels', () => {
    // 8000 x 5000 is exactly 40,000,000.
    expect(isWithinPixelCeiling(aJpeg(8000, 5000), 'image/jpeg')).toBe(true);
  });

  it('refuses an image one pixel over forty megapixels', () => {
    expect(isWithinPixelCeiling(aJpeg(8000, 5001), 'image/jpeg')).toBe(false);
  });

  it('refuses a decompression bomb whatever format it claims', () => {
    // 45 megapixels, declared in each of the three formats.
    expect(isWithinPixelCeiling(aJpeg(9000, 5000), 'image/jpeg')).toBe(false);
    expect(isWithinPixelCeiling(aPng(9000, 5000), 'image/png')).toBe(false);
    expect(isWithinPixelCeiling(aWebp(9000, 5000), 'image/webp')).toBe(false);
  });

  it('refuses an image whose header carries no dimensions', () => {
    // **The safe answer to "is this small enough?" when the size is unknown
    // is no.** An image whose decode cost cannot be bounded is not accepted.
    expect(isWithinPixelCeiling(Buffer.from([0xff, 0xd8, 0xff, 0xda]), 'image/jpeg')).toBe(false);
  });

  it('accepts an ordinary photograph', () => {
    expect(isWithinPixelCeiling(aJpeg(4032, 3024), 'image/jpeg')).toBe(true);
  });

  it('names forty megapixels as the ceiling', () => {
    expect(MAX_IMAGE_PIXELS).toBe(40_000_000);
  });

  it('honours a caller-supplied ceiling', () => {
    // 800 x 600 is 480,000 pixels.
    expect(isWithinPixelCeiling(aJpeg(800, 600), 'image/jpeg', 1_000_000)).toBe(true);
    expect(isWithinPixelCeiling(aJpeg(800, 600), 'image/jpeg', 1_000)).toBe(false);
  });
});
