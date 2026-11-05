'use client';

/**
 * The administrator's Lost-side verification surface — mockup 15.
 *
 * FR-45: the Lost report's **owner** determines match; the administrator
 * **records** the determination on this screen.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  CONFIRM_RETURNED,
  LOST_RETURN_SUBSTITUTE_LINK,
  VERIFICATION_ACTIONS_HELP,
  VERIFICATION_ACTIONS_SECTION,
  VERIFICATION_BACK_TO_QUEUE,
  VERIFICATION_BREADCRUMB_QUEUE,
  VERIFICATION_MATCH_CONFIRM_MODAL,
  VERIFICATION_MATCH_CONFIRMED_LEDE,
  VERIFICATION_NO_RESPONSES,
  VERIFICATION_NO_SELECTED,
  VERIFICATION_NOT_MATCH_MODAL,
  VERIFICATION_RECORD_MATCH,
  VERIFICATION_RECORD_NOT_MATCH,
  VERIFICATION_REVIEW_HEADING,
  VERIFICATION_SELECTED_RESPONSE_SECTION,
  VIEW_AUDIT_TRAIL,
} from './admin-copy';
import { Breadcrumbs } from './breadcrumbs';
import { ConfirmationDialog } from './confirmation-dialog';
import { csrfHeaders } from './csrf';
import { LOST_REPORT_AWAITING_RETURN_STATUS } from '@/domain/listings';

import {
  AdminAuditTrailSurface,
  type AuditTrailRow,
} from './admin-audit-trail-surface';
import { StatusBadge } from './status-badge';
import { CANDIDATE_IMAGE_LABEL } from './member-copy';

/**
 * One candidate, as the administrator sees it.
 */
export interface VerificationCandidate {
  readonly responseId: string;
  readonly status: string;
  readonly campusArea: string;
  readonly exactPlace: string;
  readonly observedIdentifyingDetails: string;
  readonly dateFound: string;
  readonly submittedAt: string;
  readonly submittedAtLabel: string;
  /** True when a candidate image was uploaded and the viewer may request it. */
  readonly hasCandidateImage: boolean;
}

/** Lost report summary for the left column. */
export interface VerificationReportSummary {
  readonly name: string;
  readonly category: string;
  readonly campusArea: string;
  readonly dateLabel: string;
  readonly ownerDisplayName: string;
  readonly verificationStartedLabel: string | null;
}

/**
 * The verification surface's props.
 */
export interface AdminVerificationSurfaceProps {
  readonly reportId: string;
  readonly determinedByUserId: string;
  readonly summary: VerificationReportSummary;
  readonly candidates: readonly VerificationCandidate[];
  readonly afterHref: string;
  /** Contextual audit trail for this Lost report (§17.1). */
  readonly auditHref: string;
  /** The report's audit events (first page), loaded on the server. */
  readonly auditTrail: {
    readonly rows: readonly AuditTrailRow[];
    readonly hasMore: boolean;
    readonly error?: string | undefined;
  };
}

function activeCandidate(
  candidates: readonly VerificationCandidate[],
): VerificationCandidate | null {
  return (
    candidates.find((candidate) => candidate.status === 'Selected for Verification') ??
    candidates.find((candidate) => candidate.status === 'Match Confirmed') ??
    null
  );
}

function displayResponseStatus(
  status: string,
  hasOtherSelected: boolean,
): string {
  if (status === 'Submitted' && hasOtherSelected) {
    return 'Submitted — Standby';
  }

  return status;
}

/**
 * The administrator's Lost-side verification surface.
 */
