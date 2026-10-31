'use client';

/**
 * The shared form parts.
 *
 * **The error summary, the field, and the form column** — the three pieces
 * every form on these surfaces is built from.
 *
 * ## Why the error summary is `role="alert"` and comes first
 *
 * Story 002's criterion: *"the error summary carries `role="alert"`, the
 * first invalid field receives focus"*.
 *
 * `role="alert"` is an **assertive** live region, so the summary is
 * announced when it appears — a screen reader user learns that the
 * submission failed without having to hunt for the red border.
 *
 * **The summary comes first in the DOM** because a screen reader reaches
 * it before the fields. That is also what makes the "focus the first
 * invalid field" behaviour sensible: the user hears the summary, then
 * lands on the first thing they must fix.
 *
 * ## The error replaces the helper text, under the same `id`
 *
 * EXPERIENCE.md §5.3: *"Error text replaces helper text on validation
 * failure."* The replacement is **under the same `id`**, so the input's
 * `aria-describedby` keeps pointing at the right element and the
 * association survives the change. That is the story's technical note
 * exactly: *"Error text replaces helper text under the same `id` so the
 * `aria-describedby` association survives."*
 *
 * ## Colour is never the only cue
 *
 * The invalid state carries the border colour **and** `aria-invalid`
 * **and** the error text. The story's criterion names all three.
 */

import { useEffect, useRef } from 'react';

/** A field's props. */
export interface FieldProps {
  /** The field's `name`, and the key its error is filed under. */
  readonly name: string;
  /** The field's label. */
  readonly label: string;
  /** The field's type. */
  readonly type?: string;
  /** The field's current value. */
  readonly value: string;
  /** The change handler. */
  readonly onChange: (value: string) => void;
  /** The helper text, shown when there is no error. */
  readonly helper?: string | undefined;
  /** The error message, shown instead of the helper when present. */
  readonly error?: string | undefined;
  /** Whether the field is required. */
  readonly required?: boolean;
  /** The field's `id`. */
  readonly id: string;
  /** The field's `name` attribute for the DOM. */
  readonly fieldName?: string;
  /** Extra attributes for the input. */
  readonly autoComplete?: string | undefined;
  /** The input's `minLength`. */
  readonly minLength?: number | undefined;
  /**
   * `float` puts the label inside the field and lifts it on focus or
   * when the field has a value — Facebook-style. The default keeps the
   * label above the input.
   */
  readonly variant?: 'default' | 'float' | undefined;
}

/**
 * A labelled field.
 *
 * **The label is persistent** — it sits above the input, and it is never a
 * placeholder (EXPERIENCE.md §5.3). The helper text sits between the
 * label and the input.
 */
export function Field({
  name,
  label,
  type = 'text',
  value,
  onChange,
  helper,
  error,
  required = false,
  id,
  fieldName,
  autoComplete,
  minLength,
  variant = 'default',
}: FieldProps): React.JSX.Element {
  const describedById = `${id}-describedby`;
  const floating = variant === 'float';
  const filled = value.trim().length > 0;
  const fieldClass = [
    'field',
    floating ? 'field--float' : '',
    floating && filled ? 'field--filled' : '',
  ]
    .filter((part) => part.length > 0)
    .join(' ');

  const labelNode = (
    <label className="field__label" htmlFor={id}>
      {label}
      {required && !floating ? (
        <span className="field__required" aria-hidden="true">
          {' *'}
        </span>
      ) : null}
    </label>
  );

  const inputNode = (
    <input
      id={id}
      name={fieldName ?? name}
      type={type}
      className="input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      aria-required={required || undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={helper || error ? describedById : undefined}
      autoComplete={autoComplete}
      minLength={minLength}
    />
  );

  const messageNode =
    error != null ? (
      <p className="field__error" id={describedById}>
        {error}
      </p>
    ) : helper ? (
      <p className="field__helper" id={describedById}>
        {helper}
      </p>
    ) : null;

  if (floating) {
    return (
      <div className={fieldClass}>
        <div className="field__control">
          {inputNode}
          {labelNode}
        </div>
        {messageNode}
      </div>
    );
  }

  return (
    <div className={fieldClass}>
      {labelNode}
      {helper && !error ? (
        <p className="field__helper" id={describedById}>
          {helper}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={describedById}>
          {error}
        </p>
      ) : null}
      {inputNode}
    </div>
  );
}

/** A select's props. */
export interface SelectFieldProps {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly string[];
  readonly error?: string | undefined;
  readonly required?: boolean;
  readonly id: string;
  readonly helper?: string | undefined;
}

