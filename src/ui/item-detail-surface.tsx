'use client';

/**
 * The item detail surface — §11.3, mockup `detail-renderer.js`.
 */

import Link from 'next/link';

import { StatusBadge } from './status-badge';

import {
  displayReportStatus,
  grantsImageDelivery,
  ownerColumnFor,
  planSectionsForProjection,
  reportHasMatchConfirmed,
  rendersHiddenNotice,
  type ProjectedClaim,
  type VisibilityProjection,
} from '@/domain/listings';

import {
  CAMPUS_AREA_SECTION,
  CATEGORY_SECTION,
  CLAIM_CTA_HEADING,
  DESCRIPTION_SECTION,
  DETAIL_NO_PHOTO,
  EXACT_PLACE_SECTION,
  HIDDEN_FROM_OTHER_MEMBERS,
  IDENTIFYING_DETAILS_SECTION,
  LOCATION_SECTION,
  QUICK_FACTS_HEADING,
  CLAIM_DETAIL_APPROVED_ALERT,
  CLAIM_DETAIL_PENDING_ALERT,
  CLAIM_DETAIL_REJECTED_ALERT,
  CLAIM_DETAIL_VIEW_LINK,
  FOUND_OWNER_CLAIMS_APPROVED_BODY,
  FOUND_OWNER_CLAIMS_HEADING,
  FOUND_OWNER_CLAIMS_PENDING_BODY,
  FOUND_OWNER_CLAIMS_REOPENED_BODY,
  FOUND_OWNER_CLAIM_THREAD_LINK,
  LOST_OWNER_RECOVERY_BODY,
  LOST_OWNER_RECOVERY_BODY_AWAITING_RETURN,
  LOST_OWNER_RECOVERY_BODY_VERIFICATION_PENDING,
  LOST_OWNER_RECOVERY_HEADING,
  LOST_OWNER_RECOVERY_NONE,
  REPORT_STATUS_HELPERS,
  REVIEW_RECOVERY_RESPONSES,
  RECOVERY_CTA_HEADING,
  REPORT_DATE_FOUND_LABEL,
  REPORT_DATE_LOST_LABEL,
  REPORTER_SECTION,
  STATUS_HISTORY_SECTION,
  reportTypeLabel,
} from './member-copy';

export interface ItemDetailSurfaceProps {
  readonly projection: VisibilityProjection;
  /**
   * Recovery responses on this Lost report (from the owner’s listing read).
   *
   * **Fills in when the FR-39 projection carried no responses** so the owner
   * still sees the review entry point on My Reports detail.
   */
  readonly recoveryResponseCount?: number | undefined;
}

