import { prisma } from '@/infrastructure/db/prisma';

import type { ReturnConfirmationSummary } from '@/ui/admin-return-confirmation-model';

import { loadRecoveryResponsesForAdminVerification } from './lost/_recovery-responses-for-verification';

export type { ReturnConfirmationSummary };

/**
 * Load context for a Found report awaiting physical return.
 */
export async function readFoundReturnConfirmationSummary(
  reportId: string,
): Promise<ReturnConfirmationSummary | null> {
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      type: 'Found',
      status: 'Claim Approved',
    },
    select: {
      name: true,
      claims: {
        where: { status: 'Approved' },
        take: 1,
        select: {
          claimant: { select: { displayName: true } },
        },
      },
    },
  });

  if (!report) {
    return null;
  }

  const claimantName = report.claims[0]?.claimant.displayName ?? '—';

  return {
    itemName: report.name,
    reportType: 'Found',
    defaultReceiverName: claimantName,
  };
}

/**
 * Load context for a Lost report awaiting physical return (match confirmed).
 */
export async function readLostReturnConfirmationSummary(
  reportId: string,
): Promise<ReturnConfirmationSummary | null> {
  const report = await prisma.report.findFirst({
    where: {
      id: reportId,
      type: 'Lost',
      status: 'Verification Pending',
    },
    select: {
      name: true,
      reporter: { select: { displayName: true } },
    },
  });

  if (!report) {
    return null;
  }

  const candidates = await loadRecoveryResponsesForAdminVerification(reportId);
  const matched = candidates.find((candidate) => candidate.status === 'Match Confirmed');

  const matchedDetails: { label: string; value: string }[] = [];

  if (matched) {
    matchedDetails.push({ label: 'Status', value: matched.status });

    const whereFound = [matched.campusArea, matched.exactPlace].filter(Boolean).join(' — ');

    if (whereFound) {
      matchedDetails.push({ label: 'Where found', value: whereFound });
    }

    if (matched.dateFound) {
      matchedDetails.push({ label: 'Date found', value: matched.dateFound });
    }
  }

  return {
    itemName: report.name,
    reportType: 'Lost',
    defaultReceiverName: report.reporter.displayName ?? 'Report owner',
    matchedDetails: matchedDetails.length > 0 ? matchedDetails : undefined,
  };
}
