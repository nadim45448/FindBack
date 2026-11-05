'use client';

/**
 * The administrator's return confirmation surface.
 *
 * ## The confirmation, and the substitute
 *
 * FR-23 is the administrator confirming that an item was physically
 * returned. FR-24 is the *substitute* case — the item went to somebody
 * other than the person who had a right to it — and it names three
 * required fields: the substitute's name, the default receiver's
 * authorization of that substitute, and the relationship between the two.
 *
 * **The three fields are all-or-nothing.** The parser returns `null` for
 * the whole group when none of the three is present, and refuses the
 * request when some but not all are. So the surface offers a **checkbox**
 * that carries the whole group: checking it reveals the three fields, and
 * they are sent together or not at all.
 *
 * ## The default receiver is derived
 *
 * A default-receiver confirmation carries **no body fields at all** — the
 * receiver is worked out from the report. So the surface's default
 * submission sends an empty body, and only the checked case adds fields.
 *
 * ## The relationship is a closed set
 *
 * The relationship is a single-select from the PRD's five — `Friend`,
 * `Family Member`, `Colleague`, `Classmate`, `Other` — and the domain
 * refuses a value outside it. So the surface offers exactly those five
 * and cannot send a sixth.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import type { ReturnConfirmationSummary } from './admin-return-confirmation-model';

import {
  AWAITING_RETURN_BREADCRUMB_QUEUE,
  CONFIRM_RETURN_DEFAULT_RECEIVER_FOUND,
  CONFIRM_RETURN_DEFAULT_RECEIVER_LOST,
  CONFIRM_RETURN_MATCHED_RESPONSE_SECTION,
  CONFIRM_RETURN_PAGE_HEADING,
  CONFIRM_RETURN_SUBSTITUTE_CHECKBOX,
  CONFIRM_RETURN_SUBSTITUTE_SECTION,
  CONFIRM_RETURN_WHAT_HAPPENS_HEADING,
  CONFIRM_RETURN_WHAT_HAPPENS_ITEMS,
  CONFIRM_RETURNED,
  VERIFICATION_BACK_TO_QUEUE,
  VIEW_AUDIT_TRAIL,
} from './admin-copy';
import { Breadcrumbs } from './breadcrumbs';
import { csrfHeaders } from './csrf';
import { CANCEL } from './member-copy';
import { LOST_REPORT_AWAITING_RETURN_STATUS } from '@/domain/listings';

import { StatusBadge } from './status-badge';

/**
 * The return confirmation surface's props.
 */
export interface AdminReturnConfirmationSurfaceProps {
  /** The endpoint the confirmation is posted to. */
  readonly endpoint: string;
  /** Where the browser goes once the return is confirmed or on cancel. */
  readonly queueHref: string;
  /** Item and default-receiver context from the server. */
  readonly summary: ReturnConfirmationSummary;
  /** Contextual audit trail for this report (§17.1). */
  readonly auditHref: string;
  /** Case file after a successful confirmation. */
  readonly trackHref: string;
}

/** The PRD's five relationships, in the PRD's order. */
const RELATIONSHIPS = ['Friend', 'Family Member', 'Colleague', 'Classmate', 'Other'] as const;

function defaultReceiverLede(reportType: 'Found' | 'Lost'): string {
  return reportType === 'Found'
    ? CONFIRM_RETURN_DEFAULT_RECEIVER_FOUND
    : CONFIRM_RETURN_DEFAULT_RECEIVER_LOST;
}

/**
 * The administrator's return confirmation surface.
 */