export function ItemDetailSurface({
  projection,
  recoveryResponseCount,
}: ItemDetailSurfaceProps): React.JSX.Element {
  const report = projection.report;
  const plan = planSectionsForProjection(projection);
  const isVisible = (section: string): boolean =>
    plan.find((entry) => entry.section === section)?.visible ?? false;

  const dateLabel = report.type === 'Lost' ? REPORT_DATE_LOST_LABEL : REPORT_DATE_FOUND_LABEL;

  const matchConfirmed = reportHasMatchConfirmed(projection.recoveryResponses);
  const statusLabel = displayReportStatus(report.type, report.status, {
    hasMatchConfirmed: matchConfirmed,
  });

  const imageInProjection = isVisible('image') && Boolean(report.imageRef);
  const imageDeliverable = imageInProjection && grantsImageDelivery(projection.columns);

  return (
    <article className="item-detail">
      {isVisible('header') ? (
        <header className="item-detail__header">
          <div className="item-detail__title-wrap">
            <h1 className="item-detail__title">{report.name}</h1>

            <div className="item-detail__badges">
              <StatusBadge status={reportTypeLabel(report.type)} kind="Type" tone="neutral" />
              <StatusBadge status={statusLabel} kind="Status" />
            </div>
          </div>
        </header>
      ) : null}

      <div className="detail-grid">
        <div className="detail-grid__main">
          <div
            className={
              imageDeliverable
                ? 'detail-image-frame detail-image-frame--filled'
                : 'detail-image-frame'
            }
          >
            {imageDeliverable ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                className="detail-image"
                src={`/api/reports/${report.id}/image`}
                alt={`Photo of ${report.name}`}
              />
            ) : (
              <span className="detail-image-frame__empty">{DETAIL_NO_PHOTO}</span>
            )}
          </div>

          {isVisible('description') ? (
            <DetailCard heading={DESCRIPTION_SECTION}>
              <p className="detail-section__body">{report.description}</p>
            </DetailCard>
          ) : null}

          {isVisible('identifyingDetails') ? (
            <DetailCard heading={IDENTIFYING_DETAILS_SECTION}>
              <p className="detail-section__body">{report.identifyingDetails}</p>
            </DetailCard>
          ) : plan.find((entry) => entry.section === 'identifyingDetails') &&
            rendersHiddenNotice(
              plan.find((entry) => entry.section === 'identifyingDetails')!,
            ) ? (
            <HiddenCard heading={IDENTIFYING_DETAILS_SECTION} />
          ) : null}

          {plan.find((entry) => entry.section === 'location') &&
          rendersHiddenNotice(plan.find((entry) => entry.section === 'location')!) ? (
            <HiddenCard heading={LOCATION_SECTION} />
          ) : null}

          <ClaimantStatusAlerts projection={projection} />

          <LostReportOwnerLifecycleBanner
            projection={projection}
            recoveryResponseCount={recoveryResponseCount}
          />

          <LostOwnerRecoverySection
            projection={projection}
            recoveryResponseCount={recoveryResponseCount}
          />

          <FoundOwnerClaimsSection projection={projection} />

          <ParticipationSections projection={projection} />

          {isVisible('statusHistory') ? (
            <DetailCard heading={STATUS_HISTORY_SECTION}>
              <dl className="detail-list detail-list--stacked">
                <div className="detail-list__row">
                  <dt className="detail-list__term">{'Status'}</dt>
                  <dd className="detail-list__value">{report.statusHistory?.status}</dd>
                </div>
                <div className="detail-list__row">
                  <dt className="detail-list__term">{'Last action'}</dt>
                  <dd className="detail-list__value tabular">
                    {report.statusHistory?.lastActionAt ?? '—'}
                  </dd>
                </div>
              </dl>
            </DetailCard>
          ) : null}
        </div>

        <aside className="detail-grid__aside">
          <DetailCard heading={QUICK_FACTS_HEADING}>
            <dl className="detail-meta detail-meta--grid">
              {report.category ? (
                <div className="detail-meta__row">
                  <dt>{CATEGORY_SECTION}</dt>
                  <dd>{report.category}</dd>
                </div>
              ) : null}

              {report.date ? (
                <div className="detail-meta__row">
                  <dt>{dateLabel}</dt>
                  <dd className="tabular">{report.date}</dd>
                </div>
              ) : null}

              {report.campusArea ? (
                <div className="detail-meta__row">
                  <dt>{CAMPUS_AREA_SECTION}</dt>
                  <dd>{report.campusArea}</dd>
                </div>
              ) : null}

              {isVisible('location') && report.exactPlace ? (
                <div className="detail-meta__row">
                  <dt>{EXACT_PLACE_SECTION}</dt>
                  <dd>{report.exactPlace}</dd>
                </div>
              ) : null}

              <div className="detail-meta__row">
                <dt>{REPORTER_SECTION}</dt>
                <dd>
                  {isVisible('reporter') ? (
                    report.reporterDisplayName
                  ) : (
                    <span className="field__helper">{HIDDEN_FROM_OTHER_MEMBERS}</span>
                  )}
                </dd>
              </div>
            </dl>
          </DetailCard>
        </aside>
      </div>
    </article>
  );
}

function DetailCard({
  heading,
  children,
}: {
  readonly heading: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="detail-section detail-section--card">
      <h2 className="detail-section__heading">{heading}</h2>
      {children}
    </section>
  );
}

function HiddenCard({ heading }: { readonly heading: string }): React.JSX.Element {
  return (
    <section className="detail-section detail-section--card">
      <h2 className="detail-section__heading">
        {heading}
        <span className="hidden-note">{HIDDEN_FROM_OTHER_MEMBERS}</span>
      </h2>
    </section>
  );
}

function ClaimantStatusAlerts({
  projection,
}: {
  readonly projection: VisibilityProjection;
}): React.JSX.Element | null {
  const ownClaim = preferredOwnClaim(projection.claims);

  if (!ownClaim) {
    return null;
  }

  const href = `/my/claims/${ownClaim.claimId}`;
  let message: string;

  if (ownClaim.status === 'Pending') {
    message = CLAIM_DETAIL_PENDING_ALERT;
  } else if (ownClaim.status === 'Approved') {
    message = CLAIM_DETAIL_APPROVED_ALERT;
  } else if (ownClaim.status === 'Rejected' || ownClaim.status === 'Rejected — auto') {
    message = CLAIM_DETAIL_REJECTED_ALERT;
  } else {
    return null;
  }

  return (
    <div className="banner banner--info" role="status">
      <p>
        <strong>{message}</strong>
        {' '}
        <Link href={href}>{CLAIM_DETAIL_VIEW_LINK}</Link>
      </p>
    </div>
  );
}

