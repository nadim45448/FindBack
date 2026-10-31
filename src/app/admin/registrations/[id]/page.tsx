import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminDecisionSurface } from '@/ui/admin-decision-surface';

export const metadata: Metadata = {
  title: 'Review registration',
};

import { resolveAdminAccess } from '../../_admin-page';

/**
 * The registration review — `/admin/registrations/:id` (FR-3, FR-27).
 *
 * ## The queue's action reaches here
 *
 * §15.2's Pending Registrations queue ends with an *action* column, and
 * §5.7 says the action *"reaches the specific work item"*. The specific
 * work item for a registration is **the decision on that registration** —
 * so the queue's action link lands here, and this page carries the two
 * decisions.
 *
 * ## The page is a server component that gates, then hands over
 *
 * **The authorisation is checked here, once.** A non-administrator gets
 * the access screen and no content from the administration stack — the
 * same two gates every administrator page has: this one keeps the data
 * out of the response, and the route's one keeps it out of the database.
 *
 * ## The client half sends the decision; the route applies it
 *
 * The decision is a `POST /api/admin/registrations/:id` with
 * `decision: 'approve'` or `decision: 'reject'`. **The page never decides
 * anything** — it sends the intent and the route's use case rules on it.
 */
export default async function RegistrationReviewPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/registrations" />;
  }

  const { id } = await params;

  return (
    <AdminDecisionSurface
      endpoint={`/api/admin/registrations/${id}`}
      heading="Review registration"
      approveLabel="Approve"
      rejectLabel="Reject"
      requiresReason
      afterHref="/admin/registrations"
    />
  );
}
