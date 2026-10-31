/**
 * The Confirm Returned decision — FR-23, FR-24, and FR-25 in one place.
 *
 * **One implementation for both recovery directions.** This module is the
 * single place that decides whether a report may become `Returned`, who the
 * receiver is, and which audit event the confirmation writes. Unit 005's
 * brief is explicit: *"Both directions converge here. There must be exactly
 * **one** Confirm Returned implementation, not one per side — otherwise the
 * receiver and substitute rules drift apart."*
 *
 * ## `Returned` is reachable only from here
 *
 * The PRD is emphatic. §4.5: *"**`Returned` is reachable only through
 * administrator confirmation of physical return (FR-22, FR-23, FR-24, FR-45).
 * No reporter withdrawal, no auto-transition, no timeout.**" And §4.6: *"The
 * item status transitions to **Returned**, terminal."*
 *
 * **So the module owns the transition and nothing else does.** The Found
 * side's `found-report-status.ts` has no `Returned` cause, and the Lost
 * side's `lost-report-status.ts` says so in its own note: *"`Returned` is
 * reachable only through Unit 005's explicit administrator Confirm Returned
 * action… A table that listed it would make the thing the story forbids one
 * line away."*
 *
 * ## The two precondition statuses differ, and the difference is the direction
 *
 * | Report | Status it must be in |
 * |---|---|
 * | `Found` | `Claim Approved` |
 * | `Lost` | `Verification Pending` |
 *
 * **FR-23 names the Found precondition** — *"An administrator can confirm
 * Returned on a report whose status is **Claim Approved**"* — and FR-45 names
 * the Lost one: *"The Lost report transitions from `Verification Pending` to
 * `Returned`"*, and *"The administrator confirms physical return **only
 * after** the owner has recorded `Match Confirmed` via the administrator."*
 *
 * **A Found report in `Verification Pending` is refused, and a Lost report in
 * `Claim Approved` is refused.** The precondition table is keyed by report
 * type for the same reason the receiver table is: a single list of acceptable
 * statuses would let a Found report be confirmed from the Lost side's
 * precondition, which is a report state that cannot exist for it.
 *
 * ## The guard is absolute
 *
 * **FR-25: "The system refuses to confirm Returned without a recorded
 * receiver (default or substitute)."** The guard is not a warning and not a
 * soft default — story 003 says so twice: *"The guard is **absolute**"*, and
 * *"It must be enforced at the domain boundary, not only in the form, so that
 * an API caller cannot bypass it."*
 *
 * **So the guard lives here, in the domain, and the domain is the only place
 * that decides.** The route's form and the database's constraint are
 * *replicas* of this rule, not the rule itself.
 *
 * ## The receiver is one of two shapes
 *
 * **A default receiver is an account id. A substitute is a name plus an
 * authorization plus a relationship.** The confirmation carries exactly one
 * of the two, and the two are **not interchangeable**: a substitute has no
 * account to point at.
 *
 * **When the substitute *is* the default receiver, the extra fields are
 * omitted rather than left blank.** Story 002: *"When the substitute is the
 * default receiver, the extra fields would be noise and are omitted rather
 * than left blank."* So the decision carries `substitute: null` in that case
 * — and the *event* is the default-receiver event, not the substitute one.
 *
 * Pure — no I/O, no framework imports.
 */

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type { ReportType } from '@/domain/listings';

import {
  deriveDefaultReceiver,
  type DefaultReceiver,
  type DefaultReceiverFacts,
} from './default-receiver';
import {
  createSubstituteReceiver,
  type SubstituteReceiver,
} from './substitute-receiver';

/** The report status a confirmation moves the report to. */
export const RETURNED_REPORT_STATUS = 'Returned';

/**
 * The status a report must be in to be confirmed Returned, by report type.
 *
 * **The table is total over the two report types,** and a report type
 * outside it is refused rather than defaulted.
 */
const REQUIRED_PRECONDITION_STATUS: Readonly<Record<ReportType, string>> = Object.freeze({
  Found: 'Claim Approved',
  Lost: 'Verification Pending',
});

/**
 * The precondition status for a report type.
 *
 * @throws {Error} when the report type is not one of the two — a caller that
 * invented a type would be deciding about a report that cannot exist.
 */
