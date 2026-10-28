/**
 * The identity test harness.
 *
 * **Route handlers are exercised through their real exported functions**,
 * with `next/headers` mocked. That is the closest a unit test can get to
 * the browser without a running server, and it means the assertions are
 * about the response a member would actually receive — the status code, the
 * body, and the `Set-Cookie` header — rather than about an internal call.
 *
 * The harness owns three things the suites would otherwise each re-implement:
 *
 * - **The request context.** The mocked cookie jar and headers are mutable,
 *   so a test can sign a member in and then change who is calling.
 * - **The CSRF token.** It is derived from the session's token hash, so the
 *   harness computes it the way the validator expects rather than the test
 *   hard-coding a value.
 * - **The database.** Every suite that touches the database uses the same
 *   cleanup, so a suite never sees another's rows.
 */

import { createHash, createHmac } from 'node:crypto';

import { SESSION_COOKIE_NAME } from '@/infrastructure/accounts/cookie-session-store';

/** The mutable request context the mocked `next/headers` reads from. */
export interface RequestContext {
  /** The session cookie's value, or null for no cookie. */
  sessionToken: string | null;
  /** The client's IP address, for the rate limiter's IP bucket. */
  clientIp: string;
  /** The CSRF token the request carries. */
  csrfToken: string | null;
  /** The request id the request carries. */
  requestId: string | null;
}

/** The request context the mocked `next/headers` reads from. */
export const requestContext: RequestContext = {
  sessionToken: null,
  clientIp: '198.51.100.7',
  csrfToken: null,
  requestId: null,
};

/** Reset the request context to "nobody is calling". */
export function resetRequestContext(): void {
  requestContext.sessionToken = null;
  requestContext.clientIp = '198.51.100.7';
  requestContext.csrfToken = null;
  requestContext.requestId = null;
}

/**
 * The CSRF token for a session token.
 *
 * The token is an HMAC over the session's token hash, keyed by
 * `SESSION_SECRET` — so a test computes it the way the validator does
 * rather than hard-coding a value that would drift.
 */
export function csrfTokenFor(sessionToken: string, secret = process.env.SESSION_SECRET): string {
  const tokenHash = createHash('sha256').update(sessionToken, 'utf8').digest('hex');

  return createHmac('sha256', secret ?? '')
    .update(tokenHash)
    .digest('hex');
}

/** The `Set-Cookie` header's value, or null when there is none. */
export function sessionCookieFrom(response: Response): string | null {
  const header = response.headers.get('set-cookie');

  if (!header) {
    return null;
  }

  // `headers.get` joins multiple `Set-Cookie` headers with a comma. The
  // session cookie is the only one these routes set, so the first value is
  // the one — but the attribute list is comma-free, so the split is safe.
  const first = header.split(',')[0]?.trim() ?? '';

  return first.startsWith(`${SESSION_COOKIE_NAME}=`) ? first : null;
}

/**
 * The session token from a `Set-Cookie` header value.
 *
 * Throws when the header carries no session cookie — a caller that reached
 * this point expected a session, and a null token would fail later and
 * further from the cause.
 */
export function sessionTokenFrom(setCookie: string | null): string {
  if (!setCookie) {
    throw new Error('The response set no session cookie.');
  }

  const value = setCookie.split(';')[0] ?? '';
  const prefix = `${SESSION_COOKIE_NAME}=`;

  if (!value.startsWith(prefix)) {
    throw new Error(`The response set no session cookie: ${setCookie}`);
  }

  const token = value.slice(prefix.length);

  if (token.length === 0) {
    throw new Error('The response set an empty session cookie.');
  }

  return token;
}

/** The response's parsed JSON body. */
export async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** A JSON request body. */
export function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}
