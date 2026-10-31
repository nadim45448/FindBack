/**
 * @vitest-environment jsdom
 */

/**
 * The shell's tests.
 *
 * **These are the tests for the shell's accessibility contract** — the
 * skip link's position, the `<main>` landmark's focusability, and the
 * topbar variant the session chooses.
 *
 * Story 001's criterion: *"the skip link is the first focusable element
 * and activating it moves focus to `<main id="main" tabindex="-1">`"*.
 *
 * ## Why the fetch is mocked
 *
 * **The shell asks the server who the visitor is.** The session and the
 * CSRF token are both server-owned values, so a test that renders the
 * shell must answer `/api/session` and `/api/auth/anonymous-session`.
 * Mocking `fetch` keeps the suite hermetic — it asserts the shell's
 * *contract with the server's answer*, which is exactly what the shell
 * owns. The routes themselves are covered by their own suites.
 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import { AppShell, topbarVariant } from './app-shell';
import { Topbar } from './topbar';
import { setCsrfToken } from './csrf';
import { applySignedInSession, ANONYMOUS_SESSION, type ClientSession } from './session';

/**
 * The router the mocked `next/navigation` hands to every component.
 *
 * **The module mock has to be written at the top level**, because
 * `vi.mock` is hoisted to the top of the file by the Vitest transform.
 * The stub object is created here and the factory closes over it.
 */
const router: RouterStub = createRouterStub();

/** The path `usePathname` reports. Tests set this when the route matters. */
let currentPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => currentPathname,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

/**
 * A `Pending` member's session.
 *
 * **A shape the server actually returns** — the shell reads `status`,
 * `displayName`, and the rest.
 */
const PENDING_SESSION: ClientSession = {
  actorId: '11111111-1111-1111-1111-111111111111',
  status: 'Pending',
  isAdministrator: false,
  displayName: 'Ada Lovelace',
  csrfToken: 'token',
};

/**
 * The mocked `fetch`.
 *
 * **Every call is answered** — the shell asks for the session, and the
 * CSRF store asks for an anonymous token. An unanswered request would
 * reject, and the shell would degrade to the anonymous variant, which
 * would make the Pending assertions fail for the wrong reason.
 */
