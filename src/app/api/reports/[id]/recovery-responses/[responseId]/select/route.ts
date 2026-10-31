/**
 * `POST /api/reports/[id]/recovery-responses/[responseId]/select` — the
 * owner's provisional selection of one candidate (FR-43).
 *
 * **The route is thin.** The ownership check, the report-status whitelist, the
 * `Match Confirmed` lock, and the already-selected no-op all live in the
 * domain; the response's move and the report's move live in the service. The
 * route resolves the actor, parses the ids, and maps the result.
 *
 * **Both ids come from the path.** The body is not read at all — a selection
 * names a report and a response, and both are in the URL. A client cannot
 * redirect the selection at another report by putting a different id in a
 * body.
 *
 * **The 403s carry the domain's own message.** The shared `errorResponse`
 * maps a `PermissionDeniedError` to a generic "You do not have access to
 * this." — right for the identity module, where the reason must not be
 * revealed, and wrong here. A member who is not the owner and a member whose
 * report is not open have genuinely different things to do next, so this
 * route maps the permission failure itself.
 *
 * **The response carries no Sensitive Field.** It returns the response's
 * `id`, its status, the report's status, and whether anything was written —
 * the shape the owner's screen needs to refresh itself, and nothing else.
 */

import { NextResponse } from 'next/server';

import { hasMemberCapability } from '@/domain/accounts';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import {
  errorResponse,
  log,
  readCsrfToken,
  readRequestId,
  readSessionCookie,
} from '@/app/api/_helpers';

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

/** The route's dynamic parameters. */
interface RouteContext {
  readonly params: Promise<{ id: string; responseId: string }>;
}

/** Select a Recovery Response for verification. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'recovery-response.selected_for_verification';

  try {
    const { id: reportId, responseId } = await context.params;

    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **An anonymous request is refused before anything is read.** The
    // selection is the owner's own act.
    const token = await readSessionCookie();
    const actor = token ? await identity.resolver.resolve(token) : null;

    if (!actor) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
    }

    // ── The account's capability ───────────────────────────────────────────
    //
    // **The `Pending` restriction is enforced once, at the `ActorContext`
    // boundary.** The route asks the context what the actor may do and does
    // not re-read the account or write its own status check.
    if (!hasMemberCapability(actor)) {
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
        targetType: 'report',
        targetId: reportId,
      });

      return NextResponse.json(
        { error: 'Your account must be active before you can select a response.' },
        { status: 403 },
      );
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    const csrfToken = await readCsrfToken();
    const csrf = identity.csrf.validate(
      token ? identity.tokens.hashToken(token) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
        targetType: 'report',
        targetId: reportId,
      });

      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The ids ────────────────────────────────────────────────────────────
    //
    // **A path id that is not a UUID is a malformed request,** not a 404.
    // The route checks the shape before the database is asked, so a nonsense
    // id is refused as a malformed request rather than becoming a lookup
    // that finds nothing.
    if (!isUuid(reportId) || !isUuid(responseId)) {
      throw new MalformedRequestError('The report and response ids must be valid.');
    }

    // ── The use case ───────────────────────────────────────────────────────
    const result = await listings.recoveryResponseSelections.select({
      reportId,
      responseId,
      actor: {
        actorId: actor.actorId,
        // **The capability is the account's state, resolved once.** The
        // service asks the question rather than re-deriving the answer.
        isAccountActive: hasMemberCapability(actor),
      },
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: 'member',
      targetType: 'recovery-response',
      targetId: result.responseId,
    });

    return NextResponse.json({
      id: result.responseId,
      status: result.status,
      reportStatus: result.reportStatus,
      // **Whether anything was written.** The idempotent no-op answers
      // `false`, so the owner's screen can tell "already selected" from
      // "selected now" without comparing timestamps.
      changed: result.changed,
    });
  } catch (error) {
    return selectionErrorResponse(error, requestId, action);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **A permission failure is a 403 and a state conflict is a 409.** A member
 * who is not the owner has no remedy here; a member whose report is not open
 * has to wait for it to open.
 *
 * **The concurrent-selection conflict is also a 409.** The partial unique
 * index fires when two owner sessions race, and the member's answer is the
 * same one the application's own check would have produced — one message for
 * one situation.
 */
function selectionErrorResponse(
  error: unknown,
  requestId: string,
  action: string,
): NextResponse {
  if (error instanceof PermissionDeniedError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof ConflictError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof MalformedRequestError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}

/**
 * True when the value is a UUID.
 *
 * **The shape is checked before the database is asked.** A path id that
 * cannot be a UUID is a malformed request, and saying so avoids a lookup
 * that is guaranteed to find nothing.
 */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
