'use client';

import { useCallback, useState } from 'react';

import {
  isReportStatus,
  shouldShowReporterToolbar,
  type ReportStatus,
  type ReportType,
  type ReporterActionPlan,
} from '@/domain/listings';

import { Breadcrumbs } from './breadcrumbs';
import { ReportActionsPanel } from './report-actions-panel';
import { reporterCalloutNotice } from './report-actions-surface';

import { FINDER_TOOLBAR, MEMBER_BROWSE_PAGE_TITLE } from './member-copy';

export interface ItemDetailBreadcrumb {
  readonly label: string;
  readonly href: string | null;
}

export interface ItemDetailPageLayoutProps {
  readonly reportId: string;
  readonly reportTitle: string;
  readonly reportStatus: ReportStatus;
  readonly reportType: ReportType;
  readonly hasMatchConfirmed?: boolean | undefined;
  readonly plan: ReporterActionPlan | null;
  readonly crumbs?: readonly ItemDetailBreadcrumb[] | undefined;
  readonly children: React.ReactNode;
}

/**
 * Item detail chrome — mockup `03-item-detail-member` (breadcrumb + reporter bar).
 */
export function ItemDetailPageLayout({
  reportId,
  reportTitle,
  reportStatus,
  reportType,
  hasMatchConfirmed = false,
  plan,
  crumbs,
  children,
}: ItemDetailPageLayoutProps): React.JSX.Element {
  const trail =
    crumbs ??
    ([
      { label: MEMBER_BROWSE_PAGE_TITLE, href: '/listings' },
      { label: reportTitle, href: null },
    ] as const);

  const status = isReportStatus(reportStatus) ? reportStatus : ('Open' as ReportStatus);

  return (
    <div className="item-detail-page">
      <Breadcrumbs variant="compact" crumbs={[...trail]} />

      {plan && shouldShowReporterToolbar(status) ? (
        <ReporterCallout
          reportId={reportId}
          plan={plan}
          reportStatus={status}
          reportType={reportType}
          hasMatchConfirmed={hasMatchConfirmed}
        />
      ) : null}

      {children}
    </div>
  );
}

function ReporterCallout({
  reportId,
  plan,
  reportStatus,
  reportType,
  hasMatchConfirmed,
}: {
  readonly reportId: string;
  readonly plan: ReporterActionPlan;
  readonly reportStatus: ReportStatus;
  readonly reportType: ReportType;
  readonly hasMatchConfirmed: boolean;
}): React.JSX.Element {
  const [actionFailure, setActionFailure] = useState<string | null>(null);

  const onFailure = useCallback((message: string | null): void => {
    setActionFailure(message);
  }, []);

  const notice = reporterCalloutNotice(plan, {
    status: reportStatus,
    type: reportType,
    hasMatchConfirmed,
  });

  return (
    <div className="reporter-callout">
      <div className="reporter-callout__row">
        <p className="reporter-callout__label">{FINDER_TOOLBAR}</p>

        <ReportActionsPanel
          reportId={reportId}
          plan={plan}
          calloutOnly
          onFailure={onFailure}
        />
      </div>

      {notice ? <p className="reporter-callout__note">{notice}</p> : null}

      {actionFailure ? (
        <div className="reporter-callout__alert error-summary" role="alert">
          <p className="error-summary__heading">{actionFailure}</p>
        </div>
      ) : null}
    </div>
  );
}
