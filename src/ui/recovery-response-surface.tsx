'use client';

/**
 * The recovery response form and detail — §9.6.
 *
 * ## The form
 *
 * §9.6: *"Eligibility: Active member, item is Lost, status is Open or
 * Verification Pending before Match Confirmed, member is not the
 * Lost-report owner."* and the form *"collects where-found area and exact
 * place, observed identifying details, date found, and an optional
 * candidate image"*.
 *
 * **The eligibility is the server's,** for the same reason the claim
 * form's is.
 *
 * ## The detail
 *
 * §9.6: *"Lost report summary, RR fields (where-found area + exact place,
 * observed identifying details, date found, candidate image if provided),
 * canonical status, per-RR thread. Withdraw action available **only
 * while** `Submitted` and not currently `Selected for Verification`.
 * Read-only once terminal."*
 *
 * **The `Submitted — Standby` label is a display derivation, and the
 * server applies it.** The canonical persisted status stays `Submitted`,
 * and the badge must not imply a ninth status exists — so the derivation
 * happens in the domain (`standby-display.ts`) and this surface renders
 * the label it is given.
 */

import Link from 'next/link';

import {
  CANDIDATE_IMAGE_LABEL,
  DATE_FOUND_LABEL,
  OBSERVED_IDENTIFYING_DETAILS_LABEL,
  RECOVERY_RESPONSE_DETAIL_HEADING,
  RECOVERY_RESPONSE_FORM_DESCRIPTION,
  RECOVERY_RESPONSE_FORM_HEADING,
  RECOVERY_RESPONSE_STATUS_LABEL,
  SELECT_LOCATION_PLACEHOLDER,
  SUBMIT_RECOVERY_RESPONSE,
  SUBMITTING,
  WHERE_FOUND_AREA_LABEL,
} from './member-copy';
import { CharacterCounter } from './character-counter';
import { StatusBadge } from './status-badge';

/**
 * The recovery response form's values.
 */
export interface RecoveryResponseFormValues {
  readonly whereFoundArea: string;
  readonly exactPlace: string;
  readonly observedIdentifyingDetails: string;
  readonly dateFound: string;
}

/** One campus area option for the where-found select. */
export interface RecoveryResponseCampusAreaOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The recovery response form's props.
 */
export interface RecoveryResponseFormSurfaceProps {
  /** The current values. */
  readonly values: RecoveryResponseFormValues;
  /** The change handler. */
  readonly onChange: (values: RecoveryResponseFormValues) => void;
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
  /** Campus areas for the where-found select. */
  readonly campusAreas: readonly RecoveryResponseCampusAreaOption[];
}

/**
 * The recovery response form.
 */
