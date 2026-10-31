/**
 * The Confirm Returned request parser.
 *
 * **The route parses the shape; the domain judges the values.** The parser
 * answers one question — "is this body a well-formed request?" — and the
 * domain's value objects answer the next one — "is the substitute's name
 * long enough, is the relationship one of the five, was the authorization
 * affirmed?". A parser that made those judgements would put FR-24's rules in
 * two places.
 *
 * ## The body has one optional group
 *
 * **A default-receiver confirmation carries no body fields at all.** The
 * default receiver is *derived* from the report — the approved claimant on a
 * Found report, the Lost-report owner on a Lost one — so the client has
 * nothing to say about it. A body naming a default receiver would be
 * asserting something the domain owns.
 *
 * **A substitute confirmation carries all three of FR-24's fields.** They
 * arrive together or not at all: the parser returns `null` for the whole
 * group when none of the three is present, and refuses the request when
 * some but not all are.
 *
 * ## The parser is strict about the group's shape and silent about the
 * group's values
 *
 * **A partial substitute is a malformed request, not a validation failure.**
 * A body carrying a name and a relationship but no authorization is not a
 * substitute with a bad authorization — it is a request whose shape is
 * wrong, and the 400 says so. The *values* (a 100-character name, a
 * relationship outside the five) are the domain's business, and they raise
 * `ValidationError`, which the route answers with the same 400 and the
 * offending field.
 *
 * Pure — no I/O, no framework imports.
 */

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

/** The substitute the administrator recorded. */
export interface ParsedSubstituteReceiver {
  readonly name: string;
  readonly authorizationConfirmed: boolean;
  readonly relationship: string;
}

/**
 * Parse the request body.
 *
 * @returns the substitute, or `null` when the body names no substitute.
 * @throws {MalformedRequestError} when the body names *some* of the
 * substitute's fields but not all of them.
 */
export function parseConfirmReturnedRequest(
  body: Record<string, unknown>,
): ParsedSubstituteReceiver | null {
  const name = body['substituteReceiverName'];
  const authorization = body['authorizationAffirmation'];
  const relationship = body['relationship'];

  const namePresent = name !== undefined && name !== null;
  const authorizationPresent = authorization !== undefined && authorization !== null;
  const relationshipPresent = relationship !== undefined && relationship !== null;

  // ── None of them: a default-receiver confirmation ───────────────────────
  //
  // **The default receiver is derived, so the client says nothing.** The
  // body is empty and the domain works out who the receiver is.
  if (!namePresent && !authorizationPresent && !relationshipPresent) {
    return null;
  }

  // ── Some of them: a malformed request ───────────────────────────────────
  //
  // **FR-24: "All three fields are required when the substitute is not the
  // claimant."** A body that carries some of them is a request whose shape
  // is wrong, and saying which field is missing is more useful than
  // refusing vaguely.
  if (!namePresent || !authorizationPresent || !relationshipPresent) {
    const missing: string[] = [];

    if (!namePresent) {
      missing.push('substituteReceiverName');
    }

    if (!authorizationPresent) {
      missing.push('authorizationAffirmation');
    }

    if (!relationshipPresent) {
      missing.push('relationship');
    }

    throw new MalformedRequestError(
      `A substitute receiver needs all three fields. Missing: ${missing.join(', ')}.`,
    );
  }

  // ── The values' types ───────────────────────────────────────────────────
  //
  // **The types are the parser's business; the values are the domain's.**
  // A name that is not a string cannot be a name, and a relationship that is
  // not a string cannot be one of the five.
  if (typeof name !== 'string') {
    throw new MalformedRequestError('The "substituteReceiverName" field must be a string.');
  }

  if (typeof authorization !== 'boolean') {
    throw new MalformedRequestError(
      'The "authorizationAffirmation" field must be a boolean.',
    );
  }

  if (typeof relationship !== 'string') {
    throw new MalformedRequestError('The "relationship" field must be a string.');
  }

  return {
    name,
    authorizationConfirmed: authorization,
    relationship,
  };
}
