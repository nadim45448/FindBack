/**
 * `GET /api/reports/[id]` — the FR-13 authenticated detail view.
 *
 * **The detail view is a projection, not a record.** The response's fields
 * are decided by the FR-39 matrix — which fields this viewer may see of
 * this report — and the matrix is resolved **upstream** of the query, so a
 * field the viewer may not see is absent from the `SELECT` list rather than
 * loaded and then dropped.
 *
 * **Two members opening the same report get different responses.** That is
 * not a variation in the UI; it is the projection being resolved per
 * request from the viewer's relationship to the report.
 *
 * **An anonymous request is refused with a 404, not a 403.** FR-13 does not
 * extend anonymous visibility, and FR-38 says the listing row is the whole
 * of anonymous visibility on a report. A 403 would confirm that the report
 * exists — which is exactly what an anonymous visitor must not learn.
 * "That report could not be found" tells them nothing they did not already
 * know.
 *
 * **The route is thin.** The gate, the relationship load, the column
 * resolution, and the assembly all live in the service and the visibility
 * service; the route resolves the actor and maps the result.
 */

import { NextResponse } from 'next/server';

import { NotFoundError } from '@/lib/errors';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { errorResponse, log, readRequestId, readSessionCookie } from '@/app/api/_helpers';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Read a report's detail. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.detail';

  try {
    const { id } = await context.params;
    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **The actor is derived from the session.** An anonymous request has no
    // actor, and the detail service refuses it — the route does not
    // re-implement the refusal, and it does not redirect. The redirect to
    // the login page with a return-after-login affordance is Unit 007's
    // (web surfaces); the API answers with a refusal.
    const token = await readSessionCookie();
    const actor = token ? await identity.resolver.resolve(token) : null;

    // ── The use case ───────────────────────────────────────────────────────
    const projection = await listings.details.show(actor, id);

    log(requestId, action, 'success', {
      actorId: actor?.actorId,
      actorRole: actor?.isAdministrator ? 'administrator' : actor ? 'member' : 'anonymous',
      targetType: 'report',
      targetId: id,
    });

    return NextResponse.json(projection);
  } catch (error) {
    return detailErrorResponse(error, requestId, action);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **The not-found is the domain's own message.** "That report could not be
 * found" is what the refusal is — a message that says "not found" rather
 * than "forbidden", because a forbidden would disclose that the report
 * exists.
 */
function detailErrorResponse(error: unknown, requestId: string, action: string): NextResponse {
  if (error instanceof NotFoundError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return errorResponse(error, requestId);
}
