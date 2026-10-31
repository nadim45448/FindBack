/**
 * The administrator surface — application layer.
 *
 * The use cases that read the dashboard's four counts, the four operational
 * queues, and the contextual audit trail.
 *
 * **Every use case authorises before it reads.** The check lives here, in
 * the application layer, so a non-administrator never reaches the database
 * and never receives a count, a row, or a signal about whether there is any
 * work.
 *
 * Dependency rule: application → domain + ports. Nothing here imports
 * Prisma, Next.js, or React.
 */

export * from './administrator-dashboard-query';
export * from './administrator-queue-query';
export * from './contextual-audit-query';
export * from './storage-usage-query';
export * from './ports';
