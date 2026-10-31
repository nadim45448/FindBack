/**
 * The claim **decision** request parser.
 *
 * **The parser names the field it reads, and drops everything else.** A
 * rejection carries exactly one field — the administrator's reason — so the
 * parser reads `reason` and drops every other key. A request carrying
 * `{"status": "Approved"}` has that key dropped before the service sees it,
 * so the rejection structurally cannot decide anything but the reason.
 *
 * **The bound is the domain's, not the parser's.** The parser only reads the
 * field; `createClaimRejectionReason` owns the 10–500 character rule, so the
 * bound lives in exactly one place and the service's own call enforces it
 * even when the service is reached by something other than this route.
 */

import { ValidationError } from '@/lib/errors';

/** The rejection request's fields. */
export interface ClaimRejectionRequest {
  /** The administrator's reason. 10–500 characters, validated by the domain. */
  readonly reason: string;
}

/**
 * Parse a JSON request body into a rejection's reason.
 *
 * @throws {ValidationError} when the `reason` field is present but is not
 * text. A **missing** reason is not a parse error — it is the empty string,
 * which the domain's bound then refuses with its own message.
 */
export function parseClaimRejectionBody(body: Record<string, unknown>): ClaimRejectionRequest {
  const value = body['reason'];

  if (value !== undefined && typeof value !== 'string') {
    throw new ValidationError('reason', 'The "reason" field must be text.');
  }

  return { reason: typeof value === 'string' ? value : '' };
}
