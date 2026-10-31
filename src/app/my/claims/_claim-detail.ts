/**
 * The shared reading for the per-Claim detail page — §12.2, §13.
 *
 * ## The Claim's own facts, and the thread's facts, come from one subject
 *
 * The Claim's status, the Found report's status, the claimant's id, and
 * the finder's id are **the same facts** the thread's writability and its
 * read-only notice are resolved from. So they are read once, by the
 * thread's own read, and both the Claim detail and the thread are built
 * from them.
 *
 * **Reading them twice would be two reads that could disagree** — and the
 * disagreement would show as a Claim marked `Approved` beside a thread
 * that says it is still writable.
 *
 * ## The notice is the domain's
 *
 * §13.5 requires four distinct read-only notices, and the domain's
 * `claimThreadReadOnlyNotice` resolves the exact one from the facts. The
 * route does not compose the sentence, and it does not choose between the
 * variants.
 *
 * ## A member who may not take part in the thread still sees their Claim
 *
 * §13.4: a member who is neither the claimant nor the finder *"cannot
 * view or post in it"* — **the thread, not the Claim.** So a refused
 * thread renders the permission-denied notice, and the Claim's own detail
 * is still there.
 */

import type { ActorContext } from '@/domain/accounts';

import {
  claimThreadReadOnlyNotice,
  type ClaimStatus,
  type ReportStatus,
} from '@/domain/listings';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import type { ThreadMessageView } from '@/ui/thread-surface';

import { reportIdForClaim } from '../_participation-report-id';

/**
 * The claim detail's reading.
 */
export interface ClaimDetailReading {
  readonly claimId: string;
  readonly reportId: string;
  readonly reportName: string;
  readonly claimStatus: string;
  readonly reason: string | null;
  readonly identifyingDetails: string | null;
  readonly dateLost: string | null;
  readonly submittedAt: string | null;
  readonly autoRejected: boolean;
  readonly messages: readonly ThreadMessageView[];
  readonly writable: boolean;
  readonly readOnlyNotice: string | null;
  /** Whether the member may not see the thread at all. */
  readonly threadDenied: boolean;
}

/**
 * Read a Claim's detail and its thread.
 *
 * @returns the reading, or `null` when the Claim is not visible to this
 * member at all.
 */
export async function readClaimDetail(
  actor: ActorContext,
  claimId: string,
): Promise<ClaimDetailReading | null> {
  const stack = buildListingsStack();

  const reportId = await reportIdForClaim(claimId);

  if (!reportId) {
    return null;
  }

  // ── The Claim ───────────────────────────────────────────────────────────
  //
  // **The Claim is read through the visibility projection,** so the member
  // sees their own Claim's evidence — their reason, their identifying
  // details, their date lost — and nothing of anybody else's.
  //
  // **The report is read through the same projection,** and the Claim is
  // matched against it, so a member who is not the claimant gets no
  // Claim — the projection carries only the Claims they may see.
  const projection = await stack.details.show(actor, reportId).catch(() => null);

  if (!projection) {
    return null;
  }

  const ownClaim = projection.claims.find((claim) => claim.claimId === claimId);

  if (!ownClaim) {
    return null;
  }

  const base = {
    claimId,
    reportId: projection.reportId,
    reportName: projection.report.name ?? '',
    claimStatus: ownClaim.status,
    reason: ownClaim.reason ?? null,
    identifyingDetails: ownClaim.identifyingDetails ?? null,
    dateLost: ownClaim.dateLost ?? null,
    submittedAt: ownClaim.submittedAt,
    autoRejected: ownClaim.status === 'Rejected — auto',
  };

  // ── The thread ──────────────────────────────────────────────────────────
  //
  // **The thread's own read carries the facts.** It resolves the
  // participation, the writability, and the messages — and it carries the
  // Claim's and the report's statuses, which is what the read-only notice
  // is resolved from.
  const thread = await stack.claimThreads
    .readThread({
      claimId,
      actor: { actorId: actor.actorId, isAdministrator: actor.isAdministrator },
    })
    .catch(() => null);

  if (!thread) {
    // **The thread is not visible to this member.** The Claim detail is
    // still theirs — it is their own Claim — and the thread renders the
    // permission-denied notice.
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
    readOnlyNotice: readOnlyNoticeFor(
      thread.claimStatus,
      thread.reportStatus,
      thread.writable,
    ),
    threadDenied: false,
  };
}

/**
 * The read-only notice, when the thread is read-only.
 *
 * **The domain names the variant.** §13.5's four notices are four
 * different sentences, and a route that chose between them would be a
 * second copy of the rule that chooses them.
 */
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

/**
 * The role tag a message's author carries.
 *
 * **The role is a relationship, and the relationships are the thread
 * subject's.** The claimant, the finder, and the administrator are the
 * three participants, and a member who is none of them has no role tag.
 */
function roleFor(
  authorId: string,
  claimantId: string,
  foundReportOwnerId: string,
): string {
  if (authorId === claimantId) {
    return 'Claimant';
  }

  if (authorId === foundReportOwnerId) {
    return 'Finder';
  }

  return 'Administrator';
}
