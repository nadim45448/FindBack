'use client';

/**
 * The topbar.
 *
 * **Two variants, and the choice between them is not cosmetic.**
 *
 * EXPERIENCE.md §5.2 and §16.3 say the anonymous topbar and the Pending
 * header are different shapes:
 *
 * | | Anonymous / auth-flow | Pending |
 * |---|---|---|
 * | Brand mark | yes | yes |
 * | `Browse Lost & Found` | yes, a plain text link | **no** — "all other nav items are hidden" |
 * | `Sign in` / `Register` | yes on auth-flow pages; **no** on `/` — the landing hero already has those CTAs | **no** |
 * | Status pill | no | yes — `Pending` |
 * | `Log out` | **no** | yes — the only action |
 * | Theme toggle | yes | yes |
 *
 * The **anonymous** variant is for `/`, `/login`, `/forgot`, `/forgot-sent`,
 * `/register`, and `/pending-registered`. The **Pending** variant is for
 * `/pending` — an authenticated restricted account landing, not an
 * auth-flow page.
 *
 * ## Why `Log out` is absent from the anonymous topbar
 *
 * §5.2's table lists three anonymous actions and no logout; and on
 * authenticated member and administrator pages *"Logout is not a standalone
 * topbar control — it lives inside `Account ▾`"*. Bolt 12 does not build
 * the Account menu (that is story 003), so the anonymous topbar has no
 * `Log out` at all, and the Pending header has exactly one.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { BrandMark } from './brand-mark';
import { ThemeToggle } from './theme-toggle';
import { csrfHeaders, setCsrfToken } from './csrf';
import {
  BROWSE_LOST_AND_FOUND,
  HOME_NAV,
  LOG_OUT,
  PUBLIC_LISTINGS_HEADING,
  TOPBAR_REGISTER,
  TOPBAR_SIGN_IN,
} from './copy';
import { AdminTopbar } from './admin-topbar';
import { MemberTopbar } from './member-topbar';
import { applySignedInSession, ANONYMOUS_SESSION, useSession } from './session';
import { StatusBadge } from './status-badge';

/**
 * The topbar's variant.
 *
 * - `anonymous` — the public and auth-flow topbar.
 * - `pending` — the Pending header: brand mark, status pill, `Log out`.
 */
export type TopbarVariant = 'anonymous' | 'pending' | 'member' | 'admin';

/** The topbar's props. */
export interface TopbarProps {
  /** Which variant to render. */
  readonly variant: TopbarVariant;
  /** The account's display name, for the Pending header's greeting. */
  readonly displayName?: string | undefined;
  /**
   * The sign-out handler.
   *
   * **The member topbar's `Account ▾` menu carries a `Log out` button,**
   * and the sign-out is a state-changing POST that must carry a CSRF
   * token — so it cannot be a plain `<a>`. The handler is supplied by the
   * shell, which owns the token and the router.
   */
  readonly onSignOut?: (() => void) | undefined;
}

/**
 * The topbar.
 *
 * **The theme toggle is always present, on every variant.** §5.2 and §16.6
 * both say Theme is a separate topbar icon control and is *not* part of the
 * Account menu — so it sits here, outside the variant's action list.
 */
export function Topbar({ variant, displayName, onSignOut }: TopbarProps): React.JSX.Element {
  if (variant === 'pending') {
    return <PendingHeader />;
  }

  if (variant === 'admin') {
    return <AdminTopbar displayName={displayName} onSignOut={onSignOut} />;
  }

  if (variant === 'member') {
    return <MemberTopbar displayName={displayName} onSignOut={onSignOut} />;
  }

  return <AnonymousTopbar />;
}

/**
 * The anonymous topbar.
 *
 * **`Browse Lost & Found` is a plain text link, not a button** — §5.2 says
 * Browse is exploration, not conversion.
 *
 * **The landing page omits `Sign in` and `Register` from the topbar.**
 * Those CTAs already sit in the hero, so a second pair in the corner is
 * the same action twice.
 *
 * **The login and register mockups omit Browse**, and login has no auth
 * buttons in the corner — register keeps a single `Sign in`.
 */
