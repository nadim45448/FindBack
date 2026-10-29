/**
 * `GET /api/reports/listing` — the FR-14 search pool (FR-12, FR-38, FR-49).
 *
 * **One endpoint serves every caller.** The public summary listing, the
 * search, and the four member partitions are the same query with a
 * different partition — and a separate endpoint per partition would mean
 * separate parsers, separate error mappings, and separate chances for them
 * to drift.
 *
 * **The actor is derived from the session, never from the request.** The
 * `partition` parameter names a *view*; it does not confer one. An
 * anonymous caller supplying `mine` gets the public listing — the story
 * says so: "an anonymous request supplying an authenticated-only partition
 * is not served as an authenticated partition; the public listing applies".
 *
 * **The response is the listing's own row shape.** The rows carry the FR-38
 * summary fields — name, category, date, campus area, status, type — and
 * nothing else. That is not a fuller row with fields stripped: the shape
 * *is* the FR-38 set, so an anonymous viewer never receives a description,
 * an image reference, an exact place, an identifying detail, or a reporter
 * identity, and never receives a Claim, a Recovery Response, a thread, or
 * an audit entry.
 *
 * **The route is thin.** The partition is resolved by the service, the
 * filter is parsed here, and the status view is resolved by the domain. No
 * business rule lives in this file.
 */

import { NextResponse } from 'next/server';

import { ValidationError } from '@/lib/errors';

import { buildPage, parsePageNumber, parsePageSize } from '@/domain/listings';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { errorResponse, log, readRequestId, readSessionCookie } from '@/app/api/_helpers';
import { parsePartition } from '@/application/listings/report-listing-service';

import { parseListingFilter } from '../parse-listing-request';

/** List the reports of a partition. */
export async function GET(request: Request): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.listing';

  try {
    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **The actor is resolved, never assumed.** An anonymous request has no
    // session, and the resolver's answer is the only thing that decides
    // which partition the caller gets.
    const token = await readSessionCookie();
    const actor = token ? await identity.resolver.resolve(token) : null;

    // ── The query ──────────────────────────────────────────────────────────
    const url = new URL(request.url);
    const params = url.searchParams;

    const partition = parsePartition(params.get('partition'));
    const filter = parseListingFilter(params);
    const page = buildPage(parsePageNumber(params.get('page')), parsePageSize(params.get('pageSize')));

    // ── The use case ───────────────────────────────────────────────────────
    const result = await listings.listings.list({ actor, partition, filter, page });

    log(requestId, action, 'success', {
      actorId: actor?.actorId,
      actorRole: actor?.isAdministrator ? 'administrator' : actor ? 'member' : 'anonymous',
    });

    return NextResponse.json(result);
  } catch (error) {
    return listingErrorResponse(error, requestId, action);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **A field rule failure is a 400**, naming the offending field — the
 * submission is not acceptable and the caller is told which parameter to
 * fix. The shared helper's 422 belongs to the identity module's contract,
 * and this route is not that module.
 *
 * **No response carries a field's value.** The validation errors carry the
 * field *name* and the rule, never what was submitted — the keyword might
 * carry a Sensitive Field's contents.
 */
function listingErrorResponse(error: unknown, requestId: string, action: string): NextResponse {
  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
