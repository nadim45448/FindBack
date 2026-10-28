/**
 * The password-reset and deactivation use cases' tests.
 *
 * **The anti-enumeration property is asserted, not assumed** (FR-51): the
 * response is byte-for-byte identical across the account states, and the
 * timing is **measured** against a tolerance rather than asserted as equal.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  createDisplayName,
  createEmailAddress,
  createPasswordHash,
  createSelfDeclaredRole,
  InvalidResetTokenError,
  NEUTRAL_RESET_CONFIRMATION,
  registerAccount,
  type Account,
} from '@/domain/accounts';
import { NotFoundError } from '@/lib/errors';

import { AccountDeactivationService } from './account-deactivation-service';
import { PasswordResetCompletionService } from './password-reset-completion-service';
import { PasswordResetRequestService } from './password-reset-request-service';

import type { AccountRepository } from './ports/account-repository';
import type { PasswordResetTokenRepository } from './ports/password-reset-token-repository';
import type { PasswordHasher } from './ports/password-hasher';
import type { ResetTokenHasher } from './ports/reset-token-hasher';
import type { AuditWriter } from '@/application/audit-writer';
import type { SessionRepository } from './ports/session-repository';
import type { TransactionHandle } from '@/application/ports/transaction-handle';

const NOW = new Date('2026-10-28T12:00:00Z');

/** A transaction handle. The tests do not use a database. */
const TRANSACTION: TransactionHandle = { transaction: {} };

/** An account, for the tests to act on. */
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

/** A password hasher that records what it was asked to do. */
function aPasswordHasher(): PasswordHasher & { verify: ReturnType<typeof vi.fn> } {
  return {
    hash: vi.fn(async (plaintext: string) => createPasswordHash(`hashed:${plaintext}`)),
    verify: vi.fn(async () => true),
  };
}

/** A reset-token hasher that is a plain digest, for the tests. */
function aTokenHasher(): ResetTokenHasher {
  return {
    hash: (plaintext) => ({ value: `digest:${plaintext.value}` }),
    verify: (plaintext, hash) => hash.value === `digest:${plaintext.value}`,
  };
}

/** A token repository holding one token. */
function aTokenRepository(token: { id: string; accountId: string; tokenHash: string } | null) {
  const markUsed = vi.fn(async () => true);

  const repository: PasswordResetTokenRepository = {
    findByTokenHash: vi.fn(async (hash: string) =>
      token && token.tokenHash === hash
        ? {
            id: token.id,
            accountId: token.accountId,
            tokenHash: token.tokenHash,
            createdAt: NOW,
            expiresAt: new Date(NOW.getTime() + 3600 * 1000),
            usedAt: null,
          }
        : null,
    ),
    save: vi.fn(async (saved) => saved),
    markUsed,
  };

  return { repository, markUsed };
}

/** An audit writer that records what it was asked to record. */
function anAuditWriter() {
  const record = vi.fn(async () => ({}) as never);
  const recordNonNumbered = vi.fn(async () => ({}) as never);

  return { writer: { record, recordNonNumbered } as unknown as AuditWriter, record, recordNonNumbered };
}

/** A session repository with no sessions. */
function aSessionRepository() {
  return {
    findByTokenHash: vi.fn(async () => null),
    findById: vi.fn(async () => null),
    listActiveByAccount: vi.fn(async () => []),
    save: vi.fn(async (session) => session),
    revoke: vi.fn(async () => ({}) as never),
  } as unknown as SessionRepository;
}

// ── The password-reset request ─────────────────────────────────────────────

