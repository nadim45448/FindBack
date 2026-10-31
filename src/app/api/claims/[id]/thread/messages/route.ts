/**
 * `POST /api/claims/[id]/thread/messages` — post a message into a Claim's
 * thread (FR-38).
 *
 * **The route is thin.** The three-participant authorisation, the
 * read-only refusal, and the audit event all live in the service. The route
 * resolves the member, validates the CSRF token, parses the body, and maps
 * the result.
 *
 * **The response carries no Sensitive Field.** It returns the message's id,
 * who posted it, the body, and when — the facts a client needs to append
 * the message to its own view of the thread.
 *
 * **A send failure inside the service never fails the post.** The message
 * is already written and its audit event is already recorded; the email is
 * not part of this path at all.
 */

import { NextResponse } from 'next/server';

import { log, readJsonBody, readRequestId } from '@/app/api/_helpers';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import {
  claimThreadErrorResponse,
  refuseWithoutCsrf,
  resolveThreadMember,
  type ClaimThreadRouteContext,
} from '../claim-thread-route-helpers';

import { parseThreadMessageBody } from '../parse-thread-message-request';

/** Post a message into a Claim's thread. */
export async function POST(
  request: Request,
  context: ClaimThreadRouteContext,
): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'claim.thread.message_posted';

  try {
    const { id } = await context.params;

    // ── The actor ──────────────────────────────────────────────────────────
    const actor = await resolveThreadMember(requestId, action, id);

    if (actor.kind === 'Refused') {
      return actor.response;
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    //
    // **A state-changing request carries one.** The check comes after the
    // authorisation and before the body is read — a request from someone
    // who may not post has no state to protect.
    const csrfRefusal = await refuseWithoutCsrf(
      requestId,
      action,
      id,
      actor.actorId,
      actor.isAdministrator ? 'administrator' : 'member',
    );

    if (csrfRefusal) {
      return csrfRefusal;
    }

    // ── The body ───────────────────────────────────────────────────────────
    const raw = await readJsonBody(request);
    const draft = parseThreadMessageBody(raw);

    // ── The use case ───────────────────────────────────────────────────────
    const stack = buildListingsStack();

    // ── The rate limit ────────────────────────────────────────────────────
    //
    // **The limit is enforced in the route handler, before the use case
    // runs** (ADR-15). The limiter is a policy about traffic, not about the
    // thread's lifecycle, and it must run before the expensive work.
    //
    // **The bucket is keyed by member, not by IP.** A thread message is an
    // authenticated, per-member operation, and a campus NAT puts many
    // members behind one address — an IP bucket would throttle one member
    // because a hundred others had posted.
    const rateDecision = await stack.rateLimiter.consume(
      `thread-message:member:${actor.actorId}`,
      stack.rateLimits.threadMessageLimit,
      stack.rateLimits.threadMessageWindowSeconds,
    );

    if (!rateDecision.allowed) {
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: actor.isAdministrator ? 'administrator' : 'member',
        targetType: 'claim',
        targetId: id,
      });

      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateDecision.retryAfterSeconds) } },
      );
    }

    const result = await stack.claimThreads.postMessage({
      claimId: id,
      actor: {
        actorId: actor.actorId,
        isAdministrator: actor.isAdministrator,
      },
      body: draft.body,
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: actor.isAdministrator ? 'administrator' : 'member',
      targetType: 'claim',
      targetId: id,
    });

    return NextResponse.json(
      {
        id: result.message.id,
        claimId: result.claimId,
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

    return claimThreadErrorResponse(error, requestId, action);
  }
}
