/**
 * The Recovery Response's status — FR-41's canonical eight.
 *
 * **This module is the single implementation point for the Recovery Response
 * status vocabulary.** The vocabulary appears in the audit event catalog, in
 * the report-lifecycle's interaction records, in a raw SQL `UPDATE`, and in
 * the database's `CHECK` constraint. All of them name the same eight values,
 * and this is where they are named.
 *
 * **The literals are the PRD's, verbatim** (coding-standards § Naming
 * conventions: "Status literals are named after the PRD, verbatim"). They are
 * never renamed — not `MATCH_CONFIRMED`, not `CompletedReportReturned`, not
 * `Completed`. `Completed — Report Returned` keeps its em dash.
 *
 * ## `Standby` is not a status
 *
 * **`Standby` is a display condition, never a persisted value** (FR-41, D7).
 * It is derived at render time for a sibling of the response that is
 * `Selected for Verification`, and the stored status of that sibling remains
 * `Submitted`.
 *
 * It is deliberately **absent from the vocabulary below**, and that absence is
 * load-bearing: a type that listed `Standby` would let it be persisted, and a
 * persisted `Standby` would be a status that no transition can produce and no
 * rule could reason about. The database's `CHECK` constraint rejects it, and
 * this type cannot express it.
 *
 * ## `Match Confirmed` is non-terminal
 *
 * **This is the single most consequential fact in the Lost-side state
 * machine.** `Match Confirmed` records that the owner determined a match, but
 * it is *not* an ending: the Lost report stays `Verification Pending` until an
 * administrator confirms the physical hand-off (Unit 005, FR-42, FR-45).
 *
 * Treating it as terminal would close the workflow before the item reached
 * its owner — so the terminal set below **excludes** it, and
 * `isTerminalRecoveryResponseStatus` returns `false` for it everywhere it is
 * evaluated.
 *
 * ## The two state machines do not share an enum
 *
 * The Found-side Claim status (`Pending`, `Approved`, `Rejected`, `Returned`)
 * lives in its own module and is not importable from here. Unit 003 and Unit
 * 004 are separate workflows with separate forms, statuses, selection rules,
 * and audit trails (PRD §1, §4.4, §4.12), and the standards' module map keeps
 * them in separate directories for that reason.
 *
 * Pure — no I/O, no framework imports, no Prisma.
 */

/**
 * The eight canonical Recovery Response statuses (FR-41), verbatim.
 *
 * `Standby` is absent by design — see the module's own note.
 */
export const RECOVERY_RESPONSE_STATUSES = [
  'Submitted',
  'Selected for Verification',
  'Match Confirmed',
  'Not a Match',
  'Completed — Report Returned',
  'Resolved — Report Returned',
  'Resolved — Report Closed',
  'Withdrawn',
] as const;

/** A Recovery Response's canonical status. */
export type RecoveryResponseStatus = (typeof RECOVERY_RESPONSE_STATUSES)[number];

/**
 * The statuses a Recovery Response can never leave.
 *
 * **Five terminal statuses:** `Not a Match`, `Completed — Report Returned`,
 * `Resolved — Report Returned`, `Resolved — Report Closed`, and `Withdrawn`.
 *
 * **`Match Confirmed` is absent**, and its absence is the point. It is
 * non-terminal: the response is still in play while the administrator
 * confirms the physical return.
 */
export const TERMINAL_RECOVERY_RESPONSE_STATUSES: readonly RecoveryResponseStatus[] =
  Object.freeze([
    'Not a Match',
    'Completed — Report Returned',
    'Resolved — Report Returned',
    'Resolved — Report Closed',
    'Withdrawn',
  ]);

/**
 * The statuses a Recovery Response may still leave.
 *
 * **The complement of the terminal set**, derived rather than written out —
 * so a status added to the vocabulary is classified by exactly one of the two
 * sets, and a status listed in both is impossible.
 */
export const NON_TERMINAL_RECOVERY_RESPONSE_STATUSES: readonly RecoveryResponseStatus[] =
  Object.freeze(
    RECOVERY_RESPONSE_STATUSES.filter(
      (status) => !TERMINAL_RECOVERY_RESPONSE_STATUSES.includes(status),
    ),
  );

/** True when `value` is one of the eight canonical statuses. */
export function isRecoveryResponseStatus(value: string): value is RecoveryResponseStatus {
  return (RECOVERY_RESPONSE_STATUSES as readonly string[]).includes(value);
}

/** True when the status accepts no further change. */
export function isTerminalRecoveryResponseStatus(status: RecoveryResponseStatus): boolean {
  return TERMINAL_RECOVERY_RESPONSE_STATUSES.includes(status);
}

/** True when the status may still change. */
export function isNonTerminalRecoveryResponseStatus(status: RecoveryResponseStatus): boolean {
  return NON_TERMINAL_RECOVERY_RESPONSE_STATUSES.includes(status);
}

/**
 * The status a response is created with.
 *
 * **A new Recovery Response is always `Submitted`.** It is not a parameter:
 * no flow creates a response in any other status.
 */
export const INITIAL_RECOVERY_RESPONSE_STATUS: RecoveryResponseStatus = 'Submitted';
