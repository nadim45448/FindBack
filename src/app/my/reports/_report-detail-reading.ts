import { NotFoundError } from '@/lib/errors';

import type { ActorContext } from '@/domain/accounts';

import type { ReporterActionPlan, VisibilityProjection } from '@/domain/listings';

import { buildListingsStack } from '@/infrastructure/listings/listings-stack';

import { reporterActionPlan } from '../_reporter-actions';

/**
 * Read a report's FR-39 projection for a member, plus reporter actions when
 * the viewer authored the report.
 */
export async function readReportDetailForMember(
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
