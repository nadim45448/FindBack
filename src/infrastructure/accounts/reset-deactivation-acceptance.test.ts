/**
 * Acceptance-criteria validation for bolt 005's four stories.
 *
 * **Each test maps to one acceptance criterion**, or to one edge case the
 * story names. They are collected in one file so the mapping from criterion
 * to test is legible in one place — the Stage 5 test report cites it.
 *
 * The route handlers are exercised through their **real exported
 * functions**, against the **live database**, with `next/headers` mocked so
 * the test can decide who is calling.
 *
 * **The anti-enumeration property is asserted, not assumed** (FR-51): the
 * response bodies are compared byte for byte, and the timing is **measured**
 * against a tolerance rather than asserted as equal.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { setOperationalLogger } from '@/app/api/_helpers';
import { NEUTRAL_RESET_CONFIRMATION } from '@/domain/accounts';
import { clearAuditTablesForTest } from '@/test/delete-for-test';

import { POST as registerAccountRoute } from '@/app/api/auth/register/route';
import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as forgotPasswordRoute } from '@/app/api/auth/forgot-password/route';
import { POST as resetPasswordRoute } from '@/app/api/auth/reset-password/route';
import { POST as deactivateRoute } from '@/app/api/admin/accounts/[id]/deactivate/route';
import { GET as profileGetRoute, POST as profilePostRoute } from '@/app/api/me/profile/route';

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
import type { OutboundEmail } from '@/application/ports/email-sender';

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

/**
 * The reset token the stack will mint, and the messages it will send.
 *
 * The token's plaintext exists **only** in the email — the database holds
 * its digest — so a test that must complete a reset needs to know it. The
 * stack's two test seams (the token generator and the email sender) are what
 * make that possible without weakening the production path.
 */
const issued = {
  /** The plaintext token the most recent request minted. */
  token: '',
  messages: [] as OutboundEmail[],
};

/**
 * The stack is built with the test's seams.
 *
 * Everything else — the repositories, the hasher, the rate limiter, the CSRF
 * validator — is the real implementation against the live database.
 *
 * The token generator is **unique per call**, because the database's unique
 * index on the token's digest would otherwise refuse the second token in a
 * test that requests two.
 */
vi.mock('@/infrastructure/accounts/identity-stack', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/infrastructure/accounts/identity-stack')>();

  let sequence = 0;

  return {
    ...original,
    buildIdentityStack: (env?: NodeJS.ProcessEnv) =>
      original.buildIdentityStack(env, {
        generateResetToken: () => {
          sequence += 1;

          issued.token = `a-deterministic-reset-token-${String(sequence).padStart(4, '0')}`;

          return issued.token;
        },
        emailSender: {
          async send(message: OutboundEmail): Promise<void> {
            issued.messages.push(message);
          },
        },
      }),
  };
});

