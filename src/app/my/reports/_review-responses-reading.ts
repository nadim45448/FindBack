import type { ActorContext } from '@/domain/accounts';

import { ownerColumnFor } from '@/domain/listings';

import {
  decideSelection,
  deriveDisplayStatus,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import { readReportDetailForMember } from './_report-detail-reading';

export interface ReviewResponseRow {
  readonly responseId: string;
  readonly displayStatus: string;
  readonly canonicalStatus: string;
  readonly submittedAt: string;
  readonly campusArea: string | null;
  readonly canSelect: boolean;
  readonly detailHref: string;
}

export interface ReviewResponsesReading {
  readonly reportId: string;
  readonly reportName: string;
  readonly reportStatus: string;
  readonly rows: readonly ReviewResponseRow[];
}

/**
 * Load the review screen for a Lost report the member authored.
 */
export async function readReviewResponses(
  actor: ActorContext,
  reportId: string,
): Promise<ReviewResponsesReading | null> {
  const reading = await readReportDetailForMember(actor, reportId);

  if (!reading || reading.plan === null) {
    return null;
  }

  const { projection } = reading;

  if (projection.report.type !== 'Lost') {
    return null;
  }

  if (!projection.columns.includes(ownerColumnFor('Lost'))) {
    return null;
  }

  const ownerId = projection.viewerId;

  if (ownerId === null) {
    return null;
  }

  const hasMatchConfirmed = projection.recoveryResponses.some(
    (response) => response.status === 'Match Confirmed',
  );

  const siblings = projection.recoveryResponses.map((response) => ({
    id: response.responseId,
    status: response.status as RecoveryResponseStatus,
  }));

  const rows = projection.recoveryResponses.map((response) => {
    const canonicalStatus = response.status as RecoveryResponseStatus;
    const displayStatus = deriveDisplayStatus(
      response.responseId,
      canonicalStatus,
      siblings,
    );

    const decision = decideSelection({
      actorId: ownerId,
      reportOwnerId: ownerId,
      reportStatus: projection.report.status,
      responseStatus: canonicalStatus,
      hasMatchConfirmed,
    });

    return {
      responseId: response.responseId,
      displayStatus,
      canonicalStatus,
      submittedAt: response.submittedAt,
      campusArea: response.campusArea ?? null,
      canSelect: decision.kind === 'Permitted',
      detailHref: `/my/reports/${reportId}/responses/${response.responseId}`,
    };
  });

  return {
    reportId,
    reportName: projection.report.name ?? 'Lost report',
    reportStatus: projection.report.status,
    rows,
  };
}
