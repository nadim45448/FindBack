/**
 * Reads the audit trail.
 *
 * The trail is administrator-only (FR-32). The authorization check happens
 * **here, in the application layer, before the query runs** — a
 * non-administrator never reaches the repository, and the repository itself
 * has no role logic.
 *
 * The trail is read newest first, 25 entries per page, with cursor pagination
 * on `(occurredAt, id)` (EXPERIENCE.md §17). A raw SQL index range scan over
 * `(parent_id, occurred_at DESC, id DESC)` meets the 1 s p95 target at 10,000
 * reports × 50 events.
 */

import { PermissionDeniedError } from '@/lib/errors';
import type { AuditEvent, TrailFilters } from '@/domain/audit';
import type { AuditEventRepository, TrailCursor } from './ports/audit-event-repository';

/** The maximum entries on one page. */
export const TRAIL_PAGE_SIZE = 25;

/** Who is asking for the trail. */
export interface TrailViewer {
  readonly userId: string;
  readonly isAdministrator: boolean;
}

/** A page of the trail. */
export interface TrailResult {
  readonly events: readonly AuditEvent[];
  readonly nextCursor: TrailCursor | null;
}

/** Reads the trail for an administrator. */
export class AuditTrailReader {
  constructor(private readonly events: AuditEventRepository) {}

  /**
   * Read one page of a parent's trail.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   */
  async listByParent(
    viewer: TrailViewer,
    parentType: string,
    parentId: string,
    cursor: TrailCursor | null,
    limit: number = TRAIL_PAGE_SIZE,
    filters?: TrailFilters,
  ): Promise<TrailResult> {
    this.assertAdministrator(viewer);

    const page = await this.events.listByParent(
      parentType,
      parentId,
      cursor,
      Math.min(limit, TRAIL_PAGE_SIZE),
      filters,
    );

    return { events: page.events, nextCursor: page.nextCursor };
  }

  /**
   * Read one page of the whole trail.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   */
  async listAll(
    viewer: TrailViewer,
    cursor: TrailCursor | null,
    limit: number = TRAIL_PAGE_SIZE,
    filters?: TrailFilters,
  ): Promise<TrailResult> {
    this.assertAdministrator(viewer);

    const page = await this.events.listAll(cursor, Math.min(limit, TRAIL_PAGE_SIZE), filters);

    return { events: page.events, nextCursor: page.nextCursor };
  }

  private assertAdministrator(viewer: TrailViewer): void {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read the audit trail.');
    }
  }
}
