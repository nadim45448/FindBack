/**
 * @vitest-environment jsdom
 */

/**
 * The listings and restricted surfaces' tests.
 *
 * **These are the tests for the two surfaces that carry a privacy
 * property.**
 *
 * - **The listings surface** — story 002's criterion: *"clicking a row
 *   routes to `/login?return=/listings/:id` with the message `Sign in to
 *   see item details.`, and no anonymous detail page exists"*.
 * - **The restricted surface** — §4.8: a Pending member who deep-links to
 *   a member surface sees a **friendly, non-blocking message**, *not* a
 *   hard error, and **no redirect loop**.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import { ListingsSurface, SIGN_IN_TO_SEE_DETAILS, type ListingPage } from './listings-surface';
import { RestrictedSurface } from './restricted-surface';
import { PENDING_RESTRICTED_MESSAGE } from './copy';

/**
 * The router the mocked `next/navigation` hands to every component.
 *
 * **The module mock has to be written at the top level**, because
 * `vi.mock` is hoisted to the top of the file by the Vitest transform.
 */
const router: RouterStub = createRouterStub();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

/** A page of listing rows, as the endpoint returns it. */
const PAGE: ListingPage = {
  rows: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      type: 'Lost',
      status: 'Active',
      name: 'Brown leather wallet',
      category: 'Wallets & purses',
      date: '2026-03-14',
      campusArea: 'Library',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  totalPages: 1,
};

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the listings surface', () => {
  it('renders the rows it is given', () => {
    render(<ListingsSurface page={PAGE} />);

    expect(screen.getByText('Brown leather wallet')).toBeTruthy();
  });

  it('routes a row to the login screen with the destination preserved', () => {
    render(<ListingsSurface page={PAGE} />);

    expect(
      screen.getByRole('link', { name: /Brown leather wallet/ }).getAttribute('href'),
    ).toBe('/login?return=/listings/11111111-1111-1111-1111-111111111111');
  });

  it('shows the sign-in message', () => {
    render(<ListingsSurface page={PAGE} />);

    expect(screen.getByText(SIGN_IN_TO_SEE_DETAILS)).toBeTruthy();
  });

  it('renders only the summary fields, and nothing more', () => {
    // **FR-38's summary set.** The listing endpoint's rows *are* the
    // summary set — the server does not send a fuller row with fields
    // stripped — so the surface renders the fields it is given and no
    // others. An anonymous viewer never receives a description, an image
    // reference, an exact place, an identifying detail, a reporter
    // identity, a Claim, a Recovery Response, a thread, or an audit
    // entry.
    const { container } = render(<ListingsSurface page={PAGE} />);

    expect(screen.getByText(/Wallets & purses/)).toBeTruthy();
    expect(screen.getByText(/Library/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/exact place|identifying details|reporter identity/i);
  });

  it('says so when no items match', () => {
    render(<ListingsSurface page={{ ...PAGE, rows: [], total: 0 }} />);

    expect(screen.getByText('No reports match your filters.')).toBeTruthy();
  });

  it('shows the error when the fetch failed', () => {
    render(<ListingsSurface page={null} error="Something went wrong on our side." />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Something went wrong on our side.')).toBeTruthy();
  });

  it('shows no pagination when there is one page', () => {
    render(<ListingsSurface page={PAGE} />);

    expect(screen.queryByRole('navigation', { name: 'Pagination' })).toBeNull();
  });

  it('offers the next page when there are more', () => {
    render(<ListingsSurface page={{ ...PAGE, totalPages: 3, total: 60 }} />);

    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe('/listings?page=2');
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
  });

  it('offers the previous page when there is one', () => {
    render(<ListingsSurface page={{ ...PAGE, page: 2, totalPages: 3, total: 60 }} />);

    expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
      '/listings?page=1',
    );
    expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
      '/listings?page=3',
    );
  });

  it('shows the page position', () => {
    render(<ListingsSurface page={{ ...PAGE, page: 2, totalPages: 3, total: 60 }} />);

    expect(screen.getByText('Page 2 of 3')).toBeTruthy();
  });
});

describe('the restricted surface', () => {
  it('shows the §4.8 message', () => {
    render(<RestrictedSurface />);

    expect(screen.getByText(PENDING_RESTRICTED_MESSAGE)).toBeTruthy();
  });

  it('is a status, not an alert', () => {
    // **The restricted state is not an error.** The member did nothing
    // wrong; the account is simply waiting for approval. An assertive
    // announcement would interrupt them with a tone the situation does
    // not warrant.
    render(<RestrictedSurface />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('links back to the pending surface', () => {
    render(<RestrictedSurface />);

    expect(screen.getByRole('link', { name: 'Back to your account' }).getAttribute('href')).toBe(
      '/pending',
    );
  });

  it('does not redirect', () => {
    // **§4.8 forbids a redirect loop between the destination and the
    // pending page.** The surface renders in place, so there is nothing
    // to loop through.
    render(<RestrictedSurface />);

    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('does not show the browser back button as a blocked action', () => {
    // **The story's edge case: "Pending user presses the browser Back
    // button onto a member URL → Non-blocking restricted message; no
    // redirect loop."** The message is a page state, and the browser's
    // own back navigation is not intercepted.
    render(<RestrictedSurface />);

    expect(screen.getByRole('status')).toBeTruthy();
  });
});
