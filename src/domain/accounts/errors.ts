/**
 * Account-specific domain errors.
 *
 * These are typed and expected (coding-standards § Error handling): they are
 * business outcomes, not failures. Anything thrown that is not one of these
 * is a genuine defect and is logged as one.
 *
 * None of them ever surface raw text to a member, and none of them ever
 * carry a credential.
 */

import { DomainError } from '@/lib/errors';

/**
 * The email address is already registered (FR-1's duplicate-email validation
 * error).
 *
 * A distinct type from the rate-limit refusal, so the two are never
 * conflated: the duplicate-email error is a 409, the rate limit a 429.
 */
export class DuplicateEmailError extends DomainError {
  constructor(message = 'That email address is already registered.') {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The credentials did not authenticate, **or** the account is not allowed to
 * act.
 *
 * The two are one type on purpose. FR-4, story 003 criterion 5, and story
 * 007 criterion 3 all require that a refused login be indistinguishable
 * from a wrong password and from an unknown email. A single error type makes
 * that a compile-time fact rather than a convention — there is no way to
 * return "wrong password" without returning "account inactive" too.
 *
 * The message is the `GenericInactiveMessage` copy, and it is the **only**
 * message a refused login ever produces.
 */
export class AuthenticationError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The stored password hash is malformed and cannot be parsed.
 *
 * A genuine defect, not a business outcome — a corrupt hash is not a login
 * failure to be hidden behind the generic message. It is logged as a defect
 * and surfaces as a 500.
 */
export class PasswordHashVerificationError extends DomainError {
  constructor(message = 'The stored password hash could not be verified.') {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The reset token is not usable (FR-51).
 *
 * **One error type for five refusals.** A token that was absent, malformed,
 * unknown, already used, and expired are **five** different situations, and
 * they deliberately collapse into **one** error and **one** response body.
 *
 * The distinction is made *internally* — the service knows which of the five
 * happened — but the caller must not be able to tell them apart, because
 * each distinction is a probe into whether a given address has an account.
 *
 * **The message carries no account id, no email, and no token.** A refused
 * reset's log line records the fact and the reason class, and the token is
 * redacted.
 */
export class InvalidResetTokenError extends DomainError {
  constructor(message = 'This reset link is not valid. Request a new one.') {
    super(message);
    this.name = new.target.name;
  }
}
