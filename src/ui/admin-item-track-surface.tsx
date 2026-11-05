import Link from 'next/link';

import type { ItemTrackReading } from '@/application/administration/ports/item-track-reader';

import {
  ADMIN_TRACK_CLAIMS_HEADING,
  ADMIN_TRACK_RECEIVER_HEADING,
  ADMIN_TRACK_REPORTER_HEADING,
  ADMIN_TRACK_RESPONSES_HEADING,
  ADMIN_TRACK_RETURN_HEADING,
  VIEW_AUDIT_TRAIL,
} from './admin-copy';
import { Breadcrumbs } from './breadcrumbs';
import { StatusBadge } from './status-badge';

export interface AdminItemTrackSurfaceProps {
  readonly reading: ItemTrackReading;
  readonly auditHref: string;
  readonly backHref: string;
  readonly formatTimestamp: (value: Date) => string;
  readonly formatDate: (value: Date | null) => string;
}

export function AdminItemTrackSurface({
  reading,
  auditHref,
  backHref,
  formatTimestamp,
  formatDate,
}: AdminItemTrackSurfaceProps): React.JSX.Element {
  const receiverLabel = reading.returnConfirmation
    ? reading.returnConfirmation.substituteReceiverName?.trim()
      ? `${reading.returnConfirmation.substituteReceiverName.trim()} (authorized for ${reading.returnConfirmation.defaultReceiverDisplayName})`
      : reading.returnConfirmation.defaultReceiverDisplayName
    : null;

  return (
    <div className="admin-console admin-item-track">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: 'Returned items', href: '/admin/returned' },
          { label: reading.itemName, href: null },
        ]}
      />

      <header className="admin-item-track__head">
        <div>
          <h1 className="hero__title">{reading.itemName}</h1>
          <p className="field__helper">
            {reading.category} · {reading.campusArea}
          </p>
        </div>
        <StatusBadge status={reading.status} kind="Report status" />
      </header>

      <div className="admin-item-track__grid">
        <section className="detail-section detail-section--card">
          <h2 className="detail-section__heading">{ADMIN_TRACK_REPORTER_HEADING}</h2>
          <p>
            <strong>{reading.reporterDisplayName}</strong>
          </p>
          <p className="field__helper">
            {reading.reportType} report · {reading.reportId}
          </p>
        </section>

        {reading.returnConfirmation ? (
          <section className="detail-section detail-section--card">
            <h2 className="detail-section__heading">{ADMIN_TRACK_RETURN_HEADING}</h2>
            <dl className="detail-list">
              <dt className="detail-list__term">{ADMIN_TRACK_RECEIVER_HEADING}</dt>
              <dd className="detail-list__value">{receiverLabel}</dd>
              {reading.returnConfirmation.relationship ? (
                <>
                  <dt className="detail-list__term">Relationship</dt>
                  <dd className="detail-list__value">{reading.returnConfirmation.relationship}</dd>
                </>
              ) : null}
              <dt className="detail-list__term">Returned at</dt>
              <dd className="detail-list__value tabular">
                {formatTimestamp(reading.returnConfirmation.returnedAt)}
              </dd>
              <dt className="detail-list__term">Confirmed by</dt>
              <dd className="detail-list__value">
                {reading.returnConfirmation.administratorDisplayName}
              </dd>
            </dl>
          </section>
        ) : null}
      </div>

      {reading.claims.length > 0 ? (
        <section className="detail-section detail-section--card">
          <h2 className="detail-section__heading">{ADMIN_TRACK_CLAIMS_HEADING}</h2>
          <div className="admin-track-table-wrap">
            <table className="admin-track-table">
              <thead>
                <tr>
                  <th scope="col">Claimant</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Decided</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {reading.claims.map((claim) => (
                  <tr key={claim.claimId}>
                    <td>
                      <Link href={`/admin/claims/${claim.claimId}`} className="topbar__link">
                        {claim.claimantDisplayName}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={claim.status} kind="Claim status" />
                    </td>
                    <td className="tabular">{formatDate(claim.submittedAt)}</td>
                    <td className="tabular">{formatDate(claim.decidedAt)}</td>
                    <td>{claim.rejectionReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {reading.recoveryResponses.length > 0 ? (
        <section className="detail-section detail-section--card">
          <h2 className="detail-section__heading">{ADMIN_TRACK_RESPONSES_HEADING}</h2>
          <div className="admin-track-table-wrap">
            <table className="admin-track-table">
              <thead>
                <tr>
                  <th scope="col">Responder</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {reading.recoveryResponses.map((response) => (
                  <tr key={response.responseId}>
                    <td>{response.respondentDisplayName}</td>
                    <td>
                      <StatusBadge status={response.status} kind="Recovery Response status" />
                    </td>
                    <td className="tabular">{formatDate(response.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="button-row">
        <Link href={auditHref} className="button button--secondary">
          {VIEW_AUDIT_TRAIL}
        </Link>
        <Link href={backHref} className="button button--tertiary">
          Back
        </Link>
      </p>
    </div>
  );
}
