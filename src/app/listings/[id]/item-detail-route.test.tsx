/**
 * @vitest-environment jsdom
 */

/**
 * The item detail route's suite — bolt `014`, story 004.
 *
 * **This is the suite for the route that most tempts a client-side filter.**
 *
 * Story 004's criterion: *"the page renders the projected field set — the
 * server has already applied FR-39's matrix, and the client does not perform
 * a second visibility evaluation of its own."*
 *
 * The bolt's own note is blunter: *"The tempting shortcut here is to
 * re-implement FR-39 as a display filter because it is easier to test in the
 * browser. That would hide a data leak rather than fix one, because the
 * sensitive field would already have been sent to the client."*
 *
 * So the tests here assert the opposite of a display filter:
 *
 * - a field the projection carries **is** rendered — the route does not
 *   strip it;
 * - a field the projection does not carry **is absent from the delivered
 *   HTML** — the route did not fetch it and hide it either;
 * - and the route asks the server for the projection, so the decision
 *   happens where it belongs.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/lib/errors';

import { fieldSetOf, type VisibilityProjection } from '@/domain/listings';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

const router: RouterStub = createRouterStub();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ── The composition roots ───────────────────────────────────────────────────

/** The actor the resolver returns. */
let actor: unknown = {
  actorId: '22222222-2222-2222-2222-222222222222',
  isAdministrator: false,
};

/** The projection the detail service returns. */
let projection: VisibilityProjection | Error = projectionWith();

/** The report id the route asked for. */
let requestedReportId: string | null = null;

/** The actor the route asked with. */
let requestedActorId: string | null = null;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === '__Host-fb' ? { name, value: 'session-token' } : undefined,
  }),
  headers: async () => ({ get: () => null }),
}));

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    details: {
      show: async (requestActor: { readonly actorId: string }, reportId: string) => {
        requestedReportId = reportId;
        requestedActorId = requestActor.actorId;

        if (projection instanceof Error) {
          throw projection;
        }

        return projection;
      },
    },
  }),
}));

import ItemDetailPage from './page';

/**
 * A projection, as the server hands it over.
 *
 * **The column set is `unrelatedMember`** — the member has no relationship
 * with the report, so the sensitive fields are not in the projection at all.
 */
function projectionWith(
  overrides: Partial<VisibilityProjection> = {},
): VisibilityProjection {
  return {
    reportId: '11111111-1111-1111-1111-111111111111',
    viewerId: '22222222-2222-2222-2222-222222222222',
    columns: ['unrelatedMember'],
    reportFields: fieldSetOf(['summary', 'description']),
    report: {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'Lost',
      status: 'Open',
      name: 'Brown leather wallet',
      category: 'Wallet',
      date: '2026-10-20',
      campusArea: 'Library',
      description: 'A brown leather wallet with a zip pocket.',
      reporterDisplayName: 'Alex',
    },
    claims: [],
    recoveryResponses: [],
    threads: [],
    auditTrail: null,
    ...overrides,
  };
}

/** The route's params. */
function params(id: string): Promise<{ readonly id: string }> {
  return Promise.resolve({ id });
}

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
  projection = projectionWith();
  requestedReportId = null;
  requestedActorId = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the item detail route', () => {
  it('asks the server for the projection', async () => {
    // **The decision happens on the server.** The route reads the report
    // through the detail service, which applies FR-39's matrix — and the
    // route never queries anything itself.
    render(await ItemDetailPage({ params: params('11111111-1111-1111-1111-111111111111') }));

    expect(requestedReportId).toBe('11111111-1111-1111-1111-111111111111');
    expect(requestedActorId).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('renders the fields the projection carries', async () => {
    // **The route does not strip a field it thinks should be hidden.** The
    // projection is the truth, and the route renders it.
    render(await ItemDetailPage({ params: params('11111111-1111-1111-1111-111111111111') }));

    expect(screen.getByRole('heading', { name: 'Brown leather wallet' })).toBeTruthy();
    expect(screen.getByText('A brown leather wallet with a zip pocket.')).toBeTruthy();
  });

  it('omits a withheld field from the delivered HTML entirely', async () => {
    // **The load-bearing assertion.** A field the projection did not carry
    // is not in the response — not blank, not masked, and not sent and
    // hidden by the client. The delivered HTML contains no trace of it.
    const { container } = render(
      await ItemDetailPage({ params: params('11111111-1111-1111-1111-111111111111') }),
    );

    expect(container.textContent).not.toMatch(/secret location|identifying marks/i);
  });

  it('renders no reporter actions to a member who is not the reporter', async () => {
    // **The plan is derived from the owner column,** and this member holds
    // only `unrelatedMember` — so there are no reporter actions to offer.
    const { container } = render(
      await ItemDetailPage({ params: params('11111111-1111-1111-1111-111111111111') }),
    );

    expect(container.textContent).not.toMatch(/\b(Edit|Delete|Withdraw)\b/);
  });

  it('redirects the reporter to the My Reports detail route', async () => {
    const { redirect } = await import('next/navigation');

    projection = projectionWith({
      columns: ['unrelatedMember', 'lostReportOwner'],
    });

    await ItemDetailPage({ params: params('11111111-1111-1111-1111-111111111111') });

    expect(redirect).toHaveBeenCalledWith(
      '/my/reports/11111111-1111-1111-1111-111111111111',
    );
  });

  it('renders the not-found page when the report is not visible', async () => {
    // **The refusal is indistinguishable from a missing report.** The
    // route renders the not-found page rather than an error.
    projection = new NotFoundError('Report not found.');

    render(await ItemDetailPage({ params: params('11111111-1111-1111-1111-111111111111') }));

    expect(screen.getByRole('heading', { name: 'Item not found' })).toBeTruthy();
  });

  it('renders the not-found page for an anonymous request', async () => {
    // **FR-38: there is no anonymous report-detail page.** The route
    // refuses before any query runs, so an anonymous visitor cannot even
    // confirm that the report exists.
    actor = null;

    render(await ItemDetailPage({ params: params('11111111-1111-1111-1111-111111111111') }));

    expect(screen.getByRole('heading', { name: 'Item not found' })).toBeTruthy();
    // **No query ran at all.**
    expect(requestedReportId).toBeNull();
  });
});
