'use client';

/**
 * The administrator's moderation edit — FR-53.
 *
 * ## The editable set is FR-53's, exactly
 *
 * *Report name, category, description, date, location (campus area enum
 * value and exact-place free text), identifying details, and image
 * replacement.* Those seven content fields and the image are the whole
 * set — a reporter's identity, the report's type, and its status are
 * never editable, and the form offers no control that could change them.
 *
 * ## The edit is a partial submission
 *
 * **Only the fields the administrator actually changed are sent.** A
 * moderation edit is usually a correction to one field, and sending the
 * untouched ones would rewrite them — so the form tracks which fields
 * were touched and sends only those.
 *
 * ## The image travels as a form part
 *
 * **A replacement image makes the request multipart.** The route decides
 * its parser by the content type, and the multipart parser exists so the
 * image can travel alongside the text changes. So the form sends JSON
 * when no image was chosen and multipart when one was.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { CANCEL, SUBMIT_REPORT } from './member-copy';
import {
  CATEGORY_LABEL,
  DATE_LABEL,
  DESCRIPTION_LABEL,
  EXACT_PLACE_LABEL,
  IDENTIFYING_DETAILS_LABEL,
  NAME_LABEL,
} from './member-copy';

/**
 * The administrator's edit surface's props.
 */
export interface AdminReportEditSurfaceProps {
  /** The report id being edited. */
  readonly reportId: string;
  /** The report's current values. */
  readonly report: {
    readonly name: string;
    readonly category: string;
    readonly description: string;
    readonly date: string;
    readonly campusArea: string;
    readonly exactPlace: string;
    readonly identifyingDetails: string;
  };
  /** The campus areas the deployment has. */
  readonly campusAreas: readonly { readonly value: string; readonly label: string }[];
  /** Where the browser goes once the edit is saved. */
  readonly afterHref: string;
}

/** The fields the form can send. */
const EDITABLE_FIELDS = [
  'name',
  'category',
  'description',
  'date',
  'campusArea',
  'exactPlace',
  'identifyingDetails',
] as const;

/**
 * The administrator's moderation edit surface.
 */
export function AdminReportEditSurface({
  reportId,
  report,
  campusAreas,
  afterHref,
}: AdminReportEditSurfaceProps): React.JSX.Element {
  const router = useRouter();

  const [values, setValues] = useState({ ...report });
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const [image, setImage] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Record a change and mark the field as touched.
   *
   * **Only a touched field is sent.** The form sends the changes, not the
   * report.
   */
  function change(field: string, value: string): void {
    setValues((current) => ({ ...current, [field]: value }));
    setTouched((current) => new Set(current).add(field));
  }

  /**
   * Send the edit.
   */
  async function save(): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const changes: Record<string, string> = {};

      for (const field of EDITABLE_FIELDS) {
        if (touched.has(field)) {
          changes[field] = values[field];
        }
      }

      const response =
        image === null
          ? await fetch(`/api/admin/reports/${reportId}/edit`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...csrfHeaders(),
              },
              body: JSON.stringify(changes),
            })
          : await sendMultipart(reportId, changes, image);

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
      <h1 className="hero__title">Edit report</h1>

      {formError ? (
        <div className="error-summary" role="alert" tabIndex={-1} id="error-summary">
          <h2 className="error-summary__heading">Check the form</h2>
          <ul className="error-summary__list">
            <li>{formError}</li>
          </ul>
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="adminName">
          {NAME_LABEL}
        </label>
        <input
          id="adminName"
          name="name"
          className="input"
          type="text"
          value={values.name}
          onChange={(event) => change('name', event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="adminCategory">
          {CATEGORY_LABEL}
        </label>
        <input
          id="adminCategory"
          name="category"
          className="input"
          type="text"
          value={values.category}
          onChange={(event) => change('category', event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="adminDescription">
          {DESCRIPTION_LABEL}
        </label>
        <textarea
          id="adminDescription"
          name="description"
          className="input"
          rows={4}
          value={values.description}
          onChange={(event) => change('description', event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="adminDate">
          {DATE_LABEL}
        </label>
        <input
          id="adminDate"
          name="date"
          className="input"
          type="date"
          value={values.date}
          onChange={(event) => change('date', event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="adminCampusArea">
          Campus area
        </label>
        <select
          id="adminCampusArea"
          name="campusArea"
          className="input"
          value={values.campusArea}
          onChange={(event) => change('campusArea', event.target.value)}
        >
          {campusAreas.map((area) => (
            <option key={area.value} value={area.value}>
              {area.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="adminExactPlace">
          {EXACT_PLACE_LABEL}
        </label>
        <input
          id="adminExactPlace"
          name="exactPlace"
          className="input"
          type="text"
          value={values.exactPlace}
          onChange={(event) => change('exactPlace', event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="adminIdentifyingDetails">
          {IDENTIFYING_DETAILS_LABEL}
        </label>
        <textarea
          id="adminIdentifyingDetails"
          name="identifyingDetails"
          className="input"
          rows={3}
          value={values.identifyingDetails}
          onChange={(event) => change('identifyingDetails', event.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="adminImage">
          Replace image
        </label>
        <input
          id="adminImage"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setImage(event.target.files?.[0] ?? null)}
        />
      </div>

      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={submitting}
          onClick={() => void save()}
        >
          {SUBMIT_REPORT}
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

/**
 * Send the edit as multipart, because a replacement image rides with it.
 */
async function sendMultipart(
  reportId: string,
  changes: Readonly<Record<string, string>>,
  image: File,
): Promise<Response> {
  const form = new FormData();

  for (const [field, value] of Object.entries(changes)) {
    form.set(field, value);
  }

  form.set('image', image);

  return fetch(`/api/admin/reports/${reportId}/edit`, {
    method: 'PATCH',
    headers: { ...csrfHeaders() },
    body: form,
  });
}
