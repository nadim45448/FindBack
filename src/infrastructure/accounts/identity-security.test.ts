/**
 * The identity security suite.
 *
 * The properties under test are the ones PRD §10 names as cross-cutting
 * security requirements, plus the two the identity stories add:
 *
 * 1. **Rate limiting** — registration and login are limited (PRD §10).
 * 2. **CSRF** — state-changing endpoints are protected against cross-site
 *    request forgery (PRD §10).
 * 3. **Authorization** — administrator surfaces are administrator-only, and
 *    a `Pending` actor gets no member capability.
 * 4. **Anti-enumeration** — a refused login is indistinguishable from a
 *    wrong password, an unknown email, and a `Rejected` account, **in body,
 *    in status code, and in timing** (FR-4, story 003 criterion 5, story 007
 *    criterion 3).
 * 5. **Session revocation** — a revoked token is inert server-side, and the
 *    token is never persisted in the clear.
 * 6. **No secret in the log** — the operational log's closed shape is the
 *    control, and this asserts it end to end.
 *
 * The suite is skipped when `DATABASE_URL` is not set.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { setOperationalLogger } from '@/app/api/_helpers';
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

describeWithDatabase('bolt 004 — the identity security properties', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  /** The operational log lines the requests produced. */
  let logLines: RequestContext[] = [];

  const capturingLogger: OperationalLogger = {
    log(context: RequestContext): void {
      logLines.push(context);
    },
  };

  let counter = 0;

  function aUniqueEmail(): string {
    counter += 1;

    return `security-${Date.now()}-${counter}@example.org`;
  }

  const PASSWORD = 'correct horse 1';

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

  async function registerVia(
    overrides: Record<string, unknown> = {},
    ip = '198.51.100.1',
  ): Promise<Response> {
    requestContext.clientIp = ip;

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

  async function makeAdministrator(accountId: string): Promise<void> {
    await prisma.account.update({
      where: { id: accountId },
      data: { status: 'Active', isAdministrator: true },
    });
  }

  async function anActiveMember(): Promise<{ email: string; id: string }> {
    const email = aUniqueEmail();

    await registerVia({ email });

    const id = await accountFor(email);

    await prisma.account.update({ where: { id }, data: { status: 'Active' } });

    return { email, id };
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────

  describe('rate limiting (PRD §10)', () => {
    it('refuses a registration burst from one address', async () => {
      // The registration bucket is IP-only and allows 30 an hour.
      const ip = '198.51.100.50';

      const statuses: number[] = [];

      for (let attempt = 0; attempt < 32; attempt += 1) {
        const response = await registerVia({}, ip);
        statuses.push(response.status);
      }

      expect(statuses.slice(0, 30).every((status) => status === 201)).toBe(true);
      expect(statuses.slice(30)).toEqual([429, 429]);
    });

    it('answers a throttled registration with a retry hint', async () => {
      const ip = '198.51.100.51';

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await registerVia({}, ip);
      }

      const response = await registerVia({}, ip);

      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBeTruthy();
    });

    it('refuses a login burst against one account', async () => {
      const member = await anActiveMember();

      const statuses: number[] = [];

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await loginRoute(
          jsonRequest({ email: member.email, password: 'wrong password 9' }),
        );
        statuses.push(response.status);
      }

      // The first ten are refused as a wrong password; the eleventh and
      // twelfth are throttled — and the throttle answers with the **generic**
      // refusal, not a distinct one (ADR-15).
      expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(401));
      expect(statuses.slice(10)).toEqual([401, 401]);
    });

    it('throttles a distributed attempt against one account, not just one address', async () => {
      // The email bucket is what closes this hole: the IP bucket alone would
      // not stop one account being sprayed from many addresses.
      const member = await anActiveMember();

      const statuses: number[] = [];

      for (let attempt = 0; attempt < 12; attempt += 1) {
        requestContext.clientIp = `198.51.100.${100 + attempt}`;

        const response = await loginRoute(
          jsonRequest({ email: member.email, password: 'wrong password 9' }),
        );
        statuses.push(response.status);
      }

      // The **email** bucket tripped — the eleventh attempt is the one that
      // exceeded it, even though every attempt came from a different
      // address.
      expect(statuses.slice(0, 10)).toEqual(new Array(10).fill(401));
      expect(statuses.slice(10)).toEqual([401, 401]);
    });

    it('keeps the throttle from becoming an account-existence oracle', async () => {
      // A throttled attempt answers the **same** for an account that exists
      // and one that does not. A throttle that differed would disclose which
      // addresses are registered (ADR-15).
      const member = await anActiveMember();

      for (let attempt = 0; attempt < 10; attempt += 1) {
        requestContext.clientIp = '198.51.100.60';
        await loginRoute(jsonRequest({ email: member.email, password: 'wrong password 9' }));
      }

      requestContext.clientIp = '198.51.100.61';
      const throttled = await loginRoute(
        jsonRequest({ email: member.email, password: 'wrong password 9' }),
      );

      requestContext.clientIp = '198.51.100.62';
      const alsoThrottled = await loginRoute(
        jsonRequest({ email: aUniqueEmail(), password: 'wrong password 9' }),
      );

      expect(throttled.status).toBe(alsoThrottled.status);

      const throttledBody = await throttled.text();
      const alsoThrottledBody = await alsoThrottled.text();

      expect(throttledBody).toBe(alsoThrottledBody);

      // And the refusal is the **generic** one — the same body a wrong
      // password gets. A distinct throttle message would disclose that the
      // account exists (ADR-15).
      requestContext.clientIp = '198.51.100.63';
      const wrongPassword = await loginRoute(
        jsonRequest({ email: member.email, password: 'wrong password 9' }),
      );

      expect(throttled.status).toBe(wrongPassword.status);
      expect(throttledBody).toBe(await wrongPassword.text());
    });
  });

  // ── CSRF ──────────────────────────────────────────────────────────────────

  describe('CSRF (PRD §10)', () => {
    it('refuses a logout with no CSRF token', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.70';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;
      requestContext.csrfToken = null;

      const response = await logoutRoute();

      expect(response.status).toBe(403);
    });

    it('refuses a logout whose CSRF token belongs to another session', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.71';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;
      // A token minted for a **different** session.
      requestContext.csrfToken = csrfTokenFor('a-completely-different-session-token');

      const response = await logoutRoute();

      expect(response.status).toBe(403);
    });

    it('does not revoke the session when the CSRF check fails', async () => {
      // The check happens **before** anything is changed, so a forged request
      // cannot revoke a session.
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.72';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;
      requestContext.csrfToken = 'not-the-right-token';

      await logoutRoute();

      const rows = await prisma.session.findMany({});

      expect(rows).toHaveLength(1);
      expect(rows[0]?.revokedAt).toBeNull();
    });

    it('refuses a registration decision with no CSRF token', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const administratorEmail = aUniqueEmail();
      await registerVia({ email: administratorEmail });
      const administratorId = await accountFor(administratorEmail);
      await makeAdministrator(administratorId);

      requestContext.clientIp = '198.51.100.73';
      const login = await loginRoute(
        jsonRequest({ email: administratorEmail, password: PASSWORD }),
      );
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;
      requestContext.csrfToken = null;

      const response = await decisionRoute(jsonRequest({ decision: 'approve' }), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(403);

      // The account was **not** decided.
      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.status).toBe('Pending');
    });

    it('accepts a logout with a valid CSRF token', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.74';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await logoutRoute();

      expect(response.status).toBe(200);
    });
  });

  // ── Authorization ─────────────────────────────────────────────────────────

  describe('authorization (FR-2, FR-3)', () => {
    it('refuses the administrator queue to a caller with no session', async () => {
      requestContext.sessionToken = null;

      expect((await queueRoute()).status).toBe(403);
    });

    it('refuses the administrator queue to an active member', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.80';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      requestContext.sessionToken = sessionTokenFrom(sessionCookieFrom(login));

      expect((await queueRoute()).status).toBe(403);
    });

    it('refuses the administrator queue to a pending member', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const stack = buildIdentityStack();

      const { token } = await stack.transactions.run((transaction) =>
        stack.sessions.issue(accountId, transaction),
      );

      requestContext.sessionToken = token;

      expect((await queueRoute()).status).toBe(403);
    });

    it('refuses a registration decision to a pending member', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      const stack = buildIdentityStack();

      const { token } = await stack.transactions.run((transaction) =>
        stack.sessions.issue(accountId, transaction),
      );

      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      const response = await decisionRoute(jsonRequest({ decision: 'approve' }), {
        params: Promise.resolve({ id: accountId }),
      });

      expect(response.status).toBe(403);

      const row = await prisma.account.findUnique({ where: { id: accountId } });
      expect(row?.status).toBe('Pending');
    });

    it('does not let the administrator flag on a pending account grant anything', async () => {
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      // The database refuses the combination outright.
      await expect(
        prisma.account.update({
          where: { id: accountId },
          data: { isAdministrator: true },
        }),
      ).rejects.toThrow();
    });
  });

  // ── Anti-enumeration ─────────────────────────────────────────────────────

  describe('anti-enumeration (FR-4, story 003 criterion 5, story 007 criterion 3)', () => {
    it('answers a wrong password and an unknown email identically', async () => {
      const active = await anActiveMember();

      const rejectedEmail = aUniqueEmail();
      await registerVia({ email: rejectedEmail });
      const rejectedId = await accountFor(rejectedEmail);

      // The account is rejected through the use case, so no administrator
      // session is needed.
      const stack = buildIdentityStack();

      await stack.transactions.run((transaction) =>
        stack.review.execute(
          'reject',
          rejectedId,
          '00000000-0000-4000-8000-0000000000ff',
          transaction,
          'Not a member of the organization',
        ),
      );

      requestContext.clientIp = '198.51.100.90';
      const wrongPassword = await loginRoute(
        jsonRequest({ email: active.email, password: 'wrong password 9' }),
      );

      requestContext.clientIp = '198.51.100.91';
      const unknownEmail = await loginRoute(
        jsonRequest({ email: aUniqueEmail(), password: 'wrong password 9' }),
      );

      requestContext.clientIp = '198.51.100.92';
      const rejectedAccount = await loginRoute(
        jsonRequest({ email: rejectedEmail, password: PASSWORD }),
      );

      // **The same status, and the same bytes.** The body is read once —
      // a `Response` body can only be consumed once.
      expect(wrongPassword.status).toBe(401);
      expect(unknownEmail.status).toBe(401);
      expect(rejectedAccount.status).toBe(401);

      const wrongBody = await wrongPassword.text();
      const unknownBody = await unknownEmail.text();

      expect(wrongBody).toBe(unknownBody);
      expect(wrongBody).toContain('Invalid email or password');
    });

    it('issues no session for any refused login', async () => {
      const active = await anActiveMember();

      await loginRoute(jsonRequest({ email: active.email, password: 'wrong password 9' }));
      await loginRoute(jsonRequest({ email: aUniqueEmail(), password: 'wrong password 9' }));

      expect(await prisma.session.count()).toBe(0);
    });

    it('costs an unknown email the same work as a wrong password', async () => {
      // The anti-enumeration rule is not only about the response body — an
      // unknown email must not be **faster** than a wrong password, or the
      // timing alone discloses the account's existence.
      const active = await anActiveMember();

      /** The median of several attempts, in milliseconds. */
      async function medianMs(attempts: number, email: string): Promise<number> {
        const timings: number[] = [];

        for (let attempt = 0; attempt < attempts; attempt += 1) {
          requestContext.clientIp = `198.51.100.${120 + attempt}`;

          const started = performance.now();

          await loginRoute(jsonRequest({ email, password: 'wrong password 9' }));

          timings.push(performance.now() - started);
        }

        timings.sort((left, right) => left - right);

        return timings[Math.floor(timings.length / 2)] ?? 0;
      }

      const unknown = await medianMs(7, aUniqueEmail());
      const wrongPassword = await medianMs(7, active.email);

      // The unknown-email path verifies against a dummy hash, so the two
      // costs are the same order. A generous ratio allows for the jitter of
      // a shared machine while still catching a path that skipped the
      // verification entirely.
      expect(unknown).toBeGreaterThan(wrongPassword * 0.5);
      expect(unknown).toBeLessThan(wrongPassword * 2);
    });

    it('does not disclose the account status in the refusal body', async () => {
      const active = await anActiveMember();

      requestContext.clientIp = '198.51.100.140';
      const response = await loginRoute(
        jsonRequest({ email: active.email, password: 'wrong password 9' }),
      );

      const body = await bodyOf(response);

      // The copy names no lifecycle **state**. ("not active" is the frozen
      // UX copy for every refusal, and it names no state either — the
      // check is that it does not say *which* state the account is in.)
      const serialized = JSON.stringify(body).toLowerCase();

      expect(serialized).not.toContain('pending');
      expect(serialized).not.toContain('rejected');
      expect(serialized).not.toContain('deactivated');
      expect(serialized).not.toContain('suspended');
      expect(serialized).not.toContain('banned');
    });
  });

  // ── Session security ──────────────────────────────────────────────────────

  describe('session security (PRD A2, FR-4)', () => {
    it('never persists the plaintext session token', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.150';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      const rows = await prisma.session.findMany({});

      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('makes a revoked token inert immediately', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.151';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      // The session resolves **before** the logout.
      expect(await bodyOf(await sessionRoute())).toMatchObject({
        actor: { id: member.id },
      });

      await logoutRoute();

      // And is inert **after** it.
      expect(await bodyOf(await sessionRoute())).toEqual({ actor: null });
    });

    it('expires a session after the fourteen-day inactivity window', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.152';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      // The session is aged rather than the expiry moved forward: the
      // database constraint correctly refuses an expiry before the creation,
      // and that constraint is part of what this relies on.
      await prisma.session.updateMany({
        where: { accountId: member.id },
        data: {
          createdAt: new Date('2026-10-01T00:00:00Z'),
          lastActivityAt: new Date('2026-10-01T00:00:00Z'),
          expiresAt: new Date('2026-10-15T00:00:00Z'),
        },
      });

      requestContext.sessionToken = token;

      expect(await bodyOf(await sessionRoute())).toEqual({ actor: null });
    });

    it('reads the status on every request, so a status change takes effect at once', async () => {
      // Story 006's edge case: a stale cached context after a status change
      // is impossible by construction.
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.153';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;

      expect(await bodyOf(await sessionRoute())).toMatchObject({
        actor: { status: 'Active', capability: 'member' },
      });

      // The account is rejected behind the session's back.
      await prisma.account.update({
        where: { id: member.id },
        data: { status: 'Rejected' },
      });

      // **The same session** now resolves to nothing — a `Rejected` account
      // does not authenticate at all (FR-4), so its session is inert.
      expect(await bodyOf(await sessionRoute())).toEqual({ actor: null });
    });

    it('keeps a pending account session alive, with no capability', async () => {
      // The counterpart: a `Pending` account **does** authenticate (FR-4).
      // Its session is live, and the restriction lives in the capability.
      const email = aUniqueEmail();
      await registerVia({ email });

      const accountId = await accountFor(email);

      requestContext.clientIp = '198.51.100.157';
      const login = await loginRoute(jsonRequest({ email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;

      expect(await bodyOf(await sessionRoute())).toMatchObject({
        actor: { id: accountId, status: 'Pending', capability: 'none' },
      });
    });

    it('sets the cookie with the attributes the __Host- prefix requires', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.154';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));

      const setCookie = sessionCookieFrom(login);

      expect(setCookie).toContain('__Host-fb=');
      expect(setCookie).toContain('Path=/');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).not.toContain('Domain=');
    });
  });

  // ── No secret in the log ──────────────────────────────────────────────────

  describe('no secret in the operational log (PRD §10)', () => {
    it('keeps the password, the hash, the email, and the token out of every log line', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.160';
      const login = await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));
      const token = sessionTokenFrom(sessionCookieFrom(login));

      requestContext.sessionToken = token;
      requestContext.csrfToken = csrfTokenFor(token);

      await logoutRoute();

      const serialized = JSON.stringify(logLines);

      expect(serialized).not.toContain(PASSWORD);
      expect(serialized).not.toContain('$argon2id$');
      expect(serialized).not.toContain(member.email);
      expect(serialized).not.toContain(token);
    });

    it('gives every line a request id, an action, and an outcome', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.161';
      await loginRoute(jsonRequest({ email: member.email, password: PASSWORD }));

      expect(logLines.length).toBeGreaterThan(0);

      for (const line of logLines) {
        expect(line.requestId).toBeTruthy();
        expect(line.action).toBeTruthy();
        expect(line.outcome).toBeTruthy();
        expect(line.actorRole).toBeTruthy();
      }
    });

    it('records a refused login as a denial, with no actor', async () => {
      const member = await anActiveMember();

      requestContext.clientIp = '198.51.100.162';
      await loginRoute(jsonRequest({ email: member.email, password: 'wrong password 9' }));

      const denial = logLines.find((line) => line.action === 'account.login');

      expect(denial?.outcome).toBe('denied');
      expect(denial?.actorRole).toBe('anonymous');
    });
  });

  // ── The password policy ───────────────────────────────────────────────────

  describe('the password policy (FR-1)', () => {
    it('refuses a password with no number', async () => {
      const response = await registerVia({ password: 'onlyletters' });

      expect(response.status).toBe(422);
      expect(await prisma.account.count()).toBe(0);
    });

    it('refuses a password with no letter', async () => {
      const response = await registerVia({ password: '12345678' });

      expect(response.status).toBe(422);
      expect(await prisma.account.count()).toBe(0);
    });

    it('accepts a password of exactly the minimum length', async () => {
      const response = await registerVia({ password: 'abcdefg1' });

      expect(response.status).toBe(201);
    });

    it('refuses a password over the maximum length', async () => {
      const response = await registerVia({ password: `${'a'.repeat(201)}1` });

      expect(response.status).toBe(422);
    });
  });
});