export function AdminReturnConfirmationSurface({
  endpoint,
  queueHref,
  summary,
  auditHref,
  trackHref,
}: AdminReturnConfirmationSurfaceProps): React.JSX.Element {
  const router = useRouter();

  const [isSubstitute, setIsSubstitute] = useState(false);
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<string>(RELATIONSHIPS[0]);
  const [authorized, setAuthorized] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Send the confirmation.
   *
   * **The substitute's group is sent whole or not at all.** The parser
   * refuses a partial group, so the surface never sends one.
   */
  async function confirm(): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify(
          isSubstitute
            ? {
                substituteReceiverName: name.trim(),
                authorizationAffirmation: authorized,
                relationship,
              }
            : {},
        ),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        setFormError(payload.error ?? 'Something went wrong on our side. Try again.');
        setSubmitting(false);

        return;
      }

      router.push(trackHref);
      router.refresh();
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  const receiverRecorded = isSubstitute && name.trim() ? name.trim() : summary.defaultReceiverName;

  return (
    <div className="admin-console admin-confirm-return">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: AWAITING_RETURN_BREADCRUMB_QUEUE, href: queueHref },
          { label: summary.itemName, href: null },
        ]}
      />

      <div className="claim-admin-review__head admin-confirm-return__head">
        <div className="admin-confirm-return__title-row">
          <h1 className="hero__title">{CONFIRM_RETURN_PAGE_HEADING}</h1>
          <StatusBadge status={LOST_REPORT_AWAITING_RETURN_STATUS} />
        </div>

        <div className="admin-confirm-return__head-actions">
          <Link href={auditHref} className="button button--tertiary button--sm">
            {VIEW_AUDIT_TRAIL}
          </Link>

          <Link href={queueHref} className="button button--secondary button--sm">
            {VERIFICATION_BACK_TO_QUEUE}
          </Link>
        </div>
      </div>

      <section className="card admin-confirm-return__summary" aria-labelledby="confirm-return-summary">
        <h2 id="confirm-return-summary" className="verification-admin-review__card-title">
          {summary.itemName}
        </h2>

        <p className="verification-admin-review__meta">
          {summary.reportType === 'Found' ? 'Found report' : 'Lost report'}
          {' · Default receiver '}
          <strong>{summary.defaultReceiverName}</strong>
        </p>

        {summary.matchedDetails && summary.matchedDetails.length > 0 ? (
          <>
            <hr className="verification-admin-review__divider" />

            <h3 className="verification-admin-review__card-subtitle">
              {CONFIRM_RETURN_MATCHED_RESPONSE_SECTION}
            </h3>

            <dl className="registration-review__details verification-admin-review__details">
              {summary.matchedDetails.map((detail) => (
                <div key={detail.label} className="registration-review__detail">
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : null}
      </section>

      <div className="banner banner--info admin-confirm-return__lede" role="status">
        <p>{defaultReceiverLede(summary.reportType)}</p>
      </div>

      {formError ? (
        <div className="error-summary" role="alert" tabIndex={-1} id="error-summary">
          <h2 className="error-summary__heading">Check the form</h2>
          <ul className="error-summary__list">
            <li>{formError}</li>
          </ul>
        </div>
      ) : null}

      <section className="card admin-confirm-return__form" aria-labelledby="confirm-return-form">
        <h2 id="confirm-return-form" className="verification-admin-review__card-subtitle">
          {CONFIRM_RETURN_SUBSTITUTE_SECTION}
        </h2>

        <div className="field">
          <label className="field__label" htmlFor="isSubstitute">
            <input
              id="isSubstitute"
              name="isSubstitute"
              type="checkbox"
              checked={isSubstitute}
              onChange={(event) => setIsSubstitute(event.target.checked)}
            />{' '}
            {CONFIRM_RETURN_SUBSTITUTE_CHECKBOX}
          </label>
        </div>

        {isSubstitute ? (
          <div className="admin-confirm-return__substitute-fields">
            <div className="field">
              <label className="field__label" htmlFor="substituteReceiverName">
                Substitute receiver’s name
              </label>

              <input
                id="substituteReceiverName"
                name="substituteReceiverName"
                className="input"
                type="text"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="relationship">
                Relationship
              </label>

              <select
                id="relationship"
                name="relationship"
                className="input"
                value={relationship}
                onChange={(event) => setRelationship(event.target.value)}
              >
                {RELATIONSHIPS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="authorizationAffirmation">
                <input
                  id="authorizationAffirmation"
                  name="authorizationAffirmation"
                  type="checkbox"
                  checked={authorized}
                  onChange={(event) => setAuthorized(event.target.checked)}
                />{' '}
                The default receiver authorized this substitute
              </label>
            </div>
          </div>
        ) : null}

        <div className="admin-confirm-return__outcome" role="status">
          <p className="banner__heading">{CONFIRM_RETURN_WHAT_HAPPENS_HEADING}</p>
          <ul className="registration-review__info-list">
            {CONFIRM_RETURN_WHAT_HAPPENS_ITEMS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="admin-confirm-return__outcome-receiver">
            Receiver recorded: <strong>{receiverRecorded}</strong>
          </p>
        </div>

        <div className="form-actions admin-confirm-return__actions">
          <button
            type="button"
            className="button button--tertiary"
            disabled={submitting}
            onClick={() => router.push(queueHref)}
          >
            {CANCEL}
          </button>

          <button
            type="button"
            className="button button--success"
            disabled={submitting}
            aria-label={`Confirm returned to ${receiverRecorded}`}
            onClick={() => void confirm()}
          >
            {CONFIRM_RETURNED}
          </button>
        </div>
      </section>
    </div>
  );
}
