/**
 * @vitest-environment jsdom
 */

/**
 * The member surfaces' tests — bolt `014`, stories 003, 004, and 006.
 *
 * **These are the tests for the surfaces that carry a privacy property.**
 *
 * - **The member view surface** — story 003: the four views are disjoint,
 *   the tabs are links, and the empty view has exactly one next action.
 * - **The item detail surface** — story 004: the projection is the page,
 *   and a withheld field is **absent from the delivered HTML** rather than
 *   concealed.
 * - **The thread panel** — story 006: the read-only notice is the domain's,
 *   and a permission denial is the server's answer.
 *
 * **The projection is never re-evaluated here.** A test that asserts the
 * surface renders a field the projection carried is asserting the *server's*
 * decision; a test that asserts the surface renders no field the projection
 * did not carry is asserting that the client added none.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import { fieldSetOf, type VisibilityProjection } from '@/domain/listings';

import { MemberViewSurface } from './member-view-surface';
import { MyReportsSurface } from './my-reports-surface';
import { ItemDetailSurface } from './item-detail-surface';
import { ThreadPanel } from './thread-panel';

import {
  EMPTY_VIEW_BODY,
  EMPTY_VIEW_HEADING,
  HIDDEN_FROM_OTHER_MEMBERS,
  RECOVERY_RESPONSE_THREAD_PERMISSION_DENIED,
} from './member-copy';

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

/**
 * A projection, as the server hands it over.
 *
 * **The fields the projection carries are the fields the member may see.**
 * The surface is given this and nothing else.
 */
function projection(overrides: Partial<VisibilityProjection> = {}): VisibilityProjection {
  return {
    reportId: '11111111-1111-1111-1111-111111111111',
    viewerId: '22222222-2222-2222-2222-222222222222',
    columns: ['unrelatedMember'],
    reportFields: fieldSetOf([
      'summary',
      'description',
      'image',
      'reporterName',
      'statusHistory',
    ]),
    report: {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'Lost',
      status: 'Open',
      name: 'Brown leather wallet',
      category: 'Wallet',
      date: '2026-10-20',
      campusArea: 'Library',
      description: 'A brown leather wallet with a zip pocket.',
      imageRef: 'reports/11111111/image.webp',
      reporterDisplayName: 'Alex',
      statusHistory: { status: 'Open', lastActionAt: '2026-10-20T09:00:00.000Z' },
    },
    claims: [],
    recoveryResponses: [],
    threads: [],
    auditTrail: null,
    ...overrides,
  };
}

