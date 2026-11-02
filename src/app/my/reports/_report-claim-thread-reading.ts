import type { ActorContext } from '@/domain/accounts';

import {
  claimThreadReadOnlyNotice,
  ownerColumnFor,
  type ClaimStatus,
  type ReportStatus,
} from '@/domain/listings';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import type { ThreadMessageView } from '@/ui/thread-surface';

import { readReportDetailForMember } from './_report-detail-reading';

export interface ReportOwnerClaimThreadReading {
  readonly claimId: string;
  readonly reportId: string;
  readonly reportName: string;
  readonly claimStatus: string;
  readonly submittedAt: string;
  readonly messages: readonly ThreadMessageView[];
  readonly writable: boolean;
  readonly readOnlyNotice: string | null;
  readonly threadDenied: boolean;
}

/**
 * Read a Claim thread for the Found report's owner — §11.1, §13.
 *
 * The finder sees status and the per-Claim thread, not the claimant's
 * private evidence.
 */
export async function readReportOwnerClaimThread(
  actor: ActorContext,
  reportId: string,
  claimId: string,
): Promise<ReportOwnerClaimThreadReading | null> {
  const reading = await readReportDetailForMember(actor, reportId);

  if (!reading || reading.projection.report.type !== 'Found') {
    return null;
  }

  if (!reading.projection.columns.includes(ownerColumnFor('Found'))) {
    return null;
  }

  const claim = reading.projection.claims.find((entry) => entry.claimId === claimId);

  if (!claim) {
    return null;
  }

  const stack = buildListingsStack();

  const thread = await stack.claimThreads
    .readThread({
      claimId,
      actor: { actorId: actor.actorId, isAdministrator: actor.isAdministrator },
    })
    .catch(() => null);

  const base = {
    claimId,
    reportId,
    reportName: reading.projection.report.name ?? 'Found report',
    claimStatus: claim.status,
    submittedAt: claim.submittedAt,
  };

  if (!thread) {
    return {
      ...base,
      messages: [],
      writable: false,
      readOnlyNotice: null,
      threadDenied: true,
    };
  }

  return {
    ...base,
    messages: thread.messages.map((message) => ({
      id: message.id,
      authorDisplayName: message.authorDisplayName,
      authorRole: roleFor(message.authorId, thread.claimantId, thread.foundReportOwnerId),
      postedAt: message.postedAt,
      body: message.body,
    })),
    writable: thread.writable,
    readOnlyNotice: readOnlyNoticeFor(thread.claimStatus, thread.reportStatus, thread.writable),
    threadDenied: false,
  };
}

function readOnlyNoticeFor(
  claimStatus: ClaimStatus,
  reportStatus: ReportStatus,
  writable: boolean,
): string | null {
  if (writable) {
    return null;
  }

  try {
    return claimThreadReadOnlyNotice({ claimStatus, reportStatus });
  } catch {
    return null;
  }
}

function roleFor(authorId: string, claimantId: string, foundReportOwnerId: string): string {
  if (authorId === claimantId) {
    return 'Claimant';
  }

  if (authorId === foundReportOwnerId) {
    return 'Finder';
  }

  return 'Administrator';
}
