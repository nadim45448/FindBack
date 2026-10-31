/**
 * The administrator's edit request parser.
 *
 * **The content type decides the parser, and the parser decides the
 * fields.** A `multipart/form-data` request carries the text fields *and* the
 * replacement image as parts; an `application/json` request carries only the
 * text fields. An unknown content type is a malformed request rather than a
 * best-effort parse — the same rule the creation route uses, so there is one
 * answer to "how does this system read a form?".
 *
 * **The image is optional, and that is the difference from the creation
 * parser.** The creation parser *requires* the image part, because a
 * `multipart/form-data` report request with no image is a malformed request.
 * An administrator's edit is a **partial** submission — the administrator may
 * replace the image, change the text fields, or do either — so a multipart
 * edit with no image part is a perfectly good edit that changes only text.
 *
 * **The text fields are parsed by the *same* parser the reporter's edit
 * uses.** FR-53's editable set is the reporter's content set plus image
 * replacement, and the content fields are read identically — so a field the
 * administrator may not change is dropped at the same boundary, by the same
 * mechanism. A second copy of the field list here would be a second answer
 * to the same question, and the two would drift.
 *
 * **The image is read by the *same* reader the creation route uses.** The
 * 5 MB ceiling, the three allowed content types, and the "check the
 * declared size before reading, and the actual size after" rule all live in
 * one place, so the edit path cannot accept an image the create path would
 * refuse.
 */

import { ValidationError } from '@/lib/errors';

import { readJsonBody } from '@/app/api/_helpers';

import {
  MalformedRequestError,
  readImagePart,
  readMultipartForm,
} from '@/app/api/reports/parse-report-request';

import {
  parseReportEditBody,
  type ReportEditChanges,
} from '@/app/api/reports/parse-report-edit-request';

/** The parsed administrator's edit. */
export interface ParsedAdministratorEdit {
  /** The submitted text-field changes. */
  readonly changes: ReportEditChanges;
  /** The replacement image, when one was sent. */
  readonly image: {
    readonly bytes: Buffer;
    readonly contentType: string;
    readonly originalFilename?: string;
  } | null;
}

/**
 * Parse an administrator's edit request.
 *
 * @throws {MalformedRequestError} when the content type is neither JSON nor
 * multipart, when a multipart body cannot be read, or when the `image` part
 * is present but is not a file.
 * @throws {ValidationError} when the image part's type or size is not
 * acceptable.
 */
export async function parseAdministratorEditBody(
  request: Request,
): Promise<ParsedAdministratorEdit> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const { fields, form } = await readMultipartForm(request);

    const imagePart = form.get('image');

    // **No image part is not an error here.** An administrator's edit is a
    // partial submission — a multipart edit that changes only the text
    // fields is a valid edit, and the multipart parser exists precisely so
    // the image can travel alongside them.
    if (imagePart === null) {
      return { changes: parseReportEditBody(fields), image: null };
    }

    if (typeof imagePart === 'string') {
      throw new MalformedRequestError('The image part must be a file.');
    }

    return {
      changes: parseReportEditBody(fields),
      image: await readImagePart(imagePart),
    };
  }

  if (contentType.includes('application/json')) {
    const body = await readJsonBody(request);

    return { changes: parseReportEditBody(body), image: null };
  }

  throw new MalformedRequestError(
    'The request must be sent as JSON, or as a form with an image.',
  );
}

/** Re-export the validation error so the route can name the field. */
export { ValidationError };
