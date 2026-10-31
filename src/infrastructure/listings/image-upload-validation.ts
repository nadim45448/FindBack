import {
  ImageRejectedError,
  type ImageUpload,
} from '@/application/listings/ports/image-store';
import {
  detectImageContentType,
  MAX_IMAGE_PIXELS,
  pixelCount,
  readImageDimensions,
  SERVABLE_IMAGE_CONTENT_TYPES,
} from '@/domain/listings';

/** The declared byte ceiling (FR-8): 5 MB. */
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set<string>(SERVABLE_IMAGE_CONTENT_TYPES);

/**
 * Server-side image validation shared by every store adapter (image-handling §1).
 */
export function validateImageUpload(image: ImageUpload): void {
  if (!ALLOWED_CONTENT_TYPES.has(image.contentType)) {
    throw new ImageRejectedError(
      'That image type is not accepted. Use a JPEG, PNG, or WebP image.',
    );
  }

  if (image.bytes.length === 0) {
    throw new ImageRejectedError('That image is empty.');
  }

  if (image.bytes.length > MAX_BYTES) {
    throw new ImageRejectedError('That image is larger than 5 MB.');
  }

  const detected = detectImageContentType(image.bytes);

  if (detected === null) {
    throw new ImageRejectedError('That file is not a JPEG, PNG, or WebP image.');
  }

  if (detected !== image.contentType) {
    throw new ImageRejectedError('That file does not match its declared image type.');
  }

  const dimensions = readImageDimensions(image.bytes, detected);

  if (dimensions === null) {
    throw new ImageRejectedError('That file does not look like a readable image.');
  }

  if (pixelCount(dimensions) > MAX_IMAGE_PIXELS) {
    throw new ImageRejectedError(
      'That image has too many pixels. Use an image of 40 megapixels or fewer.',
    );
  }
}