describe('requesting a password reset', () => {
  /** A request service over a repository holding one account. */
  function aService(account: Account | null, minResponseMs = 0) {
    const hasher = aPasswordHasher();
    const accounts = anAccountRepository(account);
    const { repository, markUsed } = aTokenRepository(null);

    const service = new PasswordResetRequestService(
      accounts,
      repository,
      hasher,
      aTokenHasher(),
      {
        tokenLifetimeSeconds: 3600,
        minResponseMs,
        generateToken: () => 'A'.repeat(43),
      },
    );

    return { service, hasher, accounts, markUsed };
  }

  it('returns the neutral confirmation for a registered address', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute('jane@example.org', TRANSACTION, NOW);

    expect(outcome.confirmation.value).toBe(NEUTRAL_RESET_CONFIRMATION);
  });

  it('returns the neutral confirmation for an unregistered address', async () => {
    const { service } = aService(null);

    const outcome = await service.execute('nobody@example.org', TRANSACTION, NOW);

    expect(outcome.confirmation.value).toBe(NEUTRAL_RESET_CONFIRMATION);
  });

  it('returns a byte-for-byte identical response across the account states', async () => {
    const states: Account[] = [
      anAccount({ status: 'Pending' }),
      anAccount({ status: 'Active' }),
      anAccount({ status: 'Rejected' }),
      anAccount({ status: 'Deactivated' }),
    ];

    const bodies: string[] = [];

    for (const state of states) {
      const { service } = aService(state);
      const outcome = await service.execute('jane@example.org', TRANSACTION, NOW);

      bodies.push(outcome.confirmation.value);
    }

    // And the same as the unregistered case.
    const { service: missService } = aService(null);
    const miss = await missService.execute('nobody@example.org', TRANSACTION, NOW);
    bodies.push(miss.confirmation.value);

    expect(new Set(bodies).size).toBe(1);
  });

  it('performs an Argon2id verification on every path', async () => {
    const hit = aService(anAccount());
    await hit.service.execute('jane@example.org', TRANSACTION, NOW);

    const miss = aService(null);
    await miss.service.execute('nobody@example.org', TRANSACTION, NOW);

    // The work floor: the expensive step happens either way.
    expect(hit.hasher.verify).toHaveBeenCalledTimes(1);
    expect(miss.hasher.verify).toHaveBeenCalledTimes(1);
  });

  it('issues a token for a registered address', async () => {
    const { service } = aService(anAccount());

    const outcome = await service.execute('jane@example.org', TRANSACTION, NOW);

    expect(outcome.emailRecipient).toBe('jane@example.org');
    expect(outcome.tokenPlaintext).not.toBeNull();
  });

  it('issues no token for an unregistered address', async () => {
    const { service } = aService(null);

    const outcome = await service.execute('nobody@example.org', TRANSACTION, NOW);

    expect(outcome.emailRecipient).toBeNull();
    expect(outcome.tokenPlaintext).toBeNull();
  });

  it('never changes the account’s lifecycle status', async () => {
    for (const status of ['Pending', 'Active', 'Rejected', 'Deactivated'] as const) {
      const { service, accounts } = aService(anAccount({ status }));

      await service.execute('jane@example.org', TRANSACTION, NOW);

      // The account is only ever read, never written.
      expect(accounts.save).not.toHaveBeenCalled();
    }
  });

  it('holds the response to the configured floor', async () => {
    const { service } = aService(null, 60);

    const startedAt = Date.now();
    await service.execute('nobody@example.org', TRANSACTION, NOW);
    const elapsed = Date.now() - startedAt;

    expect(elapsed).toBeGreaterThanOrEqual(50);
  });

  it('measures the two paths within the timing tolerance', async () => {
    // The tolerance is the mechanism's own measurement (ADR-18). This test
    // asserts the two paths are close, with the tolerance as the bound.
    const tolerance = 100;

    const hitStart = Date.now();
    const { service: hitService } = aService(anAccount(), 250);
    await hitService.execute('jane@example.org', TRANSACTION, NOW);
    const hitElapsed = Date.now() - hitStart;

    const missStart = Date.now();
    const { service: missService } = aService(null, 250);
    await missService.execute('nobody@example.org', TRANSACTION, NOW);
    const missElapsed = Date.now() - missStart;

    expect(Math.abs(hitElapsed - missElapsed)).toBeLessThanOrEqual(tolerance);
  });
});

