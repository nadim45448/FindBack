'use client';

/**
 * The administrator-only access screen — §15.6.
 *
 * ## The message is specific, and the content is not
 *
 * §15.6: *"Non-administrator hitting `/admin/*` routes sees the access
 * screen (Section 4.5), but the message can be more specific: 'This area is
 * for administrators only.'"*
 *
 * **No dashboard content is delivered.** The screen carries the message and
 * nothing else — no tile, no count, no queue name. A screen that showed
 * "there are 3 pending claims" to a non-administrator would leak the
 * queue's contents, and a count is a leak.
 *
 * ## `role="status"`, not `role="alert"`
 *
 * The restricted state is **not an error** — the member did nothing wrong.
 * The same reasoning the `Pending` restricted surface records applies: an
 * assertive announcement would interrupt them with a tone the situation
 * does not warrant.
 */

import Link from 'next/link';

import { ADMIN_ACCESS_HEADING, ADMIN_ACCESS_MESSAGE } from './admin-copy';

/** The administrator access screen's props. */
export interface AdminAccessScreenProps {
  /** Where the "Go back" link goes. Defaults to the member's home. */
  readonly backHref?: string | undefined;
}

/**
 * The administrator-only access screen.
 */
export function AdminAccessScreen({ backHref = '/' }: AdminAccessScreenProps): React.JSX.Element {
  return (
    <div className="form-column">
      <h1 className="hero__title">{ADMIN_ACCESS_HEADING}</h1>

      <div className="banner banner--info" role="status">
        <p>{ADMIN_ACCESS_MESSAGE}</p>
      </div>

      <p>
        <Link href={backHref} className="button button--secondary">
          Go back
        </Link>
      </p>
    </div>
  );
}
