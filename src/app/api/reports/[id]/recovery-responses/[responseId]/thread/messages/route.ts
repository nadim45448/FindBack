/**
 * `POST /api/reports/[id]/recovery-responses/[responseId]/thread/messages` —
 * post a message into a Recovery Response's thread (FR-48, event 16).
 *
 * **The route is thin.** The three-participant authorisation, the read-only
 * refusal, and the audit event all live in the service. The route resolves
 * the member, validates the CSRF token, parses the body, rate-limits, and
 * maps the result.
 *
 * **The response carries no Sensitive Field.** It returns the message's id,
 * who posted it, the body, and when — the facts a client needs to append the
 * message to its own view of the thread.
 *
 * **The rate limit is keyed by member, not by IP.** A thread message is an
 * authenticated, per-member operation, and a campus NAT puts many members
 * behind one address — an IP bucket would throttle one member because a
 * hundred others had posted. The bucket is **this route's own**, so a
 * member's Lost-side thread posts do not consume the Found-side thread's
 * allowance and the two sides cannot throttle one another.
 */

import { NextResponse } from 'next/server';

import { log, readJsonBody, readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import {
  recoveryResponseErrorResponse,
  refuseRecoveryResponseWithoutCsrf,
  resolveRecoveryResponseMember,
  type RecoveryResponseRouteContext,
} from '../../recovery-response-route-helpers';

import { parseRecoveryResponseThreadMessageBody } from '../parse-recovery-response-thread-message-request';

/** Post a message into a Recovery Response's thread. */
export async function POST(
  request: Request,
  context: RecoveryResponseRouteContext,
): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'recovery_response.thread.message_posted';

  try {
    const { responseId } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveRecoveryResponseMember(requestId, action, responseId);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    //
    // **A state-changing request carries one.** The check comes after the
    // authorisation and before the body is read — a request from someone who
    // may not post has no state to protect.
    const csrfRefusal = await refuseRecoveryResponseWithoutCsrf(
      requestId,
      action,
      responseId,
      actor.actorId,
      actor.isAdministrator ? 'administrator' : 'member',
    );

    if (csrfRefusal) {
      return csrfRefusal;
    }

    // ── The body ───────────────────────────────────────────────────────────
    const raw = await readJsonBody(request);
    const draft = parseRecoveryResponseThreadMessageBody(raw);

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    // ── The rate limit ────────────────────────────────────────────────────
    //
    // **The limit is enforced in the route handler, before the use case
    // runs** (ADR-15). The limiter is a policy about traffic, not about the
    // thread's lifecycle, and it must run before the expensive work.
    const rateDecision = await stack.rateLimiter.consume(
      `recovery-response-thread:member:${actor.actorId}`,
      stack.rateLimits.threadMessageLimit,
      stack.rateLimits.threadMessageWindowSeconds,
    );

    if (!rateDecision.allowed) {
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: actor.isAdministrator ? 'administrator' : 'member',
        targetType: 'recovery-response',
        targetId: responseId,
      });

      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateDecision.retryAfterSeconds) } },
      );
    }

    const result = await stack.recoveryResponseThreads.postMessage({
      responseId,
      actor: {
        actorId: actor.actorId,
        isAdministrator: actor.isAdministrator,
      },
      body: draft.body,
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: actor.isAdministrator ? 'administrator' : 'member',
      targetType: 'recovery-response',
      targetId: responseId,
    });

    return NextResponse.json(
      {
        id: result.message.id,
        recoveryResponseId: result.recoveryResponseId,
        authorId: result.message.authorId,
        authorDisplayName: result.message.authorDisplayName,
        body: result.message.body,
        postedAt: result.message.postedAt,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof MalformedRequestError) {
      log(requestId, action, 'denied');

      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return recoveryResponseErrorResponse(error, requestId, action);
  }
}
