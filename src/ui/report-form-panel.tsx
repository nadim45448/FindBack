'use client';

/**
 * The report form panel — the client half of the report form.
 *
 * ## The form is a client surface because it is a submission
 *
 * **The type is fixed by the URL,** and the route has already decided it —
 * so this component receives the type and never renders a control for it.
 * §10.1: *"No toggling between Lost and Found on the same form."*
 *
 * ## The submission goes to the API, and the server is authoritative
 *
 * **The server owns the date bounds, the campus-area membership, and the
 * field lengths.** The bounds are also carried on the native date input, so
 * the browser refuses what the server would refuse — but the server's
 * verdict is the one that counts, and its per-field errors are rendered
 * back into the form.
 *
 * **The image is uploaded as multipart when present,** because the blob
 * store's upload path takes bytes. The content type is decided by the
 * presence of an image part, not by the client.
 *
 * ## A successful submission navigates to the new report
 *
 * The create route answers with the report's `id` and nothing else — no
 * stored field — so the client navigates to the detail page and lets the
 * server re-read the report through the FR-39 projection. The client never
 * renders a stored field it was not given.
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { ErrorSummary, useFocusFirstInvalidField } from './form-parts';
import {
  ReportFormSurface,
  type ReportFormCampusAreaOption,
  type ReportFormValues,
} from './report-form-surface';

import {
  REPORT_ERROR_SUMMARY_HEADING,
  REPORT_DATE_FOUND_LABEL,
  REPORT_DATE_LOST_LABEL,
  REPORT_FIELD_LABELS,
  SERVER_ERROR_MESSAGE,
} from './member-copy';

/**
 * The report form panel's props.
 */
export interface ReportFormPanelProps {
  /** The report type — fixed by the URL the form was opened at. */
  readonly type: 'Lost' | 'Found';
  /** The values the form opens with. */
  readonly initialValues: ReportFormValues;
  /** The categories available. */
  readonly categories: readonly string[];
  /** The campus areas available. */
  readonly campusAreas: readonly ReportFormCampusAreaOption[];
  /** The minimum date the native picker accepts. */
  readonly minDate: string;
  /** The maximum date the native picker accepts. */
  readonly maxDate: string;
  /** Whether this is an edit of an existing report. */
  readonly editing?: boolean | undefined;
  /** The report's id, when this is an edit. */
  readonly reportId?: string | undefined;
}

/**
 * The empty form values.
 */
export const EMPTY_REPORT_FORM_VALUES: ReportFormValues = Object.freeze({
  name: '',
  category: '',
  description: '',
  date: '',
  campusArea: '',
  exactPlace: '',
  identifyingDetails: '',
});

/**
 * The report form panel.
 */
