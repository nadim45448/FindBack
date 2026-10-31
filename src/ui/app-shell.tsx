'use client';

/**
 * The application shell.
 *
 * **The shared frame every surface sits in**: the skip-to-content link, the
 * topbar, the CSRF token, and the `<main>` landmark.
 *
 * ## The shell decides the topbar variant, and it decides it from the server
 *
 * The variant is chosen from the **resolved session**, not from the route
 * name. A `Pending` account must see the Pending header *wherever* it is —
 * §16.3 says the Pending surface hides all other nav items, and §4.8 says
 * a Pending account deep-linking to a member surface still shows the brand
 * mark and the Pending banner. A route-name lookup would get the second
 * case wrong.
 *
 * **The status is the server's answer.** `/api/session` resolves the
 * session on every request, so the shell cannot show a stale state.
 *
 * ## The skip link is the first focusable element
 *
 * Story 001's criterion: *"the skip link is the first focusable element and
 * activating it moves focus to `<main id="main" tabindex="-1">`"*. It is
 * rendered **before** the topbar in the DOM, and the `<main>` carries
 * `tabindex="-1"` so it can receive programmatic focus — a `<main>` is not
 * focusable by default.
 *
 * ## The CSRF token
 *
 * The token is rendered into a `<meta>` tag, because it **cannot be computed
 * in the browser** — it is an HMAC over the session token's hash, keyed by
 * the server's secret. A signed-out visitor gets one from
 * `POST /api/auth/anonymous-session`; a signed-in one gets it from the
 * session.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import { Topbar, type TopbarVariant } from './topbar';
import { applySignedInSession, useSession, ANONYMOUS_SESSION, type ClientSession } from './session';
import { setCsrfToken, useCsrfToken } from './csrf';
import { csrfHeaders } from './csrf';

/** The shell's props. */
export interface AppShellProps {
  readonly children: React.ReactNode;
}

/**
 * The application shell.
 */
export function AppShell({ children }: AppShellProps): React.JSX.Element {
  const { session, refresh } = useSession();
  const csrfToken = useCsrfToken();
  const router = useRouter();

  /**
   * The session is fetched once, on mount.
   *
   * **The fetch is in an effect, not in the render** — the value is read
   * during render through the store, and the fetch is what *publishes* it.
   * The first paint shows the anonymous topbar, and the Pending header
   * replaces it as soon as the server answers. A server-rendered shell
   * would know the session on the first paint, but a client-rendered one
   * cannot, and the difference is a single frame rather than a wrong
   * theme.
   */
  useSessionRefresh(refresh);

  const variant = topbarVariant(session);

  /**
   * Sign out.
   *
   * **The sign-out is a POST with a CSRF token,** so it cannot be a plain
   * link. The navigation happens in a `finally`, so a failed request still
   * lands the member on the landing page — the logout route is idempotent,
   * so a retry is safe.
   */
  const signOut = useCallback(async (): Promise<void> => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: csrfHeaders(),
      });
    } finally {
      // **The session store is cleared before the navigation.** The
      // shell stays mounted across routes, so without a write the
      // landing page would still show the signed-in topbar. The CSRF
      // token is dropped so the shell mints a fresh anonymous one.
      applySignedInSession({
        ...ANONYMOUS_SESSION,
      });
      setCsrfToken(null);
      await refresh();
      router.replace('/');
      router.refresh();
    }
  }, [router, refresh]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <meta name="csrf-token" content={csrfToken ?? ''} />

      <Topbar
        variant={variant}
        displayName={session.displayName ?? undefined}
        onSignOut={
          variant === 'member' || variant === 'admin'
            ? () => {
                void signOut();
              }
            : undefined
        }
      />

      <main id="main" tabIndex={-1} className="page">
        {children}
      </main>
    </>
  );
}

/**
 * The topbar variant for a session.
 *
 * **`Pending` gets the Pending header**; an **Active member** gets the
 * member topbar; an administrator gets the admin topbar; everything else —
 * including no session at all — gets the anonymous topbar.
 *
 * A `Rejected` or `Deactivated` account **cannot hold a session** (FR-4),
 * so the shell never sees one; if it somehow did, it would fall to the
 * anonymous topbar, which shows only `Sign in` and `Register`.
 *
 * **An administrator is `Active`.** An administrator account is approved
 * like any other account, so it cannot also be `Pending` — the `Pending`
 * check comes first so a malformed session carrying both flags still
 * resolves to the more restrictive header.
 *
 * **The administrator check comes before the member check** for the same
 * reason: an administrator's nav carries the four operational queues, and
 * the member nav carries the four participation views — they are different
 * navigations, and an administrator is served the administrative one.
 */
export function topbarVariant(session: ClientSession): TopbarVariant {
  if (session.status === 'Pending') {
    return 'pending';
  }

  if (session.isAdministrator && session.status === 'Active') {
    return 'admin';
  }

  if (session.status === 'Active') {
    return 'member';
  }

  return 'anonymous';
}

/**
 * The `useIsomorphicLayoutEffect` shim.
 *
 * **The session read happens in a layout effect**, so the first paint
 * already has the right topbar variant. A `useEffect` would run after the
 * paint, and the shell would flash the anonymous topbar before swapping to
 * the Pending header — the same class of defect as the theme flash.
 */
export function useSessionRefresh(refresh: () => Promise<void>): void {
  useEffect(() => {
    void refresh();
  }, [refresh]);
}

export { useSyncExternalStore };
