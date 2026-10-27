/**
 * The Lost-side (FR-48) value objects and guards.
 *
 * These are the rules the PRD attaches to specific events 15–30, written as
 * code so that a firing module cannot satisfy them accidentally in one place
 * and violate them in another. ADR-9 settles the catalog's home: the Lost-side
 * catalog lives in the `audit` module, and the firing modules — unit 004's
 * `recovery/`, unit 005's `returns/`, unit 002's `listings/` — call it.
 *
 * **The audit module validates the shape of a record; it never decides whether
 * a transition is legal.** Whether a Recovery Response may be withdrawn, or
 * whether a Lost report is in `Verification Pending`, is FR-41's rule and
 * belongs to the firing module. What lives here are the checks that are
 * questions about the record's own truth: does this event claim the report's
 * owner made the determination? does this system-actor event name a human? does
 * this batch event name any child at all?
 *
 * **The determination pair is checked against the report's owner** (ADR-11).
 * Two populated fields are not a mechanism on their own — a determination
 * attributed to someone other than the owner is well-formed, would pass any
 * presence or distinctness check, and would be permanently wrong, because
 * ADR-6's append-only trail has no correction path. The check is about
 * **roles, not identity**: `administrator` is a flag on an Account, so the
 * same person may legitimately fill both halves in two capacities.
 *
 * Pure — no I/O, no framework imports, no Prisma, no React.
 */

import type { AuditActorRole, AuditParentType } from './event-catalog';

/**
 * The eight canonical Recovery Response statuses (FR-41), verbatim.
 *
 * The values are the PRD's own names. `Standby` is a derived display
 * condition and is deliberately absent — it is never a persisted status.
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
 * The Lost report's own lifecycle statuses.
 *
 * `Match Confirmed` is a **Recovery Response** status, never a Lost-report
 * status — the PRD says so explicitly, twice — so it is absent here.
 */
export const LOST_REPORT_STATUSES = ['Open', 'Verification Pending', 'Returned', 'Closed'] as const;

/** A Lost report's lifecycle status. */
export type LostReportStatus = (typeof LOST_REPORT_STATUSES)[number];

/**
 * The prior Lost-report lifecycle status a Lost-side event may record.
 *
 * The value set is narrower than the full lifecycle: only the two pre-terminal
 * statuses can be the *prior* status of a transition the PRD's events record.
 */
export type PriorLostReportStatus = 'Open' | 'Verification Pending';

/** The outcome a determination records. */
export type DeterminationOutcome = 'match_confirmed' | 'not_a_match';

/**
 * A Recovery Response, identified together with the Lost report that owns it.
 *
 * Both are required on every Lost-side event, so a Lost-side event can never
 * be read without knowing which report it belongs to.
 */
export interface RecoveryResponseRef {
  readonly recoveryResponseId: string;
  readonly lostReportId: string;
}

/**
 * The owner-determines / administrator-records pair (FR-48 events 18 and 19).
 *
 * `determinedByUserId` is the Lost-report owner; `recordedByAdministratorId` is
 * the acting administrator. Both are mandatory, and the maker is checked
 * against the report's owner.
 */
export interface DeterminationActor {
  readonly determinedByUserId: string;
  readonly recordedByAdministratorId: string;
}

/**
 * The human a system-actor event names.
 *
 * A `system` actor always names its cause. The cause is either an
 * administrator (events 26, 27, 28, 30) or a member — the owner who selected
 * (event 29) or the reporter who withdrew (event 27).
 */
export interface SystemActorCause {
  readonly actingAdministratorId: string | null;
  readonly actingMemberId: string | null;
  /** Whether the cause was an administrator or the reporter. */
  readonly triggeredByRole: 'administrator' | 'reporter' | 'owner';
}

/**
 * A child response a batch event resolved, with the status it was in.
 *
 * The prior status is captured atomically with the after-state — FR-41
 * requires the *source* status, and FR-48 event 25 requires the status at
 * close time.
 */
export interface ResolvedResponse {
  readonly recoveryResponseId: string;
  readonly previousStatus: RecoveryResponseStatus;
}

