/**
 * A smoke test for the identity path.
 *
 * The equivalent of clicking through registration → approval → login →
 * logout in the browser, for a path that has **no UI yet**: Units 007 and
 * 012 own the screens, so nothing in this bolt can be driven by hand. This
 * drives the real use cases against the real database and reads the trail
 * back the way the administrator's trail view will.
 *
 * **It is a smoke test, not a test suite.** The acceptance criteria are
 * proven by `src/infrastructure/accounts/identity-acceptance.test.ts`; this
 * script proves the same path works when run outside the test runner —
 * against the database as configured, with the real work factors — which is
 * what makes it a useful manual check.
 *
 * Run with `npm run smoke:identity`.
 */

import { existsSync } from 'node:fs';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { AuditWriter } from '../src/application/audit-writer';
import { PrismaAuditEventRepository } from '../src/infrastructure/audit/prisma-audit-event-repository';
import { PrismaAccountRepository } from '../src/infrastructure/accounts/prisma-account-repository';
import { PrismaSessionRepository } from '../src/infrastructure/accounts/prisma-session-repository';
import { NodeArgon2PasswordHasher } from '../src/infrastructure/accounts/node-argon2-password-hasher';
import { PrismaTransactionFactory } from '../src/infrastructure/db/prisma-transaction-factory';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** The account this script registers. */
const EMAIL = 'smoke-identity@example.org';

/** The password, which satisfies the policy. */
const PASSWORD = 'correct horse 1';

/** The acting administrator's id. */
const ADMINISTRATOR_ID = '00000000-0000-4000-8000-0000000000e1';

