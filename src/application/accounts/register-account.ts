/**
 * The registration use case.
 *
 * FR-1: a visitor registers with a name, an email, a password, and a
 * self-declared role; the account is created `Pending`; **no email is sent**.
 *
 * **The account row and the audit record commit together.** The audit write
 * takes the caller's transaction handle, so a registration that did not
 * happen cannot leave a trail entry behind, and a registration that did
 * happen always has one (ADR-3, decision 3).
 *
 * The audit record is the **non-numbered** `registration.submitted` record —
 * FR-2 requires the trail to record the registration, and FR-31's frozen
 * numbered catalog has no number for it (the Stage 1 Conflict 1 reading,
 * confirmed by the owner).
 */

import {
  createDisplayName,
  createEmailAddress,
  createPasswordHash,
  createSelfDeclaredRole,
  registerAccount,
  type Account,
} from '@/domain/accounts';
import { assertPasswordPolicy, DuplicateEmailError } from '@/domain/accounts';

import type { AccountRepository } from './ports/account-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { AuditWriter } from '@/application/audit-writer';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The command that registers an account. */
export interface RegisterAccountCommand {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
  readonly selfDeclaredRole: string;
  readonly selfDeclaredRoleOther?: string | null;
}

/** What the registration produced. */
export interface RegisteredAccount {
  readonly account: Account;
}

/** The registration use case. */
export class RegisterAccount {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Register an account.
   *
   * @throws {ValidationError} when a field fails its policy.
   * @throws {DuplicateEmailError} when the email is already registered.
   */
  async execute(
    command: RegisterAccountCommand,
    transaction: TransactionHandle,
  ): Promise<RegisteredAccount> {
    const email = createEmailAddress(command.email);
    const displayName = createDisplayName(command.displayName);
    const selfDeclaredRole = createSelfDeclaredRole(
      command.selfDeclaredRole,
      command.selfDeclaredRoleOther,
    );

    // The policy is enforced here, in the domain, and not only at the route
    // boundary — a caller that reaches the use case directly is still
    // protected.
    assertPasswordPolicy(command.password);

    if (await this.accounts.existsByEmail(email.value)) {
      throw new DuplicateEmailError();
    }

    const passwordHash = createPasswordHash((await this.hasher.hash(command.password)).value);

    const account = registerAccount({
      id: crypto.randomUUID(),
      email,
      passwordHash,
      displayName,
      selfDeclaredRole,
      createdAt: new Date(),
    });

    const saved = await this.accounts.save(account, transaction);

    // FR-2's registration record, in the same transaction as the account
    // row. The actor is the registering member — the account being created
    // is the only actor available.
    await this.audit.recordNonNumbered(
      {
        eventType: 'registration.submitted',
        parent: { parentType: 'account', parentId: saved.id },
        actor: { actorId: saved.id, actorRole: 'member' },
        payload: {
          displayName: saved.displayName.value,
          email: saved.email.value,
          selfDeclaredRole: saved.selfDeclaredRole.role,
        },
      },
      transaction,
    );

    return { account: saved };
  }
}
