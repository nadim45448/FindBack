/**
 * The per-Recovery-Response thread's domain — FR-47's conversation.
 *
 * **One thread per Recovery Response, and the Response is what makes it.**
 * A per-report thread would leak every candidate's conversation to every
 * other candidate, so the thread is addressed by its parent, exactly as
 * `thread-projection.ts` says: *"a thread's visibility is exactly its
 * parent's visibility"*. The Response id is the thread's identity, so there
 * is nothing to *create* — a thread exists from the moment the Response
 * does, and a thread with no messages is a thread with an empty history, not
 * a missing thread.
 *
 * **This module shares no vocabulary with the Claim-side thread.** The Found
 * side's `claim-thread.ts` answers a different question about a different
 * workflow: a Claim is `Pending` until it is decided, and its report is
 * active in the *Found* statuses. The Lost side's Response is `Submitted`
 * until it is selected, and its report is active in the *Lost* statuses. The
 * unit brief is explicit that the two workflows *"must never share a
 * transition function, an aggregate, or a status enum"* — and a shared
 * writability predicate would be exactly such a shared function, answering
 * two different questions with one answer.
 *
 * ## Writability is derived from two facts, and both are needed
 *
 * The Response must be in a status that is still in play, and the parent
 * report must still be active:
 *
 * - A terminal Response (`Not a Match`, `Withdrawn`, or either
 *   `Resolved — …` status) has nothing left to coordinate, so its thread is
 *   read-only.
 * - A report that is not active — a `Returned` or `Closed` one — ends the
 *   item's life, so its threads are read-only whatever the Response's
 *   status.
 *
 * **The Response's status is a whitelist, and the whitelist is written out.**
 * The story names exactly three writable statuses: `Submitted`, `Selected
 * for Verification`, and `Match Confirmed`. `Match Confirmed` is in the list
 * because it is **non-terminal** — the item has been identified but has not
 * yet been handed over, so there is still something to coordinate. The list
 * is written as the *permitted* statuses rather than the *forbidden* ones, so
 * a status the vocabulary does not own is refused rather than waved through.
 *
 * **The report's status is a whitelist too, and it is the Lost side's own.**
 * Only `Open` and `Verification Pending` keep a Lost report alive. The Found
 * side's `Claim Requested` and `Claim Approved` are not in the list, and this
 * module does not import the Found side's vocabulary to ask the question.
 *
 * **Read-only is not "empty".** A locked thread keeps its full history: the
 * story says "messages are never deleted; a locked thread keeps its full
 * history", and the PRD's retention rule says threads are retained for the
 * parent report's lifetime. Closing a thread changes **writability only**.
 *
 * ## The message body is plain text and nothing else
 *
 * The story is explicit: "only the plain text content is stored and no
 * attachment is accepted". Attachments, images, and rich text are out of
 * scope, so the body is a bounded string and the module has no way to
 * receive anything else.
 *
 * **The body is 1–2000 characters, inclusive at both ends.** The story's
 * edge cases are explicit: "Member posts 2001 characters | Refused; the
 * 2000-character limit is enforced". The minimum of 1 is what makes an
 * empty post a refusal rather than a stored blank.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import type { ReportStatus } from '@/domain/listings';

import { isTerminalRecoveryResponseStatus, type RecoveryResponseStatus } from './recovery-response-status';

/** The message body's inclusive minimum length. */
export const RECOVERY_RESPONSE_THREAD_MESSAGE_MIN_LENGTH = 1;

/** The message body's inclusive maximum length. */
export const RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH = 2000;

/**
 * A thread message's body — plain text, bounded.
 *
 * **Branded, so a body cannot be confused with any other text.** The message
 * body travels from the domain to the repository to the database, and a plain
 * `string` at each step is how a reason becomes a body.
 */
export interface RecoveryResponseThreadMessageBody {
  /** The text, with surrounding whitespace removed. */
  readonly value: string;
  /** The brand. Never read, never compared, never serialized. */
  readonly brand: 'recovery-response-thread-message-body';
}

/**
 * Build a thread message's body.
 *
 * **The body is trimmed before it is measured.** A body of 2000 spaces is
 * not 2000 characters of message, and a body of one space is not a message
 * at all. Trimming first means the bound is on the text a reader would
 * actually see.
 *
 * @throws {ValidationError} naming the `body` field when the body breaks
 * its bound. **The error carries the field name, never the value** — a
 * message body may itself carry something sensitive.
 */
