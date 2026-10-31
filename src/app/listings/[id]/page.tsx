import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NotFoundError } from '@/lib/errors';

import type { ActorContext } from '@/domain/accounts';

import type { ReporterActionPlan, VisibilityProjection } from '@/domain/listings';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { ItemDetailPageLayout } from '@/ui/item-detail-page-layout';
import { ItemDetailSurface } from '@/ui/item-detail-surface';

import { resolveMemberAccess } from '../../my/_member-page';
import { reporterActionPlan } from '../../my/_reporter-actions';

/**
 * The item detail — §11.3, FR-39.
 *
 * ## The projection is the page
 *
 * Story 004's criterion: *"the page renders the projected field set — the
 * server has already applied FR-39's matrix, and the client does not
 * perform a second visibility evaluation of its own."*
 *
 * **So this route renders the projection and nothing else.** It does not
 * decide what the viewer may see, and it does not strip a field it thinks
 * should be hidden — the projection it received never carried that field.
 *
 * ## A member's own report does not unlock anything
 *
 * §9.4: *"The detail page never auto-reveals more sensitive fields when a
 * member submits a Claim."* Submitting a Claim confers no new visibility
 * on the report, so the projection for a claimant carries the same
 * authenticated column set as it does for any unrelated member.
 *
 * ## An anonymous request is refused before any query runs
 *
 * FR-13 does not extend anonymous visibility, and FR-38 says there is no
 * anonymous report-detail page. The service refuses an anonymous viewer
 * with `NotFoundError` **before it queries** — so an anonymous request
 * cannot even confirm that the report exists. The route renders the
 * not-found page.
 */
export default async function ItemDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const { id } = await params;

  const access = await resolveMemberAccess(`/listings/${id}`);

  if (access.kind === 'Redirect') {
    return <NotFoundDetail />;
  }

  // **The read is separated from the render,** so the JSX is never
  // constructed inside a `try` — a render error is not a read error, and
  // the two must not share a handler.
  const reading = await readDetail(access.actor, id);

  if (!reading) {
    return <NotFoundDetail />;
  }

  // **The member's own report opens under My Reports,** so breadcrumbs and
  // owner actions stay tied to the report they authored (FR-49).
  if (reading.plan !== null) {
    redirect(`/my/reports/${id}`);
  }

  const title = reading.projection.report.name ?? 'Item detail';

  return (
    <ItemDetailPageLayout reportId={id} reportTitle={title} plan={reading.plan}>
      <ItemDetailSurface projection={reading.projection} />
    </ItemDetailPageLayout>
  );
}

/**
 * Read the report's detail for a member.
 *
 * **The reporter's actions are offered only to the reporter.** The plan is
 * the domain's — `planReporterActions` — and this helper only supplies the
 * facts the projection already carries. A member who is not the reporter
 * gets no plan at all.
 *
 * @returns the projection and the plan, or `null` when the report is not
 * visible to this member.
 */
async function readDetail(
  actor: ActorContext,
  reportId: string,
): Promise<{
  readonly projection: VisibilityProjection;
  readonly plan: ReporterActionPlan | null;
} | null> {
  try {
    const stack = buildListingsStack();

    const projection = await stack.details.show(actor, reportId);

    return { projection, plan: reporterActionPlan(projection) };
  } catch (error) {
    if (error instanceof NotFoundError) {
      return null;
    }

    throw error;
  }
}

/**
 * The not-found page.
 *
 * **The same page for an anonymous request and a missing report.** The
 * two are deliberately indistinguishable — telling an anonymous visitor
 * that the report exists would leak the fact that it does.
 */
function NotFoundDetail(): React.JSX.Element {
  return (
    <div className="empty-view">
      <h1 className="hero__title">{'Item not found'}</h1>

      <p className="empty-view__body">
        {'That report could not be found. It may have been removed, or the link may be wrong.'}
      </p>
    </div>
  );
}

export const metadata: Metadata = {
  title: 'Item detail',
};
