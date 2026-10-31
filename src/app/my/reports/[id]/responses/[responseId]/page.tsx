import type { Metadata } from 'next';

import { Breadcrumbs } from '@/ui/breadcrumbs';
import {
  MY_REPORTS_PAGE_TITLE,
  RECOVERY_RESPONSE_OWNER_DETAIL_HEADING,
  RECOVERY_RESPONSE_THREAD_HEADING,
  RECOVERY_RESPONSE_THREAD_PERMISSION_DENIED,
  REVIEW_RECOVERY_RESPONSES,
} from '@/ui/member-copy';
import { RecoveryResponseDetailSurface } from '@/ui/recovery-response-surface';
import { ThreadPanel } from '@/ui/thread-panel';

import { requireMember } from '../../../../_member-page';
import { readOwnerRecoveryResponseDetail } from '../../../../recovery-responses/_recovery-response-detail';

export const metadata: Metadata = {
  title: 'Recovery response',
};

export default async function OwnerRecoveryResponsePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string; readonly responseId: string }>;
}): Promise<React.JSX.Element> {
  const { id: reportId, responseId } = await params;

  const actor = await requireMember(`/my/reports/${reportId}/responses/${responseId}`);

  const reading = await readOwnerRecoveryResponseDetail(actor, reportId, responseId);

  if (!reading) {
    return <ResponseNotFound />;
  }

  return (
    <div className="item-detail-page">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: MY_REPORTS_PAGE_TITLE, href: '/my/reports' },
          { label: reading.reportName, href: `/my/reports/${reportId}` },
          {
            label: REVIEW_RECOVERY_RESPONSES,
            href: `/my/reports/${reportId}/review-responses`,
          },
          { label: 'Response', href: null },
        ]}
      />

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
        reportDetailHref={`/my/reports/${reportId}`}
        detailHeading={RECOVERY_RESPONSE_OWNER_DETAIL_HEADING}
        withdrawable={false}
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
    </div>
  );
}

function ResponseNotFound(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Recovery response not found'}</h1>

      <p className="empty-view__body">
        {'That recovery response could not be found on this report.'}
      </p>
    </div>
  );
}
