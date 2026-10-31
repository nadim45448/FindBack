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
export * from './claim';
export * from './claim-auto-rejection';
export * from './claim-auto-rejection-copy';
export * from './claim-date-lost';
export * from './claim-decision';
export * from './claim-decision-events';
export * from './claim-field-validator';
export * from './claim-identifying-details';
export * from './claim-projection';
export * from './claim-reason';
export * from './claim-review';
export * from './claim-status';
export * from './claim-submission-decision';
export * from './claim-submitted-event';
export * from './claim-thread';
export * from './claim-thread-event';
export * from './claim-thread-participation';
export * from './found-report-status';
export * from './exact-place';
export {
  WITHDRAWAL_CLAIM_REJECTION_REASON,
  isResolvedByReportWithdrawal,
  RECOVERY_RESPONSE_RESOLVED_CLOSED_STATUS,
  WITHDRAWAL_RESOLVED_RECOVERY_RESPONSE_STATUSES,
  type PendingClaimToReject,
  type RecoveryResponseStatus,
  type WithdrawalResolvedRecoveryResponse,
} from './report-interaction-records';
export * from './identifying-details';
export * from './image-content-type';
export * from './image-delivery';
export * from './image-dimensions';
export * from './image-quota';
export * from './image-ref';
export * from './item-detail-sections';
export * from './member-navigation';
export * from './projection-column';
export * from './report-category';
export * from './report-closure-reason';
export * from './report-created-event';
export * from './report-date';
export * from './report-close-event';
export * from './report-deletion-decision';
export * from './report-description';
export * from './report-editable-fields';
export * from './report-edit-snapshot';
export * from './report-field-set';
export * from './report-field-validator';
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
export * from './report-action-gate';
export * from './recovery-response-projection';
export * from './terminal-status';
export * from './thread-projection';
export * from './thread-read-only-notice';
export * from './viewer';
export * from './visibility-projection';
export * from './visibility-resolver';
