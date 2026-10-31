/**
 * The `POST /api/reports/[id]/recovery-responses` route's suite.
 *
 * **The route's own decisions are what is under test.** The use case, the
 * value objects, and the gate are covered by their own suites; what lives
 * *here* is the transport layer's part — the order the checks run in, the
 * status codes, the messages, and the shape of the response.
 *
 * **The load-bearing assertions are about what the response does *not*
 * carry.** FR-44 makes the exact place and the observed identifying details
 * Sensitive Fields, and the write path is not a place to hand them back — so
 * the response body is asserted key by key, not by a spot check.
 *
 * **The route is driven through its real seams.** `next/headers` is mocked
 * (it needs a request scope), and the two composition roots are mocked so
 * the route's own logic — the parse, the refusals, the status codes, and the
 * response shape — is what runs.
 *
 * **The parser is tested separately, in the same file.** The parse is where
 * the closed field set is enforced, and it is the part that has to be right
 * about *which keys were read*.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MalformedRequestError } from '@/app/api/reports/parse-report-request';

import { PermissionDeniedError, ValidationError } from '@/lib/errors';

import { RecoveryResponseSubmissionRefusedError } from '@/application/listings/recovery-response-submission-service';
import { DuplicateLiveRecoveryResponseError } from '@/application/listings/ports/recovery-response-repository';

import { parseRecoveryResponseBody } from './parse-recovery-response-request';

// ── The request scope ───────────────────────────────────────────────────────
//
// `next/headers` needs a Next.js request scope, which a unit test does not
// have. The mock supplies the cookie and the headers the route reads.

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
//
// The route builds its stacks per request. The mocks let the test drive the
// actor, the CSRF verdict, the rate limiter's answer, and the use case's
// outcome.

/** The actor the resolver returns. */
let actor: unknown = null;

/** The CSRF verdict. */
let csrfValid = true;

/** The rate limiter's answer. */
let rateAllowed = true;

/** The seconds the limiter asks the member to wait. */
let rateRetryAfter = 60;

/** The use case's outcome, or the error it throws. */
let submitOutcome: unknown = null;

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
    recoveryResponses: {
      submit: async (request: { draft: unknown; actor: unknown }) => {
        receivedRequest = request;

        if (submitOutcome instanceof Error) {
          throw submitOutcome;
        }

        return submitOutcome;
      },
    },
    rateLimiter: {
      consume: async () => ({
        allowed: rateAllowed,
        retryAfterSeconds: rateRetryAfter,
      }),
    },
    rateLimits: {
      recoveryResponseLimit: 20,
      recoveryResponseWindowSeconds: 3600,
    },
  }),
}));

const { POST } = await import('./route');

const ACTOR_ID = '00000000-0000-4000-8000-000000000761';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The Lost report the response is made against. */
const REPORT_ID = '00000000-0000-4000-8000-000000000762';

/** The route's dynamic parameter. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID }) };

/** The exact place the responder wrote. */
const WHERE_FOUND = 'On a bench outside the Main Library east entrance.';

/** The identifying details the responder observed. */
const OBSERVED = 'Brown leather, zip closure, scuffed on the back corner.';

/** A body with every required field. */
function aBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    campusArea: 'Main Library',
    whereFoundExactPlace: WHERE_FOUND,
    observedIdentifyingDetails: OBSERVED,
    dateFound: '2026-10-29',
    ...extra,
  };
}

/** A JSON request. */
function jsonRequest(body: unknown): Request {
  return new Request(
    `http://localhost/api/reports/${REPORT_ID}/recovery-responses`,
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

  // The route resolves the actor from the session cookie, so a signed-in
  // request carries one. The anonymous case below clears it.
  cookieJar.set(SESSION_COOKIE, SESSION_TOKEN);

  actor = {
    actorId: ACTOR_ID,
    status: 'Active',
    isAdministrator: false,
    displayName: 'The Responder',
    capability: 'member',
  };

  csrfValid = true;
  rateAllowed = true;
  rateRetryAfter = 60;

  submitOutcome = {
    responseId: 'a-minted-id',
    status: 'Submitted',
    submittedAt: new Date('2026-10-30T12:00:00.000Z'),
    eventId: 'an-event-id',
  };

  receivedRequest = null;
});

