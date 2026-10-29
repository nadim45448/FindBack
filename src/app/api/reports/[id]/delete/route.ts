/**
 * `DELETE /api/reports/[id]/delete` — the hard delete (FR-10).
 *
 * **The route is thin.** The gate — `Open` **and** interaction-free — is a
 * domain rule, and it lives in the service, not here.
 *
 * **The 409's message comes from the domain.** FR-10 says a hard delete of a
 * report that has an interaction returns HTTP 409 with a message pointing at
 * the Withdraw action. The route does not write that message; it maps the
 * domain's `ConflictError` to a 409 and passes the message through.
 *
 * **The route is `DELETE`, and the path segment is `delete`.** The verb
 * already says what the request does, and the segment keeps the report's
 * identity separate from the action in the path — `/api/reports/[id]/delete`
 * rather than `DELETE /api/reports/[id]`, so a future `GET /api/reports/[id]`
 * can occupy the report's own path without a method-based ambiguity.
 */

import { NextResponse } from 'next/server';

import { log } from '@/app/api/_helpers';

import {
  checkCsrf,
  listings,
  readRequestId,
  reportLifecycleErrorResponse,
  resolveMemberActor,
  type ReportRouteContext,
} from '../../report-route-helpers';

/** Delete the report. */
export async function DELETE(request: Request, context: ReportRouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.deleted';

  try {
    const { id } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const resolved = await resolveMemberActor(requestId, action);

    if (!resolved.actor) {
      return resolved.refusal;
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    const csrfRefusal = await checkCsrf(requestId, action);

    if (csrfRefusal) {
      return csrfRefusal;
    }

    // ── The use case ───────────────────────────────────────────────────────
    const stack = listings();

    await stack.reportDeletions.delete({
      reportId: id,
      actor: { actorId: resolved.actor.actorId },
    });

    log(requestId, action, 'success', {
      actorId: resolved.actor.actorId,
      actorRole: 'member',
      targetType: 'report',
      targetId: id,
    });

    // **The report's id and nothing else.** The report is gone, so there is
    // no stored field to return.
    return NextResponse.json({ id, deleted: true });
  } catch (error) {
    return reportLifecycleErrorResponse(error, requestId, action);
  }
}
