import type { Metadata } from 'next';
import Link from 'next/link';

import {
  PENDING_REGISTERED_HEADING,
  REGISTRATION_PENDING_MESSAGE,
  SIGN_IN_TO_YOUR_ACCOUNT,
} from '@/ui/copy';

export const metadata: Metadata = {
  title: 'Registration received',
};

/**
 * The registration-confirmation surface.
 *
 * ## It is not the `/pending` surface
 *
 * Story 002's criterion: *"`/pending-registered` and `/pending` … remain
 * distinct surfaces and are never merged."*
 *
 * The difference is the **actor**: `/pending-registered` is shown to a
 * visitor who has *just registered* and has **no session** — the
 * registration route creates no cookie. `/pending` is shown to a `Pending`
 * account that has *signed in* and holds a session.
 *
 * So this page renders the **anonymous topbar** (the shell chooses the
 * variant from the session, and there is no session here), and the Pending
 * surface renders the Pending header. Merging them would mean showing a
 * `Log out` button to someone who is not signed in.
 *
 * ## The copy
 *
 * §16.1, verbatim: *"Your account is pending administrator approval. You'll
 * get an email when you're approved."*
 *
 * The centred confirm card is the generated mockup's. The body stays the
 * specification's — the visitor is signed out, so the page cannot name
 * them.
 */
export default function PendingRegisteredPage(): React.JSX.Element {
  return (
    <div className="confirm-shell">
      <div className="confirm-card">
        <div className="confirm-card__icon" aria-hidden="true">
          ✓
        </div>

        <h1>{PENDING_REGISTERED_HEADING}</h1>

        <p>{REGISTRATION_PENDING_MESSAGE}</p>

        <p className="confirm-card__action">
          <Link href="/login" className="button button--primary">
            {SIGN_IN_TO_YOUR_ACCOUNT}
          </Link>
        </p>
      </div>
    </div>
  );
}