describe('the recovery responses route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 401', async () => {
      // No session cookie at all — the actor cannot be determined, and a
      // Response's responder is server-derived, never client-asserted.
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(401);
    });

    it('refuses a Pending account with a 403 and a specific message', async () => {
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('active');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a request that is over the rate limit with a 429', async () => {
      rateAllowed = false;
      rateRetryAfter = 120;

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('120');
    });

    it('runs the rate limit before the CSRF check', async () => {
      // The limiter is a policy about traffic and must run before the
      // expensive work — so a throttled responder is answered with a 429
      // whether or not their CSRF token was valid.
      rateAllowed = false;
      csrfValid = false;

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(429);
    });

    it('runs the capability check before the rate limit', async () => {
      // An account that may not respond at all is not counted against the
      // member's response budget.
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };
      rateAllowed = false;

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('stores nothing when it refuses', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      await POST(jsonRequest(aBody()), CONTEXT);

      // The body was never even parsed — a refusal leaves no trace.
      expect(receivedRequest).toBeNull();
    });
  });

  describe('the refusals the use case makes', () => {
    it('answers a permission failure with a 403 and its own message', async () => {
      // FR-40 wants a **clear** message. A responder who responded to their
      // own report must be told that, not told "you do not have access".
      submitOutcome = new PermissionDeniedError(
        'This is your own report. You do not need to respond to it.',
      );

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe(
        'This is your own report. You do not need to respond to it.',
      );
    });

    it('answers a refused duplicate with a 409', async () => {
      submitOutcome = new RecoveryResponseSubmissionRefusedError(
        'You already have an open response on this lost item.',
      );

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('already');
    });

    it('answers the uniqueness constraint firing with a 409', async () => {
      // The application's duplicate check passed and the database refused —
      // a race, or a path that bypassed the check. The responder sees the
      // same answer for the same situation.
      submitOutcome = new DuplicateLiveRecoveryResponseError(
        'You already have an open response on this lost item.',
      );

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(409);
    });

    it('answers a field rule failure with a 400 and names the field', async () => {
      submitOutcome = new ValidationError(
        'observedIdentifyingDetails',
        'The identifying details must be at least 10 characters.',
      );

      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(400);

      const body = await bodyOf(response);

      expect(body['field']).toBe('observedIdentifyingDetails');
    });
  });

  describe('the parse', () => {
    it('refuses a malformed body with a 400', async () => {
      const response = await POST(jsonRequest({ campusArea: 'Main Library' }), CONTEXT);

      expect(response.status).toBe(400);
    });

    it('refuses a non-object body with a 400', async () => {
      const response = await POST(jsonRequest(['not', 'an', 'object']), CONTEXT);

      expect(response.status).toBe(400);
    });

    it('refuses a body that is not JSON with a 400', async () => {
      const request = new Request(
        `http://localhost/api/reports/${REPORT_ID}/recovery-responses`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'not json',
        },
      );

      const response = await POST(request, CONTEXT);

      expect(response.status).toBe(400);
    });

    it('refuses an unknown content type with a 400', async () => {
      const request = new Request(
        `http://localhost/api/reports/${REPORT_ID}/recovery-responses`,
        {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'anything',
        },
      );

      const response = await POST(request, CONTEXT);

      expect(response.status).toBe(400);
    });

    it('names the offending field in the 400 response', async () => {
      const response = await POST(jsonRequest({ campusArea: 'Main Library' }), CONTEXT);

      expect((await bodyOf(response))['field']).toBeDefined();
    });
  });

  describe('the success path', () => {
    it('returns a 201 with the id and the status', async () => {
      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.status).toBe(201);

      const body = await bodyOf(response);

      expect(body['id']).toBe('a-minted-id');
      expect(body['status']).toBe('Submitted');
    });

    it('returns no stored field at all', async () => {
      const response = await POST(jsonRequest(aBody()), CONTEXT);

      const body = await bodyOf(response);

      // **The response carries the id, the status, and the submission time —
      // nothing else.** The exact place, the observed identifying details,
      // and the image are FR-37 Sensitive Fields.
      expect(Object.keys(body).sort()).toEqual(['id', 'status', 'submittedAt']);
    });

    it('never echoes the exact place or the observed details', async () => {
      const response = await POST(jsonRequest(aBody()), CONTEXT);

      const text = JSON.stringify(await response.json());

      expect(text).not.toContain('bench outside');
      expect(text).not.toContain('scuffed');
    });

    it('points at the response it created', async () => {
      const response = await POST(jsonRequest(aBody()), CONTEXT);

      expect(response.headers.get('Location')).toBe('/api/recovery-responses/a-minted-id');
    });

    it('derives the responder from the actor, never from the body', async () => {
      await POST(jsonRequest(aBody({ responderId: 'a-client-asserted-id' })), CONTEXT);

      // The body's `responderId` was dropped at the parse boundary.
      const request = receivedRequest as { draft: Record<string, unknown> };

      expect(request.draft).not.toHaveProperty('responderId');
    });

    it('takes the report id from the path, never from the body', async () => {
      await POST(jsonRequest(aBody({ reportId: 'a-client-asserted-id' })), CONTEXT);

      // The body's `reportId` was dropped at the parse boundary.
      const request = receivedRequest as { draft: Record<string, unknown> };

      expect(request.draft['reportId']).toBe(REPORT_ID);
    });

    it('hands the use case the actor it resolved', async () => {
      await POST(jsonRequest(aBody()), CONTEXT);

      const request = receivedRequest as { actor: { actorId: string } };

      expect(request.actor.actorId).toBe(ACTOR_ID);
    });
  });
});

