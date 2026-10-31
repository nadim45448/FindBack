'use client';

/**
 * The item detail surface — §11.3, mockup `detail-renderer.js`.
 */

import Link from 'next/link';

import { StatusBadge } from './status-badge';

import {
  ownerColumnFor,
  planSectionsForProjection,
  rendersHiddenNotice,
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
  LOST_OWNER_RECOVERY_BODY,
  LOST_OWNER_RECOVERY_HEADING,
  LOST_OWNER_RECOVERY_NONE,
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
}

export function ItemDetailSurface({ projection }: ItemDetailSurfaceProps): React.JSX.Element {
  const report = projection.report;
  const plan = planSectionsForProjection(projection);
  const isVisible = (section: string): boolean =>
    plan.find((entry) => entry.section === section)?.visible ?? false;

  const dateLabel = report.type === 'Lost' ? REPORT_DATE_LOST_LABEL : REPORT_DATE_FOUND_LABEL;

  return (
    <article className="item-detail">
      {isVisible('header') ? (
        <header className="item-detail__header">
          <div className="item-detail__title-wrap">
            <h1 className="item-detail__title">{report.name}</h1>

            <div className="item-detail__badges">
              <StatusBadge status={reportTypeLabel(report.type)} kind="Type" tone="neutral" />
              <StatusBadge status={report.status} kind="Status" />
            </div>
          </div>
        </header>
      ) : null}

      <div className="detail-grid">
        <div className="detail-grid__main">
          <div className="detail-image-frame">
            {isVisible('image') && report.imageRef ? (
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

          <LostOwnerRecoverySection projection={projection} />

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

function LostOwnerRecoverySection({
  projection,
}: {
  readonly projection: VisibilityProjection;
}): React.JSX.Element | null {
  const report = projection.report;

  if (report.type !== 'Lost' || !projection.columns.includes('lostReportOwner')) {
    return null;
  }

  const count = projection.recoveryResponses.length;
  const reviewHref = `/my/reports/${projection.reportId}/review-responses`;

  return (
    <DetailCard heading={LOST_OWNER_RECOVERY_HEADING}>
      <p className="detail-section__body">{LOST_OWNER_RECOVERY_BODY}</p>

      <p className="detail-section__body">
        {count === 0 ? LOST_OWNER_RECOVERY_NONE : `${count} response${count === 1 ? '' : 's'} so far.`}
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

  const ownClaim = projection.claims.find((claim) => claim.isOwn);
  const ownResponse = projection.recoveryResponses.find((response) => response.isOwn);

  const hasPendingClaim = ownClaim !== undefined && ownClaim.status === 'Pending';
  const hasPendingResponse = ownResponse !== undefined && ownResponse.status === 'Submitted';

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

export { rendersHiddenNotice };
