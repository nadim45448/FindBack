/**
 * The contextual audit query — §17.1, §17.2, §17.3, §17.6.
 *
 * ## Audit is contextual, not a queue
 *
 * **There is no global audit read.** The two surfaces are
 * `/admin/items/:id/audit` and `/admin/lost/:id/audit`, and they are the
 * only ones. There is no `/admin/audit` route, no dashboard tile, and no
 * topbar link — the dashboard's tile set is a closed four, and the
 * administrator topbar carries no audit entry.
 *
 * This use case therefore has **no `listAll`**. Unit 006's
 * `AuditTrailService` has one — it is a backend capability with no route
 * (ADR-8) — and this module deliberately does not wrap it. A method named
 * `readAll` here would be a global audit read with a surface-shaped name,
 * and the two would eventually diverge.
 *
 * ## The parent is required
 *
 * **A contextual read names exactly one parent.** The parent type is one of
 * the trail's, and the parent id is the report (or Claim, or Recovery
 * Response, or account) whose trail is being read.
 *
 * ## The authorisation is upstream
 *
 * The trail is administrator-only (FR-32). The check happens **here,
 * before the query**, so a member never reaches the database and receives
 * no event, no count, and no signal about whether a trail exists.
 *
 * ## The read is recorded
 *
 * PRD §10 requires audit-trail reads to be logged separately from the
 * trail. Unit 006's `AuditTrailService` owns that sequencing; this module
 * **composes** it rather than reimplementing it — the read record's
 * presence is a property of the audit service, and a second writer would
 * be two answers to "was this read recorded?".
 *
 * Pure orchestration.
 */

import { PermissionDeniedError, ValidationError } from '@/lib/errors';

import { isTrailParentType, type TrailFilters, type TrailParentType } from '@/domain/audit';
import type { TrailCursor } from '@/application/ports/audit-event-repository';

import type { TrailResult, TrailViewer } from '@/application/audit-trail-reader';
import type { AuditTrailService } from '@/application/audit-trail-service';

/**
 * The request context a contextual read carries.
 */
export interface ContextualAuditContext {
  /** Present on every line and on every record (PRD §10). */
  readonly requestId: string;
  /** The filters as the administrator applied them. */
  readonly filters?: TrailFilters | null;
}

/**
 * Reads the contextual audit trail.
 */
export class ContextualAuditQuery {
  constructor(private readonly trail: AuditTrailService) {}

  /**
   * Read one page of a parent's trail.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   * @throws {ValidationError} when the parent type is not one the trail can
   * be read for.
   */
  async read(
    viewer: TrailViewer,
    parentType: string,
    parentId: string,
    cursor: TrailCursor | null,
    context: ContextualAuditContext,
    limit?: number | null,
  ): Promise<TrailResult> {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read the audit trail.');
    }

    if (!isTrailParentType(parentType)) {
      throw new ValidationError('parentType', `"${parentType}" is not a valid parent type.`);
    }

    return this.trail.listByParent(
      viewer,
      parentType,
      parentId,
      {
        parentType: parentType as TrailParentType,
        parentId,
        cursor: cursor ?? null,
        limit: limit ?? null,
        filters: context.filters ?? undefined,
      },
      { requestId: context.requestId, filters: context.filters ?? null },
    );
  }
}
