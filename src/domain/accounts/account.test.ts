/**
 * The `Account` aggregate's tests.
 *
 * The invariants the domain model fixes, asserted one by one.
 */

import { describe, expect, it } from 'vitest';

import {
  approveAccount,
  canAuthenticate,
  capabilityOf,
  isAdministrator,
  isMember,
  registerAccount,
  rejectAccount,
  type Account,
} from './account';
import { createDisplayName } from './display-name';
import { createEmailAddress } from './email-address';
import { createPasswordHash } from './password-policy';
import { createRejectionReason } from './rejection-reason';
import { createSelfDeclaredRole } from './self-declared-role';
import { IllegalTransitionError } from '@/lib/errors';

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

describe('registering an account', () => {
  it('creates a Pending account', () => {
    const account = anAccount();

    expect(account.status).toBe('Pending');
  });

  it('creates a non-administrator', () => {
    // A self-registration must never be able to create an administrator.
    expect(anAccount().isAdministrator).toBe(false);
  });

  it('carries no rejection reason', () => {
    expect(anAccount().rejectionReason).toBeNull();
  });

  it('is not yet activated', () => {
    expect(anAccount().activatedAt).toBeNull();
  });
});

describe('approving a registration', () => {
  it('makes the account Active and records the activation time', () => {
    const at = new Date('2026-10-27T11:00:00Z');
    const approved = approveAccount(anAccount(), at);

    expect(approved.status).toBe('Active');
    expect(approved.activatedAt).toEqual(at);
  });

  it('refuses an account that is not Pending', () => {
    const active = approveAccount(anAccount(), new Date());

    expect(() => approveAccount(active, new Date())).toThrow(IllegalTransitionError);
  });

  it('refuses an account that was already rejected', () => {
    const rejected = rejectAccount(anAccount(), null);

    expect(() => approveAccount(rejected, new Date())).toThrow(IllegalTransitionError);
  });

  it('refuses a second approval — the first decision wins', () => {
    const approved = approveAccount(anAccount(), new Date());

    expect(() => approveAccount(approved, new Date())).toThrow(IllegalTransitionError);
  });
});

describe('rejecting a registration', () => {
  it('makes the account Rejected and stores the reason', () => {
    const reason = createRejectionReason('Not a member of the organization');
    const rejected = rejectAccount(anAccount(), reason);

    expect(rejected.status).toBe('Rejected');
    expect(rejected.rejectionReason?.value).toBe('Not a member of the organization');
  });

  it('accepts a missing reason — a decision is always recordable', () => {
    // Story 002's edge case: "Rejection reason left blank → Rejected
    // without a reason string". An administrator must never be blocked from
    // rejecting an account.
    const rejected = rejectAccount(anAccount(), null);

    expect(rejected.status).toBe('Rejected');
    expect(rejected.rejectionReason).toBeNull();
  });

  it('leaves deactivatedAt null — a rejection is not a deactivation', () => {
    // The column records a deactivation and nothing else. A rejected
    // account was never deactivated, so it must not carry the timestamp.
    const rejected = rejectAccount(anAccount(), null);

    expect(rejected.deactivatedAt).toBeNull();
  });

  it('refuses an account that is not Pending', () => {
    const approved = approveAccount(anAccount(), new Date());

    expect(() => rejectAccount(approved, null)).toThrow(IllegalTransitionError);
  });

  it('refuses a second rejection', () => {
    const rejected = rejectAccount(anAccount(), null);

    expect(() => rejectAccount(rejected, null)).toThrow(IllegalTransitionError);
  });
});

describe('capability', () => {
  it('gives an Active account member capability', () => {
    const active = approveAccount(anAccount(), new Date());

    expect(capabilityOf(active)).toBe('member');
    expect(isMember(active)).toBe(true);
  });

  it('gives a Pending account no capability', () => {
    // FR-2: a Pending account can do nothing except wait.
    const pending = anAccount();

    expect(capabilityOf(pending)).toBe('none');
    expect(isMember(pending)).toBe(false);
  });

  it('gives a Rejected account no capability', () => {
    const rejected = rejectAccount(anAccount(), null);

    expect(capabilityOf(rejected)).toBe('none');
  });

  it('honours the administrator flag only on an Active account', () => {
    const active = { ...approveAccount(anAccount(), new Date()), isAdministrator: true };
    const pending = { ...anAccount(), isAdministrator: true };

    expect(isAdministrator(active)).toBe(true);
    // Story 006's edge case: "Administrator flag set on a Pending account →
    // Still restricted; flag alone grants nothing before approval."
    expect(isAdministrator(pending)).toBe(false);
  });
});

describe('authentication eligibility', () => {
  it('lets an Active account authenticate', () => {
    expect(canAuthenticate(approveAccount(anAccount(), new Date()))).toBe(true);
  });

  it('lets a Pending account authenticate', () => {
    // FR-4: a Pending account authenticates. It gains no capability, but
    // it does get a session and a banner.
    expect(canAuthenticate(anAccount())).toBe(true);
  });

  it('refuses a Rejected account', () => {
    expect(canAuthenticate(rejectAccount(anAccount(), null))).toBe(false);
  });

  it('refuses a Deactivated account', () => {
    const deactivated = { ...anAccount(), status: 'Deactivated' as const };

    expect(canAuthenticate(deactivated)).toBe(false);
  });
});
