/**
 * The shared helpers for the per-Claim thread routes.
 *
 * **The read and the post share one authorisation path, and the sharing is
 * the point.** The three participants — the claimant, the finder, and the
 * administrator — are the same three for both, and a route that made its
 * own check would be a second answer to "who may take part in this
 * thread?", and the two could disagree.
 *
 * **The refusal is a 403 with a generic message.** The story says a member
 * who is neither the claimant nor the finder "cannot view or post in it",
 * and the message "You do not have access to this." says nothing about
 * whether the Claim they asked about is real — which is exactly right,
 * because telling them would leak a fact about another member's claim.
 *
 * **The CSRF check comes after the authorisation, and before the body is
 * read.** A request from someone who may not post has no state to protect.
 */

import { NextResponse } from 'next/server';

import {
  errorResponse,
  log,
  readCsrfToken,
  readSessionCookie,
} from '@/app/api/_helpers';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import { NotFoundError, PermissionDeniedError, ValidationError } from '@/lib/errors';

import { ConflictError } from '@/lib/errors';

/** The route's dynamic parameter. */
export interface ClaimThreadRouteContext {
  readonly params: Promise<{ id: string }>;
}

/**
 * The resolved member, or a refusal to return.
 *
 * **The two outcomes are different types,** so a caller cannot use the
 * actor without having proved that a member is signed in.
 */
export type ThreadActorResult =
  | {
      readonly kind: 'Member';
      readonly actorId: string;
      readonly isAdministrator: boolean;
    }
  | { readonly kind: 'Refused'; readonly response: NextResponse };

/**
 * Resolve the member taking part in the thread, or refuse.
 *
 * **The actor is derived from the session — never from the request.** A
 * client cannot assert its own role, and a client cannot assert that it is
 * the claimant.
 *
 * **An anonymous request is refused with a 401.** The thread is member-only
 * — the claim's detail page requires a login — so "sign in to continue" is
 * the accurate answer, and it is the same answer the claim submission route
 * gives.
 */
export async function resolveThreadMember(
  requestId: string,
  action: string,
  claimId: string,
): Promise<ThreadActorResult> {
  const stack = buildIdentityStack();
  const token = await readSessionCookie();
  const actor = token ? await stack.resolver.resolve(token) : null;

  if (!actor) {
    log(requestId, action, 'denied', {
      targetType: 'claim',
      targetId: claimId,
    });

    return {
      kind: 'Refused',
      response: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }),
    };
  }

  return {
    kind: 'Member',
    actorId: actor.actorId,
    isAdministrator: actor.isAdministrator,
  };
}

/**
 * Validate the CSRF token for a state-changing request.
 *
 * **The token is keyed by the session,** so a request with no session has
 * nothing to key against, and the validation fails.
 *
 * @returns the refusal response, or `null` when the token is valid.
 */
export async function refuseWithoutCsrf(
  requestId: string,
  action: string,
  claimId: string,
  actorId: string,
  actorRole: 'member' | 'administrator',
): Promise<NextResponse | null> {
  const stack = buildIdentityStack();
  const token = await readSessionCookie();
  const csrfToken = await readCsrfToken();
  const csrf = stack.csrf.validate(
    token ? stack.tokens.hashToken(token) : null,
    csrfToken,
  );

  if (csrf.valid) {
    return null;
  }

  log(requestId, action, 'denied', {
    actorId,
    actorRole,
    targetType: 'claim',
    targetId: claimId,
  });

  return NextResponse.json(
    { error: 'Your request could not be verified.' },
    { status: 403 },
  );
}

/**
 * Map a thrown error to a response.
 *
 * **A refusal to take part is a 403,** and its message is the generic one
 * — it must not reveal whether the Claim exists.
 *
 * **A missing Claim is a 404.** That answer is only ever given to a
 * participant: the service reads the Claim before it decides participation,
 * so a non-participant asking about a Claim that does not exist is refused
 * with the 403 and told nothing.
 *
 * **A read-only thread is a 409.** The message names the path forward —
 * the claim was decided, or the report is no longer active — because a
 * member told only "you may not post" has no idea what to do instead.
 *
 * **A body that breaks its bound is a 400** that names the offending
 * field — the same answer the claim submission route gives.
 */
export function claimThreadErrorResponse(
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

  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