function mockFetch(actor: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/session')) {
        return new Response(JSON.stringify({ actor }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/api/auth/anonymous-session')) {
        return new Response(JSON.stringify({ csrfToken: 'anonymous-token' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

/** The element that can hold programmatic focus. */
function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  );
}

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
  currentPathname = '/';
  applySignedInSession(ANONYMOUS_SESSION);
  setCsrfToken(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the shell’s landmarks', () => {
  it('renders a skip link before everything else', () => {
    mockFetch(null);
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    const skip = screen.getByRole('link', { name: 'Skip to content' });

    expect(skip.getAttribute('href')).toBe('#main');
  });

  it('makes the skip link the first focusable element', () => {
    mockFetch(null);
    const { container } = render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    const first = focusables(container)[0];

    expect(first?.textContent).toBe('Skip to content');
  });

  it('gives the main landmark the id the skip link targets', () => {
    mockFetch(null);
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    const main = screen.getByRole('main');

    expect(main.getAttribute('id')).toBe('main');
  });

  it('makes the main landmark focusable, so the skip link can reach it', () => {
    mockFetch(null);
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    // **A `<main>` is not focusable by default.** Without `tabindex="-1"`
    // the skip link's target could not receive programmatic focus, and
    // the criterion would be unmet.
    expect(screen.getByRole('main').getAttribute('tabindex')).toBe('-1');
  });

  it('renders the children inside the main landmark', () => {
    mockFetch(null);
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    expect(within(screen.getByRole('main')).getByText('Content')).toBeTruthy();
  });

  it('renders the CSRF token into a meta tag', () => {
    mockFetch(null);
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    // **The meta tag is queried from the document, not the container.**
    // React hoists `<meta>` into the document's `<head>`, so it is not a
    // child of the rendered container.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');

    expect(meta).not.toBeNull();
  });

  it('publishes the token the forms read', async () => {
    // **The token arrives from the server and lands in the meta tag.**
    // The forms read it from there with `readCsrfToken()`.
    mockFetch(null);
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    await waitFor(() => {
      const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');

      expect(meta?.content).toBe('anonymous-token');
    });
  });
});

describe('the topbar variant', () => {
  it('is the anonymous topbar when nobody is signed in', () => {
    expect(topbarVariant(ANONYMOUS_SESSION)).toBe('anonymous');
  });

  it('is the Pending header for a Pending account', () => {
    expect(topbarVariant(PENDING_SESSION)).toBe('pending');
  });

  it('is the member topbar for an Active account', () => {
    // **An Active member is signed in,** so they get the member nav layer —
    // not the anonymous one. The assertion was stale: `topbarVariant`
    // returns `'member'`, and `TopbarVariant` has carried that variant
    // since the member nav layer shipped.
    expect(topbarVariant({ ...PENDING_SESSION, status: 'Active' })).toBe('member');
  });

  it('is the administrator topbar for an Active administrator', () => {
    // **§3.2: the administrator nav layer** — brand mark, the four
    // operational queues, and the theme toggle.
    expect(
      topbarVariant({ ...PENDING_SESSION, status: 'Active', isAdministrator: true }),
    ).toBe('admin');
  });

  it('is not the administrator topbar for a Pending administrator', () => {
    // **An administrator account is approved like any other account,** so
    // it cannot also be `Pending` — and a malformed session carrying both
    // flags resolves to the more restrictive header.
    expect(
      topbarVariant({ ...PENDING_SESSION, status: 'Pending', isAdministrator: true }),
    ).toBe('pending');
  });

  it('is the anonymous topbar for a Rejected account', () => {
    // **A rejected account cannot hold a session**, so the shell should
    // never see one — but if it did, it must not get a member header.
    expect(topbarVariant({ ...PENDING_SESSION, status: 'Rejected' })).toBe('anonymous');
  });

  it('is the anonymous topbar for a Deactivated account', () => {
    expect(topbarVariant({ ...PENDING_SESSION, status: 'Deactivated' })).toBe('anonymous');
  });
});

describe('the anonymous topbar', () => {
  it('hides Sign in and Register on the landing page', () => {
    // **The landing hero already has those CTAs.** A second pair in the
    // corner is the same action twice.
    currentPathname = '/';
    render(<Topbar variant="anonymous" />);

    expect(screen.getByRole('link', { name: 'FindBack home' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse Lost & Found' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Theme:/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Register' })).toBeNull();
  });

  it('shows Sign in and Register on other anonymous surfaces', () => {
    currentPathname = '/listings';
    render(<Topbar variant="anonymous" />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Register' })).toBeTruthy();
  });

  it('hides Browse and the auth buttons on the login page', () => {
    currentPathname = '/login';
    render(<Topbar variant="anonymous" />);

    expect(screen.queryByRole('link', { name: 'Browse Lost & Found' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Register' })).toBeNull();
  });

  it('shows Home and a quiet Sign in on the forgot-password pages', () => {
    currentPathname = '/forgot';
    render(<Topbar variant="anonymous" />);

    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('href')).toBe('/');
    expect(screen.queryByRole('link', { name: 'Browse Lost & Found' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Register' })).toBeNull();
  });

  it('shows only Sign in on the register page', () => {
    currentPathname = '/register';
    render(<Topbar variant="anonymous" />);

    expect(screen.queryByRole('link', { name: 'Browse Lost & Found' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Register' })).toBeNull();
  });

  it('has no Log out control', () => {
    // **§5.2’s anonymous table lists three actions and no logout.** And
    // logout lives inside the Account menu on member pages — which this
    // bolt does not build. So the anonymous topbar has none at all.
    render(<Topbar variant="anonymous" />);

    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Log out' })).toBeNull();
  });

  it('links Browse to the listings', () => {
    render(<Topbar variant="anonymous" />);

    expect(screen.getByRole('link', { name: 'Browse Lost & Found' }).getAttribute('href')).toBe(
      '/listings',
    );
  });
});

describe('the Pending header', () => {
  it('shows the brand mark, the Pending pill, and Log out', () => {
    render(<Topbar variant="pending" displayName="Ada Lovelace" />);

    expect(screen.getByRole('link', { name: 'FindBack home' })).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
  });

  it('hides every other nav item', () => {
    // **§16.3: "All other nav items are hidden."**
    render(<Topbar variant="pending" displayName="Ada Lovelace" />);

    expect(screen.queryByRole('link', { name: 'Browse Lost & Found' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Register' })).toBeNull();
  });

  it('keeps the theme toggle, because it is chrome rather than a nav item', () => {
    render(<Topbar variant="pending" displayName="Ada Lovelace" />);

    expect(screen.getByRole('button', { name: /Theme:/ })).toBeTruthy();
  });

  it('keeps the display name off the header — the page greets instead', () => {
    render(<Topbar variant="pending" displayName="Ada Lovelace" />);

    expect(screen.queryByText('Ada Lovelace')).toBeNull();
  });

  it('makes Log out a button, because signing out is a POST', () => {
    render(<Topbar variant="pending" displayName="Ada Lovelace" />);

    expect(screen.getByRole('button', { name: 'Log out' }).tagName).toBe('BUTTON');
  });

  it('signs out with a POST carrying the CSRF token', async () => {
    // **The mock is typed with its parameters**, so the suite can read
    // the request the component actually made.
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response('{}', { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // **The token is an HMAC the browser cannot compute**, so it is read
    // from the meta tag the shell renders and sent as a header.
    const meta = document.createElement('meta');
    meta.name = 'csrf-token';
    meta.content = 'the-token';
    document.head.append(meta);

    render(<Topbar variant="pending" displayName="Ada Lovelace" />);

    screen.getByRole('button', { name: 'Log out' }).click();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit | undefined];

    expect(url).toBe('/api/auth/logout');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string> | undefined)?.['x-csrf-token']).toBe(
      'the-token',
    );

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });

    meta.remove();
  });
});

describe('the shell’s topbar', () => {
  it('shows the anonymous topbar when the server says nobody is signed in', async () => {
    mockFetch(null);
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Browse Lost & Found' })).toBeTruthy();
    });

    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
  });

  it('shows the Pending header when the server says the account is Pending', async () => {
    mockFetch({
      id: PENDING_SESSION.actorId,
      status: 'Pending',
      isAdministrator: false,
      displayName: 'Ada Lovelace',
    });
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    });

    expect(screen.getByText('Pending')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('degrades to the anonymous topbar when the session cannot be read', async () => {
    // **A shell that cannot read the session is a degraded shell, not a
    // broken page.** Every surface is readable without a session.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Browse Lost & Found' })).toBeTruthy();
    });

    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('signs an Active member out and routes to the landing page', async () => {
    mockFetch({
      id: PENDING_SESSION.actorId,
      status: 'Active',
      isAdministrator: false,
      displayName: 'A Member',
    });
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Account menu for A Member' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Account menu for A Member' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const logoutCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/auth/logout');

    expect(logoutCall).toBeTruthy();
    expect((logoutCall?.[1] as RequestInit | undefined)?.method).toBe('POST');
  });

  it('signs an Active administrator out and routes to the landing page', async () => {
    mockFetch({
      id: PENDING_SESSION.actorId,
      status: 'Active',
      isAdministrator: true,
      displayName: 'The Administrator',
    });
    render(
      <AppShell>
        <p>Content</p>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Account ▾' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Account ▾' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/');
    });

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const logoutCall = fetchMock.mock.calls.find(([url]) => String(url) === '/api/auth/logout');

    expect(logoutCall).toBeTruthy();
    expect((logoutCall?.[1] as RequestInit | undefined)?.method).toBe('POST');
  });
});
