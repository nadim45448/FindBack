/**
 * The `Account` aggregate root.
 *
 * **Status is changed only through the aggregate's decision methods.** There
 * is no `setStatus` and no status setter, so no caller can move an account
 * into a state the lifecycle does not allow.
 *
 * The invariants:
 *
 * 1. A **new** account is always `Pending`, always `isAdministrator = false`,
 *    and never carries a `rejectionReason`.
 * 2. `approve()` is legal **only** from `Pending`, and sets `Active` +
 *    `activatedAt`.
 * 3. `reject()` is legal **only** from `Pending`, and sets `Rejected` +
 *    `rejectionReason`.
 * 4. `approve()` and `reject()` are mutually exclusive — the first one wins
 *    and the second is refused (story 002 criterion 4, and the concurrent
 *    administrators edge case).
 * 5. No method moves an account out of `Active` **except `deactivate()`**,
 *    which is legal **only** from `Active` — deactivation is bolt `005`'s
 *    scope, and adding a half-built transition here would leave an
 *    unfinished path in the aggregate.
 * 6. `rejectionReason` is set **only** by `reject()`.
 * 7. `isAdministrator` cannot be true on a non-`Active` account — and
 *    `deactivate()` clears it, so no stale privilege survives a deactivation.
 * 8. `updateProfile()` is legal **only** on an `Active` account, and it
 *    changes **only** the display name and the self-declared role.
 *
 * Pure — no I/O, no framework imports.
 */

import { IllegalTransitionError, PermissionDeniedError } from '@/lib/errors';

import type { AccountStatus } from './account-status';
import { capabilityFor, type AccountCapability } from './account-status';
import type { EmailAddress } from './email-address';
import type { DisplayName } from './display-name';
import type { PasswordHash } from './password-policy';
import type { RejectionReason } from './rejection-reason';
import type { SelfDeclaredRoleValue } from './self-declared-role';
import type { ProfileChange } from './profile-change';

/** The account's immutable identity and current state. */
export interface Account {
  readonly id: string;
  readonly email: EmailAddress;
  readonly passwordHash: PasswordHash;
  readonly displayName: DisplayName;
  readonly selfDeclaredRole: SelfDeclaredRoleValue;
  readonly status: AccountStatus;
  readonly isAdministrator: boolean;
  readonly rejectionReason: RejectionReason | null;
  readonly createdAt: Date;
  readonly activatedAt: Date | null;
  readonly deactivatedAt: Date | null;
}

/** The fields a new account is created with. */
export interface RegisterAccountParams {
  readonly id: string;
  readonly email: EmailAddress;
  readonly passwordHash: PasswordHash;
  readonly displayName: DisplayName;
  readonly selfDeclaredRole: SelfDeclaredRoleValue;
  readonly createdAt: Date;
}

/**
 * Register a new account.
 *
 * The account is `Pending` and is **not** an administrator. There is no
 * parameter for either, because a self-registration must never be able to
 * create an administrator or an already-active account.
 */
export function registerAccount(params: RegisterAccountParams): Account {
  return {
    id: params.id,
    email: params.email,
    passwordHash: params.passwordHash,
    displayName: params.displayName,
    selfDeclaredRole: params.selfDeclaredRole,
    status: 'Pending',
    isAdministrator: false,
    rejectionReason: null,
    createdAt: params.createdAt,
    activatedAt: null,
    deactivatedAt: null,
  };
}

/**
 * Approve a pending account.
 *
 * @throws {IllegalTransitionError} when the account is not `Pending` — the
 * concurrent-decision case, where the first decision wins and the second is
 * refused.
 */
export function approveAccount(account: Account, at: Date): Account {
  if (account.status !== 'Pending') {
    throw new IllegalTransitionError(
      `Only a pending registration can be approved; this account is ${account.status}.`,
    );
  }

  return {
    ...account,
    status: 'Active',
    activatedAt: at,
    rejectionReason: null,
  };
}

