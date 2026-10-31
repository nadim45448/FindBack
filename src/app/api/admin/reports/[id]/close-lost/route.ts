/**
 * `POST /api/admin/reports/[id]/close-lost` — the administrator's
 * **Lost-side** close (FR-21).
 *
 * **A separate route from the Found-side close, and the separation is
 * deliberate.** The Found-side close auto-rejects the report's Pending
 * Claims; the Lost-side close resolves the report's non-terminal Recovery
 * Responses. The two touch different tables, resolve different records, and
 * are recorded under different catalog events — FR-31 event 10 and FR-48
 * events 24, 25, and 27.
 *
 * **Neither close can close the other's reports.** The Found-side close
 * refuses a Lost report and this one refuses a Found report, because a close
 * that resolved the wrong dependent records would leave the report `Closed`
 * with live claimants or live responders attached to it.
 *
 * **The route does not choose the closure's route.** The ordinary close and
 * the exceptional post-`Match Confirmed` cancellation are distinguished by
 * the report's own responses, read from the database — a client that could
 * assert "this is an ordinary close" on a report whose matched response is
 * `Match Confirmed` would be choosing which audit event the report gets.
 *
 * **The route is thin.** The terminal check, the reason's bound, the route
 * decision, the responses' resolution, the report's move, and the audit
 * events all live in the service. The route parses the reason and maps the
 * result.
 *
 * **No email is sent.** FR-30 forbids a closure email to any responder, and
 * the service takes no email sender at all — so it *cannot* send one.
 *
 * **The response carries no stored field.** It returns the report's `id`,
 * its new `status`, the route it took, and how many responses the close
 * resolved.
 */

import { NextResponse } from 'next/server';

import {
  errorResponse,
  log,
  readCsrfToken,
  readJsonBody,
  readRequestId,
  readSessionCookie,
} from '@/app/api/_helpers';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/lib/errors';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Close a Lost report as an administrator. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.lost_closed_by_administrator';

  try {
    const { id: reportId } = await context.params;
    const stack = buildIdentityStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **The administrator flag alone grants nothing on a non-Active
    // account** — the resolver refuses a deactivated administrator before
    // this point.
    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor || !actor.isAdministrator) {
      log(requestId, action, 'denied', {
        actorId: actor?.actorId,
        actorRole: actor?.isAdministrator ? 'administrator' : 'member',
        targetType: 'report',
        targetId: reportId,
      });

      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    const csrfToken = await readCsrfToken();
    const csrf = stack.csrf.validate(
      token ? stack.tokens.hashToken(token) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: 'administrator',
        targetType: 'report',
        targetId: reportId,
      });

      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The body ───────────────────────────────────────────────────────────
    //
    // **The reason is required, and it is the administrator's own words.**
    // The route reads it as a raw string and the domain's value object
    // decides whether it is acceptable — so the length rule lives in one
    // place.
    const raw = await readJsonBody(request);
    const reason = raw['reason'];

    if (typeof reason !== 'string') {
      throw new MalformedRequestError('The "reason" field is required.');
    }

    // ── The use case ───────────────────────────────────────────────────────
    const listingsStack = buildListingsStack();

    const result = await listingsStack.lostReportCloses.close({
      reportId,
      actor: {
        actorId: actor.actorId,
        isAdministrator: actor.isAdministrator,
      },
      reason,
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: 'administrator',
      targetType: 'report',
      targetId: result.reportId,
    });

    return NextResponse.json({
      id: result.reportId,
      status: result.status,
      // **Which route the close took.** The administrator's screen needs to
      // know whether this was an ordinary close or an exceptional
      // cancellation — the two are different administrative acts with
      // different records.
      route: result.route,
      // **How many responses the close resolved.** The administrator sees
      // that the responders' workflow is now ended.
      resolvedCount: result.resolved.length,
    });
  } catch (error) {
    return closeLostErrorResponse(error, requestId, action);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **A terminal report is a 409** — the report is already closed or
 * returned, and the administrator's remedy is to look at the report, not to
 * try again.
 *
 * **A missing report is a 404**, and a field rule failure is a **400** that
 * names the offending field.
 */
function closeLostErrorResponse(
  error: unknown,
  requestId: string,
  action: string,
): NextResponse {
  if (error instanceof MalformedRequestError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  if (error instanceof PermissionDeniedError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof NotFoundError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ConflictError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
