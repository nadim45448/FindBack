/**
 * The `POST /api/admin/reports/[id]/confirm-returned` route's suite.
 *
 * **The route's own decisions are what is under test.** The confirmation
 * rule, the receiver derivation, the substitute's validation, and the service
 * are covered by their own suites; what lives *here* is the transport
 * layer's part — who may call it, the order of the checks, the status codes,
 * the messages, and the shape of the response.
 *
 * **The order of the checks is asserted, not assumed.** The route refuses in
 * a fixed order — actor, CSRF, body, use case — and a route that checked the
 * body before the actor would leak a validation error to a caller who was
 * never allowed to ask. Each ordering test makes the *earlier* check fail and
 * observes that the *later* one never ran.
 *
 * **The client never names the receiver.** The body's only group is the
 * substitute, and the route hands the use case a `substitute` or `null` —
 * there is no field anywhere through which a client could assert who the
 * default receiver is.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConflictError, NotFoundError, PermissionDeniedError } from '@/lib/errors';

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
let confirmOutcome: unknown = null;

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
    returnConfirmations: {
      confirm: async (request: unknown) => {
        receivedRequest = request;
        useCaseReached = true;

        if (confirmOutcome instanceof Error) {
          throw confirmOutcome;
        }

        return confirmOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const ADMINISTRATOR_ID = '00000000-0000-4000-8000-000000000781';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The report being confirmed. */
const REPORT_ID = '00000000-0000-4000-8000-000000000783';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID }) };

