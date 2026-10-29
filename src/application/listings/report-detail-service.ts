/**
 * The report detail service — FR-13's authenticated detail view.
 *
 * **The detail view is bolt `006`'s projection, not a second one.** The
 * FR-39 matrix — "which fields may this viewer see of this report" — is
 * owned by `ReportVisibilityService`, and this service adds exactly one
 * thing on top: the **FR-13 gate**.
 *
 * **The gate is: no anonymous detail view.** FR-13 explicitly does not
 * extend anonymous visibility; FR-38 governs anonymous users, and it says
 * there is no anonymous report-detail page. So an anonymous request to the
 * detail is refused.
 *
 * **The refusal is a 404, not a 403.** A 403 would confirm the report
 * exists — and FR-38 says the listing row is the whole of anonymous
 * visibility on a report. "That report could not be found" tells an
 * anonymous visitor nothing they did not already know.
 *
 * **The projection is resolved per request.** Two different authenticated
 * members opening the same report get **different** field sets, because
 * the columns depend on the viewer's relationship to the report. That is
 * story 008's criterion 7, and it is structural here: the projection is
 * computed from the viewer and the report, never from the report alone.
 *
 * **A viewer who is not authorised for a field gets it absent, not
 * hidden.** The field is not in the `SELECT` list, so it is never loaded —
 * which is bolt `006`'s mechanism, inherited rather than re-implemented.
 *
 * Pure orchestration — the ports do the I/O.
 */

import { NotFoundError } from '@/lib/errors';
import type { ActorContext } from '@/domain/accounts/actor-context';
import {
  viewerFromActorContext,
  type VisibilityProjection,
} from '@/domain/listings';

import type { ReportVisibilityService } from './report-visibility-service';

/** The collaborators the service sequences. */
export interface ReportDetailDependencies {
  readonly visibility: ReportVisibilityService;
}

/**
 * Reads a report's detail through the FR-39 projection.
 */
export class ReportDetailService {
  constructor(private readonly dependencies: ReportDetailDependencies) {}

  /**
   * Project a report's detail for an actor.
   *
   * @throws {NotFoundError} when the viewer is not a member, or when the
   * report does not exist. The two are deliberately indistinguishable.
   */
  async show(actor: ActorContext | null, reportId: string): Promise<VisibilityProjection> {
    const viewer = viewerFromActorContext(actor);

    // FR-13 does not extend anonymous visibility, and FR-38 says there is
    // no anonymous report-detail page. **The refusal happens before any
    // query runs**, so an anonymous request cannot even confirm that the
    // report exists.
    if (viewer.kind === 'anonymous') {
      throw new NotFoundError('That report could not be found.');
    }

    return this.dependencies.visibility.projectReport(actor, reportId);
  }
}
