/**
 * The application-layer use-case tests.
 *
 * The ports are stubbed here, so the tests exercise the **use case's
 * orchestration** — the audit write, the transaction handle, the email
 * timing — without a database.
 */

import { describe, expect, it, vi } from 'vitest';

import { Authenticate } from './authenticate';
import { Logout } from './logout';
import { RegisterAccount } from './register-account';
import { ReviewRegistration } from './review-registration';

import { GENERIC_INACTIVE_MESSAGE } from '@/domain/accounts';
import { DuplicateEmailError } from '@/domain/accounts';
import { ValidationError } from '@/lib/errors';

import type { AccountRepository } from './ports/account-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { SessionRepository } from './ports/session-repository';
import type { AuditWriter } from '@/application/audit-writer';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

/** A transaction handle. The use case only passes it through. */
const TRANSACTION: TransactionHandle = { transaction: {} };

/** An account row, for the stubs to return. */
function anAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: { value: 'jane@example.org' },
    passwordHash: { value: '$argon2id$hash' },
    displayName: { value: 'Jane Doe' },
    selfDeclaredRole: { role: 'Student' as const, otherText: null },
    status: 'Pending' as const,
    isAdministrator: false,
    rejectionReason: null,
    createdAt: new Date('2026-10-27T10:00:00Z'),
    activatedAt: null,
    deactivatedAt: null,
    ...overrides,
  };
}

/** A password hasher stub. */
function aHasher(verifies = true) {
  return {
    hash: vi.fn(async () => ({ value: '$argon2id$hashed' })),
    verify: vi.fn(async () => verifies),
  } satisfies PasswordHasher;
}

/** An audit writer stub that records what it was asked to write. */
function anAuditWriter() {
  const records: { eventType: string; payload?: Record<string, unknown> }[] = [];

  const writer = {
    record: vi.fn(async (draft: { eventType: string; payload?: Record<string, unknown> }) => {
      records.push({ eventType: draft.eventType, payload: draft.payload });

      return {} as never;
    }),
    recordNonNumbered: vi.fn(
      async (draft: { eventType: string; payload?: Record<string, unknown> }) => {
        records.push({ eventType: draft.eventType, payload: draft.payload });

        return {} as never;
      },
    ),
  } as unknown as AuditWriter;

  return { writer, records };
}

