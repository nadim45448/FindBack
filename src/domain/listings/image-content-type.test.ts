/**
 * The image's server-set content type, and the delivery headers.
 *
 * **The load-bearing assertion is that the served type comes from the
 * allowlist, not from the upload.** A type that is not in the allowlist has
 * no response at all — the image is refused rather than served under some
 * other type.
 */

import { describe, expect, it } from 'vitest';

import { ValidationError } from '@/lib/errors';

import {
  IMAGE_CACHE_CONTROL,
  IMAGE_CONTENT_DISPOSITION,
  IMAGE_CONTENT_TYPE_OPTIONS,
  SERVABLE_IMAGE_CONTENT_TYPES,
  detectImageContentType,
  isServableImageContentType,
  servableContentType,
} from './image-content-type';

describe('the servable content types', () => {
  it('is exactly the three FR-8 types', () => {
    expect(SERVABLE_IMAGE_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('does not serve SVG', () => {
    // **SVG is active content.** An SVG served inline is a script running
    // in the application's origin, so it is not in the allowlist and never
    // will be.
    expect(isServableImageContentType('image/svg+xml')).toBe(false);
    expect(() => servableContentType('image/svg+xml')).toThrow(ValidationError);
  });

  it('does not serve HTML', () => {
    expect(isServableImageContentType('text/html')).toBe(false);
  });

  it('serves the three allowed types', () => {
    for (const contentType of SERVABLE_IMAGE_CONTENT_TYPES) {
      expect(servableContentType(contentType)).toBe(contentType);
    }
  });

  it('refuses an unknown type rather than falling back to one', () => {
    // **A refusal, not a fallback.** Serving an image of an unknown type
    // under some other type would be serving it under a type nobody chose.
    expect(() => servableContentType('application/octet-stream')).toThrow(ValidationError);
  });

  it('refuses an empty type', () => {
    expect(() => servableContentType('')).toThrow(ValidationError);
  });
});

describe('the content type detected from the bytes', () => {
  it('detects a JPEG', () => {
    expect(detectImageContentType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
  });

  it('detects a PNG', () => {
    expect(
      detectImageContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe('image/png');
  });

  it('detects a WebP', () => {
    expect(
      detectImageContentType(
        Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe('image/webp');
  });

  it('detects nothing in bytes that are too short to carry a signature', () => {
    // **A short buffer is not a truncated image.** It carries no signature,
    // so the answer is "not an image" rather than a guess at which one.
    expect(detectImageContentType(Buffer.from([0xff]))).toBeNull();
    expect(detectImageContentType(Buffer.alloc(0))).toBeNull();
  });

  it('detects nothing in bytes that are not an image', () => {
    expect(detectImageContentType(Buffer.from('<svg/>'))).toBeNull();
  });

  it('detects nothing in an HTML payload wearing a JPEG extension', () => {
    // **The magic bytes are the fact; the extension is a claim.**
    expect(detectImageContentType(Buffer.from('<!DOCTYPE html><html>'))).toBeNull();
  });
});

describe('the delivery headers', () => {
  it('sets nosniff', () => {
    // **nosniff** stops the browser from sniffing the bytes and overriding
    // the server-set type, which is what would defeat it.
    expect(IMAGE_CONTENT_TYPE_OPTIONS).toBe('nosniff');
  });

  it('serves the image inline', () => {
    expect(IMAGE_CONTENT_DISPOSITION).toBe('inline');
  });

  it('caches privately and requires revalidation', () => {
    // **private, no-cache** — the response may be cached by the browser,
    // but only after a revalidation, so the authorisation check runs on
    // every request.
    expect(IMAGE_CACHE_CONTROL).toBe('private, no-cache');
  });

  it('never sets s-maxage', () => {
    // **s-maxage is forbidden on a private image response** (ADR-2). A
    // shared cache keyed on the URL would serve one member's image to
    // another, and no header combination can undo that once cached.
    expect(IMAGE_CACHE_CONTROL).not.toMatch(/s-maxage/i);
    expect(IMAGE_CACHE_CONTROL).not.toMatch(/public/i);
  });
});
