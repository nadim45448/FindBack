'use client';

/**
 * The member topbar — §3.2, §9.4.
 *
 * ## The member nav carries the four views and nothing else
 *
 * §3.2: *"Active Member. Top nav exposes the **four authoritative views**:
 * `My Reports`, `Browse`, `My Claims`, `My Recovery Responses` — plus
 * `Account`."*
 *
 * **The four views are a closed list.** They are the FR-49 partitions, and
 * the list comes from `member-navigation.ts` — one place, so a fifth entry
 * cannot appear by accident. FR-30's absence is thereby structural: there
 * is no slot into which a notification bell could be added.
 *
 * Report Lost / Found live on the member home as paired CTAs, not as a
 * topbar control beside Theme.
 *
 * ## Account is initials chrome, not a profile photo
 *
 * The generated mockup's Account trigger is a 28px initials circle, the
 * first name, and a caret. EXPERIENCE.md §9.4a forbids a profile photo;
 * the circle is header chrome only. The menu still has exactly two
 * entries — Profile (FR-52) and Logout. Theme is **not** here — §19
 * makes Theme a separate topbar icon control.
 *
 * ## The disclosures are real buttons
 *
 * A `▾` menu is a disclosure widget, so the trigger is a `<button>` with
 * `aria-expanded` and `aria-controls`, and the panel is toggled by state.
 * The trigger is **not** a link: it opens a panel, it does not navigate.
 *
 * ## No bell, no badge, no unread count
 *
 * FR-30 forbids an in-app notification stream. The member topbar therefore
 * has **no** notification control of any kind — the only controls are the
 * navigation entries, the Account disclosure, and the theme toggle.
 */

import Link from 'next/link';

import {
  ACCOUNT_MENU_ENTRIES,
  ACCOUNT_MENU_LABEL,
  MEMBER_NAV_LABEL,
  MEMBER_VIEW_ENTRIES,
} from '@/domain/listings';

import { BrandMark } from './brand-mark';
import { DisclosureMenu } from './disclosure-menu';
import { greetingName, initials } from './greeting';
import { ThemeToggle } from './theme-toggle';
import { LOG_OUT } from './copy';

/**
 * The member topbar's props.
 */
export interface MemberTopbarProps {
  /** The account's display name. */
  readonly displayName?: string | undefined;
  /**
   * The sign-out handler.
   *
   **The sign-out is a POST, so it cannot be a plain link.** The parent
   * supplies the handler because it owns the CSRF token and the router;
   * the topbar owns only the chrome.
   */
  readonly onSignOut?: (() => void) | undefined;
}

/**
 * The member topbar.
 */
export function MemberTopbar({ displayName, onSignOut }: MemberTopbarProps): React.JSX.Element {
  const firstName = greetingName(displayName);
  const accountLabel = displayName
    ? `Account menu for ${displayName}`
    : ACCOUNT_MENU_LABEL;

  return (
    <header className="topbar">
      <Link href="/home" className="topbar__brand" aria-label="FindBack home">
        <BrandMark />
      </Link>

      <nav className="topbar__nav" aria-label={MEMBER_NAV_LABEL}>
        <ul className="member-nav">
          {MEMBER_VIEW_ENTRIES.map((entry) => (
            <li key={entry.href}>
              <Link href={entry.href} className="topbar__link">
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

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
                <span>Member</span>
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
