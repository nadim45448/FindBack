/**
 * The listings module's ports.
 *
 * These are the module's own capabilities, not cross-cutting ones — the same
 * rule ADR-9 applied to the audit event catalog. They live under
 * `application/listings/ports/` rather than the shared `application/ports/`.
 *
 * Every reader port takes the **resolved column set**, never the viewer.
 * That signature is the mechanism that makes FR-39's "never loaded"
 * structural rather than promised: the authorisation decision is upstream of
 * the query, so the `SELECT` list can be derived from it.
 */

export * from './audit-trail-visibility-reader';
export * from './campus-area-reader';
export * from './claim-decision-reader';
export * from './claim-decision-repository';
export * from './claim-repository';
export * from './claim-review-reader';
export * from './claim-thread-reader';
export * from './claim-thread-repository';
export * from './claim-visibility-reader';
export * from './image-quota-reader';
export * from './lost-report-subject-reader';
export * from './member-dashboard-reader';
export * from './pending-claim-reader';
export * from './image-reader';
export * from './image-store';
export * from './recovery-response-responder-reader';
export * from './recovery-response-selection-repository';
export * from './recovery-response-thread-reader';
export * from './recovery-response-thread-repository';
export * from './recovery-response-visibility-reader';
export * from './recovery-response-withdrawal-repository';
export * from './report-image-reader';
export * from './report-listing-reader';
export * from './report-repository';
export * from './report-visibility-reader';
export * from './return-confirmation-repository';
export * from './return-subject-reader';
export * from './thread-visibility-reader';
