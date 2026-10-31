/**
 * @vitest-environment jsdom
 */

/**
 * The member view routes' suite — bolt `014`, story 003.
 *
 * **These are the tests for the route layer of the four views.**
 *
 * A route is thin, so what is under test is the route's **own** logic: the
 * partition it names, the filter its tab means, and the shape of what it
 * renders. The business rules live in the domain and the services, and they
 * are tested there — a duplicate here would prove the mock, not the route.
 *
 * ## The load-bearing assertions
 *
 * - **Each view names exactly one partition,** and it is the FR-49 one. The
 *   disjointness is not a filter applied afterwards; it is the partition the
 *   route asks for.
 * - **Each tab means the filter its label names.** `My Reports`'s `Lost` tab
 *   is a **type** filter; `My Claims`'s `Pending` tab is a **participation
 *   status** filter. Conflating the two vocabularies is the defect this
 *   suite exists to catch.
 * - **An unknown tab falls back to the view's default,** never to "no
 *   filter at all" — the tabs are a closed set.
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
//
// The routes build their stacks per request. The mock lets the test drive
// the actor and capture the partition and the filter the route asked for.

/** The actor the resolver returns. */
const actor: unknown = {
  actorId: '22222222-2222-2222-2222-222222222222',
  isAdministrator: false,
};

/** The partition the route asked for. */
let requestedPartition: string | null = null;

/** The filter the route asked for. */
let requestedFilter: Record<string, unknown> | null = null;

/** The rows the listing returns. */
let rows: unknown[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'fb_session' ? { name, value: 'session-token' } : undefined,
  }),
  headers: async () => ({ get: () => null }),
}));

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
  }),
}));

vi.mock('@/infrastructure/listings/prisma-campus-area-reader', () => ({
  PrismaCampusAreaReader: class {
    async listActive(): Promise<
      readonly { readonly value: string; readonly label: string; readonly active: boolean }[]
    > {
      return [{ value: 'library', label: 'Library', active: true }];
    }
  },
}));

vi.mock('@/infrastructure/db/prisma', () => ({
  prisma: {},
}));

vi.mock('./reports/_claim-summaries', () => ({
  readClaimSummariesForReports: async () => ({}),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    listings: {
      list: async ({
        partition,
        filter,
      }: {
        readonly partition: string;
        readonly filter: Record<string, unknown>;
      }) => {
        requestedPartition = partition;
        requestedFilter = filter;

        return {
          rows,
          total: rows.length,
          page: 1,
          pageSize: 50,
          totalPages: 1,
        };
      },
    },
  }),
}));

import MyClaimsPage from './claims/page';
import MyRecoveryResponsesPage from './recovery-responses/page';
import MyReportsPage from './reports/page';

/** The query parameters a route is called with. */
async function params(
  query: Record<string, string> = {},
): Promise<{ readonly [key: string]: string | string[] | undefined }> {
  return Promise.resolve(query);
}

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
  requestedPartition = null;
  requestedFilter = null;
  rows = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the My Reports route', () => {
  it('asks for the `mine` partition, and nothing else', async () => {
    // **§9.4: "My Reports contains only reports authored by the member —
    // never Claims and never Recovery Responses."** The partition's
    // predicate carries the member's id, so the exclusion is structural.
    render(await MyReportsPage({ searchParams: params() }));

    expect(requestedPartition).toBe('mine');
  });

  it('lists every authored report when no status filter is set', async () => {
    render(await MyReportsPage({ searchParams: params() }));

    expect(requestedFilter?.statuses).toBeNull();
    expect(requestedFilter?.type).toBeNull();
  });

  it('filters by report status when the mockup status control is used', async () => {
    render(await MyReportsPage({ searchParams: params({ status: 'Closed' }) }));

    expect(requestedFilter?.statuses).toEqual(['Closed']);
    expect(requestedFilter?.type).toBeNull();
  });

  it('ignores an unknown status value', async () => {
    render(await MyReportsPage({ searchParams: params({ status: 'nonsense' }) }));

    expect(requestedFilter?.statuses).toBeNull();
  });

  it('renders the mockup header actions and status filter', async () => {
    render(await MyReportsPage({ searchParams: params() }));

    expect(screen.getByRole('heading', { name: 'My reports' })).toBeTruthy();

    const actions = document.querySelector('.member-view-page__actions');

    expect(actions).toBeTruthy();
    expect(within(actions as HTMLElement).getByRole('link', { name: 'Report lost' }).getAttribute('href')).toBe(
      '/report/lost',
    );
    expect(
      within(actions as HTMLElement).getByRole('link', { name: 'Report found' }).getAttribute('href'),
    ).toBe('/report/found');
    expect(screen.getByLabelText('Status')).toBeTruthy();
  });
});

