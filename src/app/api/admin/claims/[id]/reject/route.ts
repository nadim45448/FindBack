/**
 * `POST /api/admin/claims/[id]/reject` — the administrator's rejection of a
 * Claim (FR-18, story 004).
 *
 * **Only an administrator may reject.** The actor is derived from the
 * session — never from the request — so a client cannot assert its own role.
 *
 * **The rejection requires a reason.** Story 004: the rejection "records a
 * reason of 10–500 characters" and "a rejection that breaks the reason
 * bound is refused and the Claim remains `Pending`". The bound is the
 * domain's; the route only reads the field.
 *
 * **The route is thin.** The gate, the row lock, the atomic write, the
 * report's move, and the audit event all live in the service. The route
 * parses the body, calls the use case, and maps the result.
 */

import { NextResponse } from 'next/server';

import { readJsonBody, readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { claimAdminErrorResponse, resolveAdministrator } from '../../claim-admin-route-helpers';
import { parseClaimRejectionBody } from '../../parse-claim-decision-request';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Reject a claim as an administrator. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'claim.rejected_by_administrator';

  try {
    const { id } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveAdministrator(requestId, action, id);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The body ───────────────────────────────────────────────────────────
    const body = await readJsonBody(request);
    const { reason } = parseClaimRejectionBody(body);

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    const result = await stack.claimDecisions.reject({
      claimId: id,
      actor: { actorId: actor.actorId },
      reason,
    });

    return NextResponse.json({
      claimId: result.claimId,
      reportStatus: result.reportStatus,
    });
  } catch (error) {
    return claimAdminErrorResponse(error, requestId, action);
  }
}
