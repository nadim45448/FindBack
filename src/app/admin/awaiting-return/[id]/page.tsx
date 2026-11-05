import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { contextualAuditHref } from '@/ui/admin-contextual-audit-href';
import { AdminReturnConfirmationSurface } from '@/ui/admin-return-confirmation-surface';
import { VERIFICATION_BACK_TO_QUEUE } from '@/ui/admin-copy';

import { readFoundReturnConfirmationSummary } from '../../_return-confirmation-context';

import { resolveAdminAccess } from '../../_admin-page';

const QUEUE_HREF = '/admin/awaiting-return';

export const metadata: Metadata = {
  title: 'Confirm returned',
};

/**
 * The hand-off — `/admin/awaiting-return/:id` (FR-23, FR-24, FR-25).
 *
 * Found reports in the Items Awaiting Return queue reach this page.
 */
export default async function AwaitingReturnPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref={QUEUE_HREF} />;
  }

  const { id } = await params;
  const summary = await readFoundReturnConfirmationSummary(id);

  if (!summary) {
    return (
      <div className="admin-console admin-confirm-return">
        <h1 className="hero__title">Confirm returned</h1>

        <div className="banner banner--info" role="status">
          <p>This report is no longer awaiting return.</p>
        </div>

        <p>
          <Link href={QUEUE_HREF} className="button button--secondary button--sm">
            {VERIFICATION_BACK_TO_QUEUE}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <AdminReturnConfirmationSurface
      endpoint={`/api/admin/reports/${id}/confirm-returned`}
      queueHref={QUEUE_HREF}
      auditHref={contextualAuditHref(summary.reportType, id)}
      summary={summary}
    />
  );
}
