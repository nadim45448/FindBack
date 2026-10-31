/**
 * The `POST /api/claims` route's suite.
 *
 * **The route's own decisions are what is under test.** The use case, the
 * value objects, and the gate are covered by their own suites; what lives
 * *here* is the transport layer's part — the order the checks run in, the
 * status codes, the messages, and the shape of the response.
 *
 * **The load-bearing assertions are about what the response does *not*
 * carry.** FR-37 makes the reason and the identifying details Sensitive
 * Fields, and the write path is not a place to hand them back — so the
 * response body is asserted key by key, not by a spot check.
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

import {
  ClaimSubmissionRefusedError,
} from '@/application/listings/claim-submission-service';
import { DuplicatePendingClaimError } from '@/application/listings/ports/claim-repository';

import { parseClaimBody } from './parse-claim-request';

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
    claims: {
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
    rateLimits: { claimLimit: 20, claimWindowSeconds: 3600 },
  }),
}));

const { POST } = await import('./route');

const ACTOR_ID = '00000000-0000-4000-8000-000000000751';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The report the claim is made against. */
const REPORT_ID = '00000000-0000-4000-8000-000000000752';

/** A body with every required field. */
function aBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    reportId: REPORT_ID,
    reason: 'It is my brown leather wallet.',
    identifyingDetails: 'Blue cardholder with a dent.',
    dateLost: '2026-10-20',
    ...extra,
  };
}

/** A JSON request. */
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/claims', {
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

  // The route resolves the actor from the session cookie, so a signed-in
  // request carries one. The anonymous case below clears it.
  cookieJar.set(SESSION_COOKIE, SESSION_TOKEN);

  actor = {
    actorId: ACTOR_ID,
    status: 'Active',
    isAdministrator: false,
    displayName: 'The Claimant',
    capability: 'member',
  };

  csrfValid = true;
  rateAllowed = true;
  rateRetryAfter = 60;

  submitOutcome = {
    claim: {
      id: 'a-minted-id',
      status: 'Pending',
      submittedAt: new Date('2026-10-29T12:00:00.000Z'),
    },
    reportStatus: 'Claim Requested',
  };

  receivedRequest = null;
});

