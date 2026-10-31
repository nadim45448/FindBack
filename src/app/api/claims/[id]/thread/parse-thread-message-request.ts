/**
 * The thread-message request parser.
 *
 * **The parser names each field it reads.** There is no spread of the
 * request body into the draft, so an unknown key in the JSON cannot reach
 * the domain — and the draft type has no index signature for it to land in.
 * This is the same discipline `parse-claim-request.ts` states, for the
 * same reason: the draft is the only thing that decides what gets stored.
 *
 * **A shape error is distinct from a rule error.** A body that is not an
 * object, or a `body` that is absent or is not a string, is a **malformed
 * request**. A `body` that is a string but is 3000 characters long is a
 * **field validation error** — the domain's bound decides that, and the
 * route does not carry a second copy of it.
 *
 * **The body is the only field.** The story says "only the plain text
 * content is stored and no attachment is accepted", so the parser has no
 * way to receive an attachment, an image, or a rich-text payload.
 */

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

/** The parsed message body. */
export interface ThreadMessageDraft {
  readonly body: string;
}

/**
 * Parse a thread-message body.
 *
 * @throws {MalformedRequestError} when the body is not a JSON object, or
 * when the `body` field is absent or is not a string.
 */
export function parseThreadMessageBody(body: Record<string, unknown>): ThreadMessageDraft {
  const value = body['body'];

  // **Absent is not the same as empty.** A missing field is a shape error —
  // the form did not carry it — while an empty string is a value, and the
  // domain's value object decides whether an empty string is acceptable. A
  // member who posted nothing gets "a message must be at least 1
  // character", which names the field to fix.
  if (typeof value !== 'string') {
    throw new MalformedRequestError('The "body" field is required.');
  }

  return { body: value };
}
