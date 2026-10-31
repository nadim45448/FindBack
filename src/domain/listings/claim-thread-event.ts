/**
 * The per-Claim thread-message audit event — catalog event 14.
 *
 * **The event already exists in the frozen catalog,** so this bolt adds no
 * event and no event number. Catalog event 14 is
 * `thread.claim_message_posted`, and it names exactly one additional field:
 * `messageText`. The catalog also lists `messageText` as a **Sensitive
 * Field** for this event — it is permitted here *only* because the PRD names
 * it, and only on the administrator-visible trail, never in an operational
 * log.
 *
 * **The payload carries exactly the one field the catalog names.** The
 * audit payload sanitizer **denies by default**: a field the catalog does
 * not name is *refused*, not dropped, so the payload is typed to carry
 * exactly `messageText` and the compiler is the check that it does.
 *
 * **The event's parent is the Claim, not the message.** A thread is
 * addressed by its Claim, and the Claim is what decides the trail's
 * retention rule — "retained for the parent report's lifetime". The message
 * id is a standard audit-record concern and does not need to be the parent.
 *
 * **The message text is stored verbatim.** The audit trail records what was
 * said — that is its job, and an administrator reading the trail is reading
 * the record of what happened. The softening rule of story 006 applies to
 * the *auto-rejection's* visible copy, not to a message a member posted.
 *
 * Pure — no I/O, no framework imports.
 */

/** The catalog type discriminator for event 14. */
export const CLAIM_THREAD_MESSAGE_POSTED_EVENT_TYPE = 'thread.claim_message_posted';

/**
 * The `ClaimThreadMessagePosted` event — catalog event 14.
 *
 * **The payload is exactly one field.** The catalog names `messageText` and
 * nothing else for this event.
 */
export interface ClaimThreadMessagePosted {
  readonly type: typeof CLAIM_THREAD_MESSAGE_POSTED_EVENT_TYPE;
  readonly claimId: string;
  readonly reportId: string;
  readonly messageId: string;
  readonly authorId: string;
  readonly payload: {
    readonly messageText: string;
  };
}

/**
 * Build the `ClaimThreadMessagePosted` event.
 *
 * @param body the message's body. **The text is stored as it was posted**
 * — the message is a record of what was said.
 */
export function buildClaimThreadMessagePostedEvent(input: {
  readonly claimId: string;
  readonly reportId: string;
  readonly messageId: string;
  readonly authorId: string;
  readonly body: { readonly value: string };
}): ClaimThreadMessagePosted {
  return {
    type: CLAIM_THREAD_MESSAGE_POSTED_EVENT_TYPE,
    claimId: input.claimId,
    reportId: input.reportId,
    messageId: input.messageId,
    authorId: input.authorId,
    payload: { messageText: input.body.value },
  };
}
