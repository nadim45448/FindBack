'use client';

/**
 * The login form.
 *
 * ## The outcomes
 *
 * EXPERIENCE.md §16.2 names four:
 *
 * | Account state | Outcome |
 * |---|---|
 * | `Active` administrator | `/admin` |
 * | `Active` member | `/home` |
 * | `Pending` | `/pending`, with the banner |
 * | `Rejected` | the neutral error, on this screen |
 * | `Deactivated` | the neutral error — **the same message** |
 *
 * **The `Rejected` and `Deactivated` cases are byte-identical.** The
 * server's response carries `GENERIC_INACTIVE_MESSAGE` — the domain's
 * constant, not a copy here — and this form renders whatever it is given.
 * The form has no branch on the account state, so it *cannot* distinguish
 * them.
 *
 * ## The invalid-credentials message
 *
 * The server returns `Invalid email or password` for wrong credentials,
 * and `GENERIC_INACTIVE_MESSAGE` for an inactive account. **The form
 * renders whichever the server returned.**
 *
 * ## The form stays usable
 *
 * §9.3: *"Form stays available so the user can correct typos if
 * applicable."* So an error does not clear the form or disable it.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { BrandHero } from './brand-mark';
import { csrfHeaders } from './csrf';
import { Field, useFocusFirstInvalidField } from './form-parts';
import { validateLogin, type FieldErrors } from './form-validation';
import { applySignedInSession, type AccountStatus } from './session';
import {
  EMAIL_LABEL,
  FORGOTTEN_PASSWORD,
  INVALID_CREDENTIALS_MESSAGE,
  LANDING_CREATE_ACCOUNT,
  LOGIN_PAGE_HEADING,
  PASSWORD_LABEL,
  SIGN_IN_SUBMIT,
} from './copy';

/** The login form. */
export function LoginForm(): React.JSX.Element {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusFirstInvalidField(errors, submitted);

  /**
   * Submit the form.
   *
   * **The client validates first, and the server's answer wins.** The
   * client check is for affordance; the server is the authority. A server
   * error replaces the client's error for the field it names.
   */
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);

    const clientErrors = validateLogin({ email, password });

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };

        // **The server's message, rendered as given.** The form does not
        // decide whether the failure was a wrong password or an inactive
        // account — the server already made them indistinguishable.
        setFormError(body.error ?? INVALID_CREDENTIALS_MESSAGE);
        setSubmitting(false);
        return;
      }

      const body = (await response.json()) as {
        id?: string;
        status?: AccountStatus;
        isAdministrator?: boolean;
        displayName?: string;
        csrfToken?: string;
      };

      // **The session is published before the navigation.** The shell is
      // already mounted, so without this write the destination would still
      // show the anonymous topbar — and Log out lives in that topbar.
      applySignedInSession({
        actorId: body.id ?? null,
        status: body.status ?? null,
        isAdministrator: body.isAdministrator ?? false,
        displayName: body.displayName ?? null,
        csrfToken: body.csrfToken ?? null,
      });

      // **The server's account state decides the destination.** An
      // administrator's home is the operational dashboard; a member's
      // home is `/home`. Pending is still `/pending` regardless of the
      // administrator flag — a pending account has no operational access.
      if (body.status === 'Pending') {
        router.replace('/pending');
        router.refresh();
        return;
      }

      router.replace(body.isAdministrator ? '/admin' : '/home');
      router.refresh();
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  /**
   * Clear a field's error the moment its value becomes valid.
   *
   * **The criterion is explicit**: *"a field's error state clears the
   * moment its value becomes valid"*. The check is re-run against the
   * **next** values, and only the field that changed is re-examined.
   *
   * **The next value is passed in rather than read from the state.** The
   * state still holds the previous value inside this handler — React has
   * not re-rendered yet — so validating the state would validate the
   * value the visitor has just replaced, and the error would never clear.
   */
  function revalidate(field: 'email' | 'password', nextEmail: string, nextPassword: string): void {
    if (!submitted) {
      return;
    }

    const next = validateLogin({ email: nextEmail, password: nextPassword });
    const current = errors[field];

    if (current && !next[field]) {
      const updated = { ...errors };
      delete updated[field];
      setErrors(updated);
    }
  }

  return (
    <>
      <BrandHero />
      <h1>{LOGIN_PAGE_HEADING}</h1>

      {formError ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{formError}</p>
        </div>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Field
          id="email"
          name="email"
          label={EMAIL_LABEL}
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            revalidate('email', value, password);
          }}
          error={errors['email']}
          required
          autoComplete="email"
          variant="float"
        />

        <Field
          id="password"
          name="password"
          label={PASSWORD_LABEL}
          type="password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            revalidate('password', email, value);
          }}
          error={errors['password']}
          required
          autoComplete="current-password"
          variant="float"
        />

        <div className="auth-actions">
          <button type="submit" className="button button--primary" disabled={submitting}>
            {submitting ? 'Signing in…' : SIGN_IN_SUBMIT}
          </button>

          <Link href="/forgot" className="auth-actions__forgot">
            {FORGOTTEN_PASSWORD}
          </Link>

          <Link href="/register" className="button button--secondary">
            {LANDING_CREATE_ACCOUNT}
          </Link>
        </div>
      </form>
    </>
  );
}
