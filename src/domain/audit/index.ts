/**
 * Audit and Observability — domain layer.
 *
 * Pure domain logic: no I/O, no framework imports, no Prisma. Every module
 * here is importable and testable with no database, no network, and no React
 * (coding-standards § File and folder organization).
 */

export * from './audit-event';
export * from './errors';
export * from './event-catalog';
export * from './lost-side-events';
export * from './payload-sanitizer';
export * from './quota-thresholds';
export * from './request-context';
export * from './retention-policy';
export * from './trail-query';
