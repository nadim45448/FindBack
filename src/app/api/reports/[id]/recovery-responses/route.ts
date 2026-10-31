/**
 * `POST /api/reports/[id]/recovery-responses` — submit a Recovery Response
 * against a Lost report (FR-40, FR-44).
 *
 * **The route is thin.** Parse the input, call the use case, map the result
 * to a response. There is no business rule here: the gate that refuses an
 * own report, a closed report, a confirmed match, and a second live response
 * lives in the domain; the field lengths live in the value objects; the date
 * bound and the campus-area membership live in the validator.
 *
 * **The 403s are the route's own answers, not the shared helper's.** The
 * shared `errorResponse` maps a `PermissionDeniedError` to a **generic**
 * "You do not have access to this." — which is right for the identity module,
 * where the reason must not be revealed, and wrong here. FR-40 requires a
 * **clear message**: a member responding to their own report must be told
 * *that* is why, and a member whose account is not active must be told
 * *that*. So this route maps the permission failure itself.
 *
 * **The response carries no Sensitive Field.** It returns the Response's
 * `id`, its `status`, and the `submittedAt` — and nothing else. Not the
 * exact place, not the observed identifying details, not the image. Those
 * are FR-37 Sensitive Fields, and the write path is not a place to hand them
 * back. The responder reaches their own Response through the authenticated
 * surface (FR-39), not through the submit response.
 *
 * **The `reportId` comes from the path.** The body's own `reportId` is never
 * read — a client cannot redirect a Response at another report by putting a
 * different id in the body.
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

import {
  parseMultipartRecoveryResponseBody,
  parseRecoveryResponseBody,
  type ParsedRecoveryResponseRequest,
} from './parse-recovery-response-request';

import {
  RecoveryResponseSubmissionRefusedError,
  type RecoveryResponseSubmissionService,
} from '@/application/listings/recovery-response-submission-service';
import { DuplicateLiveRecoveryResponseError } from '@/application/listings/ports/recovery-response-repository';
import { ImageRejectedError, ImageStorageError } from '@/application/listings/ports/image-store';
import { CampusAreaUnavailableError } from '@/application/listings/ports/campus-area-reader';

import { PermissionDeniedError } from '@/lib/errors';

/** The route's dynamic parameter. */
interface RecoveryResponseRouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Submit a Recovery Response. */
export async function POST(
  request: Request,
  context: RecoveryResponseRouteContext,
): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'recovery-response.submitted';

  try {
    const { id: reportId } = await context.params;

    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **An anonymous request is refused before anything is read.** A Recovery
    // Response must have a responder: `responderId` is server-derived, never
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
    // **The message is specific**, because FR-40 requires a clear one: a
    // member whose account is pending must be told that *is* the reason, and
    // must not be left guessing.
    if (!hasMemberCapability(actor)) {
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
      });

      return NextResponse.json(
        { error: 'Your account must be active before you can respond to an item.' },
        { status: 403 },
      );
    }

    // ── The rate limit ────────────────────────────────────────────────────
    //
    // **The limit is enforced here, in the route handler, before the use
    // case runs** (ADR-15). The limiter is a policy about traffic, not about
    // the Recovery Response lifecycle, and it must run before the expensive
    // work.
    //
    // **The bucket is keyed by member, not by IP.** A response submission is
    // an authenticated, per-member operation, and a campus NAT puts many
    // members behind one address — an IP bucket would throttle one member
    // because a hundred others had responded.
    const rateDecision = await listings.rateLimiter.consume(
      `recovery-response:member:${actor.actorId}`,
      listings.rateLimits.recoveryResponseLimit,
      listings.rateLimits.recoveryResponseWindowSeconds,
    );

    if (!rateDecision.allowed) {
      log(requestId, action, 'denied', {
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
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
      });

      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The body ───────────────────────────────────────────────────────────
    const parsed = await readRequest(request, reportId);

    // ── The use case ───────────────────────────────────────────────────────
    const result = await listings.recoveryResponses.submit({
      draft: parsed.draft,
      actor: {
        actorId: actor.actorId,
        // **The capability is the account's state, resolved once.** The
        // service asks the question rather than re-deriving the answer.
        isAccountActive: hasMemberCapability(actor),
      },
      image: parsed.image ?? undefined,
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: 'member',
      targetType: 'recovery-response',
      targetId: result.responseId,
    });

    // **No stored field is returned.** The id, the status, and the
    // submission time — nothing that FR-37 governs. The timestamp is the
    // persisted row's own, carried through the use case; the route reads no
    // clock of its own.
    return NextResponse.json(
      {
        id: result.responseId,
        status: result.status,
        submittedAt: result.submittedAt.toISOString(),
      },
      {
        status: 201,
        headers: { Location: `/api/recovery-responses/${result.responseId}` },
      },
    );
  } catch (error) {
    return recoveryResponseErrorResponse(error, requestId, action);
  }
}

/**
 * Read the request body.
 *
 * **The content type decides the parser, and the parser decides the
 * fields.** A `multipart/form-data` request goes through the multipart
 * parser; anything else goes through the JSON parser. An unknown content
 * type is a malformed request rather than a best-effort parse.
 */
async function readRequest(
  request: Request,
  reportId: string,
): Promise<ParsedRecoveryResponseRequest> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    return parseMultipartRecoveryResponseBody(request, reportId);
  }

  if (contentType.includes('application/json')) {
    const body = await readJsonBody(request);

    return { draft: parseRecoveryResponseBody(body, reportId), image: null };
  }

  throw new MalformedRequestError(
    'The request must be sent as JSON, or as a form with an image.',
  );
}

/**
 * Map a thrown error to a response.
 *
 * **The permission failure carries its own message.** The shared helper's
 * generic answer is right for the identity module and wrong here, because
 * FR-40 requires the member to be told *which* rule refused them — and
 * because a member who is told "you already have a response open" and a
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
function recoveryResponseErrorResponse(
  error: unknown,
  requestId: string,
  action: string,
): NextResponse {
  if (error instanceof PermissionDeniedError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof RecoveryResponseSubmissionRefusedError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof DuplicateLiveRecoveryResponseError) {
    // **The uniqueness constraint fired.** The application's duplicate check
    // passed — a race, or a path that bypassed it — and the database
    // refused. The answer is the same 409 the check would have produced, so
    // the member sees one message for one situation.
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

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
      { error: 'The response could not be submitted right now. Please try again.' },
      { status: 503 },
    );
  }

  if (error instanceof MalformedRequestError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}

/** The submission service's type, re-exported for the route's tests. */
export type { RecoveryResponseSubmissionService };
