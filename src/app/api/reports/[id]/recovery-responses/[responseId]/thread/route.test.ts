/**
 * The `GET /api/reports/[id]/recovery-responses/[responseId]/thread` route's
 * suite.
 *
 * **The route's own decisions are what is under test.** The participation
 * rule, the writability rule, and the service are covered by their own
 * suites; what lives *here* is the transport layer's part — the order the
 * checks run in, the status codes, and the shape of the response.
 *
 * **The route is driven through its real seams.** `next/headers` is mocked
 * (it needs a request scope), and the identity composition root is mocked so
 * the route's own logic — the refusals and the status codes — is what runs.
 *
 * **The response body is asserted key by key.** The thread never carries a
 * Sensitive Field, and a response that gained one would be a leak that no
 * individual assertion would have caught.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { PermissionDeniedError } from '@/lib/errors';

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

/** The use case's outcome, or the error it throws. */
let readOutcome: unknown = null;

/** The request the route handed to the use case. */
let receivedRequest: unknown = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: true }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    recoveryResponseThreads: {
      readThread: async (request: unknown) => {
        receivedRequest = request;

        if (readOutcome instanceof Error) {
          throw readOutcome;
        }

        return readOutcome;
      },
    },
  }),
}));

const { GET } = await import('./route');

const ACTOR_ID = '00000000-0000-4000-8000-000000000831';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The Lost report. */
const REPORT_ID = '00000000-0000-4000-8000-000000000832';

/** The response whose thread is read. */
const RESPONSE_ID = '00000000-0000-4000-8000-000000000833';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID, responseId: RESPONSE_ID }) };

/** A read request. */
function getRequest(): Request {
  return new Request(
    `http://localhost/api/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/thread`,
    { method: 'GET' },
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

  readOutcome = {
    recoveryResponseId: RESPONSE_ID,
    participation: 'Responder',
    messages: [],
    writable: true,
    readOnlyReason: null,
  };

  receivedRequest = null;
});

describe('the recovery response thread read route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 401', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).toBe(401);
    });

    it('answers a stranger with a 403 and the generic message', async () => {
      readOutcome = new PermissionDeniedError('You do not have access to this.');

      const response = await GET(getRequest(), CONTEXT);

      // **The generic message says nothing about whether the Response
      // exists** — which is exactly right, because the Response's existence
      // is a private fact about another member's assertion.
      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
    });

    it('answers a missing response with a 403, not a 404', async () => {
      readOutcome = new PermissionDeniedError('You do not have access to this.');

      const response = await GET(getRequest(), CONTEXT);

      // **A 404 would answer the question "is this response real?"** — and
      // that question is not a stranger's business.
      expect(response.status).toBe(403);
    });
  });

  describe('the success answer', () => {
    it('returns the thread, its messages, and the viewer\'s relationship to it', async () => {
      readOutcome = {
        recoveryResponseId: RESPONSE_ID,
        participation: 'LostReportOwner',
        messages: [
          {
            id: 'message-1',
            authorId: ACTOR_ID,
            authorDisplayName: 'A Responder',
            body: 'Is it still by the library?',
            postedAt: '2026-10-30T09:00:00.000Z',
          },
        ],
        writable: true,
        readOnlyReason: null,
      };

      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['recoveryResponseId']).toBe(RESPONSE_ID);
      expect(body['participation']).toBe('LostReportOwner');
      expect(body['writable']).toBe(true);
      expect(body['readOnlyReason']).toBeNull();
      expect(body['messages']).toEqual([
        {
          id: 'message-1',
          authorId: ACTOR_ID,
          authorDisplayName: 'A Responder',
          body: 'Is it still by the library?',
          postedAt: '2026-10-30T09:00:00.000Z',
        },
      ]);
    });

    it('reports a locked thread as read-only and says why', async () => {
      readOutcome = {
        recoveryResponseId: RESPONSE_ID,
        participation: 'Responder',
        messages: [],
        writable: false,
        readOnlyReason: 'ResponseEnded',
      };

      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['writable']).toBe(false);
      expect(body['readOnlyReason']).toBe('ResponseEnded');
    });

    it('still returns a locked thread\'s full history', async () => {
      // **Read-only is not empty.** A locked thread keeps its full history,
      // and the messages are never deleted.
      readOutcome = {
        recoveryResponseId: RESPONSE_ID,
        participation: 'Responder',
        messages: [
          {
            id: 'message-1',
            authorId: ACTOR_ID,
            authorDisplayName: 'A Responder',
            body: 'It is by the fountain.',
            postedAt: '2026-10-30T09:00:00.000Z',
          },
        ],
        writable: false,
        readOnlyReason: 'ReportEnded',
      };

      const response = await GET(getRequest(), CONTEXT);

      const body = await bodyOf(response);

      expect(body['writable']).toBe(false);
      expect((body['messages'] as unknown[]).length).toBe(1);
    });

    it('carries no stored field', async () => {
      const response = await GET(getRequest(), CONTEXT);

      // **The response body is asserted key by key.** The where-found, the
      // observed identifying details, and the date found are FR-37 Sensitive
      // Fields — and participation in a thread is never permission to see
      // them.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'messages',
        'participation',
        'readOnlyReason',
        'recoveryResponseId',
        'writable',
      ]);
    });

    it('carries no sensitive field in a message', async () => {
      readOutcome = {
        recoveryResponseId: RESPONSE_ID,
        participation: 'Responder',
        messages: [
          {
            id: 'message-1',
            authorId: ACTOR_ID,
            authorDisplayName: 'A Responder',
            body: 'It is by the fountain.',
            postedAt: '2026-10-30T09:00:00.000Z',
          },
        ],
        writable: true,
        readOnlyReason: null,
      };

      const response = await GET(getRequest(), CONTEXT);

      const message = (await bodyOf(response))['messages'] as Record<string, unknown>[];

      // **The message carries exactly the five facts a client needs** to
      // append it to its own view of the thread.
      expect(Object.keys(message[0]!).sort()).toEqual([
        'authorDisplayName',
        'authorId',
        'body',
        'id',
        'postedAt',
      ]);
    });
  });

  describe('what the route hands the use case', () => {
    it('passes the response id from the path and the actor from the session', async () => {
      await GET(getRequest(), CONTEXT);

      expect(receivedRequest).toEqual({
        responseId: RESPONSE_ID,
        actor: { actorId: ACTOR_ID, isAdministrator: false },
      });
    });

    it('passes the administrator flag through', async () => {
      actor = { ...(actor as object), isAdministrator: true };

      await GET(getRequest(), CONTEXT);

      expect((receivedRequest as { actor: { isAdministrator: boolean } }).actor.isAdministrator).toBe(
        true,
      );
    });

    it('takes the response id from the path, and not from the report id', async () => {
      // **The report id in the path is not read.** The thread is addressed
      // by its Response alone, and a client cannot point it at another
      // report's thread by changing one id in the URL.
      const response = await GET(getRequest(), {
        params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000839', responseId: RESPONSE_ID }),
      });

      expect(response.status).toBe(200);
      expect((receivedRequest as { responseId: string }).responseId).toBe(RESPONSE_ID);
    });
  });
});
