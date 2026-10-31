import type { Metadata } from 'next';

import { emptyFilter, isReportStatus, type ReportStatus } from '@/domain/listings';

import { MyReportsSurface, SERVER_ERROR_MESSAGE } from '@/ui/my-reports-surface';

import { readCampusAreaLabels } from '../_campus-area-labels';
import { requireMember } from '../_member-page';
import { MEMBER_READ_FAILED, readMemberView } from '../_member-view-page';
import { readClaimSummariesForReports } from './_claim-summaries';

export const metadata: Metadata = {
  title: 'My reports',
};

/**
 * `My Reports` — §9.4, mockup `08-my-reports.html`.
 */
export default async function MyReportsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly [key: string]: string | string[] | undefined }>;
}): Promise<React.JSX.Element> {
  const actor = await requireMember('/my/reports');

  const params = await searchParams;
  const statusFilter = statusFromParams(params['status']);

  const result = await readMemberView(
    actor,
    'mine',
    statusFilter ? { ...emptyFilter(), statuses: [statusFilter] } : emptyFilter(),
  );

  if (result.kind !== 'Reports') {
    return (
      <MyReportsSurface
        rows={[]}
        claimSummaries={{}}
        campusAreaLabels={{}}
        statusFilter={statusFilter}
        error={result.kind === 'Failed' ? MEMBER_READ_FAILED : SERVER_ERROR_MESSAGE}
      />
    );
  }

  const rows = result.rows;
  const foundReportIds = rows.filter((row) => row.type === 'Found').map((row) => row.id);
  const [claimSummaries, campusAreaLabels] = await Promise.all([
    readClaimSummariesForReports(foundReportIds),
    readCampusAreaLabels(),
  ]);

  return (
    <MyReportsSurface
      rows={rows}
      claimSummaries={claimSummaries}
      campusAreaLabels={campusAreaLabels}
      statusFilter={statusFilter}
    />
  );
}

function statusFromParams(value: string | string[] | undefined): ReportStatus | null {
  const raw = Array.isArray(value) ? value[0] : value;

  if (!raw || raw.length === 0) {
    return null;
  }

  return isReportStatus(raw) ? raw : null;
}

export { SERVER_ERROR_MESSAGE };