/**
 * The set of child responses a batch event (26 or 27) resolved.
 *
 * **The set is passed, not re-derived** (ADR-10). The firing module obtains
 * it from the batch update's own `RETURNING` clause, inside the transaction
 * that performs the resolution, and passes it here unmodified. The audit
 * module validates the set's *shape* — non-empty, every entry carrying an id
 * and a prior status — and records it verbatim. It cannot verify that the set
 * corresponds to what the transaction resolved, because the
 * `recovery_responses` table belongs to unit 004 and the audit module must
 * not read it. That limitation is stated as a contract, not claimed as an
 * invariant.
 */
export interface BatchResolution {
  readonly resolvedResponses: readonly ResolvedResponse[];
  /** The terminal status every child in the set reached. */
  readonly targetStatus: 'Resolved — Report Returned' | 'Resolved — Report Closed';
}

/**
 * The matched selected response, named inside event 26.
 *
 * This is what ties the parent batch record (26) to the individual terminal
 * record (30): event 26's own list covers only the **non-selected**
 * non-terminal responses, and this reference names the one that is recorded
 * individually under event 30.
 */
export interface ChildResponseReference {
  readonly recoveryResponseId: string;
  /** The canonical status the matched response reaches. */
  readonly newStatus: 'Completed — Report Returned';
  /** The event number the matched response is recorded under. */
  readonly recordedUnderEventNumber: 30;
}

/**
 * The determination maker is not the report's owner (ADR-11).
 *
 * A fatal defect: the write is refused, the caller's transaction rolls back,
 * and the failure is logged as a defect. The determination is never recorded
 * with a corrected value and never recorded as a best-effort event.
 */
export class DeterminationActorError extends Error {
  readonly eventType: string;

  constructor(eventType: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.eventType = eventType;
  }
}

/**
 * A system-actor event (26–30) was built with no causing human.
 *
 * The schema's `actor_id` is `uuid not null`, and a system event that cannot
 * name a human has no valid row. Refused rather than written.
 */
export class SystemActorCauseError extends Error {
  readonly eventType: string;

  constructor(eventType: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.eventType = eventType;
  }
}

/**
 * A batch event (26, 27) was built with an empty or malformed resolved set,
 * or event 26 was built without a matched response reference.
 */
export class BatchResolutionError extends Error {
  readonly eventType: string;

  constructor(eventType: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.eventType = eventType;
  }
}

/**
 * The Returned closeout's event 26 and event 30 disagree.
 *
 * The matched response id in event 26 must be the one event 30 records. If
 * they disagree, neither is written.
 */
export class EventPairingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * A Lost-side event's required field was missing.
 *
 * A missing required field is a defect, not a business outcome — the same
 * refusal the catalog-aware sanitizer makes for a field the catalog does not
 * name.
 */
export class LostSideFieldError extends Error {
  readonly eventType: string;
  readonly field: string;

  constructor(eventType: string, field: string, message?: string) {
    super(message ?? `Audit event "${eventType}" requires the field "${field}".`);
    this.name = new.target.name;
    this.eventType = eventType;
    this.field = field;
  }
}

/**
 * Validate the determination pair (ADR-11).
 *
 * Three refusals, in order:
 *
 * 1. **Either half missing.** The pair is a required shape, not two optional
 *    fields.
 * 2. **The maker is not the report's owner.** This is the check that makes
 *    the event meaningful — FR-43 is emphatic that the administrator does not
 *    independently decide the item belongs to the owner.
 * 3. **The recorder is missing.** The `recorded_by` half names the acting
 *    administrator, and it is what distinguishes an administrator-records
 *    write from a self-determined one.
 *
 * The two halves are distinct in **role**, not necessarily in identity. A
 * draft where the same id fills both halves is **not** refused: where the
 * owner is themselves an administrator acting in their administrator capacity,
 * that is a legitimate determination, and refusing it would push operators
 * toward fabricating a second identity.
 *
 * @throws {DeterminationActorError} when the pair is incomplete or the maker
 * is not the report's owner.
 */
