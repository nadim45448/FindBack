/**
 * The `POST /api/admin/reports/[id]/recovery-responses/[responseId]/determine`
 * route's suite.
 *
 * **The route's own decisions are what is under test.** The determination
 * rule and the service are covered by their own suites; what lives *here* is
 * the transport layer's part — who may call it, the status codes, the
 * messages, and the shape of the response.
 *
 * **The load-bearing assertion is about the two actors.** The route resolves
 * the *recorder* from the session and reads the *maker* from the body, and
 * the two must never be confused — a route that read the recorder from the
 * body would let a client assert its own role.
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
let recordOutcome: unknown = null;

/** The request the route handed to the use case. */
let receivedRequest: unknown = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: csrfValid }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    recoveryResponseDeterminations: {
      record: async (request: unknown) => {
        receivedRequest = request;

        if (recordOutcome instanceof Error) {
          throw recordOutcome;
        }

        return recordOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const ADMINISTRATOR_ID = '00000000-0000-4000-8000-000000000781';
const OWNER_ID = '00000000-0000-4000-8000-000000000782';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The Lost report. */
const REPORT_ID = '00000000-0000-4000-8000-000000000783';

/** The response being determined. */
const RESPONSE_ID = '00000000-0000-4000-8000-000000000784';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID, responseId: RESPONSE_ID }) };

/** A JSON request carrying the two fields the route reads. */
function jsonRequest(body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/admin/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/determine`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

/** A body naming a confirmed match. */
function aBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { outcome: 'match_confirmed', determinedByUserId: OWNER_ID, ...extra };
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
    actorId: ADMINISTRATOR_ID,
    status: 'Active',
    isAdministrator: true,
    displayName: 'The Administrator',
    capability: 'member',
  };

  csrfValid = true;

  recordOutcome = {
    responseId: RESPONSE_ID,
    status: 'Match Confirmed',
    reportStatus: 'Verification Pending',
    eventId: 'an-event-id',
  };

  receivedRequest = null;
});

describe('the determination route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 403', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a member who is not an administrator with a 403', async () => {
      // **Only an administrator may call this.** The actor is derived from
      // the session — never from the request body.
      actor = { ...(actor as object), isAdministrator: false };

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a body with no outcome with a 400', async () => {
      const response = await POST(jsonRequest({ determinedByUserId: OWNER_ID }), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('outcome');
    });

    it('refuses an outcome outside the two the PRD names with a 400', async () => {
      // **A third outcome is a malformed request rather than a default.** A
      // determination that silently became `not_a_match` would close the
      // owner's search without the owner having said so.
      const response = await POST(jsonRequest(aBody({ outcome: 'maybe' })), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('outcome');
    });

    it('refuses a maker that is not a UUID with a 400', async () => {
      const response = await POST(jsonRequest(aBody({ determinedByUserId: 'owner-1' })), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('determinedByUserId');
    });

    it('refuses a path id that is not a UUID with a 400', async () => {
      const response = await POST(jsonRequest(aBody()), {
        params: Promise.resolve({ id: 'not-a-uuid', responseId: RESPONSE_ID }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('the permission and conflict answers', () => {
    it('answers a maker who is not the owner with a 403 and the domain’s own message', async () => {
      recordOutcome = new PermissionDeniedError(
        'Only the owner of this report can determine whether the item is theirs.',
      );

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('owner');
    });

    it('answers a response that is not awaiting determination with a 409', async () => {
      recordOutcome = new ConflictError(
        'This response is not awaiting verification, so no determination can be recorded.',
      );

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('not awaiting');
    });
  });

  describe('the success answer', () => {
    it('returns the response, its status, the report’s status, and the event id', async () => {
      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['id']).toBe(RESPONSE_ID);
      expect(body['status']).toBe('Match Confirmed');
      expect(body['reportStatus']).toBe('Verification Pending');
      expect(body['eventId']).toBe('an-event-id');
    });

    it('carries no stored field', async () => {
      const response = await POST(jsonRequest(aBody()), CONTEXT);

      // **The response body is asserted key by key.** The exact place and the
      // observed identifying details are FR-37 Sensitive Fields, and the
      // write path is not a place to hand them back.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'eventId',
        'id',
        'reportStatus',
        'status',
      ]);
    });
  });

  describe('what the route hands the use case', () => {
    it('takes the recorder from the session and the maker from the body', async () => {
      // **The two actors are never confused.** The recorder is
      // server-derived; the maker is the owner's, and the service checks it
      // against the report's owner read from the database.
      await POST(jsonRequest(aBody()), CONTEXT);

      expect(receivedRequest).toEqual({
        reportId: REPORT_ID,
        responseId: RESPONSE_ID,
        determinedByUserId: OWNER_ID,
        outcome: 'match_confirmed',
        actor: { actorId: ADMINISTRATOR_ID, isAdministrator: true },
      });
    });

    it('passes a missing determination through as null rather than defaulting', async () => {
      // **A recording with no maker is refused by the service,** not
      // silently given a maker by the route.
      await POST(jsonRequest({ outcome: 'match_confirmed' }), CONTEXT);

      expect((receivedRequest as { determinedByUserId: string | null }).determinedByUserId).toBeNull();
    });

    it('passes a not-a-match outcome through unchanged', async () => {
      await POST(jsonRequest(aBody({ outcome: 'not_a_match' })), CONTEXT);

      expect((receivedRequest as { outcome: string }).outcome).toBe('not_a_match');
    });
  });
});
