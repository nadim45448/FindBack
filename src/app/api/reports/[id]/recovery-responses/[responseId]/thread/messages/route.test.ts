/**
 * The `POST /api/reports/[id]/recovery-responses/[responseId]/thread/messages`
 * route's suite.
 *
 * **The route's own decisions are what is under test.** The participation
 * rule, the writability rule, and the service are covered by their own
 * suites; what lives *here* is the transport layer's part — the order the
 * checks run in, the status codes, the rate limit, and the shape of the
 * response.
 *
 * **The order is asserted, not just the outcome.** The CSRF check comes
 * after the authorisation and before the body is read — a request from
 * someone who may not post has no state to protect — and the rate limit
 * comes before the use case, because a limiter is a policy about traffic
 * and must not run after the expensive work.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, PermissionDeniedError, ValidationError } from '@/lib/errors';

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
let postOutcome: unknown = null;

/** The request the route handed to the use case. */
let receivedRequest: unknown = null;

/** Whether the use case was reached at all. */
let useCaseCalled = false;

/** The rate limiter's verdict. */
let rateAllowed = true;

/** The bucket key the route used. */
let rateKey: string | null = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: csrfValid }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    rateLimiter: {
      consume: async (key: string) => {
        rateKey = key;

        return rateAllowed
          ? { allowed: true, retryAfterSeconds: 0 }
          : { allowed: false, retryAfterSeconds: 120 };
      },
    },
    rateLimits: { threadMessageLimit: 30, threadMessageWindowSeconds: 3600 },
    recoveryResponseThreads: {
      postMessage: async (request: unknown) => {
        useCaseCalled = true;
        receivedRequest = request;

        if (postOutcome instanceof Error) {
          throw postOutcome;
        }

        return postOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const ACTOR_ID = '00000000-0000-4000-8000-000000000841';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The Lost report. */
const REPORT_ID = '00000000-0000-4000-8000-000000000842';

/** The response whose thread is written to. */
const RESPONSE_ID = '00000000-0000-4000-8000-000000000843';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID, responseId: RESPONSE_ID }) };

/** A post carrying a message body. */
function postRequest(body: unknown = { body: 'It is by the fountain.' }): Request {
  return new Request(
    `http://localhost/api/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/thread/messages`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
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

  postOutcome = {
    recoveryResponseId: RESPONSE_ID,
    message: {
      id: 'message-1',
      authorId: ACTOR_ID,
      authorDisplayName: 'A Responder',
      body: 'It is by the fountain.',
      postedAt: '2026-10-30T09:00:00.000Z',
    },
    eventId: 'an-event-id',
  };

  receivedRequest = null;
  useCaseCalled = false;
  rateAllowed = true;
  rateKey = null;
});

describe('the recovery response thread message route', () => {
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

    it('checks the CSRF token before it reads the body', async () => {
      csrfValid = false;

      // **A body that is not even JSON is not the point of failure** — the
      // CSRF check comes first, so a request from someone who may not post
      // has no state to protect.
      const response = await POST(
        new Request(
          `http://localhost/api/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/thread/messages`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' },
        ),
        CONTEXT,
      );

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('verified');
    });

    it('answers a stranger with a 403 and the generic message', async () => {
      postOutcome = new PermissionDeniedError('You do not have access to this.');

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
    });

    it('answers a read-only thread with a 409', async () => {
      // **The read-only refusal names the path forward,** so the member
      // knows what to do instead.
      postOutcome = new ConflictError(
        'This response is closed, so its thread is closed to new messages.',
      );

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('closed');
    });

    it('answers a body that breaks its bound with a 400 naming the field', async () => {
      postOutcome = new ValidationError('body', 'A message must be at most 2000 characters.');

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['field']).toBe('body');
    });

    it('answers a body with no message field with a 400', async () => {
      const response = await POST(postRequest({ notBody: 'nonsense' }), CONTEXT);

      expect(response.status).toBe(400);
      expect(useCaseCalled).toBe(false);
    });

    it('answers a body that is not a string with a 400', async () => {
      const response = await POST(postRequest({ body: 42 }), CONTEXT);

      expect(response.status).toBe(400);
      expect(useCaseCalled).toBe(false);
    });
  });

  describe('the rate limit', () => {
    it('answers a throttled request with a 429 and a retry hint', async () => {
      rateAllowed = false;

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('120');
      expect(useCaseCalled).toBe(false);
    });

    it('keys the bucket by member, not by IP', async () => {
      // **A campus NAT puts many members behind one address** — an IP bucket
      // would throttle one member because a hundred others had posted.
      await POST(postRequest(), CONTEXT);

      expect(rateKey).toBe(`recovery-response-thread:member:${ACTOR_ID}`);
    });

    it('uses its own bucket, not the Found side thread\'s', async () => {
      // **The two sides must not throttle one another.** A member's
      // Lost-side posts do not consume the Claim thread's allowance.
      await POST(postRequest(), CONTEXT);

      expect(rateKey).not.toBe(`thread-message:member:${ACTOR_ID}`);
    });
  });

  describe('the success answer', () => {
    it('returns the posted message', async () => {
      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(201);

      const body = await bodyOf(response);

      expect(body['id']).toBe('message-1');
      expect(body['recoveryResponseId']).toBe(RESPONSE_ID);
      expect(body['authorId']).toBe(ACTOR_ID);
      expect(body['authorDisplayName']).toBe('A Responder');
      expect(body['body']).toBe('It is by the fountain.');
      expect(body['postedAt']).toBe('2026-10-30T09:00:00.000Z');
    });

    it('carries no stored field', async () => {
      const response = await POST(postRequest(), CONTEXT);

      // **The response body is asserted key by key.** The where-found, the
      // observed identifying details, and the date found are FR-37 Sensitive
      // Fields, and the write path is not a place to hand them back.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'authorDisplayName',
        'authorId',
        'body',
        'id',
        'postedAt',
        'recoveryResponseId',
      ]);
    });
  });

  describe('what the route hands the use case', () => {
    it('passes the response id from the path and the actor from the session', async () => {
      await POST(postRequest(), CONTEXT);

      expect(receivedRequest).toEqual({
        responseId: RESPONSE_ID,
        actor: { actorId: ACTOR_ID, isAdministrator: false },
        body: 'It is by the fountain.',
      });
    });

    it('passes the administrator flag through', async () => {
      actor = { ...(actor as object), isAdministrator: true };

      await POST(postRequest(), CONTEXT);

      expect((receivedRequest as { actor: { isAdministrator: boolean } }).actor.isAdministrator).toBe(
        true,
      );
    });

    it('passes the message body through unchanged', async () => {
      // **The route does not trim and does not bound.** The domain owns the
      // body, and the route carries it as it was typed.
      await POST(postRequest({ body: '  It is by the fountain.  ' }), CONTEXT);

      expect((receivedRequest as { body: string }).body).toBe('  It is by the fountain.  ');
    });
  });
});
