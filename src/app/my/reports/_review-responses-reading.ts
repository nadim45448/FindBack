import type { ActorContext } from '@/domain/accounts';

import { ownerColumnFor } from '@/domain/listings';

import { prisma } from '@/infrastructure/db/prisma';

import {
  decideSelection,
  deriveDisplayStatus,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import { readReportDetailForMember } from './_report-detail-reading';
import { loadRecoveryResponsesForOwnerReview } from './_recovery-responses-for-review';

export interface ReviewResponseRow {
  readonly responseId: string;
  readonly displayStatus: string;
  readonly canonicalStatus: string;
  readonly submittedAt: string;
  readonly campusArea: string | null;
  readonly exactPlace: string | null;
  readonly observedIdentifyingDetails: string | null;
  readonly dateFound: string | null;
  readonly responderDisplayName: string;
  readonly canSelect: boolean;
  readonly isSelected: boolean;
  readonly detailHref: string;
}

export interface ReviewResponsesReading {
  readonly reportId: string;
  readonly reportName: string;
  readonly reportStatus: string;
  readonly selectedResponseId: string | null;
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
  const projection = reading?.projection;

  const ownsViaProjection =
    projection?.report.type === 'Lost' &&
    projection.columns.includes(ownerColumnFor('Lost'));

  const ownedReport =
    ownsViaProjection
      ? null
      : await prisma.report.findFirst({
          where: { id: reportId, type: 'Lost', reporterId: actor.actorId },
          select: { name: true, status: true },
        });

  if (!ownsViaProjection && !ownedReport) {
    return null;
  }

  const reportStatus = projection?.report.status ?? ownedReport!.status;
  const reportName = projection?.report.name ?? ownedReport!.name ?? 'Lost report';

  const sources = await loadRecoveryResponsesForOwnerReview(reportId);

  const selectedResponseId =
    sources.find((response) => response.status === 'Selected for Verification')
      ?.responseId ?? null;

  const hasMatchConfirmed = sources.some((response) => response.status === 'Match Confirmed');

  const siblings = sources.map((response) => ({
    id: response.responseId,
    status: response.status as RecoveryResponseStatus,
  }));

  const rows = sources.map((response) => {
    const canonicalStatus = response.status as RecoveryResponseStatus;
    const displayStatus = deriveDisplayStatus(
      response.responseId,
      canonicalStatus,
      siblings,
    );

    const decision = decideSelection({
      actorId: actor.actorId,
      reportOwnerId: actor.actorId,
      reportStatus,
      responseStatus: canonicalStatus,
      hasMatchConfirmed,
    });

    const isSelected =
      selectedResponseId !== null && response.responseId === selectedResponseId;

    return {
      responseId: response.responseId,
      displayStatus,
      canonicalStatus,
      submittedAt: response.submittedAt,
      campusArea: response.campusArea,
      exactPlace: response.exactPlace,
      observedIdentifyingDetails: response.observedIdentifyingDetails,
      dateFound: response.dateFound,
      responderDisplayName: response.responderDisplayName,
      canSelect: decision.kind === 'Permitted',
      isSelected,
      detailHref: `/my/reports/${reportId}/responses/${response.responseId}`,
    };
  });

  return {
    reportId,
    reportName,
    reportStatus,
    selectedResponseId,
    rows,
  };
}
