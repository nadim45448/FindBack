/**
 * The claim decision gate — may this Claim be decided now?
 *
 * **A decision on a non-`Pending` Claim is a conflict, not a silent
 * overwrite.** That is the rule this module exists to express, and it is
 * the rule UX-OQ-B names: two administrators may open the same Claim for
 * review, but the second one to submit a decision gets a conflict and the
 * first one's decision stands.
 *
 * **The gate is a whitelist, not a list of refusals.** The earlier
 * submission gate (bolt 013) was written as a list of refusals and *failed
 * open* — a status it did not name was permitted. This gate is written the
 * other way round: **only a `Pending` Claim may be decided.** A status the
 * module has not seen, a `null` status from a reader that could not read
 * one, and every terminal status are all refused, and the refusal is a
 * conflict rather than a silent success.
 *
 * **The refusals are distinct because the remedies differ.** A Claim that
 * does not exist is a **404** — the administrator has the wrong link. A
 * Claim that exists but is no longer `Pending` is a **409** — the
 * administrator's action is valid in kind but conflicts with what has
 * already happened, and their remedy is to look at the recorded decision.
 *
 * **The administrator's authority is a fact, not a rule.** The gate does
 * not check whether the actor is an administrator — the route resolves that
 * once, at the `ActorContext` boundary, and the service is never reached by
 * a non-administrator. The gate decides the *Claim's* state, and nothing
 * else.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ClaimStatus } from './claim-status';

import { ValidationError } from '@/lib/errors';

/**
 * Why a decision was refused.
 *
 * - `ClaimNotFound` — no Claim carries that id. The remedy is to go back.
 * - `ClaimNotPending` — the Claim exists but has already been decided. The
 *   remedy is to read the recorded decision.
 */
export type ClaimDecisionBlockReason = 'ClaimNotFound' | 'ClaimNotPending';

/** The outcome of the decision gate. */
export type ClaimDecisionDecision =
  | { readonly kind: 'Permitted' }
  | { readonly kind: 'Blocked'; readonly reason: ClaimDecisionBlockReason };

/**
 * The facts the gate decides on.
 *
 * **Everything is supplied; nothing is read.** The gate is a pure function
 * of these facts, so it can be asserted against fixtures without a
 * database.
 */
export interface ClaimDecisionFacts {
  /**
   * The Claim's status.
   *
   * `null` when no Claim carries the id — which is a distinct refusal from
   * a Claim that has already been decided.
   */
  readonly claimStatus: ClaimStatus | null;
}

/**
 * Decide whether a Claim may be decided.
 *
 * **Only `Pending` may be decided.** `Approved`, `Rejected`, and `Returned`
 * are terminal (see `claim-status.ts`), and the gate refuses every one of
 * them — plus a status it does not recognise, and a `null`.
 */
export function decideClaimDecision(facts: ClaimDecisionFacts): ClaimDecisionDecision {
  if (facts.claimStatus === null) {
    return { kind: 'Blocked', reason: 'ClaimNotFound' };
  }

  if (facts.claimStatus !== 'Pending') {
    return { kind: 'Blocked', reason: 'ClaimNotPending' };
  }

  return { kind: 'Permitted' };
}

/**
 * The message that explains why a decision was refused.
 *
 * **The copy names the path forward.** An administrator who loses a race
 * is told that the Claim has already been decided — not that they were
 * wrong — and is pointed at the recorded decision.
 */
export function claimDecisionBlockMessage(reason: ClaimDecisionBlockReason): string {
  switch (reason) {
    case 'ClaimNotFound':
      return 'No claim with that id.';
    case 'ClaimNotPending':
      return 'This claim has already been decided. Its recorded decision is shown instead.';
    default: {
      const unreachable: never = reason;
      throw new Error(`Unhandled claim decision block reason: ${String(unreachable)}`);
    }
  }
}

/**
 * The rejection reason an administrator supplies.
 *
 * **Ten to five hundred characters.** The story says "a reason of 10-500
 * characters" for the administrator's rejection, and the bound is the same
 * shape as the Claim's own bounds — a reason must say enough to be useful
 * on the record, and must not be so long that it becomes a second essay.
 *
 * **The reason is required.** A rejection with no reason is a refusal that
 * leaves the claimant with nothing to act on, and the story says the
 * rejection is refused and the Claim remains `Pending` when the reason
 * breaks its bound — which includes the empty string.
 *
 * **It is a distinct type from the Claim's `reason`.** The Claim's reason
 * is the claimant's assertion of ownership; the rejection reason is the
 * administrator's finding against it. They are different facts, they have
 * different audiences, and they live in different columns.
 */
export const CLAIM_REJECTION_REASON_MIN_LENGTH = 10;
export const CLAIM_REJECTION_REASON_MAX_LENGTH = 500;

/**
 * A validated administrator rejection reason.
 *
 * **The wrapper is what makes the validation structural.** A value of this
 * type cannot exist unless it passed the bound, so a caller that holds one
 * never has to re-check it.
 */
export interface ClaimRejectionReason {
  readonly value: string;
}

/**
 * Validate an administrator's rejection reason.
 *
 * @returns the validated reason.
 * @throws {ValidationError} naming the `reason` field when the reason
 * breaks its bound. **The error carries the field name, never the value** —
 * a rejection reason is administrator-supplied free text and may itself
 * carry something sensitive.
 */
export function createClaimRejectionReason(text: string): ClaimRejectionReason {
  const value = typeof text === 'string' ? text.trim() : '';

  if (value.length < CLAIM_REJECTION_REASON_MIN_LENGTH) {
    throw new ValidationError(
      'reason',
      `The rejection reason must be at least ${CLAIM_REJECTION_REASON_MIN_LENGTH} characters.`,
    );
  }

  if (value.length > CLAIM_REJECTION_REASON_MAX_LENGTH) {
    throw new ValidationError(
      'reason',
      `The rejection reason must be at most ${CLAIM_REJECTION_REASON_MAX_LENGTH} characters.`,
    );
  }

  return { value };
}

export { ValidationError };
