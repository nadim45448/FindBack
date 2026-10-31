/**
 * @vitest-environment jsdom
 */

/**
 * The administrator surfaces' tests.
 *
 * ## The stories under test
 *
 * - **007-administrator-dashboard** (FR-33) — four count tiles, each a
 *   real link; no `Recent activity`; no notification bell.
 * - **008-administrator-queues** (§15.2–§15.5) — the ARIA grid pattern,
 *   the roving `tabindex`, the arrow-key navigation, the per-queue empty
 *   states.
 * - **009-no-other-notifications** (FR-30) — **the absence**, verified by
 *   grepping the rendered DOM for the forbidden markers.
 * - **010-contextual-audit-views** (§17.1–§17.3) — the trail is a table,
 *   the disclosure is collapsed by default, pagination is a button.
 *
 * ## FR-30 is verified by absence, not by assertion of presence
 *
 * Story 009's note: *"a negative requirement that passes silently if
 * nobody checks for it."* So the test greps the rendered DOM of **every**
 * administrator surface for the forbidden markers, and the marker list
 * lives in the domain so the surfaces and the test cannot disagree about
 * what is forbidden.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NOTIFICATION_SURFACE_MARKERS,
  type DashboardCounts,
} from '@/domain/administration';
import { ACCOUNT_MENU_LABEL } from '@/domain/listings';

import { resetDomEnvironment } from '@/test/dom';

import { AdminAccessScreen } from './admin-access-screen';
import { AdminAuditTrailSurface, type AuditTrailRow } from './admin-audit-trail-surface';
import { AdminDashboardSurface } from './admin-dashboard-surface';
import { AdminTopbar } from './admin-topbar';
import {
  AdminQueueSurface,
  type QueueColumn,
  type QueueRowView,
} from './admin-queue-surface';
import { ADMIN_ACCESS_MESSAGE, ALL_CAUGHT_UP } from './admin-copy';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

/** The four counts, one of them zero. */
const COUNTS: DashboardCounts = Object.freeze({
  'pending-registrations': 3,
  'pending-claims': 12,
  'awaiting-return': 0,
  verifications: 5,
});

/** A queue's columns. */
const COLUMNS: readonly QueueColumn[] = Object.freeze([
  { heading: 'Name' },
  { heading: 'Email' },
]);

/** A queue's rows. */
const ROWS: readonly QueueRowView[] = Object.freeze([
  {
    key: 'row-1',
    cells: ['Riley Chen', 'riley@example.edu'],
    actionLabel: 'Approve',
    actionHref: '/admin/registrations/aaaaaaaa-0000-0000-0000-000000000001',
  },
  {
    key: 'row-2',
    cells: ['Sam Okafor', 'sam@example.edu'],
    actionLabel: 'Approve',
    actionHref: '/admin/registrations/bbbbbbbb-0000-0000-0000-000000000002',
  },
]);

/**
 * Assert that a rendered container carries none of FR-30's forbidden
 * markers.
 *
 * **The check is on the markup, not on the component's props.** A
 * notification bell built from an icon and an `aria-label` would pass a
 * prop check and fail this one.
 */
