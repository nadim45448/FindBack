/**
 * The administrator dashboard query — FR-33.
 *
 * ## The dashboard is four counts and nothing else
 *
 * §15.1 says the dashboard is *"Four count tiles at the top, each linking
 * to the corresponding queue."* The `Recent activity` aggregation that
 * once lived here was **deliberately removed** in the 2026-09-17
 * reconciliation, and its return is a regression against a frozen contract.
 *
 * So this use case returns **four counts and nothing else.** There is no
 * activity feed to configure, no digest to assemble, and no event to
 * gather.
 *
 * ## The counts and the queues cannot disagree
 *
 * Each count is read with **the queue's own filter**, through the same
 * reader the queue page uses. A tile whose count came from a different
 * query could disagree with the work it points to; a tile whose count came
 * from this same filter and reader cannot.
 *
 * ## The count is derived from the rows
 *
 * The reader returns the rows *and* the count, and the count is derived
 * from the rows rather than from a second `COUNT(*)` — under a concurrent
 * write the two could disagree, and the dashboard would then point at work
 * that is not there.
 *
 * ## The authorisation is upstream
 *
 * The dashboard is administrator-only. The check is made **here, in the
 * application layer, before any query runs** — so a non-administrator never
 * reaches the database and receives no count, no row, and no signal about
 * whether there is any work.
 *
 * Pure orchestration — the port does the I/O.
 */

import { PermissionDeniedError } from '@/lib/errors';

import {
  OPERATIONAL_QUEUES,
  OPERATIONAL_QUEUE_FILTERS,
  type DashboardCounts,
  type OperationalQueueId,
} from '@/domain/administration';

import type { QueueReader } from './ports/queue-reader';

/**
 * The dashboard's page size.
 *
 * **The same cap the queues use.** The dashboard reads each queue with the
 * queue's own limit, so the count is the number of rows the queue would
 * show, not the number of rows that exist beyond its first page.
 */
export const DASHBOARD_QUEUE_LIMIT = 25;

/**
 * Who is asking for the dashboard.
 */
export interface DashboardViewer {
  readonly userId: string;
  readonly isAdministrator: boolean;
}

/**
 * The dashboard's result.
 *
 * **The counts only.** There is no `activity`, no `recent`, no `digest`
 * field — a future implementer looking for a place to put one would not
 * find one.
 */
export interface AdministratorDashboard {
  readonly counts: DashboardCounts;
}

/**
 * Reads the administrator dashboard.
 */
export class AdministratorDashboardQuery {
  constructor(private readonly queues: QueueReader) {}

  /**
   * Read the four counts.
   *
   * @throws {PermissionDeniedError} when the viewer is not an administrator.
   */
  async read(viewer: DashboardViewer): Promise<AdministratorDashboard> {
    if (!viewer.isAdministrator) {
      throw new PermissionDeniedError('Only administrators may read the dashboard.');
    }

    const counts: Partial<Record<OperationalQueueId, number>> = {};

    // **The four reads are sequential, and deliberately so.** They are four
    // cheap, indexed `COUNT`-shaped reads, and the dashboard's page is not
    // latency-critical enough to justify four concurrent connections on a
    // Hobby-plan database. The values are also more coherent read one
    // after another than read at four different instants.
    for (const queue of OPERATIONAL_QUEUES) {
      const page = await this.queues.read(OPERATIONAL_QUEUE_FILTERS[queue], DASHBOARD_QUEUE_LIMIT);

      counts[queue] = page.count;
    }

    return { counts: counts as DashboardCounts };
  }
}
