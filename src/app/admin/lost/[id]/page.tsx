import type { Metadata } from 'next';

import { AdminAccessScreen } from '@/ui/admin-access-screen';
import {
  AdminVerificationSurface,
  type VerificationCandidate,
} from '@/ui/admin-verification-surface';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import type { ActorContext } from '@/domain/accounts';

import { buildAdminStack, resolveAdminAccess } from '../../_admin-page';

export const metadata: Metadata = {
  title: 'Verification review',
};

/**
 * The Lost-side verification screen — `/admin/lost/:id` (FR-45).
 *
 * ## The queue's action reaches here
 *
 * §15.5's Items in Verification queue's action reaches *"the Lost-side
 * verification screen"*, and that screen is this page.
 *
 * ## The determination names the owner, not the administrator
 *
 * FR-45: the Lost report's **owner** determines whether a candidate is
 * their item; the administrator **records** the determination. So the
 * page reads the report's owner from the verification queue — the queue
 * that put this report here — and sends the owner's id. **The
 * administrator's own id is never sent**, because the domain refuses a
 * determination from anybody but the owner.
 *
 * ## The candidates come from the visibility projection
 *
 * The candidates are read through the same `ReportDetailService` the
 * member-facing detail page uses, so the administrator sees the responses
 * the owner would see — and the projection applies the FR-39 columns, so
 * nothing is read that the administrator is not entitled to.
 */
export default async function LostVerificationPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.JSX.Element> {
  const access = await resolveAdminAccess();

  if (!access.allowed) {
    return <AdminAccessScreen backHref="/admin/verifications" />;
  }

  const { id } = await params;
  const owner = await readOwner(id, access.userId);
  const candidates = await readCandidates(id, access.userId, access.displayName);

  if (owner === null) {
    return (
      <div className="form-column">
        <h1 className="hero__title">Manage verification</h1>

        <div className="banner banner--info" role="status">
          <p>Something went wrong on our side. Try again, or come back in a moment.</p>
        </div>
      </div>
    );
  }

  return (
    <AdminVerificationSurface
      reportId={id}
      determinedByUserId={owner.ownerUserId}
      heading="Manage verification"
      reportName={owner.reportName}
      candidates={candidates}
      afterHref="/admin/verifications"
    />
  );
}

/**
 * The report's owner, as the verification queue reports it.
 */
interface ReportOwner {
  readonly reportName: string;
  readonly ownerUserId: string;
}

/**
 * Read the report's owner from the verification queue.
 *
 * **The queue is where the report was found.** It carries the owner by
 * id, and the queue's membership rule is the report's own — so the row
 * that puts the report in the queue is the row that names its owner.
 */
async function readOwner(reportId: string, userId: string): Promise<ReportOwner | null> {
  try {
    const stack = buildAdminStack();
    const queue = await stack.queues.read({ userId, isAdministrator: true }, 'verifications');

    if (queue.queue !== 'verifications') {
      return null;
    }

    const row = queue.rows.find((candidate) => candidate.reportId === reportId);

    if (!row) {
      return null;
    }

    return { reportName: row.reportName, ownerUserId: row.ownerUserId };
  } catch {
    return null;
  }
}

/**
 * Read the report's recovery responses through the visibility projection.
 *
 * **The actor is the administrator reading the page.** The projection
 * applies the FR-39 columns to that actor, so the administrator sees the
 * responses the owner would see — and nothing the administrator is not
 * entitled to.
 */
async function readCandidates(
  reportId: string,
  userId: string,
  displayName: string | null,
): Promise<readonly VerificationCandidate[]> {
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

    return projection.recoveryResponses.map((response) => ({
      responseId: response.responseId,
      status: response.status,
      campusArea: response.campusArea ?? '',
      exactPlace: response.whereFoundExactPlace ?? '',
      observedIdentifyingDetails: response.observedIdentifyingDetails ?? '',
      dateFound: response.dateFound ?? '',
      submittedAt: response.submittedAt,
    }));
  } catch {
    return [];
  }
}