export function RecoveryResponseFormSurface({
  values,
  onChange,
  onSubmit,
  submitting,
  errors = {},
  minDate,
  maxDate,
  campusAreas,
}: RecoveryResponseFormSurfaceProps): React.JSX.Element {
  const set = (key: keyof RecoveryResponseFormValues, value: string): void => {
    onChange({ ...values, [key]: value });
  };

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
      <h1 className="hero__title">{RECOVERY_RESPONSE_FORM_HEADING}</h1>

      <p className="hero__lede">{RECOVERY_RESPONSE_FORM_DESCRIPTION}</p>

      <fieldset className="card">
        <legend className="field__label">{'Details'}</legend>

        <div className="field">
          <label className="field__label" htmlFor="whereFoundArea">
            {WHERE_FOUND_AREA_LABEL}
            <span className="field__required" aria-hidden="true">
              {' *'}
            </span>
          </label>

          {errors['whereFoundArea'] ? (
            <p className="field__error" id="whereFoundArea-describedby">
              {errors['whereFoundArea']}
            </p>
          ) : null}

          <select
            id="whereFoundArea"
            className="select"
            value={values.whereFoundArea}
            required
            aria-required="true"
            aria-invalid={errors['whereFoundArea'] ? true : undefined}
            aria-describedby={
              errors['whereFoundArea'] ? 'whereFoundArea-describedby' : undefined
            }
            onChange={(event) => {
              set('whereFoundArea', event.target.value);
            }}
          >
            <option value="">{SELECT_LOCATION_PLACEHOLDER}</option>

            {campusAreas.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="responseExactPlace">
            {'Exact place'}
            <span className="field__required" aria-hidden="true">
              {' *'}
            </span>
          </label>

          {errors['exactPlace'] ? (
            <p className="field__error" id="responseExactPlace-describedby">
              {errors['exactPlace']}
            </p>
          ) : null}

          <input
            id="responseExactPlace"
            className="input"
            type="text"
            value={values.exactPlace}
            maxLength={200}
            required
            aria-required="true"
            aria-invalid={errors['exactPlace'] ? true : undefined}
            aria-describedby={
              errors['exactPlace'] ? 'responseExactPlace-describedby' : undefined
            }
            autoComplete="off"
            onChange={(event) => {
              set('exactPlace', event.target.value);
            }}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="observedIdentifyingDetails">
            {OBSERVED_IDENTIFYING_DETAILS_LABEL}
            <span className="field__required" aria-hidden="true">
              {' *'}
            </span>
          </label>

          {errors['observedIdentifyingDetails'] ? (
            <p className="field__error" id="observedIdentifyingDetails-describedby">
              {errors['observedIdentifyingDetails']}
            </p>
          ) : null}

          <textarea
            id="observedIdentifyingDetails"
            className="textarea"
            value={values.observedIdentifyingDetails}
            maxLength={500}
            required
            aria-required="true"
            aria-invalid={errors['observedIdentifyingDetails'] ? true : undefined}
            aria-describedby={
              errors['observedIdentifyingDetails']
                ? 'observedIdentifyingDetails-describedby'
                : undefined
            }
            onChange={(event) => {
              set('observedIdentifyingDetails', event.target.value);
            }}
          />

          <CharacterCounter
            current={Array.from(values.observedIdentifyingDetails).length}
            max={500}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="dateFound">
            {DATE_FOUND_LABEL}
            <span className="field__required" aria-hidden="true">
              {' *'}
            </span>
          </label>

          {errors['dateFound'] ? (
            <p className="field__error" id="dateFound-describedby">
              {errors['dateFound']}
            </p>
          ) : null}

          <input
            id="dateFound"
            className="input"
            type="date"
            value={values.dateFound}
            min={minDate}
            max={maxDate}
            required
            aria-required="true"
            aria-invalid={errors['dateFound'] ? true : undefined}
            aria-describedby={errors['dateFound'] ? 'dateFound-describedby' : undefined}
            onChange={(event) => {
              set('dateFound', event.target.value);
            }}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="candidateImage">
            {CANDIDATE_IMAGE_LABEL}
          </label>

          {/*
            **The helper and the error share one id.** A file that the
            server refuses has to say so *beside the field*, and the
            `aria-describedby` association has to survive the swap — so
            the error text replaces the helper text under the same id,
            exactly as every other field does.
          */}
          {errors['candidateImage'] ? (
            <p className="field__error" id="candidateImage-describedby">
              {errors['candidateImage']}
            </p>
          ) : (
            <p className="field__helper" id="candidateImage-describedby">
              {'JPEG, PNG, or WebP, up to 5 MB.'}
            </p>
          )}

          <input
            id="candidateImage"
            className="input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-invalid={errors['candidateImage'] ? true : undefined}
            aria-describedby="candidateImage-describedby"
          />
        </div>
      </fieldset>

      <p className="button-row">
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? SUBMITTING : SUBMIT_RECOVERY_RESPONSE}
        </button>
      </p>
    </form>
  );
}

/**
 * The recovery response detail's props.
 */
