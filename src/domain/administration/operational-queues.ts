/**
 * The four administrator queues — the operational queues of FR-33.
 *
 * ## Why this module exists
 *
 * The dashboard's four tiles and the four queue screens must **never
 * disagree**. The story says so directly: *"the count matches the number of
 * rows the corresponding queue returns under its own filter"*, and the
 * technical note says *"Counts are derived from the same query that
 * populates each queue so the dashboard can never disagree with the work it
 * points to."*
 *
 * The way to make that structural rather than aspirational is to define the
 * queues **once** — here — as the pair of (filter, route) that the tile and
 * the queue share. A tile that named a fifth filter, or a queue that
 * filtered differently from its tile, would then be a type error rather than
 * a visual bug.
 *
 * ## The four are the four
 *
 * **Audit is not one of them.** It is cross-cutting and contextual
 * (EXPERIENCE.md §15.1, §17.1): there is no `/admin/audit` route, no fifth
 * tile, and no queue link to one. The set below has four members and the
 * dashboard renders exactly those four — the *absence* is enforced by the
 * type, not by remembering not to add a fifth.
 *
 * **The sides are kept apart.** Pending Claims and Items Awaiting Return
 * are Found-side; Items in Verification is Lost-side. FR-34 and FR-35 name
 * the Found side explicitly and FR-50 names the Lost side explicitly, and
 * mixing them would lose the operational distinction the product makes.
 *
 * ## The filters are the PRD's
 *
 * Each queue's filter is the PRD's own membership rule, stated as data:
 *
 * | Queue | Filter |
 * |---|---|
 * | Pending Registrations | accounts in `Pending` |
 * | Pending Claims | Found reports' Claims in `Pending` |
 * | Items Awaiting Return | Found reports in `Claim Approved` |
 * | Items in Verification | Lost reports in `Verification Pending` |
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The four operational queues.
 *
 * **The identifiers are the queue's route,** so a queue and its route
 * cannot drift apart — the dashboard tile's `href` and the page's own
 * address are the same string.
 */
export const OPERATIONAL_QUEUE_IDS = [
  'pending-registrations',
  'pending-claims',
  'awaiting-return',
  'verifications',
] as const;

/** An operational queue's identifier. */
export type OperationalQueueId = (typeof OPERATIONAL_QUEUE_IDS)[number];

/**
 * The route each queue lives at.
 *
 * **The routes are the PRD's / the spine's,** verbatim from EXPERIENCE.md
 * §3.1's site map and §15.2–§15.5.
 */
export const OPERATIONAL_QUEUE_ROUTES: Readonly<Record<OperationalQueueId, string>> =
  Object.freeze({
    'pending-registrations': '/admin/registrations',
    'pending-claims': '/admin/claims',
    'awaiting-return': '/admin/awaiting-return',
    verifications: '/admin/verifications',
  });

/**
 * The tile label each queue shows.
 *
 * **§15.1's four labels, verbatim.** The dashboard's tile and the queue's
 * own heading share the string, so they cannot drift.
 */
export const OPERATIONAL_QUEUE_LABELS: Readonly<Record<OperationalQueueId, string>> =
  Object.freeze({
    'pending-registrations': 'Pending Registrations',
    'pending-claims': 'Pending Claims',
    'awaiting-return': 'Items Awaiting Return',
    verifications: 'Items in Verification',
  });

/**
 * The side each queue belongs to.
 *
 * `Found` and `Lost` are the PRD's report types. `Account` is neither —
 * the Pending Registrations queue is about accounts, not reports — and it
 * is named `Account` rather than being given a side it does not have.
 */
export type QueueSide = 'Found' | 'Lost' | 'Account';

/** The side each queue belongs to. */
export const OPERATIONAL_QUEUE_SIDES: Readonly<Record<OperationalQueueId, QueueSide>> =
  Object.freeze({
    'pending-registrations': 'Account',
    'pending-claims': 'Found',
    'awaiting-return': 'Found',
    verifications: 'Lost',
  });

/**
 * The membership filter of each queue.
 *
 * **The filter is data, not a query.** The infrastructure layer turns it
 * into SQL; the domain states what "belongs in this queue" means, and the
 * tile's count and the queue's rows are both derived from it.
 */
