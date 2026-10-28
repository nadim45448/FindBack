/**
 * The password-reset **request** use case.
 *
 * FR-51: a password-reset request must not disclose whether an email is
 * registered, whether the account exists, or the account's status — and it
 * must not do so in the **body**, the **timing**, or the **subsequent screen
 * state**.
 *
 * **This service closes the body and the timing.**
 *
 * **The body.** The response is built **once**, **after** the branch that
 * decides whether an email is sent, from a single `NeutralResetConfirmation`
 * value. The branch therefore cannot shape any part of the response — a
 * registered address, an unregistered address, and a registered address in
 * any of the four lifecycle states all receive the same bytes.
 *
 * **The timing.** Two mechanisms, both applied on **every** path (ADR-18):
 *
 * 1. an **unconditional dummy Argon2id verification** through the same
 *    `PasswordHasher` port the login uses, against the same `DUMMY_HASH`
 *    pattern bolt `004`'s login already established — so the miss path costs
 *    what the hit path costs; and
 * 2. a **constant response floor** — the service records the start time and
 *    waits until a fixed deadline has elapsed, so the residual difference
 *    (the hit path additionally creates a token row and builds an email) is
 *    covered.
 *
 * **The floor is a floor, not a tax.** Argon2id at ADR-12's work factors
 * measures ~81 ms, so a 250 ms floor is comfortably above the natural cost:
 * the sleep is usually a no-op and the response returns at roughly the
 * natural cost.
 *
 * **The response never varies with account existence, and the response is
 * built from one value.** That is the whole of the anti-enumeration rule,
 * expressed as a property of this one method.
 */

import {
  createNeutralResetConfirmation,
  issuePasswordResetToken,
  type Account,
  type NeutralResetConfirmation,
} from '@/domain/accounts';

import type { AccountRepository } from './ports/account-repository';
import type { PasswordResetTokenRepository } from './ports/password-reset-token-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { ResetTokenHasher } from './ports/reset-token-hasher';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/**
 * The hash used when the account does not exist.
 *
 * The same pattern bolt `004`'s login uses: a real Argon2id hash of a value
 * nobody knows, so the verification does the same work. The miss path
 * therefore costs what the hit path costs, and the response time does not
 * disclose whether the account exists.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=1$c2VudGZhbGZhbGZhbGZhbGZ$8QUnJ7Yx1k6oVx0m5oKc3nJ5p8r4s2t1u9v7w6x5y4z3';

/**
 * The plaintext used for the dummy verification.
 *
 * Its value is irrelevant — nobody knows it, and nobody could guess it. It
 * exists so the verification has a candidate to check.
 */
const DUMMY_PLAINTEXT = 'a password nobody knows';

/** The reset request service's configuration. */
export interface PasswordResetRequestOptions {
  /**
   * The token's lifetime, in seconds — the **configured** value (ADR-17).
   */
  readonly tokenLifetimeSeconds: number;
  /**
   * The minimum response time, in milliseconds — the anti-enumeration floor
   * (ADR-18). Applied on **every** path, including the rate-limited one.
   */
  readonly minResponseMs: number;
  /**
   * Mints a fresh token plaintext. The infrastructure generates 32 bytes of
   * CSPRNG entropy and base64url-encodes them.
   */
  readonly generateToken: () => string;
}

/** The outcome of a reset request. */
export interface PasswordResetRequestOutcome {
  /**
   * The one response, for every case.
   *
   * The same value whether or not an account exists.
   */
  readonly confirmation: NeutralResetConfirmation;
  /**
   * The address the email must go to, or `null` when no account exists.
   *
   * **Internal only.** The caller sends the email if there is one; the
   * response never mentions it.
   */
  readonly emailRecipient: string | null;
  /**
   * The member's display name, for the email's greeting, or `null`.
   *
   * **Internal only.**
   */
  readonly displayName: string | null;
  /**
   * The token's plaintext, or `null`.
   *
   * **Internal only** — and it goes out of scope as soon as the email has
   * been built. It is never persisted, never logged, and never audited.
   */
  readonly tokenPlaintext: string | null;
}

/** The password-reset request use case. */
export class PasswordResetRequestService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly tokens: PasswordResetTokenRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokenHasher: ResetTokenHasher,
    private readonly options: PasswordResetRequestOptions,
  ) {}

  /**
   * Handle a password-reset request.
   *
   * **The method's shape is the anti-enumeration rule.** The work that must
   * happen on every path is unconditional and comes first; the branch is a
   * single `if` that decides only whether to create a token; and the
   * response is built from one value after the branch closes.
   *
   * The email is **not** sent here. The caller sends it **after** the
   * transaction commits (PRD §10: a failed email must never block the
   * action), so the service returns the recipient and the token's plaintext
   * and the caller owns the send.
   */
  async execute(
    email: string,
    transaction: TransactionHandle,
    now: Date = new Date(),
  ): Promise<PasswordResetRequestOutcome> {
    const startedAt = Date.now();

    const account = await this.accounts.findByEmail(email);

    // ── Unconditional work: the timing equaliser ──────────────────────────
    //
    // The dummy Argon2id verification happens on **every** path. On the hit
    // path it verifies against the account's real hash; on the miss path it
    // verifies against a dummy. Either way the expensive step is performed,
    // so the two paths cost the same.
    await this.hasher.verify(
      DUMMY_PLAINTEXT,
      account ? account.passwordHash : { value: DUMMY_HASH },
    );

    // ── The only branch ───────────────────────────────────────────────────
    //
    // It decides whether to create a token. It cannot shape the response,
    // because the response is built below from a single value.
    let emailRecipient: string | null = null;
    let displayName: string | null = null;
    let tokenPlaintext: string | null = null;

    if (account) {
      const issued = await this.issueToken(account, transaction, now);

      emailRecipient = account.email.value;
      displayName = account.displayName.value;
      tokenPlaintext = issued;
    }

    // ── The floor ─────────────────────────────────────────────────────────
    //
    // The response is held to a constant deadline. The floor is derived from
    // configuration and **never from the account's existence** — a delay
    // derived from whether the account exists would be an existence oracle
    // in itself.
    await this.waitForFloor(startedAt);

    return {
      confirmation: createNeutralResetConfirmation(),
      emailRecipient,
      displayName,
      tokenPlaintext,
    };
  }

  /**
   * Create and persist a reset token.
   *
   * The **hash** is what is stored. The plaintext exists only in memory, on
   * its way into the reset link.
   */
  private async issueToken(
    account: Account,
    transaction: TransactionHandle,
    now: Date,
  ): Promise<string> {
    const plaintext = this.options.generateToken();

    const token = issuePasswordResetToken({
      id: crypto.randomUUID(),
      accountId: account.id,
      tokenHash: this.tokenHasher.hash({ value: plaintext }).value,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.options.tokenLifetimeSeconds * 1000),
    });

    await this.tokens.save(token, transaction);

    return plaintext;
  }

  /**
   * Wait until the response floor has elapsed.
   *
   * A no-op when the work already took longer than the floor — which is the
   * common case, because Argon2id alone measures ~81 ms and the floor is
   * 250 ms.
   */
  private async waitForFloor(startedAt: number): Promise<void> {
    const elapsed = Date.now() - startedAt;
    const remaining = this.options.minResponseMs - elapsed;

    if (remaining <= 0) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, remaining);
    });
  }
}
