'use client';

/**
 * The administrator's Lost-side verification surface.
 *
 * ## The queue's action reaches here
 *
 * §15.5's Items in Verification queue's action reaches *"the Lost-side
 * verification screen"*, and that screen is this page.
 *
 * ## The determination is the owner's
 *
 * FR-45: the Lost report's **owner** determines whether a candidate is
 * their item. The endpoint carries the `determinedByUserId`, and the
 * domain refuses a determination from anybody else — so the surface sends
 * the owner's id, taken from the report's projection, and never the
 * administrator's own.
 *
 * ## Two outcomes, and they are not symmetric
 *
 * `match_confirmed` and `not_a_match` are the two outcomes, and neither
 * ends the report. **`Match Confirmed` is not terminal** — the report stays
 * `Verification Pending` until the item is physically returned and the
 * administrator confirms the return. So confirming a match is a step, not
 * an ending, and the surface says so.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { CANCEL } from './member-copy';

/**
 * One candidate, as the administrator sees it.
 */
export interface VerificationCandidate {
  readonly responseId: string;
  readonly status: string;
  readonly campusArea: string;
  readonly exactPlace: string;
  readonly observedIdentifyingDetails: string;
  readonly dateFound: string;
  readonly submittedAt: string;
}

/**
 * The verification surface's props.
 */
export interface AdminVerificationSurfaceProps {
  /** The report id the determination is recorded against. */
  readonly reportId: string;
  /** The report's owner — the only actor who may determine. */
  readonly determinedByUserId: string;
  /** The heading above the determination. */
  readonly heading: string;
  /** The report's name. */
  readonly reportName: string;
  /** The candidates on the report. */
  readonly candidates: readonly VerificationCandidate[];
  /** Where the browser goes once the determination is recorded. */
  readonly afterHref: string;
}

/**
 * The administrator's Lost-side verification surface.
 */
export function AdminVerificationSurface({
  reportId,
  determinedByUserId,
  heading,
  reportName,
  candidates,
  afterHref,
}: AdminVerificationSurfaceProps): React.JSX.Element {
  const router = useRouter();

  const [selected, setSelected] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Record a determination on the selected candidate.
   */
  async function determine(outcome: 'match_confirmed' | 'not_a_match'): Promise<void> {
    if (submitting || selected === null) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(
        `/api/admin/reports/${reportId}/recovery-responses/${selected}/determine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...csrfHeaders(),
          },
          body: JSON.stringify({ outcome, determinedByUserId }),
        },
      );

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

      <p className="hero__lede">{reportName}</p>

      {formError ? (
        <div className="error-summary" role="alert" tabIndex={-1} id="error-summary">
          <h2 className="error-summary__heading">Check the form</h2>
          <ul className="error-summary__list">
            <li>{formError}</li>
          </ul>
        </div>
      ) : null}

      {candidates.length === 0 ? (
        <div className="banner banner--info" role="status">
          <p>There are no recovery responses for this item yet.</p>
        </div>
      ) : (
        <fieldset className="field">
          <legend className="field__label">Recovery responses</legend>

          {candidates.map((candidate) => (
            <label key={candidate.responseId} className="field__label" htmlFor={candidate.responseId}>
              <input
                id={candidate.responseId}
                name="selectedResponse"
                type="radio"
                checked={selected === candidate.responseId}
                onChange={() => setSelected(candidate.responseId)}
              />{' '}
              {candidate.campusArea} — {candidate.exactPlace} — {candidate.status}
            </label>
          ))}
        </fieldset>
      )}

      {selected !== null ? (
        <div className="button-row">
          <button
            type="button"
            className="button button--primary"
            disabled={submitting}
            onClick={() => void determine('match_confirmed')}
          >
            Confirm match
          </button>

          <button
            type="button"
            className="button button--tertiary"
            disabled={submitting}
            onClick={() => void determine('not_a_match')}
          >
            Not a match
          </button>
        </div>
      ) : null}

      <div className="button-row">
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
