/**
 * `POST /api/admin/reports/[id]/confirm-returned` — the administrator
 * confirming a physical return (FR-23, FR-24, FR-25).
 *
 * **Only an administrator may call this.** The actor is derived from the
 * session — never from the request body — so a client cannot assert its own
 * role. FR-23 and FR-45 are explicit: a return is confirmed by an
 * administrator, never by the member and never by the Lost-side owner.
 *
 * **The route is thin.** The precondition, the receiver derivation, FR-25's
 * guard, the report's move, the confirmation row, and the audit event all
 * live in the service — **and the service is one implementation for both
 * directions.** The route does not know whether the report is Found or Lost;
 * it passes the report id and the substitute, and the service works out the
 * rest.
 *
 * **The client never names the receiver.** The default receiver is derived
 * from the report's own facts, so a body carrying a receiver id would be
 * asserting something the domain owns — and there is no field for one. The
 * body's only group is the *substitute*, and a substitute has a name rather
 * than an account.
 *
 * **The response carries no Sensitive Field.** It returns the report's `id`,
 * its new `status`, and the confirmation's `id` — the shape an administrator's
 * screen needs to refresh itself, and nothing else.
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

import { parseConfirmReturnedRequest } from './parse-confirm-returned-request';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Confirm a report as physically returned. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'returned.confirmed';

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
    // **The body's only group is the substitute.** The default receiver is
    // derived, so the client has nothing to say about it.
    const body = await readJsonBody(request);
    const substitute = parseConfirmReturnedRequest(body);

    // ── The use case ───────────────────────────────────────────────────────
    const listingsStack = buildListingsStack();

    const result = await listingsStack.returnConfirmations.confirm({
      reportId,
      actor: {
        actorId: actor.actorId,
        isAdministrator: actor.isAdministrator,
      },
      substitute,
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
      // **The confirmation's id.** The trail is the record of who received
      // the item, and the administrator's screen shows that it was written.
      confirmationId: result.confirmationId,
    });
  } catch (error) {
    return confirmReturnedErrorResponse(error, requestId, action);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **A missing report is a 404,** and a permission failure is a **403.** A
 * state conflict is a **409** — the report is not in its direction's
 * precondition status, it is already terminal, or another administrator
 * confirmed it first, and in each case the administrator's remedy is to look
 * at the report rather than to try again.
 *
 * **The permission and conflict messages are the domain's own.** The shared
 * helper's generic answer is right for the identity module and wrong here,
 * because the administrator needs to know *which* rule refused them.
 */
function confirmReturnedErrorResponse(
  error: unknown,
  requestId: string,
  action: string,
): NextResponse {
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

  if (error instanceof MalformedRequestError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