export function requiredPreconditionStatus(reportType: ReportType): string {
  const status = REQUIRED_PRECONDITION_STATUS[reportType];

  if (status === undefined) {
    throw new Error(
      `"${String(reportType)}" is not a report type. This is a defect.`,
    );
  }

  return status;
}

/** Why a confirmation was refused. */
export type ConfirmReturnedRefusalReason =
  /** The actor is not an administrator. */
  | 'NotAdministrator'
  /** The report does not exist, or is not a report this system has. */
  | 'ReportNotFound'
  /** The report is already `Returned` or `Closed`. */
  | 'TerminalStatus'
  /** The report is not in the status its direction requires. */
  | 'PreconditionNotMet'
  /** The report has no approved Claim, so it has no default receiver. */
  | 'NoDefaultReceiver'
  /** FR-25: no receiver and no substitute. */
  | 'NoReceiver';

/**
 * The outcome of a Confirm Returned decision.
 *
 * **The permitted outcome carries the receiver, because the receiver is the
 * decision.** The caller writes what the decision named rather than
 * repeating the literals.
 */
export type ConfirmReturnedDecision =
  | {
      readonly kind: 'Permitted';
      /** The default receiver, when the item went to the person with a right to it. */
      readonly defaultReceiver: DefaultReceiver | null;
      /** The substitute, when the item went to somebody else. */
      readonly substitute: SubstituteReceiver | null;
      /** The report status the report reaches. Always `Returned`. */
      readonly reportStatus: typeof RETURNED_REPORT_STATUS;
    }
  | { readonly kind: 'Refused'; readonly reason: ConfirmReturnedRefusalReason };

/** The facts the decision reads. */
export interface ConfirmReturnedFacts {
  /** The report's type. */
  readonly reportType: ReportType;
  /** The report's current status. */
  readonly reportStatus: string;
  /** The report's owner — the member who created it. */
  readonly reporterId: string;
  /** The claimant on the report's approved Claim, or `null`. */
  readonly approvedClaimantId: string | null;
  /** Whether the actor is an administrator. */
  readonly isAdministrator: boolean;
  /**
   * The substitute the administrator recorded, or `null`.
   *
   * **`null` means the default receiver physically received the item.** The
   * three substitute fields are all-or-nothing (FR-24), so a partial
   * substitute cannot reach this module as a partial value — it is rejected
   * by `createSubstituteReceiver` before the decision is made.
   */
  readonly substitute:
    | {
        readonly name: string;
        readonly authorizationConfirmed: boolean;
        readonly relationship: string;
      }
    | null;
}

/**
 * Decide whether a report may be confirmed Returned.
 *
 * **The order of the checks is the rule's order.**
 *
 * 1. **The actor must be an administrator.** The role comes from the
 *    session, never from the request body, so the decision still checks it —
 *    the service's check is the one that holds.
 * 2. **A terminal report accepts nothing.** `Returned` and `Closed` are
 *    terminal, and this is checked before the precondition so that no
 *    precondition can name them.
 * 3. **The precondition status.** A Found report must be `Claim Approved`;
 *    a Lost report must be `Verification Pending`.
 * 4. **The receiver.** This is FR-25's guard, and it is absolute.
 *
 * **The guard is checked last, and it is still absolute.** A confirmation
 * with no receiver on a report that is not even eligible is refused for the
 * *earlier* reason — which is the better answer, because it tells the
 * administrator what to fix. But on an eligible report, no receiver means no
 * confirmation, and no substitute means no confirmation either.
 */
