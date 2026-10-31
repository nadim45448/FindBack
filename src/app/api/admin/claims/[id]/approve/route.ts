/**
 * `POST /api/admin/claims/[id]/approve` — the administrator's approval of a
 * Claim (FR-17, story 003).
 *
 * **Only an administrator may approve.** The actor is derived from the
 * session — never from the request — so a client cannot assert its own role.
 *
 * **The route is thin.** The gate, the row lock, the atomic write, the
 * auto-rejections, and the report's move all live in the service. The route
 * resolves the actor, calls the use case, and maps the result.
 *
 * **The response carries no stored field.** It returns the Claim's id, the
 * report's new status, and how many competing Claims the approval
 * auto-rejected — the shape an administrator's screen needs to refresh
 * itself, and nothing more.
 */

import { NextResponse } from 'next/server';

import { readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { claimAdminErrorResponse, resolveAdministrator } from '../../claim-admin-route-helpers';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Approve a claim as an administrator. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'claim.approved';

  try {
    const { id } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveAdministrator(requestId, action, id);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    const result = await stack.claimDecisions.approve({
      claimId: id,
      actor: { actorId: actor.actorId },
    });

    return NextResponse.json({
      claimId: result.claimId,
      reportStatus: result.reportStatus,
      // **How many competing Claims the approval auto-rejected.** The
      // administrator sees the item was contested and that the contest is
      // now settled.
      autoRejectedCount: result.autoRejected.length,
    });
  } catch (error) {
    return claimAdminErrorResponse(error, requestId, action);
  }
}
