/**
 * @vitest-environment jsdom
 */

/**
 * The authentication forms' tests.
 *
 * **These are the tests for the auth flows' outcomes** — story 002's
 * criteria:
 *
 * - *"a successful member login routes to `/home`"*;
 * - *"a successful administrator login routes to `/admin`"*;
 * - *"a `Pending` login routes to `/pending`"*;
 * - *"the `Rejected` and `Deactivated` states surface as the same
 *   neutral inactive-account error on `/login`"*;
 * - *"registration routes to `/pending-registered` and does **not** sign
 *   the visitor in"*.
 *
 * ## Why the router is mocked
 *
 * **The forms' destinations are the behaviour under test.** A real
 * Next.js router would need a mounted app; a stub records the
 * navigation, so the suite can assert *where* the form sent the member.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';
import { GENERIC_INACTIVE_MESSAGE, INVALID_CREDENTIALS_MESSAGE, PASSWORD_HINT } from './copy';

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

/**
 * Answer a request with a status and a body.
 *
 * **The body is JSON**, because the forms parse the response as JSON.
 */
function respondWith(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

/** Fill a field by its id. */
function fill(id: string, value: string): void {
  const input = document.getElementById(id);

  if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLSelectElement)) {
    throw new Error(`the field ${id} is not in the document`);
  }

  fireEvent.change(input, { target: { value } });
}

