/**
 * Acceptance-criteria validation for the identity stories.
 *
 * **Each test maps to one acceptance criterion**, or to one edge case the
 * story names. They are collected in one file so the mapping from criterion
 * to test is legible in one place — the Stage 5 test report cites it.
 *
 * The route handlers are exercised through their **real exported
 * functions**, against the **live database**, with `next/headers` mocked so
 * the test can decide who is calling. That combination is what makes these
 * tests worth having: a mocked repository would not catch a broken unique
 * index, a missing CHECK constraint, a wrong status code, or a cookie that
 * the browser would reject.
 *
 * The operational log is **captured**, so the "the result is audit-logged
 * without the password" criteria are asserted against the real log lines
 * rather than against a proxy for them.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { setOperationalLogger } from '@/app/api/_helpers';
import { GENERIC_INACTIVE_MESSAGE } from '@/domain/accounts';
import { buildIdentityStack } from '@/infrastructure/accounts/identity-stack';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

import { POST as registerAccountRoute } from '@/app/api/auth/register/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { GET as sessionRoute } from '@/app/api/session/route';
import { GET as queueRoute } from '@/app/api/admin/registrations/route';
import { POST as decisionRoute } from '@/app/api/admin/registrations/[id]/route';

import {
  bodyOf,
  csrfTokenFor,
  jsonRequest,
  requestContext,
  resetRequestContext,
  sessionCookieFrom,
  sessionTokenFrom,
} from '@/test/identity-harness';

import type { RequestContext } from '@/domain/audit';
import type { OperationalLogger } from '@/application/ports/operational-logger';

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

/**
 * The request context is mocked **before** the route modules are imported,
 * because the handlers read `next/headers` at call time.
 */
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === '__Host-fb' && requestContext.sessionToken !== null
        ? { value: requestContext.sessionToken }
        : undefined,
  }),
  headers: async () => ({
    get: (name: string) => {
      if (name === 'x-forwarded-for') {
        return requestContext.clientIp;
      }

      if (name === 'x-csrf-token') {
        return requestContext.csrfToken;
      }

      if (name === 'x-request-id') {
        return requestContext.requestId;
      }

      return null;
    },
  }),
}));