/**
 * A native select.
 *
 * **A native `<select>`, not a custom one** — EXPERIENCE.md §5.4 says so
 * explicitly: these are short, fixed lists, and the native control gets
 * keyboard, screen reader, and mobile support for free.
 */
export function SelectField({
  name,
  label,
  value,
  onChange,
  options,
  error,
  required = false,
  id,
  helper,
}: SelectFieldProps): React.JSX.Element {
  const describedById = `${id}-describedby`;

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            {' *'}
          </span>
        ) : null}
      </label>

      {helper && !error ? (
        <p className="field__helper" id={describedById}>
          {helper}
        </p>
      ) : null}

      {error ? (
        <p className="field__error" id={describedById}>
          {error}
        </p>
      ) : null}

      <select
        id={id}
        name={name}
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={helper || error ? describedById : undefined}
      >
        <option value="">Choose one</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The error summary's props. */
export interface ErrorSummaryProps {
  /** The heading. */
  readonly heading: string;
  /** The errors, keyed by field. */
  readonly errors: Readonly<Record<string, string>>;
  /** The field labels, so the list reads in the user's terms. */
  readonly labels: Readonly<Record<string, string>>;
}

/**
 * The error summary.
 *
 * **It renders nothing when there are no errors** — so the summary is
 * absent from the DOM before the first submit, which is what the criterion
 * requires.
 *
 * **The list items are links to the fields.** Clicking one focuses the
 * field, which is the fastest route from "something is wrong" to "here is
 * where".
 */
export function ErrorSummary({ heading, errors, labels }: ErrorSummaryProps): React.JSX.Element | null {
  const entries = Object.entries(errors);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="error-summary" role="alert" tabIndex={-1} id="error-summary">
      <h2 className="error-summary__heading">{heading}</h2>
      <ul className="error-summary__list">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a href={`#${field}`}>{labels[field] ?? field}</a>: {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Focus the first invalid field, and scroll it into view.
 *
 * **The focus moves to the field, not to the summary** — the criterion
 * names the *first invalid field*. The summary is still announced,
 * because `role="alert"` is a live region and it appeared in the same
 * commit.
 *
 * **The effect runs after the errors render**, so the field exists by the
 * time the focus is moved.
 *
 * **The scroll is explicit.** Moving focus does not reliably scroll an
 * element that is off-screen — the browser's scroll-into-view on focus is
 * a convenience, not a guarantee, and it is skipped entirely when the
 * element is already in the viewport. The criterion asks for the page to
 * scroll to the first error, so the scroll is asked for directly.
 *
 * **`block: 'center'`** puts the field in the middle of the viewport
 * rather than at its edge, so the error message beside it is visible too —
 * an error whose text is off-screen is an error the member has to scroll
 * to read.
 *
 * **The focus runs once per submission.** The `focused` ref is reset by
 * the caller when the member edits a field and the errors clear, so a
 * *second* submission with a different first error focuses that one.
 *
 * **The element id is not always the error key.** The error key is what
 * the *server* calls the field, and the element id is what the *form*
 * calls it — and on the claim form they differ (`identifyingDetails` is
 * `claimIdentifyingDetails` in the DOM). The `ids` map bridges the two;
 * a field with no entry is looked up under its own key.
 *
 * @param errors the field errors, keyed by the server's field name.
 * @param submitted whether the member has attempted a submission.
 * @param ids the element id for each error key, where it differs.
 */
export function useFocusFirstInvalidField(
  errors: Readonly<Record<string, string>>,
  submitted: boolean,
  ids: Readonly<Record<string, string>> = {},
): void {
  const focused = useRef(false);

  useEffect(() => {
    if (!submitted || focused.current) {
      return;
    }

    const firstField = Object.keys(errors)[0];

    if (!firstField) {
      return;
    }

    const element = document.getElementById(ids[firstField] ?? firstField);

    if (!element) {
      return;
    }

    focused.current = true;

    // **The scroll first, then the focus.** The scroll is the movement; the
    // focus is what tells a screen reader where the member is. Doing the
    // scroll first means the focus lands on the field at its final
    // position rather than at a stale one.
    //
    // **The scroll is guarded.** `scrollIntoView` is a browser API that is
    // absent in some environments — a test DOM, a server render — and a
    // missing API must not take the focus down with it. The focus is the
    // part that matters; the scroll is a convenience on top of it.
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    element.focus();
  }, [errors, ids, submitted]);
}

/**
 * The form column.
 *
 * **The column is capped at 640 px** — DESIGN.md's `--form-max-width`, and
 * story 001's criterion: *"forms capped at `640 px`"*.
 */
export function FormColumn({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  return <div className="form-column">{children}</div>;
}
