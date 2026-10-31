import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import { AdminReportEditSurface } from '@/ui/admin-report-edit-surface';

export const metadata: Metadata = {
  title: 'Edit report (admin)',
};

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';
import { PrismaCampusAreaReader } from '@/infrastructure/listings/prisma-campus-area-reader';
import { prisma } from '@/infrastructure/db/prisma';

import type { ActorContext } from '@/domain/accounts';

import { resolveAdminAccess } from '../../../_admin-page';

/**
 * The administrator's moderation edit — `/admin/reports/:id/edit` (FR-53).
 *
 * ## The route is reached from the report, not from a queue
 *
 * The four queues are about *waiting work* — a registration to approve, a
 * claim to decide, an item to hand back, a candidate to determine. A
 * moderation edit is not waiting work: it is a correction the
 * administrator makes to a report that is already live. So it is reached
 * from the report itself, through the administrator's view of it.
 *
 * ## The report is read through the visibility projection
 *
 * **The administrator sees the report the same way every other viewer
 * does** — through `ReportDetailService`, with the FR-39 columns applied.
 * The administrator's extra columns (the exact place, the identifying
 * details, the reporter's contact) are granted by the projection because
 * the actor is an administrator, not because this page asked for them.
 */
export default async function AdminReportEditPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/" />;
  }

  const { id } = await params;

  const report = await readReport(id, access.userId, access.displayName);
  const campusAreas = await readCampusAreas();

  if (!report || !campusAreas) {
    return (
      <div className="form-column">
        <h1 className="hero__title">Edit report</h1>

        <div className="banner banner--info" role="status">
          <p>Something went wrong on our side. Try again, or come back in a moment.</p>
        </div>
      </div>
    );
  }

  return (
    <AdminReportEditSurface
      reportId={id}
      report={report}
      campusAreas={campusAreas}
      afterHref={`/listings/${id}`}
    />
  );
}

/**
 * The report's current values, as the projection carries them.
 */
interface ReportValues {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly date: string;
  readonly campusArea: string;
  readonly exactPlace: string;
  readonly identifyingDetails: string;
}

/**
 * Read the report through the visibility projection.
 */
async function readReport(
  reportId: string,
  userId: string,
  displayName: string | null,
): Promise<ReportValues | null> {
  try {
    const stack = buildListingsStack();
    const actor: ActorContext = {
      actorId: userId,
      status: 'Active',
      isAdministrator: true,
      displayName: displayName ?? 'Administrator',
      capability: 'member',
    };

    const projection = await stack.details.show(actor, reportId);

    return {
      name: projection.report.name ?? '',
      category: projection.report.category ?? '',
      description: projection.report.description ?? '',
      date: projection.report.date ?? '',
      campusArea: projection.report.campusArea ?? '',
      exactPlace: projection.report.exactPlace ?? '',
      identifyingDetails: projection.report.identifyingDetails ?? '',
    };
  } catch {
    return null;
  }
}

/**
 * Read the deployment's campus areas.
 *
 * **A read failure is a refusal, never a permissive default** — the same
 * rule the report form follows, so an edit cannot offer an area the
 * deployment does not have.
 */
async function readCampusAreas(): Promise<readonly { value: string; label: string }[] | null> {
  try {
    const areas = await new PrismaCampusAreaReader(prisma).listActive();

    return areas.map((area) => ({ value: area.value, label: area.label }));
  } catch {
    return null;
  }
}
