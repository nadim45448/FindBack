/**
 * `POST /api/auth/logout` — sign out (FR-4, story 005).
 *
 * **Logout is idempotent.** A logout without a valid session is an
 * idempotent success and no session state changes (story 005 criterion 4).
 * The route answers 200 either way, and always clears the cookie.
 *
 * The session row is revoked **and** the cookie is cleared, so a revoked
 * token is inert server-side even if the cookie survives in a browser.
 *
 * A logout is a state-changing request, so it carries a CSRF token
 * (coding-standards § Security coding rules). The CSRF check happens
 * **before** anything is changed, so a request without a valid token cannot
 * revoke a session.
 */

import { NextResponse } from 'next/server';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { buildClearedSessionCookie } from '@/infrastructure/accounts/cookie-session-store';

import {
  log,
  errorResponse,
  readCsrfToken,
  readRequestId,
  readSessionCookie,
} from '@/app/api/_helpers';

export async function POST(): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();
    const token = await readSessionCookie();

    // No session — an idempotent success. The cookie is still cleared, so a
    // stale cookie does not linger.
    if (!token) {
      log(requestId, 'account.logout', 'success', {
        actorRole: 'anonymous',
      });

      const response = NextResponse.json({ ok: true });
      response.headers.append('Set-Cookie', buildClearedSessionCookie());

      return response;
    }

    const tokenHash = stack.tokens.hashToken(token);
    const csrfToken = await readCsrfToken();
    const csrf = stack.csrf.validate(tokenHash, csrfToken);

    if (!csrf.valid) {
      log(requestId, 'account.logout', 'denied', {
        actorRole: 'anonymous',
      });

      return NextResponse.json({ error: 'Your request could not be verified.' }, { status: 403 });
    }

    const session = await stack.sessions.findByToken(token);

    if (session) {
      await stack.transactions.run((transaction) => stack.logout.execute(session.id, transaction));
    }

    log(requestId, 'account.logout', 'success', {
      actorId: session?.accountId,
      actorRole: 'member',
      targetType: 'session',
      targetId: session?.id,
    });

    const response = NextResponse.json({ ok: true });
    response.headers.append('Set-Cookie', buildClearedSessionCookie());

    return response;
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
