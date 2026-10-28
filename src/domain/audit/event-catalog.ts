/**
 * The frozen audit-event catalog.
 *
 * FR-31 events 1–14 and FR-48 events 15–30 are the complete numbered
 * workflow/lifecycle catalog, plus the two non-numbered records that FR-31
 * names explicitly (FR-52 profile edits, FR-53 report edits).
 *
 * **The numbering is frozen by the PRD.** It is transcribed here, not invented:
 * no entry may be added, renumbered, or removed without changing the PRD. The
 * database enforces the range with a CHECK constraint, so an application bug
 * cannot invent event 31.
 *
 * This module is pure — no I/O, no framework imports (coding-standards).
 */

/** The actor role of an audit event. A `system` actor always names its cause. */
export type AuditActorRole = 'member' | 'administrator' | 'system';

/** The entity a trail entry hangs from, which decides its retention rule. */
export type AuditParentType =
  | 'report'
  | 'claim'
  | 'recovery_response'
  | 'account'
  | 'claim_thread_message'
  | 'recovery_response_thread_message';

/**
 * A catalog entry: the frozen number, the type discriminator, and the
 * event-specific fields the PRD names for that event.
 *
 * `sensitiveFields` lists the fields that may carry an FR-37 Sensitive Field.
 * They are permitted here **only** because the PRD names them for this
 * event, and only on the administrator-visible trail — never in an
 * operational log. Everything else is denied by default.
 */
export interface CatalogEntry {
  readonly number: number;
  readonly type: string;
  readonly description: string;
  /** Fields this event may carry beyond the standard actor/target/timestamp. */
  readonly additionalFields: readonly string[];
  /**
   * Of those, the fields whose values may be an FR-37 Sensitive Field.
   * Named by the PRD for this event; permitted on the trail, barred from logs.
   */
  readonly sensitiveFields: readonly string[];
}

/**
 * Build a catalog entry. Keeping the shape in one constructor makes a typo in
 * the table a type error rather than a runtime gap.
 */
function entry(
  number: number,
  type: string,
  description: string,
  additionalFields: readonly string[] = [],
  sensitiveFields: readonly string[] = [],
): CatalogEntry {
  return { number, type, description, additionalFields, sensitiveFields };
}

/**
 * Build a non-numbered catalog entry.
 *
 * A non-numbered record has no catalog number at all — `number` is absent,
 * not a number outside the range. It carries a type discriminator so the
 * application layer can still assert which fields it may carry.
 */
function nonNumberedEntry(
  type: string,
  description: string,
  additionalFields: readonly string[] = [],
  sensitiveFields: readonly string[] = [],
): CatalogEntry {
  return {
    number: Number.NaN,
    type,
    description,
    additionalFields,
    sensitiveFields,
  };
}

/**
 * The numbered catalog, 1–30.
 *
 * FR-31 events 1–14 are the Found/account/core workflow; FR-48 events 15–30
 * are the Lost-side Recovery Response catalog.
 */
