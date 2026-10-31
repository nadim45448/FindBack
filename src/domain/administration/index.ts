/**
 * The administrator surface — domain layer.
 *
 * Pure domain logic for the administrator's dashboard, the four operational
 * queues, the contextual audit trail's view model, and FR-30's absence of an
 * in-app notification stream.
 *
 * **Nothing here reads or writes.** The domain states *what belongs in a
 * queue*, *what a tile shows*, *how an audit row renders*, and *what a
 * notification surface would look like if one existed* — and the
 * application and infrastructure layers do the reading and the writing.
 *
 * Pure — no I/O, no framework imports, no Prisma, no React.
 */

export * from './audit-view';
export * from './dashboard-tiles';
export * from './notification-absence';
export * from './operational-queues';
export * from './storage-usage';
