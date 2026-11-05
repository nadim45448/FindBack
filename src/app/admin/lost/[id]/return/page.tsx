import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { contextualAuditHref } from '@/ui/admin-contextual-audit-href';
import { AdminReturnConfirmationSurface } from '@/ui/admin-return-confirmation-surface';
import { VERIFICATION_BACK_TO_QUEUE } from '@/ui/admin-copy';

import { readLostReturnConfirmationSummary } from '../../../_return-confirmation-context';
import { loadRecoveryResponsesForAdminVerification } from '../../_recovery-responses-for-verification';

import { resolveAdminAccess } from '../../../_admin-page';

const QUEUE_HREF = '/admin/awaiting-return';

export const metadata: Metadata = {
  title: 'Confirm lost item returned',
};

/**
 * Lost-side physical return — `/admin/lost/:id/return` (FR-23, FR-24 on Lost).
 */
export default async function LostConfirmReturnPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref={QUEUE_HREF} />;
  }

  const { id } = await params;
  const candidates = await loadRecoveryResponsesForAdminVerification(id);
  const matchConfirmed = candidates.some((candidate) => candidate.status === 'Match Confirmed');

  if (!matchConfirmed) {
    return (
      <div className="admin-console admin-confirm-return">
        <h1 className="hero__title">Confirm the lost item was returned</h1>

        <div className="banner banner--info" role="status">
          <p>
            Record the owner&apos;s match confirmation on{' '}
            <Link href={`/admin/lost/${id}`}>Manage verification</Link> before confirming the
            physical return.
          </p>
        </div>

        <p>
          <Link href={QUEUE_HREF} className="button button--secondary button--sm">
            {VERIFICATION_BACK_TO_QUEUE}
          </Link>
        </p>
      </div>
    );
  }

  const summary = await readLostReturnConfirmationSummary(id);

  if (!summary) {
    return (
      <div className="admin-console admin-confirm-return">
        <h1 className="hero__title">Confirm the lost item was returned</h1>

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