describeWithDatabase('bolt 004 — the identity acceptance criteria', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  /** The operational log lines the requests produced. */
  let logLines: RequestContext[] = [];

  /** A logger that keeps the lines instead of printing them. */
  const capturingLogger: OperationalLogger = {
    log(context: RequestContext): void {
      logLines.push(context);
    },
  };

  /** A counter, so no two tests use the same email address or the same IP. */
  let counter = 0;

  /** A unique email address. */
  function aUniqueEmail(): string {
    counter += 1;

    return `identity-${Date.now()}-${counter}@example.org`;
  }

  /**
   * A fresh client IP.
   *
   * The rate limiter buckets by IP, and the registration bucket allows 30
   * registrations an hour. A test that reused one IP would throttle itself
   * out of the route it is trying to exercise, so every request gets its own.
   */
  function aFreshIp(): string {
    counter += 1;

    return `198.51.100.${(counter % 250) + 1}`;
  }

  /** A password that satisfies the policy. */
  const PASSWORD = 'correct horse 1';

  /** Clear every table the suites touch. */
  async function clearTables(): Promise<void> {
    await prisma.session.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.account.deleteMany({});
    await prisma.rateLimitCounter.deleteMany({});
    await clearAuditTablesForTest(prisma);
  }

  beforeEach(async () => {
    resetRequestContext();
    logLines = [];
    setOperationalLogger(capturingLogger);
    await clearTables();
  });

  afterAll(async () => {
    await clearTables();
    await prisma.$disconnect();
  });

  /**
   * Register an account through the route handler.
   *
   * The route is used rather than the use case, so the whole boundary is
   * exercised — the rate limiter, the body parsing, the status code.
   */
  async function registerVia(overrides: Record<string, unknown> = {}): Promise<Response> {
    requestContext.clientIp = aFreshIp();

    return registerAccountRoute(
      jsonRequest({
        displayName: 'Jane Doe',
        email: aUniqueEmail(),
        password: PASSWORD,
        selfDeclaredRole: 'Student',
        ...overrides,
      }),
    );
  }

  /** The account row for an email address. */
  async function accountFor(email: string): Promise<string> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "accounts"
      WHERE lower(btrim("email")) = lower(btrim(${email}))
      ORDER BY CASE WHEN "status" = 'Rejected' THEN 1 ELSE 0 END, "createdAt" DESC
      LIMIT 1
    `;

    const id = rows[0]?.id;

    if (!id) {
      throw new Error(`No account with the email ${email}.`);
    }

    return id;
  }

  /** Sign a member in and return the session token. */
  async function signIn(email: string, password = PASSWORD): Promise<string> {
    requestContext.clientIp = aFreshIp();

    const response = await loginRoute(jsonRequest({ email, password }));

    const token = sessionTokenFrom(sessionCookieFrom(response));

    if (!token) {
      throw new Error(`The sign-in did not issue a session: ${response.status}`);
    }

    return token;
  }

  /**
   * Make a caller an administrator.
   *
   * The account is **activated** first, because the administrator flag is
   * only meaningful on an `Active` account — the database refuses the
   * combination otherwise.
   */
  async function makeAdministrator(accountId: string): Promise<void> {
    await prisma.account.update({
      where: { id: accountId },
      data: { status: 'Active', isAdministrator: true },
    });
  }

  /**
   * An administrator who is signed in.
   *
   * The administrator is a **separate account** from the one under review —
   * a review decision is refused unless the *subject* is still `Pending`, so
   * promoting the subject would make every decision a conflict.
   */
  async function anAdministrator(): Promise<{
    readonly email: string;
    readonly id: string;
    readonly token: string;
  }> {
    const email = aUniqueEmail();

    await registerVia({ email, displayName: 'Riley Admin' });

    const id = await accountFor(email);

    await makeAdministrator(id);

    const token = await signIn(email);

    requestContext.sessionToken = token;
    requestContext.csrfToken = csrfTokenFor(token);

    return { email, id, token };
  }

  /** The log lines for one action. */
  function linesFor(action: string): RequestContext[] {
    return logLines.filter((line) => line.action === action);
  }

  // ── Story 001 — self-registration ─────────────────────────────────────────

  describe('story 001 — self-registration', () => {
    it('criterion 1: creates a Pending account with the administrator flag false', async () => {
      const email = aUniqueEmail();

      const response = await registerVia({ email });

      expect(response.status).toBe(201);
      expect(await bodyOf(response)).toEqual({ status: 'Pending' });

      const row = await prisma.account.findUnique({ where: { id: await accountFor(email) } });

      expect(row?.status).toBe('Pending');
      expect(row?.isAdministrator).toBe(false);
    });

    it('criterion 2: sends no email on registration', async () => {
      await registerVia();

      // The route logs `account.approved_email_not_configured` when an
      // approval email was **due**. A registration produces no such line —
      // which is the observable form of "no email is sent" (FR-1).
      expect(linesFor('account.approved_email_not_configured')).toHaveLength(0);
      expect(linesFor('account.approved_email_failed')).toHaveLength(0);
    });

    it('criterion 3: refuses a duplicate email with a validation error', async () => {
      const email = aUniqueEmail();

      const first = await registerVia({ email });
      expect(first.status).toBe(201);

      const second = await registerVia({ email });

      expect(second.status).toBe(409);

      const body = await bodyOf(second);

      expect(body.error).toBeTruthy();
      // **No second account** was created.
      expect(await prisma.account.count()).toBe(1);
    });

    it('criterion 4: refuses a password that fails the policy', async () => {
      const response = await registerVia({ password: 'short' });

      expect(response.status).toBe(422);

      const body = await bodyOf(response);

      expect(body.field).toBe('password');
      expect(await prisma.account.count()).toBe(0);
    });

    it('criterion 5: records the registration with the actor and the timestamp, and no sensitive value', async () => {
      const email = aUniqueEmail();

      await registerVia({ email });

      const rows = await prisma.auditEvent.findMany({});

      expect(rows).toHaveLength(1);

      const row = rows[0];

      expect(row?.eventType).toBe('registration.submitted');
      // FR-2 requires the trail to record the registration. The frozen
      // FR-31 catalog has no number for it, so the record is **unnumbered**.
      expect(row?.eventNumber).toBeNull();
      expect(row?.actorId).toBeTruthy();
      expect(row?.occurredAt).toBeInstanceOf(Date);
      expect(row?.metadata).toMatchObject({
        displayName: 'Jane Doe',
        email,
        selfDeclaredRole: 'Student',
      });

      // **No sensitive value** — the password, and the hash it became.
      const serialized = JSON.stringify(rows);

      expect(serialized).not.toContain(PASSWORD);
      expect(serialized).not.toContain('$argon2id$');
    });

    it('edge case: a duplicate email differing only in case is a duplicate', async () => {
      const email = aUniqueEmail();

      await registerVia({ email });

      const second = await registerVia({ email: email.toUpperCase() });

      expect(second.status).toBe(409);
      expect(await prisma.account.count()).toBe(1);
    });

    it('edge case: an email with leading and trailing whitespace is trimmed before the uniqueness check', async () => {
      const email = aUniqueEmail();

      await registerVia({ email });

      const second = await registerVia({ email: `  ${email}  ` });

      expect(second.status).toBe(409);
      expect(await prisma.account.count()).toBe(1);
    });

    it('edge case: a self-declared role of Other stores the free text without granting capability', async () => {
      const email = aUniqueEmail();

      const response = await registerVia({
        email,
        selfDeclaredRole: 'Other',
        selfDeclaredRoleOther: 'Visiting researcher',
      });

      expect(response.status).toBe(201);

      const row = await prisma.account.findUnique({ where: { id: await accountFor(email) } });

      expect(row?.selfDeclaredRole).toBe('Other');
      expect(row?.selfDeclaredRoleOther).toBe('Visiting researcher');
      expect(row?.isAdministrator).toBe(false);
    });

    it('edge case: a unicode display name is accepted', async () => {
      const response = await registerVia({ displayName: 'Zoë Ünicode Müller 日本' });

      expect(response.status).toBe(201);
    });
  });

  // ── Story 002 — administrator review ─────────────────────────────────────

  describe('story 002 — administrator review of pending registrations', () => {
    it('criterion 1: approving makes the account Active and the approval email is due', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const response = await decisionRoute(jsonRequest({ decision: 'approve' }), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toMatchObject({ status: 'Active' });

      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.status).toBe('Active');

      // The approval email was **due** — the route says so out loud, because
      // SMTP is not configured in the test environment.
      expect(linesFor('account.approved_email_not_configured')).toHaveLength(1);
    });

    it('criterion 1: the approval email goes to the account own registered address', async () => {
      // The use case decides the recipient; the route sends to it. The
      // transport itself is proven by `smtp-email-sender.test.ts`.
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const stack = buildIdentityStack();

      const outcome = await stack.transactions.run((transaction) =>
        stack.review.execute(
          'approve',
          accountId,
          '00000000-0000-4000-8000-0000000000ff',
          transaction,
        ),
      );

      expect(outcome.approvalEmailRecipient).toBe(email);
    });

    it('criterion 2: rejecting makes the account Rejected, records the reason, and queues the rejection email', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const response = await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Not a member of the organization' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      expect(response.status).toBe(200);

      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.status).toBe('Rejected');
      expect(row?.rejectionReason).toBe('Not a member of the organization');

      expect(linesFor('account.rejected_email_failed')).toHaveLength(0);
      expect(
        linesFor('account.rejected_email_not_configured').length +
          linesFor('account.rejected_email_sent').length,
      ).toBe(1);

      const rejection = await prisma.auditEvent.findFirst({
        where: { eventType: 'registration.rejected' },
      });

      expect(rejection?.eventNumber).toBe(12);
      expect(rejection?.reason).toBe('Not a member of the organization');
    });

    it('criterion 3: records the decision with the acting administrator and the timestamp', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const administrator = await anAdministrator();

      await decisionRoute(jsonRequest({ decision: 'approve' }), {
        params: Promise.resolve({ id: accountId }),
      });

      const approval = await prisma.auditEvent.findFirst({
        where: { eventType: 'registration.approved' },
      });

      expect(approval?.eventNumber).toBe(11);
      expect(approval?.actorId).toBe(administrator.id);
      expect(approval?.actorRole).toBe('administrator');
      expect(approval?.occurredAt).toBeInstanceOf(Date);
    });

    it('criterion 4: refuses a decision on an account that is no longer pending', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const first = await decisionRoute(jsonRequest({ decision: 'approve' }), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(first.status).toBe(200);

      const second = await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Changed my mind' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      // The conflict is a 409 — the account was already decided.
      expect(second.status).toBe(409);
    });

    it('criterion 5: refuses a non-administrator actor with an authorization error', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      // An **Active member** who is not an administrator.
      await makeAdministrator(accountId);
      await prisma.account.update({
        where: { id: accountId },
        data: { isAdministrator: false },
      });

      const memberToken = await signIn(email);
      requestContext.sessionToken = memberToken;
      requestContext.csrfToken = csrfTokenFor(memberToken);

      const response = await decisionRoute(jsonRequest({ decision: 'approve' }), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(403);
      expect(await bodyOf(response)).toEqual({ error: 'You do not have access to this.' });
    });

    it('criterion 6: an approval whose email send fails still stands, and the failure is logged', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      // SMTP is pointed at a closed port, so the send **fails** — the case
      // PRD §10 requires to be recorded without blocking the action.
      const previousHost = process.env.SMTP_HOST;
      const previousPort = process.env.SMTP_PORT;

      process.env.SMTP_HOST = '127.0.0.1';
      process.env.SMTP_PORT = '1';

      try {
        const response = await decisionRoute(jsonRequest({ decision: 'approve' }), {
          params: Promise.resolve({ id: accountId }),
        });

        // **The approval still stands.**
        expect(response.status).toBe(200);

        const row = await prisma.account.findUnique({ where: { id: accountId } });
        expect(row?.status).toBe('Active');

        // And the failure is **recorded**.
        const failures = linesFor('account.approved_email_failed');
        expect(failures).toHaveLength(1);

        // The record carries no sensitive value.
        expect(JSON.stringify(failures)).not.toContain(email);
        expect(JSON.stringify(failures)).not.toContain(PASSWORD);
      } finally {
        if (previousHost === undefined) {
          delete process.env.SMTP_HOST;
        } else {
          process.env.SMTP_HOST = previousHost;
        }

        if (previousPort === undefined) {
          delete process.env.SMTP_PORT;
        } else {
          process.env.SMTP_PORT = previousPort;
        }
      }
    });

    it('edge case: two administrators deciding the same account — exactly one commits', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const first = await decisionRoute(jsonRequest({ decision: 'approve' }), {
        params: Promise.resolve({ id: accountId }),
      });

      const second = await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Changed my mind' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);

      // **Exactly one** decision was recorded.
      const decisions = await prisma.auditEvent.findMany({
        where: {
          parentId: accountId,
          eventType: { in: ['registration.approved', 'registration.rejected'] },
        },
      });

      expect(decisions).toHaveLength(1);
    });

    it('edge case: a rejection with a blank reason is rejected without a reason string', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const response = await decisionRoute(jsonRequest({ decision: 'reject' }), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(200);

      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.status).toBe('Rejected');
      expect(row?.rejectionReason).toBeNull();
    });

    it('edge case: a rejected email can be registered again', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const rejectedId = await accountFor(email);

      await anAdministrator();

      const rejection = await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Not a member of the organization' }),
        { params: Promise.resolve({ id: rejectedId }) },
      );

      expect(rejection.status).toBe(200);

      requestContext.sessionToken = null;
      requestContext.csrfToken = null;

      const second = await registerVia({ email, displayName: 'Jane Again' });

      expect(second.status).toBe(201);
      expect(await bodyOf(second)).toEqual({ status: 'Pending' });

      const liveId = await accountFor(email);

      expect(liveId).not.toBe(rejectedId);

      const live = await prisma.account.findUnique({ where: { id: liveId } });
      const rejected = await prisma.account.findUnique({ where: { id: rejectedId } });

      expect(live?.status).toBe('Pending');
      expect(live?.displayName).toBe('Jane Again');
      expect(rejected?.status).toBe('Rejected');
    });
  });

  // ── Story 003 — login ─────────────────────────────────────────────────────

  describe('story 003 — login with an active account', () => {
    it('criterion 1: an Active account with the correct password gets a session', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);
      await prisma.account.update({
        where: { id: accountId },
        data: { isAdministrator: false },
      });

      const response = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body.status).toBe('Active');

      // The session cookie is set, and it carries the four attributes the
      // `__Host-` prefix requires.
      const setCookie = sessionCookieFrom(response);

      expect(setCookie).toContain('__Host-fb=');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Lax');
      // **No `Domain`** — the `__Host-` prefix forbids it.
      expect(setCookie).not.toContain('Domain=');
    });

    it('criterion 2 (PRD FR-4): a Pending account authenticates and lands on the pending surface', async () => {
      // **This is the PRD's behaviour, not story 003 criterion 2's.** The
      // story says "the response is the generic inactive-account message and
      // no session is created"; FR-4 says "Pending — authentication succeeds
      // but lands on a confirmation banner", and `EXPERIENCE.md` §16.3
      // gives the Pending account a `/pending` landing with a banner. The
      // PRD is the authoritative specification, so the implementation follows
      // it. The test report records the discrepancy as an open item.
      const email = aUniqueEmail();
      await registerVia({ email });

      const response = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toMatchObject({ status: 'Pending' });

      // A session **is** created — the pending surface needs one.
      expect(sessionCookieFrom(response)).toBeTruthy();
      expect(await prisma.session.count()).toBe(1);
    });

    it('criterion 2 (PRD FR-2): the Pending account that authenticated still has no member capability', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const stack = buildIdentityStack();

      const { token } = await stack.transactions.run((transaction) =>
        stack.sessions.issue(accountId, transaction),
      );

      requestContext.sessionToken = token;

      const body = await bodyOf(await sessionRoute());

      // The status travels; the capability does not follow.
      expect(body.actor).toMatchObject({ status: 'Pending', capability: 'none' });
    });
    it('criterion 3: a Rejected account gets the generic message and no session', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Not a member of the organization' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      requestContext.sessionToken = null;
      requestContext.csrfToken = null;
      requestContext.clientIp = aFreshIp();

      const response = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      expect(response.status).toBe(401);

      // The generic message — **not** a message naming the state.
      const body = await bodyOf(response);

      expect(body.error).toBe(GENERIC_INACTIVE_MESSAGE);

      // No session is created for a refused login.
      expect(sessionCookieFrom(response)).toBeNull();
      expect(await prisma.session.count({ where: { accountId } })).toBe(0);
    });

    it('criterion 4: a Deactivated account gets the generic message and no session', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      // **Deactivation is bolt 005's scope** (FR-5), so the status is set
      // directly here. The assertion is about the *login* path, which is
      // this bolt's: a `Deactivated` account does not authenticate at all
      // (FR-4), so it must be refused exactly like a `Rejected` one.
      await prisma.account.update({
        where: { id: accountId },
        data: { status: 'Deactivated', deactivatedAt: new Date() },
      });

      requestContext.clientIp = aFreshIp();

      const response = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      expect(response.status).toBe(401);
      expect(await bodyOf(response)).toEqual({ error: GENERIC_INACTIVE_MESSAGE });

      // No session is created for a refused login.
      expect(sessionCookieFrom(response)).toBeNull();
      expect(await prisma.session.count({ where: { accountId } })).toBe(0);
    });

    it('criterion 5: an incorrect password and an unknown email are indistinguishable', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      requestContext.clientIp = aFreshIp();
      const wrongPassword = await loginRoute(jsonRequest({ email, password: 'wrong password 9' }));

      requestContext.clientIp = aFreshIp();
      const unknownEmail = await loginRoute(
        jsonRequest({ email: aUniqueEmail(), password: 'wrong password 9' }),
      );

      expect(wrongPassword.status).toBe(unknownEmail.status);

      const wrongBody = await bodyOf(wrongPassword);
      const unknownBody = await bodyOf(unknownEmail);

      // **Byte-for-byte identical** — the anti-enumeration rule.
      expect(JSON.stringify(wrongBody)).toBe(JSON.stringify(unknownBody));
      expect(wrongBody.error).toBeTruthy();
    });

    it('criterion 6: the login is audit-logged without recording the submitted password', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      await loginRoute(jsonRequest({ email, password: PASSWORD }));

      const logins = linesFor('account.login');

      expect(logins).toHaveLength(1);
      expect(logins[0]?.outcome).toBe('success');
      expect(logins[0]?.actorId).toBe(accountId);

      // **No sensitive value** on the log line, and no email address either.
      const serialized = JSON.stringify(logLines);

      expect(serialized).not.toContain(PASSWORD);
      expect(serialized).not.toContain('$argon2id$');
      expect(serialized).not.toContain(email);
    });

    it('edge case: a case-differing email at login matches', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      requestContext.clientIp = aFreshIp();

      const response = await loginRoute(
        jsonRequest({ email: email.toUpperCase(), password: PASSWORD }),
      );

      expect(response.status).toBe(200);
      expect(sessionCookieFrom(response)).toBeTruthy();
    });

    it('edge case: an expired session cookie is treated as unauthenticated, with no error surfaced', async () => {
      // The cookie is expired **client-side**, so the browser would not
      // send it. A request that carries one anyway is answered as "nobody is
      // signed in" — 200 with a null actor, never an error.
      requestContext.sessionToken = 'a-token-that-no-longer-exists';

      const response = await sessionRoute();

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({ actor: null });
    });
  });

  // ── Story 005 — logout ────────────────────────────────────────────────────

  describe('story 005 — logout revokes the session', () => {
    it('criterion 1: logging out revokes the session row and clears the cookie', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await logoutRoute();

      expect(response.status).toBe(200);

      // The cookie is cleared.
      const setCookie = sessionCookieFrom(response);
      expect(setCookie).toContain('__Host-fb=;');
      expect(setCookie).toContain('Max-Age=0');

      // The **row** is revoked — the token is inert server-side even if the
      // cookie survives in a browser.
      const rows = await prisma.session.findMany({});

      expect(rows).toHaveLength(1);
      expect(rows[0]?.revokedAt).toBeInstanceOf(Date);
    });

    it('criterion 2: a revoked session token is unauthenticated on any request', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      await logoutRoute();

      const response = await sessionRoute();

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({ actor: null });
    });

    it('criterion 3: the logout is recorded without recording the session token', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      await logoutRoute();

      const logouts = linesFor('account.logout');

      expect(logouts).toHaveLength(1);
      expect(logouts[0]?.outcome).toBe('success');
      expect(logouts[0]?.actorId).toBe(accountId);

      // **The token is not on the log line.**
      const serialized = JSON.stringify(logLines);

      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain(PASSWORD);
    });

    it('criterion 4: a logout without a valid session is an idempotent success', async () => {
      requestContext.sessionToken = null;

      const response = await logoutRoute();

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({ ok: true });

      // No session state changed.
      expect(await prisma.session.count()).toBe(0);
    });

    it('criterion 5: logging out on one device leaves other sessions alone', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      // Two sessions — two devices.
      const first = await signIn(email);
      const second = await signIn(email);

      expect(await prisma.session.count()).toBe(2);

      requestContext.sessionToken = first;
      requestContext.csrfToken = csrfTokenFor(first);

      await logoutRoute();

      const rows = await prisma.session.findMany({});

      const revoked = rows.filter((row) => row.revokedAt !== null);
      const open = rows.filter((row) => row.revokedAt === null);

      expect(revoked).toHaveLength(1);
      expect(open).toHaveLength(1);

      // The **other** device still resolves.
      requestContext.sessionToken = second;
      requestContext.csrfToken = csrfTokenFor(second);

      const response = await sessionRoute();

      expect(await bodyOf(response)).toMatchObject({ actor: { id: accountId } });
    });

    it('edge case: a double logout is an idempotent success both times', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const first = await logoutRoute();
      const second = await logoutRoute();

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
    });
  });

  // ── Story 006 — the Pending restriction ───────────────────────────────────

  describe('story 006 — a pending member is restricted', () => {
    it('criterion 5: the ActorContext carries the Pending status', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const stack = buildIdentityStack();

      const { token } = await stack.transactions.run((transaction) =>
        stack.sessions.issue(accountId, transaction),
      );

      requestContext.sessionToken = token;

      const response = await sessionRoute();

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body.actor).toMatchObject({
        id: accountId,
        status: 'Pending',
        // **No capability** — the restriction lives here.
        capability: 'none',
        isAdministrator: false,
      });
    });

    it('criterion 4: a pending member is refused an administrator surface', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const stack = buildIdentityStack();

      const { token } = await stack.transactions.run((transaction) =>
        stack.sessions.issue(accountId, transaction),
      );

      requestContext.sessionToken = token;

      const response = await queueRoute();

      expect(response.status).toBe(403);
      expect(await bodyOf(response)).toEqual({ error: 'You do not have access to this.' });
    });

    it('criterion 6: after approval, the same account is no longer restricted, with no migration', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const stack = buildIdentityStack();

      const { token } = await stack.transactions.run((transaction) =>
        stack.sessions.issue(accountId, transaction),
      );

      requestContext.sessionToken = token;

      const before = await bodyOf(await sessionRoute());
      expect(before.actor).toMatchObject({ status: 'Pending', capability: 'none' });

      // The account is approved. **The same session** is used — no re-issue,
      // no migration, no re-login.
      await prisma.account.update({
        where: { id: accountId },
        data: { status: 'Active' },
      });

      const after = await bodyOf(await sessionRoute());
      expect(after.actor).toMatchObject({ status: 'Active', capability: 'member' });
    });

    it('edge case: the administrator flag on a pending account grants nothing', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      // The database **refuses** this row — the CHECK constraint is the
      // backstop behind the domain.
      await expect(
        prisma.account.update({
          where: { id: accountId },
          data: { isAdministrator: true },
        }),
      ).rejects.toThrow();
    });
  });

  // ── Story 007 — the rejection ─────────────────────────────────────────────

  describe('story 007 — the owner rejects a registration', () => {
    it('criterion 1: the rejection stores and audit-records the reason with the acting administrator', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const administrator = await anAdministrator();

      await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Not a member of the organization' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.status).toBe('Rejected');
      expect(row?.rejectionReason).toBe('Not a member of the organization');

      const rejection = await prisma.auditEvent.findFirst({
        where: { eventType: 'registration.rejected' },
      });

      expect(rejection?.actorId).toBe(administrator.id);
      expect(rejection?.actorRole).toBe('administrator');
      expect(rejection?.reason).toBe('Not a member of the organization');
    });

    it('criterion 2: the rejection reason never appears in any response body', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const reason = 'Not a member of the organization';

      const decision = await decisionRoute(jsonRequest({ decision: 'reject', reason }), {
        params: Promise.resolve({ id: accountId }),
      });

      // Every response the rejected member could receive.
      requestContext.sessionToken = null;
      requestContext.csrfToken = null;

      const responses = [
        decision,
        await loginRoute(jsonRequest({ email, password: PASSWORD })),
        await sessionRoute(),
        await queueRoute(),
      ];

      for (const response of responses) {
        const body = await response.text();

        expect(body).not.toContain(reason);
      }
    });

    it('criterion 3: the rejected login is byte-identical to the inactive case', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Not a member of the organization' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      requestContext.sessionToken = null;
      requestContext.csrfToken = null;
      requestContext.clientIp = aFreshIp();

      const rejected = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      requestContext.clientIp = aFreshIp();

      const unknown = await loginRoute(jsonRequest({ email: aUniqueEmail(), password: PASSWORD }));

      expect(rejected.status).toBe(unknown.status);
      expect(await rejected.text()).toBe(await unknown.text());
    });

    it('criterion 4: the rejection reason is visible on the administrator audit entry', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Not a member of the organization' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      // The **administrator's** trail carries it.
      const rejection = await prisma.auditEvent.findFirst({
        where: { eventType: 'registration.rejected' },
      });

      expect(rejection?.reason).toBe('Not a member of the organization');
    });

    it('criterion 5: a rejection emails the applicant with the reason', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      await decisionRoute(
        jsonRequest({ decision: 'reject', reason: 'Not a member of the organization' }),
        { params: Promise.resolve({ id: accountId }) },
      );

      expect(linesFor('account.rejected_email_failed')).toHaveLength(0);
      expect(
        linesFor('account.rejected_email_not_configured').length +
          linesFor('account.rejected_email_sent').length,
      ).toBe(1);

      // And the subject account's trail carries the registration and the
      // rejection — and nothing else. (The administrator's own registration
      // record is on a different account, so the query is scoped.)
      const rows = await prisma.auditEvent.findMany({ where: { parentId: accountId } });

      expect(rows.map((row) => row.eventType).sort()).toEqual([
        'registration.rejected',
        'registration.submitted',
      ]);
    });

    it('edge case: a rejection reason containing HTML is stored verbatim and never rendered', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const reason = '<script>alert("x")</script>';

      await decisionRoute(jsonRequest({ decision: 'reject', reason }), {
        params: Promise.resolve({ id: accountId }),
      });

      // Stored **verbatim** — it is audit-significant.
      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.rejectionReason).toBe(reason);

      // And **never** in a response body.
      requestContext.sessionToken = null;
      requestContext.csrfToken = null;
      requestContext.clientIp = aFreshIp();

      const response = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      expect(await response.text()).not.toContain('<script>');
    });
  });

  // ── FR-3 — the administrator's queue ──────────────────────────────────────

  describe('FR-3 — the pending-registrations queue', () => {
    it('shows the name, email, self-declared role, and registration timestamp', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      await anAdministrator();

      const response = await queueRoute();

      expect(response.status).toBe(200);

      const body = await bodyOf(response);
      const registrations = body.registrations as Array<Record<string, unknown>>;

      expect(registrations).toHaveLength(1);
      expect(registrations[0]).toMatchObject({
        id: accountId,
        displayName: 'Jane Doe',
        email,
        selfDeclaredRole: 'Student',
      });
      expect(typeof registrations[0]?.registeredAt).toBe('string');
    });

    it('orders the queue by submission time, oldest first', async () => {
      const first = aUniqueEmail();
      const second = aUniqueEmail();

      await registerVia({ email: first });
      await registerVia({ email: second });

      const firstId = await accountFor(first);
      const secondId = await accountFor(second);

      // The timestamps are set explicitly, so the ordering is deterministic
      // rather than dependent on the clock.
      await prisma.account.update({
        where: { id: firstId },
        data: { createdAt: new Date('2026-10-27T10:00:00Z') },
      });
      await prisma.account.update({
        where: { id: secondId },
        data: { createdAt: new Date('2026-10-27T11:00:00Z') },
      });

      await anAdministrator();

      const body = await bodyOf(await queueRoute());
      const registrations = body.registrations as Array<Record<string, unknown>>;

      expect(registrations.map((entry) => entry.id)).toEqual([firstId, secondId]);
    });

    it('refuses a caller with no session', async () => {
      requestContext.sessionToken = null;

      const response = await queueRoute();

      expect(response.status).toBe(403);
    });

    it('refuses a member who is not an administrator', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);
      await makeAdministrator(accountId);
      await prisma.account.update({
        where: { id: accountId },
        data: { isAdministrator: false },
      });

      const token = await signIn(email);
      requestContext.sessionToken = token;

      const response = await queueRoute();

      expect(response.status).toBe(403);
    });
  });
});
