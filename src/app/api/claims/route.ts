/**
 * `POST /api/claims` — submit a Claim against a Found report (FR-15).
 *
 * **The route is thin.** Parse the input, call the use case, map the result
 * to a response. There is no business rule here: the account's capability is
 * read from the `ActorContext`, the field lengths live in the value objects,
 * the date bound lives in the validator, and the gate that refuses a
 * duplicate, an own report, and a closed report lives in the domain.
 *
 * **The 403s are the route's own answers, not the shared helper's.** The
 * shared `errorResponse` maps a `PermissionDeniedError` to a **generic**
 * "You do not have access to this." — which is right for the identity
 * module, where the reason must not be revealed, and wrong here. FR-15
 * requires a **clear message**: a member who claimed their own report must
 * be told *that* is why, and a member whose account is not active must be
 * told *that*. So this route maps the permission failure itself.
 *
 * **The response carries no Sensitive Field.** It returns the Claim's `id`,
 * its `status`, and the `submittedAt` — and nothing else. Not the reason,
 * not the identifying details. Those are FR-37 Sensitive Fields, and the
 * write path is not a place to hand them back.
 */

import { NextResponse } from 'next/server';

import { ValidationError } from '@/lib/errors';

import { hasMemberCapability } from '@/domain/accounts';

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

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import { parseClaimBody } from './parse-claim-request';

import {
  ClaimSubmissionRefusedError,
  type ClaimSubmissionService,
} from '@/application/listings/claim-submission-service';
import { DuplicatePendingClaimError } from '@/application/listings/ports/claim-repository';

import { PermissionDeniedError } from '@/lib/errors';

/** Submit a Claim. */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **An anonymous request is refused before anything is read.** A Claim
    // must have a claimant: `claimantId` is server-derived, never
    // client-asserted.
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
    //
    // **The message is specific**, because FR-15 requires a clear one: a
    // member whose account is pending must be told that *is* the reason, and
    // must not be left guessing.
    if (!hasMemberCapability(actor)) {
      log(requestId, 'claim.submitted', 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
      });

      return NextResponse.json(
        { error: 'Your account must be active before you can claim an item.' },
        { status: 403 },
      );
    }

    // ── The rate limit ────────────────────────────────────────────────────
    //
    // **The limit is enforced here, in the route handler, before the use
    // case runs** (ADR-15). The limiter is a policy about traffic, not about
    // the Claim lifecycle, and it must run before the expensive work.
    //
    // **The bucket is keyed by member, not by IP.** A claim submission is an
    // authenticated, per-member operation, and a campus NAT puts many
    // members behind one address — an IP bucket would throttle one member
    // because a hundred others had claimed.
    const rateDecision = await listings.rateLimiter.consume(
      `claim:member:${actor.actorId}`,
      listings.rateLimits.claimLimit,
      listings.rateLimits.claimWindowSeconds,
    );

    if (!rateDecision.allowed) {
      log(requestId, 'claim.submitted', 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
      });

      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateDecision.retryAfterSeconds) } },
      );
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    //
    // A state-changing request carries one. The token is keyed by the
    // session, so a request with no session has nothing to key against.
    const csrfToken = await readCsrfToken();
    const csrf = identity.csrf.validate(
      token ? identity.tokens.hashToken(token) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      log(requestId, 'claim.submitted', 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
      });

      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The body ───────────────────────────────────────────────────────────
    const body = await readJsonBody(request);
    const draft = parseClaimBody(body);

    // ── The use case ───────────────────────────────────────────────────────
    const result = await listings.claims.submit({
      draft,
      actor: {
        actorId: actor.actorId,
        // **The capability is the account's state, resolved once.** The
        // service asks the question rather than re-deriving the answer.
        isAccountActive: hasMemberCapability(actor),
      },
    });

    log(requestId, 'claim.submitted', 'success', {
      actorId: actor.actorId,
      actorRole: 'member',
      targetType: 'claim',
      targetId: result.claim.id,
    });

    // **No stored field is returned.** The id, the status, and the
    // submission time — nothing that FR-37 governs.
    return NextResponse.json(
      {
        id: result.claim.id,
        status: result.claim.status,
        reportStatus: result.reportStatus,
        submittedAt: result.claim.submittedAt?.toISOString() ?? null,
      },
      {
        status: 201,
        headers: { Location: `/api/claims/${result.claim.id}` },
      },
    );
  } catch (error) {
    return claimErrorResponse(error, requestId);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **The permission failure carries its own message.** The shared helper's
 * generic answer is right for the identity module and wrong here, because
 * FR-15 requires the member to be told *which* rule refused them — and
 * because a member who is told "you already have a claim pending" and a
 * member who is told "this is your own report" have genuinely different
 * things to do next.
 *
 * **The duplicate is a 409**, because it is a conflict with an existing
 * state rather than a permission failure.
 *
 * **A field rule failure is a 400**, not the 422 the shared helper uses: a
 * field-level validation error identifies the offending field, and the
 * submission is not acceptable — the same answer the reports route gives.
 */
function claimErrorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof PermissionDeniedError) {
    log(requestId, 'claim.submitted', 'denied');

    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof ClaimSubmissionRefusedError) {
    log(requestId, 'claim.submitted', 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof DuplicatePendingClaimError) {
    // **The uniqueness constraint fired.** The application's duplicate check
    // passed — a race, or a path that bypassed it — and the database
    // refused. The answer is the same 409 the check would have produced, so
    // the member sees one message for one situation.
    log(requestId, 'claim.submitted', 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof MalformedRequestError) {
    log(requestId, 'claim.submitted', 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  if (error instanceof ValidationError) {
    log(requestId, 'claim.submitted', 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}

/** The submission service's type, re-exported for the route's tests. */
export type { ClaimSubmissionService };
