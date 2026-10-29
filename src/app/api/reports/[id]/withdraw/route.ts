/**
 * `POST /api/reports/[id]/withdraw` — the reporter's withdrawal (FR-11).
 *
 * **The route is thin.** The gate — which differs by report type, and which
 * consults the dependent records' state rather than only the report's own
 * status — is a domain rule, and it lives in the service.
 *
 * **The withdrawal reaches `Closed`, never `Returned`.** The route reports
 * the status the report reached, so a client can render the outcome without
 * re-deriving the rule.
 *
 * **The route is `POST`, not `DELETE`.** A withdrawal is not a deletion: the
 * report and its history are preserved (PRD §10), and the report leaves the
 * active listings rather than ceasing to exist. A `POST` says "perform this
 * transition", which is what it is.
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

/** Withdraw the report. */
export async function POST(request: Request, context: ReportRouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.withdrawn';

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

    const result = await stack.reportWithdrawals.withdraw({
      reportId: id,
      actor: { actorId: resolved.actor.actorId },
    });

    log(requestId, action, 'success', {
      actorId: resolved.actor.actorId,
      actorRole: 'member',
      targetType: 'report',
      targetId: result.report.id,
    });

    // **The report's id, the status it reached, and the counts of what the
    // withdrawal ended.** The counts are the member's answer to "what
    // happened to my claim?" — and the status is always `Closed`.
    return NextResponse.json({
      id: result.report.id,
      status: result.status,
      rejectedClaims: result.rejectedClaims.length,
      resolvedRecoveryResponses: result.resolvedRecoveryResponses.length,
    });
  } catch (error) {
    return reportLifecycleErrorResponse(error, requestId, action);
  }
}
