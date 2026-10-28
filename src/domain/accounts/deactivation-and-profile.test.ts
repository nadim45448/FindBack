/**
 * The `Account` aggregate's deactivation and profile-edit rules.
 *
 * The invariants the domain model fixes for bolt `005`, asserted one by one.
 */

import { describe, expect, it } from 'vitest';

import {
  canAuthenticate,
  deactivateAccount,
  isAdministrator,
  registerAccount,
  updateAccountProfile,
  type Account,
} from './account';
import { createDisplayName } from './display-name';
import { createEmailAddress } from './email-address';
import { createPasswordHash } from './password-policy';
import { createSelfDeclaredRole } from './self-declared-role';
import { IllegalTransitionError, PermissionDeniedError } from '@/lib/errors';

/** A registered account, for the tests to act on. */
function anAccount(overrides: Partial<Account> = {}): Account {
  const base = registerAccount({
    id: '00000000-0000-4000-8000-000000000001',
    email: createEmailAddress('jane@example.org'),
    passwordHash: createPasswordHash('$argon2id$hash'),
    displayName: createDisplayName('Jane Doe'),
    selfDeclaredRole: createSelfDeclaredRole('Student'),
    createdAt: new Date('2026-10-27T10:00:00Z'),
  });

  return { ...base, ...overrides };
}

/** An `Active` account, for the tests to act on. */
function anActiveAccount(overrides: Partial<Account> = {}): Account {
  return anAccount({ status: 'Active', activatedAt: new Date('2026-10-27T11:00:00Z'), ...overrides });
}

describe('deactivating an account', () => {
  it('makes the account Deactivated and records the deactivation time', () => {
    const at = new Date('2026-10-28T12:00:00Z');
    const deactivated = deactivateAccount(anActiveAccount(), at);

    expect(deactivated.status).toBe('Deactivated');
    expect(deactivated.deactivatedAt).toEqual(at);
  });

  it('clears the administrator flag, so no stale privilege survives', () => {
    const deactivated = deactivateAccount(
      anActiveAccount({ isAdministrator: true }),
      new Date('2026-10-28T12:00:00Z'),
    );

    expect(deactivated.isAdministrator).toBe(false);
  });

  it('refuses an account that is not Active', () => {
    expect(() => deactivateAccount(anAccount(), new Date())).toThrow(IllegalTransitionError);
  });

  it('refuses an already-Deactivated account', () => {
    const deactivated = anActiveAccount({
      status: 'Deactivated',
      deactivatedAt: new Date('2026-10-28T12:00:00Z'),
    });

    expect(() => deactivateAccount(deactivated, new Date())).toThrow(IllegalTransitionError);
  });

  it('leaves the deactivated account unable to authenticate', () => {
    const deactivated = deactivateAccount(anActiveAccount(), new Date());

    expect(canAuthenticate(deactivated)).toBe(false);
  });

  it('leaves the deactivated account without administrator capability', () => {
    const deactivated = deactivateAccount(
      anActiveAccount({ isAdministrator: true }),
      new Date(),
    );

    expect(isAdministrator(deactivated)).toBe(false);
  });

  it('preserves the account row — nothing is deleted', () => {
    const deactivated = deactivateAccount(anActiveAccount(), new Date());

    // The row is retained: the id, the email, and the creation time all
    // survive. FR-5 says the account and its history are preserved.
    expect(deactivated.id).toBe('00000000-0000-4000-8000-000000000001');
    expect(deactivated.email.value).toBe('jane@example.org');
    expect(deactivated.createdAt).toEqual(new Date('2026-10-27T10:00:00Z'));
  });

  it('leaves the activation time alone', () => {
    const deactivated = deactivateAccount(anActiveAccount(), new Date());

    expect(deactivated.activatedAt).toEqual(new Date('2026-10-27T11:00:00Z'));
  });
});

describe('editing the member profile', () => {
  it('changes the display name', () => {
    const updated = updateAccountProfile(anActiveAccount(), {
      displayName: createDisplayName('Jane Smith'),
    });

    expect(updated.displayName.value).toBe('Jane Smith');
  });

  it('changes the self-declared role', () => {
    const updated = updateAccountProfile(anActiveAccount(), {
      selfDeclaredRole: createSelfDeclaredRole('Employee'),
    });

    expect(updated.selfDeclaredRole.role).toBe('Employee');
  });

  it('leaves the email alone — it is read-only', () => {
    const updated = updateAccountProfile(anActiveAccount(), {
      displayName: createDisplayName('Jane Smith'),
    });

    expect(updated.email.value).toBe('jane@example.org');
  });

  it('leaves the status alone — it is read-only', () => {
    const updated = updateAccountProfile(anActiveAccount(), {
      displayName: createDisplayName('Jane Smith'),
    });

    expect(updated.status).toBe('Active');
  });

  it('leaves the administrator flag alone — it is read-only', () => {
    const updated = updateAccountProfile(anActiveAccount({ isAdministrator: true }), {
      displayName: createDisplayName('Jane Smith'),
    });

    expect(updated.isAdministrator).toBe(true);
  });

  it('leaves the deactivation time alone', () => {
    const updated = updateAccountProfile(anActiveAccount(), {
      displayName: createDisplayName('Jane Smith'),
    });

    expect(updated.deactivatedAt).toBeNull();
  });

  it('refuses a Pending account', () => {
    expect(() => updateAccountProfile(anAccount(), { displayName: createDisplayName('X') })).toThrow(
      PermissionDeniedError,
    );
  });

  it('refuses a Rejected account', () => {
    const rejected = anAccount({ status: 'Rejected' });

    expect(() => updateAccountProfile(rejected, { displayName: createDisplayName('X') })).toThrow(
      PermissionDeniedError,
    );
  });

  it('refuses a Deactivated account', () => {
    const deactivated = anAccount({ status: 'Deactivated' });

    expect(() => updateAccountProfile(deactivated, { displayName: createDisplayName('X') })).toThrow(
      PermissionDeniedError,
    );
  });

  it('changes nothing when the change is empty', () => {
    const account = anActiveAccount();
    const updated = updateAccountProfile(account, {});

    expect(updated.displayName.value).toBe(account.displayName.value);
    expect(updated.selfDeclaredRole.role).toBe(account.selfDeclaredRole.role);
  });
});
