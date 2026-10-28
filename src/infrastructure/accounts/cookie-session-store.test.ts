/**
 * The session-cookie store's tests.
 *
 * The `__Host-` rules are the point: **`Secure` is always set**, because a
 * `__Host-` cookie missing it is rejected outright by the browser, and
 * `Path` must be `/` with no `Domain`.
 *
 * These were verified empirically against Chromium before the
 * implementation was written — see the module's comment.
 */

import { describe, expect, it } from 'vitest';

import {
  buildClearedSessionCookie,
  buildSessionCookie,
  SESSION_COOKIE_NAME,
  SessionTokenStore,
} from './cookie-session-store';

describe('the session cookie', () => {
  it('is a __Host- prefixed cookie', () => {
    // The prefix is a browser-enforced rule, not a convention.
    expect(SESSION_COOKIE_NAME.startsWith('__Host-')).toBe(true);
    expect(buildSessionCookie('abc')).toContain(`${SESSION_COOKIE_NAME}=abc`);
  });

  it('always sets Secure, in every environment', () => {
    // There is no `NODE_ENV` branch anywhere in this file, deliberately.
    // A `__Host-` cookie without `Secure` is REJECTED by the browser — the
    // cookie would never be stored, and local login would break entirely.
    expect(buildSessionCookie('abc')).toContain('Secure');
  });

  it('sets Path=/', () => {
    // `__Host-` requires it.
    expect(buildSessionCookie('abc')).toContain('Path=/');
  });

  it('sets no Domain attribute', () => {
    // `__Host-` forbids it — the cookie must be host-only.
    expect(buildSessionCookie('abc')).not.toContain('Domain');
  });

  it('is HttpOnly', () => {
    // The cookie must not be readable from JavaScript.
    expect(buildSessionCookie('abc')).toContain('HttpOnly');
  });

  it('is SameSite=Lax', () => {
    expect(buildSessionCookie('abc')).toContain('SameSite=Lax');
  });

  it('carries a Max-Age', () => {
    expect(buildSessionCookie('abc')).toContain('Max-Age=');
  });
});

describe('clearing the session cookie', () => {
  it('keeps every attribute and expires the cookie', () => {
    // The clearing cookie must have the same attributes, or the browser
    // will not match it to the cookie it is replacing.
    const cookie = buildClearedSessionCookie();

    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).not.toContain('Domain');
  });
});

describe('the token store', () => {
  const store = new SessionTokenStore();

  it('generates a distinct token each time', () => {
    const first = store.generateToken();
    const second = store.generateToken();

    expect(first).not.toBe(second);
  });

  it('generates a token long enough to be unguessable', () => {
    // 32 bytes of entropy, base64url-encoded.
    expect(store.generateToken().length).toBeGreaterThanOrEqual(43);
  });

  it('generates a URL-safe token', () => {
    expect(store.generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashes deterministically', () => {
    expect(store.hashToken('abc')).toBe(store.hashToken('abc'));
  });

  it('hashes differently for different tokens', () => {
    expect(store.hashToken('abc')).not.toBe(store.hashToken('abd'));
  });

  it('never returns the token itself from the hash', () => {
    const token = store.generateToken();

    expect(store.hashToken(token)).not.toBe(token);
  });

  it('compares two equal hashes as equal', () => {
    expect(SessionTokenStore.hashesMatch('abc123', 'abc123')).toBe(true);
  });

  it('compares two different hashes as different', () => {
    expect(SessionTokenStore.hashesMatch('abc123', 'abc124')).toBe(false);
  });

  it('refuses hashes of different lengths without throwing', () => {
    expect(SessionTokenStore.hashesMatch('abc', 'abcdef')).toBe(false);
  });
});
