'use client';

/**
 * The administrator's decision surfaces.
 *
 * ## Why these pages exist
 *
 * **The four operational queues are routing surfaces.** §15.2–§15.5 each
 * end with an *action* column, and §5.7 says every row action *"is a link
 * or button that reaches the specific work item"*. So the queue row links
 * to a work item — the registration review, the claim review, the
 * hand-off, the Lost-side verification — and **that work item is a page
 * with the decision on it**.
 *
 * The decision endpoints have always existed. What was missing was the
 * page that reaches them, which left the queue's action link pointing at
 * a route that was not there. This module is that page's client half.
 *
 * ## The decision is the server's
 *
 * **This component sends the intent and renders the answer.** It never
 * decides whether a registration is approved or a claim is rejected — it
 * sends `decision: 'approve'` and renders what came back. The domain owns
 * the rule; this owns the click.
 *
 * ## A refusal is rendered, not swallowed
 *
 * A decision can be refused for a reason the administrator can act on: a
 * stale page (the item was already decided), a rule the administrator
 * does not hold, a validation failure. Each of those comes back as a
 * status and a message, and the message is rendered **as the server
 * wrote it** — the same rule the member-side forms follow.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { CANCEL } from './member-copy';
import {
  APPROVE,
  REJECT,
  REJECTION_REASON_HINT,
  REJECTION_REASON_LABEL,
  REJECTION_REASON_TOO_SHORT,
} from './admin-copy';

/**
 * The administrator decision surface's props.
 */
export interface AdminDecisionSurfaceProps {
  /** The endpoint the decision is posted to. */
  readonly endpoint: string;
  /** The heading above the decision. */
  readonly heading: string;
  /** The decision's label on the affirmative button. */
  readonly approveLabel?: string | undefined;
  /** The decision's label on the negative button. */
  readonly rejectLabel?: string | undefined;
  /** Whether a rejection reason is required. */
  readonly requiresReason?: boolean | undefined;
  /** The body sent alongside the decision. */
  readonly body?: Readonly<Record<string, unknown>> | undefined;
  /** Where the browser goes once the decision is recorded. */
  readonly afterHref: string;
  /** The detail lines shown above the decision. */
  readonly details?: readonly { readonly label: string; readonly value: string }[] | undefined;
}

/**
 * The administrator decision surface.
 */
export function AdminDecisionSurface({
  endpoint,
  heading,
  approveLabel = APPROVE,
  rejectLabel = REJECT,
  requiresReason = false,
  body,
  afterHref,
  details,
}: AdminDecisionSurfaceProps): React.JSX.Element {
  const router = useRouter();

  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * Send one decision.
   *
   * **The reason is included only when the decision needs one.** A
   * rejection with no reason is a malformed request on the registration
   * route, and an empty reason on a claim rejection is refused too — so
   * the reason rides along with a rejection and not with an approval.
   */
  async function decide(decision: 'approve' | 'reject'): Promise<void> {
    if (submitting) {
      return;
    }

    // **The reason's minimum is checked before the request is sent.** The
    // server refuses a reason under five characters, and a refusal the
    // administrator typed is worth catching here — but the server's rule
    // is still the rule; this is the same bound, shown in the field.
    if (decision === 'reject' && requiresReason && reason.trim().length < 5) {
      setReasonError(REJECTION_REASON_TOO_SHORT);
      setSubmitting(false);

      return;
    }

    setSubmitting(true);
    setFormError(null);
    setReasonError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({
          decision,
          ...(decision === 'reject' && reason.trim().length > 0 ? { reason: reason.trim() } : {}),
          ...(body ?? {}),
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        // **The server's message, rendered as given.** The surface does not
        // reword the domain's decision about *why* the decision was
        // refused.
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

      {details && details.length > 0 ? (
        <dl className="detail-list">
          {details.map((detail) => (
            <div key={detail.label} className="detail-list__row">
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {formError ? (
        <div className="error-summary" role="alert" tabIndex={-1} id="error-summary">
          <h2 className="error-summary__heading">Check the form</h2>
          <ul className="error-summary__list">
            <li>{formError}</li>
          </ul>
        </div>
      ) : null}

      {requiresReason ? (
        <div className="field">
          <label className="field__label" htmlFor="adminReason">
            {REJECTION_REASON_LABEL}
          </label>

          {/*
            **The helper and the error share one id.** The error replaces
            the helper beneath the same element id, so the
            `aria-describedby` association survives the moment the error
            appears — which is the moment it matters most.
          */}
          {reasonError ? (
            <p className="field__error" id="adminReason-describedby">
              {reasonError}
            </p>
          ) : (
            <p className="field__helper" id="adminReason-describedby">
              {REJECTION_REASON_HINT}
            </p>
          )}

          <textarea
            id="adminReason"
            name="reason"
            className="input"
            rows={3}
            value={reason}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby="adminReason-describedby"
            onChange={(event) => {
              setReason(event.target.value);

              // **The error clears the moment the value becomes valid.**
              if (reasonError !== null && event.target.value.trim().length >= 5) {
                setReasonError(null);
              }
            }}
          />
        </div>
      ) : null}

      <div className="button-row">
        <button
          type="button"
          className="button button--primary"
          disabled={submitting}
          onClick={() => void decide('approve')}
        >
          {approveLabel}
        </button>

        <button
          type="button"
          className="button button--tertiary"
          disabled={submitting}
          onClick={() => void decide('reject')}
        >
          {rejectLabel}
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
