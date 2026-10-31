/**
 * The owner's determination, recorded by an administrator — FR-43's
 * owner-determines / administrator-records split.
 *
 * **This is the product's most distinctive integrity property, and collapsing
 * it into a single actor field would make the audit trail unable to answer
 * who actually decided.** The whole module exists to keep the two apart.
 *
 * ## The split
 *
 * | Role | Who | What they did |
 * |---|---|---|
 * | `determinedBy` | the **Lost-report owner** | physically inspected the item and decided |
 * | `recordedBy` | the **acting administrator** | entered that decision in the system |
 *
 * **The administrator does not independently decide the item belongs to the
 * owner.** FR-43 is emphatic: *"The administrator does not independently
 * decide whether the item belongs to the owner."* The administrator manages
 * the process and records the owner's determination.
 *
 * ## The two halves are roles, not identities
 *
 * **The same person may fill both halves.** Where the Lost-report owner is
 * themselves an administrator acting in their administrator capacity, that
 * is a legitimate determination — and refusing it would push operators
 * toward fabricating a second identity. The check is about **role**, not
 * identity: the maker must be the report's owner, and the recorder must be
 * an administrator.
 *
 * The audit layer's `assertDeterminationPair` enforces the same rule at the
 * event's boundary; this module is the decision that decides *whether to
 * write at all*.
 *
 * ## Two outcomes, and they move the report differently
 *
 * | Outcome | The response | The report |
 * |---|---|---|
 * | `Match Confirmed` | `Match Confirmed` — **not terminal** | stays `Verification Pending` |
 * | `Not a Match` | `Not a Match` — terminal | returns to `Open` |
 *
 * **The `Match Confirmed` non-terminality is the load-bearing fact.** The
 * item has been *identified*; it has not yet been *physically returned*. The
 * report therefore stays `Verification Pending` until Unit 005's
 * administrator confirms the return. Treating `Match Confirmed` as an ending
 * would close the workflow before the item reached its owner.
 *
 * **The `Not a Match` path returns the report to `Open`,** and the standby
 * pool becomes selectable again. The previously selected response stays
 * `Not a Match` — it is terminal and never returns to `Submitted`.
 *
 * ## A determination needs a selected response
 *
 **Only a `Selected for Verification` response may be determined.** The
 * determination is made about a candidate the owner has chosen, and the
 * story's criterion is explicit: *"Given a response in `Selected for
 * Verification`…"* A response that is `Submitted` has not been chosen; one
 * that is `Match Confirmed` has already been determined; one that is
 * terminal cannot be determined again.
 *
 * Pure — no I/O, no framework imports.
 */

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

import type { RecoveryResponseStatus } from './recovery-response-status';

/** The outcome the owner determined. */
export type DeterminationOutcome = 'match_confirmed' | 'not_a_match';

/**
 * The two statuses a determination reaches.
 *
 * **`Match Confirmed` is not among the terminal ones, and its absence from
 * that set is the point.** It is non-terminal: the response is still in play
 * while the administrator confirms the physical return.
 */
export const DETERMINATION_RESPONSE_STATUSES: Readonly<
  Record<DeterminationOutcome, RecoveryResponseStatus>
> = Object.freeze({
  match_confirmed: 'Match Confirmed',
  not_a_match: 'Not a Match',
});

/**
 * The report status each outcome leaves the Lost report in.
 *
 * **A confirmed match leaves the report `Verification Pending`** — the
 * physical return has not been confirmed, so the workflow has not ended.
 * **A not-a-match returns the report to `Open`,** so the standby pool can
 * be selected from.
 */
export const DETERMINATION_REPORT_STATUSES: Readonly<
  Record<DeterminationOutcome, 'Verification Pending' | 'Open'>
> = Object.freeze({
  match_confirmed: 'Verification Pending',
  not_a_match: 'Open',
});

/**
 * Why a determination was refused.
 *
 * - `NotAdministrator` — the recorder is not an administrator, so they may
 *   not record anything.
 * - `NoOwnerDetermination` — no owner determination was supplied, so there
 *   is nothing to record.
 * - `DeterminerIsNotOwner` — the named maker is not the report's owner, so
 *   the determination is not the owner's.
 * - `ResponseNotSelected` — the response is not awaiting determination.
 */
export type DeterminationRefusalReason =
  | 'NotAdministrator'
  | 'NoOwnerDetermination'
  | 'DeterminerIsNotOwner'
  | 'ResponseNotSelected';

/** The outcome of a determination decision. */
export type DeterminationDecision =
  | {
      readonly kind: 'Permitted';
      readonly outcome: DeterminationOutcome;
      readonly responseStatus: RecoveryResponseStatus;
      readonly reportStatus: 'Verification Pending' | 'Open';
    }
  | { readonly kind: 'Refused'; readonly reason: DeterminationRefusalReason };

/** The facts the determination rule decides on. */
export interface DeterminationFacts {
  /** The administrator recording the determination. */
  readonly recorderId: string;
  /**
   * Whether the recorder is an administrator.
   *
   * **A separate flag rather than a role string,** because the capability is
   * resolved once at the `ActorContext` boundary and the service does not
   * re-derive it.
   */
  readonly isAdministrator: boolean;
  /** The Lost report's owner — the person who made the determination. */
  readonly reportOwnerId: string;
  /**
   * The owner who made the determination.
   *
   * **`null` when no determination was supplied** — and the story is explicit
   * that a recording with no owner determination is refused. This is not a
   * case of "the administrator decides on their own"; it is a case of
   * nothing to record.
   */
  readonly determinedByUserId: string | null;
  /** The response's current status. */
  readonly responseStatus: RecoveryResponseStatus;
}

