/**
 * The reset-token proxy.
 *
 * **The reset link carries the token in its URL fragment**, after the `#`.
 * The fragment is not sent to the server, so the token never reaches the
 * request line — which is what a platform's access log records — and
 * therefore never reaches an access log. The page reads the fragment with
 * the browser's own JavaScript and **posts** the token in the request body,
 * where a log does not look.
 *
 * **The fragment is the protection; this proxy is a second line of
 * defence, and it cannot be the first.** The Stage 2 design said the
 * request log "redacts the `token` query parameter", and that was found by
 * measurement to be **impossible**. Two live requests established it:
 *
 * 1. A request to `/reset-password?token=…` was observed in the server's
 *    request log carrying the **full token**.
 * 2. A proxy that rewrote the request's URL — stripping the query
 *    entirely — did **not** remove the token from the log.
 *
 * The reason is structural: the access log records the **original** request
 * URL — the one on the wire — and it is written **before any application
 * code runs**. No proxy, no rewrite, and no route handler can change what
 * is already written. The dev server's own logger shows the same rule
 * (`request.url`, the original).
 *
 * So what this proxy *does* achieve for a query-string token is real but
 * bounded: the token does not reach the **route handler** or the **page's**
 * own markup, because the request is served from the rewritten URL. It
 * cannot reach back in time to un-write the access-log line.
 *
 * The case this covers is a **legacy or hand-built link** — one carrying
 * `?token=…` rather than the fragment. The link the email actually
 * produces uses the fragment, and that link leaves no trace in any log.
 *
 * The proxy runs only for the reset path. Every other request is passed
 * through untouched, so this cannot affect any other route.
 *
 * **Next.js 16 renamed this convention.** The file is `proxy.ts` and the
 * exported function is `proxy`; the older name, `middleware`, is
 * deprecated. The behaviour is unchanged.
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  REDACTED_VALUE,
  RESET_TOKEN_HEADER,
  RESET_TOKEN_QUERY_PARAM,
} from '@/domain/accounts';

export function proxy(request: NextRequest): NextResponse {
  const url = request.nextUrl;

  // Only the reset path carries a token in its query string.
  if (url.pathname !== '/reset-password') {
    return NextResponse.next();
  }

  const token = url.searchParams.get(RESET_TOKEN_QUERY_PARAM);

  // No token in the query string, nothing to do. **This is the normal
  // case** — the link's token is in the fragment, which the server never
  // sees.
  if (!token) {
    return NextResponse.next();
  }

  // The token is moved into a header, which is **not** part of the request
  // line and so is not in an access log.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(RESET_TOKEN_HEADER, token);

  // The query string is replaced **parameter by parameter**, so the URL's
  // shape is preserved and only the token's value changes.
  const redactedParams = new URLSearchParams(url.searchParams);

  redactedParams.set(RESET_TOKEN_QUERY_PARAM, REDACTED_VALUE);

  const redactedUrl = url.clone();

  redactedUrl.search = redactedParams.toString();

  // A **rewrite**, not a pass-through: the request is served from the
  // redacted URL, so the route handler sees a URL with no token in it.
  return NextResponse.rewrite(redactedUrl, {
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  /**
   * Only the reset path runs the proxy.
   *
   * The matcher must be a **static** value — Next.js reads it at build time
   * to decide which routes to instrument, so it cannot be computed. A static
   * prefix also means the proxy is not even invoked for any other route,
   * which is what makes it safe to leave running.
   */
  matcher: ['/reset-password'],
};
