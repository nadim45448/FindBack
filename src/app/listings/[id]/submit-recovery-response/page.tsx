import type { Metadata } from 'next';

import { NotFoundError } from '@/lib/errors';

import type { ActorContext } from '@/domain/accounts';

import { ownerColumnFor, type VisibilityProjection } from '@/domain/listings';

import { RECOVERY_RESPONSE_DATE_FOUND_MAX_AGE_DAYS } from '@/domain/recovery';

import { prisma } from '@/infrastructure/db/prisma';
import { PrismaCampusAreaReader } from '@/infrastructure/listings/prisma-campus-area-reader';
import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { RecoveryResponseFormPanel } from '@/ui/recovery-response-form-panel';
import { SERVER_ERROR_MESSAGE } from '@/ui/member-copy';

import { resolveMemberAccess } from '../../../my/_member-page';

export const metadata: Metadata = {
  title: 'I may have found this item',
};

/**
 * The recovery response form — §9.6.
 *
 * ## The eligibility is the server's
 *
 * §9.6: *"Eligibility: Active member, item is Lost, status is Open or
 * Verification Pending before Match Confirmed, member is not the Lost-report
 * owner."* **That check belongs to the domain**, and the service refuses
 * the submission if it fails — so the form's being served is not a promise
 * that the response will be accepted.
 *
 * **The route refuses a member who may not see the item at all,** and it
 * refuses an item that is not eligible — both as the not-available page,
 * because a Recovery Response's existence is a private fact.
 *
 * ## A Found report cannot receive a Recovery Response
 *
 * **The type decides which interaction an item has.** A Found report's
 * interaction is a Claim; a Lost report's is a Recovery Response. The
 * route refuses rather than serving a form the server would reject.
 */
export default async function SubmitRecoveryResponsePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const access = await resolveMemberAccess(`/listings/${id}/submit-recovery-response`);

  if (access.kind === 'Redirect') {
    return <ResponseNotAvailable />;
  }

  // **The read is separated from the render,** so the JSX is never
  // constructed inside a `try` — a render error is not a read error.
  const projection = await readDetail(access.actor, id);

  if (!projection) {
    return <ResponseNotAvailable />;
  }

  if (projection.report.type !== 'Lost') {
    return <ResponseNotAvailable />;
  }

  // **The Lost-report owner cannot respond to their own report** (FR-40).
  // The domain refuses it at submission; the route refuses the form.
  if (projection.columns.includes(ownerColumnFor('Lost'))) {
    return <ResponseNotAvailable />;
  }

  // **A member who already has a Submitted response on this item cannot
  // open a second one.** §9.6's eligibility names it, and the domain's
  // submission service refuses it too.
  const ownSubmitted = projection.recoveryResponses.some(
    (response) => response.isOwn && response.status === 'Submitted',
  );

  if (ownSubmitted) {
    return <ResponseNotAvailable />;
  }

  const campusAreas = await readCampusAreasForForm();

  if (campusAreas === null) {
    return <RecoveryFormUnavailable />;
  }

  const today = new Date();
  const earliest = new Date(today);
  earliest.setUTCDate(earliest.getUTCDate() - RECOVERY_RESPONSE_DATE_FOUND_MAX_AGE_DAYS);

  return (
    <RecoveryResponseFormPanel
      reportId={id}
      minDate={earliest.toISOString().slice(0, 10)}
      maxDate={today.toISOString().slice(0, 10)}
      campusAreas={campusAreas}
    />
  );
}

async function readCampusAreasForForm(): Promise<
  readonly { readonly value: string; readonly label: string }[] | null
> {
  try {
    const areas = await new PrismaCampusAreaReader(prisma).listActive();

    return areas.map((area) => ({ value: area.value, label: area.label }));
  } catch {
    return null;
  }
}

function RecoveryFormUnavailable(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Recovery response not available'}</h1>

      <p className="empty-view__body">{SERVER_ERROR_MESSAGE}</p>
    </div>
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
 * be seen, a Found report, an item whose workflow has moved past the
 * response window, and a member who already has a Submitted response. The
 * reasons are deliberately indistinguishable.
 */
function ResponseNotAvailable(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Recovery response not available'}</h1>

      <p className="empty-view__body">
        {'You cannot submit a recovery response on this item right now.'}
      </p>
    </div>
  );
}