describe('the recovery response body parser', () => {
  it('reads each field by name', () => {
    const draft = parseRecoveryResponseBody(aBody(), REPORT_ID);

    expect(draft.reportId).toBe(REPORT_ID);
    expect(draft.campusArea).toBe('Main Library');
    expect(draft.whereFoundExactPlace).toBe(WHERE_FOUND);
    expect(draft.observedIdentifyingDetails).toBe(OBSERVED);
    expect(draft.dateFound).toBe('2026-10-29');
  });

  it('drops an unknown key entirely', () => {
    const draft = parseRecoveryResponseBody(aBody({ secretLocation: 'the roof' }), REPORT_ID);

    // The key is not in the draft at all — not dropped later, never
    // carried.
    expect(Object.keys(draft)).not.toContain('secretLocation');
    expect(JSON.stringify(draft)).not.toContain('the roof');
  });

  it('drops every unknown key', () => {
    const draft = parseRecoveryResponseBody(
      aBody({ extraOne: 'a', extraTwo: 'b', responderId: 'c' }),
      REPORT_ID,
    );

    expect(Object.keys(draft).sort()).toEqual([
      'campusArea',
      'dateFound',
      'observedIdentifyingDetails',
      'reportId',
      'whereFoundExactPlace',
    ]);
  });

  it('refuses a required field that is absent', () => {
    const body = aBody();

    delete body['observedIdentifyingDetails'];

    expect(() => parseRecoveryResponseBody(body, REPORT_ID)).toThrow(MalformedRequestError);
  });

  it('refuses a required field that is not a string', () => {
    expect(() => parseRecoveryResponseBody(aBody({ dateFound: 42 }), REPORT_ID)).toThrow(
      MalformedRequestError,
    );
  });

  it('carries an empty string through to the domain', () => {
    // An empty string is a **value**, and the domain's value object decides
    // whether it is acceptable — the parser does not pre-judge it. The exact
    // place is optional, so an empty one is accepted.
    const draft = parseRecoveryResponseBody(aBody({ whereFoundExactPlace: '' }), REPORT_ID);

    expect(draft.whereFoundExactPlace).toBe('');
  });

  it('carries an absent optional field through as an empty string', () => {
    const body = aBody();

    delete body['whereFoundExactPlace'];

    const draft = parseRecoveryResponseBody(body, REPORT_ID);

    expect(draft.whereFoundExactPlace).toBe('');
  });
});
