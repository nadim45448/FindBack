import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import {
  CLAIM_APPROVE_HEADING,
  CLAIM_NO_LONGER_PENDING,
  CLAIM_REJECT_HEADING,
  CLAIM_REVIEW_HEADING,
} from '@/ui/admin-copy';
import {
  ClaimAdminReviewSurface,
  type ClaimAdminMode,
} from '@/ui/claim-admin-review-surface';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import type { ClaimReviewScreen } from '@/domain/listings';

import { resolveAdminAccess } from '../../_admin-page';
import { formatTimestamp } from '../../_queue-page';

export async function generateMetadata({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly decision?: string }>;
}): Promise<Metadata> {
  const { decision } = await searchParams;
  const mode = resolveClaimMode(decision);

  const title =
    mode === 'approve'
      ? CLAIM_APPROVE_HEADING
      : mode === 'reject'
        ? CLAIM_REJECT_HEADING
        : CLAIM_REVIEW_HEADING;

  return { title };
}

/**
 * The claim review — `/admin/claims/:id` (FR-16, FR-17).
 */
export default async function ClaimReviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<{ readonly decision?: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/claims" />;
  }

  const { id } = await params;
  const { decision } = await searchParams;
  const mode = resolveClaimMode(decision);

  let screen: ClaimReviewScreen | null = null;
  let decisionAvailable = false;

  try {
    const stack = buildListingsStack();
    screen = await stack.claimReviews.review({ claimId: id });
    decisionAvailable = stack.claimReviews.offersDecision(screen);
  } catch {
    screen = null;
  }

  if (!screen) {
    return (
      <div className="form-column">
        <h1 className="hero__title">{CLAIM_REVIEW_HEADING}</h1>

        <div className="banner banner--info" role="status">
          <p>Something went wrong on our side. Try again, or come back in a moment.</p>
        </div>
      </div>
    );
  }

  if ((mode === 'approve' || mode === 'reject') && !decisionAvailable) {
    return (
      <div className="form-column">
        <h1 className="hero__title">
          {mode === 'approve' ? CLAIM_APPROVE_HEADING : CLAIM_REJECT_HEADING}
        </h1>

        <div className="banner banner--info" role="status">
          <p>{CLAIM_NO_LONGER_PENDING}</p>
        </div>
      </div>
    );
  }

  return (
    <ClaimAdminReviewSurface
      mode={mode}
      claimId={screen.claimId}
      claimStatus={screen.claimStatus}
      claimantDisplayName={screen.claimantDisplayName}
      claimantEmail={screen.claimantEmail}
      reason={screen.reason}
      identifyingDetails={screen.identifyingDetails}
      dateLost={screen.dateLost}
      submittedAtLabel={formatTimestamp(screen.submittedAt)}
      itemName={screen.item.name}
      itemCategory={screen.item.category}
      itemDate={screen.item.date}
      itemCampusArea={screen.item.campusArea}
      competingClaimCount={screen.competingClaimCount}
      decisionAvailable={decisionAvailable}
      afterHref="/admin/claims"
    />
  );
}

function resolveClaimMode(decision: string | undefined): ClaimAdminMode {
  if (decision === 'approve') {
    return 'approve';
  }

  if (decision === 'reject') {
    return 'reject';
  }

  return 'review';
}
