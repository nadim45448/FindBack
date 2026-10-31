/**
 * The `POST /api/admin/reports/[id]/remove-content` route's suite.
 *
 * **The route's own decisions are what is under test.** The removal's
 * idempotence rule, the reason's bound, and the service are covered by their
 * own suites; what lives *here* is the transport layer's part — who may call
 * it, the order of the checks, the status codes, the messages, and the shape
 * of the response.
 *
 * **The target's shape is checked here.** The kind is a closed set and the
 * id is required, so a body carrying neither is a malformed request — and the
 * route refuses it before the use case runs.
 *
 * **The route is separate from the close.** A removal withholds content; it
 * does not close the report, and there is no field through which a client
 * could ask for both.
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
let removeOutcome: unknown = null;

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
    contentRemovals: {
      remove: async (request: unknown) => {
        receivedRequest = request;
        useCaseReached = true;

        if (removeOutcome instanceof Error) {
          throw removeOutcome;
        }

        return removeOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const ADMINISTRATOR_ID = '00000000-0000-4000-8000-000000000821';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The report the content belongs to. */
const REPORT_ID = '00000000-0000-4000-8000-000000000823';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID }) };

/** The administrator's reason. */
const REASON = 'The photograph shows another person and must be taken down.';

/** The target being removed. */
const TARGET = { kind: 'report_image', targetId: 'image-1' };

/** A JSON request carrying the body the route reads. */
function jsonRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/reports/${REPORT_ID}/remove-content`, {
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

  removeOutcome = {
    reportId: REPORT_ID,
    target: TARGET,
    recorded: true,
    eventId: 'an-event-id',
  };

  receivedRequest = null;
  useCaseReached = false;
});

// ── The refusals ────────────────────────────────────────────────────────────

describe('the remove-content route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 403', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a member who is not an administrator with a 403', async () => {
      actor = { ...(actor as object), isAdministrator: false };

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a body with no target with a 400', async () => {
      const response = await POST(jsonRequest({ reason: REASON }), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('target');
    });

    it('refuses a target that is not an object with a 400', async () => {
      const response = await POST(jsonRequest({ target: 'report_image', reason: REASON }), CONTEXT);

      expect(response.status).toBe(400);
    });

    it('refuses a target kind the system does not hold with a 400', async () => {
      const response = await POST(
        jsonRequest({ target: { kind: 'report', targetId: 'image-1' }, reason: REASON }),
        CONTEXT,
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('kind');
    });

    it('refuses a target with no id with a 400', async () => {
      const response = await POST(
        jsonRequest({ target: { kind: 'report_image' }, reason: REASON }),
        CONTEXT,
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('targetId');
    });

    it('refuses a body with no reason with a 400', async () => {
      const response = await POST(jsonRequest({ target: TARGET }), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('reason');
    });

    it('refuses a body that is not JSON with a 400', async () => {
      const request = new Request(
        `http://localhost/api/admin/reports/${REPORT_ID}/remove-content`,
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
      actor = { ...(actor as object), isAdministrator: false };
      csrfValid = false;

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
      expect(useCaseReached).toBe(false);
    });

    it('checks the CSRF token before the body', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest({ target: 'nonsense' }), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('Your request could not be verified.');
      expect(useCaseReached).toBe(false);
    });

    it('checks the body before the use case', async () => {
      const response = await POST(jsonRequest({ target: TARGET }), CONTEXT);

      expect(response.status).toBe(400);
      expect(useCaseReached).toBe(false);
    });

    it('never reaches the use case when the actor is refused', async () => {
      actor = { ...(actor as object), isAdministrator: false };

      await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(useCaseReached).toBe(false);
      expect(receivedRequest).toBeNull();
    });
  });

  // ── The permission and conflict answers ───────────────────────────────────

  describe('the permission and conflict answers', () => {
    it('answers a permission failure with a 403', async () => {
      removeOutcome = new PermissionDeniedError('You do not have access to this.');

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('answers content the report does not have with a 404', async () => {
      removeOutcome = new NotFoundError('No such content on this report.');

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(404);
      expect((await bodyOf(response))['error']).toBe('No such content on this report.');
    });

    it('answers a state conflict with a 409', async () => {
      removeOutcome = new ConflictError('This removal conflicts with another.');

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(409);
    });

    it('answers a field rule failure with a 400 that names the field', async () => {
      removeOutcome = new ValidationError('reason', 'The reason is too short.');

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['field']).toBe('reason');
    });
  });

  // ── The success answer ────────────────────────────────────────────────────

  describe('the success answer', () => {
    it('returns the report, the target, and whether a record was written', async () => {
      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['id']).toBe(REPORT_ID);
      expect(body['target']).toEqual(TARGET);
      expect(body['recorded']).toBe(true);
    });

    it('reports a repeated removal as not recorded', async () => {
      // **The removal still succeeded — the content stays withheld — but the
      // trail already held this exact moderation act.**
      removeOutcome = {
        reportId: REPORT_ID,
        target: TARGET,
        recorded: false,
        eventId: null,
      };

      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect((await bodyOf(response))['recorded']).toBe(false);
    });

    it('carries no Sensitive Field', async () => {
      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      // **The response body is asserted key by key.** The exact place and the
      // observed identifying details are FR-37 Sensitive Fields.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'id',
        'recorded',
        'target',
      ]);
    });

    it('carries no status of its own', async () => {
      const response = await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      // **A removal is not a closure.** The response says nothing about the
      // report's status, because the removal did not change it.
      expect(await bodyOf(response)).not.toHaveProperty('status');
    });
  });

  // ── What the route hands the use case ─────────────────────────────────────

  describe('what the route hands the use case', () => {
    it('takes the actor from the session, never from the body', async () => {
      await POST(
        jsonRequest({ target: TARGET, reason: REASON, isAdministrator: false, actorId: 'someone' }),
        CONTEXT,
      );

      expect(receivedRequest).toEqual({
        reportId: REPORT_ID,
        actor: { actorId: ADMINISTRATOR_ID, isAdministrator: true },
        target: TARGET,
        reason: REASON,
      });
    });

    it('passes the target through verbatim', async () => {
      await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect((receivedRequest as { target: unknown }).target).toEqual(TARGET);
    });

    it('passes the reason through verbatim', async () => {
      await POST(jsonRequest({ target: TARGET, reason: REASON }), CONTEXT);

      expect((receivedRequest as { reason: string }).reason).toBe(REASON);
    });

    it('carries no closure request to the use case', async () => {
      // **A removal and a closure are two actions.** A body asking for both
      // would be making two moderation decisions in one call — and the
      // administrator may or may not also close the report.
      await POST(jsonRequest({ target: TARGET, reason: REASON, close: true }), CONTEXT);

      expect(Object.keys(receivedRequest as object).sort()).toEqual([
        'actor',
        'reason',
        'reportId',
        'target',
      ]);
    });
  });
});
