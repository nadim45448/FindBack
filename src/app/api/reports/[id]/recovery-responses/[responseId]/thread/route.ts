/**
 * `GET /api/reports/[id]/recovery-responses/[responseId]/thread` — read a
 * Recovery Response's thread (FR-47).
 *
 * **The route is thin.** The three-participant authorisation, the
 * read-only state, and the isolation from the responder's private evidence
 * all live in the service. The route resolves the member and maps the
 * result.
 *
 * **The response carries no Sensitive Field.** It returns the thread's
 * messages — the body, the author's display name, and when it was posted —
 * and the viewer's own relationship to the thread. It does not return the
 * responder's where-found, their observed identifying details, or their date
 * found, because the thread never holds them and participation in a thread is
 * never permission to see them (FR-39's notes; story 006).
 *
 * **A read-only thread is still readable.** The route answers a locked
 * thread with its full history and a `writable: false` flag — messages are
 * never deleted, and a locked thread keeps its full history.
 *
 * **A missing Response is a 403, never a 404.** The Response's existence is
 * a private fact about another member's assertion, so the route cannot
 * answer "that response is not real" to a stranger.
 */

import { NextResponse } from 'next/server';

import { readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import {
  recoveryResponseErrorResponse,
  resolveRecoveryResponseMember,
  type RecoveryResponseRouteContext,
} from '../recovery-response-route-helpers';

/** Read a Recovery Response's thread. */
export async function GET(
  request: Request,
  context: RecoveryResponseRouteContext,
): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'recovery_response.thread.read';

  try {
    const { responseId } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveRecoveryResponseMember(requestId, action, responseId);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    const thread = await stack.recoveryResponseThreads.readThread({
      responseId,
      actor: {
        actorId: actor.actorId,
        isAdministrator: actor.isAdministrator,
      },
    });

    return NextResponse.json({
      recoveryResponseId: thread.recoveryResponseId,
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
    return recoveryResponseErrorResponse(error, requestId, action);
  }
}