function expectNoNotificationSurface(container: HTMLElement): void {
  const markup = container.innerHTML.toLowerCase();

  for (const marker of NOTIFICATION_SURFACE_MARKERS) {
    expect(
      markup.includes(marker.toLowerCase()),
      `The rendered surface carries the forbidden marker "${marker}".`,
    ).toBe(false);
  }
}

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('the administrator dashboard surface', () => {
  it('renders exactly four tiles', () => {
    const { container } = render(<AdminDashboardSurface counts={COUNTS} />);

    expect(container.querySelectorAll('a.admin-tile')).toHaveLength(4);
  });

  it('labels each tile with its queue name and count', () => {
    render(<AdminDashboardSurface counts={COUNTS} />);

    expect(screen.getByLabelText('Pending Registrations: 3')).toBeTruthy();
    expect(screen.getByLabelText('Pending Claims: 12')).toBeTruthy();
    expect(screen.getByLabelText('Items Awaiting Return: 0')).toBeTruthy();
    expect(screen.getByLabelText('Items in Verification: 5')).toBeTruthy();
  });

  it('links each tile to its own queue', () => {
    render(<AdminDashboardSurface counts={COUNTS} />);

    expect(screen.getByLabelText('Pending Registrations: 3').getAttribute('href')).toBe(
      '/admin/registrations',
    );
    expect(screen.getByLabelText('Pending Claims: 12').getAttribute('href')).toBe('/admin/claims');
    expect(screen.getByLabelText('Items Awaiting Return: 0').getAttribute('href')).toBe(
      '/admin/awaiting-return',
    );
    expect(screen.getByLabelText('Items in Verification: 5').getAttribute('href')).toBe(
      '/admin/verifications',
    );
  });

  it('shows "All caught up." only on the empty tile', () => {
    render(<AdminDashboardSurface counts={COUNTS} />);

    const emptyCopies = screen.getAllByText(ALL_CAUGHT_UP);

    expect(emptyCopies).toHaveLength(1);
  });

  it('shows "All caught up." on every tile when every count is zero', () => {
    const zeroed: DashboardCounts = Object.freeze({
      'pending-registrations': 0,
      'pending-claims': 0,
      'awaiting-return': 0,
      verifications: 0,
    });

    render(<AdminDashboardSurface counts={zeroed} />);

    expect(screen.getAllByText(ALL_CAUGHT_UP)).toHaveLength(4);
  });

  it('renders no "Recent activity" section', () => {
    const { container } = render(<AdminDashboardSurface counts={COUNTS} />);

    // **§15.1: the dashboard has no on-dashboard activity feed.**
    expect(container.textContent).not.toContain('Recent activity');
    expect(container.textContent).not.toContain('recent activity');
  });

  it('renders no audit tile and no audit link', () => {
    const { container } = render(<AdminDashboardSurface counts={COUNTS} />);

    // **Audit is contextual, not a queue** — §15.1, §17.1.
    expect(container.textContent).not.toContain('Audit');
    expect(container.querySelector('a[href*="audit"]')).toBeNull();
  });

  it('renders no notification surface', () => {
    const { container } = render(<AdminDashboardSurface counts={COUNTS} />);

    expectNoNotificationSurface(container);
  });

  it('renders no notification control in the loading state', () => {
    const { container } = render(<AdminDashboardSurface counts={null} />);

    expectNoNotificationSurface(container);
  });

  it('renders a skeleton rather than a zero while loading', () => {
    const { container } = render(<AdminDashboardSurface counts={null} />);

    // **A zero is a fact about the queue, not a placeholder.** A skeleton
    // that rendered `0` would be indistinguishable from a real zero.
    expect(container.textContent).not.toContain('0');
    expect(container.querySelector('.admin-tile__skeleton-bar')).not.toBeNull();
  });

  it('renders the error state with a retry', () => {
    render(<AdminDashboardSurface counts={null} error="Something went wrong." />);

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('renders the error state with "Go back" as the secondary action', () => {
    render(<AdminDashboardSurface counts={null} error="Something went wrong." />);

    // **§5.14: "'Try again' as primary, 'Go back' as secondary."** The
    // secondary is a real link — it leaves the page rather than repeating
    // the read that just failed.
    const back = screen.getByRole('link', { name: 'Go back' });

    expect(back.getAttribute('href')).toBe('/');
  });

  it('renders no stack trace in the error state', () => {
    const { container } = render(
      <AdminDashboardSurface counts={null} error="Something went wrong." />,
    );

    // **§5.14: "No stack traces. Logs handle diagnostics."**
    expect(container.textContent).not.toContain('at ');
    expect(container.querySelector('pre')).toBeNull();
  });
});

describe('the administrator access screen', () => {
  it('shows §15.6’s message', () => {
    render(<AdminAccessScreen />);

    expect(screen.getByText(ADMIN_ACCESS_MESSAGE)).toBeTruthy();
  });

  it('delivers no dashboard content', () => {
    const { container } = render(<AdminAccessScreen />);

    // **A count is a leak** — "there are 3 pending claims" tells a
    // non-administrator about work they may not see.
    expect(container.textContent).not.toContain('Pending Claims');
    expect(container.textContent).not.toContain('Pending Registrations');
    expect(screen.queryAllByRole('link')).toHaveLength(1);
  });

  it('announces calmly, not assertively', () => {
    const { container } = render(<AdminAccessScreen />);

    // **The restricted state is not an error** — the member did nothing
    // wrong, so an assertive announcement would interrupt them.
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('renders no notification surface', () => {
    const { container } = render(<AdminAccessScreen />);

    expectNoNotificationSurface(container);
  });
});

describe('the administrator queue surface', () => {
  it('renders the ARIA grid pattern', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />,
    );

    expect(container.querySelector('[role="grid"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="row"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[role="columnheader"]').length).toBe(COLUMNS.length);
  });

  it('puts exactly one row in the tab order', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />,
    );

    const tabbable = container.querySelectorAll('[role="row"][tabindex="0"]');

    // **The roving `tabindex` means exactly one row is in the tab order.**
    expect(tabbable).toHaveLength(1);
    expect(container.querySelectorAll('[role="row"][tabindex="-1"]')).toHaveLength(ROWS.length - 1);
  });

  it('moves the focus down with the Down arrow', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />,
    );

    const rows = container.querySelectorAll<HTMLElement>('[role="row"][tabindex]');
    const first = rows[0];

    first?.focus();
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(rows[1]);
    expect(rows[1]?.getAttribute('tabindex')).toBe('0');
  });

  it('moves the focus up with the Up arrow', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />,
    );

    const rows = container.querySelectorAll<HTMLElement>('[role="row"][tabindex]');

    rows[1]?.focus();
    fireEvent.keyDown(rows[1] as HTMLElement, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(rows[0]);
  });

  it('jumps to the ends with Home and End', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />,
    );

    const rows = container.querySelectorAll<HTMLElement>('[role="row"][tabindex]');

    fireEvent.keyDown(rows[0] as HTMLElement, { key: 'End' });
    expect(document.activeElement).toBe(rows[rows.length - 1]);

    fireEvent.keyDown(rows[rows.length - 1] as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);
  });

  it('clamps the focus rather than wrapping it', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />,
    );

    const rows = container.querySelectorAll<HTMLElement>('[role="row"][tabindex]');

    // **Wrapping would send the administrator to the top of the queue by
    // accident.**
    fireEvent.keyDown(rows[0] as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(rows[rows.length - 1] as HTMLElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[rows.length - 1]);
  });

  it('renders the action as a link that reaches the work item', () => {
    render(<AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />);

    const action = screen.getAllByRole('link', { name: 'Approve' })[0];

    expect(action?.getAttribute('href')).toBe(
      '/admin/registrations/aaaaaaaa-0000-0000-0000-000000000001',
    );
  });

  it('renders the Pending Registrations empty state with its note', () => {
    render(<AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={[]} />);

    expect(screen.getByText('No pending registrations.')).toBeTruthy();
    expect(screen.getByText('When someone new registers, they appear here.')).toBeTruthy();
  });

  it('renders the other three empty states without a note', () => {
    const empties: readonly [string, string][] = [
      ['pending-claims', 'No pending claims.'],
      ['awaiting-return', 'No items are awaiting return.'],
      ['verifications', 'No items are in verification.'],
    ];

    for (const [queue, copy] of empties) {
      const { container, unmount } = render(
        <AdminQueueSurface
          queue={queue as 'pending-claims'}
          columns={COLUMNS}
          rows={[]}
        />,
      );

      expect(container.textContent).toContain(copy);
      expect(container.textContent).not.toContain(
        'When someone new registers, they appear here.',
      );

      unmount();
    }
  });

  it('renders a sortable heading as a button with aria-sort', () => {
    const { container } = render(
      <AdminQueueSurface
        queue="pending-registrations"
        columns={[{ heading: 'Registered', sortable: true }]}
        rows={ROWS}
      />,
    );

    const header = container.querySelector('[role="columnheader"]');

    expect(header?.getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getByRole('button', { name: 'Sort by Registered' })).toBeTruthy();
  });

  it('renders no notification surface', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={ROWS} />,
    );

    expectNoNotificationSurface(container);
  });

  it('renders no notification surface in the empty state', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={[]} />,
    );

    expectNoNotificationSurface(container);
  });

  it('renders the error state with a retry and a "Go back" secondary', () => {
    render(
      <AdminQueueSurface
        queue="pending-registrations"
        columns={COLUMNS}
        rows={[]}
        error="Something went wrong."
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go back' })).toBeTruthy();
  });

  it('renders a skeleton table while loading', () => {
    const { container } = render(
      <AdminQueueSurface queue="pending-registrations" columns={COLUMNS} rows={[]} loading />,
    );

    // **§15.6: "Each queue renders a skeleton table."** The skeleton's
    // shape is the table's shape, so the layout does not jump.
    expect(container.querySelector('.admin-queue__skeleton-bar')).not.toBeNull();
  });
});

