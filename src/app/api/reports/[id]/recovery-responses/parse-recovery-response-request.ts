/**
 * The Recovery Response submission request parser.
 *
 * **The parser names each field it reads.** There is no spread of the
 * request body into the draft, so an unknown key in the JSON cannot reach
 * the domain — and the draft type has no index signature for it to land in.
 * This is the same discipline `parse-claim-request.ts` states, for the same
 * reason: the draft is the only thing that decides what gets stored.
 *
 * **A shape error is distinct from a rule error.** A body that is not an
 * object, a `campusArea` that is absent or is not a string — those are
 * **malformed requests**. A `whereFoundExactPlace` that is a string but is
 * 300 characters long is a **field validation error**. The two are different
 * failures and get different answers.
 *
 * **The `reportId` comes from the path, not the body.** The route reads it
 * from the URL's dynamic segment, so a body that carries a different
 * `reportId` cannot redirect the Response at another report. The parser
 * therefore takes the id as a parameter and never reads it from the body.
 *
 * **The image is optional here**, unlike the report's — FR-44 marks the
 * candidate image optional, so a `multipart/form-data` request with no
 * image part is a valid submission, not a malformed request.
 */

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';
import { createRecoveryResponseDraft, type RecoveryResponseDraft } from '@/domain/recovery';

/**
 * The image part's maximum accepted size, in bytes (FR-44: 5 MB).
 *
 * The route refuses an over-sized part **before** reading it into memory.
 */
export const MAX_RECOVERY_RESPONSE_IMAGE_BYTES = 5 * 1024 * 1024;

/** The content types the route accepts for a candidate image (FR-44). */
const ALLOWED_RECOVERY_RESPONSE_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** The parsed request: the draft, and the image when one was sent. */
export interface ParsedRecoveryResponseRequest {
  readonly draft: RecoveryResponseDraft;
  readonly image: {
    readonly bytes: Buffer;
    readonly contentType: string;
    readonly originalFilename?: string;
  } | null;
}

/**
 * Parse a Recovery Response submission body.
 *
 * @throws {MalformedRequestError} when the body is not a JSON object, or
 * when a required field is absent or of the wrong type.
 */
export function parseRecoveryResponseBody(
  body: Record<string, unknown>,
  reportId: string,
): RecoveryResponseDraft {
  return createRecoveryResponseDraft({
    reportId,
    // **The campus area is read as a raw string** and the **domain** decides
    // whether it is one of the deployment's areas — so the membership rule
    // lives in one place, and the route does not carry a second copy of the
    // list.
    campusArea: readRequiredString(body, 'campusArea'),
    // **The exact place is optional**, so an absent field is an empty
    // string, which the value object accepts (FR-44's lower bound is 0).
    whereFoundExactPlace: readOptionalString(body, 'whereFoundExactPlace'),
    observedIdentifyingDetails: readRequiredString(body, 'observedIdentifyingDetails'),
    dateFound: readRequiredString(body, 'dateFound'),
  });
}

/**
 * Parse a multipart request into a draft and an optional image.
 *
 * **A multipart request without an image part is a valid submission.** The
 * candidate image is optional in FR-44, so its absence is an absence — not a
 * malformed request.
 */
export async function parseMultipartRecoveryResponseBody(
  request: Request,
  reportId: string,
): Promise<ParsedRecoveryResponseRequest> {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    throw new MalformedRequestError('The request body could not be read.');
  }

  const fields: Record<string, unknown> = {};

  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      // The **first** occurrence of a field wins, so a repeated field cannot
      // silently override the first — and the value is still validated by
      // the domain.
      if (!(key in fields)) {
        fields[key] = value;
      }
    }
  }

  const imagePart = form.get('image');

  if (imagePart === null) {
    return { draft: parseRecoveryResponseBody(fields, reportId), image: null };
  }

  if (!(imagePart instanceof File)) {
    throw new MalformedRequestError('The image part must be a file.');
  }

  return {
    draft: parseRecoveryResponseBody(fields, reportId),
    image: await readImagePart(imagePart),
  };
}

/**
 * Read an image part into bytes.
 *
 * **The declared size is checked before the bytes are read**, and the
 * **actual** byte length is checked after — the `Content-Length` a client
 * sends is a claim, not a fact, and an over-sized upload must be refused
 * rather than truncated (image-handling §1).
 */
async function readImagePart(
  part: File,
): Promise<ParsedRecoveryResponseRequest['image']> {
  if (!ALLOWED_RECOVERY_RESPONSE_IMAGE_TYPES.has(part.type)) {
    throw new MalformedRequestError(
      'That image type is not accepted. Use a JPEG, PNG, or WebP image.',
    );
  }

  if (part.size > MAX_RECOVERY_RESPONSE_IMAGE_BYTES) {
    throw new MalformedRequestError('That image is larger than 5 MB.');
  }

  const bytes = Buffer.from(await part.arrayBuffer());

  if (bytes.length > MAX_RECOVERY_RESPONSE_IMAGE_BYTES) {
    throw new MalformedRequestError('That image is larger than 5 MB.');
  }

  return {
    bytes,
    contentType: part.type,
    originalFilename: part.name,
  };
}

/**
 * Read a required string field.
 *
 * **Absent is not the same as empty.** A missing field is a shape error —
 * the form did not carry it — while an empty string is a value, and the
 * domain's value objects decide whether an empty string is acceptable.
 */
function readRequiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];

  if (typeof value !== 'string') {
    throw new MalformedRequestError(`The "${field}" field is required.`);
  }

  return value;
}

/**
 * Read an optional string field.
 *
 * A field that is present but is not a string is a **shape** error rather
 * than an absent field: the client sent something, and it was not the wrong
 * shape. Silently dropping it would let a client believe it had set the
 * field.
 */
function readOptionalString(body: Record<string, unknown>, field: string): string {
  const value = body[field];

  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value !== 'string') {
    throw new MalformedRequestError(`The "${field}" field must be text.`);
  }

  return value;
}