describe('RegisterAccount', () => {
  it('creates a Pending account and writes the FR-2 registration record', async () => {
    const accounts = {
      existsByEmail: vi.fn(async () => false),
      save: vi.fn(async (account: unknown) => account),
    } as unknown as AccountRepository;

    const { writer, records } = anAuditWriter();
    const useCase = new RegisterAccount(accounts, aHasher(), writer);

    const { account } = await useCase.execute(
      {
        displayName: 'Jane Doe',
        email: 'Jane@Example.ORG',
        password: 'correct horse 1',
        selfDeclaredRole: 'Student',
      },
      TRANSACTION,
    );

    expect(account.status).toBe('Pending');
    expect(account.isAdministrator).toBe(false);
    expect(account.email.value).toBe('jane@example.org');

    // FR-2: the trail records the registration with the name, email, role,
    // and timestamp. The record is non-numbered — the frozen catalog has no
    // number for it.
    expect(records).toHaveLength(1);
    expect(records[0]?.eventType).toBe('registration.submitted');
    expect(records[0]?.payload).toEqual({
      displayName: 'Jane Doe',
      email: 'jane@example.org',
      selfDeclaredRole: 'Student',
    });
  });

  it('refuses a duplicate email and writes no record', async () => {
    const accounts = {
      existsByEmail: vi.fn(async () => true),
      save: vi.fn(),
    } as unknown as AccountRepository;

    const { writer, records } = anAuditWriter();
    const useCase = new RegisterAccount(accounts, aHasher(), writer);

    await expect(
      useCase.execute(
        {
          displayName: 'Jane Doe',
          email: 'jane@example.org',
          password: 'correct horse 1',
          selfDeclaredRole: 'Student',
        },
        TRANSACTION,
      ),
    ).rejects.toThrow(DuplicateEmailError);

    expect(records).toHaveLength(0);
  });

  it('refuses a password that fails the policy, and writes no record', async () => {
    const accounts = {
      existsByEmail: vi.fn(async () => false),
      save: vi.fn(),
    } as unknown as AccountRepository;

    const { writer, records } = anAuditWriter();
    const useCase = new RegisterAccount(accounts, aHasher(), writer);

    await expect(
      useCase.execute(
        {
          displayName: 'Jane Doe',
          email: 'jane@example.org',
          password: 'short',
          selfDeclaredRole: 'Student',
        },
        TRANSACTION,
      ),
    ).rejects.toThrow(ValidationError);

    expect(records).toHaveLength(0);
  });

  it('refuses an unknown self-declared role', async () => {
    const accounts = {
      existsByEmail: vi.fn(async () => false),
      save: vi.fn(),
    } as unknown as AccountRepository;

    const { writer } = anAuditWriter();
    const useCase = new RegisterAccount(accounts, aHasher(), writer);

    await expect(
      useCase.execute(
        {
          displayName: 'Jane Doe',
          email: 'jane@example.org',
          password: 'correct horse 1',
          selfDeclaredRole: 'Administrator',
        },
        TRANSACTION,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('never sends an email', async () => {
    // FR-1: registration sends no email. The use case does not even hold an
    // email sender, so it cannot.
    const accounts = {
      existsByEmail: vi.fn(async () => false),
      save: vi.fn(async (account: unknown) => account),
    } as unknown as AccountRepository;

    const { writer } = anAuditWriter();
    const useCase = new RegisterAccount(accounts, aHasher(), writer);

    await useCase.execute(
      {
        displayName: 'Jane Doe',
        email: 'jane@example.org',
        password: 'correct horse 1',
        selfDeclaredRole: 'Student',
      },
      TRANSACTION,
    );

    expect(Object.keys(useCase)).not.toContain('email');
  });
});

describe('ReviewRegistration', () => {
  it('approves a pending account and records event 11', async () => {
    const accounts = {
      findById: vi.fn(async () => anAccount()),
      save: vi.fn(async (account: unknown) => account),
    } as unknown as AccountRepository;

    const { writer, records } = anAuditWriter();
    const useCase = new ReviewRegistration(accounts, writer);

    const outcome = await useCase.execute(
      'approve',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000ff',
      TRANSACTION,
    );

    expect(outcome.account.status).toBe('Active');
    // Only an approval has an email recipient.
    expect(outcome.approvalEmailRecipient).toBe('jane@example.org');

    expect(records[0]?.eventType).toBe('registration.approved');
  });

  it('rejects a pending account and records event 12 with the reason', async () => {
    const accounts = {
      findById: vi.fn(async () => anAccount()),
      save: vi.fn(async (account: unknown) => account),
    } as unknown as AccountRepository;

    const { writer, records } = anAuditWriter();
    const useCase = new ReviewRegistration(accounts, writer);

    const outcome = await useCase.execute(
      'reject',
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-0000000000ff',
      TRANSACTION,
      'Not a member of the organization',
    );

    expect(outcome.account.status).toBe('Rejected');
    // A rejection sends no email of any kind.
    expect(outcome.approvalEmailRecipient).toBeNull();

    expect(records[0]?.eventType).toBe('registration.rejected');
  });

  it('refuses a decision on an account that is no longer pending', async () => {
    // Story 002 criterion 4, and the concurrent-administrators edge case:
    // exactly one decision commits; the other is refused.
    const accounts = {
      findById: vi.fn(async () => anAccount({ status: 'Active' })),
      save: vi.fn(),
    } as unknown as AccountRepository;

    const { writer } = anAuditWriter();
    const useCase = new ReviewRegistration(accounts, writer);

    await expect(
      useCase.execute(
        'approve',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-0000000000ff',
        TRANSACTION,
      ),
    ).rejects.toThrow();
  });
});

describe('Authenticate', () => {
  it('authenticates an Active account with the right password', async () => {
    const accounts = {
      findByEmail: vi.fn(async () => anAccount({ status: 'Active' })),
    } as unknown as AccountRepository;

    const useCase = new Authenticate(accounts, aHasher(true));
    const outcome = await useCase.execute('jane@example.org', 'correct horse 1');

    expect(outcome.ok).toBe(true);
  });

  it('authenticates a Pending account', async () => {
    // FR-4: a Pending account authenticates; it gains no capability.
    const accounts = {
      findByEmail: vi.fn(async () => anAccount({ status: 'Pending' })),
    } as unknown as AccountRepository;

    const useCase = new Authenticate(accounts, aHasher(true));
    const outcome = await useCase.execute('jane@example.org', 'correct horse 1');

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.actor.capability).toBe('none');
    }
  });

  it('returns the generic message for a wrong password', async () => {
    const accounts = {
      findByEmail: vi.fn(async () => anAccount({ status: 'Active' })),
    } as unknown as AccountRepository;

    const useCase = new Authenticate(accounts, aHasher(false));
    const outcome = await useCase.execute('jane@example.org', 'wrong password 1');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message.value).toBe(GENERIC_INACTIVE_MESSAGE);
    }
  });

  it('returns the generic message for an unknown email', async () => {
    const accounts = {
      findByEmail: vi.fn(async () => null),
    } as unknown as AccountRepository;

    const useCase = new Authenticate(accounts, aHasher(true));
    const outcome = await useCase.execute('nobody@example.org', 'correct horse 1');

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message.value).toBe(GENERIC_INACTIVE_MESSAGE);
    }
  });

  it('returns the generic message for a Rejected account', async () => {
    const accounts = {
      findByEmail: vi.fn(async () => anAccount({ status: 'Rejected' })),
    } as unknown as AccountRepository;

    const useCase = new Authenticate(accounts, aHasher(true));
    const outcome = await useCase.execute('jane@example.org', 'correct horse 1');

    expect(outcome.ok).toBe(false);
  });

  it('returns the generic message for a Deactivated account', async () => {
    const accounts = {
      findByEmail: vi.fn(async () => anAccount({ status: 'Deactivated' })),
    } as unknown as AccountRepository;

    const useCase = new Authenticate(accounts, aHasher(true));
    const outcome = await useCase.execute('jane@example.org', 'correct horse 1');

    expect(outcome.ok).toBe(false);
  });

  it('gives the same answer for every refusal', async () => {
    // Story 007's edge case: "Comparison of Rejected vs Deactivated login
    // responses → Indistinguishable to the client."
    const refusals: string[] = [];

    for (const status of ['Rejected', 'Deactivated'] as const) {
      const accounts = {
        findByEmail: vi.fn(async () => anAccount({ status })),
      } as unknown as AccountRepository;

      const useCase = new Authenticate(accounts, aHasher(true));
      const outcome = await useCase.execute('jane@example.org', 'correct horse 1');

      if (!outcome.ok) {
        refusals.push(outcome.message.value);
      }
    }

    expect(new Set(refusals).size).toBe(1);
  });

  it('verifies a password even when the account does not exist', async () => {
    // The anti-enumeration rule is not only about the response: an unknown
    // email must cost the same as a wrong password, so the verification
    // still runs.
    const accounts = {
      findByEmail: vi.fn(async () => null),
    } as unknown as AccountRepository;

    const hasher = aHasher(true);
    const useCase = new Authenticate(accounts, hasher);

    await useCase.execute('nobody@example.org', 'correct horse 1');

    expect(hasher.verify).toHaveBeenCalledTimes(1);
  });
});

