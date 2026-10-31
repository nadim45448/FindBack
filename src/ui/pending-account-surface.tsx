/**
 * The Pending-account landing — `/pending`.
 *
 * The generated mockup is
 * `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/mockups/public/06-pending-account.html`:
 * a warning banner under the header, a `Welcome, {name}.` heading, and a
 * card that says what happens next.
 */

import {
  PENDING_BANNER,
  PENDING_BANNER_AFTER_EMAIL,
  PENDING_BANNER_BEFORE_EMAIL,
  PENDING_FALLBACK_EMAIL,
  PENDING_FALLBACK_NAME,
  PENDING_NEXT_AFTER_EMAIL,
  PENDING_NEXT_BEFORE_EMAIL,
  PENDING_NEXT_HEADING,
  PENDING_NEXT_UNTIL,
  PENDING_UNAVAILABLE_ACTIONS,
} from './copy';

/** The pending surface's props. */
export interface PendingAccountSurfaceProps {
  /** The account's display name. */
  readonly displayName?: string | null | undefined;
  /** The account's email. */
  readonly email?: string | null | undefined;
}

/**
 * The first name the greeting uses.
 *
 * **The mockup greets by first name.** A missing name falls back to
 * `there`, which is what the mockup renders before the session is known.
 */
export function pendingFirstName(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0];

  return first && first.length > 0 ? first : PENDING_FALLBACK_NAME;
}

/** The Pending-account landing. */
export function PendingAccountSurface({
  displayName,
  email,
}: PendingAccountSurfaceProps): React.JSX.Element {
  const name = pendingFirstName(displayName);
  const address = email?.trim() || PENDING_FALLBACK_EMAIL;

  return (
    <div className="pending-account">
      <div className="pending-banner">
        <div className="pending-banner__inner" role="status">
          <span className="pending-banner__icon" aria-hidden="true">
            ⏳
          </span>
          <div className="pending-banner__body">
            <strong>{PENDING_BANNER}</strong>
            {PENDING_BANNER_BEFORE_EMAIL}
            <em>{address}</em>
            {PENDING_BANNER_AFTER_EMAIL}
          </div>
        </div>
      </div>

      <div className="pending-account__page">
        <h1 className="pending-account__title">Welcome, {name}.</h1>

        <div className="card pending-account__card">
          <h2 className="pending-account__card-title">{PENDING_NEXT_HEADING}</h2>
          <p>
            {PENDING_NEXT_BEFORE_EMAIL}
            <strong>{address}</strong>
            {PENDING_NEXT_AFTER_EMAIL}
          </p>
          <p className="pending-account__until">{PENDING_NEXT_UNTIL}</p>
          <ul className="pending-account__list">
            {PENDING_UNAVAILABLE_ACTIONS.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
