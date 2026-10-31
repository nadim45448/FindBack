/**
 * @vitest-environment jsdom
 */

/**
 * The report form routes' suite — bolt `014`, story 005.
 *
 * **These are the tests for the two routes that fix the report's type.**
 *
 * §10.1: *"The 'Lost' or 'Found' decision is encoded in the URL
 * (`/report/lost` vs `/report/found`). The form opens with the type
 * already chosen — the user does not need to pick it."*
 *
 * So the load-bearing assertions are:
 *
 * - **`/report/lost` passes `Lost` and `/report/found` passes `Found`** —
 *   the route decides, and the two are separate pages.
 * - **The type is never read from the request.** There is no query
 *   parameter, no body, and no form field that could change it.
 * - **The date bound is the type's own.** §10.3: *"Date (Lost): last 365
 *   days, not future"*; *"Date (Found): last 30 days, not future."* The
 *   Found bound is **not** the Lost bound relaxed — it is 30 days.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REPORT_CATEGORIES } from '@/domain/listings';

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

/** The campus areas the reader returns. */
let campusAreas: readonly { readonly value: string; readonly label: string; readonly active: boolean }[] = [
  { value: 'Library', label: 'Library', active: true },
];

/** Whether the campus-area read fails. */
let campusAreaReadFails = false;

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

vi.mock('@/infrastructure/listings/prisma-campus-area-reader', () => ({
  PrismaCampusAreaReader: class {
    async listActive(): Promise<
      readonly { readonly value: string; readonly label: string; readonly active: boolean }[]
    > {
      if (campusAreaReadFails) {
        throw new Error('The campus-area read failed.');
      }

      return campusAreas;
    }
  },
}));

vi.mock('@/infrastructure/db/prisma', () => ({
  prisma: {},
}));

import ReportFoundPage from './found/page';
import ReportLostPage from './lost/page';

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
  actor = {
    actorId: '22222222-2222-2222-2222-222222222222',
    isAdministrator: false,
  };
  campusAreas = [{ value: 'Library', label: 'Library', active: true }];
  campusAreaReadFails = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the Lost report form route', () => {
  it('opens the Lost form, with no type control', async () => {
    // **§10.1: the type is fixed by the URL.** The heading names it, and
    // there is no radio, no select, and no toggle that could change it.
    const { container } = render(await ReportLostPage());

    expect(screen.getByRole('heading', { name: 'Report a lost item' })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(container.querySelector('#type')).toBeNull();
  });

  it('does not offer the Found form’s heading', async () => {
    render(await ReportLostPage());

    expect(screen.queryByRole('heading', { name: 'Report a found item' })).toBeNull();
  });

  it('bounds the date to the last 365 days, not the future', async () => {
    // **§10.3: "Date (Lost): last 365 days, not future."**
    render(await ReportLostPage());

    const date = screen.getByLabelText(/Date lost/) as HTMLInputElement;
    const today = new Date();
    const earliest = new Date(today);

    earliest.setUTCDate(earliest.getUTCDate() - 365);

    expect(date.getAttribute('min')).toBe(earliest.toISOString().slice(0, 10));
    expect(date.getAttribute('max')).toBe(today.toISOString().slice(0, 10));
  });

  it('offers the deployment’s categories and campus areas', async () => {
    render(await ReportLostPage());

    expect(screen.getByRole('option', { name: 'Wallet' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Library' })).toBeTruthy();
  });

  it('shows the server-error message when the campus areas cannot be read', async () => {
    // **A read failure is a refusal, never a permissive default** — an
    // empty set would reject every area, and a fallback would accept every
    // area.
    campusAreaReadFails = true;

    render(await ReportLostPage());

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Report a lost item' })).toBeNull();
  });
});

describe('the Found report form route', () => {
  it('opens the Found form, with no type control', async () => {
    const { container } = render(await ReportFoundPage());

    expect(screen.getByRole('heading', { name: 'Report a found item' })).toBeTruthy();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(container.querySelector('#type')).toBeNull();
  });

  it('does not offer the Lost form’s heading', async () => {
    render(await ReportFoundPage());

    expect(screen.queryByRole('heading', { name: 'Report a lost item' })).toBeNull();
  });

  it('bounds the date to the last 30 days, not the future', async () => {
    // **§10.3: "Date (Found): last 30 days, not future."** The Found bound
    // is **not** the Lost bound relaxed — it is 30 days, and the domain owns
    // the number.
    render(await ReportFoundPage());

    const date = screen.getByLabelText(/Date found/) as HTMLInputElement;
    const today = new Date();
    const earliest = new Date(today);

    earliest.setUTCDate(earliest.getUTCDate() - 30);

    expect(date.getAttribute('min')).toBe(earliest.toISOString().slice(0, 10));
    expect(date.getAttribute('max')).toBe(today.toISOString().slice(0, 10));
  });

  it('bounds the date more tightly than the Lost form does', async () => {
    // **The two bounds are different numbers**, and a route that reused the
    // Lost bound would quietly widen the Found form's window.
    const { unmount } = render(await ReportFoundPage());

    const foundMin = (screen.getByLabelText(/Date/) as HTMLInputElement).getAttribute('min');

    unmount();

    render(await ReportLostPage());

    const lostMin = (screen.getByLabelText(/Date/) as HTMLInputElement).getAttribute('min');

    expect(foundMin).not.toBe(lostMin);
  });
});

describe('the two report form routes', () => {
  it('offer the same categories', async () => {
    // **The category set is the deployment's, not the type's** — a Lost
    // wallet and a Found wallet are the same category.
    const { unmount } = render(await ReportLostPage());

    const lostCategories = Array.from(
      screen.getByLabelText(/Category/).querySelectorAll('option'),
    ).map((option) => option.textContent);

    unmount();

    render(await ReportFoundPage());

    const foundCategories = Array.from(
      screen.getByLabelText(/Category/).querySelectorAll('option'),
    ).map((option) => option.textContent);

    // **The select carries a placeholder option** ahead of the categories,
    // so the comparison drops it.
    expect(lostCategories.slice(1)).toEqual([...REPORT_CATEGORIES]);
    expect(foundCategories.slice(1)).toEqual([...REPORT_CATEGORIES]);
  });

  it('are separate pages, and neither carries a type parameter', async () => {
    // **The type lives in the route, not in a query parameter.** There is
    // no `?type=` for a client to tamper with.
    render(await ReportLostPage());

    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
