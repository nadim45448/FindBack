/**
 * The **softened** user-facing copy for an auto-rejection.
 *
 * **The stored reason and the visible copy are different things, and this
 * module holds only the second.** The stored reason lives in
 * `claim-auto-rejection.ts` and is verbatim — "another claim was approved
 * for this item". Story 006 requires that the *visible* copy says the same
 * thing **without** that wording appearing verbatim, while the audit trail
 * keeps the wording exactly.
 *
 * **The softening is not a rewrite of the stored reason.** That is the
 * whole point of the separation: the mapping from a trigger to its visible
 * copy is a *second* artefact, and the stored reason never passes through
 * it. An implementation that softened the reason and stored the softened
 * text would satisfy the letter of "the visible copy is softened" while
 * destroying the audit trail's precision — and the trail is append-only
 * with no correction path.
 *
 * **The copy names no winner.** Story 006: "the visible copy is a neutral
 * explanation with a contact-your-administrator path and does not name the
 * winning claimant." A member whose Claim was rejected by an approval learns
 * that another claim on the same item was approved — not *who* won, and
 * not *what they said*.
 *
 * **The copy carries no blame.** The member did nothing wrong: they
 * asserted ownership, and someone else asserted it too, and an
 * administrator decided. `EXPERIENCE.md` §4.9's "Permission denied — no
 * blame" tone applies to a rejection as much as to a refusal.
 *
 * **The copy does not promise a reopen.** There is no `Rejected` to
 * `Pending` transition, so copy that said "you may claim again" would be a
 * lie about what the system can do.
 *
 * Pure — no I/O, no framework imports.
 */

import type { ClaimAutoRejectionTrigger } from './claim-auto-rejection';

/**
 * The user-facing explanation of an auto-rejection.
 *
 * **The copy, and nothing else.** The caller receives the text to show and
 * the text to send; the reason it must *not* show is in the other module.
 */
export interface AutoRejectionCopy {
  /** The heading shown to the member. */
  readonly headline: string;
  /** The body shown to the member. */
  readonly body: string;
  /** The path forward, when there is one. */
  readonly contactPath: string;
}

const CONTACT_PATH =
  'If you believe this is wrong, contact an administrator and quote your claim reference.';

/**
 * The softened copy for each trigger.
 *
 * **The approval's copy does not say the stored reason.** It says what
 * happened — that another claim on the same item was approved — in its own
 * words, so a member reading it is not handed a piece of the audit trail's
 * internal vocabulary.
 */
const COPY: Readonly<Record<ClaimAutoRejectionTrigger, AutoRejectionCopy>> = Object.freeze({
  AnotherClaimApproved: Object.freeze({
    headline: 'Your claim was not accepted.',
    body: [
      'Another claim was made for the same item, and that claim was approved.',
      'Your claim has been closed as a result.',
      'The item description and the details you submitted were not the deciding factor.',
    ].join(' '),
    contactPath: CONTACT_PATH,
  }),
  ReportWithdrawnByReporter: Object.freeze({
    headline: 'Your claim was not accepted.',
    body: [
      'The person who found the item has withdrawn their report.',
      'The report your claim was made against is no longer active, so the claim has been closed.',
      'Nothing you did caused this.',
    ].join(' '),
    contactPath: CONTACT_PATH,
  }),
  ReportClosedByAdministrator: Object.freeze({
    headline: 'Your claim was not accepted.',
    body: [
      'An administrator has closed the report your claim was made against.',
      'The report is no longer active, so the claim has been closed.',
      'Nothing you did caused this.',
    ].join(' '),
    contactPath: CONTACT_PATH,
  }),
});

/**
 * The softened copy for a trigger.
 *
 * @throws {Error} when the trigger is not one of the three.
 */
export function autoRejectionCopy(trigger: ClaimAutoRejectionTrigger): AutoRejectionCopy {
  const copy = COPY[trigger];

  if (copy === undefined) {
    throw new Error(`Unhandled claim auto-rejection trigger: ${String(trigger)}`);
  }

  return copy;
}

/**
 * The softened copy as a single block of text.
 *
 * **The same content as the structured copy, in the same order.** A
 * recipient whose client renders only plain text must read the same facts.
 */
export function autoRejectionText(trigger: ClaimAutoRejectionTrigger): string {
  const copy = autoRejectionCopy(trigger);

  return [copy.headline, '', copy.body, '', copy.contactPath].join('\n');
}
