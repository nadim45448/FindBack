/**
 * `POST /api/auth/anonymous-session` — mint a CSRF token for a signed-out
 * visitor.
 *
 * ## Why this exists
 *
 * The CSRF token is an **HMAC over the session token's hash**, keyed by
 * `SESSION_SECRET` (ADR-9). Every state-changing route validates it by
 * hashing the session cookie and recomputing the HMAC — **no database
 * lookup is involved**.
 *
 * That has one consequence this route exists to serve: a **signed-out**
 * visitor can be given a CSRF token, because the token is derived from a
 * cookie value, not from a session row.
 *
 * The `/forgot` route's own comment anticipated exactly this: *"The
 * `/forgot` screen (Unit 007) issues one against a short-lived anonymous
 * session; until that screen exists, this route refuses a request without
 * one."* This **is** that screen's issuance route.
 *
 * ## Why there is no session row
 *
 * `sessions.account_id` is a **non-null foreign key** to `accounts`, so an
 * anonymous session row is not representable — and inventing a
 * placeholder account would be worse than the problem: it would put a
 * synthetic row in the `accounts` table and make an anonymous visitor
 * *look like* a member to every query that reads it.
 *
 * **The anonymous token is a cookie with no row behind it.** Nothing in the
 * database records it, nothing resolves it to an actor, and it grants no
 * capability: `/api/session` resolves it to `null`, exactly as it resolves
 * any cookie that is not a live session token.
 *
 * ## What the token does and does not protect
 *
 * The token is bound to the cookie, so a token minted for one anonymous
 * visitor is useless for another, and a cross-site request cannot forge it
 * because the browser will not attach the cookie to a cross-site POST
 * (`SameSite=Lax`).
 *
 * **It is not a session.** It carries no identity, no capability, and no
 * access to any member surface. Signing in replaces it with a real session
 * cookie, because the login route sets its own `Set-Cookie` for the session
 * token — overwriting the anonymous one.
 */

import { NextResponse } from 'next/server';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';

import { errorResponse, log, readRequestId } from '@/app/api/_helpers';

/**
 * The anonymous token's cookie name.
 *
 * **A different name from the session cookie's** (`__Host-fb`). The two
 * tokens have different lifetimes and different meanings, and the login
 * route must be able to overwrite the anonymous cookie without disturbing a
 * live session.
 */
export const ANONYMOUS_TOKEN_COOKIE_NAME = '__Host-fb-anon';

/**
 * How long the anonymous cookie lives, in seconds.
 *
 * **Short.** It exists to carry one form submission, so it does not need to
 * outlive a browsing session. A visitor who returns weeks later gets a new
 * one, and a stale one is harmless.
 */
export const ANONYMOUS_TOKEN_MAX_AGE_SECONDS = 60 * 60;

/**
 * Build the `Set-Cookie` header for the anonymous token.
 *
 * **The same `__Host-` rules as the session cookie**: `Secure`, `Path=/`,
 * no `Domain`. A `__Host-` cookie missing `Secure` is rejected outright by
 * the browser.
 */
function buildAnonymousTokenCookie(token: string): string {
  return [
    `${ANONYMOUS_TOKEN_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${ANONYMOUS_TOKEN_MAX_AGE_SECONDS}`,
  ].join('; ');
}

/**
 * Mint an anonymous CSRF token.
 *
 * **The response body carries the CSRF token**, so the client can render it
 * into a `<meta>` tag without a second request. The cookie is `HttpOnly`,
 * so the token in the body is the only way the browser learns it — which
 * is what makes it unforgeable from another origin.
 */
export async function POST(): Promise<NextResponse> {
  const requestId = await readRequestId();

  try {
    const stack = buildIdentityStack();

    // **A fresh random token**, not a stored one. The cookie's value is
    // never persisted, so there is nothing to clean up and nothing to
    // invalidate server-side — the cookie's own expiry is the lifetime.
    const token = stack.tokens.generateToken();
    const tokenHash = stack.tokens.hashToken(token);

    // **The same derivation the validator uses.** The token and the
    // validator are two halves of one rule, and the route computes its half
    // with the validator's own method so the two cannot drift.
    const csrfToken = stack.csrf.computeToken(tokenHash);

    log(requestId, 'account.anonymous_session', 'success', {
      actorRole: 'anonymous',
    });

    const response = NextResponse.json({ csrfToken });
    response.headers.append('Set-Cookie', buildAnonymousTokenCookie(token));

    return response;
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