// ── The password-reset completion ───────────────────────────────────────────

describe('completing a password reset', () => {
  /** A completion service over a repository holding one token. */
  function aService(account: Account | null, tokenExists: boolean) {
    const hasher = aPasswordHasher();
    const accounts = anAccountRepository(account);

    const { repository, markUsed } = aTokenRepository(
      tokenExists
        ? {
            id: '00000000-0000-4000-8000-000000000002',
            accountId: '00000000-0000-4000-8000-000000000001',
            tokenHash: 'digest:the-token',
          }
        : null,
    );

    const service = new PasswordResetCompletionService(
      accounts,
      repository,
      hasher,
      aTokenHasher(),
    );

    return { service, hasher, accounts, markUsed };
  }

  it('replaces the password hash for a valid token', async () => {
    const { service, accounts, hasher } = aService(anAccount(), true);

    await service.execute('the-token', 'newpassword1', TRANSACTION, NOW);

    expect(hasher.hash).toHaveBeenCalledWith('newpassword1');
    expect(accounts.save).toHaveBeenCalledTimes(1);
  });

  it('marks the token used through the conditional write', async () => {
    const { service, markUsed } = aService(anAccount(), true);

    await service.execute('the-token', 'newpassword1', TRANSACTION, NOW);

    expect(markUsed).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown token', async () => {
    const { service } = aService(anAccount(), false);

    await expect(
      service.execute('unknown-token', 'newpassword1', TRANSACTION, NOW),
    ).rejects.toThrow(InvalidResetTokenError);
  });

  it('refuses an absent token', async () => {
    const { service } = aService(anAccount(), true);

    await expect(service.execute('', 'newpassword1', TRANSACTION, NOW)).rejects.toThrow(
      InvalidResetTokenError,
    );
  });

  it('refuses a used or expired token, because the conditional write updated no row', async () => {
    const { service, markUsed } = aService(anAccount(), true);
    markUsed.mockResolvedValueOnce(false as never);

    await expect(
      service.execute('the-token', 'newpassword1', TRANSACTION, NOW),
    ).rejects.toThrow(InvalidResetTokenError);
  });

  it('writes nothing when the token is refused', async () => {
    const { service, accounts } = aService(anAccount(), false);

    await expect(
      service.execute('unknown-token', 'newpassword1', TRANSACTION, NOW),
    ).rejects.toThrow();

    expect(accounts.save).not.toHaveBeenCalled();
  });

  it('leaves the lifecycle status unchanged', async () => {
    for (const status of ['Pending', 'Rejected', 'Deactivated'] as const) {
      const { service, accounts } = aService(anAccount({ status }), true);

      await service.execute('the-token', 'newpassword1', TRANSACTION, NOW);

      const saved = (accounts.save as unknown as { mock: { calls: [Account[]] } }).mock.calls[0]?.[0];

      expect(saved?.status).toBe(status);
    }
  });

  it('carries no account id, email, or token in the refusal', async () => {
    const { service } = aService(anAccount(), false);

    await expect(
      service.execute('the-secret-token', 'newpassword1', TRANSACTION, NOW),
    ).rejects.toThrow(InvalidResetTokenError);

    try {
      await service.execute('the-secret-token', 'newpassword1', TRANSACTION, NOW);
    } catch (error) {
      const message = (error as Error).message;

      expect(message).not.toContain('the-secret-token');
      expect(message).not.toContain('jane@example.org');
      expect(message).not.toContain('00000000-0000-4000-8000-000000000001');
    }
  });
});

// ── The deactivation ────────────────────────────────────────────────────────

