import type { Metadata } from 'next';

import { NotFoundError } from '@/lib/errors';

import type { ActorContext } from '@/domain/accounts';

import { ownerColumnFor, type VisibilityProjection } from '@/domain/listings';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { ClaimFormPanel } from '@/ui/claim-form-panel';

import { resolveMemberAccess } from '../../../my/_member-page';

export const metadata: Metadata = {
  title: 'Submit a claim',
};

/**
 * The claim form — §12.1.
 *
 * ## The eligibility is the server's
 *
 * §12.1: *"Eligibility: item is Found, status is Open or Claim Requested,
 * no Pending claim from this user."* **That check belongs to the domain**,
 * and the service refuses the submission if it fails — so the form's being
 * served is not a promise that the claim will be accepted.
 *
 * **The route refuses a member who may not see the item at all,** and it
 * refuses an item that is not eligible to be claimed — both as the
 * not-available page, because a Claim's existence is a private fact.
 *
 * ## The date bound is the claim's own
 *
 * §12.1: *"Date lost — last 365 days, not future"*. The number is the
 * domain's; the route turns it into the picker's bounds.
 */
export default async function ClaimFormPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const access = await resolveMemberAccess(`/listings/${id}/claim`);

  if (access.kind === 'Redirect') {
    return <ClaimNotAvailable />;
  }

  // **The read is separated from the render,** so the JSX is never
  // constructed inside a `try` — a render error is not a read error.
  const projection = await readDetail(access.actor, id);

  if (!projection) {
    return <ClaimNotAvailable />;
  }

  // **A Lost report cannot be claimed.** §12.1's eligibility begins "item
  // is Found" — and the Lost side's interaction is a Recovery Response,
  // never a Claim. So the route refuses rather than serving a form the
  // server would reject.
  if (projection.report.type !== 'Found') {
    return <ClaimNotAvailable />;
  }

  // **The Found-report owner cannot claim their own report.** The domain
  // refuses it at submission; the route refuses the form.
  if (projection.columns.includes(ownerColumnFor('Found'))) {
    return <ClaimNotAvailable />;
  }

  // **A member who already has a Pending Claim on this item cannot open a
  // second one.** §12.1 names it as part of the eligibility.
  const ownPendingClaim = projection.claims.some(
    (claim) => claim.isOwn && claim.status === 'Pending',
  );

  if (ownPendingClaim) {
    return <ClaimNotAvailable />;
  }

  const today = new Date();
  const earliest = new Date(today);
  earliest.setUTCDate(earliest.getUTCDate() - 365);

  return (
    <ClaimFormPanel
      reportId={id}
      minDate={earliest.toISOString().slice(0, 10)}
      maxDate={today.toISOString().slice(0, 10)}
    />
  );
}

/**
 * Read the report's projection for a member.
 *
 * @returns the projection, or `null` when the report is not visible to
 * this member.
 */
async function readDetail(
  actor: ActorContext,
  reportId: string,
): Promise<VisibilityProjection | null> {
  try {
    const stack = buildListingsStack();

    return await stack.details.show(actor, reportId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }

    throw error;
  }
}

/**
 * The not-available page.
 *
 * **The same page for every refusal** — not a member, a report that may not
 * be seen, a Lost report, an item that is not `Open` or `Claim Requested`,
 * and a member who already has a Pending Claim. The reasons are
 * deliberately indistinguishable: a Claim's existence is a private fact
 * about another member's assertion.
 */
function ClaimNotAvailable(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Claim not available'}</h1>

      <p className="empty-view__body">
        {'You cannot submit a claim on this item right now.'}
      </p>
    </div>
  );
}