export function assertDeterminationPair(
  eventType: string,
  determination: DeterminationActor,
  lostReportOwnerId: string,
): void {
  if (!determination.determinedByUserId) {
    throw new DeterminationActorError(
      eventType,
      `Audit event "${eventType}" requires determined_by_user_id — the Lost-report owner who made the determination.`,
    );
  }

  if (!determination.recordedByAdministratorId) {
    throw new DeterminationActorError(
      eventType,
      `Audit event "${eventType}" requires recorded_by_administrator_id — the acting administrator who recorded the determination.`,
    );
  }

  if (determination.determinedByUserId !== lostReportOwnerId) {
    throw new DeterminationActorError(
      eventType,
      `Audit event "${eventType}" names a determination-maker who is not the owner of the Lost report.`,
    );
  }
}

/**
 * Resolve the actor a system-actor event carries, refusing one that names no
 * human.
 *
 * The `actorId` column is `uuid not null`, so a system event always names the
 * human it acted on behalf of. The `system` role is set here and **only** for
 * events 26–30; every other Lost-side event carries a human actor directly.
 *
 * @throws {SystemActorCauseError} when the cause names neither an
 * administrator nor a member.
 */
export function resolveSystemActor(
  eventType: string,
  cause: SystemActorCause,
): { actorId: string; actorRole: AuditActorRole; actingAdministratorId: string | null } {
  if (cause.actingAdministratorId) {
    return {
      actorId: cause.actingAdministratorId,
      actorRole: 'system',
      actingAdministratorId: cause.actingAdministratorId,
    };
  }

  if (cause.actingMemberId) {
    return {
      actorId: cause.actingMemberId,
      actorRole: 'system',
      actingAdministratorId: null,
    };
  }

  throw new SystemActorCauseError(
    eventType,
    `Audit event "${eventType}" is a system-actor event and must name the human who caused it.`,
  );
}

/**
 * Validate a batch resolution's shape (ADR-10).
 *
 * The set must be non-empty — a batch event with an empty list records
 * nothing and must not be written — and every entry must carry a response id
 * and a prior status.
 *
 * @throws {BatchResolutionError} when the set is empty or malformed.
 */
export function assertBatchShape(eventType: string, batch: BatchResolution): void {
  if (batch.resolvedResponses.length === 0) {
    throw new BatchResolutionError(
      eventType,
      `Audit event "${eventType}" is a batch event and must name at least one resolved child response.`,
    );
  }

  for (const resolved of batch.resolvedResponses) {
    if (!resolved.recoveryResponseId) {
      throw new BatchResolutionError(
        eventType,
        `Audit event "${eventType}" carries a resolved child response with no id.`,
      );
    }

    if (!RECOVERY_RESPONSE_STATUSES.includes(resolved.previousStatus)) {
      throw new BatchResolutionError(
        eventType,
        `Audit event "${eventType}" carries a child response whose prior status "${resolved.previousStatus}" is not one of FR-41's canonical statuses.`,
      );
    }
  }
}

/**
 * Validate that event 26 and event 30 name the same matched response.
 *
 * @throws {EventPairingError} when the two disagree.
 */
export function assertReturnedPairing(matchedResponseId: string, event30ResponseId: string): void {
  if (matchedResponseId !== event30ResponseId) {
    throw new EventPairingError(
      'The Returned closeout names a different matched response in event 26 and event 30. Neither event was written.',
    );
  }
}

/**
 * Whether a status is one of FR-41's canonical Recovery Response statuses.
 */
export function isRecoveryResponseStatus(value: string): value is RecoveryResponseStatus {
  return (RECOVERY_RESPONSE_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether a value is one of the two prior Lost-report lifecycle statuses.
 *
 * `Match Confirmed` is refused here by construction — it is not a Lost-report
 * status, and FR-31 event 10 says so explicitly.
 */
export function isPriorLostReportStatus(value: string): value is PriorLostReportStatus {
  return value === 'Open' || value === 'Verification Pending';
}

/** The parent a Lost-side event hangs from. */
export type LostSideParentType = Extract<AuditParentType, 'report' | 'recovery_response'>;