export function createRecoveryResponseThreadMessageBody(
  text: string,
): RecoveryResponseThreadMessageBody {
  const value = typeof text === 'string' ? text.trim() : '';

  // **Measured in code points, not UTF-16 code units,** so an emoji counts
  // as one character — which is what a member means by "characters", and
  // what the database's `char_length` counts.
  const length = Array.from(value).length;

  if (length < RECOVERY_RESPONSE_THREAD_MESSAGE_MIN_LENGTH) {
    throw new ValidationError(
      'body',
      `A message must be at least ${RECOVERY_RESPONSE_THREAD_MESSAGE_MIN_LENGTH} character.`,
    );
  }

  if (length > RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH) {
    throw new ValidationError(
      'body',
      `A message must be at most ${RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH} characters.`,
    );
  }

  return { value, brand: 'recovery-response-thread-message-body' };
}

/**
 * The Recovery Response statuses whose threads may be posted to.
 *
 * **These are the story's three writable statuses, verbatim.** `Submitted` is
 * a response nobody has picked yet; `Selected for Verification` is the one
 * the owner is checking; and `Match Confirmed` is the one the owner has
 * identified but has not yet collected — so the handover is still to be
 * arranged.
 *
 * **The list is a whitelist, and it is written as one.** The rule is "is this
 * status one of the postable ones?", so a status the vocabulary does not own
 * is **refused** rather than waved through. A list of the *locking* statuses
 * would wave through a status nobody has thought about — and a status nobody
 * has thought about is exactly the one a corrupted row or a future
 * vocabulary change would carry.
 *
 * **`Match Confirmed` is here because it is non-terminal.** FR-41 makes it
 * non-terminal — the report stays `Verification Pending` until an
 * administrator confirms the physical return — so the thread is still open
 * for the arrangement of that return.
 */
export const POSTABLE_RECOVERY_RESPONSE_STATUSES: readonly RecoveryResponseStatus[] =
  Object.freeze([
    'Submitted',
    'Selected for Verification',
    'Match Confirmed',
  ]);

/**
 * The Lost report statuses whose threads may be posted to.
 *
 * **These are the two active Lost statuses.** A Lost report is `Open` until
 * a response is selected, and `Verification Pending` from then until it is
 * returned or closed. The Found side's `Claim Requested` and `Claim
 * Approved` are absent, and this list does not import the Found side's
 * vocabulary to ask the question.
 */
export const POSTABLE_LOST_REPORT_STATUSES: readonly ReportStatus[] = Object.freeze([
  'Open',
  'Verification Pending',
]);

/**
 * Whether a report's status locks its threads.
 *
 * **The answer is "does the status permit posting?",** so anything outside
 * the active Lost two locks — including a status the vocabulary does not own.
 */
export function lostReportLocksThreads(status: ReportStatus): boolean {
  return !POSTABLE_LOST_REPORT_STATUSES.includes(status);
}

/**
 * The facts the writability rule needs.
 */
export interface RecoveryResponseThreadWritabilityFacts {
  /** The Recovery Response's status. */
  readonly responseStatus: RecoveryResponseStatus;
  /** The Lost report's status. */
  readonly reportStatus: ReportStatus;
}

/**
 * Why a thread is read-only.
 *
 * **`ResponseEnded` and `ReportEnded` are distinct,** because they are
 * different facts about the item and a reader of the trail should be able to
 * tell them. A withdrawn response on an open report ended on its own; a
 * response on a closed report ended with the item.
 */
export type RecoveryResponseThreadReadOnlyReason = 'ResponseEnded' | 'ReportEnded';

/**
 * Whether a thread may be posted to.
 *
 * **A whitelist, not a list of refusals.** The same shape as the selection
 * rule: only the three postable statuses may be posted to, and anything the
 * vocabulary does not own is refused rather than waved through.
 */
export function isRecoveryResponseThreadWritable(
  facts: RecoveryResponseThreadWritabilityFacts,
): boolean {
  return decideRecoveryResponseThreadWritability(facts).kind === 'Writable';
}

/**
 * Decide whether a thread may be posted to.
 *
 * **The response's status is checked first.** A terminal response is
 * read-only whatever the report's status, and the report's terminal status
 * is the second question.
 */
