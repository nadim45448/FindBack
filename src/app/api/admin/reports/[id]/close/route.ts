/**
 * `POST /api/admin/reports/[id]/close` — the administrator's Found-side
 * close (FR-21).
 *
 * **Only an administrator may call this.** The actor is derived from the
 * session — never from the request body — so a client cannot assert its own
 * role.
 *
 * **The route is thin.** The terminal-status block, the required reason,
 * the auto-rejection of the report's Pending Claims, the report's move to
 * `Closed`, the audit events, and the FR-29 emails all live in the service.
 * The route parses the reason and maps the result.
 *
 * **The response carries no stored field.** It returns the report's `id`,
 * its new `status`, and how many Claims the close auto-rejected — the shape
 * an administrator's screen needs to refresh itself, and nothing else.
 */

import { NextResponse } from 'next/server';

import { log, readCsrfToken, readJsonBody, readRequestId, readSessionCookie } from '@/app/api/_helpers';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import { NotFoundError, PermissionDeniedError, ValidationError } from '@/lib/errors';

import { ConflictError } from '@/lib/errors';

import { errorResponse } from '@/app/api/_helpers';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Close a Found report as an administrator. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.found_closed_by_administrator';

  try {
    const { id } = await context.params;
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
        targetId: id,
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
        targetId: id,
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

    const result = await listingsStack.reportCloses.close({
      reportId: id,
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
      targetId: result.report.id,
    });

    return NextResponse.json({
      id: result.report.id,
      status: result.status,
      // **How many Claims the close auto-rejected.** The administrator sees
      // that the item was contested and that the contest is now ended.
      autoRejectedCount: result.autoRejected.length,
    });
  } catch (error) {
    return closeErrorResponse(error, requestId, action);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **A terminal report is a 409** — the report is already closed or
 * returned, and the administrator's remedy is to look at the report, not
 * to try again.
 *
 * **A missing report is a 404**, and a field rule failure is a **400** that
 * names the offending field.
 */
function closeErrorResponse(error: unknown, requestId: string, action: string): NextResponse {
  if (error instanceof MalformedRequestError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 400 });
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
