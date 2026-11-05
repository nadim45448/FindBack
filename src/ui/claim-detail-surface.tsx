'use client';

/**
 * The claim detail — §12.2, mockup `13-claim-detail`.
 */

import Link from 'next/link';

import { Breadcrumbs } from './breadcrumbs';
import {
  CLAIM_AUTO_REJECTED_BANNER,
  CLAIM_DATE_LOST_SECTION,
  CLAIM_DETAIL_BREADCRUMB_QUEUE,
  CLAIM_IDENTIFYING_DETAILS_SECTION,
  CLAIM_PENDING_BANNER_BODY,
  CLAIM_PENDING_BANNER_HEADING,
  CLAIM_REASON_SECTION,
  CLAIM_REJECTED_AUTO_BADGE,
  CLAIM_STATUS_HELPERS,
  CLAIM_SUBMITTED_BANNER_HEADING,
  CLAIM_SUBMITTED_BODY,
  CLAIM_SUBMITTED_LABEL,
  VIEW_FOUND_ITEM,
} from './member-copy';
import { StatusBadge } from './status-badge';

/**
 * The claim detail's props.
 */
export interface ClaimDetailSurfaceProps {
  readonly claimId: string;
  readonly status: string;
  readonly reason: string;
  readonly identifyingDetails: string;
  readonly dateLost: string;
  readonly submittedAt: string;
  readonly reportId: string;
  readonly reportName: string;
  readonly autoRejected: boolean;
  /** Whether the member just submitted this claim (§12.1 confirmation). */
  readonly justSubmitted?: boolean | undefined;
}

export function ClaimDetailSurface({
  claimId,
  status,
  reason,
  identifyingDetails,
  dateLost,
  submittedAt,
  reportId,
  reportName,
  autoRejected,
  justSubmitted = false,
}: ClaimDetailSurfaceProps): React.JSX.Element {
  const badgeStatus = autoRejected ? CLAIM_REJECTED_AUTO_BADGE : status;

  return (
    <article className="claim-detail">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: CLAIM_DETAIL_BREADCRUMB_QUEUE, href: '/my/claims' },
          { label: `${reportName} — thread`, href: null },
        ]}
      />

      <header className="claim-detail__header">
        <div>
          <h1 className="hero__title claim-detail__title">{`Claim on "${reportName}"`}</h1>

          <p className="field__helper tabular">
            {claimId} · {reportId}
          </p>
        </div>

        <StatusBadge status={badgeStatus} kind="Claim status" />
      </header>

      {justSubmitted ? (
        <div className="banner banner--success" role="status">
          <p className="banner__heading">{CLAIM_SUBMITTED_BANNER_HEADING}</p>
          <p>{CLAIM_SUBMITTED_BODY}</p>
          <p>{CLAIM_PENDING_BANNER_BODY}</p>
        </div>
      ) : null}

      {autoRejected ? (
        <div className="banner banner--info" role="status">
          <p className="banner__heading">{CLAIM_AUTO_REJECTED_BANNER}</p>
        </div>
      ) : null}

      {!autoRejected && !justSubmitted && status === 'Pending' ? (
        <div className="banner banner--info" role="status">
          <p className="banner__heading">{CLAIM_PENDING_BANNER_HEADING}</p>
          <p>{CLAIM_PENDING_BANNER_BODY}</p>
        </div>
      ) : null}

      {!autoRejected && status === 'Approved' ? (
        <div className="banner banner--success" role="status">
          <p>{CLAIM_STATUS_HELPERS.Approved}</p>
        </div>
      ) : null}

      {!autoRejected && status === 'Rejected' ? (
        <div className="banner banner--info" role="status">
          <p>{CLAIM_STATUS_HELPERS.Rejected}</p>
        </div>
      ) : null}

      <section className="detail-section detail-section--card">
        <h2 className="detail-section__heading">{'Your claim'}</h2>

        <dl className="detail-list">
          <dt className="detail-list__term">{CLAIM_REASON_SECTION}</dt>
          <dd className="detail-list__value">{reason}</dd>

          <dt className="detail-list__term">{CLAIM_IDENTIFYING_DETAILS_SECTION}</dt>
          <dd className="detail-list__value">{identifyingDetails}</dd>

          <dt className="detail-list__term">{CLAIM_DATE_LOST_SECTION}</dt>
          <dd className="detail-list__value tabular">{dateLost}</dd>

          <dt className="detail-list__term">{CLAIM_SUBMITTED_LABEL}</dt>
          <dd className="detail-list__value tabular">{submittedAt}</dd>
        </dl>

        <p className="claim-detail__nav">
          <Link className="button button--secondary" href={`/listings/${reportId}`}>
            {VIEW_FOUND_ITEM}
          </Link>
        </p>
      </section>
    </article>
  );
}
