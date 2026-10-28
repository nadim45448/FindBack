/**
 * The reset token's generator and the reset URL's builder.
 *
 * **256 bits of CSPRNG entropy**, base64url-encoded, so the token is 43
 * characters and survives a query string without escaping.
 *
 * `base64url` (not standard base64) because standard base64's `+` and `/`
 * need encoding in a URL, and the token's transmission must not introduce
 * escaping differences.
 *
 * The generation lives in `infrastructure/` because `node:crypto` is a Node
 * API and `domain/` must stay importable with no Node runtime.
 */

import { randomBytes } from 'node:crypto';

import { RESET_TOKEN_ENTROPY_BYTES, buildResetUrl } from '@/domain/accounts';

/**
 * Mint a fresh reset token.
 *
 * The plaintext is returned to the caller, which puts it in the reset link
 * and in the email — and nowhere else. It is never persisted, never logged,
 * and never audited.
 */
export function generateResetToken(): string {
  return randomBytes(RESET_TOKEN_ENTROPY_BYTES).toString('base64url');
}

/**
 * The application's base URL.
 *
 * Read from the environment, with a local-development default. The same
 * value builds the FR-27 email's login link, so the two emails cannot
 * disagree about the deployment's origin.
 */
export function readAppBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const configured = env.APP_BASE_URL;

  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }

  return 'http://localhost:3000';
}

/**
 * Build the reset URL for a token.
 *
 * The token travels in the **URL's fragment**, because the member clicks a
 * link in an email. The fragment is deliberately **not** in the query
 * string: the query string is part of the request line, and the request
 * line is what a platform's access log records — so a token there is logged
 * before any application code runs. The fragment is never sent to the
 * server, so it is never logged. The page reads it in the browser and
 * posts the token in the request body.
 */
export function buildResetLink(baseUrl: string, token: string): string {
  return buildResetUrl(baseUrl, { value: token });
}
