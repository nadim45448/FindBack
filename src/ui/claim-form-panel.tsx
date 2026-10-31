'use client';

/**
 * The claim form panel — the client half of the claim form.
 *
 * ## The eligibility is the server's
 *
 * §12.1: the form is served only for a Found item that is `Open` or
 * `Claim Requested` and has no Pending Claim from this member. **That check
 * happens on the server, before the form is served** — the client does not
 * re-evaluate it, for the same reason the detail surface does not
 * re-evaluate visibility.
 *
 * ## The submission goes to the API
 *
 * **The claim's fields are the domain's**, and the server validates them.
 * The native constraints on the inputs mirror the server's bounds, so the
 * browser refuses what the server would refuse — but the server's verdict
 * is the one that counts.
 *
 * **A successful submission navigates to the claim's detail page,** where
 * the claim and its thread are read by the server.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { ErrorSummary, useFocusFirstInvalidField } from './form-parts';
import { ClaimFormSurface, type ClaimFormValues } from './claim-form-surface';

import {
  CLAIM_ERROR_SUMMARY_HEADING,
  CLAIM_FIELD_ELEMENT_IDS,
  CLAIM_FIELD_LABELS,
  SERVER_ERROR_MESSAGE,
} from './member-copy';

/**
 * The claim form panel's props.
 */
export interface ClaimFormPanelProps {
  /** The report's id — the Found item the claim is against. */
  readonly reportId: string;
  /** The values the form opens with. */
  readonly initialValues?: ClaimFormValues | undefined;
  /** The minimum date the native picker accepts. */
  readonly minDate: string;
  /** The maximum date the native picker accepts. */
  readonly maxDate: string;
}

/**
 * The empty claim form values.
 */
export const EMPTY_CLAIM_FORM_VALUES: ClaimFormValues = Object.freeze({
  reason: '',
  identifyingDetails: '',
  dateLost: '',
});

/**
 * The claim form panel.
 */
export function ClaimFormPanel({
  reportId,
  initialValues = EMPTY_CLAIM_FORM_VALUES,
  minDate,
  maxDate,
}: ClaimFormPanelProps): React.JSX.Element {
  const router = useRouter();

  const [values, setValues] = useState<ClaimFormValues>(initialValues);
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
   * ids** — the server calls the field `identifyingDetails` and the form's
   * element is `claimIdentifyingDetails`.
   */
  useFocusFirstInvalidField(errors, submitted, CLAIM_FIELD_ELEMENT_IDS);

  /**
   * Submit the claim.
   */
  const submit = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    setErrors({});
    setFailure(null);
    // **The submission attempt is what turns the error state on.** The form
    // is validated *after* the submit, never before it.
    setSubmitted(true);

    try {
      const response = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          reportId,
          reason: values.reason,
          identifyingDetails: values.identifyingDetails,
          dateLost: values.dateLost,
        }),
      });

      if (response.ok) {
        const body = (await response.json()) as { id?: string };

        router.push(body.id ? `/my/claims/${body.id}` : '/my/claims');
        return;
      }

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
  const change = useCallback((next: ClaimFormValues): void => {
    setValues(next);

    setErrors((current) => {
      const keys = Object.keys(current);

      if (keys.length === 0) {
        return current;
      }

      const kept: Record<string, string> = {};

      for (const key of keys) {
        const field = key as keyof ClaimFormValues;

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
        heading={CLAIM_ERROR_SUMMARY_HEADING}
        errors={errors}
        labels={CLAIM_FIELD_LABELS}
      />

      <ClaimFormSurface
        values={values}
        onChange={change}
        onSubmit={() => {
          void submit();
        }}
        submitting={submitting}
        errors={errors}
        minDate={minDate}
        maxDate={maxDate}
      />
    </>
  );
}
