'use client';

/**
 * The administrator topbar — §3.2, §15.1, §17.1.
 *
 * ## The admin nav layer carries the four queues and nothing else
 *
 * §3.2: *"A second nav layer under the member nav exposes `Admin ▾`
 * containing the four operational queues plus `Accounts`."*
 *
 * **There is no audit link.** §17.1: *"No global `/admin/audit` route.
 * Audit is reached from the relevant report, Claim, Recovery Response, or
 * thread context only."* A topbar audit entry would be a global audit
 * entry point by another name, so the nav list is the four queues and the
 * list is **closed** — there is no room for a fifth entry to be added by
 * accident.
 *
 * `Accounts` (§15.7) is a later bolt's route and is deliberately absent
 * here rather than pointing at a route that does not exist.
 *
 * ## No bell, no badge, no unread count
 *
 * FR-30 forbids an in-app notification stream. The administrator topbar
 * therefore has **no** notification control of any kind — no bell, no
 * badge, no unread count. Theme is chrome (§19), not a notification, and
 * logout lives inside `Account ▾` (§5.2), not as a standalone control.
 *
 * ## The four links are real links
 *
 * Each queue is a route, so each is an `<a>` — not a click handler on a
 * non-interactive element.
 *
 * ## `Account ▾` has Profile and Logout
 *
 * §5.2: on administrator pages *"Logout is not a standalone topbar
 * control — it lives inside `Account ▾`"*. The sign-out is a POST, so the
 * parent supplies the handler.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { OPERATIONAL_QUEUE_ROUTES, type OperationalQueueId } from '@/domain/administration';
import { ACCOUNT_MENU_ENTRIES, ACCOUNT_MENU_LABEL } from '@/domain/listings';

import { BrandMark } from './brand-mark';
import { DisclosureMenu } from './disclosure-menu';
import { greetingName, initials } from './greeting';
import { ThemeToggle } from './theme-toggle';
import { ADMIN_NAV_DASHBOARD, ADMIN_NAV_ITEMS, ADMIN_NAV_LABEL } from './admin-copy';
import { LOG_OUT } from './copy';

/**
 * The admin nav's entries.
 *
 * **The queue id and the label travel together,** so a link's label and
 * its destination cannot drift apart. The list has four members because
 * there are four operational queues — and because audit is contextual, not
 * a queue (§17.1).
 */
const ADMIN_NAV_LINKS: readonly { readonly id: OperationalQueueId; readonly label: string }[] =
  Object.freeze([
    { id: 'pending-registrations', label: ADMIN_NAV_ITEMS[0] },
    { id: 'pending-claims', label: ADMIN_NAV_ITEMS[1] },
    { id: 'awaiting-return', label: ADMIN_NAV_ITEMS[2] },
    { id: 'verifications', label: ADMIN_NAV_ITEMS[3] },
  ]);

/** The administrator topbar's props. */
export interface AdminTopbarProps {
  /** The account's display name. */
  readonly displayName?: string | undefined;
  /**
   * The sign-out handler.
   *
   * **The sign-out is a POST, so it cannot be a plain link.** The parent
   * supplies the handler because it owns the CSRF token and the router.
   */
  readonly onSignOut?: (() => void) | undefined;
}

/**
 * The administrator topbar.
 */
export function AdminTopbar({ displayName, onSignOut }: AdminTopbarProps): React.JSX.Element {
  const pathname = usePathname();
  const firstName = greetingName(displayName);
  const accountLabel = displayName
    ? `Account menu for ${displayName}`
    : ACCOUNT_MENU_LABEL;

  return (
    <header className="topbar">
      <Link href="/admin" className="topbar__brand" aria-label="FindBack home">
        <BrandMark />
      </Link>

      <nav className="topbar__nav" aria-label={ADMIN_NAV_LABEL}>
        <ul className="admin-nav">
          <li>
            <Link
              href="/admin"
              className="topbar__link"
              aria-current={pathname === '/admin' ? 'page' : undefined}
            >
              {ADMIN_NAV_DASHBOARD}
            </Link>
          </li>
          {ADMIN_NAV_LINKS.map((link) => {
            const href = OPERATIONAL_QUEUE_ROUTES[link.id];

            return (
              <li key={link.id}>
                <Link
                  href={href}
                  className="topbar__link"
                  aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="topbar__spacer" />

      <div className="topbar__actions">
        <ThemeToggle />

        <DisclosureMenu
          label={accountLabel}
          entries={ACCOUNT_MENU_ENTRIES}
          triggerClassName="account-menu__trigger"
          trigger={
            <>
              <span className="account-menu__avatar" aria-hidden="true">
                {initials(displayName)}
              </span>
              <span className="account-menu__name">
                {firstName === 'there' ? 'Account' : firstName}
              </span>
              <span className="account-menu__caret" aria-hidden="true" />
            </>
          }
          header={
            displayName ? (
              <li className="account-menu__header">
                <strong>{displayName}</strong>
                <span>Administrator</span>
              </li>
            ) : null
          }
        >
          {onSignOut ? (
            <li>
              <button type="button" className="menu__item" onClick={onSignOut}>
                {LOG_OUT}
              </button>
            </li>
          ) : null}
        </DisclosureMenu>
      </div>
    </header>
  );
}
