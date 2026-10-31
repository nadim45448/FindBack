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

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { CANCEL } from './member-copy';

/**
 * The return confirmation surface's props.
 */
export interface AdminReturnConfirmationSurfaceProps {
  /** The endpoint the confirmation is posted to. */
  readonly endpoint: string;
  /** The heading above the confirmation. */
  readonly heading: string;
  /** Where the browser goes once the return is confirmed. */
  readonly afterHref: string;
  /** The detail lines shown above the confirmation. */
  readonly details?: readonly { readonly label: string; readonly value: string }[] | undefined;
}

/** The PRD's five relationships, in the PRD's order. */
const RELATIONSHIPS = ['Friend', 'Family Member', 'Colleague', 'Classmate', 'Other'] as const;

/**
 * The administrator's return confirmation surface.
 */
export function AdminReturnConfirmationSurface({
  endpoint,
  heading,
  afterHref,
  details,
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

      router.push(afterHref);
      router.refresh();
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  return (
    <div className="form-column">
      <h1 className="hero__title">{heading}</h1>

      {details && details.length > 0 ? (
        <dl className="detail-list">
          {details.map((detail) => (
            <div key={detail.label} className="detail-list__row">
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {formError ? (
        <div className="error-summary" role="alert" tabIndex={-1} id="error-summary">
          <h2 className="error-summary__heading">Check the form</h2>
          <ul className="error-summary__list">
            <li>{formError}</li>
          </ul>
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="isSubstitute">
          <input
            id="isSubstitute"
            name="isSubstitute"
            type="checkbox"
            checked={isSubstitute}
            onChange={(event) => setIsSubstitute(event.target.checked)}
          />{' '}
          The item went to somebody other than the person who had a right to it
        </label>
      </div>

      {isSubstitute ? (
        <>
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
        </>
      ) : null}

      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={submitting}
          onClick={() => void confirm()}
        >
          Confirm Returned
        </button>

        <button
          type="button"
          className="button button--secondary"
          disabled={submitting}
          onClick={() => router.push(afterHref)}
        >
          {CANCEL}
        </button>
      </div>
    </div>
  );
}
