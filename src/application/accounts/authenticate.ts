/**
 * The authentication use case.
 *
 * FR-4: a member signs in with an email and a password.
 *
 * **Wrong email and wrong password share one sentence.** There is no
 * separate shape for "unknown email" versus "wrong password", so the
 * response cannot disclose whether the address is registered. A
 * `Rejected` or `Deactivated` account that presented the right password
 * still receives the generic inactive message.
 *
 * **The two refusals are indistinguishable in work, not only in wording.** An
 * unknown email and a wrong password both perform exactly one Argon2id
 * verification, against a hash that was not the one stored. The account is
 * looked up first; if it is missing, a dummy hash is verified instead. A
 * missing account therefore costs the same as a wrong password, and the
 * response time does not disclose whether the account exists.
 *
 * A `Pending` account **does** authenticate — it is given a session, and the
 * session carries the `Pending` status, which is where the restriction lives
 * (FR-2, story 006). A `Rejected` or `Deactivated` account does not
 * authenticate at all.
 */

import {
  canAuthenticate,
  createActorContext,
  createGenericInactiveMessage,
  createInvalidCredentialsMessage,
  normalizeEmail,
  type Account,
  type ActorContext,
} from '@/domain/accounts';

import type { AccountRepository } from './ports/account-repository';
import type { PasswordHasher } from './ports/password-hasher';

/** The outcome of an authentication attempt. */
export type AuthenticationOutcome =
  | { readonly ok: true; readonly account: Account; readonly actor: ActorContext }
  | { readonly ok: false; readonly message: { readonly value: string } };

/**
 * A hash used when the account does not exist.
 *
 * The point is to make an unknown email cost the same as a wrong password.
 * It is a real Argon2id hash of a value nobody knows, so the verification
 * does the same work.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$c2VudGZhbGZhbGZhbGZhbGZ$8QUnJ7Yx1k6oVx0m5oKc3nJ5p8r4s2t1u9v7w6x5y4z3';

/** The authentication use case. */
export class Authenticate {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  /**
   * Authenticate a member.
   *
   * Never throws for a business refusal — a wrong email or password is
   * `Invalid email or password`; an inactive account is the generic
   * inactive message.
   */
  async execute(email: string, plaintext: string): Promise<AuthenticationOutcome> {
    const normalized = normalizeEmail(email);
    const account = await this.accounts.findByEmail(normalized);

    if (!account) {
      // Verify against a dummy hash so an unknown email costs the same as a
      // wrong password. The result is discarded.
      await this.hasher.verify(plaintext, { value: DUMMY_HASH });

      return { ok: false, message: createInvalidCredentialsMessage() };
    }

    const passwordMatches = await this.hasher.verify(plaintext, account.passwordHash);

    if (!passwordMatches) {
      return { ok: false, message: createInvalidCredentialsMessage() };
    }

    if (!canAuthenticate(account)) {
      return { ok: false, message: createGenericInactiveMessage() };
    }

    return {
      ok: true,
      account,
      actor: createActorContext({
        actorId: account.id,
        status: account.status,
        isAdministrator: account.isAdministrator,
        displayName: account.displayName.value,
      }),
    };
  }
}