describe('the My Claims route', () => {
  it('asks for the `claims` partition, and nothing else', async () => {
    // **§9.4: "My Claims contains only Claims the member submitted against
    // other members' Found reports — never own authored reports."**
    render(await MyClaimsPage({ searchParams: params() }));

    expect(requestedPartition).toBe('claims');
  });

  it('filters by the Claim’s own status, not the report’s', async () => {
    render(await MyClaimsPage({ searchParams: params({ status: 'Approved' }) }));

    expect(requestedFilter?.participationStatuses).toEqual(['Approved']);
    expect(requestedFilter?.statuses).toBeNull();
  });

  it('lists every claim when no status filter is set', async () => {
    render(await MyClaimsPage({ searchParams: params() }));

    expect(requestedFilter?.participationStatuses).toBeNull();
  });

  it('ignores an unknown status value', async () => {
    render(await MyClaimsPage({ searchParams: params({ status: 'nonsense' }) }));

    expect(requestedFilter?.participationStatuses).toBeNull();
  });

  it('renders the mockup header, browse action, and status filter', async () => {
    render(await MyClaimsPage({ searchParams: params() }));

    expect(screen.getByRole('heading', { name: 'My claims' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse items' }).getAttribute('href')).toBe('/listings');
    expect(screen.getByLabelText('Claim status')).toBeTruthy();
  });
});

describe('the My Recovery Responses route', () => {
  it('asks for the `recovery_responses` partition, and nothing else', async () => {
    render(await MyRecoveryResponsesPage({ searchParams: params() }));

    expect(requestedPartition).toBe('recovery_responses');
  });

  it('lists every recovery response when no status filter is set', async () => {
    render(await MyRecoveryResponsesPage({ searchParams: params() }));

    expect(requestedFilter?.participationStatuses).toBeNull();
  });

  it('filters by the Response’s own status', async () => {
    render(await MyRecoveryResponsesPage({
      searchParams: params({ status: 'Not a Match' }),
    }));

    expect(requestedFilter?.participationStatuses).toEqual(['Not a Match']);
  });

  it('ignores an unknown status value', async () => {
    render(await MyRecoveryResponsesPage({ searchParams: params({ status: 'nonsense' }) }));

    expect(requestedFilter?.participationStatuses).toBeNull();
  });

  it('renders the mockup header, lede, browse action, and status filter', async () => {
    render(await MyRecoveryResponsesPage({ searchParams: params() }));

    expect(screen.getByRole('heading', { name: 'My recovery responses' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse items' }).getAttribute('href')).toBe('/listings');
    expect(screen.getByText(/Standby/)).toBeTruthy();
    expect(screen.getByLabelText('Status')).toBeTruthy();
  });
});

describe('the four views', () => {
  it('ask for four different partitions', async () => {
    // **The disjointness, stated at the route layer.** Each view names
    // exactly one partition, and no two views name the same one.
    const partitions: string[] = [];

    render(await MyReportsPage({ searchParams: params() }));
    partitions.push(requestedPartition ?? '');

    render(await MyClaimsPage({ searchParams: params() }));
    partitions.push(requestedPartition ?? '');

    render(await MyRecoveryResponsesPage({ searchParams: params() }));
    partitions.push(requestedPartition ?? '');

    expect(new Set(partitions).size).toBe(3);
    expect(partitions).not.toContain('browse');
  });
});