export function ReportFormPanel({
  type,
  initialValues,
  categories,
  campusAreas,
  minDate,
  maxDate,
  editing = false,
  reportId,
}: ReportFormPanelProps): React.JSX.Element {
  const router = useRouter();

  // **Empty strings are omitted from RSC props,** so a server-side spread of
  // `EMPTY_REPORT_FORM_VALUES` does not reach the client — merge here instead.
  const [values, setValues] = useState<ReportFormValues>(() => ({
    ...EMPTY_REPORT_FORM_VALUES,
    ...initialValues,
  }));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Whether the member has attempted a submission.
   *
   * **This is the validate-after-submit gate.** No error state exists
   * before the first submit attempt — the form renders clean, with no
   * `aria-invalid`, no red border, and no error text — so the errors are
   * only *shown* once this is true.
   */
  const [submitted, setSubmitted] = useState(false);

  /**
   * Focus the first invalid field, and scroll it into view.
   *
   * **The hook owns the movement,** so the panel does not compute which
   * field is first, and a second surface cannot compute it differently.
   */
  useFocusFirstInvalidField(errors, submitted);

  const fieldLabels = useMemo(
    () =>
      Object.freeze({
        ...REPORT_FIELD_LABELS,
        date: type === 'Lost' ? REPORT_DATE_LOST_LABEL : REPORT_DATE_FOUND_LABEL,
      }),
    [type],
  );

  /**
   * Submit the form.
   *
   * **A create goes to `POST /api/reports`; an edit goes to
   * `PATCH /api/reports/[id]/edit`.** The two are different operations with
   * different endpoints, and the panel is told which it is.
   */
  const submit = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    setErrors({});
    setFailure(null);
    // **The submission attempt is what turns the error state on.** The form
    // is validated *after* the submit, never before it.
    setSubmitted(true);

    try {
      const response = editing
        ? await fetch(`/api/reports/${reportId ?? ''}/edit`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
            body: JSON.stringify(toEditBody(values)),
          })
        : await postCreateReport(values, type, imageFile);

      if (response.ok) {
        const body = (await response.json()) as { id?: string };

        router.push(body.id ? `/my/reports/${body.id}` : '/my/reports');
        return;
      }

      // **The server's per-field errors come back to the form.** A field
      // rule failure identifies the offending field, so the message is
      // rendered beside that field rather than as a page-level banner.
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        field?: string;
      };

      if (body.field && body.error) {
        setErrors({ [body.field]: body.error });
      } else {
        setFailure(body.error ?? SERVER_ERROR_MESSAGE);
      }
    } catch {
      setFailure(SERVER_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }, [editing, imageFile, reportId, router, type, values]);

  /**
   * A change to one field.
   *
   * **The field's error clears the moment the member edits it.** The
   * criterion is explicit: *"When a field becomes valid again, its error
   * state, icon, `aria-invalid`, and `aria-describedby` clear
   * immediately."* Clearing on the *edit* rather than on a re-validation
   * is what makes it immediate — the member does not have to submit again
   * to see that their correction was accepted.
   *
   * **Only the changed field's error clears.** The others are untouched,
   * because a member may have made one correction and left the rest.
   */
  const change = useCallback((next: ReportFormValues): void => {
    setValues(next);

    setErrors((current) => {
      const keys = Object.keys(current);

      if (keys.length === 0) {
        return current;
      }

      const kept: Record<string, string> = {};

      for (const key of keys) {
        const field = key as keyof ReportFormValues;

        // **The error goes when the value it was about has changed.**
        if (next[field] !== values[field]) {
          continue;
        }

        kept[key] = current[key]!;
      }

      return kept;
    });
  }, [values]);

  return (
    <>
      {failure ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{failure}</p>
        </div>
      ) : null}

      <ErrorSummary
        heading={REPORT_ERROR_SUMMARY_HEADING}
        errors={errors}
        labels={fieldLabels}
      />

      <ReportFormSurface
        type={type}
        values={values}
        onChange={change}
        onSubmit={() => {
          void submit();
        }}
        submitting={submitting}
        errors={errors}
        editing={editing}
        categories={categories}
        campusAreas={campusAreas}
        minDate={minDate}
        maxDate={maxDate}
        onCancel={() => {
          router.push(editing && reportId ? `/my/reports/${reportId}` : '/home');
        }}
        onImageChange={(file) => {
          setImageFile(file);

          if (file) {
            const rejection = validateReportImageFile(file);

            if (rejection) {
              setErrors((current) => ({ ...current, image: rejection }));
              return;
            }
          }

          setErrors((current) => {
            if (!('image' in current)) {
              return current;
            }

            const { image: _removed, ...rest } = current;

            return rest;
          });
        }}
      />
    </>
  );
}

/**
 * The create request's body.
 *
 * **The type is included, and the server re-checks it against the URL.**
 * §10.1 encodes the type in the URL, and the body carrying it does not
 * give the member a second way to choose — the server decides which type
 * the form was opened at.
 */
const REPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const REPORT_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function validateReportImageFile(file: File): string | null {
  if (!REPORT_IMAGE_TYPES.has(file.type)) {
    return 'That image type is not accepted. Use a JPEG, PNG, or WebP image.';
  }

  if (file.size > REPORT_IMAGE_MAX_BYTES) {
    return 'That image is larger than 5 MB.';
  }

  return null;
}

async function postCreateReport(
  values: ReportFormValues,
  type: 'Lost' | 'Found',
  imageFile: File | null,
): Promise<Response> {
  const fields = toCreateBody(values, type);

  if (imageFile && imageFile.size > 0) {
    const form = new FormData();

    for (const [key, value] of Object.entries(fields)) {
      form.set(key, value);
    }

    form.set('image', imageFile);

    return fetch('/api/reports', {
      method: 'POST',
      headers: { ...csrfHeaders() },
      body: form,
    });
  }

  return fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
    body: JSON.stringify(fields),
  });
}

function toCreateBody(
  values: ReportFormValues,
  type: 'Lost' | 'Found',
): Record<string, string> {
  return {
    type,
    name: values.name,
    category: values.category,
    description: values.description,
    date: values.date,
    campusArea: values.campusArea,
    exactPlace: values.exactPlace,
    identifyingDetails: values.identifyingDetails,
  };
}

/**
 * The edit request's body.
 *
 * **The type is not included.** An edit changes fields, not the report's
 * type — §10.1's type decision is made at creation and never toggled.
 */
function toEditBody(values: ReportFormValues): Record<string, string> {
  return {
    name: values.name,
    category: values.category,
    description: values.description,
    date: values.date,
    campusArea: values.campusArea,
    exactPlace: values.exactPlace,
    identifyingDetails: values.identifyingDetails,
  };
}
