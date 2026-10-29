/**
 * Reporting and Listings — domain layer.
 *
 * Pure domain logic: no I/O, no framework imports, no Prisma, no `node:crypto`.
 * Every module here is importable and testable with no database, no network,
 * and no React (coding-standards § File and folder organization).
 *
 * **This module is the single implementation point for FR-39.** The visibility
 * matrix is a pure function of a viewer and a report, so it is expressed here
 * as one — with no I/O, so it can be asserted against fixtures before a single
 * report row exists. Every later read path inherits it rather than
 * re-deciding visibility for itself.
 *
 * The module is named `listings/` because the standards' module map names
 * `listings/` for "Report CRUD, search, visibility projection"
 * (`system-architecture.md` § Module map) — the same reasoning ADR-13
 * recorded for `accounts/`.
 */

export * from './audit-trail-projection';
export * from './bounded-text';
export * from './campus-area-value';
export * from './claim-projection';
export * from './exact-place';
export * from './identifying-details';
export * from './image-content-type';
export * from './image-delivery';
export * from './image-quota';
export * from './image-ref';
export * from './projection-column';
export * from './report-category';
export * from './report-created-event';
export * from './report-date';
export * from './report-deletion-decision';
export * from './report-description';
export * from './report-editable-fields';
export * from './report-edit-snapshot';
export * from './report-field-set';
export * from './report-field-validator';
export * from './report-interaction-records';
export * from './report-lifecycle-events';
export * from './report-lifecycle-messages';
export * from './report-listing-filter';
export * from './report-listing-result';
export * from './report-name';
export * from './report-pagination';
export * from './report-partition';
export * from './report-projection';
export * from './report-relationship';
export * from './report-status';
export * from './report-status-view';
export * from './report-type';
export * from './report-withdrawal-decision';
export * from './report';
export * from './recovery-response-projection';
export * from './terminal-status';
export * from './thread-projection';
export * from './viewer';
export * from './visibility-projection';
export * from './visibility-resolver';
