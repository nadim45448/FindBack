/**
 * The `POST /api/reports/[id]/recovery-responses/[responseId]/withdraw`
 * route's suite.
 *
 * **The route's own decisions are what is under test.** The responder-only
 * rule, the `Submitted`-only rule, and the conditional write are covered by
 * the service's suite; what lives *here* is the transport layer's part — the
 * order the checks run in, the status codes, and the shape of the response.
 *
 * **The body is not read at all.** A withdrawal names one response, and the
 * response's id is in the URL — so there is no body for a client to
 * redirect.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, PermissionDeniedError } from '@/lib/errors';

// ── The request scope ───────────────────────────────────────────────────────

const cookieJar = new Map<string, string>();
const headerJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);

      return value === undefined ? undefined : { name, value };
    },
  }),
  headers: async () => ({
    get: (name: string) => headerJar.get(name) ?? null,
  }),
}));

// ── The composition roots ───────────────────────────────────────────────────

/** The actor the resolver returns. */
let actor: unknown = null;

/** The CSRF verdict. */
let csrfValid = true;

/** The use case's outcome, or the error it throws. */
let withdrawOutcome: unknown = null;

/** The request the route handed to the use case. */
let receivedRequest: unknown = null;

/** Whether the use case was reached at all. */
let useCaseCalled = false;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: csrfValid }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    recoveryResponseWithdrawals: {
      withdraw: async (request: unknown) => {
        useCaseCalled = true;
        receivedRequest = request;

        if (withdrawOutcome instanceof Error) {
          throw withdrawOutcome;
        }

        return withdrawOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const ACTOR_ID = '00000000-0000-4000-8000-000000000851';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The Lost report. */
const REPORT_ID = '00000000-0000-4000-8000-000000000852';

/** The response being withdrawn. */
const RESPONSE_ID = '00000000-0000-4000-8000-000000000853';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID, responseId: RESPONSE_ID }) };

/** A post carrying no body — the route reads none. */
function postRequest(): Request {
  return new Request(
    `http://localhost/api/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/withdraw`,
    { method: 'POST' },
  );
}

/** The response's body, read once. */
async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

afterEach(() => {
  cookieJar.clear();
  headerJar.clear();

  cookieJar.set(SESSION_COOKIE, SESSION_TOKEN);

  actor = {
    actorId: ACTOR_ID,
    status: 'Active',
    isAdministrator: false,
    displayName: 'A Responder',
    capability: 'member',
  };

  csrfValid = true;

  withdrawOutcome = {
    responseId: RESPONSE_ID,
    status: 'Withdrawn',
    eventId: 'an-event-id',
  };

  receivedRequest = null;
  useCaseCalled = false;
});

describe('the recovery response withdrawal route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 401', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(401);
      expect(useCaseCalled).toBe(false);
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(403);
      expect(useCaseCalled).toBe(false);
    });

    it('answers a non-responder with a 403', async () => {
      withdrawOutcome = new PermissionDeniedError(
        'Only the member who made this response can withdraw it.',
      );

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('made this response');
    });

    it('answers a deactivated account with a 403', async () => {
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      // **The refusal is the service's, not the route's.** The route carries
      // the account's capability across — **FR-5 preserves the response; it
      // does not stop the account from acting** — and the service decides
      // what a deactivated responder may do.
      withdrawOutcome = new PermissionDeniedError(
        'Your account is not active, so you cannot withdraw this response.',
      );

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('not active');
    });

    it('answers a response that may no longer be withdrawn with a 409', async () => {
      withdrawOutcome = new ConflictError(
        'This response is being reviewed, so it can no longer be withdrawn.',
      );

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('reviewed');
    });
  });

  describe('the success answer', () => {
    it('returns the response and the status it reached', async () => {
      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['id']).toBe(RESPONSE_ID);
      expect(body['status']).toBe('Withdrawn');
    });

    it('carries no stored field', async () => {
      const response = await POST(postRequest(), CONTEXT);

      // **The response body is asserted key by key.** The where-found, the
      // observed identifying details, and the date found are FR-37 Sensitive
      // Fields — and the write path is not a place to hand them back.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual(['id', 'status']);
    });
  });

  describe('what the route hands the use case', () => {
    it('passes the response id from the path and the actor from the session', async () => {
      await POST(postRequest(), CONTEXT);

      expect(receivedRequest).toEqual({
        responseId: RESPONSE_ID,
        actor: { actorId: ACTOR_ID, isAccountActive: true },
      });
    });

    it('reports a deactivated account as not active', async () => {
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      await POST(postRequest(), CONTEXT);

      expect((receivedRequest as { actor: { isAccountActive: boolean } }).actor.isAccountActive).toBe(
        false,
      );
    });

    it('never reads the body', async () => {
      // **The body is not read at all.** A withdrawal names one response,
      // and the response's id is in the URL — so a client cannot redirect
      // the withdrawal at another response by putting a different id in a
      // body.
      const response = await POST(
        new Request(
          `http://localhost/api/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/withdraw`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ responseId: 'another-response' }),
          },
        ),
        CONTEXT,
      );

      expect(response.status).toBe(200);
      expect((receivedRequest as { responseId: string }).responseId).toBe(RESPONSE_ID);
    });
  });
});
