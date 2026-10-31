'use client';

/**
 * The thread panel — the client half of a thread surface.
 *
 * ## Why the thread needs a client component at all
 *
 * §13.3: *"The thread refreshes on page load and on send."* So the thread
 * is read on the server, and **the only thing that happens in the browser
 * is a post and a refresh.** There is no polling, no presence, no typing
 * indicator — so this component holds only the draft and the in-flight
 * flag, and everything else it renders comes from the server.
 *
 * ## The send is a POST with a CSRF token
 *
 * **A message is a state change,** so it cannot be a plain link. The
 * request carries the CSRF token from the document's meta tag, and the
 * server's own authorisation decides whether it is allowed.
 *
 * ## A failed send keeps the draft
 *
 * §13.4: *"Composer retains input."* The `ThreadSurface` already holds
 * the draft and keeps it when the send throws — so this component's job
 * is to **throw** when the server refuses, rather than to swallow the
 * failure.
 */
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { csrfHeaders } from './csrf';
import { ThreadSurface, type ThreadMessageView } from './thread-surface';

/**
 * The thread panel's props.
 */
export interface ThreadPanelProps {
  /** The thread's heading. */
  readonly heading: string;
  /** The messages, oldest first. */
  readonly messages: readonly ThreadMessageView[];
  /** Whether the thread may be posted to. */
  readonly writable: boolean;
  /** The read-only notice, when the thread is read-only. */
  readonly readOnlyNotice: string | null;
  /** The permission-denied notice, when the viewer may not see the thread. */
  readonly permissionDenied?: string | undefined;
  /** The error, when the history fetch failed. */
  readonly error?: string | undefined;
  /** The endpoint a message is posted to. */
  readonly endpoint: string;
}

/**
 * The thread panel.
 */
export function ThreadPanel({
  heading,
  messages,
  writable,
  readOnlyNotice,
  permissionDenied,
  error,
  endpoint,
}: ThreadPanelProps): React.JSX.Element {
  const router = useRouter();

  /**
   * Post a message and refresh.
   *
   * **A refused post throws,** so the composer keeps the typed input and
   * shows the send-failed message. A successful post refreshes the route,
   * so the new message arrives with the rest of the thread — the server is
   * the source of truth, not the browser.
   */
  const send = useCallback(
    async (body: string): Promise<void> => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        throw new Error('The message could not be sent.');
      }

      router.refresh();
    },
    [endpoint, router],
  );

  return (
    <ThreadSurface
      heading={heading}
      messages={messages}
      writable={writable}
      readOnlyNotice={readOnlyNotice}
      permissionDenied={permissionDenied}
      error={error}
      onSend={writable ? send : undefined}
    />
  );
}