describe('Logout', () => {
  it('revokes the session row', async () => {
    const sessions = {
      findById: vi.fn(async () => ({ id: 'session-1' })),
      revoke: vi.fn(async () => ({ id: 'session-1' })),
    } as unknown as SessionRepository;

    const useCase = new Logout(sessions);
    const outcome = await useCase.execute('session-1', TRANSACTION);

    expect(outcome.revoked).toBe(true);
    expect(sessions.revoke).toHaveBeenCalledWith(
      'session-1',
      'logout',
      TRANSACTION,
      expect.any(Date),
    );
  });

  it('is idempotent — a second logout still succeeds', async () => {
    // Story 005's double-logout edge case.
    const sessions = {
      findById: vi.fn(async () => ({ id: 'session-1', revokedAt: new Date() })),
      revoke: vi.fn(async () => ({ id: 'session-1' })),
    } as unknown as SessionRepository;

    const useCase = new Logout(sessions);
    const outcome = await useCase.execute('session-1', TRANSACTION);

    expect(outcome.revoked).toBe(true);
  });

  it('leaves other sessions alone', async () => {
    // Story 005 criterion 5: logging out on one device leaves the others
    // unaffected. The use case revokes exactly the session it is given.
    const sessions = {
      findById: vi.fn(async () => ({ id: 'session-1' })),
      revoke: vi.fn(async () => ({ id: 'session-1' })),
    } as unknown as SessionRepository;

    const useCase = new Logout(sessions);
    await useCase.execute('session-1', TRANSACTION);

    expect(sessions.revoke).toHaveBeenCalledTimes(1);
    expect(sessions.revoke).toHaveBeenCalledWith(
      'session-1',
      'logout',
      TRANSACTION,
      expect.any(Date),
    );
  });
});
