/**
 * @vitest-environment jsdom
 */

/**
 * The forgot-password form's tests.
 *
 * **These are the tests for the anti-enumeration surface.** Story 002's
 * criteria 16, 17, and 18 name it:
 *
 * - *"it exposes a single `Email` field, a `Send reset instructions`
 *   primary button, and a `Back to sign in` secondary link"*;
 * - *"any email address submitted at `/forgot` … `/forgot-sent` shows the
 *   heading `Check your email` and the body `If an account exists for that
 *   email address, password reset instructions have been sent.`"*;
 * - *"an unregistered, `Pending`, `Active`, `Rejected`, and `Deactivated`
 *   email … the response content, status, and observable timing do not
 *   differ, so the surface reveals no account existence"*.
 *
 * **The form has no branch on the account state.** The server answers 202
 * with the neutral confirmation for every well-formed request, and the
 * form routes to `/forgot-sent` whenever it gets one. The suite therefore
 * asserts the *absence* of a branch: the same request, the same route, the
 * same body, whatever the server says about the account.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterStub, resetDomEnvironment, type RouterStub } from '@/test/dom';

import { ForgotPasswordForm } from './forgot-password-form';

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
 * **The body is JSON**, because the form parses the response as JSON.
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

/** Fill the email field. */
function fillEmail(value: string): void {
  const input = document.getElementById('email');

  if (!(input instanceof HTMLInputElement)) {
    throw new Error('the email input is not in the document');
  }

  fireEvent.change(input, { target: { value } });
}

/** Submit the form. */
function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));
}

beforeEach(() => {
  resetDomEnvironment();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the forgot-password form', () => {
  it('exposes a single Email field', () => {
    render(<ForgotPasswordForm />);

    const inputs = Array.from(document.querySelectorAll('input'));

    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.id).toBe('email');
  });

  it('offers the Send reset instructions button', () => {
    render(<ForgotPasswordForm />);

    const button = screen.getByRole('button', { name: 'Send reset instructions' });

    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('submit');
  });

  it('offers the Back to sign in link', () => {
    render(<ForgotPasswordForm />);

    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
  });

  it('shows no error before the first submit', () => {
    // **Criterion 22: "no error, icon, red border, or `aria-invalid` state
    // is present before the first submit attempt."**
    render(<ForgotPasswordForm />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.getElementById('email')?.hasAttribute('aria-invalid')).toBe(false);
  });

  it('does not call the server when the form is invalid', () => {
    respondWith(202, {});
    render(<ForgotPasswordForm />);

    submit();

    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows the email error after an invalid submit', async () => {
    respondWith(202, {});
    render(<ForgotPasswordForm />);

    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('clears the error the moment the value becomes valid', async () => {
    respondWith(202, {});
    render(<ForgotPasswordForm />);

    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    fillEmail('ada@example.com');

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});

describe('the anti-enumeration contract', () => {
  it('routes to /forgot-sent for a well-formed address', async () => {
    // **Every account state produces this same outcome**, because the
    // server answers 202 for all of them.
    respondWith(202, {});
    render(<ForgotPasswordForm />);

    fillEmail('ada@example.com');
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/forgot-sent');
    });
  });

  it('routes to /forgot-sent when no account belongs to the email', async () => {
    respondWith(202, {});
    render(<ForgotPasswordForm />);

    fillEmail('nobody@example.com');
    submit();

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/forgot-sent');
    });
  });

  it('sends the same request body whatever the address', async () => {
    respondWith(202, {});
    render(<ForgotPasswordForm />);

    fillEmail('ada@example.com');
    submit();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toBe('/api/auth/forgot-password');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'ada@example.com' });
  });

  it('refuses a malformed address without asking the server', async () => {
    // **A malformed address never reaches the account lookup**, so
    // refusing it client-side discloses nothing about whether the account
    // exists. This is the one response the form treats differently, and it
    // is different because it is safe to be different.
    respondWith(202, {});
    render(<ForgotPasswordForm />);

    fillEmail('not-an-email');
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('the forgot-password error handling', () => {
  it('shows the server’s field error against the field', async () => {
    respondWith(400, { error: 'Enter a valid email address.', field: 'email' });
    render(<ForgotPasswordForm />);

    fillEmail('ada@example.com');
    submit();

    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeTruthy();
    });
  });

  it('shows the form error when the server names no field', async () => {
    respondWith(500, { error: 'Something went wrong on our side. Try again, or come back in a moment.' });
    render(<ForgotPasswordForm />);

    fillEmail('ada@example.com');
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    expect(
      screen.getByText('Something went wrong on our side. Try again, or come back in a moment.'),
    ).toBeTruthy();
  });

  it('falls back to a form error when the network fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    render(<ForgotPasswordForm />);

    fillEmail('ada@example.com');
    submit();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });

    expect(router.replace).not.toHaveBeenCalled();
  });
});
