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
export * from './claim-visibility-reader';
export * from './recovery-response-visibility-reader';
export * from './report-visibility-reader';
export * from './thread-visibility-reader';