export function decideRecoveryResponseThreadWritability(
  facts: RecoveryResponseThreadWritabilityFacts,
):
  | { readonly kind: 'Writable' }
  | { readonly kind: 'ReadOnly'; readonly reason: RecoveryResponseThreadReadOnlyReason } {
  if (!POSTABLE_RECOVERY_RESPONSE_STATUSES.includes(facts.responseStatus)) {
    return { kind: 'ReadOnly', reason: 'ResponseEnded' };
  }

  if (lostReportLocksThreads(facts.reportStatus)) {
    return { kind: 'ReadOnly', reason: 'ReportEnded' };
  }

  return { kind: 'Writable' };
}

/**
 * The message that explains why a thread is read-only.
 *
 * **The copy names the path forward.** A responder whose response was
 * withdrawn or ruled a no-match is told the thread is closed because the
 * response is closed — not that they may not post, which says nothing about
 * what to do next.
 */
export function recoveryResponseThreadReadOnlyMessage(
  reason: RecoveryResponseThreadReadOnlyReason,
): string {
  switch (reason) {
    case 'ResponseEnded':
      return 'This response is closed, so its thread is closed to new messages.';
    case 'ReportEnded':
      return 'This report is no longer active, so its response threads are closed to new messages.';
    default: {
      const unreachable: never = reason;
      throw new Error(
        `Unhandled recovery response thread read-only reason: ${String(unreachable)}`,
      );
    }
  }
}

/**
 * The relationship a viewer has to a Recovery Response's thread.
 *
 * **`None` is a relationship, not an absence.** The three participants are
 * named; every other member is `None`, and `None` grants nothing.
 */
export type RecoveryResponseThreadParticipation =
  /** The member who responded to the Lost report. */
  | 'Responder'
  /** The owner of the Lost report the response was made against. */
  | 'LostReportOwner'
  /** An administrator. */
  | 'Administrator'
  /** Neither the responder nor the owner, and not an administrator. */
  | 'None';

/**
 * The facts the participation rule needs.
 *
 * **The participants are derived from that single response's participants
 * only.** The responder is the member who wrote this response; the owner is
 * the owner of the report *this* response belongs to. The parent report's
 * *other* responses' participants are never consulted — a competing
 * responder is not a participant here, and the rule has no way to name them.
 */
export interface RecoveryResponseThreadParticipationFacts {
  /** The viewer's account id. */
  readonly viewerId: string;
  /** The responder who made this response. */
  readonly responderId: string;
  /** The owner of the Lost report this response belongs to. */
  readonly lostReportOwnerId: string;
  /** Whether the viewer is an administrator. */
  readonly isAdministrator: boolean;
}

/**
 * Decide the viewer's relationship to a Recovery Response's thread.
 *
 * **The administrator check comes first.** An administrator who is also the
 * responder participates *as an administrator* — which is the same set of
 * rights, so the order is a matter of which name the decision reports, not
 * of what it permits.
 */
export function decideRecoveryResponseThreadParticipation(
  facts: RecoveryResponseThreadParticipationFacts,
): RecoveryResponseThreadParticipation {
  if (facts.isAdministrator) {
    return 'Administrator';
  }

  if (facts.viewerId === facts.responderId) {
    return 'Responder';
  }

  if (facts.viewerId === facts.lostReportOwnerId) {
    return 'LostReportOwner';
  }

  return 'None';
}

/**
 * Whether the viewer's relationship grants them the thread.
 *
 * **The thread's visibility is exactly the Response's visibility,** and the
 * Response's visibility is exactly the set of people who may take part in
 * it. A competing responder on the same report is not a participant, which
 * is what makes the isolation a rule rather than a convention.
 */
export function mayAccessRecoveryResponseThread(
  participation: RecoveryResponseThreadParticipation,
): boolean {
  return participation !== 'None';
}

/**
 * The message that explains a refused thread request.
 *
 * **The copy says nothing about whether the Response exists.** A member who
 * is neither the responder nor the owner is refused, and the refusal does
 * not tell them whether the Response they asked about is real. Telling them
 * would leak a fact about another member's response.
 */
export const RECOVERY_RESPONSE_THREAD_ACCESS_DENIED_MESSAGE =
  'You do not have access to this.';

/**
 * Whether a status ends a Recovery Response.
 *
 * **Delegated to the status module,** which owns the terminal set. A second
 * implementation of "is this terminal?" would be a second answer to the
 * question, and the two could disagree — and `Match Confirmed` is exactly
 * the status where a mistake would be invisible until the item was
 * misclassified.
 */
export { isTerminalRecoveryResponseStatus };
