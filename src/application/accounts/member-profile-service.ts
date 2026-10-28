/**
 * The member-profile use case.
 *
 * FR-52: a member edits their own profile. **Exactly two** fields are
 * editable — the display name and the self-declared role. The email is
 * read-only, and so are the status, the administrator flag, and every other
 * lifecycle field.
 *
 * **The edit surface is structural.** The `ProfileChange` type carries
 * exactly two optional fields, so there is no code path by which an email, a
 * status, or an administrator flag could reach the aggregate. The forbidden
 * edits are refused by **the shape of the type**, not by four `if`
 * statements a future edit could forget.
 *
 * **A no-op edit writes no audit record.** A member who opens the editor and
 * saves without changing anything has changed nothing, and there is nothing
 * to record — the trail stays a record of what happened.
 *
 * **The `changedFields` and `previousValues` maps are what FR-52 requires the
 * record to carry** — "the changed fields, and the previous values". The use
 * case computes them, so the audit record never has to reconstruct them from
 * the request.
 */

import {
  updateAccountProfile,
  type Account,
  type ProfileChange,
  type ProfileEditResult,
  type ProfileField,
  type ProfileFieldValues,
} from '@/domain/accounts';
import { NotFoundError } from '@/lib/errors';

import type { AccountRepository } from './ports/account-repository';
import type { AuditWriter } from '@/application/audit-writer';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** The outcome of a profile edit. */
export interface ProfileEditOutcome {
  /** The account, as it is now. */
  readonly account: Account;
  /** The fields that changed, and their previous values. */
  readonly result: ProfileEditResult;
  /** True when the edit changed something. */
  readonly changed: boolean;
}

/** The member-profile use case. */
export class MemberProfileService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly audit: AuditWriter,
  ) {}

  /**
   * Read the member's profile.
   *
   * @throws {NotFoundError} when no such account exists.
   */
  async read(accountId: string): Promise<Account> {
    const account = await this.accounts.findById(accountId);

    if (!account) {
      throw new NotFoundError('No account with that id.');
    }

    return account;
  }

  /**
   * Update the member's profile.
   *
   * @throws {NotFoundError} when no such account exists.
   * @throws {PermissionDeniedError} when the account is not `Active` — a
   * non-`Active` member has no editor (story 010 criterion 6).
   */
  async execute(
    accountId: string,
    change: ProfileChange,
    actorId: string,
    transaction: TransactionHandle,
  ): Promise<ProfileEditOutcome> {
    const account = await this.accounts.findById(accountId);

    if (!account) {
      throw new NotFoundError('No account with that id.');
    }

    const previousValues = capturePreviousValues(account);

    // The `Active`-only rule lives in the aggregate, so every path is
    // covered by one check — including the read path's sibling.
    const updated = updateAccountProfile(account, change);

    const changedFields = diffFields(account, updated);
    const changedPreviousValues = pickPreviousValues(previousValues, changedFields);

    // The no-op rule: nothing changed, so nothing is written and nothing is
    // recorded.
    if (changedFields.length === 0) {
      return { account, result: { changedFields, previousValues: changedPreviousValues }, changed: false };
    }

    const saved = await this.accounts.save(updated, transaction);

    // A **non-numbered** record — FR-52's profile edit introduces no new
    // FR-31 or FR-48 event number, and it does not renumber events 1–30.
    await this.audit.recordNonNumbered(
      {
        eventType: 'member_profile.edited',
        parent: { parentType: 'account', parentId: saved.id },
        actor: { actorId, actorRole: 'member' },
        payload: {
          changedFields,
          previousValues: changedPreviousValues,
        },
      },
      transaction,
    );

    return {
      account: saved,
      result: { changedFields, previousValues: changedPreviousValues },
      changed: true,
    };
  }
}

/** The values the two editable fields held before the edit. */
function capturePreviousValues(account: Account): ProfileFieldValues {
  return {
    displayName: account.displayName.value,
    selfDeclaredRole: account.selfDeclaredRole.otherText
      ? `${account.selfDeclaredRole.role}:${account.selfDeclaredRole.otherText}`
      : account.selfDeclaredRole.role,
  };
}

/** The editable fields whose values differ between the two accounts. */
function diffFields(before: Account, after: Account): readonly ProfileField[] {
  const changed: ProfileField[] = [];

  if (before.displayName.value !== after.displayName.value) {
    changed.push('displayName');
  }

  if (
    before.selfDeclaredRole.role !== after.selfDeclaredRole.role ||
    before.selfDeclaredRole.otherText !== after.selfDeclaredRole.otherText
  ) {
    changed.push('selfDeclaredRole');
  }

  return changed;
}

/** The previous values, narrowed to the fields that actually changed. */
function pickPreviousValues(
  previous: ProfileFieldValues,
  changedFields: readonly ProfileField[],
): ProfileFieldValues {
  const picked: Record<string, string> = {};

  for (const field of changedFields) {
    const value = previous[field];

    if (value !== undefined) {
      picked[field] = value;
    }
  }

  return picked as ProfileFieldValues;
}
