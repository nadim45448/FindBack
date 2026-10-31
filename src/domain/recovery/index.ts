/**
 * Lost-Side Recovery — domain layer.
 *
 * **A separate module from `listings/`, and separate from `claims/` by
 * design.** The standards' module map names `recovery/` for the Lost-side
 * Recovery Response lifecycle (FR-40..FR-48), and the unit brief is explicit
 * that the Found-side Claim and the Lost-side Recovery Response *"must never
 * share a transition function, an aggregate, or a status enum."*
 *
 * The two workflows have separate forms, statuses, selection rules, and audit
 * trails (PRD §1, §4.4, §4.12). Sharing a module would invite exactly the
 * drift the separation exists to prevent — a Claim's `Pending` and a
 * Response's `Submitted` look alike and mean nothing alike.
 *
 * Pure domain logic: no I/O, no framework imports, no Prisma, no React.
 *
 * **This module is the single implementation point for the Recovery Response
 * status vocabulary and its transitions.** The vocabulary appears in the audit
 * event catalog, in the report-lifecycle's interaction records, and in a raw
 * SQL `UPDATE`; all of them read it from here.
 */

export * from './candidate-image-delivery';
export * from './lost-closure-decision';
export * from './lost-report-status';
export * from './lost-returned-closeout';
export * from './recovery-response';
export * from './recovery-response-date-found';
export * from './recovery-response-determination';
export * from './recovery-response-field-validator';
export * from './recovery-response-observed-details';
export * from './recovery-response-selection';
export * from './recovery-response-status';
export * from './recovery-response-submission-decision';
export * from './recovery-response-thread';
export * from './recovery-response-transition';
export * from './recovery-response-where-found';
export * from './recovery-response-withdrawal';
export * from './standby-display';
