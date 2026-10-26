/**
 * Application layer — use cases orchestrating domain + ports.
 *
 * Dependency rule: application → domain + ports. Nothing here imports Prisma,
 * Next.js, or React.
 */

export * from './audit-read-recorder';
export * from './audit-trail-reader';
export * from './audit-trail-service';
export * from './audit-writer';
export * from './classify-write-failure';
export * from './quota-monitor';

export type { AuditEventRecord, TrailCursor, TrailPage } from './ports/audit-event-repository';
export type { AuditReadLog, AuditReadLogRecord } from './ports/audit-read-log-repository';
export type { OperationalLogger } from './ports/operational-logger';
export type { QuotaLimitProvider } from './ports/quota-limit-provider';
export type { QuotaSnapshot, QuotaSnapshotRepository } from './ports/quota-snapshot-repository';
export type { QuotaUsage, QuotaUsageReader } from './ports/quota-usage-reader';
export { isTransactionHandle } from './ports/transaction-handle';
export type { TransactionHandle } from './ports/transaction-handle';
export type { TransactionFactory } from './ports/transaction-factory';
