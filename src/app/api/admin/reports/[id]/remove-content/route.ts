/**
 * `POST /api/admin/reports/[id]/remove-content` — the administrator's
 * content removal (FR-36).
 *
 * **A separate route from the close, and the separation is deliberate.** The
 * close moves the report to `Closed` and resolves its dependents; the
 * removal withholds the content and records why. FR-36 says the report's
 * status is "unchanged unless closure was separately requested" — so a
 * route that did both would be making two moderation decisions in one call,
 * and a caller that could ask for one would be choosing the other.
 *
 * **Only an administrator may call this.** The actor is derived from the
 * session — never from the request body — so a client cannot assert its own
 * role.
 *
 * **The route is thin.** The target kind's closed set, the reason's bound,
 * the idempotence rule, the content's mark, the removal row, and the audit
 * record all live in the service. The route parses the target and the
 * reason, and maps the result.
 *
 * **The response carries no stored field.** It returns the report's `id`,
 * the target that was withheld, and whether a new audit record was written —
 * the shape an administrator's screen needs to refresh itself.
 */

import { NextResponse } from 'next/server';

import {
  errorResponse,
  log,
  readCsrfToken,
  readJsonBody,
  readRequestId,
  readSessionCookie,
} from '@/app/api/_helpers';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import { isContentRemovalTargetKind } from '@/domain/moderation';

import {
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '@/lib/errors';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Remove inappropriate content from a report as an administrator. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'content.removed_by_administrator';

  try {
    const { id: reportId } = await context.params;
    const stack = buildIdentityStack();

    // ── The actor ──────────────────────────────────────────────────────────
    //
    // **The administrator flag alone grants nothing on a non-Active
    // account** — the resolver refuses a deactivated administrator before
    // this point.
    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

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
    const csrf = stack.csrf.validate(
      token ? stack.tokens.hashToken(token) : null,
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
    // **The target is a kind and an id.** The kind says which column or table
    // the id refers to — a report's image, a report's description, or a
    // thread message — and the id alone would be ambiguous across the three
    // surfaces.
    //
    // **The reason is required, and it is the administrator's own words.** The
    // route reads it as a raw string and the domain's value object decides
    // whether it is acceptable — so the length rule lives in one place.
    const raw = await readJsonBody(request);
    const target = raw['target'];
    const reason = raw['reason'];

    if (target === null || typeof target !== 'object' || Array.isArray(target)) {
      throw new MalformedRequestError('The "target" field is required.');
    }

    const kind = (target as Record<string, unknown>)['kind'];
    const targetId = (target as Record<string, unknown>)['targetId'];

    if (typeof kind !== 'string' || !isContentRemovalTargetKind(kind)) {
      throw new MalformedRequestError('The "target.kind" field is not a kind of content.');
    }

    if (typeof targetId !== 'string' || targetId.length === 0) {
      throw new MalformedRequestError('The "target.targetId" field is required.');
    }

    if (typeof reason !== 'string') {
      throw new MalformedRequestError('The "reason" field is required.');
    }

    // ── The use case ───────────────────────────────────────────────────────
    const listingsStack = buildListingsStack();

    const result = await listingsStack.contentRemovals.remove({
      reportId,
      actor: {
        actorId: actor.actorId,
        isAdministrator: actor.isAdministrator,
      },
      target: { kind, targetId },
      reason,
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: 'administrator',
      targetType: 'report',
      targetId: result.reportId,
    });

    return NextResponse.json({
      id: result.reportId,
      target: result.target,
      // **Whether a new audit record was written.** A repeated removal
      // succeeds — the content stays withheld — but the trail already held
      // this exact moderation act, so nothing new was recorded.
      recorded: result.recorded,
    });
  } catch (error) {
    return removeContentErrorResponse(error, requestId, action);
  }
}

/**
 * Map a thrown error to a response.
 *
 * **A target the system does not hold is a 404** — the administrator's
 * remedy is to pick a different piece of content, not to retry the same
 * one.
 *
 * **A field rule failure is a 400** that names the offending field.
 */
function removeContentErrorResponse(
  error: unknown,
  requestId: string,
  action: string,
): NextResponse {
  if (error instanceof MalformedRequestError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  if (error instanceof PermissionDeniedError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  if (error instanceof NotFoundError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ConflictError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  if (error instanceof ValidationError) {
    log(requestId, action, 'denied');

    return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
  }

  return errorResponse(error, requestId);
}
