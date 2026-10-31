import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { SESSION_COOKIE_NAME } from '@/infrastructure/accounts/cookie-session-store';

import { PendingAccountSurface } from '@/ui/pending-account-surface';

export const metadata: Metadata = {
  title: 'Pending account',
};

/**
 * The Pending surface.
 *
 * The generated mockup is
 * `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/mockups/public/06-pending-account.html`.
 * A Pending member who signs in lands here: warning banner, welcome, and
 * the "What happens next" card.
 *
 * ## The header stays the Pending header
 *
 * EXPERIENCE.md §16.3: brand mark, `Pending` status pill, `Log out`. The
 * shell chooses that variant from the session, so it is the same header
 * on this page and on any member surface the account deep-links to.
 */
export default async function PendingPage(): Promise<React.JSX.Element> {
  const identity = await readPendingIdentity();

  return (
    <PendingAccountSurface displayName={identity.displayName} email={identity.email} />
  );
}

/**
 * The signed-in Pending member's name and email.
 *
 * **The greeting and the banner name the person.** The mockup fills
 * `Welcome, {first name}` and the registered email; both come from the
 * session, not from the URL.
 */
async function readPendingIdentity(): Promise<{
  readonly displayName: string | null;
  readonly email: string | null;
}> {
  try {
    const stack = buildIdentityStack();
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const actor = token ? await stack.resolver.resolve(token) : null;

    if (!actor) {
      return { displayName: null, email: null };
    }

    const account = await stack.profile.read(actor.actorId);

    return {
      displayName: actor.displayName,
      email: account.email.value,
    };
  } catch {
    return { displayName: null, email: null };
  }
}
