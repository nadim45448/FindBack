/**
 * @vitest-environment jsdom
 */

/**
 * The member navigation and the member dashboard — bolt `014`, story 003.
 *
 * **These are the tests for the shell that carries the four views.**
 *
 * - **The member topbar** — the four authoritative views, Account, Theme,
 *   and **no Report control beside Theme**.
 * - **The member dashboard** — §9.4: two paired primaries, the four
 *   entry-point links below the fold, and **no aggregate activity feed**.
 *
 * **The four views are a closed list.** A fifth entry cannot appear by
 * accident, because the list is data and the data is the FR-49 partition
 * set — so these tests assert the *list*, not just that some links exist.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_MENU_ENTRIES,
  ACCOUNT_MENU_LABEL,
  MEMBER_VIEW_ENTRIES,
} from '@/domain/listings';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import { MemberHomeSurface } from './member-home-surface';
import { MemberTopbar } from './member-topbar';

const router: RouterStub = createRouterStub();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the member topbar', () => {
  it('exposes the four authoritative views, in order', () => {
    render(<MemberTopbar />);

    const nav = screen.getByRole('navigation', { name: 'Member navigation' });
    const labels = Array.from(nav.querySelectorAll('a')).map((link) => link.textContent);

    expect(labels).toEqual([
      'My Reports',
      'Browse',
      'My Claims',
      'My Recovery Responses',
    ]);
  });

  it('points each view at its own route', () => {
    // **§3.1's routes, verbatim.** The nav entry names the partition, and
    // the route is derived from it — so a label and its destination cannot
    // drift apart.
    render(<MemberTopbar />);

    expect(screen.getByRole('link', { name: 'My Reports' }).getAttribute('href')).toBe(
      '/my/reports',
    );
    expect(screen.getByRole('link', { name: 'Browse' }).getAttribute('href')).toBe('/listings');
    expect(screen.getByRole('link', { name: 'My Claims' }).getAttribute('href')).toBe(
      '/my/claims',
    );
    expect(
      screen.getByRole('link', { name: 'My Recovery Responses' }).getAttribute('href'),
    ).toBe('/my/recovery-responses');
  });

  it('offers no notification control of any kind', () => {
    // **FR-30 forbids an in-app notification stream.** So the member
    // topbar has no bell, no badge, and no unread count — and the absence
    // is structural, because the nav's entry list is a closed set.
    const { container } = render(<MemberTopbar />);

    expect(container.textContent).not.toMatch(/notification|bell|unread/i);
    expect(screen.queryByRole('button', { name: /notification/i })).toBeNull();
    // **The four views are the whole of the nav** — no fifth entry.
    expect(MEMBER_VIEW_ENTRIES).toHaveLength(4);
  });

  it('does not put a Report control beside Theme', () => {
    render(<MemberTopbar />);

    expect(screen.queryByRole('button', { name: /Report/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Report Lost Item' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Report Found Item' })).toBeNull();
  });

  it('opens the Account menu with Profile and Logout', () => {
    // **§9.4: "Profile entry (FR-52) and Logout."** Theme is **not** here
    // — §19 makes Theme a separate topbar icon control.
    render(<MemberTopbar onSignOut={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_MENU_LABEL }));

    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe(
      '/my/profile',
    );
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    // **The account menu's own entry list is exactly one** — the sign-out
    // is supplied by the parent, because the sign-out is a POST.
    expect(ACCOUNT_MENU_ENTRIES).toHaveLength(1);
  });

  it('shows the initials avatar and first name on the Account trigger', () => {
    render(<MemberTopbar displayName="Ada Lovelace" />);

    expect(screen.getByRole('button', { name: 'Account menu for Ada Lovelace' })).toBeTruthy();
    expect(screen.getByText('AL')).toBeTruthy();
    expect(screen.getByText('Ada')).toBeTruthy();
  });

});

describe('the member dashboard', () => {
  it('offers the two paired primaries', () => {
    // **§9.4: "Two primary CTAs (Report Lost, Report Found) presented as
    // paired primaries."** They are **links**, not buttons — each opens a
    // page, and a page is reached by navigation.
    render(<MemberHomeSurface />);

    expect(screen.getByRole('link', { name: 'Report Lost Item' }).getAttribute('href')).toBe(
      '/report/lost',
    );
    expect(screen.getByRole('link', { name: 'Report Found Item' }).getAttribute('href')).toBe(
      '/report/found',
    );
  });

  it('offers the four entry-point links below the fold', () => {
    // **§9.4: "clear entry-point links to the four authoritative
    // participation views."** The links are the whole of the section.
    render(<MemberHomeSurface />);

    for (const entry of MEMBER_VIEW_ENTRIES) {
      expect(screen.getByRole('link', { name: entry.label }).getAttribute('href')).toBe(
        entry.href,
      );
    }
  });

  it('shows the four summary stat tiles from the mockup', () => {
    render(
      <MemberHomeSurface
        stats={{
          openReports: 2,
          responsesToReview: 1,
          pendingClaims: 1,
          approvedClaims: 0,
          returnedItems: 3,
        }}
      />,
    );

    expect(screen.getByLabelText('Your summary').textContent).toContain('2');
    expect(screen.getByLabelText('Your summary').textContent).toContain('1');
    expect(screen.getByLabelText('Your summary').textContent).toContain('3');
    expect(screen.getByText('My open reports')).toBeTruthy();
    expect(screen.getByText('Pending claims')).toBeTruthy();
    expect(screen.getByText('Returned items')).toBeTruthy();
  });

  it('carries no aggregate activity feed', () => {
    const { container } = render(
      <MemberHomeSurface
        stats={{
          openReports: 0,
          pendingClaims: 0,
          approvedClaims: 0,
          returnedItems: 0,
          responsesToReview: 0,
        }}
      />,
    );

    expect(container.textContent).not.toMatch(/activity feed|recent activity|latest activity/i);
  });

  it('greets the member by name when the server knows it', () => {
    render(<MemberHomeSurface displayName="Alex" />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /^Good (morning|afternoon|evening), Alex\.$/,
    );
  });

  it('shows the greeting without a name when the server does not know it', () => {
    render(<MemberHomeSurface />);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /^Good (morning|afternoon|evening), there\.$/,
    );
  });
});
