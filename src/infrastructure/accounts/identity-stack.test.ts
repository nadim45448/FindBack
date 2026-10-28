/**
 * Integration tests for the identity stack, against the live database.
 *
 * These exercise the **real** stack — the functional unique index, the
 * CHECK constraints, the transaction discipline, the audit write inside the
 * account's transaction. A mock would not catch a broken unique index or a
 * constraint that refuses a legal row, which is exactly what these paths are
 * for.
 *
 * The suite is skipped when `DATABASE_URL` is not set, so a checkout without
 * a database still runs the unit suite.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { AuditWriter } from '@/application/audit-writer';
import { RegisterAccount } from '@/application/accounts/register-account';
import { ReviewRegistration } from '@/application/accounts/review-registration';
import { SessionService } from '@/application/accounts/session-service';
import { PrismaAuditEventRepository } from '@/infrastructure/audit/prisma-audit-event-repository';
import { PrismaAccountRepository } from './prisma-account-repository';
import { PrismaSessionRepository } from './prisma-session-repository';
import { NodeArgon2PasswordHasher } from './node-argon2-password-hasher';
import { PrismaTransactionFactory } from '@/infrastructure/db/prisma-transaction-factory';

import { clearAuditTablesForTest } from '@/test/delete-for-test';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('the identity stack (database)', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  const accounts = new PrismaAccountRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const audit = new AuditWriter(new PrismaAuditEventRepository(prisma));
  const transactions = new PrismaTransactionFactory(prisma);
  const hasher = new NodeArgon2PasswordHasher({ memory: 19456, iterations: 2, parallelism: 1 });

  const register = new RegisterAccount(accounts, hasher, audit);
  const review = new ReviewRegistration(accounts, audit);
  const sessionService = new SessionService(sessions, accounts, transactions, {
    inactivityDays: 14,
    refreshThresholdMinutes: 60,
    hashToken: (token) => createHash('sha256').update(token, 'utf8').digest('hex'),
    generateToken: () => `token-${randomUUID()}`,
  });

  /** The unique email each test uses, so the tests never collide. */
  let emailCounter = 0;

  function aUniqueEmail(): string {
    emailCounter += 1;

    return `identity-${Date.now()}-${emailCounter}@example.org`;
  }

  beforeEach(async () => {
    await prisma.session.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.rateLimitCounter.deleteMany({});
    await clearAuditTablesForTest(prisma);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.rateLimitCounter.deleteMany({});
    await clearAuditTablesForTest(prisma);
    await prisma.$disconnect();
  });

  describe('registration', () => {
    it('creates a Pending account and one registration audit record', async () => {
      const email = aUniqueEmail();

      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email,
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      expect(account.status).toBe('Pending');

      const rows = await prisma.auditEvent.findMany({
        where: { parentId: account.id },
      });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.eventType).toBe('registration.submitted');
      // The record is **non-numbered** — the frozen catalog has no number for
      // a registration (FR-31 forbids adding one).
      expect(rows[0]?.eventNumber).toBeNull();
      expect(rows[0]?.metadata).toMatchObject({
        displayName: 'Jane Doe',
        email,
        selfDeclaredRole: 'Student',
      });
    });

    it('stores the email normalized', async () => {
      const email = aUniqueEmail();

      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email: `  ${email.toUpperCase()}  `,
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      expect(account.email.value).toBe(email);
    });

    it('refuses a duplicate email differing only in case', async () => {
      // Story 001's edge case: "Duplicate email differing only in case →
      // Treated as duplicate". The functional unique index on
      // `lower(btrim(email))` is what makes this true even under a race.
      const email = aUniqueEmail();

      await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email,
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      await expect(
        transactions.run((transaction) =>
          register.execute(
            {
              displayName: 'Someone Else',
              email: email.toUpperCase(),
              password: 'correct horse 2',
              selfDeclaredRole: 'Student',
            },
            transaction,
          ),
        ),
      ).rejects.toThrow();

      expect(await prisma.account.count()).toBe(1);
    });

    it('refuses an account row the database constraint forbids', async () => {
      // The `accounts_status_check` constraint is the database's own
      // backstop behind the domain.
      await expect(
        prisma.account.create({
          data: {
            email: aUniqueEmail(),
            passwordHash: 'x',
            displayName: 'Jane Doe',
            selfDeclaredRole: 'Student',
            status: 'Nonsense',
          },
        }),
      ).rejects.toThrow();
    });

    it('refuses an administrator flag on a non-Active account', async () => {
      // The `accounts_administrator_active_check` constraint.
      await expect(
        prisma.account.create({
          data: {
            email: aUniqueEmail(),
            passwordHash: 'x',
            displayName: 'Jane Doe',
            selfDeclaredRole: 'Student',
            isAdministrator: true,
            status: 'Pending',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('the review decision', () => {
    it('approves a pending account and records event 11', async () => {
      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email: aUniqueEmail(),
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      const outcome = await transactions.run((transaction) =>
        review.execute('approve', account.id, '00000000-0000-4000-8000-0000000000ff', transaction),
      );

      expect(outcome.account.status).toBe('Active');
      expect(outcome.approvalEmailRecipient).toBe(account.email.value);

      const rows = await prisma.auditEvent.findMany({
        where: { parentId: account.id },
      });

      const approval = rows.find((row) => row.eventType === 'registration.approved');
      expect(approval?.eventNumber).toBe(11);
      expect(approval?.actorRole).toBe('administrator');
    });

    it('rejects a pending account and records event 12 with the reason', async () => {
      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email: aUniqueEmail(),
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      await transactions.run((transaction) =>
        review.execute(
          'reject',
          account.id,
          '00000000-0000-4000-8000-0000000000ff',
          transaction,
          'Not a member of the organization',
        ),
      );

      const stored = await prisma.account.findUnique({ where: { id: account.id } });
      expect(stored?.status).toBe('Rejected');
      expect(stored?.rejectionReason).toBe('Not a member of the organization');

      const rows = await prisma.auditEvent.findMany({
        where: { parentId: account.id },
      });

      const rejection = rows.find((row) => row.eventType === 'registration.rejected');
      expect(rejection?.eventNumber).toBe(12);
      expect(rejection?.reason).toBe('Not a member of the organization');
    });

    it('refuses a second decision on the same account', async () => {
      // Story 002's concurrent-administrators edge case: exactly one
      // decision commits; the other receives a conflict.
      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email: aUniqueEmail(),
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      await transactions.run((transaction) =>
        review.execute('approve', account.id, '00000000-0000-4000-8000-0000000000ff', transaction),
      );

      await expect(
        transactions.run((transaction) =>
          review.execute(
            'reject',
            account.id,
            '00000000-0000-4000-8000-0000000000fe',
            transaction,
            'Changed my mind',
          ),
        ),
      ).rejects.toThrow();
    });
  });

  describe('sessions', () => {
    it('issues a session row and resolves it', async () => {
      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email: aUniqueEmail(),
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      const { token, session } = await transactions.run((transaction) =>
        sessionService.issue(account.id, transaction),
      );

      expect(session.tokenHash).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
      // The plaintext token is never persisted.
      const rows = await prisma.session.findMany({});
      expect(JSON.stringify(rows)).not.toContain(token);

      const actor = await sessionService.resolve(token);
      expect(actor?.actorId).toBe(account.id);
    });

    it('revokes a session, and the token then resolves to nothing', async () => {
      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email: aUniqueEmail(),
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      const { token, session } = await transactions.run((transaction) =>
        sessionService.issue(account.id, transaction),
      );

      await transactions.run((transaction) =>
        sessionService.revoke(session.id, 'logout', transaction),
      );

      expect(await sessionService.resolve(token)).toBeNull();
    });

    it('resolves an expired session to nothing', async () => {
      // The expiry is enforced **on read**, so it does not depend on a
      // cleanup job having run.
      const { account } = await transactions.run((transaction) =>
        register.execute(
          {
            displayName: 'Jane Doe',
            email: aUniqueEmail(),
            password: 'correct horse 1',
            selfDeclaredRole: 'Student',
          },
          transaction,
        ),
      );

      const { token } = await transactions.run((transaction) =>
        sessionService.issue(account.id, transaction),
      );

      // The session is aged rather than the expiry moved forward: the
      // `sessions_expiry_after_creation_check` constraint correctly refuses
      // an expiry that precedes the creation, and that constraint is part of
      // what this test is relying on.
      await prisma.session.updateMany({
        where: { accountId: account.id },
        data: {
          createdAt: new Date('2026-10-01T00:00:00Z'),
          lastActivityAt: new Date('2026-10-01T00:00:00Z'),
          expiresAt: new Date('2026-10-10T00:00:00Z'),
        },
      });

      expect(await sessionService.resolve(token)).toBeNull();
    });
  });
});