export interface RecoveryResponseDetailSurfaceProps {
  /** The response's id. */
  readonly responseId: string;
  /** The display status — canonical, or `Submitted — Standby`. */
  readonly status: string;
  /** The canonical persisted status. */
  readonly canonicalStatus: string;
  /** Where the item was found. */
  readonly whereFoundArea: string;
  /** The exact place the item was found. */
  readonly exactPlace: string;
  /** The observed identifying details. */
  readonly observedIdentifyingDetails: string;
  /** The date the item was found. */
  readonly dateFound: string;
  /** When the response was submitted. */
  readonly submittedAt: string;
  /**
   * Whether the Response carries a candidate image.
   *
   * **A boolean, not the reference.** The image is served through the
   * authorised route, which authorises server-side immediately before the
   * blob read — so the browser never holds a path, and the surface only
   * needs to know whether to render an `<img>` at all.
   */
  readonly hasCandidateImage: boolean;
  /** The Lost report's id. */
  readonly reportId: string;
  /** The Lost report's name. */
  readonly reportName: string;
  /** Link to the related Lost report detail. */
  readonly reportDetailHref?: string | undefined;
  /** Detail page title override. */
  readonly detailHeading?: string | undefined;
  /** Whether the responder may withdraw the response. */
  readonly withdrawable: boolean;
}

/**
 * The recovery response detail.
 */
export function RecoveryResponseDetailSurface({
  responseId,
  status,
  canonicalStatus,
  whereFoundArea,
  exactPlace,
  observedIdentifyingDetails,
  dateFound,
  submittedAt,
  hasCandidateImage,
  reportId,
  reportName,
  reportDetailHref,
  detailHeading,
  withdrawable,
}: RecoveryResponseDetailSurfaceProps): React.JSX.Element {
  const reportHref = reportDetailHref ?? `/listings/${reportId}`;
  const heading = detailHeading ?? RECOVERY_RESPONSE_DETAIL_HEADING;

  return (
    <article className="recovery-response-detail">
      <header className="detail-section">
        <h1 className="hero__title">{heading}</h1>

        <p className="hero__lede">
          {/*
            **The badge carries the display status,** and the canonical
            status is carried alongside it in the detail list — so the
            `Submitted — Standby` derivation is visible without implying
            that a ninth status exists.
          */}
          <StatusBadge status={status} kind="Response status" />
        </p>
      </header>

      <section className="detail-section">
        <h2 className="detail-section__heading">{'Lost report'}</h2>

        <dl className="detail-list">
          <dt className="detail-list__term">{'Item name'}</dt>
          <dd className="detail-list__value">
            <Link href={reportHref}>{reportName}</Link>
          </dd>
        </dl>
      </section>

      <section className="detail-section">
        <h2 className="detail-section__heading">{'Your response'}</h2>

        <dl className="detail-list">
          <dt className="detail-list__term">{WHERE_FOUND_AREA_LABEL}</dt>
          <dd className="detail-list__value">{whereFoundArea}</dd>

          <dt className="detail-list__term">{'Exact place'}</dt>
          <dd className="detail-list__value">{exactPlace}</dd>

          <dt className="detail-list__term">{OBSERVED_IDENTIFYING_DETAILS_LABEL}</dt>
          <dd className="detail-list__value">{observedIdentifyingDetails}</dd>

          <dt className="detail-list__term">{DATE_FOUND_LABEL}</dt>
          <dd className="detail-list__value tabular">{dateFound}</dd>

          <dt className="detail-list__term">{'Submitted'}</dt>
          <dd className="detail-list__value tabular">{submittedAt}</dd>

          <dt className="detail-list__term">{RECOVERY_RESPONSE_STATUS_LABEL}</dt>
          <dd className="detail-list__value">
            {canonicalStatus}

            {status !== canonicalStatus ? (
              <span className="field__helper">{' (display: ' + status + ')'}</span>
            ) : null}
          </dd>
        </dl>
      </section>

      {hasCandidateImage ? (
        <section className="detail-section">
          <h2 className="detail-section__heading">{'Candidate image'}</h2>

          {/*
            **The image is served through the authorised route,** which
            authorises server-side immediately before the blob read. The URL
            is the route, not the blob's public address — and the route
            refuses a competing responder, so the bytes never reach one.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="detail-image"
            src={`/api/reports/${reportId}/recovery-responses/${responseId}/image`}
            alt={'Candidate image of the found item'}
          />
        </section>
      ) : null}

      {withdrawable ? (
        <section className="detail-section">
          <h2 className="detail-section__heading">{'Actions'}</h2>

          <button type="button" className="button button--danger">
            {'Withdraw'}
          </button>
        </section>
      ) : null}
    </article>
  );
}
