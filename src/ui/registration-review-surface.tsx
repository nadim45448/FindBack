'use client';

/**
 * The administrator's registration approve and reject surfaces.
 *
 * **Two screens, matching the BMAD mockups** — `03-registration-approve.html`
 * and `04-registration-reject.html`. The queue's Approve and Reject links
 * land here with `?decision=approve` or `?decision=reject`; each screen
 * carries one decision, not both on the same form.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Breadcrumbs } from './breadcrumbs';
import { csrfHeaders } from './csrf';
import {
  REGISTRATION_APPROVE_ACCOUNT,
  REGISTRATION_APPROVE_HEADING,
  REGISTRATION_APPROVE_INFO_HEADING,
  REGISTRATION_APPROVE_INFO_AUDIT,
  REGISTRATION_BREADCRUMB_QUEUE,
  REGISTRATION_REJECT_ACCOUNT,
  REGISTRATION_REJECT_HEADING,
  REGISTRATION_REJECT_REASON_HELP,
  REGISTRATION_REJECT_REASON_LABEL,
  REGISTRATION_REJECT_REASON_PLACEHOLDER,
  REGISTRATION_REJECT_REASON_REQUIRED,
  REJECTION_REASON_TOO_SHORT,
} from './admin-copy';
import { CANCEL } from './member-copy';

export type RegistrationReviewMode = 'approve' | 'reject';

export interface RegistrationReviewSurfaceProps {
  readonly mode: RegistrationReviewMode;
  readonly displayName: string;
  readonly email: string;
  readonly selfDeclaredRole: string;
  readonly submittedAtLabel: string;
  readonly administratorName: string;
  readonly endpoint: string;
  readonly afterHref: string;
}

export function RegistrationReviewSurface({
  mode,
  displayName,
  email,
  selfDeclaredRole,
  submittedAtLabel,
  administratorName,
  endpoint,
  afterHref,
}: RegistrationReviewSurfaceProps): React.JSX.Element {
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const breadcrumbCurrent =
    mode === 'reject' ? `${displayName} — reject` : displayName;

  async function submit(decision: 'approve' | 'reject'): Promise<void> {
    if (submitting) {
      return;
    }

    if (decision === 'reject') {
      const trimmed = reason.trim();

      if (trimmed.length === 0) {
        setReasonError(REGISTRATION_REJECT_REASON_REQUIRED);

        return;
      }

      if (trimmed.length < 5) {
        setReasonError(REJECTION_REASON_TOO_SHORT);

        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    setReasonError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          decision,
          ...(decision === 'reject' ? { reason: reason.trim() } : {}),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        setFormError(payload.error ?? 'Something went wrong on our side. Try again.');
        setSubmitting(false);

        return;
      }

      router.push(afterHref);
      router.refresh();
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  return (
    <div className="form-column registration-review">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: REGISTRATION_BREADCRUMB_QUEUE, href: afterHref },
          { label: breadcrumbCurrent, href: null },
        ]}
      />

      <h1 className="hero__title">
        {mode === 'approve' ? REGISTRATION_APPROVE_HEADING : REGISTRATION_REJECT_HEADING}
      </h1>

      {formError ? (
        <div className="error-summary" role="alert" tabIndex={-1}>
          <h2 className="error-summary__heading">Check the form</h2>
          <ul className="error-summary__list">
            <li>{formError}</li>
          </ul>
        </div>
      ) : null}

      <div className="card registration-review__card">
        <dl className="registration-review__details">
          <div className="registration-review__detail">
            <dt className="field__label">Name</dt>
            <dd>
              <strong>{displayName}</strong>
            </dd>
          </div>

          <div className="registration-review__detail">
            <dt className="field__label">Email</dt>
            <dd>
              <code className="registration-review__email">{email}</code>
            </dd>
          </div>

          {mode === 'approve' ? (
            <>
              <div className="registration-review__detail">
                <dt className="field__label">Self-declared role</dt>
                <dd>{selfDeclaredRole}</dd>
              </div>

              <div className="registration-review__detail">
                <dt className="field__label">Submitted</dt>
                <dd>
                  <time dateTime={submittedAtLabel}>{submittedAtLabel}</time>
                </dd>
              </div>
            </>
          ) : null}
        </dl>
      </div>

      {mode === 'approve' ? (
        <div className="banner banner--info registration-review__info" role="status">
          <div>
            <p className="banner__heading">{REGISTRATION_APPROVE_INFO_HEADING}</p>
            <ul className="registration-review__info-list">
              <li>
                Change account status from <strong>Pending</strong> to <strong>Active</strong>
              </li>
              <li>
                Send the &quot;account approved&quot; email to <strong>{email}</strong>
              </li>
              <li>{REGISTRATION_APPROVE_INFO_AUDIT(administratorName)}</li>
            </ul>
          </div>
        </div>
      ) : (
        <form
          className="registration-review__reject-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit('reject');
          }}
        >
          <div className="field">
            <label className="field__label" htmlFor="registrationRejectReason">
              {REGISTRATION_REJECT_REASON_LABEL}{' '}
              <span className="field__required" aria-hidden="true">
                *
              </span>
            </label>

            {reasonError ? (
              <p className="field__error" id="registrationRejectReason-describedby">
                {reasonError}
              </p>
            ) : (
              <p className="field__helper" id="registrationRejectReason-describedby">
                {REGISTRATION_REJECT_REASON_HELP}
              </p>
            )}

            <textarea
              id="registrationRejectReason"
              name="reason"
              className="input"
              rows={4}
              required
              minLength={5}
              value={reason}
              placeholder={REGISTRATION_REJECT_REASON_PLACEHOLDER}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby="registrationRejectReason-describedby"
              onChange={(event) => {
                setReason(event.target.value);

                if (reasonError !== null && event.target.value.trim().length >= 5) {
                  setReasonError(null);
                }
              }}
            />
          </div>

          <div className="form-actions">
            <Link href={afterHref} className="button button--tertiary">
              {CANCEL}
            </Link>

            <button type="submit" className="button button--danger" disabled={submitting}>
              {REGISTRATION_REJECT_ACCOUNT}
            </button>
          </div>
        </form>
      )}

      {mode === 'approve' ? (
        <div className="form-actions">
          <Link href={afterHref} className="button button--tertiary">
            {CANCEL}
          </Link>

          <button
            type="button"
            className="button button--success"
            disabled={submitting}
            onClick={() => void submit('approve')}
          >
            {REGISTRATION_APPROVE_ACCOUNT}
          </button>
        </div>
      ) : null}
    </div>
  );
}