/** A JSON request carrying the body the route reads. */
function jsonRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/reports/${REPORT_ID}/confirm-returned`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A body naming a substitute receiver. */
function aSubstitute(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    substituteReceiverName: 'Sam Okafor',
    authorizationAffirmation: true,
    relationship: 'Friend',
    ...extra,
  };
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

  confirmOutcome = {
    reportId: REPORT_ID,
    status: 'Returned',
    confirmationId: 'a-confirmation-id',
    defaultReceiverAccountId: '00000000-0000-4000-8000-000000000784',
    substitute: null,
    eventId: 'an-event-id',
  };

  receivedRequest = null;
  useCaseReached = false;
});

// ── The refusals ───────────────────────────────────────────────────────────

describe('the confirm returned route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 403', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a member who is not an administrator with a 403', async () => {
      // **Only an administrator may call this.** The actor is derived from
      // the session — never from the request body.
      actor = { ...(actor as object), isAdministrator: false };

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a partial substitute with a 400', async () => {
      // **A partial substitute is a malformed request, not a validation
      // failure.** A body carrying a name and a relationship but no
      // authorization is a request whose shape is wrong.
      const response = await POST(
        jsonRequest({ substituteReceiverName: 'Sam Okafor', relationship: 'Friend' }),
        CONTEXT,
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('authorizationAffirmation');
    });

    it('names every missing substitute field', async () => {
      const response = await POST(jsonRequest({ substituteReceiverName: 'Sam Okafor' }), CONTEXT);

      const body = await bodyOf(response);

      expect(body['error']).toContain('authorizationAffirmation');
      expect(body['error']).toContain('relationship');
    });

    it('refuses a substitute name that is not a string with a 400', async () => {
      const response = await POST(jsonRequest(aSubstitute({ substituteReceiverName: 42 })), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('substituteReceiverName');
    });

    it('refuses an authorization that is not a boolean with a 400', async () => {
      const response = await POST(
        jsonRequest(aSubstitute({ authorizationAffirmation: 'yes' })),
        CONTEXT,
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('authorizationAffirmation');
    });

    it('refuses a relationship that is not a string with a 400', async () => {
      const response = await POST(jsonRequest(aSubstitute({ relationship: 7 })), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['error']).toContain('relationship');
    });

    it('refuses a body that is not JSON with a 400', async () => {
      const request = new Request(
        `http://localhost/api/admin/reports/${REPORT_ID}/confirm-returned`,
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
      // **A body is not parsed for a request that failed the CSRF check.** A
      // malformed body must not produce a validation error for a caller whose
      // request could not be verified.
      csrfValid = false;

      const response = await POST(jsonRequest({ substituteReceiverName: 'Sam' }), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('Your request could not be verified.');
      expect(useCaseReached).toBe(false);
    });

    it('checks the body before the use case', async () => {
      const response = await POST(jsonRequest({ relationship: 'Friend' }), CONTEXT);

      expect(response.status).toBe(400);
      expect(useCaseReached).toBe(false);
    });

    it('never reaches the use case when the actor is refused', async () => {
      actor = { ...(actor as object), isAdministrator: false };

      await POST(jsonRequest(aSubstitute()), CONTEXT);

      expect(useCaseReached).toBe(false);
      expect(receivedRequest).toBeNull();
    });
  });

  // ── The permission and conflict answers ───────────────────────────────────

  describe('the permission and conflict answers', () => {
    it('answers a permission failure with a 403 and the domain’s own message', async () => {
      confirmOutcome = new PermissionDeniedError('Only an administrator can confirm a return.');

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('Only an administrator can confirm a return.');
    });

    it('answers a report that does not exist with a 404', async () => {
      confirmOutcome = new NotFoundError('No report with that id.');

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(404);
      expect((await bodyOf(response))['error']).toBe('No report with that id.');
    });

    it('answers a state conflict with a 409', async () => {
      confirmOutcome = new ConflictError('This report is not ready to be confirmed as returned.');

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('not ready');
    });

    it('answers a lost race with a 409', async () => {
      confirmOutcome = new ConflictError(
        'This report was already confirmed as returned by someone else.',
      );

      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('someone else');
    });
  });

  // ── The success answer ────────────────────────────────────────────────────

  describe('the success answer', () => {
    it('returns the report, its status, and the confirmation id', async () => {
      const response = await POST(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['id']).toBe(REPORT_ID);
      expect(body['status']).toBe('Returned');
      expect(body['confirmationId']).toBe('a-confirmation-id');
    });

    it('carries no Sensitive Field and no receiver', async () => {
      const response = await POST(jsonRequest({}), CONTEXT);

      // **The response body is asserted key by key.** The exact place and the
      // observed identifying details are FR-37 Sensitive Fields, and the
      // default receiver is not the administrator's to read back — the
      // administrator's screen refreshes from the report.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'confirmationId',
        'id',
        'status',
      ]);
    });
  });

  // ── What the route hands the use case ─────────────────────────────────────

  describe('what the route hands the use case', () => {
    it('takes the actor from the session, never from the body', async () => {
      // **The actor is server-derived.** A body carrying an actor — or an
      // administrator flag — is ignored, because the route reads the
      // administrator flag from the session and nowhere else.
      await POST(jsonRequest({ isAdministrator: false, actorId: 'someone-else' }), CONTEXT);

      expect(receivedRequest).toEqual({
        reportId: REPORT_ID,
        actor: { actorId: ADMINISTRATOR_ID, isAdministrator: true },
        substitute: null,
      });
    });

    it('passes an empty body as a default-receiver confirmation', async () => {
      // **The default receiver is derived, so the client says nothing.** An
      // empty body means "the default receiver received it", and the route
      // hands the use case a `null` substitute rather than an empty object.
      await POST(jsonRequest({}), CONTEXT);

      expect((receivedRequest as { substitute: unknown }).substitute).toBeNull();
    });

    it('passes the substitute through when the body names one', async () => {
      await POST(jsonRequest(aSubstitute()), CONTEXT);

      expect((receivedRequest as { substitute: unknown }).substitute).toEqual({
        name: 'Sam Okafor',
        authorizationConfirmed: true,
        relationship: 'Friend',
      });
    });

    it('carries no receiver id to the use case', async () => {
      // **The client never names the receiver.** The default receiver is
      // derived from the report's own facts, so a body naming one would be
      // asserting something the domain owns — and there is no field for one.
      await POST(
        jsonRequest({
          ...aSubstitute(),
          defaultReceiverAccountId: '00000000-0000-4000-8000-000000000784',
        }),
        CONTEXT,
      );

      expect(Object.keys(receivedRequest as object).sort()).toEqual([
        'actor',
        'reportId',
        'substitute',
      ]);
      expect((receivedRequest as { substitute: unknown }).substitute).not.toHaveProperty(
        'defaultReceiverAccountId',
      );
    });
  });
});