/**
 * Reject a pending account.
 *
 * The reason is **optional**: an administrator must never be blocked from
 * rejecting an account because the reason box was empty (story 002 and
 * story 007's edge cases). The boundary enforces the PRD's 5-character
 * minimum on the input; the aggregate tolerates its absence.
 *
 * **No timestamp is taken, and none is stored.** A rejection is not a
 * deactivation, so `deactivatedAt` stays `null` — that column records a
 * deactivation and nothing else. The moment of the rejection is carried by
 * the audit trail (FR-31 event 12), which is where FR-3's "recorded in the
 * audit trail" is satisfied.
 *
 * @throws {IllegalTransitionError} when the account is not `Pending`.
 */
export function rejectAccount(account: Account, reason: RejectionReason | null): Account {
  if (account.status !== 'Pending') {
    throw new IllegalTransitionError(
      `Only a pending registration can be rejected; this account is ${account.status}.`,
    );
  }

  return {
    ...account,
    status: 'Rejected',
    rejectionReason: reason,
    activatedAt: null,
  };
}

/**
 * Deactivate an active account (FR-5).
 *
 * **The administrator flag is cleared.** The target's own flag confers no
 * protection — per the owner's decision and PRD FR-5, any administrator may
 * deactivate any `Active` account, including another administrator — and a
 * deactivated account that kept its flag would carry stale privilege.
 *
 * **Only the account row changes.** Reports, Claims, Recovery Responses,
 * messages, and the audit history are untouched: deactivation preserves
 * everything (FR-5), and the use case that calls this has no repository that
 * could reach them.
 *
 * **The session revocations are not here.** They are a separate write, and
 * the use case commits the status change and every revocation in **one
 * transaction** (ADR-3) — so a deactivated account never holds a live
 * session, not even for an instant.
 *
 * @throws {IllegalTransitionError} when the account is not `Active` — a
 * `Pending` or `Rejected` account is not deactivated, and a `Deactivated`
 * one is handled by the use case as an idempotent no-op rather than reaching
 * this method.
 */
export function deactivateAccount(account: Account, at: Date): Account {
  if (account.status !== 'Active') {
    throw new IllegalTransitionError(
      `Only an active account can be deactivated; this account is ${account.status}.`,
    );
  }

  return {
    ...account,
    status: 'Deactivated',
    isAdministrator: false,
    deactivatedAt: at,
  };
}

/**
 * Update the member profile (FR-52).
 *
 * **Only the two editable fields can change.** The email, the status, the
 * administrator flag, and every other lifecycle field are absent from the
 * `ProfileChange` type, so there is no code path by which they could reach
 * this method — the read-only property is structural, not a validation rule
 * that a future edit could forget.
 *
 * **Only an `Active` account has an editor** (story 010 criterion 6). The
 * check lives here rather than in the route, so every path is covered by one
 * check.
 *
 * @throws {PermissionDeniedError} when the account is not `Active`.
 */
export function updateAccountProfile(account: Account, change: ProfileChange): Account {
  if (account.status !== 'Active') {
    throw new PermissionDeniedError(
      'Only an active account can edit its profile.',
    );
  }

  return {
    ...account,
    displayName: change.displayName ?? account.displayName,
    selfDeclaredRole: change.selfDeclaredRole ?? account.selfDeclaredRole,
  };
}

/**
 * The capability the account holds.
 *
 * The single source of truth for "may this account act?". `Active` is the
 * only status with member capability.
 */
export function capabilityOf(account: Account): AccountCapability {
  return capabilityFor(account.status);
}

/**
 * True when the account may act as a member.
 *
 * A `Pending` account with the administrator flag set is still **not** a
 * member — the flag alone grants nothing before approval (story 006's edge
 * case).
 */
export function isMember(account: Account): boolean {
  return capabilityOf(account) === 'member';
}

/**
 * True when the account may act as an administrator.
 *
 * The flag is honoured **only** on an `Active` account.
 */
export function isAdministrator(account: Account): boolean {
  return account.isAdministrator && account.status === 'Active';
}

/**
 * True when the account authenticates at all.
 *
 * A `Pending` account authenticates (FR-4) but gains no capability; a
 * `Rejected` or `Deactivated` account does not authenticate at all, and
 * never produces a session.
 */
export function canAuthenticate(account: Account): boolean {
  return account.status === 'Active' || account.status === 'Pending';
}
