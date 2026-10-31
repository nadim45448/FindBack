/**
 * The shared helpers for the administrator's claim routes.
 *
 * **The three routes share one authorisation path, and the sharing is the
 * point.** The review screen and the two decisions must refuse exactly the
 * same actors for exactly the same reasons — a route that made its own
 * check would be a second answer to "who may decide a claim?", and the two
 * could disagree.
 *
 * **The refusal is a 403 with a generic message.** Unlike the member-side
 * claim route, an administrator who is refused is refused because they are
 * not an administrator, and there is nothing to explain: the reason *is*
 * the role. A member's refusal carries a specific message because the
 * member's remedy differs; an administrator's does not.
 *
 * **The CSRF check comes after the authorisation, and before the body is
 * read.** A request from a non-administrator is refused without the CSRF
 * token being examined — there is no state to protect from someone who
 * may not change it.
 */

import { NextResponse } from 'next/server';

import {
  errorResponse,
  log,
  readCsrfToken,
  readSessionCookie,
} from '@/app/api/_helpers';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import { ClaimDecisionConflictError } from '@/application/listings/claim-decision-service';

import { NotFoundError, ValidationError } from '@/lib/errors';

/** The route's dynamic parameter. */
export interface AdminRouteContext {
  readonly params: Promise<{ id: string }>;
}

/**
 * The resolved administrator, or a refusal to return.
 *
 * **The two outcomes are different types,** so a caller cannot use the
 * actor without having proved it is an administrator.
 */
export type AdminActorResult =
  | { readonly kind: 'Administrator'; readonly actorId: string }
  | { readonly kind: 'Refused'; readonly response: NextResponse };

/**
 * Resolve the administrator, or refuse.
 *
 * **The actor is derived from the session — never from the request.** A
 * client cannot assert its own role.
 */
export async function resolveAdministrator(
  requestId: string,
  action: string,
  claimId: string,
): Promise<AdminActorResult> {
  const stack = buildIdentityStack();
  const token = await readSessionCookie();
  const actor = token ? await stack.resolver.resolve(token) : null;

  if (!actor || !actor.isAdministrator) {
    log(requestId, action, 'denied', {
      actorId: actor?.actorId,
      actorRole: actor?.isAdministrator ? 'administrator' : 'member',
      targetType: 'claim',
      targetId: claimId,
    });

    return {
      kind: 'Refused',
      response: NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 }),
    };
  }

  // ── The CSRF token ───────────────────────────────────────────────────────
  //
  // **A state-changing request carries one.** The token is keyed by the
  // session, so a request with no session has nothing to key against.
  const csrfToken = await readCsrfToken();
  const csrf = stack.csrf.validate(
    token ? stack.tokens.hashToken(token) : null,
    csrfToken,
  );

  if (!csrf.valid) {
    log(requestId, action, 'denied', {
      actorId: actor.actorId,
      actorRole: 'administrator',
      targetType: 'claim',
      targetId: claimId,
    });

    return {
      kind: 'Refused',
      response: NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      ),
    };
  }

  return { kind: 'Administrator', actorId: actor.actorId };
}

/**
 * Map a thrown error to a response.
 *
 * **The conflict is a 409.** A decision that lost a race is a conflict with
 * an existing state, and the administrator's remedy is to look at the
 * recorded decision — not to try again.
 *
 * **A missing claim is a 404**, and a field rule failure is a **400** that
 * names the offending field — the same answer the member-side claim route
 * gives.
 */
export function claimAdminErrorResponse(
  error: unknown,
  requestId: string,
  action: string,
): NextResponse {
  if (error instanceof ClaimDecisionConflictError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof NotFoundError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
