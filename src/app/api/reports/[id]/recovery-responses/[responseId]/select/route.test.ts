/**
 * The `POST /api/reports/[id]/recovery-responses/[responseId]/select` route's
 * suite.
 *
 * **The route's own decisions are what is under test.** The selection rule,
 * the value objects, and the service are covered by their own suites; what
 * lives *here* is the transport layer's part — the order the checks run in,
 * the status codes, the messages, and the shape of the response.
 *
 * **The route is driven through its real seams.** `next/headers` is mocked
 * (it needs a request scope), and the two composition roots are mocked so
 * the route's own logic — the refusals, the status codes, and the response
 * shape — is what runs.
 *
 * **Both ids come from the path.** The body is never read, so a client
 * cannot redirect the selection at another report.
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
let selectOutcome: unknown = null;

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
    recoveryResponseSelections: {
      select: async (request: unknown) => {
        receivedRequest = request;

        if (selectOutcome instanceof Error) {
          throw selectOutcome;
        }

        return selectOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const ACTOR_ID = '00000000-0000-4000-8000-000000000771';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The Lost report. */
const REPORT_ID = '00000000-0000-4000-8000-000000000772';

/** The response being selected. */
const RESPONSE_ID = '00000000-0000-4000-8000-000000000773';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID, responseId: RESPONSE_ID }) };

/** A request with no body — the route reads none. */
function postRequest(): Request {
  return new Request(
    `http://localhost/api/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/select`,
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
    displayName: 'The Owner',
    capability: 'member',
  };

  csrfValid = true;

  selectOutcome = {
    responseId: RESPONSE_ID,
    status: 'Selected for Verification',
    reportStatus: 'Verification Pending',
    eventId: 'an-event-id',
    changed: true,
  };

  receivedRequest = null;
});

describe('the selection route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 401', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(401);
    });

    it('refuses a Pending account with a 403 and a specific message', async () => {
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('active');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a path id that is not a UUID with a 400', async () => {
      const response = await POST(postRequest(), {
        params: Promise.resolve({ id: 'not-a-uuid', responseId: RESPONSE_ID }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('the permission and conflict answers', () => {
    it('answers a non-owner with a 403 and the domain’s own message', async () => {
      // **The shared helper's generic answer is wrong here.** A member who
      // is not the owner has a different thing to do next than a member
      // whose report is not open.
      selectOutcome = new PermissionDeniedError(
        'Only the owner of this report can select a response for verification.',
      );

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('owner');
    });

    it('answers a state conflict with a 409', async () => {
      selectOutcome = new ConflictError('This report is not open.');

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('not open');
    });
  });

  describe('the success answer', () => {
    it('returns the response, its status, the report’s status, and whether anything was written', async () => {
      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['id']).toBe(RESPONSE_ID);
      expect(body['status']).toBe('Selected for Verification');
      expect(body['reportStatus']).toBe('Verification Pending');
      expect(body['changed']).toBe(true);
    });

    it('reports the idempotent no-op as unchanged', async () => {
      selectOutcome = {
        responseId: RESPONSE_ID,
        status: 'Selected for Verification',
        reportStatus: 'Verification Pending',
        eventId: '',
        changed: false,
      };

      const response = await POST(postRequest(), CONTEXT);

      expect(response.status).toBe(200);
      expect((await bodyOf(response))['changed']).toBe(false);
    });

    it('carries no stored field', async () => {
      const response = await POST(postRequest(), CONTEXT);

      // **The response body is asserted key by key.** The exact place, the
      // observed identifying details, and the image are FR-37 Sensitive
      // Fields, and the write path is not a place to hand them back.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'changed',
        'id',
        'reportStatus',
        'status',
      ]);
    });
  });

  describe('what the route hands the use case', () => {
    it('passes both ids from the path and the actor from the session', async () => {
      await POST(postRequest(), CONTEXT);

      expect(receivedRequest).toEqual({
        reportId: REPORT_ID,
        responseId: RESPONSE_ID,
        actor: { actorId: ACTOR_ID, isAccountActive: true },
      });
    });

    it('never reads the body', async () => {
      // **The body is not read at all.** A selection names a report and a
      // response, and both are in the URL — so a client cannot redirect the
      // selection by putting a different id in a body.
      const response = await POST(
        new Request(
          `http://localhost/api/reports/${REPORT_ID}/recovery-responses/${RESPONSE_ID}/select`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reportId: 'another-report', responseId: 'another-response' }),
          },
        ),
        CONTEXT,
      );

      expect(response.status).toBe(200);
      expect((receivedRequest as { reportId: string }).reportId).toBe(REPORT_ID);
      expect((receivedRequest as { responseId: string }).responseId).toBe(RESPONSE_ID);
    });
  });
});
