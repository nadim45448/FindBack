'use client';

/**
 * The reset-password form.
 *
 * **The token is read from the URL's fragment, in the browser, and posted
 * in the request body.** The fragment is never sent to the server, so the
 * token never reaches the request line.
 */

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

import { RESET_TOKEN_QUERY_PARAM } from '@/domain/accounts';

import { csrfHeaders } from '@/ui/csrf';
import { Field, ErrorSummary, useFocusFirstInvalidField } from '@/ui/form-parts';
import { validateResetPassword, type FieldErrors } from '@/ui/form-validation';
import {
  CONFIRM_PASSWORD_LABEL,
  NEW_PASSWORD_LABEL,
  PASSWORD_HINT,
  RESET_PASSWORD_SUCCESS,
  SAVE_NEW_PASSWORD,
  SIGN_IN_TO_YOUR_ACCOUNT,
} from '@/ui/copy';

/** The field labels the error summary uses. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  newPassword: NEW_PASSWORD_LABEL,
  confirmPassword: CONFIRM_PASSWORD_LABEL,
};

function readFragmentToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const fragment = window.location.hash.replace(/^#/, '');

  if (fragment.length === 0) {
    return null;
  }

  for (const parameter of fragment.split('&')) {
    const equals = parameter.indexOf('=');

    if (equals === -1) {
      continue;
    }

    const name = parameter.slice(0, equals);
    const value = parameter.slice(equals + 1);

    if (name === RESET_TOKEN_QUERY_PARAM && value.length > 0) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

function subscribeToHashChange(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);

  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

function theServerSnapshot(): null {
  return null;
}

export function ResetPasswordForm() {
  const token = useSyncExternalStore(
    subscribeToHashChange,
    readFragmentToken,
    theServerSnapshot,
  );

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  useFocusFirstInvalidField(errors, submitted);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);

    const clientErrors = validateResetPassword({ newPassword, confirmPassword });

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    if (!token) {
      setFormError('This reset link is not valid. Request a new one.');
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ token, newPassword }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string; field?: string };

        if (body.field && body.error) {
          setErrors({ [body.field]: body.error });
        } else {
          setFormError(body.error ?? 'Something went wrong on our side. Try again, or come back in a moment.');
        }

        setSubmitting(false);
        return;
      }

      setComplete(true);
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  function revalidate(field: 'newPassword' | 'confirmPassword', nextNew: string, nextConfirm: string): void {
    if (!submitted) {
      return;
    }

    const next = validateResetPassword({ newPassword: nextNew, confirmPassword: nextConfirm });
    const current = errors[field];

    if (current && !next[field]) {
      const updated = { ...errors };
      delete updated[field];
      setErrors(updated);
    }
  }

  if (token === null) {
    return (
      <p className="hero__lede">
        This reset link is not valid.{' '}
        <Link href="/forgot">Request a new one</Link>.
      </p>
    );
  }

  if (complete) {
    return (
      <div className="alert alert--info" role="status">
        <span aria-hidden="true">✓</span>
        <div>
          <p>{RESET_PASSWORD_SUCCESS}</p>
          <p className="narrow-page__back">
            <Link href="/login" className="button button--primary">
              {SIGN_IN_TO_YOUR_ACCOUNT}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {formError ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{formError}</p>
        </div>
      ) : null}

      <ErrorSummary heading="Check the form" errors={errors} labels={FIELD_LABELS} />

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Field
          id="newPassword"
          name="newPassword"
          label={NEW_PASSWORD_LABEL}
          type="password"
          value={newPassword}
          onChange={(value) => {
            setNewPassword(value);
            revalidate('newPassword', value, confirmPassword);
          }}
          helper={PASSWORD_HINT}
          error={errors['newPassword']}
          required
          autoComplete="new-password"
          minLength={8}
        />

        <Field
          id="confirmPassword"
          name="confirmPassword"
          label={CONFIRM_PASSWORD_LABEL}
          type="password"
          value={confirmPassword}
          onChange={(value) => {
            setConfirmPassword(value);
            revalidate('confirmPassword', newPassword, value);
          }}
          error={errors['confirmPassword']}
          required
          autoComplete="new-password"
        />

        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Saving…' : SAVE_NEW_PASSWORD}
        </button>
      </form>
    </>
  );
}
