import type { Metadata } from 'next';
import Link from 'next/link';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminReturnConfirmationSurface } from '@/ui/admin-return-confirmation-surface';

import { loadRecoveryResponsesForAdminVerification } from '../../_recovery-responses-for-verification';

import { resolveAdminAccess } from '../../../_admin-page';

export const metadata: Metadata = {
  title: 'Confirm lost item returned',
};

/**
 * Lost-side physical return — `/admin/lost/:id/return` (FR-23, FR-24 on Lost).
 *
 * **Default-receiver confirmation is on the verification screen.** This page
 * is for the substitute-receiver case (FR-24), when someone other than the
 * Lost-report owner received the item.
 */
export default async function LostConfirmReturnPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/verifications" />;
  }

  const { id } = await params;
  const candidates = await loadRecoveryResponsesForAdminVerification(id);
  const matchConfirmed = candidates.some((candidate) => candidate.status === 'Match Confirmed');

  if (!matchConfirmed) {
    return (
      <div className="form-column">
        <h1 className="hero__title">Confirm the lost item was returned</h1>

        <div className="banner banner--info" role="status">
          <p>
            Record the owner&apos;s match confirmation on{' '}
            <Link href={`/admin/lost/${id}`}>Manage verification</Link> before confirming the
            physical return.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminReturnConfirmationSurface
      endpoint={`/api/admin/reports/${id}/confirm-returned`}
      heading="Confirm the lost item was returned"
      afterHref="/admin/verifications"
    />
  );
}
