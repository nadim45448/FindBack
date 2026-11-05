import { prisma } from '@/infrastructure/db/prisma';

import type { ReportRecoverySummary } from '@/ui/my-reports-types';

/**
 * Load recovery-response counts for a page of the member's Lost reports.
 */
export async function readRecoveryResponseSummariesForReports(
  reportIds: readonly string[],
): Promise<Readonly<Record<string, ReportRecoverySummary>>> {
  if (reportIds.length === 0) {
    return {};
  }

  const rows = await prisma.recoveryResponse.groupBy({
    by: ['reportId', 'status'],
    where: { reportId: { in: [...reportIds] } },
    _count: { _all: true },
  });

  const summaries: Record<
    string,
    { submitted: number; inProgress: number; hasMatchConfirmed: boolean }
  > = {};

  for (const id of reportIds) {
    summaries[id] = { submitted: 0, inProgress: 0, hasMatchConfirmed: false };
  }

  for (const row of rows) {
    const entry = summaries[row.reportId];

    if (!entry) {
      continue;
    }

    const count = row._count._all;

    if (row.status === 'Submitted') {
      entry.submitted += count;
    } else if (
      row.status === 'Selected for Verification' ||
      row.status === 'Match Confirmed'
    ) {
      entry.inProgress += count;
    }

    if (row.status === 'Match Confirmed' && count > 0) {
      entry.hasMatchConfirmed = true;
    }
  }

  return summaries;
}
