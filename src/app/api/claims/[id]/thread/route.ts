/**
 * `GET /api/claims/[id]/thread` — read a Claim's thread (FR-38).
 *
 * **The route is thin.** The three-participant authorisation, the
 * read-only state, and the isolation from the claimant's private evidence
 * all live in the service. The route resolves the member and maps the
 * result.
 *
 * **The response carries no Sensitive Field.** It returns the thread's
 * messages — the body, the author's display name, and when it was posted —
 * and the viewer's own relationship to the thread. It does not return the
 * claimant's reason or identifying details, because the thread never holds
 * them and participation in a thread is never permission to see them
 * (FR-39's notes; story 010 criterion 19).
 *
 * **A read-only thread is still readable.** The route answers a locked
 * thread with its full history and a `writable: false` flag — messages are
 * never deleted, and a locked thread keeps its full history.
 */

import { NextResponse } from 'next/server';

import { readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import {
  claimThreadErrorResponse,
  resolveThreadMember,
  type ClaimThreadRouteContext,
} from './claim-thread-route-helpers';

/** Read a Claim's thread. */
export async function GET(request: Request, context: ClaimThreadRouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'claim.thread.read';

  try {
    const { id } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveThreadMember(requestId, action, id);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    const thread = await stack.claimThreads.readThread({
      claimId: id,
      actor: {
        actorId: actor.actorId,
        isAdministrator: actor.isAdministrator,
      },
    });

    return NextResponse.json({
      claimId: thread.claimId,
      participation: thread.participation,
      writable: thread.writable,
      // **The reason the thread is read-only, when it is.** `null` when the
      // thread is writable — the field is a reason, and a thread with no
      // reason to refuse has no reason.
      readOnlyReason: thread.readOnlyReason,
      messages: thread.messages.map((message) => ({
        id: message.id,
        authorId: message.authorId,
        authorDisplayName: message.authorDisplayName,
        body: message.body,
        postedAt: message.postedAt,
      })),
    });
  } catch (error) {
    return claimThreadErrorResponse(error, requestId, action);
  }
}
