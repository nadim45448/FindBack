import type { Metadata } from 'next';

import { Breadcrumbs } from '@/ui/breadcrumbs';
import {
  MY_REPORTS_PAGE_TITLE,
  REVIEW_RECOVERY_RESPONSES,
  REVIEW_RESPONSES_PAGE_TITLE,
} from '@/ui/member-copy';
import { ReviewResponsesPanel } from '@/ui/review-responses-panel';

import { requireMember } from '../../../_member-page';
import { readReviewResponses } from '../../_review-responses-reading';

export const metadata: Metadata = {
  title: REVIEW_RESPONSES_PAGE_TITLE,
};

export default async function ReviewResponsesPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const actor = await requireMember(`/my/reports/${id}/review-responses`);

  const reading = await readReviewResponses(actor, id);

  if (!reading) {
    return <ReviewNotAvailable />;
  }

  return (
    <div className="item-detail-page">
      <Breadcrumbs
        variant="compact"
        crumbs={[
          { label: MY_REPORTS_PAGE_TITLE, href: '/my/reports' },
          { label: reading.reportName, href: `/my/reports/${id}` },
          { label: REVIEW_RECOVERY_RESPONSES, href: null },
        ]}
      />

      <ReviewResponsesPanel
        reportId={reading.reportId}
        reportName={reading.reportName}
        reportStatus={reading.reportStatus}
        rows={reading.rows}
      />
    </div>
  );
}

function ReviewNotAvailable(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{REVIEW_RESPONSES_PAGE_TITLE}</h1>

      <p className="empty-view__body">
        {'You cannot review recovery responses for this report right now.'}
      </p>
    </div>
  );
}
