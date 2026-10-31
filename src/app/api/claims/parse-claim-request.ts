/**
 * The Claim submission request parser.
 *
 * **The parser names each field it reads.** There is no spread of the
 * request body into the draft, so an unknown key in the JSON cannot reach
 * the domain — and the draft type has no index signature for it to land in.
 * This is the same discipline `parse-report-request.ts` states, for the same
 * reason: the draft is the only thing that decides what gets stored.
 *
 * **A shape error is distinct from a rule error.** A body that is not an
 * object, a `reportId` that is absent or is not a string — those are
 * **malformed requests**. A `reason` that is a string but is 5 characters
 * long is a **field validation error**. The two are different failures and
 * get different answers.
 */

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';
import { createClaimDraft, type ClaimDraft } from '@/domain/listings';

/**
 * Parse a Claim submission body.
 *
 * @throws {MalformedRequestError} when the body is not a JSON object, or
 * when a required field is absent or of the wrong type.
 */
export function parseClaimBody(body: Record<string, unknown>): ClaimDraft {
  return createClaimDraft({
    reportId: readRequiredString(body, 'reportId'),
    // **The three claim fields are read as raw strings** and the **domain**
    // decides whether they are acceptable — so the length rules and the
    // date bound live in one place, and the route does not carry a second
    // copy of them.
    reason: readRequiredString(body, 'reason'),
    identifyingDetails: readRequiredString(body, 'identifyingDetails'),
    dateLost: readRequiredString(body, 'dateLost'),
  });
}

/**
 * Read a required string field.
 *
 * **Absent is not the same as empty.** A missing field is a shape error —
 * the form did not carry it — while an empty string is a value, and the
 * domain's value objects decide whether an empty string is acceptable. A
 * member who left the reason blank gets "the reason must be between 20 and
 * 1000 characters", which names the field to fix.
 */
function readRequiredString(body: Record<string, unknown>, field: string): string {
  const value = body[field];

  if (typeof value !== 'string') {
    throw new MalformedRequestError(`The "${field}" field is required.`);
  }

  return value;
}
