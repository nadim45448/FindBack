'use client';

/**
 * The CSRF token, as a client-side store.
 *
 * ## The token cannot be computed in the browser
 *
 * It is an HMAC over the session token's hash, keyed by `SESSION_SECRET` —
 * a secret the browser does not have. So the token must come from the
 * server, and the server mints it in one of two ways:
 *
 * - **a signed-in member's token** is derived from their session cookie,
 *   which the browser already holds; and
 * - **a signed-out visitor's token** comes from
 *   `POST /api/auth/anonymous-session`, which sets a cookie and returns the
 *   matching token.
 *
 * ## Why it is a store and not a `useEffect` + `useState`
 *
 * The same reason as the theme and the session: **the value is state the
 * server owns**, so it is read during render through
 * `useSyncExternalStore`. A `useEffect` would publish it *after* the first
 * paint, and a form submitted in that window would go without a token.
 *
 * ## Which token is used
 *
 * **The session's token wins when there is one.** A signed-in member's
 * requests are validated against their session cookie, so the token must be
 * the one derived from *that* cookie — not an anonymous token bound to a
 * different cookie that happens to be present too.
 *
 * A signed-out visitor has no session, so the anonymous token is the only
 * one there is.
 */

import { useEffect, useSyncExternalStore } from 'react';

/* -------------------------------------------------------------------------- */
/* The store                                                                   */
/* -------------------------------------------------------------------------- */

/** The token's subscribers. */
const csrfSubscribers = new Set<() => void>();

/** The current token's snapshot. */
let csrfSnapshot: string | null = null;

/** The in-flight issuance, so concurrent callers share one request. */
let pendingIssuance: Promise<void> | null = null;

/** The snapshot of the token. */
function getCsrfSnapshot(): string | null {
  return csrfSnapshot;
}

/** Subscribe to the token. */
function subscribeToCsrf(onStoreChange: () => void): () => void {
  csrfSubscribers.add(onStoreChange);

  return () => {
    csrfSubscribers.delete(onStoreChange);
  };
}

/** Publish a new token. */
function publishCsrf(next: string | null): void {
  csrfSnapshot = next;
  csrfSubscribers.forEach((notify) => notify());
}

/**
 * Replace the CSRF token the forms will send.
 *
 * **Login and session refresh call this** so a newly issued session's
 * token is what the next POST carries — the anonymous token is bound to
 * a different cookie and would be refused.
 */
export function setCsrfToken(next: string | null): void {
  publishCsrf(next);
}

/**
 * Issue an anonymous token.
 *
 * **The request is shared**, so two forms mounting at once do not issue
 * two tokens.
 */
async function issueAnonymousToken(): Promise<void> {
  if (pendingIssuance) {
    return pendingIssuance;
  }

  pendingIssuance = (async () => {
    try {
      const response = await fetch('/api/auth/anonymous-session', { method: 'POST' });
      const body = (await response.json()) as { csrfToken?: string };

      if (typeof body.csrfToken === 'string' && body.csrfToken.length > 0) {
        publishCsrf(body.csrfToken);
      }
    } catch {
      // A missing token degrades the forms to a server-side refusal, not a
      // broken page. The surfaces still render and read.
      publishCsrf(null);
    } finally {
      pendingIssuance = null;
    }
  })();

  return pendingIssuance;
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The CSRF token hook.
 *
 * **It issues an anonymous token on mount, when there is no session token
 * already in the document.** The shell renders the meta tag; the forms read
 * it.
 */
export function useCsrfToken(): string | null {
  const token = useSyncExternalStore(subscribeToCsrf, getCsrfSnapshot, getServerCsrf);

  useEffect(() => {
    if (token) {
      return;
    }

    void issueAnonymousToken();
  }, [token]);

  return token;
}

/** The token on the server. */
function getServerCsrf(): string | null {
  return null;
}

/**
 * The CSRF header for a state-changing request.
 *
 * **Read at call time, not captured.** The token can be replaced when the
 * session changes, so a header built from a stale token would be refused.
 */
export function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();

  if (!token) {
    return {};
  }

  return { 'x-csrf-token': token };
}

/**
 * The CSRF token from the document's meta tag.
 *
 * **The meta tag is the only place the token is exposed to the forms.** It
 * is derived from the session, so it is not a secret in the way a password
 * is — it cannot be used from another origin, because the browser will not
 * attach the session cookie to a cross-site request.
 */
export function readCsrfToken(): string | null {
  if (csrfSnapshot && csrfSnapshot.length > 0) {
    return csrfSnapshot;
  }

  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');

  return meta?.content && meta.content.length > 0 ? meta.content : null;
}
