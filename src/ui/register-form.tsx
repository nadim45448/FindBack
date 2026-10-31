'use client';

/**
 * The register form.
 *
 * ## The fields
 *
 * EXPERIENCE.md §16.1: *"name, email, password, confirm password,
 * self-declared role"*. The story adds *"a client hint of at least 8
 * characters, at least 1 letter, and at least 1 number"*.
 *
 * ## The outcome
 *
 * §16.1: *"On success: redirect to `/pending-registered` (a confirmation
 * page) with copy: 'Your account is pending administrator approval. You'll
 * get an email when you're approved.' No automatic login."*
 *
 * **No session is created** — the registration route returns no cookie, and
 * this form does not sign the visitor in. The pending surface is a
 * *separate* surface from `/pending-registered`, and the story requires
 * them to stay distinct.
 *
 * ## The duplicate email
 *
 * The server answers a duplicate registration with a 409. The message is
 * the server's own, and the form renders it — the surface does not
 * reword the domain's decision about what a duplicate address means.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { SELF_DECLARED_ROLES } from '@/domain/accounts';

import { AuthFooter } from './auth-card';
import { csrfHeaders } from './csrf';
import { Field, SelectField, ErrorSummary, useFocusFirstInvalidField } from './form-parts';
import { validateRegister, type FieldErrors, type RegisterValues } from './form-validation';
import {
  CONFIRM_PASSWORD_LABEL,
  CREATE_ACCOUNT_SUBMIT,
  EMAIL_LABEL,
  FULL_NAME_LABEL,
  PASSWORD_HINT,
  PASSWORD_LABEL,
  REGISTER_CARD_HEADING,
  REGISTER_FOOTER_PROMPT,
  REGISTER_LEDE,
  ROLE_FIELD_HELPER,
  ROLE_REQUIRED,
  SELF_DECLARED_ROLE_LABEL,
  SIGN_IN,
  YOUR_ROLE_LABEL,
} from './copy';

/** The field labels the error summary uses. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  displayName: FULL_NAME_LABEL,
  email: EMAIL_LABEL,
  password: PASSWORD_LABEL,
  confirmPassword: CONFIRM_PASSWORD_LABEL,
  selfDeclaredRole: YOUR_ROLE_LABEL,
  selfDeclaredRoleOther: SELF_DECLARED_ROLE_LABEL,
};

/** The register form. */
export function RegisterForm(): React.JSX.Element {
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selfDeclaredRole, setSelfDeclaredRole] = useState('');
  const [selfDeclaredRoleOther, setSelfDeclaredRoleOther] = useState('');

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusFirstInvalidField(errors, submitted);

  /** The current values, for the re-validation. */
  function currentValues(): {
    displayName: string;
    email: string;
    password: string;
    confirmPassword: string;
    selfDeclaredRole: string;
    selfDeclaredRoleOther: string;
  } {
    return {
      displayName,
      email,
      password,
      confirmPassword,
      selfDeclaredRole,
      selfDeclaredRoleOther,
    };
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitted(true);
    setFormError(null);

    const clientErrors = validateRegister(currentValues());

    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          displayName,
          email,
          password,
          selfDeclaredRole,
          selfDeclaredRoleOther: selfDeclaredRole === 'Other' ? selfDeclaredRoleOther : null,
        }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string; field?: string };

        // **A field-scoped server error is filed against its field**, so it
        // lands in the summary and the field together. A server error with
        // no field is a form-level message.
        if (body.field && body.error) {
          setErrors({ [body.field]: body.error });
        } else {
          setFormError(body.error ?? 'Something went wrong on our side. Try again, or come back in a moment.');
        }

        setSubmitting(false);
        return;
      }

      // **No automatic login.** The visitor is not signed in by registering;
      // they land on the confirmation surface.
      router.replace('/pending-registered');
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  /**
   * Clear a field's error the moment its value becomes valid.
   *
   * **The new value is passed in, and substituted over the current
   * values.** The state still holds the *previous* value for the field
   * that changed — React has not re-rendered yet — so validating the state
   * unchanged would validate the value the visitor has just replaced, and
   * the error would never clear. The criterion says the error clears *"the
   * moment its value becomes valid"*, so the check must be made against
   * the value that was just typed.
   */
  function revalidate(field: keyof RegisterValues, value: string): void {
    if (!submitted) {
      return;
    }

    const next = validateRegister({ ...currentValues(), [field]: value });

    if (errors[field] && !next[field]) {
      const updated = { ...errors };
      delete updated[field];
      setErrors(updated);
    }
  }

  return (
    <>
      <h1>{REGISTER_CARD_HEADING}</h1>
      <p className="auth-card__lede">{REGISTER_LEDE}</p>

      {formError ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{formError}</p>
        </div>
      ) : null}

      <ErrorSummary heading="Check the form" errors={errors} labels={FIELD_LABELS} />

      <form onSubmit={(event) => void handleSubmit(event)} noValidate>
        <Field
          id="displayName"
          name="displayName"
          label={FULL_NAME_LABEL}
          value={displayName}
          onChange={(value) => {
            setDisplayName(value);
            revalidate('displayName', value);
          }}
          error={errors['displayName']}
          required
          autoComplete="name"
        />

        <Field
          id="email"
          name="email"
          label={EMAIL_LABEL}
          type="email"
          value={email}
          onChange={(value) => {
            setEmail(value);
            revalidate('email', value);
          }}
          error={errors['email']}
          required
          autoComplete="email"
        />

        <Field
          id="password"
          name="password"
          label={PASSWORD_LABEL}
          type="password"
          value={password}
          onChange={(value) => {
            setPassword(value);
            revalidate('password', value);
          }}
          helper={PASSWORD_HINT}
          error={errors['password']}
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
            revalidate('confirmPassword', value);
          }}
          error={errors['confirmPassword']}
          required
          autoComplete="new-password"
        />

        <SelectField
          id="selfDeclaredRole"
          name="selfDeclaredRole"
          label={YOUR_ROLE_LABEL}
          value={selfDeclaredRole}
          onChange={(value) => {
            setSelfDeclaredRole(value);
            revalidate('selfDeclaredRole', value);
          }}
          options={SELF_DECLARED_ROLES}
          helper={ROLE_FIELD_HELPER}
          error={errors['selfDeclaredRole']}
          required
        />

        {selfDeclaredRole === 'Other' ? (
          <Field
            id="selfDeclaredRoleOther"
            name="selfDeclaredRoleOther"
            label={SELF_DECLARED_ROLE_LABEL}
            value={selfDeclaredRoleOther}
            onChange={(value) => {
              setSelfDeclaredRoleOther(value);
              revalidate('selfDeclaredRoleOther', value);
            }}
            helper={ROLE_REQUIRED}
            error={errors['selfDeclaredRoleOther']}
            required
          />
        ) : null}

        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Creating your account…' : CREATE_ACCOUNT_SUBMIT}
        </button>
      </form>

      <AuthFooter>
        {REGISTER_FOOTER_PROMPT} <Link href="/login">{SIGN_IN}</Link>
      </AuthFooter>
    </>
  );
}