/**
 * Decide whether an administrator may record an owner's determination.
 *
 * **The order of the checks is the rule's order.** The recorder's authority
 * is checked first — a non-administrator may not record anything, whatever
 * else is true. Then the determination's own completeness: there must be a
 * maker, and the maker must be the owner. Then the response's state.
 */
export function decideDetermination(facts: DeterminationFacts): DeterminationDecision {
  // ── The recorder's authority ────────────────────────────────────────────
  //
  // **Only an administrator records a determination.** The owner determines;
  // the administrator records. A member who is not an administrator has
  // neither role in this write.
  if (!facts.isAdministrator) {
    return { kind: 'Refused', reason: 'NotAdministrator' };
  }

  // ── The determination must exist ────────────────────────────────────────
  //
  // **A recording with no owner determination is refused.** The whole point
  // of the split is that the trail names who decided; a determination with
  // no maker is a determination the administrator made themselves, which is
  // precisely what FR-43 forbids.
  if (!facts.determinedByUserId) {
    return { kind: 'Refused', reason: 'NoOwnerDetermination' };
  }

  // ── The maker must be the owner ─────────────────────────────────────────
  //
  // **This is the check that makes the event meaningful.** The owner
  // physically determines; the administrator enters that determination. A
  // determination attributed to anyone but the owner is not the owner's
  // determination.
  if (facts.determinedByUserId !== facts.reportOwnerId) {
    return { kind: 'Refused', reason: 'DeterminerIsNotOwner' };
  }

  // ── The response must be awaiting determination ─────────────────────────
  //
  // **Only a `Selected for Verification` response may be determined.** One
  // that is `Submitted` has not been chosen; one that is `Match Confirmed`
  // has already been determined; one that is terminal cannot be determined
  // again — and the story's criterion is explicit that a second
  // determination "throws and nothing changes".
  if (facts.responseStatus !== 'Selected for Verification') {
    return { kind: 'Refused', reason: 'ResponseNotSelected' };
  }

  return {
    kind: 'Permitted',
    outcome: 'match_confirmed',
    responseStatus: DETERMINATION_RESPONSE_STATUSES.match_confirmed,
    reportStatus: DETERMINATION_REPORT_STATUSES.match_confirmed,
  };
}

/**
 * Decide the outcome-specific result of a determination.
 *
 * **Separate from `decideDetermination` because the outcome changes what is
 * written, not whether it may be written.** The permission rules are the
 * same for both outcomes — an administrator cannot independently decide
 * *match* any more than they can decide *not a match*.
 *
 * @throws {ConflictError} when the outcome is not one of the two the PRD
 * names. **The refusal is at the boundary of a value the caller supplied,** and
 * a third outcome is a defect rather than a business outcome.
 */
export function decideDeterminationOutcome(
  outcome: DeterminationOutcome,
): {
  readonly outcome: DeterminationOutcome;
  readonly responseStatus: RecoveryResponseStatus;
  readonly reportStatus: 'Verification Pending' | 'Open';
} {
  const responseStatus = DETERMINATION_RESPONSE_STATUSES[outcome];
  const reportStatus = DETERMINATION_REPORT_STATUSES[outcome];

  if (responseStatus === undefined || reportStatus === undefined) {
    throw new ConflictError(
      `"${outcome}" is not a determination outcome — the only outcomes are "match_confirmed" and "not_a_match".`,
    );
  }

  return { outcome, responseStatus, reportStatus };
}

/**
 * The message that explains why a determination was refused.
 *
 * **One message per reason, and the reason names the remedy.**
 */
export function determinationRefusalMessage(reason: DeterminationRefusalReason): string {
  switch (reason) {
    case 'NotAdministrator':
      return 'Only an administrator can record a verification determination.';
    case 'NoOwnerDetermination':
      return 'The owner’s determination must be supplied before it can be recorded.';
    case 'DeterminerIsNotOwner':
      return 'Only the owner of this report can determine whether the item is theirs.';
    case 'ResponseNotSelected':
      return 'This response is not awaiting verification, so no determination can be recorded.';
  }
}

/**
 * Assert that a determination is permitted, or refuse.
 *
 * **The refusal throws rather than returning `false.`** A caller that
 * ignored a `false` would proceed to write a determination the rules do not
 * permit — and the audit trail is append-only, so the error would be
 * permanent.
 *
 * @throws {PermissionDeniedError} when the recorder is not an administrator,
 * when no determination was supplied, or when the maker is not the owner.
 * @throws {ConflictError} when the response is not awaiting determination.
 */
export function assertDeterminationPermitted(facts: DeterminationFacts): DeterminationDecision {
  const decision = decideDetermination(facts);

  if (decision.kind === 'Refused') {
    const message = determinationRefusalMessage(decision.reason);

    if (reasonIsPermission(decision.reason)) {
      throw new PermissionDeniedError(message);
    }

    throw new ConflictError(message);
  }

  return decision;
}

/**
 * True when the refusal is about *who* is acting, rather than about *what*
 * the world looks like.
 *
 * **A permission failure is a 403 and a conflict is a 409,** and the two
 * call for different remedies: a non-administrator needs a different role,
 * while a response that is not awaiting determination needs a different
 * moment.
 */
function reasonIsPermission(reason: DeterminationRefusalReason): boolean {
  return (
    reason === 'NotAdministrator' ||
    reason === 'NoOwnerDetermination' ||
    reason === 'DeterminerIsNotOwner'
  );
}
