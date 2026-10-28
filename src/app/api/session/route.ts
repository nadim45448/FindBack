/**
 * `GET /api/session` — the current actor.
 *
 * Returns the resolved `ActorContext`: the account's id, its **status**, and
 * whether it is an administrator.
 *
 * **The status is the point.** A client that asks "what may this actor do?"
 * gets the answer from one place, and never re-derives it. The status is
 * read from the database on **every** request (story 006's edge case: a
 * stale cached context after deactivation is impossible by construction).
 *
 * A request with no session is answered 200 with `null` — "nobody is signed
 * in" is an answer, not an error.
 */

import { NextResponse } from 'next/server';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import { errorResponse, readRequestId, readSessionCookie } from '../_helpers';

export async function GET(): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();
    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor) {
      return NextResponse.json({ actor: null });
    }

    return NextResponse.json({
      actor: {
        id: actor.actorId,
        status: actor.status,
        isAdministrator: actor.isAdministrator,
        displayName: actor.displayName,
        capability: actor.capability,
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