describe('the contextual audit trail surface', () => {
  /** A trail row with additional fields. */
  const ROW_WITH_DETAILS: AuditTrailRow = {
    id: 'event-1',
    eventType: 'claim.approved',
    actorDisplayName: 'Riley Chen',
    actorRole: 'administrator',
    target: 'Brown leather wallet',
    occurredAt: '14 Mar 2026, 09:15',
    details: ['Reason: identifying details matched'],
    reason: 'Identifying details matched',
  };

  /** A trail row with no additional fields. */
  const ROW_WITHOUT_DETAILS: AuditTrailRow = {
    id: 'event-2',
    eventType: 'report.created',
    actorDisplayName: 'Sam Okafor',
    actorRole: 'member',
    target: 'Blue umbrella',
    occurredAt: '13 Mar 2026, 08:00',
    details: [],
  };

  it('renders the trail as a table with column headers', () => {
    const { container } = render(
      <AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} />,
    );

    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('th[scope="col"]').length).toBe(5);
  });

  it('shows the actor, the verb, and the target', () => {
    render(<AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} />);

    expect(screen.getByText('Riley Chen')).toBeTruthy();
    expect(screen.getByText('approved')).toBeTruthy();
    expect(screen.getByText('Brown leather wallet')).toBeTruthy();
    expect(screen.getByText('Administrator')).toBeTruthy();
  });

  it('collapses the details disclosure by default', () => {
    render(<AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} />);

    const disclosure = screen.getByRole('button', { name: 'Show details' });

    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
    expect(disclosure.getAttribute('aria-controls')).toBeTruthy();
  });

  it('expands the disclosure on click', () => {
    render(<AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} />);

    const disclosure = screen.getByRole('button', { name: 'Show details' });

    fireEvent.click(disclosure);

    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Reason: Identifying details matched')).toBeTruthy();
  });

  it('renders no disclosure for a row with no additional fields', () => {
    render(<AdminAuditTrailSurface rows={[ROW_WITHOUT_DETAILS]} />);

    // **The story's edge case: "Event has no additional fields → `Show
    // details` is not rendered for that row".**
    expect(screen.queryByRole('button', { name: 'Show details' })).toBeNull();
  });

  it('offers "Load older" only when there is more to load', () => {
    const { rerender } = render(
      <AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} hasMore={false} />,
    );

    expect(screen.queryByRole('button', { name: 'Load older' })).toBeNull();

    rerender(<AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} hasMore={true} />);

    expect(screen.getByRole('button', { name: 'Load older' })).toBeTruthy();
  });

  it('renders the empty state when the parent has no events', () => {
    render(<AdminAuditTrailSurface rows={[]} />);

    expect(screen.getByText('There are no events for this item yet.')).toBeTruthy();
  });

  it('renders no control that mutates an event', () => {
    const { container } = render(
      <AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} hasMore={true} />,
    );

    // **The trail is append-only** — no edit, no delete, anywhere.
    const labels = [...container.querySelectorAll('button')].map((button) =>
      (button.textContent ?? '').toLowerCase(),
    );

    expect(labels).not.toContain('edit');
    expect(labels).not.toContain('delete');
    expect(labels).not.toContain('remove');
  });

  it('renders no notification surface', () => {
    const { container } = render(<AdminAuditTrailSurface rows={[ROW_WITH_DETAILS]} />);

    expectNoNotificationSurface(container);
  });

  it('renders the error state with a retry and a "Go back" secondary', () => {
    render(<AdminAuditTrailSurface rows={[]} error="Something went wrong." />);

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go back' })).toBeTruthy();
  });
});

