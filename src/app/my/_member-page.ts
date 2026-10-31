/**
 * The shared server-side reading for the member pages.
 *
 * ## The actor is resolved once, and the pages are thin
 *
 * Every `/my/*` and `/home` page needs the **same** thing first: the
 * acting member. The actor comes from the session cookie — never from the
 * request — so a client cannot assert its own identity, and a client
 * cannot assert which partition it is reading.
 *
 * This module is where that resolution happens, and it is the **same
 * resolution the API routes make**, so a page and the endpoint behind it
 * agree about who the caller is.
 *
 * ## A signed-out visitor is redirected, not refused
 *
 * The member surfaces are member-only — there is no anonymous `/home`. So
 * an anonymous request is sent to the login page with a `return` parameter
 * naming where it was going, and the login flow returns the member there
 * afterwards.
 *
 * **The redirect is a navigation, not an error page.** The visitor asked
 * for a page they may see once they sign in, and the login page is the way
 * to that page.
 *
 * ## A failed read is a rendered error, not a thrown one
 *
 * The listing and detail surfaces are discovery surfaces. A surface that
 * 500s because the database is down tells the member nothing they can act
 * on, so the failure renders the server-error copy instead.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import type { ActorContext } from '@/domain/accounts';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { SESSION_COOKIE_NAME } from '@/infrastructure/accounts/cookie-session-store';

import { SERVER_ERROR_MESSAGE } from '@/ui/member-copy';

/**
 * The resolved member, or the redirect to the login page.
 *
 * **The two outcomes are different types,** so a caller cannot use the
 * actor without having proved a member is signed in.
 */
export type MemberPageAccess =
  | {
      readonly kind: 'Member';
      readonly actor: ActorContext;
    }
  | {
      readonly kind: 'Redirect';
      /** The path the member was trying to reach. */
      readonly returnTo: string;
    };

/**
 * Resolve the acting member for a member page.
 *
 * **The actor is derived from the session — never from the request.** A
 * client cannot assert its own identity, and a client cannot assert that
 * it is the reporter of a report.
 */
export async function resolveMemberAccess(returnTo: string): Promise<MemberPageAccess> {
  try {
    const identity = buildIdentityStack();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const actor = token ? await identity.resolver.resolve(token) : null;

    if (!actor) {
      return { kind: 'Redirect', returnTo };
    }

    return { kind: 'Member', actor };
  } catch {
    // **A failure to resolve is a redirect, not a crash.** The session
    // store being unreachable is indistinguishable from having no session
    // as far as the member is concerned — and the login page will fail the
    // same way if the store is still down, so no information is lost.
    return { kind: 'Redirect', returnTo };
  }
}

/**
 * Resolve the acting member, or redirect to the login page.
 *
 * **The `return` parameter names the page.** The login route reads it and
 * returns the member there after a successful sign-in — so a member who
 * deep-linked into `/my/claims` lands on `My Claims` rather than the
 * dashboard.
 */
export async function requireMember(returnTo: string): Promise<ActorContext> {
  const access = await resolveMemberAccess(returnTo);

  if (access.kind === 'Redirect') {
    redirect(`/login?return=${encodeURIComponent(access.returnTo)}`);
  }

  return access.actor;
}

/**
 * The copy a failed read shows.
 *
 * **One message for every failed read,** so the surfaces do not drift
 * into five slightly different ways of saying the same thing.
 */
export const MEMBER_READ_FAILED = SERVER_ERROR_MESSAGE;