export function decideConfirmReturned(
  facts: ConfirmReturnedFacts,
): ConfirmReturnedDecision {
  // ── The actor must be an administrator ──────────────────────────────────
  //
  // **Returned is confirmed by an administrator only** (FR-23, FR-45). The
  // flag comes from the session — the route resolves it and the service
  // checks it, so a client cannot assert its own role.
  if (!facts.isAdministrator) {
    return { kind: 'Refused', reason: 'NotAdministrator' };
  }

  // ── A terminal report accepts nothing ───────────────────────────────────
  //
  // **`Returned` and `Closed` are terminal.** The check comes before the
  // precondition so that a report already returned is refused as *terminal*
  // rather than as "wrong status" — which is the truthful answer, because
  // the precondition *was* met when it was confirmed.
  if (facts.reportStatus === RETURNED_REPORT_STATUS || facts.reportStatus === 'Closed') {
    return { kind: 'Refused', reason: 'TerminalStatus' };
  }

  // ── The precondition status ─────────────────────────────────────────────
  //
  // **The direction's own precondition.** A Found report must be
  // `Claim Approved`; a Lost report must be `Verification Pending`.
  if (facts.reportStatus !== requiredPreconditionStatus(facts.reportType)) {
    return { kind: 'Refused', reason: 'PreconditionNotMet' };
  }

  // ── The default receiver ────────────────────────────────────────────────
  //
  // **The receiver is derived, never chosen.** Found → the approved
  // claimant; Lost → the Lost-report owner.
  const defaultReceiver = deriveDefaultReceiver({
    reportType: facts.reportType,
    reporterId: facts.reporterId,
    approvedClaimantId: facts.approvedClaimantId,
  } satisfies DefaultReceiverFacts);

  // ── FR-25 — the guard ───────────────────────────────────────────────────
  //
  // **A substitute was recorded.** The three fields were validated when the
  // substitute was built, so what reaches here is already well-formed; the
  // guard is satisfied and the confirmation proceeds.
  if (facts.substitute !== null) {
    const substitute = createSubstituteReceiver(facts.substitute);

    // **The default receiver is still derived,** even on the substitute
    // path — because the *authorization* is the default receiver's, and
    // the trail's event names the default receiver's role. A Found report
    // with no approved Claim still cannot be confirmed, substitute or not:
    // the person who would have authorized the substitution does not exist.
    if (defaultReceiver === null) {
      return { kind: 'Refused', reason: 'NoDefaultReceiver' };
    }

    return {
      kind: 'Permitted',
      defaultReceiver,
      substitute,
      reportStatus: RETURNED_REPORT_STATUS,
    };
  }

  // ── No substitute: the default receiver must exist ──────────────────────
  //
  // **A Found report with no approved Claim has no default receiver.** The
  // precondition — "a Claim was approved" — does not exist, so there is
  // nobody whose authorization could be recorded and nobody to hand the item
  // to.
  if (defaultReceiver === null) {
    return { kind: 'Refused', reason: 'NoDefaultReceiver' };
  }

  return {
    kind: 'Permitted',
    defaultReceiver,
    substitute: null,
    reportStatus: RETURNED_REPORT_STATUS,
  };
}

/**
 * The message that explains why a confirmation was refused.
 *
 * **One message per reason, and the reason names the remedy.** The copy
 * lives here so that every caller tells the administrator the same thing.
 */
export function confirmReturnedRefusalMessage(reason: ConfirmReturnedRefusalReason): string {
  switch (reason) {
    case 'NotAdministrator':
      return 'Only an administrator can confirm a return.';
    case 'ReportNotFound':
      return 'This report does not exist, so it cannot be confirmed as returned.';
    case 'TerminalStatus':
      return 'This report is already returned or closed, so it cannot be confirmed as returned again.';
    case 'PreconditionNotMet':
      return 'This report is not ready to be confirmed as returned.';
    case 'NoDefaultReceiver':
      return 'This report has no approved claim, so it cannot be confirmed as returned.';
    case 'NoReceiver':
      return 'A receiver is required before a return can be confirmed.';
  }
}

/**
 * Assert that a confirmation is permitted, or refuse.
 *
 * **The refusal throws rather than returning `false`.** A caller that
 * ignored a `false` would proceed to write a `Returned` the rules do not
 * permit — and FR-25 says the refusal is absolute.
 *
 * @throws {PermissionDeniedError} when the actor is not an administrator.
 * @throws {ConflictError} when the report's state refuses the confirmation.
 * @throws {ValidationError} when the substitute's fields are invalid.
 */
export function assertConfirmReturnedPermitted(
  facts: ConfirmReturnedFacts,
): ConfirmReturnedDecision {
  const decision = decideConfirmReturned(facts);

  if (decision.kind === 'Refused') {
    const message = confirmReturnedRefusalMessage(decision.reason);

    if (decision.reason === 'NotAdministrator') {
      throw new PermissionDeniedError(message);
    }

    throw new ConflictError(message);
  }

  return decision;
}
