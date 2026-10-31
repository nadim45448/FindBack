'use client';

/**
 * The restricted-permission surface.
 *
 * ## §4.8, verbatim
 *
> When a Pending user lands on a member surface (deep-link, browser back
> button), show a friendly, non-blocking message rather than a hard error:
>
> "Your account is pending administrator approval. This part of FindBack
> will be available once your account is approved."
>
> The header still shows the brand mark and the Pending banner. The page
> body shows the message and a "Back to your account" link. Do **not**
> redirect-loop between the destination and the pending page.
 *
 * ## Why there is no redirect
 *
 * **The surface renders in place.** A redirect to `/pending` and back would
 * be the redirect loop §4.8 forbids, and the story's edge case names it
 * explicitly: *"Pending user presses the browser Back button onto a member
 * URL → Non-blocking restricted message; no redirect loop between
 * destination and `/pending`."*
 *
 * So the message is a **page state**, not a navigation.
 */

import Link from 'next/link';

import { BACK_TO_YOUR_ACCOUNT, PENDING_RESTRICTED_MESSAGE } from './copy';

/**
 * The restricted-permission surface.
 *
 * **The header still shows the brand mark and the Pending banner** — the
 * topbar's variant is chosen by the shell from the resolved session, so a
 * `Pending` account sees the Pending header here too. The banner itself
 * lives on `/pending`; what this surface adds is the message and the link.
 */
export function RestrictedSurface(): React.JSX.Element {
  return (
    <div className="form-column">
      <h1 className="hero__title">Not available yet</h1>

      {/*
        **`role="status"`, not `role="alert"`.** The restricted state is
        not an error — the member did nothing wrong, and the account is
        simply waiting for approval. An assertive announcement would
        interrupt them with a tone the situation does not warrant.
      */}
      <div className="banner banner--info" role="status">
        <p>{PENDING_RESTRICTED_MESSAGE}</p>
      </div>

      <p>
        <Link href="/pending" className="button button--secondary">
          {BACK_TO_YOUR_ACCOUNT}
        </Link>
      </p>
    </div>
  );
}
