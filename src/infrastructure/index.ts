/**
 * Infrastructure layer — interfaces the outside world implements.
 *
 * Prisma, Blob, email, and session implementations live here.
 *
 * Dependency rule: infrastructure → domain + application ports.
 */

export * from './audit/fr10-audit-deletion';
export * from './audit/prisma-audit-event-repository';
export * from './audit/prisma-audit-read-log-repository';
export * from './audit/prisma-quota-snapshot-repository';
export * from './audit/quota-usage-providers';
export * from './audit/static-quota-limit-provider';
export * from './audit/stdout-operational-logger';
export * from './db/prisma-transaction-factory';
export { prisma } from './db/prisma';
