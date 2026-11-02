import { prisma } from '@/infrastructure/db/prisma';

import type { VerificationCandidate } from '@/ui/admin-verification-surface';

/**
 * Load recovery responses for the Lost-side verification screen.
 *
 * **Administrators manage verification on behalf of the process.** When the
 * visibility projection carried no responses, the verification page still
 * needs the same rows the owner selected from — otherwise the queue action
 * reaches an empty screen.
 */
export async function loadRecoveryResponsesForAdminVerification(
  reportId: string,
): Promise<readonly VerificationCandidate[]> {
  const rows = await prisma.recoveryResponse.findMany({
    where: { reportId },
    select: {
      id: true,
      status: true,
      campusArea: true,
      whereFoundExactPlace: true,
      observedIdentifyingDetails: true,
      dateFound: true,
      submittedAt: true,
    },
    orderBy: { submittedAt: 'asc' },
  });

  return rows.map((row) => ({
    responseId: row.id,
    status: row.status,
    campusArea: row.campusArea ?? '',
    exactPlace: row.whereFoundExactPlace ?? '',
    observedIdentifyingDetails: row.observedIdentifyingDetails ?? '',
    dateFound: row.dateFound ?? '',
    submittedAt: row.submittedAt.toISOString(),
  }));
}