export function AdminVerificationSurface({
  reportId,
  determinedByUserId,
  summary,
  candidates,
  afterHref,
  auditHref,
  auditTrail,
}: AdminVerificationSurfaceProps): React.JSX.Element {
  const router = useRouter();

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState<'match' | 'not_match' | null>(null);

  const returnHref = `/admin/lost/${reportId}/return`;

  const focus = useMemo(() => activeCandidate(candidates), [candidates]);

  const matchConfirmed = useMemo(
    () => candidates.some((candidate) => candidate.status === 'Match Confirmed'),
    [candidates],
  );

  const hasSelectedForVerification = candidates.some(
    (candidate) =>
      candidate.status === 'Selected for Verification' ||
      candidate.status === 'Match Confirmed',
  );

  const canDetermine = focus?.status === 'Selected for Verification';

  async function confirmReturned(): Promise<void> {
    if (!matchConfirmed || submitting) {
      return;
    }

    setSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch(`/api/admin/reports/${reportId}/confirm-returned`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders(),
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        setFormError(payload.error ?? 'Something went wrong on our side. Try again.');
        setSubmitting(false);

        return;
      }

      router.push(`${auditHref}?from=return`);
      router.refresh();
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  async function determine(outcome: 'match_confirmed' | 'not_a_match'): Promise<void> {
    if (submitting || focus === null || !canDetermine) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setConfirming(null);

    try {
      const response = await fetch(
        `/api/admin/reports/${reportId}/recovery-responses/${focus.responseId}/determine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...csrfHeaders(),
          },
          body: JSON.stringify({ outcome, determinedByUserId }),
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        setFormError(payload.error ?? 'Something went wrong on our side. Try again.');
        setSubmitting(false);

        return;
      }

      if (outcome === 'not_a_match') {
        router.push(afterHref);
      }

      router.refresh();
      setSubmitting(false);
    } catch {
      setFormError('Something went wrong on our side. Try again, or come back in a moment.');
      setSubmitting(false);
    }
  }

  const whereFound =
    focus && (focus.campusArea || focus.exactPlace)
      ? [focus.campusArea, focus.exactPlace].filter(Boolean).join(' — ')
      : null;

  return (
    <div className="admin-console verification-admin-review">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: VERIFICATION_BREADCRUMB_QUEUE, href: afterHref },
          { label: summary.name, href: null },
        ]}
      />

      <div className="claim-admin-review__head verification-admin-review__head">
        <div className="verification-admin-review__title-row">
          <h1 className="hero__title">{VERIFICATION_REVIEW_HEADING}</h1>
          <StatusBadge
            status={matchConfirmed ? LOST_REPORT_AWAITING_RETURN_STATUS : 'Verification Pending'}
          />
        </div>

        <div className="admin-confirm-return__head-actions">
          <Link href={auditHref} className="button button--tertiary button--sm">
            {VIEW_AUDIT_TRAIL}
          </Link>

          <Link href={afterHref} className="button button--secondary button--sm">
            {VERIFICATION_BACK_TO_QUEUE}
          </Link>
        </div>
      </div>

      {matchConfirmed ? (
        <div className="banner banner--info" role="status">
          <p>{VERIFICATION_MATCH_CONFIRMED_LEDE}</p>
        </div>
      ) : null}

      {formError ? (
        <div className="error-summary" role="alert" tabIndex={-1}>
          <h2 className="error-summary__heading">Check the form</h2>
          <ul className="error-summary__list">
            <li>{formError}</li>
          </ul>
        </div>
      ) : null}

      <div className="verification-admin-review__layout">
        <section className="card verification-admin-review__summary">
          <h2 className="verification-admin-review__card-title">{summary.name}</h2>

          <p className="verification-admin-review__meta">
            {summary.category} · {summary.dateLabel} · {summary.campusArea}
          </p>

          <p>
            <StatusBadge
              status={
                matchConfirmed ? LOST_REPORT_AWAITING_RETURN_STATUS : 'Verification Pending'
              }
            />
          </p>

          <p className="verification-admin-review__meta">
            {'Owner '}
            <strong>{summary.ownerDisplayName}</strong>
            {summary.verificationStartedLabel ? (
              <>
                {' · Verification started '}
                {summary.verificationStartedLabel}
              </>
            ) : null}
          </p>

          {focus ? (
            <>
              <hr className="verification-admin-review__divider" />

              <h3 className="verification-admin-review__card-subtitle">
                {VERIFICATION_SELECTED_RESPONSE_SECTION}
              </h3>

              <dl className="registration-review__details verification-admin-review__details">
                <Detail label="Status" value={<StatusBadge status={focus.status} />} />
                {whereFound ? <Detail label="Where found" value={whereFound} /> : null}
                {focus.dateFound ? <Detail label="Date found" value={focus.dateFound} /> : null}
                {focus.observedIdentifyingDetails ? (
                  <Detail
                    label="Observed identifying details"
                    value={focus.observedIdentifyingDetails}
                  />
                ) : null}
              </dl>

              {focus.hasCandidateImage ? (
                <div className="verification-admin-review__image">
                  <p className="field__label">{CANDIDATE_IMAGE_LABEL}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="detail-image"
                    src={`/api/reports/${reportId}/recovery-responses/${focus.responseId}/image`}
                    alt={'Candidate image of the found item'}
                  />
                </div>
              ) : null}
            </>
          ) : hasSelectedForVerification ? null : (
            <p className="verification-admin-review__meta">{VERIFICATION_NO_SELECTED}</p>
          )}
        </section>

        <section className="card verification-admin-review__main">
          {candidates.length === 0 ? (
            <p className="verification-admin-review__meta">{VERIFICATION_NO_RESPONSES}</p>
          ) : (
            <div className="verification-admin-review__table-wrap">
              <table className="member-data-table verification-admin-review__table">
                <thead>
                  <tr>
                    <th scope="col">Status</th>
                    <th scope="col">Where found</th>
                    <th scope="col">Submitted</th>
                  </tr>
                </thead>

                <tbody>
                  {candidates.map((candidate) => {
                    const isFocus = focus?.responseId === candidate.responseId;
                    const location = [candidate.campusArea, candidate.exactPlace]
                      .filter(Boolean)
                      .join(' — ');

                    return (
                      <tr
                        key={candidate.responseId}
                        className={
                          isFocus
                            ? 'member-data-table__row verification-admin-review__row--focus'
                            : 'member-data-table__row'
                        }
                      >
                        <td data-label="Status">
                          <StatusBadge
                            status={displayResponseStatus(
                              candidate.status,
                              hasSelectedForVerification,
                            )}
                          />
                        </td>

                        <td data-label="Where found">{location || '—'}</td>

                        <td data-label="Submitted">{candidate.submittedAtLabel}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {focus ? (
            <>
              <hr className="verification-admin-review__divider" />

              <h3 className="verification-admin-review__card-subtitle">
                {VERIFICATION_ACTIONS_SECTION}
              </h3>

              <p className="verification-admin-review__meta">{VERIFICATION_ACTIONS_HELP}</p>

              {canDetermine ? (
                <div className="button-row verification-admin-review__action-buttons">
                  <button
                    type="button"
                    className="button button--primary button--sm"
                    disabled={submitting}
                    onClick={() => setConfirming('match')}
                  >
                    {VERIFICATION_RECORD_MATCH}
                  </button>

                  <button
                    type="button"
                    className="button button--danger button--sm"
                    disabled={submitting}
                    onClick={() => setConfirming('not_match')}
                  >
                    {VERIFICATION_RECORD_NOT_MATCH}
                  </button>
                </div>
              ) : null}

              {matchConfirmed ? (
                <div className="button-row verification-admin-review__action-buttons">
                  <button
                    type="button"
                    className="button button--primary button--sm"
                    disabled={submitting}
                    onClick={() => void confirmReturned()}
                  >
                    {CONFIRM_RETURNED}
                  </button>

                  <Link className="button button--tertiary button--sm" href={returnHref}>
                    {LOST_RETURN_SUBSTITUTE_LINK}
                  </Link>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      <AdminAuditTrailSurface
        variant="embedded"
        rows={auditTrail.rows}
        hasMore={auditTrail.hasMore}
        error={auditTrail.error}
        fullTrailHref={auditHref}
        parentLabel={summary.name}
      />

      {confirming === 'match' ? (
        <ConfirmationDialog
          heading={VERIFICATION_RECORD_MATCH}
          body={VERIFICATION_MATCH_CONFIRM_MODAL}
          confirmLabel={VERIFICATION_RECORD_MATCH}
          onConfirm={() => void determine('match_confirmed')}
          onCancel={() => setConfirming(null)}
        />
      ) : null}

      {confirming === 'not_match' ? (
        <ConfirmationDialog
          heading={VERIFICATION_RECORD_NOT_MATCH}
          body={VERIFICATION_NOT_MATCH_MODAL}
          confirmLabel={VERIFICATION_RECORD_NOT_MATCH}
          confirmClassName="button button--danger"
          onConfirm={() => void determine('not_a_match')}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="registration-review__detail">
      <dt className="field__label">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
