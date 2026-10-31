'use client';

/**
 * The thread surface — §13, for both thread families.
 *
 * ## One component, two families
 *
 * A per-Claim thread and a per-Recovery-Response thread have the same
 * shape: a list of messages and a composer. §13.2 and §13.5b give them the
 * same layout, the same message anatomy, and the same composer. **The
 * differences are data** — the read-only notice, the permission-denied
 * notice, and the participants' names.
 *
 * So this is one component with the family's specifics passed in, exactly
 * as the administrator bolt made the four queues one component.
 *
 * ## A read-only thread keeps its full history
 *
 * §13.5: *"messages are never deleted; a locked thread keeps its full
 * history"*, and every read-only notice ends with *"Existing messages
 * remain available for reference, but no new messages can be posted."*
 *
 * **Locking removes the composer, never the history.** So the messages
 * render whether the thread is writable or not.
 *
 * ## Each read-only condition has its own notice
 *
 * §13.5 names four variants for the Claim side and §13.5b four for the
 * Lost side. A single generic notice *"would fail to tell the user why the
 * conversation stopped"*. So the notice text is **passed in**, resolved by
 * the domain from the facts — and this component renders whatever it is
 * given.
 *
 * ## No typing indicators, no read receipts, no real-time updates
 *
 * §13.3: *"No typing indicators. No read receipts. No real-time updates.
 * The thread refreshes on page load and on send."* So there is no
 * `setInterval`, no polling, and no presence indicator anywhere here.
 */

import { useCallback, useState } from 'react';

import {
  RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH,
  type RecoveryResponseThreadMessageBody,
} from '@/domain/recovery';

import {
  SEND,
  THREAD_EMPTY,
  THREAD_LOAD_FAILED,
  THREAD_SEND_FAILED,
} from './member-copy';
import { CharacterCounter } from './character-counter';

/**
 * A message in a thread, as the surface renders it.
 */
export interface ThreadMessageView {
  readonly id: string;
  readonly authorDisplayName: string;
  /** The author's role, as the tag reads it: `Claimant`, `Finder`, … */
  readonly authorRole: string;
  readonly postedAt: string;
  readonly body: string;
}

/**
 * The thread surface's props.
 */
export interface ThreadSurfaceProps {
  /** The thread's heading. */
  readonly heading: string;
  /** The messages, oldest first. */
  readonly messages: readonly ThreadMessageView[];
  /** Whether the thread may be posted to. */
  readonly writable: boolean;
  /**
   * The read-only notice, when the thread is read-only.
   *
   * **`null` when the thread is writable.** The notice exists only for a
   * locked thread, and §13.5b forbids a `Match Confirmed` thread from
   * showing one.
   */
  readonly readOnlyNotice: string | null;
  /** The permission-denied notice, when the viewer may not see the thread. */
  readonly permissionDenied?: string | undefined;
  /** The error, when the history fetch failed. */
  readonly error?: string | undefined;
  /** The send handler. Omitted when the thread is read-only. */
  readonly onSend?: ((body: string) => Promise<void>) | undefined;
}

/**
 * The thread.
 */
export function ThreadSurface({
  heading,
  messages,
  writable,
  readOnlyNotice,
  permissionDenied,
  error,
  onSend,
}: ThreadSurfaceProps): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  /**
   * Send the message.
   *
   * **The typed input is retained on failure** — §13.4: *"Composer retains
   * input."* So a failed send clears neither the draft nor the error, and
   * the member can try again without retyping.
   */
  const send = useCallback(async (): Promise<void> => {
    if (!onSend || draft.trim().length === 0 || sending) {
      return;
    }

    setSending(true);
    setSendError(null);

    try {
      await onSend(draft);
      setDraft('');
    } catch {
      setSendError(THREAD_SEND_FAILED);
    } finally {
      setSending(false);
    }
  }, [draft, onSend, sending]);

  if (permissionDenied) {
    return (
      <section className="detail-section">
        <h2 className="detail-section__heading">{heading}</h2>

        <div className="banner banner--info" role="alert">
          <p className="banner__heading">{permissionDenied}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="detail-section">
      <h2 className="detail-section__heading">{heading}</h2>

      {error ? (
        <div className="error-summary" role="alert">
          <p className="error-summary__heading">{THREAD_LOAD_FAILED}</p>
        </div>
      ) : null}

      {/*
        **The message list.** §13.2: oldest at top, newest at bottom. The
        list is `aria-live="polite"` so a newly arrived message is
        announced without stealing focus, and the newest message carries
        `tabindex="-1"` so it can be scrolled into view and focused
        without the tab order including every message.
      */}
      {messages.length === 0 ? (
        <p className="field__helper">{THREAD_EMPTY}</p>
      ) : (
        <ul className="thread" aria-live="polite">
          {messages.map((message, index) => {
            const isNewest = index === messages.length - 1;

            return (
              <li
                className="thread__message"
                key={message.id}
                tabIndex={isNewest ? -1 : undefined}
              >
                <p className="thread__meta">
                  <span className="thread__author">{message.authorDisplayName}</span>

                  <span className="thread__role">{message.authorRole}</span>

                  <span className="thread__timestamp tabular">{message.postedAt}</span>
                </p>

                <p className="thread__body">{message.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {readOnlyNotice ? (
        <div className="banner banner--info" role="status">
          <p className="banner__heading">{readOnlyNotice}</p>
        </div>
      ) : null}

      {writable && onSend ? (
        <form
          className="thread__composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          {sendError ? (
            <div className="error-summary" role="alert">
              <p className="error-summary__heading">{sendError}</p>
            </div>
          ) : null}

          {/*
            **A plain textarea.** §13.3: no attachments, no rich text, no
            images, no markdown — so the composer has exactly one control
            and one limit.
          */}
          <div className="field">
            <label className="field__label" htmlFor="thread-message">
              {'Message'}
            </label>

            <textarea
              id="thread-message"
              className="textarea"
              value={draft}
              maxLength={RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
          </div>

          <div className="thread__composer-row">
            <button
              type="submit"
              className="button button--primary"
              disabled={sending || draft.trim().length === 0}
            >
              {sending ? 'Sending…' : SEND}
            </button>

            <CharacterCounter
              current={Array.from(draft).length}
              max={RECOVERY_RESPONSE_THREAD_MESSAGE_MAX_LENGTH}
            />
          </div>
        </form>
      ) : null}
    </section>
  );
}

/**
 * The live character counter.
 *
 * **Shared with the report and claim forms,** so the 90 % threshold is
 * one rule rather than three.
 */
export { CharacterCounter } from './character-counter';

export type { RecoveryResponseThreadMessageBody };
