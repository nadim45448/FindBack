/**
 * The shared helpers for the report lifecycle routes.
 *
 * **The route is thin**: parse the input, call the use case, map the result
 * to a response. These helpers are the *mechanical* parts of that rule — the
 * actor's derivation, the CSRF check, and the error mapping — so the four
 * lifecycle routes cannot drift apart on them.
 *
 * **The actor is derived from the session, never from the request.** The
 * ownership check is a domain rule; the *identity* the check compares
 * against is a transport concern, and this module is where it is read.
 */

import { NextResponse } from 'next/server';

import { hasMemberCapability, type ActorContext } from '@/domain/accounts';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import {
  errorResponse,
  log,
  readCsrfToken,
  readJsonBody,
  readRequestId,
  readSessionCookie,
} from '@/app/api/_helpers';

import { ConflictError, TerminalStateError } from '@/lib/errors';
import { ImageRejectedError, ImageStorageError } from '@/application/listings/ports/image-store';
import { CampusAreaUnavailableError } from '@/application/listings/ports/campus-area-reader';

import { MalformedRequestError } from './parse-report-request';

/** The route's dynamic parameter. */
export interface ReportRouteContext {
  readonly params: Promise<{ id: string }>;
}

/**
 * The outcome of resolving the acting member.
 *
 * **The actor and the refusal travel together.** A route reads
 * `if (outcome.actor === null) { return outcome.refusal; }` — and there is
 * no way to get a refusal without also seeing why, or to get an actor
 * without the refusal having been checked.
 */
export interface ResolvedActor {
  /** The acting member, or `null` when the request was refused. */
  readonly actor: ActorContext | null;
  /** The response to return when the actor is refused. */
  readonly refusal: NextResponse;
}

/**
 * Resolve the acting member from the session.
 *
 * **An anonymous request is refused before anything is read.** There is no
 * point parsing a body that will be discarded, and a report operation must
 * have an actor: `reporterId` is server-derived, never client-asserted.
 */
export async function resolveMemberActor(
  requestId: string,
  action: string,
): Promise<ResolvedActor> {
  const identity = buildIdentityStack();

  const token = await readSessionCookie();
  const actor = token ? await identity.resolver.resolve(token) : null;

  if (!actor) {
    log(requestId, action, 'denied', { actorRole: 'member' });

    return {
      actor: null,
      refusal: NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 }),
    };
  }

  // **The `Pending` restriction is enforced once, at the `ActorContext`
  // boundary** — the route asks the context what the actor may do, and does
  // not re-read the account or write its own status check.
  if (!hasMemberCapability(actor)) {
    log(requestId, action, 'denied', {
      actorId: actor.actorId,
      actorRole: 'member',
    });

    return {
      actor: null,
      refusal: NextResponse.json(
        { error: 'You do not have access to this.' },
        { status: 403 },
      ),
    };
  }

  return { actor, refusal: NextResponse.json({}) };
}

/**
 * Validate the request's CSRF token.
 *
 * @returns the refusal response, or `null` when the token is valid.
 */
export async function checkCsrf(
  requestId: string,
  action: string,
): Promise<NextResponse | null> {
  const identity = buildIdentityStack();

  const token = await readSessionCookie();
  const csrfToken = await readCsrfToken();

  const csrf = identity.csrf.validate(
    token ? identity.tokens.hashToken(token) : null,
    csrfToken,
  );

  if (!csrf.valid) {
    log(requestId, action, 'denied');

    return NextResponse.json(
      { error: 'Your request could not be verified.' },
      { status: 403 },
    );
  }

  return null;
}

/**
 * Map a thrown error to a response.
 *
 * **The listings errors are mapped here rather than in the shared helper**,
 * because several of them have no counterpart in the identity module's error
 * set: the image store's two failures, the campus-area read failure, and the
 * two lifecycle refusals.
 *
 * **The two lifecycle refusals are different answers.**
 *
 * - A **terminal report** is a 409 — the request is well-formed, and the
 *   report's state conflicts with it.
 * - A **conflict** is a 409 too, but its message is the domain's, because
 *   FR-10 requires the 409 to point at the Withdraw action.
 *
 * **No response carries a field's value.** The validation errors carry the
 * field *name* and the rule, never what was submitted — the name is not
 * sensitive, the value might be (an over-long exact place is an FR-37
 * Sensitive Field).
 */
export function reportLifecycleErrorResponse(
  error: unknown,
  requestId: string,
  action: string,
): NextResponse {
  if (error instanceof ImageRejectedError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: 'image' }, { status: 400 });
  }

  if (error instanceof ImageStorageError) {
    log(requestId, action, 'error');

    return NextResponse.json(
      { error: 'The image could not be stored. Please try again.' },
      { status: 503 },
    );
  }

  if (error instanceof CampusAreaUnavailableError) {
    log(requestId, action, 'error');

    return NextResponse.json(
      { error: 'The report could not be saved right now. Please try again.' },
      { status: 503 },
    );
  }

  if (error instanceof MalformedRequestError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  if (error instanceof ConflictError) {
    // **The domain's message, verbatim.** FR-10 requires the 409 to point at
    // the Withdraw action.
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof TerminalStateError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof ValidationError) {
    // **A field rule failure is a 400**, identifying the offending field.
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}

/** The listings stack, for a route that needs it. */
export function listings(): ReturnType<typeof buildListingsStack> {
  return buildListingsStack();
}

/** The identity stack, for a route that needs it. */
export function identity(): ReturnType<typeof buildIdentityStack> {
  return buildIdentityStack();
}

/** Read a JSON request body. */
export { readJsonBody };

/** The request id for the current request. */
export { readRequestId };

/** Import the validation error for the helper's own use. */
import { ValidationError } from '@/lib/errors';
