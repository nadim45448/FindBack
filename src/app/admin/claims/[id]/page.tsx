import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminDecisionSurface } from '@/ui/admin-decision-surface';

export const metadata: Metadata = {
  title: 'Review claim',
};

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { resolveAdminAccess } from '../../_admin-page';

/**
 * The claim review — `/admin/claims/:id` (FR-16, FR-17).
 *
 * ## The queue's action reaches here
 *
 * §15.3's Pending Claims queue's action reaches *"the claim review
 * screen"*, and that screen is this page.
 *
 * ## The evidence is read before the decision
 *
 * **The administrator cannot judge a claim they cannot read.** The
 * Claim's reason and identifying details are FR-37 Sensitive Fields, and
 * this is the one place the finder is *not* a viewer of them — so the
 * page reads them through the same `ClaimReviewService` the API route
 * uses and shows them above the decision.
 *
 * **The read is through the use case, not a second path.** The page calls
 * the same service the route calls, so the screen an administrator sees
 * here and the screen the API would return are the same assembly.
 *
 * ## A decided Claim still answers
 *
 * The service assembles the screen for a Claim that is no longer
 * `Pending` too — **the page still renders**, showing what happened, and
 * offers no decision.
 */
export default async function ClaimReviewPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/claims" />;
  }

  const { id } = await params;
  const screen = await readClaimScreen(id);

  if (!screen) {
    return (
      <div className="form-column">
        <h1 className="hero__title">Review claim</h1>

        <div className="banner banner--info" role="status">
          <p>Something went wrong on our side. Try again, or come back in a moment.</p>
        </div>
      </div>
    );
  }

  const details = [
    { label: 'Item', value: screen.item.name },
    { label: 'Category', value: screen.item.category },
    { label: 'Campus area', value: screen.item.campusArea },
    { label: 'Reason', value: screen.reason },
    { label: 'Identifying details', value: screen.identifyingDetails },
    { label: 'Date lost', value: screen.dateLost },
    { label: 'Submitted', value: formatTimestamp(screen.submittedAt) },
    { label: 'Status', value: screen.claimStatus },
    {
      label: 'Competing claims',
      value:
        screen.competingClaimCount === 0
          ? 'None'
          : `${screen.competingClaimCount} other claim(s) on this item`,
    },
  ];

  return (
    <AdminDecisionSurface
      endpoint={`/api/admin/claims/${id}`}
      heading="Review claim"
      approveLabel="Approve"
      rejectLabel="Reject"
      requiresReason
      afterHref="/admin/claims"
      details={details}
    />
  );
}

/**
 * The claim screen, as the use case assembles it.
 */
interface ClaimScreen {
  readonly claimStatus: string;
  readonly reason: string;
  readonly identifyingDetails: string;
  readonly dateLost: string;
  readonly submittedAt: Date;
  readonly item: {
    readonly name: string;
    readonly category: string;
    readonly date: string;
    readonly campusArea: string;
  };
  readonly competingClaimCount: number;
}

/**
 * Read the claim screen through the use case.
 *
 * **A failure is `null`, not a throw.** A 500 tells the administrator
 * nothing actionable, so the page renders its calm error state instead.
 */
async function readClaimScreen(id: string): Promise<ClaimScreen | null> {
  try {
    const stack = buildListingsStack();

    return (await stack.claimReviews.review({ claimId: id })) as ClaimScreen;
  } catch {
    return null;
  }
}

/**
 * Format a timestamp for the administrator's eye.
 *
 * **The locale is fixed to `en-US`** — PRD §5 defers internationalisation,
 * so the timestamp is in the organization's locale, not the reader's.
 */
function formatTimestamp(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
