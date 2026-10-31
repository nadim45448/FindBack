import { prisma } from '@/infrastructure/db/prisma';

import type { ReportClaimSummary } from '@/ui/my-reports-types';

/**
 * Load claim counts for a page of the member's reports.
 */
export async function readClaimSummariesForReports(
  reportIds: readonly string[],
): Promise<Readonly<Record<string, ReportClaimSummary>>> {
  if (reportIds.length === 0) {
    return {};
  }

  const rows = await prisma.claim.groupBy({
    by: ['reportId', 'status'],
    where: { reportId: { in: [...reportIds] } },
    _count: { _all: true },
  });

  const summaries: Record<
    string,
    { approved: number; pending: number; rejected: number }
  > = {};

  for (const id of reportIds) {
    summaries[id] = { approved: 0, pending: 0, rejected: 0 };
  }

  for (const row of rows) {
    const entry = summaries[row.reportId];

    if (!entry) {
      continue;
    }

    const count = row._count._all;

    if (row.status === 'Approved') {
      entry.approved += count;
    } else if (row.status === 'Pending') {
      entry.pending += count;
    } else if (row.status === 'Rejected') {
      entry.rejected += count;
    }
  }

  return summaries;
}