function AnonymousTopbar(): React.JSX.Element {
  const pathname = usePathname();
  const chrome = anonymousChrome(pathname);

  return (
    <header className="topbar">
      <Link href="/" className="topbar__brand" aria-label="FindBack home">
        <BrandMark />
      </Link>

      {chrome.home ? (
        <nav className="topbar__nav" aria-label="Primary">
          <Link href="/" className="topbar__link">
            {HOME_NAV}
          </Link>
        </nav>
      ) : chrome.browse ? (
        <nav className="topbar__nav" aria-label="Primary">
          <Link
            href="/listings"
            className="topbar__link"
            aria-current={pathname === '/listings' ? 'page' : undefined}
          >
            {pathname === '/listings' ? PUBLIC_LISTINGS_HEADING : BROWSE_LOST_AND_FOUND}
          </Link>
        </nav>
      ) : (
        <div className="topbar__spacer" />
      )}

      <div className="topbar__actions">
        <ThemeToggle />

        {chrome.signIn ? (
          <Link
            href="/login"
            className={
              chrome.signInTertiary
                ? 'button button--tertiary button--sm'
                : 'button button--primary button--sm'
            }
          >
            {TOPBAR_SIGN_IN}
          </Link>
        ) : null}

        {chrome.register ? (
          <Link href="/register" className="button button--primary button--sm">
            {TOPBAR_REGISTER}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

/**
 * Which anonymous chrome a path shows.
 *
 * The generated mockups give `/`, `/login`, and `/register` different
 * topbars. Listings and the rest keep Browse plus both auth buttons.
 */
function anonymousChrome(pathname: string): {
  readonly browse: boolean;
  readonly home: boolean;
  readonly signIn: boolean;
  readonly signInTertiary: boolean;
  readonly register: boolean;
} {
  if (pathname === '/') {
    return { browse: true, home: false, signIn: false, signInTertiary: false, register: false };
  }

  if (pathname === '/login') {
    return { browse: false, home: false, signIn: false, signInTertiary: false, register: false };
  }

  if (pathname === '/register' || pathname === '/pending-registered') {
    return { browse: false, home: false, signIn: true, signInTertiary: false, register: false };
  }

  if (pathname === '/forgot' || pathname === '/forgot-sent') {
    return { browse: false, home: true, signIn: true, signInTertiary: true, register: false };
  }

  return { browse: true, home: false, signIn: true, signInTertiary: false, register: true };
}

/**
 * The Pending header.
 *
 * **Brand mark, `Pending` status pill, `Log out` only.** §16.3: *"All other
 * nav items are hidden."* So there is no `Browse Lost & Found`, no `Sign
 * in`, no `Register` — and the theme toggle, which is chrome rather than a
 * nav item, stays.
 *
 * The sign-out is a **button, not a link**: it is a state-changing POST
 * that must carry a CSRF token, so it cannot be a plain `<a>`.
 */
function PendingHeader(): React.JSX.Element {
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const { refresh } = useSession();

  /**
   * Sign out.
   *
   * **The CSRF token is sent as a header.** The token is an HMAC over the
   * session's token hash — the browser cannot compute it, so it is read
   * from a meta tag the shell renders.
   *
   * **The navigation happens in a `finally`**, so a failed request still
   * lands the member on the landing page. The logout route is idempotent,
   * so a retry is safe.
   */
  const signOut = useCallback(async (): Promise<void> => {
    setSigningOut(true);

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: csrfHeaders(),
      });
    } finally {
      applySignedInSession(ANONYMOUS_SESSION);
      setCsrfToken(null);
      await refresh();
      router.replace('/');
      router.refresh();
    }
  }, [router, refresh]);

  return (
    <header className="topbar">
      <Link href="/pending" className="topbar__brand" aria-label="FindBack home">
        <BrandMark />
      </Link>

      <div className="topbar__spacer" />

      <div className="topbar__actions">
        <ThemeToggle />

        {/*
          **The account's status is a badge,** so it carries the same three
          cues every other badge does: the colour, the text, and the icon.
          The `aria-label` names the kind, so "Pending" is heard as the
          account's state rather than as a stray word in the header.
        */}
        <StatusBadge status="Pending" kind="Account status" />

        <button
          type="button"
          className="button button--tertiary button--sm"
          onClick={() => {
            void signOut();
          }}
          disabled={signingOut}
        >
          {LOG_OUT}
        </button>
      </div>
    </header>
  );
}
