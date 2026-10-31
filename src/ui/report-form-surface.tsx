'use client';

/**
 * The report form — §10.1, §10.2, §10.3.
 *
 * ## The type is fixed by the URL, and the form has no switch
 *
 * §10.1: *"The 'Lost' or 'Found' decision is encoded in the URL
 * (`/report/lost` vs `/report/found`). The form opens with the type
 * already chosen — the user does not need to pick it."* and *"No toggling
 * between Lost and Found on the same form."*
 *
 * So this form receives its type as a prop and **renders no type control
 * at all**. The type is in the heading, in the date bound, and in the
 * field copy — and nowhere in an input.
 *
 * ## The form is a single-purpose page with two cards
 *
 * §10.2: the required-fields card (Name, Category, Description, Date,
 * Campus area), the optional-fields card (Exact place, Identifying
 * details, Image), and the footer with `Cancel` and `Submit report`.
 *
 * ## The two date bounds differ
 *
 * §10.3: *"Date (Lost): last 365 days, not future"*; *"Date (Found): last
 * 30 days, not future"*. The bound is the only difference between the two
 * forms, and it is **passed in** rather than derived here — so the date
 * validator is the domain's, and this surface only supplies the range the
 * native date input enforces.
 *
 * ## The `Sensitive` fields say so, inline
 *
 * §10.2: *"A **Sensitive** flag appears inline next to fields that are
 * hidden from non-owners: 'This is hidden from other members.'"* So the
 * marker sits beside the label, with the helper beneath it.
 *
 * Purely a rendering surface — the field's value, its error, and its
 * validity are the caller's.
 */

import { useCallback } from 'react';

import { CharacterCounter } from './character-counter';
import { NativeDateField } from './native-date-field';

import {
  CANCEL,
  CATEGORY_LABEL,
  DESCRIPTION_LABEL,
  EXACT_PLACE_LABEL,
  IDENTIFYING_DETAILS_LABEL,
  IMAGE_LABEL,
  ITEM_NAME_LABEL,
  REPORT_DESCRIPTION_PLACEHOLDER,
  REPORT_EXACT_PLACE_HELPER,
  REPORT_FOUND_EXACT_PLACE_PLACEHOLDER,
  REPORT_FOUND_IDENTIFYING_PLACEHOLDER,
  REPORT_FOUND_NAME_PLACEHOLDER,
  REPORT_DATE_FOUND_HELPER,
  REPORT_DATE_FOUND_LABEL,
  REPORT_DATE_LOST_HELPER,
  REPORT_DATE_LOST_LABEL,
  REPORT_IMAGE_HELPER,
  REPORT_LOCATION_LABEL,
  REPORT_LOST_EXACT_PLACE_PLACEHOLDER,
  REPORT_LOST_IDENTIFYING_PLACEHOLDER,
  REPORT_LOST_NAME_PLACEHOLDER,
  SELECT_CATEGORY_PLACEHOLDER,
  SELECT_LOCATION_PLACEHOLDER,
  SENSITIVE_LABEL,
  SUBMIT_REPORT,
  SUBMITTING,
} from './member-copy';

/** A campus area option in the location select. */
export interface ReportFormCampusAreaOption {
  readonly value: string;
  readonly label: string;
}

/**
 * The report form's values.
 *
 * **The shape is the form's, not the domain's** — the domain's value
 * objects are built by the server. The surface carries strings.
 */
export interface ReportFormValues {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly date: string;
  readonly campusArea: string;
  readonly exactPlace: string;
  readonly identifyingDetails: string;
}

/**
 * The report form's props.
 */