describeWithDatabase('bolt 005 — the identity-security acceptance criteria', () => {
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

    return `reset-${Date.now()}-${counter}@example.org`;
  }

  /**
   * A fresh client IP.
   *
   * The reset path's IP bucket allows five requests an hour, so a test that
   * reused one IP would throttle itself out of the route it is exercising.
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
    issued.messages = [];
    setOperationalLogger(capturingLogger);
    await clearTables();
  });

  afterAll(async () => {
    await clearTables();
    await prisma.$disconnect();
  });

  /** Register an account through the route handler. */
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
      SELECT "id" FROM "Account" WHERE lower(btrim("email")) = lower(btrim(${email}))
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

  /** Make an account `Active`, so it can sign in. */
  async function activate(accountId: string): Promise<void> {
    await prisma.account.update({
      where: { id: accountId },
      data: { status: 'Active', activatedAt: new Date() },
    });
  }

  /** Make an account an administrator. */
  async function makeAdministrator(accountId: string): Promise<void> {
    await prisma.account.update({
      where: { id: accountId },
      data: { status: 'Active', isAdministrator: true },
    });
  }

  /** An administrator who is signed in. */
  async function anAdministrator(): Promise<{
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

    return { id, token };
  }

  /** The log lines for one action. */
  function linesFor(action: string): RequestContext[] {
    return logLines.filter((line) => line.action === action);
  }

  /**
   * A signed-out visitor's CSRF token.
   *
   * The reset request is unauthenticated, so the CSRF token is derived from
   * whatever session cookie the visitor presents. The validator only **hashes**
   * the cookie's value, so no session row is needed — the visitor's cookie is
   * a synthetic value and the token is the HMAC the validator expects.
   *
   * (A real session row would need a real account, and a reset request has
   * no account — that is the whole point of the path.)
   */
  async function anAnonymousCsrfToken(): Promise<string> {
    counter += 1;

    const token = `anonymous-session-token-${counter}`;

    requestContext.sessionToken = token;
    requestContext.csrfToken = csrfTokenFor(token);

    return token;
  }

  // ── Story 008 — the reset request discloses nothing ───────────────────────

  describe('story 008 — the reset request never discloses the account', () => {
    it('criterion 1: returns the neutral confirmation for a registered address', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const response = await forgotPasswordRoute(jsonRequest({ email }));

      expect(response.status).toBe(202);
      expect(await bodyOf(response)).toEqual({ message: NEUTRAL_RESET_CONFIRMATION });
    });

    it('criterion 1: returns the same neutral confirmation for an unregistered address', async () => {
      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const response = await forgotPasswordRoute(jsonRequest({ email: aUniqueEmail() }));

      expect(response.status).toBe(202);
      expect(await bodyOf(response)).toEqual({ message: NEUTRAL_RESET_CONFIRMATION });
    });

    it('criterion 1: the two responses are byte-for-byte identical', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const registered = await forgotPasswordRoute(jsonRequest({ email }));
      const registeredBody = await registered.text();

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const unregistered = await forgotPasswordRoute(jsonRequest({ email: aUniqueEmail() }));
      const unregisteredBody = await unregistered.text();

      expect(registeredBody).toBe(unregisteredBody);
    });

    it('criterion 1: the response is identical across all four account states', async () => {
      const bodies: string[] = [];

      for (const status of ['Pending', 'Active', 'Rejected', 'Deactivated'] as const) {
        const email = aUniqueEmail();
        await registerVia({ email });

        const accountId = await accountFor(email);
        await prisma.account.update({
          where: { id: accountId },
          data: {
            status,
            activatedAt: status === 'Active' ? new Date() : null,
            deactivatedAt: status === 'Deactivated' ? new Date() : null,
          },
        });

        await anAnonymousCsrfToken();
        requestContext.clientIp = aFreshIp();

        const response = await forgotPasswordRoute(jsonRequest({ email }));
        bodies.push(await response.text());
      }

      // And the same as the unregistered case.
      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const miss = await forgotPasswordRoute(jsonRequest({ email: aUniqueEmail() }));
      bodies.push(await miss.text());

      expect(new Set(bodies).size).toBe(1);
    });

    it('criterion 2: issues a token for a registered address', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email }));

      expect(await prisma.passwordResetToken.count({ where: { accountId } })).toBe(1);
    });

    it('criterion 2: issues no token for an unregistered address', async () => {
      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email: aUniqueEmail() }));

      expect(await prisma.passwordResetToken.count()).toBe(0);
    });

    it('criterion 2: the token is stored as a digest, never as its plaintext', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email }));

      const row = await prisma.passwordResetToken.findFirst({ where: { accountId } });

      // A keyed HMAC — 64 hex characters, and **not** the plaintext.
      expect(row?.tokenHash).toHaveLength(64);
      expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row?.tokenHash).not.toBe(issued.token);
      expect(row?.tokenHash).not.toContain(issued.token);
    });

    it('criterion 2: the email carries the token, and the configured lifetime', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email }));

      expect(issued.messages).toHaveLength(1);

      const message = issued.messages[0]!;

      expect(message.to).toBe(email);
      expect(message.textBody).toContain(issued.token);
      // The **configured** value, not a constant (ADR-17).
      expect(message.textBody).toContain('1 hour');
    });

    it('criterion 2: no email is sent for an unregistered address', async () => {
      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email: aUniqueEmail() }));

      expect(issued.messages).toHaveLength(0);
    });

    it('criterion 2: the token expires at the configured lifetime', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const before = Date.now();
      await forgotPasswordRoute(jsonRequest({ email }));

      const row = await prisma.passwordResetToken.findFirst({ where: { accountId } });

      expect(row?.usedAt).toBeNull();

      // The configured window, within a minute of slack for the clock.
      const window = (row?.expiresAt.getTime() ?? 0) - (row?.createdAt.getTime() ?? 0);

      expect(window).toBe(3600 * 1000);
      expect(row!.createdAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });

    it('criterion 3: the request never changes the account status', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);

      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email }));

      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.status).toBe('Active');
    });

    it('criterion 4: the timing of the two paths is within the tolerance', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const hitStart = Date.now();
      await forgotPasswordRoute(jsonRequest({ email }));
      const hitElapsed = Date.now() - hitStart;

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const missStart = Date.now();
      await forgotPasswordRoute(jsonRequest({ email: aUniqueEmail() }));
      const missElapsed = Date.now() - missStart;

      // ADR-18's tolerance — wide enough not to be flaky, narrow enough that
      // a real existence oracle would fail it.
      expect(Math.abs(hitElapsed - missElapsed)).toBeLessThanOrEqual(100);
    });

    it('edge case: the rate-limited path is held to the floor too', async () => {
      // ADR-18's rule: the floor applies to **every** path, including the
      // refused one. The reset path's accepted and refused bodies differ — a
      // 202 and a 429 — so if their timing also differed, the refusal would
      // be distinguishable by timing alone, and an instant 429 would say
      // "this address was requested recently".
      const email = aUniqueEmail();
      const ip = aFreshIp();

      // The email bucket allows three an hour, so the fourth request is
      // refused. The **same** address and the **same** IP, so both buckets
      // are counting the same request.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await anAnonymousCsrfToken();
        requestContext.clientIp = ip;

        const accepted = await forgotPasswordRoute(jsonRequest({ email }));

        expect(accepted.status).toBe(202);
      }

      await anAnonymousCsrfToken();
      requestContext.clientIp = ip;

      const start = Date.now();
      const response = await forgotPasswordRoute(jsonRequest({ email }));
      const elapsed = Date.now() - start;

      expect(response.status).toBe(429);

      // The floor is 250 ms; the tolerance is 100 ms. The refusal must not
      // arrive *early* — a refusal that skipped the work must still pay the
      // delay.
      expect(elapsed).toBeGreaterThanOrEqual(250);
      expect(elapsed).toBeLessThanOrEqual(250 + 100);
    });

    it('edge case: a malformed address is a malformed request, not an existence disclosure', async () => {
      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      const response = await forgotPasswordRoute(jsonRequest({ email: 'not-an-address' }));

      expect(response.status).toBe(400);
      expect((await bodyOf(response)).field).toBe('email');
    });

    it('edge case: a request without a CSRF token is refused', async () => {
      requestContext.sessionToken = null;
      requestContext.csrfToken = null;
      requestContext.clientIp = aFreshIp();

      const response = await forgotPasswordRoute(jsonRequest({ email: aUniqueEmail() }));

      expect(response.status).toBe(403);
    });

    it('edge case: the email bucket is keyed, so the counter table holds no address', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email }));

      const rows = await prisma.rateLimitCounter.findMany({});

      const serialized = JSON.stringify(rows);

      expect(serialized).not.toContain(email);
      expect(serialized).not.toContain('@');
      // The IP bucket's key is the plaintext IP — an IP is not an account
      // attribute, so it reveals nothing about whether an account exists.
      expect(serialized).toContain('reset:ip:');
      expect(serialized).toContain('reset:email:');
    });

    it('edge case: the log line carries the keyed hash, never the address', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();

      await forgotPasswordRoute(jsonRequest({ email }));

      const lines = linesFor('password_reset.requested');

      expect(lines).toHaveLength(1);
      expect(JSON.stringify(lines)).not.toContain(email);
      expect(JSON.stringify(lines)).not.toContain('@');
    });
  });

  // ── Story 009 — completing the reset ──────────────────────────────────────

  describe('story 009 — resetting the password', () => {
    /**
     * The plaintext token for an account.
     *
     * The stack's token generator is deterministic for this suite, so the
     * plaintext the route mints is known to the test — the same way a member
     * learns it, from the email.
     */
    function aTokenFor(): string {
      return issued.token;
    }

    it('criterion 1: a valid token replaces the password, and the member can sign in with it', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      const response = await resetPasswordRoute(
        jsonRequest({ token, newPassword: 'a brand new password 2' }),
      );

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({ status: 'password-reset-complete' });

      // The member can now sign in with the new password.
      requestContext.clientIp = aFreshIp();
      const login = await loginRoute(
        jsonRequest({ email, password: 'a brand new password 2' }),
      );

      expect(login.status).toBe(200);
    });

    it('criterion 1: the old password no longer works', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      await resetPasswordRoute(jsonRequest({ token, newPassword: 'a brand new password 2' }));

      requestContext.clientIp = aFreshIp();
      const login = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      expect(login.status).toBe(401);
    });

    it('criterion 1: the response never carries a session', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      const response = await resetPasswordRoute(
        jsonRequest({ token, newPassword: 'a brand new password 2' }),
      );

      // A reset does not sign the member in.
      expect(sessionCookieFrom(response)).toBeNull();
    });

    it('criterion 2: a token is single-use', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      const first = await resetPasswordRoute(
        jsonRequest({ token, newPassword: 'a brand new password 2' }),
      );

      await anAnonymousCsrfToken();
      const second = await resetPasswordRoute(
        jsonRequest({ token, newPassword: 'yet another password 3' }),
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(400);
    });

    it('criterion 2: the token is marked used', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      await resetPasswordRoute(jsonRequest({ token, newPassword: 'a brand new password 2' }));

      const row = await prisma.passwordResetToken.findFirst({ where: { accountId } });

      expect(row?.usedAt).toBeInstanceOf(Date);
    });

    it('criterion 3: the reset never changes the lifecycle status', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      await resetPasswordRoute(jsonRequest({ token, newPassword: 'a brand new password 2' }));

      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.status).toBe('Active');
    });

    it('criterion 4: an unknown token is refused', async () => {
      await anAnonymousCsrfToken();

      const response = await resetPasswordRoute(
        jsonRequest({ token: 'a-token-that-was-never-issued', newPassword: 'a new password 2' }),
      );

      expect(response.status).toBe(400);
    });

    it('criterion 4: every token refusal returns the same body', async () => {
      const bodies: string[] = [];

      // Absent.
      await anAnonymousCsrfToken();
      bodies.push(await (await resetPasswordRoute(jsonRequest({ newPassword: 'a new password 2' }))).text());

      // Unknown.
      await anAnonymousCsrfToken();
      bodies.push(
        await (
          await resetPasswordRoute(
            jsonRequest({ token: 'a-token-that-was-never-issued', newPassword: 'a new password 2' }),
          )
        ).text(),
      );

      expect(new Set(bodies).size).toBe(1);
    });

    it('criterion 4: the refusal message carries no token, account, or email', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);

      await anAnonymousCsrfToken();

      const response = await resetPasswordRoute(
        jsonRequest({ token: 'the-secret-token', newPassword: 'a new password 2' }),
      );

      const body = await response.text();

      expect(body).not.toContain('the-secret-token');
      expect(body).not.toContain(email);
      expect(body).not.toContain(accountId);
    });

    it('edge case: a password that fails the policy is refused, and the old password still works', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      const response = await resetPasswordRoute(
        jsonRequest({ token, newPassword: 'short' }),
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response)).field).toBe('newPassword');

      // The token was **not** consumed — nothing was written.
      const row = await prisma.passwordResetToken.findFirst({ where: { accountId } });
      expect(row?.usedAt).toBeNull();

      requestContext.clientIp = aFreshIp();
      const login = await loginRoute(jsonRequest({ email, password: PASSWORD }));
      expect(login.status).toBe(200);
    });

    it('edge case: an expired token is refused', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      // The token's window is closed.
      //
      // The database's CHECK constraint requires `expiresAt > createdAt`, so
      // both timestamps move back together — the window stays well-formed and
      // is simply in the past.
      await prisma.passwordResetToken.updateMany({
        where: { accountId },
        data: {
          createdAt: new Date(Date.now() - 7200 * 1000),
          expiresAt: new Date(Date.now() - 3600 * 1000),
        },
      });

      await anAnonymousCsrfToken();
      const response = await resetPasswordRoute(
        jsonRequest({ token, newPassword: 'a brand new password 2' }),
      );

      expect(response.status).toBe(400);
    });

    it('edge case: a request without a CSRF token is refused', async () => {
      requestContext.sessionToken = null;
      requestContext.csrfToken = null;

      const response = await resetPasswordRoute(
        jsonRequest({ token: 'a-token', newPassword: 'a new password 2' }),
      );

      expect(response.status).toBe(403);
    });

    it('edge case: the log line records the fact, never the token', async () => {
      await anAnonymousCsrfToken();

      await resetPasswordRoute(
        jsonRequest({ token: 'the-secret-token', newPassword: 'a new password 2' }),
      );

      const lines = linesFor('password_reset.completed');

      expect(lines).toHaveLength(1);
      expect(JSON.stringify(lines)).not.toContain('the-secret-token');
      // What is logged is the **fact** of the attempt.
      expect(lines[0]?.targetId).toBe('present');
    });

    it('criterion 3: the reset flow writes no audit record at all', async () => {
      // The reset flow writes **no** audit record. The reason is FR-51's:
      // the request is anonymous, FR-31 names no event for it, and a record
      // holding the address would disclose the very existence the reset flow
      // exists to conceal.
      //
      // The property is already **structural** — neither reset service takes
      // an `AuditWriter` — so this test locks it rather than discovering it.
      // A future change that added an audit dependency would be caught here.
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      // The registration itself writes a record, so the count is taken
      // **after** it, and the reset's contribution is measured against it.
      const before = await prisma.auditEvent.count();

      await anAnonymousCsrfToken();
      requestContext.clientIp = aFreshIp();
      await forgotPasswordRoute(jsonRequest({ email }));

      const token = aTokenFor();

      await anAnonymousCsrfToken();
      await resetPasswordRoute(jsonRequest({ token, newPassword: 'a brand new password 2' }));

      const after = await prisma.auditEvent.count();

      expect(after).toBe(before);

      // And no record anywhere names the account the reset touched.
      const records = await prisma.auditEvent.findMany({ where: { parentId: accountId } });
      const resetRecords = records.filter((record) =>
        (record.eventType ?? '').toLowerCase().includes('reset'),
      );

      expect(resetRecords).toHaveLength(0);
    });
  });

  // ── Story 004 — deactivation ──────────────────────────────────────────────

  describe('story 004 — deactivating an account', () => {
    it('criterion 1: deactivates the account', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const administrator = await anAdministrator();

      const response = await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({ status: 'deactivated', accountId });

      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.status).toBe('Deactivated');
      expect(row?.deactivatedAt).toBeInstanceOf(Date);

      expect(administrator.id).toBeTruthy();
    });

    it('criterion 2: revokes every active session', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      // Two sessions — two devices.
      await signIn(email);
      await signIn(email);

      expect(await prisma.session.count({ where: { accountId } })).toBe(2);

      await anAdministrator();

      await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      const rows = await prisma.session.findMany({ where: { accountId } });

      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
      expect(rows.every((row) => row.revocationReason === 'account_deactivated')).toBe(true);
    });

    it('criterion 3: preserves the account row and its history', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAdministrator();

      await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      // The row is **retained** — nothing is deleted.
      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row).not.toBeNull();
      expect(row?.email).toBe(email);
      expect(row?.createdAt).toBeInstanceOf(Date);

      // And the registration record is still on the trail.
      const trail = await prisma.auditEvent.findMany({ where: { parentId: accountId } });

      expect(trail.map((entry) => entry.eventType).sort()).toEqual([
        'account.deactivated',
        'registration.submitted',
      ]);
    });

    it('criterion 4: the deactivation is audit-recorded with the acting administrator', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const administrator = await anAdministrator();

      await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      const record = await prisma.auditEvent.findFirst({
        where: { parentId: accountId, eventType: 'account.deactivated' },
      });

      expect(record).not.toBeNull();
      expect(record?.actorId).toBe(administrator.id);
      expect(record?.actorRole).toBe('administrator');
      expect(record?.occurredAt).toBeInstanceOf(Date);
    });

    it('criterion 5: a deactivated account can no longer sign in', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAdministrator();

      await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      requestContext.sessionToken = null;
      requestContext.csrfToken = null;
      requestContext.clientIp = aFreshIp();

      const response = await loginRoute(jsonRequest({ email, password: PASSWORD }));

      expect(response.status).toBe(401);
    });

    it('criterion 6: refuses a caller who is not an administrator', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      // An **Active member** who is not an administrator.
      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(403);
      expect(await bodyOf(response)).toEqual({ error: 'You do not have access to this.' });

      // The account is untouched.
      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.status).toBe('Active');
    });

    it('edge case: an already-Deactivated account is an idempotent no-op, with no duplicate record', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAdministrator();

      const first = await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      const second = await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await second.text()).toBe(await first.text());

      // **Exactly one** deactivation record — the trail records what happened,
      // once.
      const records = await prisma.auditEvent.findMany({
        where: { parentId: accountId, eventType: 'account.deactivated' },
      });

      expect(records).toHaveLength(1);
    });

    it('edge case: an administrator may deactivate another administrator', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await makeAdministrator(accountId);

      await anAdministrator();

      const response = await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(200);

      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.status).toBe('Deactivated');
      // The flag is cleared, so no stale privilege survives.
      expect(row?.isAdministrator).toBe(false);
    });

    it('edge case: a request without a CSRF token is refused', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      await anAdministrator();
      requestContext.csrfToken = null;

      const response = await deactivateRoute(new Request('http://localhost/api'), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(403);
    });
  });

  // ── Story 010 — the member profile ────────────────────────────────────────

  describe('story 010 — editing the member profile', () => {
    it('criterion 1: changes the display name', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await profilePostRoute(jsonRequest({ displayName: 'Jane Smith' }));

      expect(response.status).toBe(200);
      expect((await bodyOf(response)).displayName).toBe('Jane Smith');

      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.displayName).toBe('Jane Smith');
    });

    it('criterion 2: changes the self-declared role', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await profilePostRoute(jsonRequest({ selfDeclaredRole: 'Employee' }));

      expect(response.status).toBe(200);

      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.selfDeclaredRole).toBe('Employee');
    });

    it('criterion 3: the email cannot be changed', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      // The body carries an `email` — and it is **ignored**, because the
      // request type has no such field.
      const response = await profilePostRoute(
        jsonRequest({ displayName: 'Jane Smith', email: 'attacker@example.org' }),
      );

      expect(response.status).toBe(200);
      expect((await bodyOf(response)).email).toBe(email);

      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.email).toBe(email);
    });

    it('criterion 3: the status and the administrator flag cannot be changed', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      await profilePostRoute(
        jsonRequest({ displayName: 'Jane Smith', status: 'Deactivated', isAdministrator: true }),
      );

      const row = await prisma.account.findUnique({ where: { id: accountId } });

      expect(row?.status).toBe('Active');
      expect(row?.isAdministrator).toBe(false);
    });

    it('criterion 4: the edit is audit-recorded with the changed fields and the previous values', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      await profilePostRoute(jsonRequest({ displayName: 'Jane Smith' }));

      const record = await prisma.auditEvent.findFirst({
        where: { parentId: accountId, eventType: 'member_profile.edited' },
      });

      expect(record).not.toBeNull();
      // A **non-numbered** record — FR-52 introduces no new event number.
      expect(record?.eventNumber).toBeNull();
      expect(record?.actorId).toBe(accountId);
      expect(record?.actorRole).toBe('member');
      expect(record?.metadata).toMatchObject({
        changedFields: ['displayName'],
        previousValues: { displayName: 'Jane Doe' },
      });
    });

    it('criterion 5: the GET returns the editable fields and the read-only email', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      await activate(await accountFor(email));

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await profileGetRoute();

      expect(response.status).toBe(200);
      expect(await bodyOf(response)).toEqual({
        displayName: 'Jane Doe',
        email,
        selfDeclaredRole: 'Student',
        selfDeclaredRoleOther: null,
        status: 'Active',
      });
    });

    it('criterion 6: refuses a caller with no session', async () => {
      requestContext.sessionToken = null;
      requestContext.csrfToken = null;

      const get = await profileGetRoute();
      const post = await profilePostRoute(jsonRequest({ displayName: 'Jane Smith' }));

      expect(get.status).toBe(401);
      expect(post.status).toBe(401);
    });

    it('criterion 6: refuses a non-Active account', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);

      // A `Pending` account — the registration's own state.
      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const get = await profileGetRoute();
      const post = await profilePostRoute(jsonRequest({ displayName: 'Jane Smith' }));

      expect(get.status).toBe(403);
      expect(post.status).toBe(403);

      // The account is untouched.
      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.displayName).toBe('Jane Doe');
    });

    it('edge case: a no-op edit writes no audit record', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      const accountId = await accountFor(email);
      await activate(accountId);

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await profilePostRoute(jsonRequest({ displayName: 'Jane Doe' }));

      expect(response.status).toBe(200);

      const records = await prisma.auditEvent.findMany({
        where: { parentId: accountId, eventType: 'member_profile.edited' },
      });

      expect(records).toHaveLength(0);
    });

    it('edge case: a request without a CSRF token is refused', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });
      await activate(await accountFor(email));

      const token = await signIn(email);
      requestContext.sessionToken = token;
      requestContext.csrfToken = null;

      const response = await profilePostRoute(jsonRequest({ displayName: 'Jane Smith' }));

      expect(response.status).toBe(403);
    });
  });
});
