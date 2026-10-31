/**
 * The refused-login copy for a wrong email or password.
 *
 * Unknown email and wrong password share this sentence so the response
 * does not disclose whether the address is registered. A `Rejected` or
 * `Deactivated` account that presented the right password still uses
 * `GENERIC_INACTIVE_MESSAGE`.
 *
 * Pure — no I/O, no framework imports.
 */

/** The message a wrong email or password returns. */
export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';

/** The invalid-credentials message. */
export interface InvalidCredentialsMessage {
  readonly value: string;
}

/** The single invalid-credentials message. */
export function createInvalidCredentialsMessage(): InvalidCredentialsMessage {
  return { value: INVALID_CREDENTIALS_MESSAGE };
}
