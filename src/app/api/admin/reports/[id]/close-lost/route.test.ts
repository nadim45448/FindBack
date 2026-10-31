/**
 * The `POST /api/admin/reports/[id]/close-lost` route's suite.
 *
 * **The route's own decisions are what is under test.** The two closure
 * routes, the reason's bound, and the service are covered by their own
 * suites; what lives *here* is the transport layer's part — who may call it,
 * the order of the checks, the status codes, the messages, and the shape of
 * the response.
 *
 * **The order of the checks is asserted, not assumed.** The route refuses in
 * a fixed order — actor, CSRF, body, use case — and a route that checked the
 * body before the actor would leak a validation error to a caller who was
 * never allowed to ask.
 *
 * **The route does not choose the route.** The response carries the route
 * the *service* took, read from the report's own responses — there is no
 * field anywhere through which a client could assert that its close is
 * "ordinary".
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError, PermissionDeniedError, ValidationError } from '@/lib/errors';

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
let closeOutcome: unknown = null;

/** The request the route handed to the use case. */
let receivedRequest: unknown = null;

/** Whether the use case was reached at all. */
let useCaseReached = false;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: csrfValid }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    lostReportCloses: {
      close: async (request: unknown) => {
        receivedRequest = request;
        useCaseReached = true;

        if (closeOutcome instanceof Error) {
          throw closeOutcome;
        }

        return closeOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const ADMINISTRATOR_ID = '00000000-0000-4000-8000-000000000811';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The report being closed. */
const REPORT_ID = '00000000-0000-4000-8000-000000000813';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID }) };

/** The administrator's reason. */
const REASON = 'The owner could not be reached and the item is no longer circulating.';

/** A JSON request carrying the body the route reads. */
function jsonRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/reports/${REPORT_ID}/close-lost`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

  closeOutcome = {
    reportId: REPORT_ID,
    status: 'Closed',
    route: 'OrdinaryClosure',
    resolved: [
      { id: 'response-1', previousStatus: 'Submitted', status: 'Resolved — Report Closed' },
    ],
    eventId: 'an-event-id',
  };

  receivedRequest = null;
  useCaseReached = false;
});

// ── The refusals ────────────────────────────────────────────────────────────

describe('the close-lost route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 403', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a member who is not an administrator with a 403', async () => {
      // **Only an administrator may call this.** The actor is derived from
      // the session — never from the request body.
      actor = { ...(actor as object), isAdministrator: false };

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a body with no reason with a 400', async () => {
      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('reason');
    });

    it('refuses a reason that is not a string with a 400', async () => {
      const response = await POST(jsonRequest({ reason: 42 }), CONTEXT);

      expect(response.status).toBe(400);
    });

    it('refuses a body that is not JSON with a 400', async () => {
      const request = new Request(
        `http://localhost/api/admin/reports/${REPORT_ID}/close-lost`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not json',
        },
      );

      const response = await POST(request, CONTEXT);

      expect(response.status).toBe(400);
    });
  });

  // ── The order of the checks ───────────────────────────────────────────────

  describe('the order of the checks', () => {
    it('checks the actor before the CSRF token', async () => {
      // **The actor comes first.** A caller who is not an administrator learns
      // nothing about the request's validity — not even whether their CSRF
      // token was good.
      actor = { ...(actor as object), isAdministrator: false };
      csrfValid = false;

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
      expect(useCaseReached).toBe(false);
    });

    it('checks the CSRF token before the body', async () => {
      // **A body is not parsed for a request that failed the CSRF check.**
      csrfValid = false;

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('Your request could not be verified.');
      expect(useCaseReached).toBe(false);
    });

    it('checks the body before the use case', async () => {
      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(400);
      expect(useCaseReached).toBe(false);
    });

    it('never reaches the use case when the actor is refused', async () => {
      actor = { ...(actor as object), isAdministrator: false };

      await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(useCaseReached).toBe(false);
      expect(receivedRequest).toBeNull();
    });
  });

  // ── The permission and conflict answers ───────────────────────────────────

  describe('the permission and conflict answers', () => {
    it('answers a permission failure with a 403', async () => {
      closeOutcome = new PermissionDeniedError('You do not have access to this.');

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('answers a report that does not exist with a 404', async () => {
      closeOutcome = new NotFoundError('No report with that id.');

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(404);
      expect((await bodyOf(response))['error']).toBe('No report with that id.');
    });

    it('answers a terminal report with a 409', async () => {
      closeOutcome = new ConflictError(
        'This report is closed or returned, so it cannot be closed again.',
      );

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(409);
    });

    it('answers a lost race with a 409', async () => {
      closeOutcome = new ConflictError('This report was already closed by someone else.');

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(409);
    });

    it('answers a field rule failure with a 400 that names the field', async () => {
      closeOutcome = new ValidationError('reason', 'The reason is too short.');

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['field']).toBe('reason');
    });
  });

  // ── The success answer ────────────────────────────────────────────────────

  describe('the success answer', () => {
    it('returns the report, its status, the route, and the resolved count', async () => {
      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['id']).toBe(REPORT_ID);
      expect(body['status']).toBe('Closed');
      expect(body['route']).toBe('OrdinaryClosure');
      expect(body['resolvedCount']).toBe(1);
    });

    it('reports the exceptional route when the service took it', async () => {
      // **The route does not choose the route.** It reports the one the
      // service took, read from the report's own responses.
      closeOutcome = {
        reportId: REPORT_ID,
        status: 'Closed',
        route: 'ExceptionalCancellation',
        resolved: [],
        eventId: 'an-event-id',
      };

      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      const body = await bodyOf(response);

      expect(body['route']).toBe('ExceptionalCancellation');
      expect(body['resolvedCount']).toBe(0);
    });

    it('carries no Sensitive Field', async () => {
      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      // **The response body is asserted key by key.** The exact place and the
      // observed identifying details are FR-37 Sensitive Fields.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'id',
        'resolvedCount',
        'route',
        'status',
      ]);
    });
  });

  // ── What the route hands the use case ─────────────────────────────────────

  describe('what the route hands the use case', () => {
    it('takes the actor from the session, never from the body', async () => {
      // **The actor is server-derived.** A body carrying an actor — or an
      // administrator flag — is ignored.
      await POST(jsonRequest({ reason: REASON, isAdministrator: false, actorId: 'someone' }), CONTEXT);

      expect(receivedRequest).toEqual({
        reportId: REPORT_ID,
        actor: { actorId: ADMINISTRATOR_ID, isAdministrator: true },
        reason: REASON,
      });
    });

    it('passes the reason through verbatim', async () => {
      await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect((receivedRequest as { reason: string }).reason).toBe(REASON);
    });

    it('carries no route flag to the use case', async () => {
      // **The client cannot choose which audit event its report receives.**
      // The route chooses the route from the report's own responses, so
      // there is no field for a client to assert one.
      await POST(jsonRequest({ reason: REASON, route: 'OrdinaryClosure' }), CONTEXT);

      expect(Object.keys(receivedRequest as object).sort()).toEqual([
        'actor',
        'reason',
        'reportId',
      ]);
    });
  });
});