/** Click the form's submit button. */
function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: /^Sign in$|^Register$|^Create account$/ }));
}

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the login form', () => {
  it('routes an Active member to /home', async () => {
    respondWith(200, { status: 'Active', isAdministrator: false });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/home');
    });
  });

  it('routes an Active administrator to /admin', async () => {
    respondWith(200, { status: 'Active', isAdministrator: true });
    render(<LoginForm />);

    fill('email', 'admin@findback.test');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/admin');
    });
    expect(router.replace).not.toHaveBeenCalledWith('/home');
  });

  it('routes a Pending member to /pending', async () => {
    respondWith(200, { status: 'Pending' });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/pending');
    });
  });

  it('shows the invalid-credentials message for wrong credentials', async () => {
    respondWith(401, { error: INVALID_CREDENTIALS_MESSAGE });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'wrong');
    submit();

    await waitFor(() => {
      expect(screen.getByText(INVALID_CREDENTIALS_MESSAGE)).toBeTruthy();
    });
  });

  it('shows the neutral inactive message for a Rejected account', async () => {
    // **The server decides what a Rejected account sees**, and it is the
    // same message a Deactivated account sees.
    respondWith(403, { error: GENERIC_INACTIVE_MESSAGE });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(screen.getByText(GENERIC_INACTIVE_MESSAGE)).toBeTruthy();
    });
  });

  it('shows the identical message for a Deactivated account', async () => {
    // **The two states are indistinguishable to the member.** This is the
    // anti-enumeration rule, and the form has no branch on the state.
    respondWith(403, { error: GENERIC_INACTIVE_MESSAGE });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(screen.getByText(GENERIC_INACTIVE_MESSAGE)).toBeTruthy();
    });

    expect(screen.queryByText(/rejected|deactivated/i)).toBeNull();
  });

  it('does not navigate when the credentials are refused', async () => {
    respondWith(401, { error: INVALID_CREDENTIALS_MESSAGE });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'wrong');
    submit();

    await waitFor(() => {
      expect(screen.getByText(INVALID_CREDENTIALS_MESSAGE)).toBeTruthy();
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it('does not call the server when the form is invalid', async () => {
    // **The client check is for affordance.** An empty form must not
    // become a request.
    respondWith(200, { status: 'Active' });
    render(<LoginForm />);

    submit();

    await waitFor(() => {
      expect(screen.getByText('An email address is required.')).toBeTruthy();
    });

    expect(screen.queryByText('Check the form')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the form usable after an error', async () => {
    // **§9.3: "Form stays available so the user can correct typos."**
    respondWith(401, { error: INVALID_CREDENTIALS_MESSAGE });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'wrong');
    submit();

    await waitFor(() => {
      expect(screen.getByText(INVALID_CREDENTIALS_MESSAGE)).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: 'Sign in' }).hasAttribute('disabled')).toBe(false);
  });

  it('clears a field’s error the moment its value becomes valid', async () => {
    // **Criterion 22: "a field's error state clears the moment its value
    // becomes valid."**
    //
    // **The re-validation must be made against the value that was just
    // typed, not the value in the state.** Inside the change handler the
    // state still holds the *previous* value — React has not re-rendered
    // yet — so a re-validation that reads the state validates the value
    // the visitor has just replaced, and the error never clears.
    respondWith(200, { status: 'Active' });
    render(<LoginForm />);

    submit();

    await waitFor(() => {
      expect(screen.getByText('An email address is required.')).toBeTruthy();
    });

    fill('email', 'ada@example.com');

    await waitFor(() => {
      expect(screen.queryByText('An email address is required.')).toBeNull();
    });
  });

  it('offers the forgot-password action beneath Sign in', () => {
    render(<LoginForm />);

    const link = screen.getByRole('link', { name: 'Forgotten Password?' });

    expect(link.getAttribute('href')).toBe('/forgot');
  });

  it('matches the login card copy', () => {
    render(<LoginForm />);

    expect(screen.getByRole('heading', { name: 'Sign in to FindBack' })).toBeTruthy();
    expect(
      screen.queryByText('Enter your email and password to access your FindBack account.'),
    ).toBeNull();
    expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe(
      '/register',
    );
    expect(screen.getByRole('link', { name: 'Create an account' }).className).toContain(
      'button--secondary',
    );
  });

  it('sends the credentials to the server', async () => {
    respondWith(200, { status: 'Active' });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      email: 'ada@example.com',
      password: 'correct1',
    });
  });

  it('refreshes the session after a successful sign-in', async () => {
    // **The route alone is not enough.** The session lives in a cookie the
    // browser will not re-read on its own, so the router is asked to
    // refresh — without it the shell would render the anonymous topbar on
    // a page the member has just signed into.
    respondWith(200, { status: 'Active' });
    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(router.refresh).toHaveBeenCalled();
    });
  });

  it('falls back to a form error when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    render(<LoginForm />);

    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('the register form', () => {
  it('matches the mockup card copy', () => {
    render(<RegisterForm />);

    expect(screen.getByRole('heading', { name: 'Create your FindBack account' })).toBeTruthy();
    expect(
      screen.getByText(
        'An administrator will review and approve your registration before you can report lost or found items.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
  });

  it('routes to /pending-registered on success', async () => {
    respondWith(201, { status: 'Pending' });
    render(<RegisterForm />);

    fill('displayName', 'Ada Lovelace');
    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    fill('confirmPassword', 'correct1');
    fill('selfDeclaredRole', 'Student');
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/pending-registered');
    });
  });

  it('does not sign the visitor in', async () => {
    // **§16.1: "No automatic login."** Registering must not create a
    // session — the visitor lands on the confirmation, signed out.
    respondWith(201, { status: 'Pending' });
    render(<RegisterForm />);

    fill('displayName', 'Ada Lovelace');
    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    fill('confirmPassword', 'correct1');
    fill('selfDeclaredRole', 'Student');
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/pending-registered');
    });

    expect(router.replace).not.toHaveBeenCalledWith('/home');
    expect(router.replace).not.toHaveBeenCalledWith('/admin');
    expect(router.replace).not.toHaveBeenCalledWith('/pending');
  });

  it('sends the five fields §16.1 names', async () => {
    respondWith(201, { status: 'Pending' });
    render(<RegisterForm />);

    fill('displayName', 'Ada Lovelace');
    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    fill('confirmPassword', 'correct1');
    fill('selfDeclaredRole', 'Student');
    submit();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(JSON.parse(String(init.body))).toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: 'correct1',
      selfDeclaredRole: 'Student',
      selfDeclaredRoleOther: null,
    });
  });

  it('shows the Other field only when Other is chosen', async () => {
    respondWith(201, { status: 'Pending' });
    render(<RegisterForm />);

    expect(document.getElementById('selfDeclaredRoleOther')).toBeNull();

    fill('selfDeclaredRole', 'Other');

    await waitFor(() => {
      expect(document.getElementById('selfDeclaredRoleOther')).not.toBeNull();
    });
  });

  it('shows the server’s message for a duplicate email', async () => {
    // **The server owns what a duplicate address means.** The form
    // renders the message it is given rather than rewording it.
    respondWith(409, { error: 'That email address is already registered.', field: 'email' });
    render(<RegisterForm />);

    fill('displayName', 'Ada Lovelace');
    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    fill('confirmPassword', 'correct1');
    fill('selfDeclaredRole', 'Student');
    submit();

    await waitFor(() => {
      expect(screen.getByText('That email address is already registered.')).toBeTruthy();
    });
  });

  it('shows the password hint', () => {
    render(<RegisterForm />);

    expect(screen.getByText(PASSWORD_HINT)).toBeTruthy();
  });

  it('clears a field’s error the moment its value becomes valid', async () => {
    // **Criterion 22 again, on the register form.** The same stale-state
    // hazard applies: the re-validation has to be made against the value
    // that was just typed.
    respondWith(201, { status: 'Pending' });
    render(<RegisterForm />);

    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    fill('displayName', 'Ada Lovelace');

    await waitFor(() => {
      expect(screen.queryByText('Enter your name.')).toBeNull();
    });
  });

  it('shows the form error when the server names no field', async () => {
    respondWith(500, { error: 'Something went wrong on our side. Try again, or come back in a moment.' });
    render(<RegisterForm />);

    fill('displayName', 'Ada Lovelace');
    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    fill('confirmPassword', 'correct1');
    fill('selfDeclaredRole', 'Student');
    submit();

    await waitFor(() => {
      expect(
        screen.getByText('Something went wrong on our side. Try again, or come back in a moment.'),
      ).toBeTruthy();
    });
  });

  it('falls back to a form error when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    render(<RegisterForm />);

    fill('displayName', 'Ada Lovelace');
    fill('email', 'ada@example.com');
    fill('password', 'correct1');
    fill('confirmPassword', 'correct1');
    fill('selfDeclaredRole', 'Student');
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers the four roles', () => {
    render(<RegisterForm />);

    const options = Array.from(
      document.querySelectorAll<HTMLOptionElement>('#selfDeclaredRole option'),
    ).map((option) => option.value);

    expect(options).toEqual(['', 'Student', 'Employee', 'Visitor', 'Other']);
  });
});
