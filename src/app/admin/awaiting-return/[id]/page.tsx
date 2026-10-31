import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminReturnConfirmationSurface } from '@/ui/admin-return-confirmation-surface';

export const metadata: Metadata = {
  title: 'Confirm returned',
};

import { resolveAdminAccess } from '../../_admin-page';

/**
 * The hand-off — `/admin/awaiting-return/:id` (FR-23, FR-24, FR-25).
 *
 * ## The queue's action reaches here
 *
 * §15.4's Items Awaiting Return queue's action reaches the confirmation
 * of the physical return, and that confirmation is this page.
 *
 * ## The default receiver is derived, not chosen
 *
 * **The item goes back to the person who had a right to it** — the
 * approved claimant on a Found report, the Lost-report owner on a Lost
 * one — and the domain works that out from the report. So the page
 * offers no receiver picker; it offers the *substitute* case, and the
 * substitute's three fields travel together.
 */
export default async function AwaitingReturnPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/awaiting-return" />;
  }

  const { id } = await params;

  return (
    <AdminReturnConfirmationSurface
      endpoint={`/api/admin/reports/${id}/confirm-returned`}
      heading="Confirm the item was returned"
      afterHref="/admin/awaiting-return"
    />
  );
}
