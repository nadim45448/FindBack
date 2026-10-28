/**
 * The member-profile use case's tests.
 *
 * **FR-52's closed edit surface is asserted, not assumed**: the test proves
 * that only the display name and the self-declared role can be changed, that
 * a no-op writes nothing, and that the record carries the changed fields and
 * their previous values.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createDisplayName,
  createEmailAddress,
  createPasswordHash,
  createSelfDeclaredRole,
  registerAccount,
  type Account,
} from '@/domain/accounts';
import { NotFoundError, PermissionDeniedError } from '@/lib/errors';

import { MemberProfileService } from './member-profile-service';

import type { AccountRepository } from './ports/account-repository';
import type { AuditWriter } from '@/application/audit-writer';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

const NOW = new Date('2026-10-28T12:00:00Z');

/** A transaction handle. The tests do not use a database. */
const TRANSACTION: TransactionHandle = { transaction: {} };

/** An Active account, for the tests to act on. */
function anAccount(overrides: Partial<Account> = {}): Account {
  const base = registerAccount({
    id: '00000000-0000-4000-8000-000000000001',
    email: createEmailAddress('jane@example.org'),
    passwordHash: createPasswordHash('$argon2id$hash'),
    displayName: createDisplayName('Jane Doe'),
    selfDeclaredRole: createSelfDeclaredRole('Student'),
    createdAt: new Date('2026-10-27T10:00:00Z'),
  });

  return { ...base, status: 'Active', activatedAt: NOW, ...overrides };
}

/** An account repository holding one account. */
function anAccountRepository(account: Account | null): AccountRepository {
  return {
    findById: vi.fn(async () => account),
    findByEmail: vi.fn(async () => account),
    existsByEmail: vi.fn(async () => account !== null),
    save: vi.fn(async (saved: Account) => saved),
    listPending: vi.fn(async () => []),
  };
}

/** An audit writer that records what it was asked to record. */
function anAuditWriter() {
  const record = vi.fn(async () => ({}) as never);
  const recordNonNumbered = vi.fn(async () => ({}) as never);

  return {
    writer: { record, recordNonNumbered } as unknown as AuditWriter,
    record,
    recordNonNumbered,
  };
}

/** A profile service over the given account. */
function aService(account: Account | null) {
  const accounts = anAccountRepository(account);
  const { writer, record, recordNonNumbered } = anAuditWriter();

  const service = new MemberProfileService(accounts, writer);

  return { service, accounts, record, recordNonNumbered };
}

describe('reading a member profile', () => {
  it('returns the account', async () => {
    const { service } = aService(anAccount());

    const account = await service.read('00000000-0000-4000-8000-000000000001');

    expect(account.displayName.value).toBe('Jane Doe');
    expect(account.email.value).toBe('jane@example.org');
  });

  it('refuses an unknown account', async () => {
    const { service } = aService(null);

    await expect(service.read('00000000-0000-4000-8000-000000000001')).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('editing a member profile', () => {
  it('changes the display name', async () => {
    const { service, accounts } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.account.displayName.value).toBe('Jane Smith');
    expect(accounts.save).toHaveBeenCalledTimes(1);
  });

  it('changes the self-declared role', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { selfDeclaredRole: createSelfDeclaredRole('Employee') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.account.selfDeclaredRole.role).toBe('Employee');
  });

  it('names the changed fields', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.result.changedFields).toEqual(['displayName']);
  });

  it('carries the previous value of the changed field', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.result.previousValues).toEqual({ displayName: 'Jane Doe' });
  });

  it('carries only the previous values of the fields that changed', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      {
        displayName: createDisplayName('Jane Smith'),
        selfDeclaredRole: createSelfDeclaredRole('Employee'),
      },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.result.changedFields).toEqual(['displayName', 'selfDeclaredRole']);
    expect(outcome.result.previousValues).toEqual({
      displayName: 'Jane Doe',
      selfDeclaredRole: 'Student',
    });
  });

  it('leaves the email alone', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.account.email.value).toBe('jane@example.org');
  });

  it('leaves the status alone', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.account.status).toBe('Active');
  });

  it('leaves the administrator flag alone', async () => {
    const { service } = aService(anAccount({ isAdministrator: true }));

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.account.isAdministrator).toBe(true);
  });

  it('records a non-numbered audit event with the change and the previous value', async () => {
    const { service, recordNonNumbered } = aService(anAccount());

    await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-4000-8000-000000000001',
      TRANSACTION,
    );

    const call = (
      recordNonNumbered as unknown as {
        mock: { calls: [{ eventType: string; payload: Record<string, unknown> }, unknown][] };
      }
    ).mock.calls[0];

    expect(call?.[0].eventType).toBe('member_profile.edited');
    expect(call?.[0].payload).toEqual({
      changedFields: ['displayName'],
      previousValues: { displayName: 'Jane Doe' },
    });
    expect(call?.[1]).toBe(TRANSACTION);
  });

  it('records the actor as the member, not as an administrator', async () => {
    const { service, recordNonNumbered } = aService(anAccount());

    await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Smith') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    const call = (
      recordNonNumbered as unknown as {
        mock: { calls: [{ actor: { actorRole: string } }, unknown][] };
      }
    ).mock.calls[0];

    expect(call?.[0].actor.actorRole).toBe('member');
  });

  it('writes nothing when the edit changes nothing', async () => {
    const { service, accounts, recordNonNumbered } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      { displayName: createDisplayName('Jane Doe') },
      '00000000-0000-4000-8000-000000000001',
      TRANSACTION,
    );

    expect(outcome.changed).toBe(false);
    expect(outcome.result.changedFields).toEqual([]);
    expect(accounts.save).not.toHaveBeenCalled();
    expect(recordNonNumbered).not.toHaveBeenCalled();
  });

  it('refuses a Pending account', async () => {
    const { service } = aService(anAccount({ status: 'Pending' }));

    await expect(
      service.execute(
        '00000000-0000-4000-8000-000000000001',
        { displayName: createDisplayName('Jane Smith') },
        '00000000-0000-4000-8000-000000000001',
        TRANSACTION,
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('refuses a Rejected account', async () => {
    const { service } = aService(anAccount({ status: 'Rejected' }));

    await expect(
      service.execute(
        '00000000-0000-4000-8000-000000000001',
        { displayName: createDisplayName('Jane Smith') },
        '00000000-0000-4000-8000-000000000001',
        TRANSACTION,
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('refuses a Deactivated account', async () => {
    const { service } = aService(anAccount({ status: 'Deactivated' }));

    await expect(
      service.execute(
        '00000000-0000-4000-8000-000000000001',
        { displayName: createDisplayName('Jane Smith') },
        '00000000-0000-4000-8000-000000000001',
        TRANSACTION,
      ),
    ).rejects.toThrow(PermissionDeniedError);
  });

  it('writes nothing when the account is refused', async () => {
    const { service, accounts, recordNonNumbered } = aService(
      anAccount({ status: 'Deactivated' }),
    );

    await expect(
      service.execute(
        '00000000-0000-4000-8000-000000000001',
        { displayName: createDisplayName('Jane Smith') },
        '00000000-0000-4000-8000-000000000001',
        TRANSACTION,
      ),
    ).rejects.toThrow();

    expect(accounts.save).not.toHaveBeenCalled();
    expect(recordNonNumbered).not.toHaveBeenCalled();
  });

  it('refuses an unknown account', async () => {
    const { service } = aService(null);

    await expect(
      service.execute(
        '00000000-0000-4000-8000-000000000001',
        { displayName: createDisplayName('Jane Smith') },
        '00000000-0000-4000-8000-000000000001',
        TRANSACTION,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
