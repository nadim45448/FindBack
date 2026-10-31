import type { Metadata } from 'next';

import {
  RECOVERY_RESPONSE_THREAD_HEADING,
  RECOVERY_RESPONSE_THREAD_PERMISSION_DENIED,
} from '@/ui/member-copy';
import { RecoveryResponseDetailSurface } from '@/ui/recovery-response-surface';
import { ThreadPanel } from '@/ui/thread-panel';

import { requireMember } from '../../_member-page';
import { readRecoveryResponseDetail } from '../_recovery-response-detail';

export const metadata: Metadata = {
  title: 'Recovery response',
};

/**
 * The Recovery Response detail — §9.6, and its thread below — §13.5b.
 *
 * ## The display status and the canonical status are both shown
 *
 * §9.6: *"the canonical status badge with `Submitted — Standby` derived
 * where applicable."* **The badge carries the derived label and the detail
 * list carries the canonical status beside it** — so a member sees that
 * the response is `Submitted` and that `Submitted — Standby` is a
 * derivation, not a ninth status.
 *
 * ## The thread's own rules decide its own state
 *
 * **The thread is read through the thread service**, so the participation
 * check, the writability, and the read-only notice are all the domain's.
 * §13.5b's four notices are four different sentences, and the domain
 * resolves which one applies — the page does not choose.
 */
export default async function RecoveryResponseDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const actor = await requireMember(`/my/recovery-responses/${id}`);

  const reading = await readRecoveryResponseDetail(actor, id);

  if (!reading) {
    return <ResponseNotFound />;
  }

  return (
    <>
      <RecoveryResponseDetailSurface
        responseId={reading.responseId}
        status={reading.displayStatus}
        canonicalStatus={reading.canonicalStatus}
        whereFoundArea={reading.whereFoundArea ?? ''}
        exactPlace={reading.exactPlace ?? ''}
        observedIdentifyingDetails={reading.observedIdentifyingDetails ?? ''}
        dateFound={reading.dateFound ?? ''}
        submittedAt={reading.submittedAt ?? ''}
        hasCandidateImage={reading.hasCandidateImage}
        reportId={reading.reportId}
        reportName={reading.reportName}
        withdrawable={reading.withdrawable}
      />

      <ThreadPanel
        heading={RECOVERY_RESPONSE_THREAD_HEADING}
        messages={reading.messages}
        writable={reading.writable && !reading.threadDenied}
        readOnlyNotice={reading.readOnlyNotice}
        permissionDenied={
          reading.threadDenied ? RECOVERY_RESPONSE_THREAD_PERMISSION_DENIED : undefined
        }
        endpoint={`/api/reports/${reading.reportId}/recovery-responses/${reading.responseId}/thread/messages`}
      />
    </>
  );
}

/**
 * The not-found page.
 *
 * **The same page for a missing Response and for one the member may not
 * see.** The Response's existence is a private fact about another member's
 * assertion, so the two are deliberately indistinguishable.
 */
function ResponseNotFound(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Recovery response not found'}</h1>

      <p className="empty-view__body">
        {'That recovery response could not be found. It may have been removed, or the link may be wrong.'}
      </p>
    </div>
  );
}
