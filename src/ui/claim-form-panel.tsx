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
 * **A successful submission navigates to the claim's detail page** with
 * `?submitted=1`, so §12.1's confirmation copy is visible on arrival.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { ErrorSummary, useFocusFirstInvalidField } from './form-parts';
import { ClaimFormSurface, type ClaimFormValues } from './claim-form-surface';
import { ParticipationContextCard } from './participation-context-card';
import { ParticipationFormPageShell } from './participation-form-page-shell';

import {
  CLAIM_ERROR_SUMMARY_HEADING,
  CLAIM_FIELD_ELEMENT_IDS,
  CLAIM_FIELD_LABELS,
  CLAIM_FORM_BREADCRUMB,
  CLAIM_FORM_DESCRIPTION,
  CLAIM_FORM_HEADING,
  MEMBER_BROWSE_PAGE_TITLE,
  SERVER_ERROR_MESSAGE,
} from './member-copy';

/**
 * The claim form panel's props.
 */
export interface ClaimFormPanelProps {
  /** The report's id — the Found item the claim is against. */
  readonly reportId: string;
  /** The Found item's name — context card. */
  readonly itemName: string;
  /** Optional meta line (campus area, date). */
  readonly itemMeta?: string | undefined;
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
  itemName,
  itemMeta,
  initialValues = EMPTY_CLAIM_FORM_VALUES,
  minDate,
  maxDate,
}: ClaimFormPanelProps): React.JSX.Element {
  const router = useRouter();

  const [values, setValues] = useState<ClaimFormValues>(initialValues);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useFocusFirstInvalidField(errors, submitted, CLAIM_FIELD_ELEMENT_IDS);

  const submit = useCallback(async (): Promise<void> => {
    setSubmitting(true);
    setErrors({});
    setFailure(null);
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

        router.push(body.id ? `/my/claims/${body.id}?submitted=1` : '/my/claims');
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

        if (next[field] !== values[field]) {
          continue;
        }

        kept[key] = current[key]!;
      }

      return kept;
    });
  }, [values]);

  return (
    <ParticipationFormPageShell
      heading={CLAIM_FORM_HEADING}
      lede={CLAIM_FORM_DESCRIPTION}
      crumbs={[
        { label: MEMBER_BROWSE_PAGE_TITLE, href: '/listings' },
        { label: CLAIM_FORM_BREADCRUMB, href: null },
      ]}
      context={
        <ParticipationContextCard itemName={itemName} reportType="Found" meta={itemMeta} />
      }
    >
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
        onCancel={() => {
          router.push(`/listings/${reportId}`);
        }}
      />
    </ParticipationFormPageShell>
  );
}
