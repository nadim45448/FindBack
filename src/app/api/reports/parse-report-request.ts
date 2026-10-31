/**
 * The report request parser.
 *
 * **The parser names each field it reads.** This is the whole point of the
 * module: a request body carrying `{"secretLocation": "…"}` has that key
 * **dropped at this boundary**, because there is nowhere for it to go. The
 * draft's shape is closed and has no index signature, so an unknown key
 * cannot become a stored column — and it does not even become a draft
 * field. FR-8's field set is closed *by construction*, not by a check that
 * a future edit might forget.
 *
 * **A blind spread would undo that.** `JSON.parse(body)` followed by
 * `{ ...body }` would carry every unknown key into the draft, and the draft
 * is the only thing that decides what gets stored. So the parser reads each
 * field **by name**.
 *
 * **A shape error is distinct from a rule error.** A body that is not an
 * object, a `type` that is absent or is not one of the two, a `name` that
 * is not a string — those are **malformed requests**. A `name` that is a
 * string but is 200 characters long is a **field validation error**. The
 * two are different failures and get different answers, because the PRD's
 * member-facing copy treats them differently: one is "the form was
 * submitted wrong", the other is "this field is not acceptable".
 */

import { ValidationError } from '@/lib/errors';

import {
  createReportDraft,
  type ReportDraft,
  type ReportType,
} from '@/domain/listings';

/**
 * The image part's maximum accepted size, in bytes (FR-8: 5 MB).
 *
 * The route refuses an over-sized part **before** reading it into memory.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The content types the route accepts for an image (FR-8). */
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * A malformed request — the **shape** is wrong, not a field's value.
 *
 * Distinct from `ValidationError`: a shape error says the request could not
 * be understood, while a validation error says a particular field broke a
 * particular rule.
 */
export class MalformedRequestError extends ValidationError {
  constructor(message: string) {
    super('body', message);
    this.name = new.target.name;
  }
}

/** The parsed request: the draft, and the image when one was sent. */
export interface ParsedReportRequest {
  readonly draft: ReportDraft;
  readonly image: {
    readonly bytes: Buffer;
    readonly contentType: string;
    readonly originalFilename?: string;
  } | null;
}

/**
 * Parse a JSON request body into a draft.
 *
 * @throws {MalformedRequestError} when the body is not a JSON object, when a
 * required field is absent or of the wrong type, or when `type` is not one
 * of the two report types.
 */
export function parseReportBody(body: Record<string, unknown>): ReportDraft {
  const type = readType(body);

  return createReportDraft({
    type,
    name: readRequiredString(body, 'name'),
    // The category is a raw string here. The **validator** decides whether
    // it is one of the nine — so the rule lives in the domain, and the route
    // does not carry a second copy of the list.
    category: readRequiredString(body, 'category'),
    description: readRequiredString(body, 'description'),
    date: readRequiredString(body, 'date'),
    campusArea: readRequiredString(body, 'campusArea'),
    // The optional fields are read by name too. An absent field is `null`,
    // which the domain turns into an explicit absence — not an empty
    // string.
    exactPlace: readOptionalString(body, 'exactPlace'),
    identifyingDetails: readOptionalString(body, 'identifyingDetails'),
  });
}

/**
 * Parse a multipart request into a draft and an optional image.
 *
 * **The content type is decided by the presence of an image part, not by
 * the client.** A request that claims `multipart/form-data` with no image
 * part is a malformed request, not a report without an image — and the
 * design says so explicitly.
 */
export async function parseMultipartBody(request: Request): Promise<ParsedReportRequest> {
  const { fields, form } = await readMultipartForm(request);

  const imagePart = form.get('image');

  if (!(imagePart instanceof File)) {
    throw new MalformedRequestError(
      'A multipart request must include the image part.',
    );
  }

  return {
    draft: parseReportBody(fields),
    image: await readImagePart(imagePart),
  };
}

/**
 * Read a multipart request into its text fields and its parts.
 *
 * **Exported so the edit routes parse a form the same way the create route
 * does.** A multipart body has two kinds of part — text fields and files —
 * and every route that accepts one needs the same rule for telling them
 * apart. One reader, one rule.
 */
export async function readMultipartForm(
  request: Request,
): Promise<{ fields: Record<string, unknown>; form: FormData }> {
  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    throw new MalformedRequestError('The request body could not be read.');
  }

  const fields: Record<string, unknown> = {};

  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      // The **first** occurrence of a field wins. A repeated field is a
      // malformed request in principle, but taking the first is enough to
      // stop a second value from overriding the first silently — and the
      // value is still validated by the domain.
      if (!(key in fields)) {
        fields[key] = value;
      }
    }
  }

  return { fields, form };
}

/**
 * Read an image part into bytes.
 *
 * **The declared size is checked before the bytes are read**, and the
 * **actual** byte length is checked after — the `Content-Length` a client
 * sends is a claim, not a fact, and an over-sized upload must be refused
 * rather than truncated (image-handling §1).
 */
export async function readImagePart(part: File): Promise<ParsedReportRequest['image']> {
  if (!ALLOWED_IMAGE_TYPES.has(part.type)) {
    throw new ValidationError(
      'image',
      'That image type is not accepted. Use a JPEG, PNG, or WebP image.',
    );
  }

  if (part.size > MAX_IMAGE_BYTES) {
    throw new ValidationError('image', 'That image is larger than 5 MB.');
  }

  const bytes = Buffer.from(await part.arrayBuffer());

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new ValidationError('image', 'That image is larger than 5 MB.');
  }

  return {
    bytes,
    contentType: part.type,
    originalFilename: part.name,
  };
}

/**
 * The report's type.
 *
 * **A missing or malformed `type` is a shape error**, not a field
 * validation error: the request does not say which operation it is
 * requesting, so it cannot be understood at all.
 */
function readType(body: Record<string, unknown>): ReportType {
  const value = body['type'];

  if (value === 'Lost' || value === 'Found') {
    return value;
  }

  throw new MalformedRequestError('The report type must be "Lost" or "Found".');
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
 * A field that is present but not a string is a **shape** error rather than
 * an absent field: the client sent something, and it was not the wrong
 * shape. Silently dropping it would let a client believe it had set the
 * field.
 */
function readOptionalString(body: Record<string, unknown>, field: string): string | null {
  const value = body[field];

  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new MalformedRequestError(`The "${field}" field must be text.`);
  }

  return value;
}