describe('the administrator topbar', () => {
  it('shows the brand mark, the dashboard, and the four queue links', () => {
    render(<AdminTopbar />);

    expect(screen.getByRole('link', { name: 'FindBack home' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Registrations' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Claims' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Awaiting return' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'In verification' })).toBeTruthy();
  });

  it('routes each queue link to its own queue', () => {
    render(<AdminTopbar />);

    expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/admin');
    expect(screen.getByRole('link', { name: 'Registrations' }).getAttribute('href')).toBe(
      '/admin/registrations',
    );
    expect(screen.getByRole('link', { name: 'Claims' }).getAttribute('href')).toBe(
      '/admin/claims',
    );
    expect(screen.getByRole('link', { name: 'Awaiting return' }).getAttribute('href')).toBe(
      '/admin/awaiting-return',
    );
    expect(screen.getByRole('link', { name: 'In verification' }).getAttribute('href')).toBe(
      '/admin/verifications',
    );
  });

  it('carries no audit link', () => {
    const { container } = render(<AdminTopbar />);

    // **§17.1: audit is reached from the report's context only.** A
    // topbar audit entry would be a global audit entry point by another
    // name.
    expect(container.querySelector('a[href*="audit"]')).toBeNull();
    expect(container.textContent).not.toContain('Audit');
  });

  it('carries no notification control', () => {
    const { container } = render(<AdminTopbar />);

    // **FR-30: no bell, no badge, no unread count.** Theme is chrome,
    // and logout lives inside Account ▾ — neither is a notification.
    expectNoNotificationSurface(container);
  });

  it('shows the initials avatar and first name on the Account trigger', () => {
    render(<AdminTopbar displayName="Grace Hopper" />);

    expect(screen.getByRole('button', { name: 'Account menu for Grace Hopper' })).toBeTruthy();
    expect(screen.getByText('GH')).toBeTruthy();
    expect(screen.getByText('Grace')).toBeTruthy();
  });

  it('opens the Account menu with Profile and Logout', () => {
    // **§5.2: on administrator pages, Logout lives inside Account ▾.**
    render(<AdminTopbar onSignOut={() => undefined} />);

    fireEvent.click(screen.getByRole('button', { name: ACCOUNT_MENU_LABEL }));

    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe(
      '/my/profile',
    );
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
  });
});
