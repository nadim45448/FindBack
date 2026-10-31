'use client';

/**
 * The client's view of the session.
 *
 * **The actor's status is read from the server, never derived on the
 * client.** `/api/session` returns the resolved `ActorContext` — the id,
 * the account's status, and whether the account is an administrator — and
 * the shell renders whatever that says.
 *
 * That matters for the Pending header: a `Pending` account must see the
 * `Pending` pill and nothing else, and the only thing that can decide that
 * is the server's answer. A client that read the status out of a cookie
 * would be reading a claim the user could have written.
 *
 * ## Why the session is an external store
 *
 * The session is **state the server owns**. React's `useEffect` + `useState`
 * pattern for it has two problems: the compiler's lint rule rejects a
 * `setState` in an effect body, and — more importantly — the effect runs
 * *after* the first paint, so the shell would render the anonymous topbar
 * for one frame and then swap to the Pending header. That flash is the
 * same class of defect as the theme flash the no-flash script exists to
 * prevent.
 *
 * `useSyncExternalStore` reads the value **during render**, so the very
 * first paint already has the right variant.
 *
 * ## The CSRF token is a separate concern from the actor
 *
 * The token is an HMAC over the session token's hash, so it can only be
 * minted by the server. The shell fetches it alongside the actor and
 * renders it into a `<meta>` tag, where the forms read it.
 */

import { useCallback, useSyncExternalStore } from 'react';

import { setCsrfToken } from './csrf';

/** The account states the surfaces distinguish. */
export type AccountStatus = 'Pending' | 'Active' | 'Rejected' | 'Deactivated';

/** The session the client knows about. */
export interface ClientSession {
  /** The actor's id, or null when nobody is signed in. */
  readonly actorId: string | null;
  /** The account's status, or null when nobody is signed in. */
  readonly status: AccountStatus | null;
  /** Whether the account is an administrator. */
  readonly isAdministrator: boolean;
  /** The account's display name. */
  readonly displayName: string | null;
  /** The CSRF token for state-changing requests. */
  readonly csrfToken: string | null;
}

/** The session when nobody is signed in. */
export const ANONYMOUS_SESSION: ClientSession = {
  actorId: null,
  status: null,
  isAdministrator: false,
  displayName: null,
  csrfToken: null,
};

/* -------------------------------------------------------------------------- */
/* The external store                                                          */
/* -------------------------------------------------------------------------- */

/** The session's subscribers. */
const sessionSubscribers = new Set<() => void>();

/** The current snapshot. */
let sessionSnapshot: ClientSession = ANONYMOUS_SESSION;

/** The in-flight refresh, so concurrent callers share one request. */
let pendingRefresh: Promise<void> | null = null;

/** The snapshot of the session. */
function getSessionSnapshot(): ClientSession {
  return sessionSnapshot;
}

/** Subscribe to the session. */
function subscribeToSession(onStoreChange: () => void): () => void {
  sessionSubscribers.add(onStoreChange);

  return () => {
    sessionSubscribers.delete(onStoreChange);
  };
}

/** Publish a new session snapshot. */
function publishSession(next: ClientSession): void {
  sessionSnapshot = next;
  sessionSubscribers.forEach((notify) => notify());
}

/**
 * Fetch the session from the server.
 *
 * **The request is shared.** Two components mounting at the same time must
 * not issue two requests, so the in-flight promise is reused.
 */
async function fetchSession(): Promise<void> {
  if (pendingRefresh) {
    return pendingRefresh;
  }

  pendingRefresh = (async () => {
    try {
      const response = await fetch('/api/session', { cache: 'no-store' });
      const body = (await response.json()) as {
        actor?: {
          id?: string;
          status?: AccountStatus;
          isAdministrator?: boolean;
          displayName?: string;
        } | null;
        csrfToken?: string | null;
      };

      if (typeof body.csrfToken === 'string' && body.csrfToken.length > 0) {
        setCsrfToken(body.csrfToken);
      }

      if (!body.actor) {
        publishSession(ANONYMOUS_SESSION);
        return;
      }

      publishSession({
        actorId: body.actor.id ?? null,
        status: body.actor.status ?? null,
        isAdministrator: body.actor.isAdministrator ?? false,
        displayName: body.actor.displayName ?? null,
        csrfToken: body.csrfToken ?? readCsrfTokenFromDocument(),
      });
    } catch {
      // A session that cannot be read is treated as no session. The surfaces
      // are all readable without one, so this is a degraded shell, not a
      // broken page.
      publishSession(ANONYMOUS_SESSION);
    } finally {
      pendingRefresh = null;
    }
  })();

  return pendingRefresh;
}

/**
 * The session hook's result.
 *
 * **The session and the way to refresh it.** The refresh is returned
 * rather than triggered internally, because the *caller* decides when to
 * refresh — and the shell refreshes on mount and after every navigation
 * that could have changed it.
 */
export interface UseSessionResult {
  /** The current session. */
  readonly session: ClientSession;
  /** Re-read the session from the server. */
  readonly refresh: () => Promise<void>;
}

/**
 * Apply a signed-in session the login path already resolved.
 *
 * **The shell stays mounted across `/login` → `/admin` or `/home`,** so
 * the store must be written here — a route change alone would leave the
 * anonymous topbar on the dashboard, and Log out would be unreachable.
 */
export function applySignedInSession(next: ClientSession): void {
  if (next.csrfToken) {
    setCsrfToken(next.csrfToken);
  }

  publishSession(next);
}

/**
 * The session hook.
 *
 * **The session is read during render**, so the first paint already has the
 * right topbar variant. The refresh publishes the new snapshot when it
 * arrives.
 */
export function useSession(): UseSessionResult {
  const session = useSyncExternalStore(subscribeToSession, getSessionSnapshot, getServerSession);

  const refresh = useCallback(async (): Promise<void> => {
    await fetchSession();
  }, []);

  return { session, refresh };
}

/** The session on the server. */
function getServerSession(): ClientSession {
  return ANONYMOUS_SESSION;
}

/**
 * The CSRF token from the document's meta tag.
 *
 * **The meta tag is the only place the token is exposed.** It is derived
 * from the session, so it is not a secret in the way a password is — it
 * cannot be used from another origin, because the browser will not attach
 * the session cookie to a cross-site request.
 */
export function readCsrfTokenFromDocument(): string | null {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');

  return meta?.content ?? null;
}
