'use client';

import type { ReporterActionPlan } from '@/domain/listings';

import { Breadcrumbs } from './breadcrumbs';
import { ReportActionsPanel } from './report-actions-panel';

import { FINDER_TOOLBAR, MEMBER_BROWSE_PAGE_TITLE } from './member-copy';

export interface ItemDetailBreadcrumb {
  readonly label: string;
  readonly href: string | null;
}

export interface ItemDetailPageLayoutProps {
  readonly reportId: string;
  readonly reportTitle: string;
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

  return (
    <div className="item-detail-page">
      <Breadcrumbs variant="compact" crumbs={[...trail]} />

      {plan ? (
        <div className="reporter-callout">
          <p className="reporter-callout__label">{FINDER_TOOLBAR}</p>

          <div className="reporter-callout__actions">
            <ReportActionsPanel reportId={reportId} plan={plan} />
          </div>
        </div>
      ) : null}

      {children}
    </div>
  );
}