export const NUMBERED_EVENT_CATALOG: readonly CatalogEntry[] = [
  // ── FR-31: Found / account / core workflow (1–14) ──────────────────────
  entry(1, 'report.created', 'Report created', [
    'name',
    'category',
    'type',
    'date',
    'location',
    'optionalFields',
    'imagePresence',
  ]),
  entry(
    2,
    'claim.submitted',
    'Claim submitted',
    ['reason', 'identifyingDetails', 'dateLost'],
    ['reason', 'identifyingDetails'],
  ),
  entry(3, 'claim.approved', 'Claim approved', []),
  entry(4, 'claim.rejected_by_administrator', 'Claim rejected by administrator', ['reason']),
  entry(5, 'claim.auto_rejected', 'Claim auto-rejected (three triggers)', [
    'triggeredBy',
    'triggeringAction',
    'foundReportId',
    'autoRejectionReason',
  ]),
  entry(6, 'returned.confirmed_default_receiver', 'Returned confirmed (default receiver)', [
    'receiver',
  ]),
  entry(
    7,
    'returned.confirmed_substitute_receiver',
    'Returned confirmed (substitute receiver)',
    ['substituteReceiverName', 'authorizationAffirmation', 'relationship'],
    ['substituteReceiverName', 'authorizationAffirmation', 'relationship'],
  ),
  entry(8, 'report.edited_by_reporter', 'Report edited by reporter', ['changedFieldsSnapshot']),
  entry(9, 'report.found_withdrawn_by_reporter', 'Found report withdrawn by reporter', [
    'previousFoundStatus',
  ]),
  entry(10, 'report.found_closed_by_administrator', 'Found report closed by Administrator', [
    'previousFoundStatus',
    'closureReason',
  ]),
  entry(11, 'registration.approved', 'Registration approved', []),
  entry(12, 'registration.rejected', 'Registration rejected', ['reason']),
  entry(13, 'account.deactivated', 'Account deactivated', []),
  entry(
    14,
    'thread.claim_message_posted',
    'Message posted in per-claim thread',
    ['messageText'],
    ['messageText'],
  ),

  // ── FR-48: Lost-side Recovery Response (15–30) ─────────────────────────
  entry(
    15,
    'recovery_response.submitted',
    'Recovery Response submitted',
    [
      'recoveryResponseId',
      'whereFound',
      'observedIdentifyingDetails',
      'dateFound',
      'imagePresence',
    ],
    ['whereFound', 'observedIdentifyingDetails'],
  ),
  entry(
    16,
    'recovery_response.thread_message_posted',
    'Message posted in per-Recovery-Response thread',
    ['recoveryResponseId', 'messageText'],
    ['messageText'],
  ),
  entry(
    17,
    'recovery_response.selected_for_verification',
    'Recovery Response selected for verification',
    ['recoveryResponseId'],
  ),
  entry(
    18,
    'recovery_response.determined_match_confirmed',
    'Recovery Response determined Match Confirmed',
    ['recoveryResponseId', 'verificationTimestamp'],
  ),
  entry(
    19,
    'recovery_response.determined_not_a_match',
    'Recovery Response determined Not a Match',
    ['recoveryResponseId', 'verificationTimestamp'],
  ),
  entry(
    20,
    'recovery_response.withdrawn_by_responder',
    'Recovery Response withdrawn by responder',
    ['recoveryResponseId'],
  ),
  entry(
    21,
    'returned.confirmed_lost_default_receiver',
    'Returned confirmed (Lost report, default receiver)',
    ['receiver'],
  ),
  // The `lostReportId` every Lost-side event carries is the event's parent —
  // `parentType = 'report'` and `parentId` — so it is not repeated here as a
  // payload field.
  entry(
    22,
    'returned.confirmed_lost_substitute_receiver',
    'Returned confirmed (Lost report, substitute receiver)',
    ['substituteReceiverName', 'authorizationAffirmation', 'relationship'],
    ['substituteReceiverName', 'authorizationAffirmation', 'relationship'],
  ),
  entry(23, 'report.lost_withdrawn_by_reporter', 'Lost report withdrawn by reporter', [
    'previousLostStatus',
  ]),
  entry(
    24,
    'report.lost_closed_by_administrator',
    'Lost report closed by Administrator (normal closure)',
    ['previousLostStatus'],
  ),
  entry(
    25,
    'report.lost_cancelled_after_match_confirmed',
    'Lost report cancellation after Match Confirmed by Administrator (exceptional)',
    ['previousLostStatus', 'priorSelectedResponseId', 'priorSelectedResponseStatus'],
  ),
  entry(
    26,
    'report.lost_returned_child_response_resolution',
    'Lost report Returned — automatic child response resolution (parent/batch event)',
    ['childResponses', 'matchedSelectedResponseId'],
  ),
  entry(
    27,
    'report.lost_closed_child_response_resolution',
    'Lost report Closed — automatic child response resolution',
    ['childResponses', 'triggeredByRole'],
  ),
  entry(
    28,
    'report.lost_verification_pending_returned_to_open',
    'Lost report Verification Pending returned to Open after Not a Match',
    ['priorSelectedResponseId'],
  ),
  entry(
    29,
    'report.lost_transition_to_verification_pending',
    'Lost report current state transition to Verification Pending',
    ['selectedResponseId'],
  ),
  entry(
    30,
    'recovery_response.completed_report_returned',
    'Recovery Response transition to Completed — Report Returned',
    ['recoveryResponseId', 'newCanonicalStatus'],
  ),
];

