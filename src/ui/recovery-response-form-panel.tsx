'use client';

/**
 * The recovery response form panel — the client half of the RR form.
 *
 * ## The eligibility is the server's
 *
 * §9.6: *"Eligibility: Active member, item is Lost, status is Open or
 * Verification Pending before Match Confirmed, member is not the Lost-report
 * owner."* **That check happens on the server, before the form is served.**
 *
 * ## The submission goes to the API
 *
 * **The response's fields are the domain's,** and the server validates them.
 * The candidate image, when present, is uploaded as multipart — because the
 * blob store's upload path takes bytes.
 *
 * **A successful submission navigates to the response's detail page.**
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { ErrorSummary, useFocusFirstInvalidField } from './form-parts';
import { recoveryResponseClientField } from './recovery-response-field-map';
import {
  RecoveryResponseFormSurface,
  type RecoveryResponseCampusAreaOption,
  type RecoveryResponseFormValues,
} from './recovery-response-surface';

import {
  RECOVERY_RESPONSE_ERROR_SUMMARY_HEADING,
  RECOVERY_RESPONSE_FIELD_ELEMENT_IDS,
  RECOVERY_RESPONSE_FIELD_LABELS,
  SERVER_ERROR_MESSAGE,
} from './member-copy';

/**
 * The recovery response form panel's props.
 */
export interface RecoveryResponseFormPanelProps {
  /** The Lost report's id. */
  readonly reportId: string;
  /** The values the form opens with. */
  readonly initialValues?: RecoveryResponseFormValues | undefined;
  /** The minimum date the native picker accepts. */
  readonly minDate: string;
  /** The maximum date the native picker accepts. */
  readonly maxDate: string;
  /** Campus areas the where-found select may list. */
  readonly campusAreas: readonly RecoveryResponseCampusAreaOption[];
}

/**
 * The empty recovery response form values.
 */
export const EMPTY_RECOVERY_RESPONSE_FORM_VALUES: RecoveryResponseFormValues =
  Object.freeze({
    whereFoundArea: '',
    exactPlace: '',
    observedIdentifyingDetails: '',
    dateFound: '',
  });

/**
 * The recovery response form panel.
 */
export function RecoveryResponseFormPanel({
  reportId,
  initialValues = EMPTY_RECOVERY_RESPONSE_FORM_VALUES,
  minDate,
  maxDate,
  campusAreas,
}: RecoveryResponseFormPanelProps): React.JSX.Element {
  const router = useRouter();

  const [values, setValues] = useState<RecoveryResponseFormValues>(initialValues);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /**
   * Whether the member has attempted a submission.
   *
   * **This is the validate-after-submit gate.** No error state exists
   * before the first submit attempt.
   */
  const [submitted, setSubmitted] = useState(false);

  /**
   * Focus the first invalid field, and scroll it into view.
   *
   * **The ids map bridges the server's field names and the form's element
   * ids** — the server calls the field `exactPlace` and the form's element
   * is `responseExactPlace`.
   */
  useFocusFirstInvalidField(errors, submitted, RECOVERY_RESPONSE_FIELD_ELEMENT_IDS);

  /**
   * Submit the response.
   *
   * **A candidate image makes the request multipart.** The content type is
   * decided by the presence of the image part, not asserted by the client —
   * the server's parser is what distinguishes the two shapes.
   */
  const submit = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    setErrors({});
    setFailure(null);
    // **The submission attempt is what turns the error state on.** The form
    // is validated *after* the submit, never before it.
    setSubmitted(true);

    try {
      const response = await fetch(`/api/reports/${reportId}/recovery-responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          // **The field names are the draft's,** not the form's. The form
          // says "where found area" and "exact place"; the draft says
          // `campusArea` and `whereFoundExactPlace`. The parser reads those
          // names by name, so a body carrying the form's names would be a
          // malformed request.
          campusArea: values.whereFoundArea,
          whereFoundExactPlace: values.exactPlace,
          observedIdentifyingDetails: values.observedIdentifyingDetails,
          dateFound: values.dateFound,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { id?: string };

        router.push(body.id ? `/my/recovery-responses/${body.id}` : '/my/recovery-responses');
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        field?: string;
      };

      if (body.field && body.error) {
        setErrors({ [recoveryResponseClientField(body.field)]: body.error });
      } else {
        setFailure(body.error ?? SERVER_ERROR_MESSAGE);
      }
    } catch {
      setFailure(SERVER_ERROR_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }, [reportId, router, values]);

  /**
   * A change to one field.
   *
   * **The field's error clears the moment the member edits it.** Clearing
   * on the *edit* rather than on a re-validation is what makes it
   * immediate — the member does not have to submit again to see that their
   * correction was accepted.
   *
   * **Only the changed field's error clears.** The others are untouched,
   * because a member may have made one correction and left the rest.
   */
  const change = useCallback((next: RecoveryResponseFormValues): void => {
    setValues(next);

    setErrors((current) => {
      const keys = Object.keys(current);

      if (keys.length === 0) {
        return current;
      }

      const kept: Record<string, string> = {};

      for (const key of keys) {
        const field = key as keyof RecoveryResponseFormValues;

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
        heading={RECOVERY_RESPONSE_ERROR_SUMMARY_HEADING}
        errors={errors}
        labels={RECOVERY_RESPONSE_FIELD_LABELS}
      />

      <RecoveryResponseFormSurface
        values={values}
        onChange={change}
        onSubmit={() => {
          void submit();
        }}
        submitting={submitting}
        errors={errors}
        minDate={minDate}
        maxDate={maxDate}
        campusAreas={campusAreas}
      />
    </>
  );
}
