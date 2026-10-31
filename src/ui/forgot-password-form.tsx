'use client';

/**
 * The forgot-password form.
 *
 * ## The anti-enumeration rule, and what it means for this form
 *
 * EXPERIENCE.md §9.3a: *"The system always shows the neutral confirmation
 * message regardless of whether the email belongs to an account."*
 *
 * **This form does not branch on the account state, and it does not need
 * to.** The server answers 202 with the neutral confirmation for every
 * well-formed request — registered, unregistered, `Pending`, `Active`,
 * `Rejected`, `Deactivated` — and this form routes to `/forgot-sent`
 * whenever it gets a 202.
 *
 * **A 400 is a different thing.** The server rejects a *malformed* address
 * with a 400 before the account lookup — so refusing it discloses nothing
 * about whether the account exists. That is the one response this form
 * treats differently, and it is different because it is safe to be
 * different.
 *
 * ## The client check is the server's own check
 *
 * The client validates the address's shape with the domain's
 * `isPlausibleEmailShape`, so the same addresses are refused on both
 * sides. A client that accepted an address the server refuses would leave
 * the visitor staring at an error with no explanation.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { Field, ErrorSummary, useFocusFirstInvalidField } from './form-parts';
import { validateForgot, type FieldErrors } from './form-validation';
import {
  BACK_TO_SIGN_IN,
  EMAIL_LABEL,
  FORGOT_HEADING,
  FORGOT_LEDE,
  SEND_RESET_INSTRUCTIONS,
} from './copy';

/** The field labels the error summary uses. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  email: EMAIL_LABEL,
};

/** The forgot-password form. */
export function ForgotPasswordForm(): React.JSX.Element {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusFirstInvalidField(errors, submitted);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);

    const clientErrors = validateForgot({ email });

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ email }),
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

      // **The neutral confirmation, for every case.** The route to
      // `/forgot-sent` is taken whenever the server accepts the request,
      // and the surface on the other side says nothing about the account.
      router.replace('/forgot-sent');
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  /**
   * Clear the field's error the moment its value becomes valid.
   *
   * **The new value is passed in, not read from the state.** The state
   * still holds the *previous* value inside this handler — `setEmail` has
   * been called, but React has not re-rendered — so validating the state
   * would validate the value the visitor has just replaced. The criterion
   * says the error clears *"the moment its value becomes valid"*, so the
   * check must be made against the value that was just typed.
   */
  function revalidate(nextEmail: string): void {
    if (!submitted) {
      return;
    }

    const next = validateForgot({ email: nextEmail });

    if (errors['email'] && !next['email']) {
      const updated = { ...errors };
      delete updated['email'];
      setErrors(updated);
    }
  }

  return (
    <>
      <h1 className="hero__title">{FORGOT_HEADING}</h1>

      <p className="hero__lede">{FORGOT_LEDE}</p>

      {formError ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{formError}</p>
        </div>
      ) : null}

      <ErrorSummary heading="Check the form" errors={errors} labels={FIELD_LABELS} />

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Field
          id="email"
          name="email"
          label={EMAIL_LABEL}
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            revalidate(value);
          }}
          error={errors['email']}
          required
          autoComplete="email"
        />

        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Sending…' : SEND_RESET_INSTRUCTIONS}
        </button>
      </form>

      <p className="narrow-page__back">
        <Link href="/login" className="button button--tertiary button--sm">
          {BACK_TO_SIGN_IN}
        </Link>
      </p>
    </>
  );
}