export type QueueFilter =
  /** Accounts whose status is `Pending`. */
  | { readonly kind: 'AccountStatus'; readonly status: 'Pending' }
  /** Claims in `Pending` against a report of the given type. */
  | { readonly kind: 'ClaimStatus'; readonly reportType: 'Found'; readonly status: 'Pending' }
  /** Reports of the given type in the given status. */
  | { readonly kind: 'ReportStatus'; readonly reportType: 'Found' | 'Lost'; readonly status: string };

/** The membership filter of each queue. */
export const OPERATIONAL_QUEUE_FILTERS: Readonly<Record<OperationalQueueId, QueueFilter>> =
  Object.freeze({
    'pending-registrations': { kind: 'AccountStatus', status: 'Pending' },
    'pending-claims': { kind: 'ClaimStatus', reportType: 'Found', status: 'Pending' },
    'awaiting-return': { kind: 'ReportStatus', reportType: 'Found', status: 'Claim Approved' },
    verifications: {
      kind: 'ReportStatus',
      reportType: 'Lost',
      status: 'Verification Pending',
    },
  });

/**
 * The empty-state copy each queue shows.
 *
 * **§15.2–§15.5's copy, verbatim,** and **per queue** — the empty state is
 * not shared boilerplate, because each queue's sentence says something
 * different about that queue.
 *
 * The Pending Registrations queue carries a second line; it is the one queue
 * whose empty state has a note.
 */
export const OPERATIONAL_QUEUE_EMPTY_COPY: Readonly<Record<OperationalQueueId, string>> =
  Object.freeze({
    'pending-registrations': 'No pending registrations.',
    'pending-claims': 'No pending claims.',
    'awaiting-return': 'No items are awaiting return.',
    verifications: 'No items are in verification.',
  });

/**
 * The note under the Pending Registrations queue's empty state.
 *
 * **§15.2 names it exactly:** *"When someone new registers, they appear
 * here."* The other three queues have no note.
 */
export const PENDING_REGISTRATIONS_EMPTY_NOTE = 'When someone new registers, they appear here.';

/**
 * The empty-state note for a queue.
 *
 * `null` for the three queues §15.2–§15.5 give no note to.
 */
export function emptyStateNoteFor(queue: OperationalQueueId): string | null {
  return queue === 'pending-registrations' ? PENDING_REGISTRATIONS_EMPTY_NOTE : null;
}

/**
 * The empty-state copy the dashboard's tile shows.
 *
 * **§15.1:** *"If all counts are zero, each tile shows 'All caught up.' with
 * a subtle check icon."*
 *
 * The copy is **per tile**, not a dashboard-level empty state — a
 * dashboard-level empty state would be a fifth thing on the page that is not
 * a tile.
 */
export const DASHBOARD_ALL_CAUGHT_UP = 'All caught up.';

/**
 * The dashboard's four tiles, in order.
 *
 * **§15.1's order, verbatim.** The order is the one the administrator reads
 * in: registrations, claims, hand-offs, verifications.
 */
export const OPERATIONAL_QUEUES: readonly OperationalQueueId[] = Object.freeze([
  'pending-registrations',
  'pending-claims',
  'awaiting-return',
  'verifications',
]);

/**
 * The route a queue's tile navigates to.
 *
 * The tile is a **link**, not a click handler on a non-interactive element
 * (story 007's technical note): "Every tile must therefore be a real link."
 */
export function queueRoute(queue: OperationalQueueId): string {
  return OPERATIONAL_QUEUE_ROUTES[queue];
}

/**
 * The label a queue's tile shows.
 */
export function queueLabel(queue: OperationalQueueId): string {
  return OPERATIONAL_QUEUE_LABELS[queue];
}

/**
 * The empty-state copy a queue shows.
 */
export function queueEmptyCopy(queue: OperationalQueueId): string {
  return OPERATIONAL_QUEUE_EMPTY_COPY[queue];
}

/**
 * True when the value names one of the four operational queues.
 *
 * Used at the route boundary, where an unknown queue id is a `404` rather
 * than a queue that silently renders nothing.
 */
export function isOperationalQueueId(value: string): value is OperationalQueueId {
  return (OPERATIONAL_QUEUE_IDS as readonly string[]).includes(value);
}
