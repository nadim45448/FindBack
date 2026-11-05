import type { Metadata } from 'next';

import { ItemDetailPageLayout } from '@/ui/item-detail-page-layout';
import { ItemDetailSurface } from '@/ui/item-detail-surface';
import { MY_REPORTS_PAGE_TITLE } from '@/ui/member-copy';

import { reportHasMatchConfirmed } from '@/domain/listings';

import { resolveMemberAccess } from '../../_member-page';
import { readReportDetailForMember } from '../_report-detail-reading';
import { readRecoveryResponseSummariesForReports } from '../_recovery-response-summaries';

/**
 * The reporter's item detail — §9.4 `/my/reports/:id`.
 *
 * **The same FR-39 projection as Browse detail,** with My Reports wayfinding
 * and reporter actions. Lost-report owners manage recovery responses from
 * here and from Review Responses.
 */
export default async function MyReportDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const access = await resolveMemberAccess(`/my/reports/${id}`);

  if (access.kind === 'Redirect') {
    return <ReportNotFound />;
  }

  const reading = await readReportDetailForMember(access.actor, id);

  if (!reading || reading.plan === null) {
    return <ReportNotFound />;
  }

  const title = reading.projection.report.name ?? 'My report';

  const recoverySummaries =
    reading.projection.report.type === 'Lost'
      ? await readRecoveryResponseSummariesForReports([id])
      : {};

  const recoverySummary = recoverySummaries[id];
  const recoveryResponseCount =
    (recoverySummary?.submitted ?? 0) + (recoverySummary?.inProgress ?? 0);

  const hasMatchConfirmed = reportHasMatchConfirmed(reading.projection.recoveryResponses);

  return (
    <ItemDetailPageLayout
      reportId={id}
      reportTitle={title}
      reportStatus={reading.projection.report.status}
      reportType={reading.projection.report.type}
      hasMatchConfirmed={hasMatchConfirmed}
      plan={reading.plan}
      crumbs={[
        { label: MY_REPORTS_PAGE_TITLE, href: '/my/reports' },
        { label: title, href: null },
      ]}
    >
      <ItemDetailSurface
        projection={reading.projection}
        recoveryResponseCount={
          reading.projection.report.type === 'Lost' ? recoveryResponseCount : undefined
        }
      />
    </ItemDetailPageLayout>
  );
}

function ReportNotFound(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Report not found'}</h1>

      <p className="empty-view__body">
        {
          'That report could not be found in My Reports. It may belong to another member, or the link may be wrong.'
        }
      </p>
    </div>
  );
}

export const metadata: Metadata = {
  title: 'My report',
};