function FoundOwnerClaimsSection({
  projection,
}: {
  readonly projection: VisibilityProjection;
}): React.JSX.Element | null {
  const report = projection.report;

  if (report.type !== 'Found' || !projection.columns.includes('foundReportOwner')) {
    return null;
  }

  const claims = projection.claims;

  if (claims.length === 0) {
    return null;
  }

  const pending = claims.filter((claim) => claim.status === 'Pending');
  const approved = claims.filter((claim) => claim.status === 'Approved');
  const reportId = projection.reportId;

  return (
    <DetailCard heading={FOUND_OWNER_CLAIMS_HEADING}>
      {pending.length > 0 ? (
        <div className="banner banner--info" role="status">
          <p>
            <strong>
              {pending.length}
              {pending.length === 1 ? ' pending claim' : ' pending claims'}
            </strong>
          </p>
          <p className="detail-section__body">{FOUND_OWNER_CLAIMS_PENDING_BODY}</p>
        </div>
      ) : null}

      {approved.length > 0 ? (
        <div className="banner banner--info" role="status">
          <p>
            <strong>{approved.length === 1 ? '1 approved claim' : `${approved.length} approved claims`}</strong>
          </p>
          <p className="detail-section__body">{FOUND_OWNER_CLAIMS_APPROVED_BODY}</p>
        </div>
      ) : null}

      {pending.length === 0 &&
      approved.length === 0 &&
      report.status === 'Open' &&
      claims.some((claim) => claim.status === 'Rejected' || claim.status === 'Rejected — auto') ? (
        <div className="banner banner--info" role="status">
          <p>{FOUND_OWNER_CLAIMS_REOPENED_BODY}</p>
        </div>
      ) : null}

      <ul className="found-owner-claim-list">
        {claims.map((claim) => (
          <li key={claim.claimId} className="found-owner-claim-list__item">
            <div className="found-owner-claim-list__summary">
              <span className="found-owner-claim-list__date tabular">{claim.submittedAt}</span>
              <StatusBadge status={claim.status} kind="Status" />
            </div>

            <Link
              href={`/my/reports/${reportId}/claims/${claim.claimId}`}
              className="button button--secondary button--sm"
            >
              {FOUND_OWNER_CLAIM_THREAD_LINK}
            </Link>
          </li>
        ))}
      </ul>
    </DetailCard>
  );
}

function LostReportOwnerLifecycleBanner({
  projection,
  recoveryResponseCount,
}: {
  readonly projection: VisibilityProjection;
  readonly recoveryResponseCount?: number | undefined;
}): React.JSX.Element | null {
  const report = projection.report;

  if (report.type !== 'Lost' || !projection.columns.includes('lostReportOwner')) {
    return null;
  }

  const responseCount = Math.max(
    projection.recoveryResponses.length,
    recoveryResponseCount ?? 0,
  );

  const matchConfirmed = projection.recoveryResponses.some(
    (response) => response.status === 'Match Confirmed',
  );

  let message: string | undefined;

  if (report.status === 'Open' && responseCount > 0) {
    message = REPORT_STATUS_HELPERS.Lost.OpenWithResponses;
  } else if (report.status === 'Verification Pending' && matchConfirmed) {
    message = REPORT_STATUS_HELPERS.Lost.VerificationPendingMatchConfirmed;
  } else {
    message = REPORT_STATUS_HELPERS.Lost[report.status];
  }

  if (!message) {
    return null;
  }

  return (
    <div className="banner banner--info" role="status">
      <p className="detail-section__body">{message}</p>
    </div>
  );
}

function LostOwnerRecoverySection({
  projection,
  recoveryResponseCount,
}: {
  readonly projection: VisibilityProjection;
  readonly recoveryResponseCount?: number | undefined;
}): React.JSX.Element | null {
  const report = projection.report;

  if (report.type !== 'Lost' || !projection.columns.includes('lostReportOwner')) {
    return null;
  }

  const count = Math.max(projection.recoveryResponses.length, recoveryResponseCount ?? 0);
  const reviewHref = `/my/reports/${projection.reportId}/review-responses`;

  if (count === 0) {
    return null;
  }

  const matchConfirmed = projection.recoveryResponses.some(
    (response) => response.status === 'Match Confirmed',
  );

  const bodyCopy =
    report.status === 'Verification Pending' && matchConfirmed
      ? LOST_OWNER_RECOVERY_BODY_AWAITING_RETURN
      : report.status === 'Verification Pending'
        ? LOST_OWNER_RECOVERY_BODY_VERIFICATION_PENDING
        : LOST_OWNER_RECOVERY_BODY;

  return (
    <DetailCard heading={LOST_OWNER_RECOVERY_HEADING}>
      <p className="detail-section__body">{bodyCopy}</p>

      <p className="detail-section__body">
        {`${count} response${count === 1 ? '' : 's'} so far.`}
      </p>

      <div className="detail-section__actions">
        <Link href={reviewHref} className="button button--primary">
          {REVIEW_RECOVERY_RESPONSES}
        </Link>
      </div>
    </DetailCard>
  );
}

