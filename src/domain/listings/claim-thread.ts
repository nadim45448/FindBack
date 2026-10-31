/**
 * The per-Claim thread's domain — the message body and the writability
 * rule.
 *
 * **One thread per Claim, and the Claim is what makes it.** The thread is
 * addressed by its parent, exactly as `thread-projection.ts` says: "a
 * thread's visibility is exactly its parent's visibility". The Claim id is
 * the thread's identity, so there is nothing to *create* — a thread exists
 * from the moment the Claim does, and a thread with no messages is a thread
 * with an empty history, not a missing thread.
 *
 * **Writability is derived from two facts, and both are needed.** The Claim
 * must be `Pending`, and the report must be an active Found-side status:
 *
 * - A decided Claim (`Approved` or `Rejected`) has nothing left to
 *   coordinate, so its thread is read-only.
 * - A report that is not active — a `Returned` or `Closed` one, or any
 *   status the vocabulary does not own — ends the item's life, so its
 *   threads are read-only whatever the Claim's status.
 *
 * **Both rules are whitelists.** Each asks "is this one of the statuses
 * that permit posting?", so a status the vocabulary does not own is refused
 * rather than waved through. A rule written as a list of refusals would
 * wave through a status nobody has thought about — which is exactly the
 * one a corrupted row or a future vocabulary change would carry.
 *
 * **Read-only is not "empty".** A locked thread keeps its full history: the
 * story says "messages are never deleted; a locked thread keeps its full
 * history", and the PRD's retention rule says threads are retained for the
 * parent report's lifetime. Closing a thread changes **writability only**.
 *
 * **The message body is plain text and nothing else.** The story is
 * explicit: "only the plain text content is stored and no attachment is
 * accepted". Attachments, images, and rich text are out of scope, so the
 * body is a bounded string and the module has no way to receive anything
 * else.
 *
 * **The body is 1–2000 characters, inclusive at both ends.** The story's
 * edge cases are explicit: "Member posts 2001 characters | Refused; the
 * 2000-character limit is enforced". The minimum of 1 is what makes an
 * empty post a refusal rather than a stored blank.
 *
 * Pure — no I/O, no framework imports.
 */

import { ValidationError } from '@/lib/errors';

import type { ClaimStatus } from './claim-status';
import type { ReportStatus } from './report-status';

/** The message body's inclusive minimum length. */
export const CLAIM_THREAD_MESSAGE_MIN_LENGTH = 1;

/** The message body's inclusive maximum length. */
export const CLAIM_THREAD_MESSAGE_MAX_LENGTH = 2000;

/**
 * A thread message's body — plain text, bounded.
 *
 * **Branded, so a body cannot be confused with any other text.** The
 * message body travels from the domain to the repository to the database,
 * and a plain `string` at each step is how a reason becomes a body.
 */
export interface ClaimThreadMessageBody {
  /** The text, with surrounding whitespace removed. */
  readonly value: string;
  /** The brand. Never read, never compared, never serialized. */
  readonly brand: 'claim-thread-message-body';
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
export function createClaimThreadMessageBody(text: string): ClaimThreadMessageBody {
  const value = typeof text === 'string' ? text.trim() : '';

  // **Measured in code points, not UTF-16 code units,** so an emoji counts
  // as one character — which is what a member means by "characters", and
  // what the database's `char_length` counts.
  const length = Array.from(value).length;

  if (length < CLAIM_THREAD_MESSAGE_MIN_LENGTH) {
    throw new ValidationError(
      'body',
      `A message must be at least ${CLAIM_THREAD_MESSAGE_MIN_LENGTH} character.`,
    );
  }

  if (length > CLAIM_THREAD_MESSAGE_MAX_LENGTH) {
    throw new ValidationError(
      'body',
      `A message must be at most ${CLAIM_THREAD_MESSAGE_MAX_LENGTH} characters.`,
    );
  }

  return { value, brand: 'claim-thread-message-body' };
}

/**
 * The report statuses whose threads may be posted to.
 *
 * **These are the three active Found-side statuses.** `Open` is a report
 * nobody has claimed yet, `Claim Requested` is one with a pending Claim on
 * it, and `Claim Approved` is one whose claim was approved — and in all
 * three the item is still active, so there is a handover left to
 * coordinate.
 *
 * **This is a whitelist, and it is written as one.** The rule is "is this
 * status one of the active ones?", so a status the vocabulary does not own
 * is **refused** rather than waved through. A list of the *locking*
 * statuses would wave through a status nobody has thought about — and a
 * status nobody has thought about is exactly the one a corrupted row or a
 * future vocabulary change would carry.
 */
const POSTABLE_REPORT_STATUSES: readonly ReportStatus[] = Object.freeze([
  'Open',
  'Claim Requested',
  'Claim Approved',
]);

/**
 * Whether a report's status locks its threads.
 *
 * **The answer is "does the status permit posting?",** so anything outside
 * the active three locks — including a status the vocabulary does not own.
 *
 * **A named predicate rather than an inline comparison,** because the rule
 * is read in more than one place and must not be re-implemented differently.
 */
export function reportLocksThreads(status: ReportStatus): boolean {
  return !POSTABLE_REPORT_STATUSES.includes(status);
}

/**
 * The facts the writability rule needs.
 */
export interface ClaimThreadWritabilityFacts {
  /** The Claim's status. */
  readonly claimStatus: ClaimStatus;
  /** The Found report's status. */
  readonly reportStatus: ReportStatus;
}

/**
 * Why a thread is read-only.
 *
 * **`ClaimDecided` and `ReportEnded` are distinct,** because they are
 * different facts about the item and a reader of the trail should be able
 * to tell them. A decided claim on an open report was won or lost; a
 * claim on a closed report ended with the item.
 */
export type ClaimThreadReadOnlyReason = 'ClaimDecided' | 'ReportEnded';

/**
 * Whether a thread may be posted to.
 *
 * **A whitelist, not a list of refusals.** The same shape as the decision
 * gate: only `Pending` may be posted to, and anything the vocabulary does
 * not own is refused rather than waved through.
 */
export function isClaimThreadWritable(
  facts: ClaimThreadWritabilityFacts,
): boolean {
  return decideClaimThreadWritability(facts).kind === 'Writable';
}

/**
 * Decide whether a thread may be posted to.
 *
 * **The claim's status is checked first.** A decided claim is read-only
 * whatever the report's status, and the report's terminal status is the
 * second question.
 */
export function decideClaimThreadWritability(
  facts: ClaimThreadWritabilityFacts,
): { readonly kind: 'Writable' } | { readonly kind: 'ReadOnly'; readonly reason: ClaimThreadReadOnlyReason } {
  if (facts.claimStatus !== 'Pending') {
    return { kind: 'ReadOnly', reason: 'ClaimDecided' };
  }

  if (reportLocksThreads(facts.reportStatus)) {
    return { kind: 'ReadOnly', reason: 'ReportEnded' };
  }

  return { kind: 'Writable' };
}

/**
 * The message that explains why a thread is read-only.
 *
 * **The copy names the path forward.** A member whose claim was decided is
 * told the thread is closed because the claim was decided — not that they
 * may not post, which says nothing about what to do next.
 */
export function claimThreadReadOnlyMessage(reason: ClaimThreadReadOnlyReason): string {
  switch (reason) {
    case 'ClaimDecided':
      return 'This claim has been decided, so its thread is closed to new messages.';
    case 'ReportEnded':
      return 'This report is no longer active, so its claim threads are closed to new messages.';
    default: {
      const unreachable: never = reason;
      throw new Error(`Unhandled claim thread read-only reason: ${String(unreachable)}`);
    }
  }
}
