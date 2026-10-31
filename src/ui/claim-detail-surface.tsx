'use client';

/**
 * The claim detail — §12.2.
 *
 * ## The header, the body, the thread
 *
 * §12.2: *"Header: claim ID, item name (link to the Found report), status
 * badge. Body: claim reason, identifying details, date lost, submission
 * timestamp. Below: per-Claim message thread."*
 *
 * **The item name links to the Found report** — the member may want to
 * look at the item again — and the thread sits below the body.
 *
 * ## The auto-rejection banner
 *
 * §4.4: *"On the rejected claim detail screen. A neutral banner: 'Your
 * claim was not approved because another claim on this item was approved.
 * If you think this is a mistake, contact your administrator.'"*
 *
 * The banner appears **only for an auto-rejected claim** — a Claim the
 * administrator rejected carries its own reason, and §4.3's copy for that
 * is *"Your claim was not approved. {Reason}"*.
 *
 * ## The `Rejected — auto` badge
 *
 * §12.7's table: an auto-rejected Claim's badge text is `Rejected — auto`,
 * distinct from an administrator-rejected Claim's `Rejected`. **The badge
 * and the banner are separate** — the badge distinguishes the *kind* of
 * rejection, and the banner explains it.
 */

import Link from 'next/link';

import {
  CLAIM_AUTO_REJECTED_BANNER,
  CLAIM_DATE_LOST_SECTION,
  CLAIM_DETAIL_HEADING,
  CLAIM_ID_LABEL,
  CLAIM_IDENTIFYING_DETAILS_SECTION,
  CLAIM_REASON_SECTION,
  CLAIM_REJECTED_AUTO_BADGE,
  CLAIM_SUBMITTED_LABEL,
} from './member-copy';
import { StatusBadge } from './status-badge';

/**
 * The claim detail's props.
 */
export interface ClaimDetailSurfaceProps {
  /** The Claim's id. */
  readonly claimId: string;
  /** The Claim's status. */
  readonly status: string;
  /** The Claim's reason. */
  readonly reason: string;
  /** The Claim's identifying details. */
  readonly identifyingDetails: string;
  /** The date the claimant lost the item. */
  readonly dateLost: string;
  /** When the Claim was submitted. */
  readonly submittedAt: string;
  /** The Found report's id, for the item link. */
  readonly reportId: string;
  /** The Found report's name. */
  readonly reportName: string;
  /** Whether the Claim was auto-rejected by a competing approval. */
  readonly autoRejected: boolean;
}

/**
 * The claim detail.
 */
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
}: ClaimDetailSurfaceProps): React.JSX.Element {
  return (
    <article className="claim-detail">
      <header className="detail-section">
        <h1 className="hero__title">{CLAIM_DETAIL_HEADING}</h1>

        <p className="hero__lede">
          <StatusBadge
            status={autoRejected ? CLAIM_REJECTED_AUTO_BADGE : status}
            kind="Claim status"
          />
        </p>
      </header>

      {autoRejected ? (
        <div className="banner banner--info" role="status">
          <p className="banner__heading">{CLAIM_AUTO_REJECTED_BANNER}</p>
        </div>
      ) : null}

      <section className="detail-section">
        <h2 className="detail-section__heading">{'Item'}</h2>

        <dl className="detail-list">
          <dt className="detail-list__term">{CLAIM_ID_LABEL}</dt>
          <dd className="detail-list__value tabular">{claimId}</dd>

          {/*
            **The item name links to the Found report.** §12.2: the item
            name is a link — the member may want to look at the item
            again.
          */}
          <dt className="detail-list__term">{'Item name'}</dt>
          <dd className="detail-list__value">
            <Link href={`/listings/${reportId}`}>{reportName}</Link>
          </dd>
        </dl>
      </section>

      <section className="detail-section">
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
      </section>
    </article>
  );
}