describe('the claims route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 401', async () => {
      // No session cookie at all — the actor cannot be determined, and a
      // Claim's claimant is server-derived, never client-asserted.
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(401);
    });

    it('refuses a Pending account with a 403 and a specific message', async () => {
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toContain('active');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(403);
    });

    it('refuses a request that is over the rate limit with a 429', async () => {
      rateAllowed = false;
      rateRetryAfter = 120;

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(429);
      expect(response.headers.get('Retry-After')).toBe('120');
    });

    it('runs the rate limit before the CSRF check', async () => {
      // The limiter is a policy about traffic and must run before the
      // expensive work — so a throttled member is answered with a 429
      // whether or not their CSRF token was valid.
      rateAllowed = false;
      csrfValid = false;

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(429);
    });

    it('runs the capability check before the rate limit', async () => {
      // An account that may not claim at all is not counted against the
      // member's claim budget.
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };
      rateAllowed = false;

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(403);
    });

    it('stores nothing when it refuses', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      await POST(jsonRequest(aBody()));

      // The body was never even parsed — a refusal leaves no trace.
      expect(receivedRequest).toBeNull();
    });
  });

  describe('the refusals the use case makes', () => {
    it('answers a permission failure with a 403 and its own message', async () => {
      // FR-15 wants a **clear** message. A member who claimed their own
      // report must be told that, not told "you do not have access".
      submitOutcome = new PermissionDeniedError(
        'You cannot claim an item you reported.',
      );

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe(
        'You cannot claim an item you reported.',
      );
    });

    it('answers a refused duplicate with a 409', async () => {
      submitOutcome = new ClaimSubmissionRefusedError(
        'You already have a claim pending on this item.',
      );

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(409);
      expect((await bodyOf(response))['error']).toContain('already');
    });

    it('answers the uniqueness constraint firing with a 409', async () => {
      // The application's duplicate check passed and the database refused —
      // a race, or a path that bypassed the check. The member sees the same
      // answer for the same situation.
      submitOutcome = new DuplicatePendingClaimError(
        'You already have a claim pending on this item.',
      );

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(409);
    });

    it('answers a field rule failure with a 400 and names the field', async () => {
      submitOutcome = new ValidationError(
        'reason',
        'The reason must be between 20 and 1000 characters.',
      );

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(400);

      const body = await bodyOf(response);

      expect(body['field']).toBe('reason');
    });
  });

  describe('the parse', () => {
    it('refuses a malformed body with a 400', async () => {
      const response = await POST(jsonRequest({ reportId: REPORT_ID }));

      expect(response.status).toBe(400);
    });

    it('refuses a non-object body with a 400', async () => {
      const response = await POST(jsonRequest(['not', 'an', 'object']));

      expect(response.status).toBe(400);
    });

    it('refuses a body that is not JSON with a 400', async () => {
      const request = new Request('http://localhost/api/claims', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('names the offending field in the 400 response', async () => {
      const response = await POST(jsonRequest({ reportId: REPORT_ID }));

      expect((await bodyOf(response))['field']).toBeDefined();
    });
  });

  describe('the success path', () => {
    it('returns a 201 with the id and the status', async () => {
      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(201);

      const body = await bodyOf(response);

      expect(body['id']).toBe('a-minted-id');
      expect(body['status']).toBe('Pending');
      expect(body['reportStatus']).toBe('Claim Requested');
    });

    it('returns no stored field at all', async () => {
      const response = await POST(jsonRequest(aBody()));

      const body = await bodyOf(response);

      // **The response carries the id, the status, the report's status, and
      // the submission time — nothing else.** The reason and the identifying
      // details are FR-37 Sensitive Fields.
      expect(Object.keys(body).sort()).toEqual([
        'id',
        'reportStatus',
        'status',
        'submittedAt',
      ]);
    });

    it('never echoes the reason or the identifying details', async () => {
      const response = await POST(
        jsonRequest(
          aBody({
            reason: 'It is my brown leather wallet, with the folded receipt.',
            identifyingDetails: 'Blue cardholder with a dent in the corner.',
          }),
        ),
      );

      const text = JSON.stringify(await response.json());

      expect(text).not.toContain('folded receipt');
      expect(text).not.toContain('dent in the corner');
    });

    it('points at the claim it created', async () => {
      const response = await POST(jsonRequest(aBody()));

      expect(response.headers.get('Location')).toBe('/api/claims/a-minted-id');
    });

    it('derives the claimant from the actor, never from the body', async () => {
      await POST(jsonRequest(aBody({ claimantId: 'a-client-asserted-id' })));

      // The body's `claimantId` was dropped at the parse boundary.
      const request = receivedRequest as { draft: Record<string, unknown> };

      expect(request.draft).not.toHaveProperty('claimantId');
    });

    it('hands the use case the actor it resolved', async () => {
      await POST(jsonRequest(aBody()));

      const request = receivedRequest as { actor: { actorId: string } };

      expect(request.actor.actorId).toBe(ACTOR_ID);
    });
  });
});

describe('the claim body parser', () => {
  it('reads each field by name', () => {
    const draft = parseClaimBody(aBody());

    expect(draft.reportId).toBe(REPORT_ID);
    expect(draft.reason).toBe('It is my brown leather wallet.');
    expect(draft.identifyingDetails).toBe('Blue cardholder with a dent.');
    expect(draft.dateLost).toBe('2026-10-20');
  });

  it('drops an unknown key entirely', () => {
    const draft = parseClaimBody(aBody({ secretLocation: 'the roof' }));

    // The key is not in the draft at all — not dropped later, never
    // carried.
    expect(Object.keys(draft)).not.toContain('secretLocation');
    expect(JSON.stringify(draft)).not.toContain('the roof');
  });

  it('drops every unknown key', () => {
    const draft = parseClaimBody(
      aBody({ extraOne: 'a', extraTwo: 'b', claimantId: 'c' }),
    );

    expect(Object.keys(draft).sort()).toEqual([
      'dateLost',
      'identifyingDetails',
      'reason',
      'reportId',
    ]);
  });

  it('refuses a required field that is absent', () => {
    const body = aBody();

    delete body['reason'];

    expect(() => parseClaimBody(body)).toThrow(MalformedRequestError);
  });

  it('refuses a required field that is not a string', () => {
    expect(() => parseClaimBody(aBody({ reason: 42 }))).toThrow(MalformedRequestError);
  });

  it('carries an empty string through to the domain', () => {
    // An empty string is a **value**, and the domain's value object decides
    // whether it is acceptable — the parser does not pre-judge it.
    const draft = parseClaimBody(aBody({ reason: '' }));

    expect(draft.reason).toBe('');
  });
});