describe('the member view surface', () => {
  it('renders the rows it is given', () => {
    render(
      <MemberViewSurface
        heading="My Reports"
        reportRows={[
          {
            id: '11111111-1111-1111-1111-111111111111',
            type: 'Lost',
            status: 'Open',
            name: 'Brown leather wallet',
            category: 'Wallet',
            date: '2026-10-20',
            campusArea: 'Library',
          },
        ]}
      />,
    );

    expect(screen.getByText('Brown leather wallet')).toBeTruthy();
  });

  it('renders the tabs as links, with the current one marked', () => {
    // **A tab is a filter, so it is a link with a real destination** — and
    // the current tab carries `aria-current="page"` so a screen reader
    // announces which one is selected.
    render(
      <MemberViewSurface
        heading="My Reports"
        tabs={[
          { label: 'Lost', href: '/my/reports?tab=lost', current: true },
          { label: 'Found', href: '/my/reports?tab=found', current: false },
        ]}
        reportRows={[]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Lost' }).getAttribute('href')).toBe(
      '/my/reports?tab=lost',
    );
    expect(screen.getByRole('link', { name: 'Lost' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Found' }).getAttribute('aria-current')).toBeNull();
  });

  it('shows the empty state with a headline, a body, and one next action', () => {
    // **§5.14 and story 003's criterion:** a friendly headline, a
    // one-sentence body, a single next-action button, and no illustration.
    render(
      <MemberViewSurface
        heading="My Claims"
        reportRows={[]}
        emptyAction={{ label: 'Report Lost Item', href: '/report/lost' }}
      />,
    );

    expect(screen.getByText(EMPTY_VIEW_HEADING)).toBeTruthy();
    expect(screen.getByText(EMPTY_VIEW_BODY)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Report Lost Item' })).toHaveLength(1);
  });

  it('shows the error when the read failed, and no empty state beside it', () => {
    // **An error is not an empty view.** A member must be able to tell "you
    // have no Claims" from "the Claims could not be loaded".
    render(<MemberViewSurface heading="My Claims" error="Something went wrong." />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText(EMPTY_VIEW_HEADING)).toBeNull();
  });

  it('renders the breadcrumbs, with the current page not a link', () => {
    render(
      <MemberViewSurface
        heading="My Reports"
        crumbs={[
          { label: 'Home', href: '/home' },
          { label: 'My Reports', href: null },
        ]}
        reportRows={[]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/home');
    expect(screen.queryByRole('link', { name: 'My Reports' })).toBeNull();
    // **The current page's crumb carries `aria-current="page"`,** so a
    // screen reader announces where the member already is.
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });

    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe('My Reports');
  });
});

describe('the My reports surface', () => {
  it('renders the mockup table and header actions', () => {
    render(
      <MyReportsSurface
        rows={[
          {
            id: '11111111-1111-1111-1111-111111111111',
            type: 'Found',
            status: 'Open',
            name: 'Blue backpack',
            category: 'Bag',
            date: '2026-10-20',
            campusArea: 'library',
          },
        ]}
        claimSummaries={{
          '11111111-1111-1111-1111-111111111111': {
            approved: 1,
            pending: 2,
            rejected: 0,
          },
        }}
        campusAreaLabels={{ library: 'Library' }}
        statusFilter={null}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Claims' })).toBeTruthy();
    expect(screen.getByText('1 approved · 2 pending')).toBeTruthy();
    expect(screen.getByText('Bag · Library')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Report lost' })).toBeTruthy();
  });
});

describe('the item detail surface', () => {
  it('renders the projected fields', () => {
    render(<ItemDetailSurface projection={projection()} />);

    expect(screen.getByText('Brown leather wallet')).toBeTruthy();
    expect(screen.getByText('A brown leather wallet with a zip pocket.')).toBeTruthy();
    expect(screen.getByText('Alex')).toBeTruthy();
  });

  it('omits a withheld field from the delivered HTML entirely', () => {
    // **Story 004's criterion:** the field's value is *"absent from the
    // delivered HTML — not blank, not masked, not fetched and hidden in the
    // client."* The projection never carried it, so the client never had
    // it — and the rendered markup contains no trace of it.
    const withoutSensitive = projection();

    const { container } = render(<ItemDetailSurface projection={withoutSensitive} />);

    expect(container.textContent).not.toMatch(/secret location|identifying marks/i);
    expect(screen.getAllByText(HIDDEN_FROM_OTHER_MEMBERS).length).toBeGreaterThan(0);
  });

  it('states that a withheld section is hidden, beside the heading', () => {
    render(<ItemDetailSurface projection={projection()} />);

    // **The heading renders; the value does not.** The notice is the
    // anchor, so a member knows the section exists and why it is empty.
    expect(screen.getAllByText(HIDDEN_FROM_OTHER_MEMBERS).length).toBeGreaterThan(0);
  });

  it('shows the type and status badges with their text', () => {
    // **The badge carries the meaning; the colour is decoration.** §5.8
    // forbids colour being the sole carrier.
    const { container } = render(<ItemDetailSurface projection={projection()} />);

    expect(container.textContent).toContain('Lost item');
    expect(container.textContent).toContain('Open');
  });

  it('offers the Lost-side CTA, and never the Found-side one', () => {
    // **§9.6: the CTA on a Lost item reads `I may have found this item`
    // (NOT 'Submit claim').**
    render(<ItemDetailSurface projection={projection()} />);

    expect(
      screen.getByRole('link', { name: 'I may have found this item' }).getAttribute('href'),
    ).toBe('/listings/11111111-1111-1111-1111-111111111111/submit-recovery-response');
    expect(screen.queryByRole('link', { name: 'Submit claim' })).toBeNull();
  });

  it('offers the Found-side CTA on a Found item', () => {
    const found = projection({
      report: { ...projection().report, type: 'Found' },
    });

    render(<ItemDetailSurface projection={found} />);

    expect(
      screen.getByRole('link', { name: 'Submit a claim' }).getAttribute('href'),
    ).toBe('/listings/11111111-1111-1111-1111-111111111111/claim');
    expect(screen.queryByRole('link', { name: 'I may have found this item' })).toBeNull();
  });

  it('offers the Lost owner a link to review recovery responses', () => {
    const ownLost = projection({
      columns: ['unrelatedMember', 'lostReportOwner'],
      recoveryResponses: [
        {
          responseId: '55555555-5555-5555-5555-555555555555',
          status: 'Submitted',
          submittedAt: '2026-10-22T09:00:00.000Z',
          isOwn: false,
          campusArea: 'lecture_halls',
        },
      ],
    });

    render(<ItemDetailSurface projection={ownLost} />);

    expect(
      screen.getByRole('link', { name: 'Review responses' }).getAttribute('href'),
    ).toBe('/my/reports/11111111-1111-1111-1111-111111111111/review-responses');
  });

  it('does not offer participation CTAs on a report the viewer authored', () => {
    const ownLost = projection({
      columns: ['unrelatedMember', 'lostReportOwner'],
    });

    render(<ItemDetailSurface projection={ownLost} />);

    expect(screen.queryByRole('link', { name: 'I may have found this item' })).toBeNull();

    const ownFound = projection({
      columns: ['unrelatedMember', 'foundReportOwner'],
      report: { ...projection().report, type: 'Found' },
    });

    render(<ItemDetailSurface projection={ownFound} />);

    expect(screen.queryByRole('link', { name: 'Submit a claim' })).toBeNull();
  });

  it('does not offer the CTA when the viewer already has a Pending participation', () => {
    // **§12.1's "no Pending claim from this user."** The surface renders
    // the entry points the projection makes available — and a Pending
    // participation makes the CTA unavailable.
    const claimed = projection({
      report: { ...projection().report, type: 'Found' },
      claims: [
        {
          claimId: '33333333-3333-3333-3333-333333333333',
          status: 'Pending',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    render(<ItemDetailSurface projection={claimed} />);

    expect(screen.queryByRole('link', { name: 'Submit claim' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Your claim' }).getAttribute('href')).toBe(
      '/my/claims/33333333-3333-3333-3333-333333333333',
    );
  });

  it('links to the recovery response the viewer owns', () => {
    const responded = projection({
      recoveryResponses: [
        {
          responseId: '44444444-4444-4444-4444-444444444444',
          status: 'Submitted',
          submittedAt: '2026-10-21T09:00:00.000Z',
          isOwn: true,
        },
      ],
    });

    render(<ItemDetailSurface projection={responded} />);

    expect(
      screen.getByRole('link', { name: 'Your recovery response' }).getAttribute('href'),
    ).toBe('/my/recovery-responses/44444444-4444-4444-4444-444444444444');
  });

  it('shows the member-facing status history, and no audit trail', () => {
    // **The status history is the report's status plus the last-action
    // timestamp — and nothing else.** The trail is administrator-only, and
    // nothing on this page exposes it.
    const { container } = render(<ItemDetailSurface projection={projection()} />);

    expect(screen.getByText('Status history')).toBeTruthy();
    expect(container.textContent).not.toMatch(/audit trail/i);
  });
});

describe('the thread panel', () => {
  it('renders the messages oldest first', () => {
    render(
      <ThreadPanel
        heading="Messages"
        messages={[
          {
            id: '1',
            authorDisplayName: 'Alex',
            authorRole: 'Claimant',
            postedAt: '2026-10-21T09:00:00.000Z',
            body: 'First message.',
          },
          {
            id: '2',
            authorDisplayName: 'Sam',
            authorRole: 'Finder',
            postedAt: '2026-10-21T10:00:00.000Z',
            body: 'Second message.',
          },
        ]}
        writable
        readOnlyNotice={null}
        endpoint="/api/claims/1/thread/messages"
      />,
    );

    const body = document.body.textContent ?? '';

    expect(body.indexOf('First message.')).toBeLessThan(body.indexOf('Second message.'));
  });

  it('shows the permission-denied notice and no composer', () => {
    // **A member who is not a participant sees the notice and nothing
    // else.** The composer is absent — the thread is not theirs.
    render(
      <ThreadPanel
        heading="Messages"
        messages={[]}
        writable={false}
        readOnlyNotice={null}
        permissionDenied={RECOVERY_RESPONSE_THREAD_PERMISSION_DENIED}
        endpoint="/api/reports/1/recovery-responses/2/thread/messages"
      />,
    );

    expect(screen.getByText(RECOVERY_RESPONSE_THREAD_PERMISSION_DENIED)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the read-only notice and no composer', () => {
    render(
      <ThreadPanel
        heading="Messages"
        messages={[]}
        writable={false}
        readOnlyNotice="This thread is read-only because this claim has been approved."
        endpoint="/api/claims/1/thread/messages"
      />,
    );

    expect(
      screen.getByText('This thread is read-only because this claim has been approved.'),
    ).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the composer when the thread is writable', () => {
    render(
      <ThreadPanel
        heading="Messages"
        messages={[]}
        writable
        readOnlyNotice={null}
        endpoint="/api/claims/1/thread/messages"
      />,
    );

    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('shows the empty state when the thread has no messages', () => {
    render(
      <ThreadPanel
        heading="Messages"
        messages={[]}
        writable
        readOnlyNotice={null}
        endpoint="/api/claims/1/thread/messages"
      />,
    );

    expect(screen.getByText('No messages yet. Be the first to ask a question.')).toBeTruthy();
  });

  it('posts a message and refreshes the route', async () => {
    const fetchStub = vi.fn().mockResolvedValue({ ok: true });

    vi.stubGlobal('fetch', fetchStub);

    render(
      <ThreadPanel
        heading="Messages"
        messages={[]}
        writable
        readOnlyNotice={null}
        endpoint="/api/claims/1/thread/messages"
      />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello there.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => {
      expect(fetchStub).toHaveBeenCalledWith(
        '/api/claims/1/thread/messages',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    expect(router.refresh).toHaveBeenCalled();
  });
});