describe('deactivating an account', () => {
  /** A deactivation service over the given account. */
  function aService(account: Account | null) {
    const accounts = anAccountRepository(account);
    const sessions = aSessionRepository();
    const { writer, record } = anAuditWriter();

    const service = new AccountDeactivationService(accounts, sessions, writer);

    return { service, accounts, sessions, record };
  }

  it('deactivates an Active account', async () => {
    const { service, accounts } = aService(anAccount());

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      TRANSACTION,
      NOW,
    );

    expect(outcome.account.status).toBe('Deactivated');
    expect(accounts.save).toHaveBeenCalledTimes(1);
  });

  it('revokes every active session', async () => {
    const { service, sessions } = aService(anAccount());
    const listActive = sessions.listActiveByAccount as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };

    listActive.mockResolvedValue([
      { id: 'session-1', accountId: 'a', tokenHash: 'h', createdAt: NOW, lastActivityAt: NOW, expiresAt: NOW, revokedAt: null, revocationReason: null },
      { id: 'session-2', accountId: 'a', tokenHash: 'h', createdAt: NOW, lastActivityAt: NOW, expiresAt: NOW, revokedAt: null, revocationReason: null },
    ]);

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      TRANSACTION,
      NOW,
    );

    expect(sessions.revoke).toHaveBeenCalledTimes(2);
    expect(outcome.revokedSessions).toBe(2);
  });

  it('revokes with the account_deactivated reason', async () => {
    const { service, sessions } = aService(anAccount());

    // The reason is only observable on a revocation, so there must be a
    // session to revoke.
    const listActive = sessions.listActiveByAccount as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };
    listActive.mockResolvedValue([
      { id: 'session-1', accountId: 'a', tokenHash: 'h', createdAt: NOW, lastActivityAt: NOW, expiresAt: NOW, revokedAt: null, revocationReason: null },
    ]);

    await service.execute(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      TRANSACTION,
      NOW,
    );

    const call = (sessions.revoke as unknown as { mock: { calls: [string, string, unknown, Date][] } })
      .mock.calls[0];

    expect(call?.[1]).toBe('account_deactivated');
  });

  it('clears the administrator flag on the target', async () => {
    const { service, accounts } = aService(anAccount({ isAdministrator: true }));

    await service.execute(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      TRANSACTION,
      NOW,
    );

    const saved = (accounts.save as unknown as { mock: { calls: [Account[]] } }).mock.calls[0]?.[0];

    expect(saved?.isAdministrator).toBe(false);
  });

  it('permits an administrator to deactivate another administrator', async () => {
    // The target's own flag confers no protection (FR-5, and the owner's
    // decision). There is no privilege check on the target.
    const { service, accounts, record } = aService(anAccount({ isAdministrator: true }));

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      TRANSACTION,
      NOW,
    );

    expect(outcome.account.status).toBe('Deactivated');
    expect(accounts.save).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('records the audit event inside the transaction', async () => {
    const { service, record } = aService(anAccount());

    await service.execute(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      TRANSACTION,
      NOW,
    );

    const call = (record as unknown as { mock: { calls: [{ eventType: string }, unknown][] } })
      .mock.calls[0];

    expect(call?.[0].eventType).toBe('account.deactivated');
    expect(call?.[1]).toBe(TRANSACTION);
  });

  it('is an idempotent no-op for an already-Deactivated account', async () => {
    const { service, accounts, record } = aService(
      anAccount({ status: 'Deactivated', deactivatedAt: NOW }),
    );

    const outcome = await service.execute(
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000009',
      TRANSACTION,
      NOW,
    );

    expect(outcome.changed).toBe(false);
    expect(accounts.save).not.toHaveBeenCalled();
    // No duplicate audit record — the trail stays a record of what happened,
    // once.
    expect(record).not.toHaveBeenCalled();
  });

  it('refuses a Pending account', async () => {
    const { service } = aService(anAccount({ status: 'Pending' }));

    await expect(
      service.execute(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000009',
        TRANSACTION,
        NOW,
      ),
    ).rejects.toThrow();
  });

  it('refuses an unknown account', async () => {
    const { service } = aService(null);

    await expect(
      service.execute(
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000009',
        TRANSACTION,
        NOW,
      ),
    ).rejects.toThrow(NotFoundError);
  });
});