function ParticipationSections({
  projection,
}: {
  readonly projection: VisibilityProjection;
}): React.JSX.Element {
  const report = projection.report;
  const isFound = report.type === 'Found';
  const isReporter = projection.columns.includes(ownerColumnFor(report.type));

  const ownClaims = projection.claims.filter((claim) => claim.isOwn);
  const ownClaim = preferredOwnClaim(projection.claims);
  const ownResponses = projection.recoveryResponses.filter((response) => response.isOwn);
  const ownResponse = preferredOwnRecoveryResponse(ownResponses);

  const hasPendingClaim = ownClaims.some((claim) => claim.status === 'Pending');
  const hasPendingResponse = ownResponses.some((response) => response.status === 'Submitted');

  const claimEligible =
    isFound &&
    !isReporter &&
    (report.status === 'Open' || report.status === 'Claim Requested') &&
    !hasPendingClaim;

  const responseEligible =
    !isFound &&
    !isReporter &&
    (report.status === 'Open' || report.status === 'Verification Pending') &&
    !hasPendingResponse;

  if (!claimEligible && !responseEligible && !ownClaim && !ownResponse) {
    return <></>;
  }

  return (
    <>
      {claimEligible ? (
        <DetailCard heading={CLAIM_CTA_HEADING}>
          <p className="detail-section__body">
            {
              'If this might be yours, submit a claim with a reason and identifying details. An administrator will review competing claims.'
            }
          </p>
          <div className="detail-section__actions">
            <Link href={`/listings/${report.id}/claim`} className="button button--primary">
              {'Submit a claim'}
            </Link>
          </div>
        </DetailCard>
      ) : null}

      {responseEligible ? (
        <DetailCard heading={RECOVERY_CTA_HEADING}>
          <p className="detail-section__body">
            {
              'If you think you found this item, share what you observed — where you found it, when, and identifying details. The owner will review responses.'
            }
          </p>
          <div className="detail-section__actions">
            <Link
              href={`/listings/${report.id}/submit-recovery-response`}
              className="button button--primary"
            >
              {RECOVERY_CTA_HEADING}
            </Link>
          </div>
        </DetailCard>
      ) : null}

      {ownClaim ? (
        <div className="detail-section__actions detail-section__actions--standalone">
          <Link href={`/my/claims/${ownClaim.claimId}`} className="button button--secondary">
            {'Your claim'}
          </Link>
        </div>
      ) : null}

      {ownResponse ? (
        <div className="detail-section__actions detail-section__actions--standalone">
          <Link
            href={`/my/recovery-responses/${ownResponse.responseId}`}
            className="button button--secondary"
          >
            {'Your recovery response'}
          </Link>
        </div>
      ) : null}
    </>
  );
}

/**
 * The member's own Claim to link to when more than one exists on a report.
 *
 * Pending and Approved claims take precedence over an older Rejected one, so
 * the alert and the "Your claim" button agree with My Claims.
 */
function preferredOwnRecoveryResponse(
  responses: ReadonlyArray<{ readonly responseId: string; readonly status: string }>,
): { readonly responseId: string; readonly status: string } | undefined {
  if (responses.length === 0) {
    return undefined;
  }

  const liveStatuses = new Set([
    'Submitted',
    'Selected for Verification',
    'Match Confirmed',
  ]);

  const live = responses.find((response) => liveStatuses.has(response.status));

  if (live) {
    return live;
  }

  return responses[responses.length - 1];
}

function preferredOwnClaim(claims: readonly ProjectedClaim[]): ProjectedClaim | undefined {
  const own = claims.filter((claim) => claim.isOwn);

  if (own.length === 0) {
    return undefined;
  }

  return (
    own.find((claim) => claim.status === 'Pending') ??
    own.find((claim) => claim.status === 'Approved') ??
    own[0]
  );
}

export { rendersHiddenNotice };
