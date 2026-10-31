import type { Metadata } from 'next';

import { ClaimDetailSurface } from '@/ui/claim-detail-surface';
import { CLAIM_THREAD_HEADING, THREAD_PERMISSION_DENIED } from '@/ui/member-copy';
import { ThreadPanel } from '@/ui/thread-panel';

import { requireMember } from '../../_member-page';
import { readClaimDetail } from '../_claim-detail';

export const metadata: Metadata = {
  title: 'Claim thread',
};

/**
 * The Claim detail — §12.2, and its thread below — §13.
 *
 * ## The Claim detail and the thread are one page
 *
 * §9.4: *"Claim detail (`/my/claims/:id`). Item summary (link), claim
 * reason, identifying details, date lost, claim status. Below: per-Claim
 * message thread (§13)."* **The thread is below the body,** on the same
 * page — so a claimant reads the decision and the conversation together.
 *
 * ## The thread's own rules decide its own state
 *
 * **The thread is read through the thread service**, so the participation
 * check, the writability, and the read-only notice are all the domain's.
 * The page does not decide whether the member may post, and it does not
 * compose the notice.
 *
 * ## A member who may not take part sees the notice, not an empty thread
 *
 * §13.4's message is rendered **instead of** the thread, so a stranger
 * sees why they cannot read it rather than an empty conversation they
 * might mistake for a quiet one.
 */
export default async function ClaimDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const actor = await requireMember(`/my/claims/${id}`);

  const reading = await readClaimDetail(actor, id);

  if (!reading) {
    return <ClaimNotFound />;
  }

  return (
    <>
      <ClaimDetailSurface
        claimId={reading.claimId}
        status={reading.claimStatus}
        reason={reading.reason ?? ''}
        identifyingDetails={reading.identifyingDetails ?? ''}
        dateLost={reading.dateLost ?? ''}
        submittedAt={reading.submittedAt ?? ''}
        reportId={reading.reportId}
        reportName={reading.reportName}
        autoRejected={reading.autoRejected}
      />

      <ThreadPanel
        heading={CLAIM_THREAD_HEADING}
        messages={reading.messages}
        writable={reading.writable && !reading.threadDenied}
        readOnlyNotice={reading.readOnlyNotice}
        permissionDenied={reading.threadDenied ? THREAD_PERMISSION_DENIED : undefined}
        endpoint={`/api/claims/${reading.claimId}/thread/messages`}
      />
    </>
  );
}

/**
 * The not-found page.
 *
 * **The same page for a missing Claim and for one the member may not
 * see.** The Claim's existence is a private fact about another member's
 * assertion, so the two are deliberately indistinguishable.
 */
function ClaimNotFound(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Claim not found'}</h1>

      <p className="empty-view__body">
        {'That claim could not be found. It may have been removed, or the link may be wrong.'}
      </p>
    </div>
  );
}
