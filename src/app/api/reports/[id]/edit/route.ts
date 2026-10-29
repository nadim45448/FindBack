/**
 * `PATCH /api/reports/[id]/edit` — the reporter's edit (FR-9, FR-19).
 *
 * **The route is thin.** Parse the changes, call the use case, map the
 * result. There is no business rule here: the ownership check, the
 * terminal-status block, the field validation, and the change detection all
 * live in the service.
 *
 * **The response carries no stored field.** It returns the report's `id`,
 * `status`, and `updatedAt` — and nothing else. The reporter's view of their
 * own report is a **read** concern governed by FR-39, and bolt `009` owns
 * it; returning the stored fields from the write path would create a second,
 * ungoverned read path.
 *
 * **An edit that changes nothing is a 200.** It is not an error: the member
 * asked for the report to end up in a state, and it already is in that
 * state. The response says so explicitly through `changed: false`, so a
 * client does not have to infer it.
 */

import { NextResponse } from 'next/server';

import { log } from '@/app/api/_helpers';

import {
  checkCsrf,
  listings,
  readJsonBody,
  readRequestId,
  reportLifecycleErrorResponse,
  resolveMemberActor,
  type ReportRouteContext,
} from '../../report-route-helpers';

import { parseReportEditBody } from '../../parse-report-edit-request';

/** Edit the report. */
export async function PATCH(request: Request, context: ReportRouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.edited';

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

    // ── The body ───────────────────────────────────────────────────────────
    const body = await readJsonBody(request);
    const changes = parseReportEditBody(body);

    // ── The use case ───────────────────────────────────────────────────────
    const stack = listings();

    const result = await stack.reportEdits.edit({
      reportId: id,
      actor: { actorId: resolved.actor.actorId },
      changes,
    });

    log(requestId, action, 'success', {
      actorId: resolved.actor.actorId,
      actorRole: 'member',
      targetType: 'report',
      targetId: result.report.id,
    });

    // **No stored field is returned.** The id, the status, the timestamp, and
    // whether anything changed.
    return NextResponse.json({
      id: result.report.id,
      status: result.report.status,
      updatedAt: result.report.updatedAt.toISOString(),
      changed: result.outcome.kind === 'Changed',
    });
  } catch (error) {
    return reportLifecycleErrorResponse(error, requestId, action);
  }
}
