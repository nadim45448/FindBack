/**
 * The administrator dashboard's tiles — FR-33.
 *
 * ## The dashboard's whole job is routing
 *
 * §15.1 says the dashboard is *"Four count tiles at the top, each linking to
 * the corresponding queue."* Nothing else. The dashboard is a **directory of
 * the four queues**, and its value is the count — how much work is waiting
 * — not an activity feed.
 *
 * ## What the dashboard deliberately does not have
 *
 * The story's acceptance criteria enumerate the absences, and they are the
 * load-bearing part of this module:
 *
 * - **No `Recent activity` aggregation.** It was deliberately removed in
 *   the 2026-09-17 reconciliation, and reintroducing it in any form is a
 *   regression against a frozen contract. The tile set below is exactly
 *   four — there is no fifth "activity" tile to add.
 * - **No audit tile.** Audit is contextual (§17.1), reached from the item.
 * - **No `Reports to edit` tile.** FR-53's administrator edit is not a
 *   queue.
 * - **No notification bell, badge, or unread count.** FR-30 forbids an
 *   in-app notification stream, and the dashboard is where a bell would
 *   live.
 *
 * The tile set is a **closed tuple of four**, so a fifth tile is a
 * compile-time decision rather than a review-time one.
 *
 * ## The counts cannot disagree with the queues
 *
 * A tile's count is the number of rows its queue returns under its own
 * filter. The filter is shared with the queue itself
 * (`operational-queues.ts`), and the count is derived from the same read —
 * so the two cannot drift.
 *
 * Pure — no I/O, no framework imports.
 */

import {
  DASHBOARD_ALL_CAUGHT_UP,
  OPERATIONAL_QUEUES,
  queueLabel,
  queueRoute,
  type OperationalQueueId,
} from './operational-queues';

/**
 * A tile's count.
 *
 * **The count is the number of rows the queue returns** — not a separate
 * "unread" or "since last visit" figure. There is no second number in the
 * product, and there is no "seen" marker, because there is no notification
 * stream to have one.
 */
export type DashboardCount = number;

/**
 * One dashboard tile.
 */
export interface DashboardTile {
  /** The queue this tile points at. */
  readonly queue: OperationalQueueId;
  /** The tile's label. */
  readonly label: string;
  /** Where the tile navigates to. */
  readonly href: string;
  /** How many rows the queue holds. */
  readonly count: DashboardCount;
  /** Whether the queue is empty. */
  readonly empty: boolean;
}

/**
 * The four counts, keyed by queue.
 *
 * **A map rather than a list,** so a tile cannot be rendered against
 * somebody else's count — the key is the queue, and the key is what the
 * tile asks for.
 */
export type DashboardCounts = Readonly<Record<OperationalQueueId, DashboardCount>>;

/**
 * Build the dashboard's four tiles, in §15.1's order.
 *
 * **The tile order is fixed** — registrations, claims, hand-offs,
 * verifications — and the set is exactly four.
 */
export function buildDashboardTiles(counts: DashboardCounts): readonly DashboardTile[] {
  return OPERATIONAL_QUEUES.map((queue) => {
    const count = counts[queue];

    return {
      queue,
      label: queueLabel(queue),
      href: queueRoute(queue),
      count,
      empty: count === 0,
    };
  });
}

/**
 * The copy a tile shows beneath its count.
 *
 * **A zero count shows `All caught up.`** (§15.1), and the tile stays
 * navigable — "Riley can still navigate to the queues." The copy is
 * therefore a property of the tile, not a replacement for the tile.
 */
export function tileEmptyCopy(tile: DashboardTile): string | null {
  return tile.empty ? DASHBOARD_ALL_CAUGHT_UP : null;
}

/**
 * True when every count is zero.
 *
 * **Used by the dashboard to decide whether to say anything at all.** The
 * answer is still "no" — §15.1 puts the copy on the *tiles*, not in a
 * dashboard-level banner — so this is a fact the dashboard may assert, not
 * a licence to render a fifth block.
 */
export function isDashboardEmpty(counts: DashboardCounts): boolean {
  return OPERATIONAL_QUEUES.every((queue) => counts[queue] === 0);
}
