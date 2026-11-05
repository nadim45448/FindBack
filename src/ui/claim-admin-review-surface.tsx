'use client';

/**
 * Administrator claim review, approve, and reject — BMAD mockups 06 / 08.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AdminAuditTrailSurface, type AuditTrailRow } from './admin-audit-trail-surface';
import { Breadcrumbs } from './breadcrumbs';
import { csrfHeaders } from './csrf';
import { StatusBadge } from './status-badge';
import {
  CLAIM_APPROVE_CONFIRM,
  CLAIM_APPROVE_HEADING,
  CLAIM_APPROVE_INFO_HEADING,
  ADMIN_CLAIM_ACTION_FAILED,
  CLAIM_APPROVE_THIS,
  CLAIM_DECISION_CONFLICT_HEADING,
  CLAIM_DECISION_FORM_ERROR_HEADING,
  CLAIM_BREADCRUMB_QUEUE,
  CLAIM_COMPETING_NONE,
  CLAIM_REJECT_CONFIRM,
  CLAIM_REJECT_HEADING,
  CLAIM_REJECT_REASON_HELP,
  CLAIM_REJECT_REASON_LABEL,
  CLAIM_REJECT_REASON_PLACEHOLDER,
  CLAIM_REJECT_REASON_REQUIRED,
  CLAIM_REJECT_REASON_TOO_LONG,
  CLAIM_REJECT_REASON_TOO_SHORT,
  CLAIM_REJECT_THIS,
  CLAIM_REVIEW_HEADING,
  CLAIM_REVIEW_ITEM_PHOTO,
  VERIFICATION_BACK_TO_QUEUE,
} from './admin-copy';
import { CANCEL } from './member-copy';

export type ClaimAdminMode = 'review' | 'approve' | 'reject';

export interface ClaimAdminReviewSurfaceProps {
  readonly mode: ClaimAdminMode;
  readonly claimId: string;
  readonly reportId: string;
  readonly hasItemImage: boolean;
  readonly claimStatus: string;
  readonly claimantDisplayName: string;
  readonly claimantEmail: string;
  readonly reason: string;
  readonly identifyingDetails: string;
  readonly dateLost: string;
  readonly submittedAtLabel: string;
  readonly itemName: string;
  readonly itemCategory: string;
  readonly itemDate: string;
  readonly itemCampusArea: string;
  readonly competingClaimCount: number;
  readonly decisionAvailable: boolean;
  readonly afterHref: string;
  readonly auditHref: string;
  readonly auditTrail: {
    readonly rows: readonly AuditTrailRow[];
    readonly hasMore: boolean;
    readonly error?: string | undefined;
  };
}

export function ClaimAdminReviewSurface({
  mode,
  claimId,
  reportId,
  hasItemImage,
  claimStatus,
  claimantDisplayName,
  claimantEmail,
  reason,
  identifyingDetails,
  dateLost,
  submittedAtLabel,
  itemName,
  itemCategory,
  itemDate,
  itemCampusArea,
  competingClaimCount,
  decisionAvailable,
  afterHref,
  auditHref,
  auditTrail,
}: ClaimAdminReviewSurfaceProps): React.JSX.Element {
  const router = useRouter();
  const baseHref = `/admin/claims/${claimId}`;
  const approveEndpoint = `/api/admin/claims/${claimId}/approve`;
  const rejectEndpoint = `/api/admin/claims/${claimId}/reject`;

  const [rejectReason, setRejectReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formConflict, setFormConflict] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function postApprove(): Promise<void> {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormConflict(false);

    try {
      const response = await fetch(approveEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setFormConflict(response.status === 409);
        setFormError(payload.error ?? ADMIN_CLAIM_ACTION_FAILED);
        setSubmitting(false);

        return;
      }

      router.push(afterHref);
      router.refresh();
    } catch {
      setFormError(ADMIN_CLAIM_ACTION_FAILED);
      setSubmitting(false);
    }
  }

  async function postReject(): Promise<void> {
    if (submitting) {
      return;
    }

    const trimmed = rejectReason.trim();

    if (trimmed.length === 0) {
      setReasonError(CLAIM_REJECT_REASON_REQUIRED);

      return;
    }

    if (trimmed.length < 10) {
      setReasonError(CLAIM_REJECT_REASON_TOO_SHORT);

      return;
    }

    if (trimmed.length > 500) {
      setReasonError(CLAIM_REJECT_REASON_TOO_LONG);

      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFormConflict(false);
    setReasonError(null);

    try {
      const response = await fetch(rejectEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({ reason: trimmed }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setFormConflict(response.status === 409);
        setFormError(payload.error ?? ADMIN_CLAIM_ACTION_FAILED);
        setSubmitting(false);

        return;
      }

      router.push(afterHref);
      router.refresh();
    } catch {
      setFormError(ADMIN_CLAIM_ACTION_FAILED);
      setSubmitting(false);
    }
  }

  const summaryLine = (
    <>
      <strong>{claimantDisplayName}</strong> claiming <strong>{itemName}</strong> (
      <span className="registration-review__email">{claimId}</span>)
    </>
  );

  if (mode === 'approve') {
    return (
      <div className="admin-console claim-admin-review claim-admin-review--decision">
        <Breadcrumbs
          variant="compact"
          crumbs={[
            { label: CLAIM_BREADCRUMB_QUEUE, href: afterHref },
            { label: 'Approve', href: null },
          ]}
        />

        <h1 className="hero__title">{CLAIM_APPROVE_HEADING}</h1>

        {formError ? <DecisionError message={formError} conflict={formConflict} /> : null}

        <div className="card registration-review__card">{summaryLine}</div>

        <div className="banner banner--success claim-admin-review__approve-info" role="status">
          <div>
            <p className="banner__heading">{CLAIM_APPROVE_INFO_HEADING}</p>
            <ul className="registration-review__info-list">
              <li>
                Change the claimant&apos;s claim to <strong>Approved</strong>
              </li>
              <li>
                Move the item to status <strong>Claim Approved</strong>
              </li>
              <li>
                Send an approval email to <strong>{claimantEmail}</strong>
              </li>
              <li>Record the approval in the audit trail</li>
              {competingClaimCount > 0 ? (
                <li>
                  <strong>Auto-reject</strong> {competingClaimCount} other pending claim
                  {competingClaimCount === 1 ? '' : 's'} on this item
                </li>
              ) : null}
            </ul>
            {competingClaimCount === 0 ? (
              <p className="claim-admin-review__no-compete">
                <em>No competing claims to auto-reject.</em>
              </p>
            ) : null}
          </div>
        </div>

        <div className="form-actions">
          <Link href={baseHref} className="button button--tertiary">
            {CANCEL}
          </Link>

          <button
            type="button"
            className="button button--success"
            disabled={submitting || !decisionAvailable}
            onClick={() => void postApprove()}
          >
            {CLAIM_APPROVE_CONFIRM}
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'reject') {
    return (
      <div className="admin-console claim-admin-review claim-admin-review--decision">
        <Breadcrumbs
          variant="compact"
          crumbs={[
            { label: 'Review claim', href: baseHref },
            { label: 'Reject', href: null },
          ]}
        />

        <h1 className="hero__title">{CLAIM_REJECT_HEADING}</h1>

        {formError ? <DecisionError message={formError} conflict={formConflict} /> : null}

        <div className="card registration-review__card">{summaryLine}</div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void postReject();
          }}
        >
          <div className="field">
            <label className="field__label" htmlFor="claimRejectReason">
              {CLAIM_REJECT_REASON_LABEL}{' '}
              <span className="field__required" aria-hidden="true">
                *
              </span>
            </label>

            {reasonError ? (
              <p className="field__error" id="claimRejectReason-describedby">
                {reasonError}
              </p>
            ) : (
              <p className="field__helper" id="claimRejectReason-describedby">
                {CLAIM_REJECT_REASON_HELP}
              </p>
            )}

            <textarea
              id="claimRejectReason"
              name="reason"
              className="input"
              rows={4}
              required
              minLength={10}
              maxLength={500}
              value={rejectReason}
              placeholder={CLAIM_REJECT_REASON_PLACEHOLDER}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby="claimRejectReason-describedby"
              disabled={!decisionAvailable}
              onChange={(event) => {
                setRejectReason(event.target.value);

                if (reasonError !== null && event.target.value.trim().length >= 10) {
                  setReasonError(null);
                }
              }}
            />
          </div>

          <div className="form-actions">
            <Link href={baseHref} className="button button--tertiary">
              {CANCEL}
            </Link>

            <button type="submit" className="button button--danger" disabled={submitting || !decisionAvailable}>
              {CLAIM_REJECT_CONFIRM}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const itemMeta = `${itemCategory} · ${itemDate} · ${itemCampusArea}`;

  return (
    <div className="admin-console claim-admin-review">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: CLAIM_BREADCRUMB_QUEUE, href: afterHref },
          { label: `Claim on "${itemName}"`, href: null },
        ]}
      />

      <div className="claim-admin-review__head verification-admin-review__head">
        <div className="verification-admin-review__title-row">
          <h1 className="hero__title">{CLAIM_REVIEW_HEADING}</h1>
          <StatusBadge status={claimStatus} />
        </div>

        <div className="admin-confirm-return__head-actions">
          <Link href={afterHref} className="button button--secondary button--sm">
            {VERIFICATION_BACK_TO_QUEUE}
          </Link>
        </div>
      </div>

      {competingClaimCount > 0 ? (
        <div className="banner claim-admin-review__competing" role="status">
          <div>
            <p className="banner__heading">
              {competingClaimCount} other pending claim{competingClaimCount === 1 ? '' : 's'} on this
              item.
            </p>
            <p>
              Approving this claim will move the item to <strong>Claim Approved</strong> and
              automatically reject the other{competingClaimCount === 1 ? '' : 's'}.
            </p>
          </div>
        </div>
      ) : (
        <div className="banner banner--info" role="status">
          <p>{CLAIM_COMPETING_NONE}</p>
        </div>
      )}

      <div className="claim-admin-review__layout claim-admin-review__layout--with-audit">
        <section className="card claim-admin-review__summary">
          <h2 className="claim-admin-review__summary-title">{itemName}</h2>
          <p className="claim-admin-review__summary-meta">{itemMeta}</p>

          {hasItemImage ? (
            <figure className="claim-admin-review__photo">
              <div className="detail-image-frame detail-image-frame--filled claim-admin-review__photo-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="detail-image"
                  src={`/api/reports/${reportId}/image`}
                  alt={`Photo of ${itemName}`}
                />
              </div>
              <figcaption className="claim-admin-review__photo-caption">
                {CLAIM_REVIEW_ITEM_PHOTO}
              </figcaption>
            </figure>
          ) : null}
        </section>

        <section className="card claim-admin-review__main">
          <h2 className="claim-admin-review__section-title">This claim</h2>

          <dl className="registration-review__details claim-admin-review__claim-grid">
            <Detail label="Claimant" value={claimantDisplayName} strong />
            <Detail label="Email" value={claimantEmail} code />
            <Detail label="Submitted" value={submittedAtLabel} />
            <Detail label="Date lost (claimant says)" value={dateLost} />
            <Detail label="Reason" value={reason} wide />
            <Detail label="Identifying details" value={identifyingDetails} wide />
          </dl>

          {decisionAvailable ? (
            <div className="form-actions claim-admin-review__decision-actions">
              <Link href={`${baseHref}?decision=reject`} className="button button--danger">
                {CLAIM_REJECT_THIS}
              </Link>

              <Link href={`${baseHref}?decision=approve`} className="button button--success">
                {CLAIM_APPROVE_THIS}
              </Link>
            </div>
          ) : null}
        </section>

        <div className="claim-admin-review__audit">
          <AdminAuditTrailSurface
            variant="embedded"
            rows={auditTrail.rows}
            hasMore={auditTrail.hasMore}
            error={auditTrail.error}
            fullTrailHref={auditHref}
            parentLabel={itemName}
          />
        </div>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  strong,
  code,
  wide,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
  readonly code?: boolean;
  readonly wide?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={
        wide
          ? 'registration-review__detail claim-admin-review__detail--wide'
          : 'registration-review__detail'
      }
    >
      <dt className="field__label">{label}</dt>
      <dd>
        {code ? (
          <code className="registration-review__email">{value}</code>
        ) : strong ? (
          <strong>{value}</strong>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function DecisionError({
  message,
  conflict = false,
}: {
  readonly message: string;
  readonly conflict?: boolean;
}): React.JSX.Element {
  return (
    <div className="error-summary" role="alert" tabIndex={-1}>
      <h2 className="error-summary__heading">
        {conflict ? CLAIM_DECISION_CONFLICT_HEADING : CLAIM_DECISION_FORM_ERROR_HEADING}
      </h2>
      <ul className="error-summary__list">
        <li>{message}</li>
      </ul>
    </div>
  );
}