/**
 * The non-numbered records.
 *
 * FR-31 names these as part of the append-only administrator-visible history
 * but gives them no workflow-event identifier. Numbering them would change a
 * frozen catalog; omitting them would leave real actions unrecorded.
 *
 * FR-31's own rule for the set is "additional audit records **explicitly
 * required by other requirements**" — so the set grows only when a
 * requirement explicitly asks for a record.
 */
export const NON_NUMBERED_EVENT_CATALOG: readonly CatalogEntry[] = [
  nonNumberedEntry('member_profile.edited', 'Member profile edited', [
    'changedFields',
    'previousValues',
  ]),
  nonNumberedEntry('report.edited_by_administrator', 'Administrator report edit', [
    'changedFields',
    'previousValues',
  ]),
  // FR-2: "The audit trail records the registration event with the user's
  // name, email, and self-declared role and timestamp." FR-31's numbered
  // catalog has no registration-submitted event, and FR-31 forbids adding
  // one — so this is a non-numbered record, the third of the kind.
  //
  // The fields are the three FR-2 names, and no more. The sanitizer denies
  // by default, so naming exactly those three permits exactly those three.
  nonNumberedEntry('registration.submitted', 'Registration submitted', [
    'displayName',
    'email',
    'selfDeclaredRole',
  ]),
];

/** The complete catalog: numbered first, then non-numbered. */
export const AUDIT_EVENT_CATALOG: readonly CatalogEntry[] = [
  ...NUMBERED_EVENT_CATALOG,
  ...NON_NUMBERED_EVENT_CATALOG,
];

const BY_TYPE = new Map<string, CatalogEntry>(
  AUDIT_EVENT_CATALOG.map((catalogEntry) => [catalogEntry.type, catalogEntry]),
);

const BY_NUMBER = new Map<number, CatalogEntry>(
  NUMBERED_EVENT_CATALOG.map((catalogEntry) => [catalogEntry.number, catalogEntry]),
);

/** Look up a catalog entry by its type discriminator. */
export function findCatalogEntryByType(type: string): CatalogEntry | undefined {
  return BY_TYPE.get(type);
}

/** Look up a numbered catalog entry by its frozen number. */
export function findCatalogEntryByNumber(number: number): CatalogEntry | undefined {
  return BY_NUMBER.get(number);
}

/** True when the type belongs to the numbered catalog. */
export function isNumberedEventType(type: string): boolean {
  return BY_NUMBER.has(BY_TYPE.get(type)?.number ?? Number.NaN);
}

/**
 * The number a type must carry, or `null` for a non-numbered record.
 *
 * The database CHECK constraint accepts NULL or 1–30; this function is what
 * decides which of the two a given type gets.
 */
export function requiredEventNumber(type: string): number | null {
  const catalogEntry = BY_TYPE.get(type);
  if (!catalogEntry) {
    return null;
  }
  return Number.isInteger(catalogEntry.number) ? catalogEntry.number : null;
}

/**
 * The fields a type may carry, beyond the standard actor/target/timestamp.
 */
export function permittedFieldsFor(type: string): readonly string[] {
  return BY_TYPE.get(type)?.additionalFields ?? [];
}

/**
 * The fields of a type whose values may be an FR-37 Sensitive Field.
 *
 * These are permitted on the administrator-visible trail because the PRD names
 * them for that event. They are never permitted in an operational log.
 */
export function sensitiveFieldsFor(type: string): readonly string[] {
  return BY_TYPE.get(type)?.sensitiveFields ?? [];
}
