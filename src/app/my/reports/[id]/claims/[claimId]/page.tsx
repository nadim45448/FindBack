import type { Metadata } from 'next';

import { Breadcrumbs } from '@/ui/breadcrumbs';
import {
  CLAIM_THREAD_HEADING,
  FOUND_OWNER_CLAIM_THREAD_HEADING,
  FOUND_OWNER_CLAIM_THREAD_LEDE,
  MY_REPORTS_PAGE_TITLE,
  THREAD_PERMISSION_DENIED,
} from '@/ui/member-copy';
import { StatusBadge } from '@/ui/status-badge';
import { ThreadPanel } from '@/ui/thread-panel';

import { requireMember } from '../../../../_member-page';
import { readReportOwnerClaimThread } from '../../../_report-claim-thread-reading';

export const metadata: Metadata = {
  title: 'Claim thread',
};

export default async function ReportOwnerClaimThreadPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string; readonly claimId: string }>;
}): Promise<React.JSX.Element> {
  const { id: reportId, claimId } = await params;

  const actor = await requireMember(`/my/reports/${reportId}/claims/${claimId}`);

  const reading = await readReportOwnerClaimThread(actor, reportId, claimId);

  if (!reading) {
    return <ClaimNotFound />;
  }

  return (
    <div className="item-detail-page">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: MY_REPORTS_PAGE_TITLE, href: '/my/reports' },
          { label: reading.reportName, href: `/my/reports/${reportId}` },
          { label: 'Claim messages', href: null },
        ]}
      />

      <section className="detail-section">
        <h1 className="hero__title">{FOUND_OWNER_CLAIM_THREAD_HEADING}</h1>

        <p className="detail-section__body">{FOUND_OWNER_CLAIM_THREAD_LEDE}</p>

        <p className="detail-section__body">
          <StatusBadge status={reading.claimStatus} kind="Status" />
          {' · '}
          <span className="tabular">{reading.submittedAt}</span>
        </p>
      </section>

      <ThreadPanel
        heading={CLAIM_THREAD_HEADING}
        messages={reading.messages}
        writable={reading.writable && !reading.threadDenied}
        readOnlyNotice={reading.readOnlyNotice}
        permissionDenied={reading.threadDenied ? THREAD_PERMISSION_DENIED : undefined}
        endpoint={`/api/claims/${reading.claimId}/thread/messages`}
      />
    </div>
  );
}

function ClaimNotFound(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Claim not found'}</h1>

      <p className="empty-view__body">
        {
          'That claim could not be found on your report. It may have been removed, or the link may be wrong.'
        }
      </p>
    </div>
  );
}
