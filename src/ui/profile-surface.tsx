'use client';

/**
 * The member profile — EXPERIENCE.md §9.4a / FR-52.
 *
 * Editable: display name and self-declared role. Email is read-only.
 * Forbidden affordances (avatar, bio, social, notification prefs, email
 * change, self-deactivation) are not present.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { SELF_DECLARED_ROLES } from '@/domain/accounts';

import { csrfHeaders } from './csrf';
import { Field, SelectField } from './form-parts';
import {
  PROFILE_BACK,
  PROFILE_DISPLAY_NAME_HELPER,
  PROFILE_DISPLAY_NAME_LABEL,
  PROFILE_EMAIL_HELPER,
  PROFILE_EMAIL_LABEL,
  PROFILE_FOOTER,
  PROFILE_HEADING,
  PROFILE_LEDE,
  PROFILE_ROLE_HELPER,
  PROFILE_ROLE_LABEL,
  PROFILE_SAVE,
  PROFILE_UPDATED,
  SERVER_ERROR_MESSAGE,
} from './member-copy';

/** The profile the server already knows. */
export interface ProfileValues {
  readonly displayName: string;
  readonly email: string;
  readonly selfDeclaredRole: string;
  readonly selfDeclaredRoleOther: string | null;
}

/** The profile surface's props. */
export interface ProfileSurfaceProps {
  readonly initial: ProfileValues;
}

/** The member profile form. */
export function ProfileSurface({ initial }: ProfileSurfaceProps): React.JSX.Element {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [role, setRole] = useState(initial.selfDeclaredRole);
  const [other, setOther] = useState(initial.selfDeclaredRoleOther ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSubmitting(true);

    try {
      const response = await fetch('/api/me/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          displayName,
          selfDeclaredRole: role,
          selfDeclaredRoleOther: role === 'Other' ? other : null,
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? SERVER_ERROR_MESSAGE);
        setSubmitting(false);
        return;
      }

      setSaved(true);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError(SERVER_ERROR_MESSAGE);
      setSubmitting(false);
    }
  }

  return (
    <div className="form-column">
      <h1 className="hero__title">{PROFILE_HEADING}</h1>
      <p className="hero__lede">{PROFILE_LEDE}</p>

      {saved ? (
        <p className="alert alert--success" role="status">
          {PROFILE_UPDATED}
        </p>
      ) : null}

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{error}</p>
        </div>
      ) : null}

      <form className="form-card" onSubmit={(event) => void handleSubmit(event)}>
        <Field
          id="profile-name"
          name="displayName"
          label={PROFILE_DISPLAY_NAME_LABEL}
          value={displayName}
          onChange={setDisplayName}
          helper={PROFILE_DISPLAY_NAME_HELPER}
          autoComplete="name"
        />

        <SelectField
          id="profile-role"
          name="role"
          label={PROFILE_ROLE_LABEL}
          value={role}
          onChange={setRole}
          options={[...SELF_DECLARED_ROLES]}
          helper={PROFILE_ROLE_HELPER}
          required
        />

        {role === 'Other' ? (
          <Field
            id="profile-role-other"
            name="selfDeclaredRoleOther"
            label="Describe your role"
            value={other}
            onChange={setOther}
            required
          />
        ) : null}

        <div className="field">
          <label className="field__label" htmlFor="profile-email">
            {PROFILE_EMAIL_LABEL}
          </label>
          <p className="field__helper" id="profile-email-describedby">
            {PROFILE_EMAIL_HELPER}
          </p>
          <input
            id="profile-email"
            className="input"
            type="email"
            name="email"
            value={initial.email}
            disabled
            aria-describedby="profile-email-describedby"
          />
        </div>

        <p className="button-row">
          <Link href="/home" className="button button--tertiary">
            {PROFILE_BACK}
          </Link>
          <button type="submit" className="button button--primary" disabled={submitting}>
            {PROFILE_SAVE}
          </button>
        </p>
      </form>

      <p className="field__helper">{PROFILE_FOOTER}</p>
    </div>
  );
}
