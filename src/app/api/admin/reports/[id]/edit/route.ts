/**
 * `PATCH /api/admin/reports/[id]/edit` — the administrator's moderation edit
 * (FR-53).
 *
 * **Only an administrator may call this.** The actor is derived from the
 * session — never from the request body — so a client cannot assert its own
 * role.
 *
 * **The route is thin.** The terminal-status block, the field whitelist, the
 * validation, and the change detection all live in the service. The route
 * parses the changes and maps the result.
 *
 * **Image replacement travels as a form part.** FR-53 names image
 * replacement as one of the eight editable things, so the route accepts a
 * `multipart/form-data` request whose `image` part carries the replacement
 * — and a `application/json` request for the text fields alone. The
 * content type decides the parser; the parser decides the fields.
 *
 * **The response carries no stored field.** It returns the report's `id`,
 * `status`, and `updatedAt` — the same shape the reporter's edit returns, so
 * a client renders one view for both.
 */

import { NextResponse } from 'next/server';

import { log, readCsrfToken, readRequestId, readSessionCookie } from '@/app/api/_helpers';

import { identity, listings, reportLifecycleErrorResponse } from '../../../../reports/report-route-helpers';

import { parseAdministratorEditBody } from './parse-admin-edit-request';

/** The route's dynamic parameter. */
interface RouteContext {
  readonly params: Promise<{ id: string }>;
}

/** Edit the report as an administrator. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  const requestId = await readRequestId();
  const action = 'report.edited_by_administrator';

  try {
    const { id } = await context.params;
    const stack = identity();

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
        targetId: id,
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
      });

      return NextResponse.json(
        { error: 'Your request could not be verified.' },
        { status: 403 },
      );
    }

    // ── The body ───────────────────────────────────────────────────────────
    //
    // **The same parser the reporter's edit uses, for the text fields.**
    // FR-53's editable set is the reporter's content set plus image
    // replacement, and the content fields are parsed identically — so a field
    // the administrator may not change is dropped at the same boundary, by
    // the same mechanism.
    //
    // **The image travels as a form part, never as a JSON value.** FR-53
    // names image replacement as one of the eight editable things, and the
    // blob store's upload path takes bytes — so a `multipart/form-data`
    // request carries the replacement alongside the text fields.
    const parsed = await parseAdministratorEditBody(request);

    // ── The use case ───────────────────────────────────────────────────────
    const listingsStack = listings();

    const result = await listingsStack.administratorEdits.edit({
      reportId: id,
      actor: { actorId: actor.actorId },
      changes: parsed.changes,
      image: parsed.image,
    });

    log(requestId, action, 'success', {
      actorId: actor.actorId,
      actorRole: 'administrator',
      targetType: 'report',
      targetId: result.report.id,
    });

    // **No stored field is returned.**
    return NextResponse.json({
      id: result.report.id,
      status: result.report.status,
      updatedAt: result.report.updatedAt.toISOString(),
      changed: result.outcome.kind === 'Changed',
    });
  } catch (error) {
    return reportLifecycleErrorResponse(error, requestId, action);
  }
}
