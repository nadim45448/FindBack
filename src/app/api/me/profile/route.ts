/**
 * `GET /api/me/profile` and `POST /api/me/profile` — the member's own
 * profile (FR-52).
 *
 * **The email is read-only.** The GET returns it; the POST cannot change it.
 * And the POST body has **no `email` field at all** — the request type is
 * `ProfileChange`, whose shape is exactly two optional fields. A client that
 * sends `email` sends a field the server ignores, so the read-only property
 * is **structural** rather than a validation rule that a future edit could
 * forget.
 *
 * **Only an `Active` member has an editor** (story 010 criterion 6). The
 * check lives in the aggregate's `updateProfile()`, so every path is covered
 * by one check, and the GET returns the same 403.
 *
 * **A no-op edit writes no audit record.** A member who saves without
 * changing anything has changed nothing, and there is nothing to record.
 */

import { NextResponse } from 'next/server';

import { createProfileChange } from '@/domain/accounts';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import {
  errorResponse,
  log,
  optionalStringField,
  readCsrfToken,
  readJsonBody,
  readRequestId,
  readSessionCookie,
} from '@/app/api/_helpers';

/** Read the member's profile. */
export async function GET(): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();

    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
    }

    const account = await stack.profile.read(actor.actorId);

    // A non-`Active` member has no editor. The GET refuses for the same
    // reason the POST does — and the check is the aggregate's, so there is
    // one rule rather than two.
    if (account.status !== 'Active') {
      return NextResponse.json(
        { error: 'Only an active account can edit its profile.' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      displayName: account.displayName.value,
      email: account.email.value,
      selfDeclaredRole: account.selfDeclaredRole.role,
      selfDeclaredRoleOther: account.selfDeclaredRole.otherText,
      status: account.status,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

/** Update the member's profile. */
export async function POST(request: Request): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();

    const token = await readSessionCookie();
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
    }

    // A state-changing request carries a CSRF token.
    const csrfToken = await readCsrfToken();
    const csrf = stack.csrf.validate(
      token ? stack.tokens.hashToken(token) : null,
      csrfToken,
    );

    if (!csrf.valid) {
      return NextResponse.json({ error: 'Your request could not be verified.' }, { status: 403 });
    }

    const body = await readJsonBody(request);

    // **Only two fields are read.** An `email`, a `status`, or an
    // `isAdministrator` in the body is ignored — there is no code path by
    // which they could reach the aggregate.
    const change = createProfileChange({
      displayName: optionalStringField(body, 'displayName'),
      selfDeclaredRole: optionalStringField(body, 'selfDeclaredRole'),
      selfDeclaredRoleOther: optionalStringField(body, 'selfDeclaredRoleOther'),
    });

    const outcome = await stack.transactions.run((transaction) =>
      stack.profile.execute(actor.actorId, change, actor.actorId, transaction),
    );

    log(requestId, 'profile.edited', outcome.changed ? 'success' : 'denied', {
      actorId: actor.actorId,
      actorRole: 'member',
      targetType: 'account',
      targetId: outcome.account.id,
    });

    return NextResponse.json({
      displayName: outcome.account.displayName.value,
      email: outcome.account.email.value,
      selfDeclaredRole: outcome.account.selfDeclaredRole.role,
      selfDeclaredRoleOther: outcome.account.selfDeclaredRole.otherText,
      status: outcome.account.status,
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
