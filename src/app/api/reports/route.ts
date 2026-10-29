/**
 * `POST /api/reports` — create a Lost or Found report (FR-6, FR-7).
 *
 * **One endpoint, not two.** FR-6 and FR-7 are the same operation with a
 * different type and a different date bound. Two endpoints would mean two
 * handlers, two parsers, and two chances for the two to drift — and the only
 * thing that differs between them is a value the domain already reads.
 *
 * **The route is thin.** Parse the input, call the use case, map the result
 * to a response. There is no business rule here: the date bound lives in the
 * validator, the campus-area membership lives in the validator, and the
 * field lengths live in the value objects.
 *
 * **The response carries no Sensitive Field.** It returns the report's
 * `id`, `type`, `status`, `createdAt`, and `updatedAt` — and nothing else.
 * Not the name, not the description, not the exact place. The creator's view
 * of their own report is a **read** concern governed by FR-39, and bolt
 * `009` owns it; returning the stored fields from the write path would
 * create a second, ungoverned read path.
 *
 * **The image is not in the JSON body.** It is uploaded as
 * `multipart/form-data` when present, because the blob store's upload path
 * takes bytes. The content type is **decided by the presence of an image
 * part**, not by the client.
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

import {
  MalformedRequestError,
  parseMultipartBody,
  parseReportBody,
  type ParsedReportRequest,
} from './parse-report-request';

import { ImageRejectedError, ImageStorageError } from '@/application/listings/ports/image-store';
import { CampusAreaUnavailableError } from '@/application/listings/ports/campus-area-reader';

/** Create a report. */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const identity = buildIdentityStack();
    const listings = buildListingsStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **An anonymous request is refused before anything is read.** There is
    // no point parsing a body that will be discarded, and a report must
    // have a reporter: `reporterId` is server-derived, never client-asserted.
    const token = await readSessionCookie();
    const actor = token ? await identity.resolver.resolve(token) : null;

    if (!actor) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
    }

    // **The `Pending` restriction is enforced once, at the `ActorContext`
    // boundary** — the route asks the context what the actor may do, and
    // does not re-read the account or write its own status check.
    if (!hasMemberCapability(actor)) {
      log(requestId, 'report.created', 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
      });

      return NextResponse.json(
        { error: 'You do not have access to this.' },
        { status: 403 },
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
      log(requestId, 'report.created', 'denied', {
        actorId: actor.actorId,
        actorRole: 'member',
      });

      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The body ───────────────────────────────────────────────────────────
    //
    // **The content type is decided by the presence of an image part.** A
    // request that claims `multipart/form-data` with no image part is a
    // malformed request, not a report without an image.
    const parsed = await readRequest(request);

    // ── The use case ───────────────────────────────────────────────────────
    const result = await listings.reports.create({
      draft: parsed.draft,
      actor: { actorId: actor.actorId },
      image: parsed.image,
    });

    log(requestId, 'report.created', 'success', {
      actorId: actor.actorId,
      actorRole: 'member',
      targetType: 'report',
      targetId: result.report.id,
    });

    // **No stored field is returned.** The id, the type, the status, and the
    // two timestamps — nothing that FR-39 governs.
    return NextResponse.json(
      {
        id: result.report.id,
        type: result.report.type,
        status: result.report.status,
        createdAt: result.report.createdAt.toISOString(),
        updatedAt: result.report.updatedAt.toISOString(),
      },
      {
        status: 201,
        headers: { Location: `/api/reports/${result.report.id}` },
      },
    );
  } catch (error) {
    return listingsErrorResponse(error, requestId);
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
async function readRequest(request: Request): Promise<ParsedReportRequest> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    return parseMultipartBody(request);
  }

  if (contentType.includes('application/json')) {
    const body = await readJsonBody(request);

    return { draft: parseReportBody(body), image: null };
  }

  throw new MalformedRequestError(
    'The request must be sent as JSON, or as a form with an image.',
  );
}

/**
 * Map a thrown error to a response.
 *
 * **The listings errors are mapped here rather than in the shared helper**,
 * because two of them have no counterpart in the identity module's error
 * set: the image store's two failures and the campus-area read failure.
 *
 * **The image failure and the blob failure are different answers.** A
 * rejected image is the member's submission being wrong (400); a failed
 * upload is the infrastructure being unavailable (503). And the campus-area
 * read failure is a 503 too — the set is **required input**, so its absence
 * is a refusal, not a permissive default.
 *
 * **No response carries a field's value.** The validation errors carry the
 * field *name* and the rule, never what was submitted — the name is not
 * sensitive, the value might be (an over-long exact place is an FR-37
 * Sensitive Field).
 */
function listingsErrorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof ImageRejectedError) {
    log(requestId, 'report.created', 'denied');

    return NextResponse.json({ error: error.message, field: 'image' }, { status: 400 });
  }

  if (error instanceof ImageStorageError) {
    log(requestId, 'report.created', 'error');

    return NextResponse.json(
      { error: 'The image could not be stored. Please try again.' },
      { status: 503 },
    );
  }

  if (error instanceof CampusAreaUnavailableError) {
    log(requestId, 'report.created', 'error');

    return NextResponse.json(
      { error: 'The report could not be submitted right now. Please try again.' },
      { status: 503 },
    );
  }

  if (error instanceof MalformedRequestError) {
    log(requestId, 'report.created', 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  if (error instanceof ValidationError) {
    // **A field rule failure is a 400 here**, not the 422 the shared helper
    // uses. The design's error table is explicit: a field-level validation
    // error identifies the offending field and is a 400 — the submission is
    // not acceptable, and the member is told which field to fix. The shared
    // helper's 422 belongs to the identity module's own contract, and this
    // route is not that module.
    log(requestId, 'report.created', 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