export interface ReportFormSurfaceProps {
  /** The report type — fixed by the URL the form was opened at. */
  readonly type: 'Lost' | 'Found';
  /** The current values. */
  readonly values: ReportFormValues;
  /** The change handler. */
  readonly onChange: (values: ReportFormValues) => void;
  /** The submit handler. */
  readonly onSubmit: () => void;
  /** Whether a submission is in flight. */
  readonly submitting: boolean;
  /** The field errors, keyed by field name. */
  readonly errors?: Readonly<Record<string, string>> | undefined;
  /** Whether this is an edit of an existing report. */
  readonly editing?: boolean | undefined;
  /** The categories available. */
  readonly categories: readonly string[];
  /** The campus areas available. */
  readonly campusAreas: readonly ReportFormCampusAreaOption[];
  /** The minimum date the native picker accepts. */
  readonly minDate: string;
  /** The maximum date the native picker accepts. */
  readonly maxDate: string;
  /** Leave the form without submitting. */
  readonly onCancel?: (() => void) | undefined;
  /** Called when the member picks or clears an optional image. */
  readonly onImageChange?: ((file: File | null) => void) | undefined;
}

/**
 * The report form.
 */
export function ReportFormSurface({
  type,
  values,
  onChange,
  onSubmit,
  submitting,
  errors = {},
  editing = false,
  categories,
  campusAreas,
  minDate,
  maxDate,
  onCancel,
  onImageChange,
}: ReportFormSurfaceProps): React.JSX.Element {
  const isLost = type === 'Lost';

  const set = useCallback(
    (key: keyof ReportFormValues, value: string): void => {
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
      // and the scroll to the first error would never happen. The
      // criterion is about *our* error presentation, so the browser's
      // silent blocking is exactly what has to be turned off. The
      // `required` attributes stay: they are the programmatic meaning,
      // and they still stop an assistive technology from letting the
      // member leave a field empty without knowing it is required.
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor="name">
          {ITEM_NAME_LABEL}
          <span className="field__required" aria-hidden="true">
            {' *'}
          </span>
        </label>

        {errors['name'] ? (
          <p className="field__error" id="name-describedby">
            {errors['name']}
          </p>
        ) : null}

        <input
          id="name"
          className="input"
          type="text"
          value={values.name}
          maxLength={80}
          placeholder={isLost ? REPORT_LOST_NAME_PLACEHOLDER : REPORT_FOUND_NAME_PLACEHOLDER}
          required
          aria-required="true"
          aria-invalid={errors['name'] ? true : undefined}
          aria-describedby={errors['name'] ? 'name-describedby' : undefined}
          autoComplete="off"
          onChange={(event) => {
            set('name', event.target.value);
          }}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="category">
          {CATEGORY_LABEL}
          <span className="field__required" aria-hidden="true">
            {' *'}
          </span>
        </label>

        {errors['category'] ? (
          <p className="field__error" id="category-describedby">
            {errors['category']}
          </p>
        ) : null}

        <select
          id="category"
          className="select"
          value={values.category}
          required
          aria-required="true"
          aria-invalid={errors['category'] ? true : undefined}
          aria-describedby={errors['category'] ? 'category-describedby' : undefined}
          onChange={(event) => {
            set('category', event.target.value);
          }}
        >
          <option value="">{SELECT_CATEGORY_PLACEHOLDER}</option>

          {categories.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="description">
          {DESCRIPTION_LABEL}
          <span className="field__required" aria-hidden="true">
            {' *'}
          </span>
        </label>

        {errors['description'] ? (
          <p className="field__error" id="description-describedby">
            {errors['description']}
          </p>
        ) : null}

        <textarea
          id="description"
          className="textarea"
          value={values.description}
          maxLength={2000}
          placeholder={REPORT_DESCRIPTION_PLACEHOLDER}
          required
          aria-required="true"
          aria-invalid={errors['description'] ? true : undefined}
          aria-describedby={errors['description'] ? 'description-describedby' : undefined}
          onChange={(event) => {
            set('description', event.target.value);
          }}
        />

        <CharacterCounter
          current={Array.from(values.description ?? '').length}
          max={2000}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="date">
          {isLost ? REPORT_DATE_LOST_LABEL : REPORT_DATE_FOUND_LABEL}
          <span className="field__required" aria-hidden="true">
            {' *'}
          </span>
        </label>

        {errors['date'] ? (
          <p className="field__error" id="date-error">
            {errors['date']}
          </p>
        ) : null}

        <NativeDateField
          id="date"
          className="input input--date"
          value={values.date}
          min={minDate}
          max={maxDate}
          required
          aria-required="true"
          aria-invalid={errors['date'] ? true : undefined}
          aria-describedby={errors['date'] ? 'date-error date-helper' : 'date-helper'}
          onChange={(value) => {
            set('date', value);
          }}
        />

        <p className="field__helper" id="date-helper">
          {isLost ? REPORT_DATE_LOST_HELPER : REPORT_DATE_FOUND_HELPER}
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="campusArea">
          {REPORT_LOCATION_LABEL}
          <span className="field__required" aria-hidden="true">
            {' *'}
          </span>
        </label>

        {errors['campusArea'] ? (
          <p className="field__error" id="campusArea-describedby">
            {errors['campusArea']}
          </p>
        ) : null}

        <select
          id="campusArea"
          className="select"
          value={values.campusArea}
          required
          aria-required="true"
          aria-invalid={errors['campusArea'] ? true : undefined}
          aria-describedby={errors['campusArea'] ? 'campusArea-describedby' : undefined}
          onChange={(event) => {
            set('campusArea', event.target.value);
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
        <label className="field__label" htmlFor="exactPlace">
          {EXACT_PLACE_LABEL}{' '}
          <span className="sensitive-flag sensitive-flag--inline">{SENSITIVE_LABEL}</span>
        </label>

        {errors['exactPlace'] ? (
          <p className="field__error" id="exactPlace-describedby">
            {errors['exactPlace']}
          </p>
        ) : (
          <p className="field__helper" id="exactPlace-describedby">
            {REPORT_EXACT_PLACE_HELPER}
          </p>
        )}

        <input
          id="exactPlace"
          className="input"
          type="text"
          value={values.exactPlace}
          maxLength={200}
          placeholder={
            isLost ? REPORT_LOST_EXACT_PLACE_PLACEHOLDER : REPORT_FOUND_EXACT_PLACE_PLACEHOLDER
          }
          aria-invalid={errors['exactPlace'] ? true : undefined}
          aria-describedby="exactPlace-describedby"
          autoComplete="off"
          onChange={(event) => {
            set('exactPlace', event.target.value);
          }}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="identifyingDetails">
          {IDENTIFYING_DETAILS_LABEL}{' '}
          <span className="sensitive-flag sensitive-flag--inline">{SENSITIVE_LABEL}</span>
        </label>

        {errors['identifyingDetails'] ? (
          <p className="field__error" id="identifyingDetails-describedby">
            {errors['identifyingDetails']}
          </p>
        ) : null}

        <textarea
          id="identifyingDetails"
          className="textarea"
          value={values.identifyingDetails}
          maxLength={500}
          placeholder={
            isLost
              ? REPORT_LOST_IDENTIFYING_PLACEHOLDER
              : REPORT_FOUND_IDENTIFYING_PLACEHOLDER
          }
          aria-invalid={errors['identifyingDetails'] ? true : undefined}
          aria-describedby={
            errors['identifyingDetails'] ? 'identifyingDetails-describedby' : undefined
          }
          onChange={(event) => {
            set('identifyingDetails', event.target.value);
          }}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="image">
          {IMAGE_LABEL}
        </label>

        {errors['image'] ? (
          <p className="field__error" id="image-describedby">
            {errors['image']}
          </p>
        ) : (
          <p className="field__helper" id="image-describedby">
            {REPORT_IMAGE_HELPER}
          </p>
        )}

        <input
          id="image"
          className="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={errors['image'] ? true : undefined}
          aria-describedby="image-describedby"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            onImageChange?.(file);
          }}
        />
      </div>

      <p className="report-form__actions button-row">
        <button type="button" className="button button--tertiary" onClick={onCancel}>
          {CANCEL}
        </button>

        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? SUBMITTING : SUBMIT_REPORT}
        </button>
      </p>

      {editing ? <p className="field__helper">{'Editing an existing report.'}</p> : null}
    </form>
  );
}

/**
 * The live character counter.
 *
 * **`aria-live="polite"`,** and the warning foreground at 90 % of the
 * maximum — story 005's criterion. The implementation is shared with the
 * thread composer and the claim form, so the threshold is one rule.
 */
export { CharacterCounter } from './character-counter';
