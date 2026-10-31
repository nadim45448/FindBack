/**
 * `POST /api/admin/reports/[id]/recovery-responses/[responseId]/determine` —
 * the administrator recording the owner's determination (FR-43).
 *
 * **The route is thin, and the two-actor split is preserved here.** The route
 * resolves the *recorder* — the acting administrator — from the session, and
 * it reads the *maker* — the Lost report's owner — from the request body.
 * The service then checks the two halves separately against the database:
 * the recorder must be an administrator, and the maker must be the report's
 * owner as the server reads it. A client cannot name a different maker and
 * have it accepted.
 *
 * **The maker is still a request field, but it is not trusted.** FR-43 makes
 * the *determination* the owner's act and the *recording* the
 * administrator's. The administrator's screen asks the owner "did you
 * determine this?" and records the answer — so the maker travels in the body.
 * What the body cannot do is *assert* ownership: the service reads the
 * report's owner out of the database and compares, so a body naming someone
 * else is refused.
 *
 * **Only an administrator may call this.** The actor is derived from the
 * session — never from the request body — so a client cannot assert its own
 * role.
 *
 * **The response carries no Sensitive Field.** It returns the response's
 * `id`, its new status, the report's new status, and the audit event's id —
 * the shape the administrator's screen needs to refresh itself, and nothing
 * else.
 */

import { NextResponse } from 'next/server';

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

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

import { DeterminationOutcome } from '@/domain/recovery';

/** The route's dynamic parameters. */
interface RouteContext {
  readonly params: Promise<{ id: string; responseId: string }>;
}

/** Record a determination on a selected Recovery Response. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'recovery-response.determination_recorded';

  try {
    const { id: reportId, responseId } = await context.params;

    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The recorder ───────────────────────────────────────────────────────
    //
    // **The administrator flag alone grants nothing on a non-Active
    // account** — the resolver refuses a deactivated administrator before
    // this point.
    const token = await readSessionCookie();
    const actor = token ? await identity.resolver.resolve(token) : null;

    if (!actor || !actor.isAdministrator) {
      log(requestId, action, 'denied', {
        actorId: actor?.actorId,
        actorRole: actor?.isAdministrator ? 'administrator' : 'member',
        targetType: 'report',
        targetId: reportId,
      });

      return NextResponse.json({ error: 'You do not have access to this.' }, { status: 403 });
    }

    // ── The CSRF token ─────────────────────────────────────────────────────
    const csrfToken = await readCsrfToken();
    const csrf = identity.csrf.validate(
      token ? identity.tokens.hashToken(token) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      log(requestId, action, 'denied', {
        actorId: actor.actorId,
        actorRole: 'administrator',
        targetType: 'report',
        targetId: reportId,
      });

      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The body ───────────────────────────────────────────────────────────
    //
    // **Two fields are read by name.** The `outcome` is the owner's
    // determination; the `determinedByUserId` is the owner who made it. An
    // unknown key is dropped at this boundary — there is nowhere for it to
    // go.
    const body = await readJsonBody(request);

    const outcome = parseOutcome(body['outcome']);
    const determinedByUserId = parseDeterminedBy(body['determinedByUserId']);

    if (!isUuid(reportId) || !isUuid(responseId)) {
      throw new MalformedRequestError('The report and response ids must be valid.');
    }

    // ── The use case ───────────────────────────────────────────────────────
    const result = await listings.recoveryResponseDeterminations.record({
      reportId,
      responseId,
      determinedByUserId,
      outcome,
      actor: {
        actorId: actor.actorId,
        // **The capability is the account's state, resolved once.** The
        // service does not re-read the account and does not write its own
        // role guard.
        isAdministrator: actor.isAdministrator,
      },
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: 'administrator',
      targetType: 'recovery-response',
      targetId: result.responseId,
    });

    return NextResponse.json({
      id: result.responseId,
      status: result.status,
      reportStatus: result.reportStatus,
      // **The determination event's id.** The trail is the record of who
      // decided, and the administrator's screen shows that it was written.
      eventId: result.eventId,
    });
  } catch (error) {
    return determinationErrorResponse(error, requestId, action);
  }
}

/**
 * Parse the outcome the owner determined.
 *
 * **The two outcomes are spelled out literally.** A body naming a third
 * value is a malformed request rather than a default — a determination that
 * silently became `not_a_match` would close the owner's search without the
 * owner having said so.
 */
function parseOutcome(value: unknown): DeterminationOutcome {
  if (value === 'match_confirmed' || value === 'not_a_match') {
    return value;
  }

  throw new MalformedRequestError(
    'The "outcome" field must be "match_confirmed" or "not_a_match".',
  );
}

/**
 * Parse the owner who made the determination.
 *
 * **`null` is a legitimate value, and the service refuses it.** A recording
 * with no determination in it is not a determination — the administrator is
 * not deciding on their own — so the request is well-formed and the service
 * says no.
 */
function parseDeterminedBy(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || !isUuid(value)) {
    throw new MalformedRequestError(
      'The "determinedByUserId" field must be the owner\'s account id.',
    );
  }

  return value;
}

/**
 * Map a thrown error to a response.
 *
 * **A permission failure is a 403 and a state conflict is a 409.** An
 * administrator who is not the owner has no remedy here; an administrator
 * whose response is no longer selected has to look at the report.
 *
 * **The permission message is the domain's own.** The shared helper's
 * generic answer is right for the identity module and wrong here, because
 * the administrator needs to know *which* rule refused them.
 */
function determinationErrorResponse(
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

/**
 * True when the value is a UUID.
 *
 * **The shape is checked before the database is asked.** A path id that
 * cannot be a UUID is a malformed request, and saying so avoids a lookup
 * that is guaranteed to find nothing.
 */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
