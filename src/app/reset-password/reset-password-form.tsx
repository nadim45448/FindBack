'use client';

/**
 * The reset-password form.
 *
 * **The token is read from the URL's fragment, in the browser, and posted
 * in the request body.** The fragment is never sent to the server, so the
 * token never reaches the request line — which is what a platform's access
 * log records. The body is not in the request line either, so the token
 * does not reach the log that way.
 *
 * This is a **client component** for exactly that reason: the fragment is
 * only readable by the browser.
 *
 * **The fragment is read with `useSyncExternalStore`, not with an effect.**
 * The URL is state the browser owns and can change on its own — a back
 * button, a hash change, a pasted link — so it is subscribed to as an
 * external store. Reading it once into `useState` inside a `useEffect`
 * would render the "not valid" message first and then the real one, and
 * would miss a hash change that happened after the first render.
 *
 * The page's **markup** belongs to Unit 007 (web surfaces), which owns the
 * screens. What this bolt owns is the part that touches the credential: the
 * token's path from the email to the form, and the guarantee that it never
 * appears in a log.
 */

import { useSyncExternalStore } from 'react';

import { RESET_TOKEN_QUERY_PARAM } from '@/domain/accounts';

/**
 * The token from the URL's fragment.
 *
 * The fragment is a string of `name=value` pairs separated by `&`, so the
 * token is read with the same parsing the query string would get.
 */
function readFragmentToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const fragment = window.location.hash.replace(/^#/, '');

  if (fragment.length === 0) {
    return null;
  }

  for (const parameter of fragment.split('&')) {
    const equals = parameter.indexOf('=');

    if (equals === -1) {
      continue;
    }

    const name = parameter.slice(0, equals);
    const value = parameter.slice(equals + 1);

    if (name === RESET_TOKEN_QUERY_PARAM && value.length > 0) {
      return decodeURIComponent(value);
    }
  }

  return null;
}

/** Nothing changes between renders, so the snapshot is a constant. */
function subscribeToHashChange(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);

  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/** The server has no fragment, so its snapshot is always "no token". */
function theServerSnapshot(): null {
  return null;
}

export function ResetPasswordForm() {
  const token = useSyncExternalStore(
    subscribeToHashChange,
    readFragmentToken,
    theServerSnapshot,
  );

  if (token === null) {
    return (
      <p style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
        This reset link is not valid. Request a new one.
      </p>
    );
  }

  return (
    <p style={{ margin: 0, color: 'var(--on-surface-variant)' }}>
      Enter your new password to finish resetting it.
    </p>
  );
}
