/**
 * The session-cookie store.
 *
 * **The `Secure` flag is always set, in every environment.** This is not a
 * default that a local-development branch can drop: a `__Host-` cookie
 * missing `Secure` is **rejected outright** by the browser, so the "drop
 * `Secure` for local HTTP" fallback would have made the cookie inert and
 * broken every local login.
 *
 * That was verified empirically against Chromium before this implementation
 * was written:
 *
 * | Variant over `http://localhost`              | Result                          |
 * |-----------------------------------------------|---------------------------------|
 * | `__Host-` with `Secure`, `Path=/`, no `Domain` | **ACCEPTED**, and sent back    |
 * | `__Host-` without `Secure`                     | **REJECTED** — no cookie stored |
 * | `__Host-` with `Secure` but missing `Path=/`   | **REJECTED** — no cookie stored |
 *
 * Browsers treat `http://localhost` and `http://127.0.0.1` as potentially
 * trustworthy origins, so a `Secure` cookie works locally with no
 * conditional at all. One code path, one set of attributes.
 *
 * The `__Host-` prefix carries its own rules, all of which are enforced by
 * the browser and all of which the implementation follows:
 *
 * - `Secure` must be set;
 * - `Path` must be `/`;
 * - `Domain` must be absent.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** The session cookie's name. The `__Host-` prefix is a browser-enforced rule. */
export const SESSION_COOKIE_NAME = '__Host-fb';

/** How long the cookie itself lives, in seconds. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

/**
 * Build the `Set-Cookie` header value for a session token.
 *
 * The attributes are exactly the four the `__Host-` prefix requires, plus
 * `SameSite=Lax` — and **no** `Domain`.
 */
export function buildSessionCookie(
  token: string,
  maxAgeSeconds = SESSION_COOKIE_MAX_AGE_SECONDS,
): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ].join('; ');
}

/**
 * Build the `Set-Cookie` header value that clears the session cookie.
 *
 * The same attributes, with `Max-Age=0`, so the browser removes the cookie
 * rather than leaving a stale one behind.
 */
export function buildClearedSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Max-Age=0',
  ].join('; ');
}

/** Mints session tokens and hashes them. */
export class SessionTokenStore {
  constructor(private readonly tokenBytes: number = 32) {}

  /**
   * Mint a fresh session token.
   *
   * 32 bytes of cryptographically random data, base64url-encoded — the
   * token is a bearer credential, so it must be unguessable.
   */
  generateToken(): string {
    return randomBytes(this.tokenBytes).toString('base64url');
  }

  /**
   * Hash a session token for storage and lookup.
   *
   * SHA-256, not Argon2id: the token is **high-entropy random**, not a
   * low-entropy secret, so a slow hash would buy nothing — there is no
   * dictionary to search. A fast hash is correct here, and the token's
   * entropy is what protects it.
   */
  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  /**
   * Compare two token hashes in constant time.
   *
   * Used where a hash must be compared rather than looked up — the CSRF
   * token, which is derived from the session's token hash.
   */
  static hashesMatch(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left, 'utf8');
    const rightBuffer = Buffer.from(right, 'utf8');

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