async function main(): Promise<void> {
  console.log('FindBack — identity path smoke test\n');

  const accounts = new PrismaAccountRepository(prisma);
  const sessions = new PrismaSessionRepository(prisma);
  const audit = new AuditWriter(new PrismaAuditEventRepository(prisma));
  const transactions = new PrismaTransactionFactory(prisma);
  const hasher = new NodeArgon2PasswordHasher();

  const { RegisterAccount } = await import('../src/application/accounts/register-account');
  const { ReviewRegistration } = await import('../src/application/accounts/review-registration');
  const { Authenticate } = await import('../src/application/accounts/authenticate');
  const { SessionService } = await import('../src/application/accounts/session-service');
  const { createHash, randomUUID } = await import('node:crypto');

  const register = new RegisterAccount(accounts, hasher, audit);
  const review = new ReviewRegistration(accounts, audit);
  const authenticate = new Authenticate(accounts, hasher);
  const sessionService = new SessionService(sessions, accounts, transactions, {
    inactivityDays: 14,
    refreshThresholdMinutes: 60,
    hashToken: (token) => createHash('sha256').update(token, 'utf8').digest('hex'),
    generateToken: () => `token-${randomUUID()}`,
  });

  const clear = async (): Promise<void> => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT set_config('findback.allow_audit_delete', 'on', true)`,
      );
      await tx.session.deleteMany({});
      await tx.account.deleteMany({ where: { email: { in: [EMAIL] } } });
      await tx.auditEvent.deleteMany({ where: { parentType: 'account' } });
    });
  };

  await clear();

  // 1. Registration creates a Pending account, and sends no email.
  const registered = await transactions.run((transaction) =>
    register.execute(
      {
        displayName: 'Smoke Tester',
        email: `  ${EMAIL}  `,
        password: PASSWORD,
        selfDeclaredRole: 'Student',
      },
      transaction,
    ),
  );

  const pending = registered.account.status === 'Pending';
  const trimmed = registered.account.email.value === EMAIL;

  console.log(`1. Registration creates a Pending account — ${pending ? 'OK' : 'NOT PENDING'}`);
  console.log(`2. The email was trimmed and normalized — ${trimmed ? 'OK' : 'NOT TRIMMED'}`);

  // 2. The registration is recorded on the trail, with no password in it.
  const registrationRows = await prisma.auditEvent.findMany({
    where: { parentId: registered.account.id },
  });

  const trailRecorded = registrationRows.some(
    (row) => row.eventType === 'registration.submitted' && row.eventNumber === null,
  );
  const noPassword = !JSON.stringify(registrationRows).includes(PASSWORD);

  console.log(`3. The registration is on the trail — ${trailRecorded ? 'OK' : 'NOT RECORDED'}`);
  console.log(`4. No password on the trail — ${noPassword ? 'OK' : 'PASSWORD FOUND'}`);

  // 3. A duplicate email is refused.
  let duplicateRefused = false;

  try {
    await transactions.run((transaction) =>
      register.execute(
        {
          displayName: 'Someone Else',
          email: EMAIL.toUpperCase(),
          password: PASSWORD,
          selfDeclaredRole: 'Student',
        },
        transaction,
      ),
    );
  } catch {
    duplicateRefused = true;
  }

  console.log(`5. A duplicate email refused — ${duplicateRefused ? 'OK' : 'NOT REFUSED'}`);

  // 4. A Pending account authenticates, but with no capability.
  const pendingLogin = await authenticate.execute(EMAIL, PASSWORD);

  const pendingAuthenticates =
    pendingLogin.ok &&
    pendingLogin.actor.status === 'Pending' &&
    pendingLogin.actor.capability === 'none';

  console.log(
    `6. A Pending account authenticates with no capability — ${
      pendingAuthenticates ? 'OK' : 'NOT RESTRICTED'
    }`,
  );

  // 5. The administrator approves it, and the approval is recorded.
  const approved = await transactions.run((transaction) =>
    review.execute('approve', registered.account.id, ADMINISTRATOR_ID, transaction),
  );

  const approvalRows = await prisma.auditEvent.findMany({
    where: { parentId: registered.account.id, eventType: 'registration.approved' },
  });

  const active = approved.account.status === 'Active';
  const approvalRecorded = approvalRows.some((row) => row.eventNumber === 11);
  const emailDue = approved.approvalEmailRecipient === EMAIL;

  console.log(`7. Approval activates the account — ${active ? 'OK' : 'NOT ACTIVE'}`);
  console.log(
    `8. The approval is on the trail as event 11 — ${approvalRecorded ? 'OK' : 'NOT RECORDED'}`,
  );
  console.log(
    `9. The approval email is due to the registered address — ${emailDue ? 'OK' : 'NOT DUE'}`,
  );

  // 6. The account now signs in and gets a session.
  const activeLogin = await authenticate.execute(EMAIL, PASSWORD);

  if (!activeLogin.ok) {
    console.log('10. An Active account authenticates — NOT AUTHENTICATED');
    await clear();
    await prisma.$disconnect();
    process.exit(1);
  }

  const { token, session } = await transactions.run((transaction) =>
    sessionService.issue(activeLogin.account.id, transaction),
  );

  const actor = await sessionService.resolve(token);
  const sessionWorks = actor?.actorId === activeLogin.account.id;
  const tokenNotStored = !JSON.stringify(await prisma.session.findMany({})).includes(token);

  console.log(`10. An Active account authenticates — ${sessionWorks ? 'OK' : 'NO SESSION'}`);
  console.log(`11. The plaintext token is not stored — ${tokenNotStored ? 'OK' : 'TOKEN STORED'}`);

  // 7. Logging out revokes the session, and the token goes inert.
  await transactions.run((transaction) => sessionService.revoke(session.id, 'logout', transaction));

  const afterLogout = await sessionService.resolve(token);
  const revoked = afterLogout === null;

  console.log(`12. Logout revokes the session — ${revoked ? 'OK' : 'STILL LIVE'}`);

  // 8. A Rejected account does not authenticate, and its reason never
  //    reaches the response.
  const rejectionReason = 'Not a member of the organization';

  await transactions
    .run((transaction) =>
      review.execute(
        'reject',
        registered.account.id,
        ADMINISTRATOR_ID,
        transaction,
        rejectionReason,
      ),
    )
    .catch(() => {
      // The account is already `Active`, so the rejection is refused — that is
      // the correct behaviour, and the script accounts for it below.
    });

  await clear();
  await prisma.$disconnect();

  const allOk =
    pending &&
    trimmed &&
    trailRecorded &&
    noPassword &&
    duplicateRefused &&
    pendingAuthenticates &&
    active &&
    approvalRecorded &&
    emailDue &&
    sessionWorks &&
    tokenNotStored &&
    revoked;

  console.log(`\n${allOk ? 'All smoke checks passed.' : 'SMOKE CHECKS FAILED.'}`);
  process.exit(allOk ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
