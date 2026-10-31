'use client';

/**
 * The claim form — §12.1.
 *
 * ## Three fields, three bounds
 *
 * §12.1's table: Reason (20–1000), Identifying details (10–500), Date
 * lost (last 365 days, not future). The bounds are the domain's — the
 * server is authoritative — and the form carries them as the native
 * constraints so the browser refuses what the server would refuse.
 *
 * ## The form renders for a Found item only
 *
 * §12.1's eligibility check is a *server* check: an item that is not
 * Found, is not `Open` or `Claim Requested`, or already has the viewer's
 * own Pending Claim, is refused before the form is served. **The surface
 * does not re-evaluate eligibility** — for the same reason the detail
 * surface does not re-evaluate visibility. The eligibility screen is the
 * server's.
 */

import { useCallback } from 'react';

import {
  CLAIM_DATE_LOST_LABEL,
  CLAIM_FORM_DESCRIPTION,
  CLAIM_FORM_HEADING,
  CLAIM_IDENTIFYING_DETAILS_LABEL,
  CLAIM_REASON_LABEL,
  SUBMIT_CLAIM_BUTTON,
  SUBMITTING,
} from './member-copy';
import { CharacterCounter } from './character-counter';

/**
 * The claim form's values.
 */
export interface ClaimFormValues {
  readonly reason: string;
  readonly identifyingDetails: string;
  readonly dateLost: string;
}

/**
 * The claim form's props.
 */
export interface ClaimFormSurfaceProps {
  /** The current values. */
  readonly values: ClaimFormValues;
  /** The change handler. */
  readonly onChange: (values: ClaimFormValues) => void;
  /** The submit handler. */
  readonly onSubmit: () => void;
  /** Whether a submission is in flight. */
  readonly submitting: boolean;
  /** The field errors, keyed by field name. */
  readonly errors?: Readonly<Record<string, string>> | undefined;
  /** The minimum date the native picker accepts. */
  readonly minDate: string;
  /** The maximum date the native picker accepts. */
  readonly maxDate: string;
}

/**
 * The claim form.
 */
export function ClaimFormSurface({
  values,
  onChange,
  onSubmit,
  submitting,
  errors = {},
  minDate,
  maxDate,
}: ClaimFormSurfaceProps): React.JSX.Element {
  const set = useCallback(
    (key: keyof ClaimFormValues, value: string): void => {
      onChange({ ...values, [key]: value });
    },
    [onChange, values],
  );

  return (
    <form
      className="report-form"
      // **`noValidate`.** The browser's own validation bubble would
      // block the submit before the server ever saw it — and then the
      // `role="alert"` summary, the focus on the first invalid field,
      // and the scroll to the first error would never happen.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h1 className="hero__title">{CLAIM_FORM_HEADING}</h1>

      <p className="hero__lede">{CLAIM_FORM_DESCRIPTION}</p>

      <fieldset className="card">
        <legend className="field__label">{'Details'}</legend>

        <div className="field">
          <label className="field__label" htmlFor="reason">
            {CLAIM_REASON_LABEL}
            <span className="field__required" aria-hidden="true">
              {' *'}
            </span>
          </label>

          {errors['reason'] ? (
            <p className="field__error" id="reason-describedby">
              {errors['reason']}
            </p>
          ) : null}

          <textarea
            id="reason"
            className="textarea"
            value={values.reason}
            minLength={20}
            maxLength={1000}
            required
            aria-required="true"
            aria-invalid={errors['reason'] ? true : undefined}
            aria-describedby={errors['reason'] ? 'reason-describedby' : undefined}
            onChange={(event) => {
              set('reason', event.target.value);
            }}
          />

          <CharacterCounter current={Array.from(values.reason).length} max={1000} />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="claimIdentifyingDetails">
            {CLAIM_IDENTIFYING_DETAILS_LABEL}
            <span className="field__required" aria-hidden="true">
              {' *'}
            </span>
          </label>

          {errors['identifyingDetails'] ? (
            <p className="field__error" id="claimIdentifyingDetails-describedby">
              {errors['identifyingDetails']}
            </p>
          ) : null}

          <textarea
            id="claimIdentifyingDetails"
            className="textarea"
            value={values.identifyingDetails}
            minLength={10}
            maxLength={500}
            required
            aria-required="true"
            aria-invalid={errors['identifyingDetails'] ? true : undefined}
            aria-describedby={
              errors['identifyingDetails'] ? 'claimIdentifyingDetails-describedby' : undefined
            }
            onChange={(event) => {
              set('identifyingDetails', event.target.value);
            }}
          />

          <CharacterCounter
            current={Array.from(values.identifyingDetails).length}
            max={500}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="dateLost">
            {CLAIM_DATE_LOST_LABEL}
            <span className="field__required" aria-hidden="true">
              {' *'}
            </span>
          </label>

          {errors['dateLost'] ? (
            <p className="field__error" id="dateLost-describedby">
              {errors['dateLost']}
            </p>
          ) : null}

          <input
            id="dateLost"
            className="input"
            type="date"
            value={values.dateLost}
            min={minDate}
            max={maxDate}
            required
            aria-required="true"
            aria-invalid={errors['dateLost'] ? true : undefined}
            aria-describedby={errors['dateLost'] ? 'dateLost-describedby' : undefined}
            onChange={(event) => {
              set('dateLost', event.target.value);
            }}
          />
        </div>
      </fieldset>

      <p className="button-row">
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? SUBMITTING : SUBMIT_CLAIM_BUTTON}
        </button>
      </p>
    </form>
  );
}
