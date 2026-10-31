/**
 * Who may take part in a per-Claim thread.
 *
 * **The participants are exactly three, and the list is the story's.**
 * The claimant, the finder of the Found report the Claim was made against,
 * and an administrator. A member who is neither the claimant nor the finder
 * "cannot view or post in it" — and the story says so without hedging.
 *
 * **Participation grants no private evidence.** The finder takes part in the
 * thread but never sees the claimant's reason or identifying details: those
 * are FR-37 Sensitive Fields, and FR-39's notes are explicit that
 * "participation is never permission". The thread carries **messages**, and
 * a message is not a reason and not an identifying detail. This module is
 * where that separation is stated, because it is the rule most likely to be
 * broken by a later change.
 *
 * **The check is a whitelist.** Only the three named relationships grant
 * participation, and anything else is refused. A rule written as a list of
 * refusals would wave through a relationship the vocabulary does not own.
 *
 * Pure — no I/O, no framework imports.
 */

/**
 * The relationship a viewer has to a Claim's thread.
 *
 * **`None` is a relationship, not an absence.** The three participants are
 * named; every other member is `None`, and `None` grants nothing.
 */
export type ClaimThreadParticipation =
  /** The member who made the Claim. */
  | 'Claimant'
  /** The finder of the Found report the Claim was made against. */
  | 'FoundReportOwner'
  /** An administrator. */
  | 'Administrator'
  /** Neither the claimant nor the finder, and not an administrator. */
  | 'None';

/**
 * The facts the participation rule needs.
 */
export interface ClaimThreadParticipationFacts {
  /** The viewer's account id. */
  readonly viewerId: string;
  /** The Claim's claimant. */
  readonly claimantId: string;
  /** The Found report's owner — the finder. */
  readonly foundReportOwnerId: string;
  /** Whether the viewer is an administrator. */
  readonly isAdministrator: boolean;
}

/**
 * Decide the viewer's relationship to a Claim's thread.
 *
 * **The administrator check comes first.** An administrator who is also the
 * claimant participates *as an administrator* — which is the same set of
 * rights, so the order is a matter of which name the decision reports, not
 * of what it permits.
 */
export function decideClaimThreadParticipation(
  facts: ClaimThreadParticipationFacts,
): ClaimThreadParticipation {
  if (facts.isAdministrator) {
    return 'Administrator';
  }

  if (facts.viewerId === facts.claimantId) {
    return 'Claimant';
  }

  if (facts.viewerId === facts.foundReportOwnerId) {
    return 'FoundReportOwner';
  }

  return 'None';
}

/**
 * Whether the viewer's relationship grants them the thread.
 *
 * **The thread's visibility is exactly the Claim's visibility,** and the
 * Claim's visibility is exactly the set of people who may take part in it.
 */
export function mayAccessClaimThread(participation: ClaimThreadParticipation): boolean {
  return participation !== 'None';
}

/**
 * The message that explains a refused thread request.
 *
 * **The copy says nothing about whether the Claim exists.** A member who is
 * neither the claimant nor the finder is refused, and the refusal does not
 * tell them whether the Claim they asked about is real. Telling them would
 * leak a fact about another member's claim.
 */
export const CLAIM_THREAD_ACCESS_DENIED_MESSAGE =
  'You do not have access to this.';
