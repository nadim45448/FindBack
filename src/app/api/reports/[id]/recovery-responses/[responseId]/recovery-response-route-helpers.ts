/**
 * The shared helpers for the per-Recovery-Response routes.
 *
 * **The thread's read and post, and the responder's withdrawal, share one
 * authorisation path.** The thread's participants — the responder, the
 * Lost-report owner, and the administrator — are the same three for both the
 * read and the post, and a route that made its own check would be a second
 * answer to "who may take part in this thread?", and the two could
 * disagree.
 *
 * **The refusal is a 403 with a generic message.** The story says a member
 * who is neither the responder nor the owner "cannot view or post in it", and
 * the message "You do not have access to this." says nothing about whether
 * the Response they asked about is real — which is exactly right, because
 * telling them would leak a fact about another member's response.
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

import { hasMemberCapability } from '@/domain/accounts';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

/** The route's dynamic parameter. */
export interface RecoveryResponseRouteContext {
  readonly params: Promise<{ id: string; responseId: string }>;
}

/**
 * The resolved member, or a refusal to return.
 *
 * **The two outcomes are different types,** so a caller cannot use the actor
 * without having proved that a member is signed in.
 *
 * **The capability travels with the actor.** The `ActorContext` is the
 * identity every downstream unit consumes, and the `Pending` restriction is
 * enforced once at that boundary — so the route carries the resolved
 * context's capability rather than re-reading the account to derive it.
 */
export type RecoveryResponseActorResult =
  | {
      readonly kind: 'Member';
      readonly actorId: string;
      readonly isAdministrator: boolean;
      /**
       * Whether the actor's account confers the `member` capability.
       *
       * **This is the `ActorContext`'s own answer,** carried across so a
       * route never re-reads the account and never writes its own status
       * check.
       */
      readonly isAccountActive: boolean;
    }
  | { readonly kind: 'Refused'; readonly response: NextResponse };

/**
 * Resolve the member taking part, or refuse.
 *
 * **The actor is derived from the session — never from the request.** A
 * client cannot assert its own role, and a client cannot assert that it is
 * the responder.
 *
 * **An anonymous request is refused with a 401.** The thread is member-only,
 * so "sign in to continue" is the accurate answer.
 */
export async function resolveRecoveryResponseMember(
  requestId: string,
  action: string,
  responseId: string,
): Promise<RecoveryResponseActorResult> {
  const stack = buildIdentityStack();
  const token = await readSessionCookie();
  const actor = token ? await stack.resolver.resolve(token) : null;

  if (!actor) {
    log(requestId, action, 'denied', {
      targetType: 'recovery-response',
      targetId: responseId,
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
    // **The capability is the account's state, resolved once at the
    // `ActorContext` boundary.** The route carries it; the service asks the
    // question rather than re-deriving the answer.
    isAccountActive: hasMemberCapability(actor),
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
export async function refuseRecoveryResponseWithoutCsrf(
  requestId: string,
  action: string,
  responseId: string,
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
    targetType: 'recovery-response',
    targetId: responseId,
  });

  return NextResponse.json(
    { error: 'Your request could not be verified.' },
    { status: 403 },
  );
}

/**
 * Map a thrown error to a response.
 *
 * **A refusal to take part is a 403,** and its message is the generic one —
 * it must not reveal whether the Response exists.
 *
 * **A read-only thread is a 409.** The message names the path forward — the
 * response is closed, or the report is no longer active — because a member
 * told only "you may not post" has no idea what to do instead.
 *
 * **A body that breaks its bound is a 400** that names the offending field.
 */
export function recoveryResponseErrorResponse(
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

  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
