import { prisma } from '@/infrastructure/db/prisma';

/** A recovery response row for the owner review screen. */
export interface OwnerReviewResponseRow {
  readonly responseId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly campusArea: string | null;
}

/**
 * Load every Recovery Response on a Lost report for the owner review UI.
 *
 * **The owner always sees all responses on their own report** (FR-39). The
 * review screen uses this read when the visibility projection carried none —
 * so the My Reports activity column and the review page cannot disagree.
 */
export async function loadRecoveryResponsesForOwnerReview(
  reportId: string,
): Promise<readonly OwnerReviewResponseRow[]> {
  const rows = await prisma.recoveryResponse.findMany({
    where: { reportId },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      campusArea: true,
    },
    orderBy: { submittedAt: 'asc' },
  });

  return rows.map((row) => ({
    responseId: row.id,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    campusArea: row.campusArea,
  }));
}
