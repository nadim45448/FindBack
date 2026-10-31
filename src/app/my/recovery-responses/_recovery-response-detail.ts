/**
 * The shared reading for the per-Recovery-Response detail page — §9.6.
 *
 * ## The display status is derived, and the canonical status is kept
 *
 * FR-41's `Submitted — Standby` is a **display condition, never a stored
 * status.** The badge shows the derived label; the detail list shows the
 * canonical status beside it, so the member can see that the response is
 * `Submitted` and that the label is a derivation rather than a ninth
 * status.
 *
 * **The derivation is the domain's** — `deriveDisplayStatus` — and the
 * route calls it. The route does not compare the response's status to
 * `Selected for Verification` itself, because that comparison is the rule,
 * and a second copy of it would be a second copy of the rule.
 *
 * ## The thread's own rules decide its own state
 *
 * **The thread is read through the thread service**, so the participation
 * check, the writability, and the read-only notice are all the domain's.
 */

import type { ActorContext } from '@/domain/accounts';

import {
  ownerColumnFor,
  recoveryResponseThreadReadOnlyNotice,
  type ReportStatus,
} from '@/domain/listings';

import {
  deriveDisplayStatus,
  type RecoveryResponseStatus,
} from '@/domain/recovery';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import type { ThreadMessageView } from '@/ui/thread-surface';

import { reportIdForRecoveryResponse } from '../_participation-report-id';

/**
 * The Recovery Response detail's reading.
 */
export interface RecoveryResponseDetailReading {
  readonly responseId: string;
  readonly reportId: string;
  readonly reportName: string;
  /** The display status — the canonical one, or `Submitted — Standby`. */
  readonly displayStatus: string;
  /** The canonical persisted status. */
  readonly canonicalStatus: string;
  readonly whereFoundArea: string | null;
  readonly exactPlace: string | null;
  readonly observedIdentifyingDetails: string | null;
  readonly dateFound: string | null;
  readonly submittedAt: string | null;
  /**
   * Whether the Response carries a candidate image.
   *
   * **A boolean, not the reference.** The image is served through the
   * authorised route, so the browser never holds a path.
   */
  readonly hasCandidateImage: boolean;
  /** Whether the responder may still withdraw the response. */
  readonly withdrawable: boolean;
  readonly messages: readonly ThreadMessageView[];
  readonly writable: boolean;
  readonly readOnlyNotice: string | null;
  /** Whether the member may not see the thread at all. */
  readonly threadDenied: boolean;
}

/**
 * Read a Recovery Response's detail and its thread.
 *
 * @returns the reading, or `null` when the Response is not visible to this
 * member at all.
 */
export async function readRecoveryResponseDetail(
  actor: ActorContext,
  responseId: string,
): Promise<RecoveryResponseDetailReading | null> {
  const reportId = await reportIdForRecoveryResponse(responseId);

  if (!reportId) {
    return null;
  }

  return readRecoveryResponseDetailForReport(actor, reportId, responseId, {
    audience: 'responder',
  });
}

/**
 * The Lost-report owner's view of one response on their report.
 */
export async function readOwnerRecoveryResponseDetail(
  actor: ActorContext,
  reportId: string,
  responseId: string,
): Promise<RecoveryResponseDetailReading | null> {
  return readRecoveryResponseDetailForReport(actor, reportId, responseId, {
    audience: 'lostReportOwner',
  });
}

async function readRecoveryResponseDetailForReport(
  actor: ActorContext,
  reportId: string,
  responseId: string,
  options: { readonly audience: 'responder' | 'lostReportOwner' },
): Promise<RecoveryResponseDetailReading | null> {
  const stack = buildListingsStack();

  const projection = await stack.details.show(actor, reportId).catch(() => null);

  if (!projection) {
    return null;
  }

  if (options.audience === 'lostReportOwner') {
    if (
      projection.report.type !== 'Lost' ||
      !projection.columns.includes(ownerColumnFor('Lost'))
    ) {
      return null;
    }
  }

  const visibleResponse = projection.recoveryResponses.find(
    (response) => response.responseId === responseId,
  );

  if (!visibleResponse) {
    return null;
  }

  if (options.audience === 'responder' && !visibleResponse.isOwn) {
    return null;
  }

  const siblings = projection.recoveryResponses.map((response) => ({
    id: response.responseId,
    status: response.status as RecoveryResponseStatus,
  }));

  const canonicalStatus = visibleResponse.status as RecoveryResponseStatus;

  const displayStatus = deriveDisplayStatus(responseId, canonicalStatus, siblings);

  const base = {
    responseId,
    reportId: projection.reportId,
    reportName: projection.report.name ?? '',
    displayStatus,
    canonicalStatus,
    whereFoundArea: visibleResponse.campusArea ?? null,
    exactPlace: visibleResponse.whereFoundExactPlace ?? null,
    observedIdentifyingDetails: visibleResponse.observedIdentifyingDetails ?? null,
    dateFound: visibleResponse.dateFound ?? null,
    submittedAt: visibleResponse.submittedAt,
    hasCandidateImage: visibleResponse.candidateImageRef !== undefined,
    withdrawable:
      options.audience === 'responder' && visibleResponse.isOwn && canonicalStatus === 'Submitted',
  };

  const thread = await stack.recoveryResponseThreads
    .readThread({
      responseId,
      actor: { actorId: actor.actorId, isAdministrator: actor.isAdministrator },
    })
    .catch(() => null);

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
      authorRole: roleFor(
        message.authorId,
        thread.responderId,
        thread.lostReportOwnerId,
      ),
      postedAt: message.postedAt,
      body: message.body,
    })),
    writable: thread.writable,
    readOnlyNotice: readOnlyNoticeFor(
      thread.responseStatus,
      thread.reportStatus,
      thread.writable,
    ),
    threadDenied: false,
  };
}

/**
 * The read-only notice, when the thread is read-only.
 *
 * **The domain names the variant.** §13.5b's four notices are four
 * different sentences, and a route that chose between them would be a
 * second copy of the rule that chooses them.
 */
function readOnlyNoticeFor(
  responseStatus: RecoveryResponseStatus,
  reportStatus: ReportStatus,
  writable: boolean,
): string | null {
  if (writable) {
    return null;
  }

  try {
    return recoveryResponseThreadReadOnlyNotice({ responseStatus, reportStatus });
  } catch {
    return null;
  }
}

/**
 * The role tag a message's author carries.
 *
 * **The role is a relationship, and the relationships are the thread
 * subject's.** The responder, the Lost-report owner, and the
 * administrator are the three participants.
 */
function roleFor(authorId: string, responderId: string, lostReportOwnerId: string): string {
  if (authorId === responderId) {
    return 'Responder';
  }

  if (authorId === lostReportOwnerId) {
    return 'Owner';
  }

  return 'Administrator';
}
