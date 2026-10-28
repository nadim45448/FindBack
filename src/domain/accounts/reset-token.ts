/**
 * The reset token's value objects.
 *
 * **The plaintext is a value object so that it cannot be confused with the
 * digest.** The two have different types, different purposes, and different
 * lifecycles, and the type system is what keeps them from being swapped:
 *
 * - the **plaintext** is generated once, carried in the reset link, and
 *   discarded immediately after the email is built;
 * - the **hash** is what goes in the database.
 *
 * The plaintext's length is recorded because it is a **testable property**:
 * 32 bytes of CSPRNG entropy, base64url-encoded, is 43 characters.
 *
 * Pure — no I/O, no framework imports. The **generation** of the random bytes
 * lives in `infrastructure/`, because the domain must stay importable with
 * no Node runtime.
 */

/** The number of random bytes in a reset token. */
export const RESET_TOKEN_ENTROPY_BYTES = 32;

/** The length of a base64url-encoded reset token, in characters. */
export const RESET_TOKEN_LENGTH = 43;

/** The reset token's plaintext. */
export interface ResetTokenPlaintext {
  readonly value: string;
}

/** The reset token's keyed digest. */
export interface ResetTokenHash {
  readonly value: string;
}

/**
 * Build the plaintext wrapper.
 *
 * The only legitimate caller is the infrastructure's token generator, which
 * produces the bytes; this function exists so the plaintext has a type of its
 * own.
 *
 * @throws {ValidationError} when the value is not a well-formed token — the
 * right length, and base64url characters only.
 */
export function createResetTokenPlaintext(value: string): ResetTokenPlaintext {
  if (value.length !== RESET_TOKEN_LENGTH || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('A reset token must be 43 base64url characters.');
  }

  return { value };
}

/**
 * Build the hash wrapper.
 *
 * The only legitimate callers are the hasher (which computes it) and the
 * repository's read path (which reads it back from the database).
 */
export function createResetTokenHash(value: string): ResetTokenHash {
  if (value.length === 0) {
    throw new Error('A reset token hash is required.');
  }

  return { value };
}

/**
 * The reset URL for a token.
 *
 * **The token travels in the URL's fragment**, after the `#`.
 *
 * This reverses the reasoning in the Stage 2 design, which put the token in
 * the query string on the grounds that *"a fragment is never sent to the
 * server, so the server could not read it to look the token up."* That
 * reasoning was correct about the fragment and wrong about the
 * consequence: the server does not need to read the token **from the
 * fragment**. The page's own JavaScript reads it and **posts it in the
 * request body** — and the body never appears in an access log.
 *
 * The query string cannot offer that guarantee. A URL's query string is
 * part of the **request line**, which is what a platform's access log
 * records — and that log is written **before any application code runs**,
 * so no proxy, no rewrite, and no route handler can remove the token from
 * it. A fragment is not sent to the server at all, so it is not in the
 * request line, and it is therefore not in the access log.
 *
 * This was found by measurement, not by reading: a live request to
 * `/reset-password?token=…` was observed in the server's request log with
 * the **full token** in it, and stripping the query entirely in a proxy
 * rewrite did **not** remove it — the logged URL is the *original* request
 * URL, not the rewritten one.
 *
 * The token is base64url-encoded, so it survives the fragment without
 * escaping.
 */
export function buildResetUrl(baseUrl: string, token: ResetTokenPlaintext): string {
  const trimmed = baseUrl.replace(/\/+$/, '');

  return `${trimmed}/reset-password#token=${token.value}`;
}
