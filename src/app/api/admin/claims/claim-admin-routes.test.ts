/**
 * The administrator's claim routes' suite.
 *
 * **The route's own decisions are what is under test.** The gate, the
 * transition table, the events, and the service's orchestration are covered
 * by their own suites; what lives *here* is the transport layer's part — the
 * order the checks run in, the status codes, the messages, and the shape of
 * the response.
 *
 * **The three routes share one authorisation path, and the sharing is what
 * is asserted.** The review screen and the two decisions must refuse
 * exactly the same actors for exactly the same reasons — a route that made
 * its own check would be a second answer to "who may decide a claim?", and
 * the two could disagree.
 *
 * **The route is driven through its real seams.** `next/headers` is mocked
 * (it needs a request scope), and the two composition roots are mocked so
 * the route's own logic — the refusals, the status codes, and the response
 * shape — is what runs.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ValidationError } from '@/lib/errors';

import { ClaimDecisionConflictError } from '@/application/listings/claim-decision-service';

import { parseClaimRejectionBody } from './parse-claim-decision-request';

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

/** The review screen the review service returns, or the error it throws. */
let reviewOutcome: unknown = null;

/** The approval's outcome, or the error it throws. */
let approveOutcome: unknown = null;

/** The rejection's outcome, or the error it throws. */
let rejectOutcome: unknown = null;

/** The request the decision routes handed to the use case. */
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
    claimReviews: {
      review: async (request: { claimId: string }) => {
        receivedRequest = request;

        if (reviewOutcome instanceof Error) {
          throw reviewOutcome;
        }

        return reviewOutcome;
      },
      offersDecision: (screen: { claimStatus: string }) => screen.claimStatus === 'Pending',
    },
    claimDecisions: {
      approve: async (request: unknown) => {
        receivedRequest = request;

        if (approveOutcome instanceof Error) {
          throw approveOutcome;
        }

        return approveOutcome;
      },
      reject: async (request: unknown) => {
        receivedRequest = request;

        if (rejectOutcome instanceof Error) {
          throw rejectOutcome;
        }

        return rejectOutcome;
      },
    },
  }),
}));

const { GET } = await import('./[id]/route');
const { POST: APPROVE } = await import('./[id]/approve/route');
const { POST: REJECT } = await import('./[id]/reject/route');

const ADMINISTRATOR_ID = '00000000-0000-4000-8000-000000000771';
const SESSION_TOKEN = 'a-session-token';
const SESSION_COOKIE = '__Host-fb';
const CLAIM_ID = '00000000-0000-4000-8000-000000000772';

/** The route's dynamic parameter. */
const CONTEXT = { params: Promise.resolve({ id: CLAIM_ID }) };

/** A JSON request. */
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/admin/claims', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The response's body, read once. */
async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** The review screen the mock returns by default. */
function aScreen(): Record<string, unknown> {
  return {
    claimId: CLAIM_ID,
    claimStatus: 'Pending',
    reason: 'It is my brown leather wallet.',
    identifyingDetails: 'Blue cardholder with a dent.',
    dateLost: '2026-10-20',
    submittedAt: new Date('2026-10-29T10:00:00.000Z'),
    item: {
      name: 'A brown leather wallet',
      category: 'Wallet',
      date: '2026-10-28',
      campusArea: 'library',
    },
    competingClaims: [],
    competingClaimCount: 0,
  };
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
  reviewOutcome = aScreen();
  approveOutcome = {
    claimId: CLAIM_ID,
    reportStatus: 'Claim Approved',
    autoRejected: [],
  };
  rejectOutcome = { claimId: CLAIM_ID, reportStatus: 'Open' };
  receivedRequest = null;
});

// ── The shared authorisation path ───────────────────────────────────────────

describe('the administrator claim routes — the refusals', () => {
  it('refuses an anonymous request with a 403', async () => {
    // **The refusal is a 403 with a generic message.** Unlike the
    // member-side claim route, an administrator who is refused is refused
    // because they are not an administrator, and there is nothing to
    // explain: the reason *is* the role.
    cookieJar.delete(SESSION_COOKIE);
    actor = null;

    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);

    expect(response.status).toBe(403);
    expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
  });

  it('refuses a member with a 403', async () => {
    actor = { ...(actor as object), isAdministrator: false };

    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);

    expect(response.status).toBe(403);
  });

  it('refuses a request with no valid CSRF token with a 403', async () => {
    csrfValid = false;

    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);

    expect(response.status).toBe(403);
    expect((await bodyOf(response))['error']).toBe('Your request could not be verified.');
  });

  it('refuses the same actors on all three routes', async () => {
    // **The three routes share one authorisation path.** A route that made
    // its own check would be a second answer to "who may decide a claim?",
    // and the two could disagree.
    for (const call of [
      () => GET(new Request('http://localhost/api/admin/claims'), CONTEXT),
      () => APPROVE(jsonRequest({}), CONTEXT),
      () => REJECT(jsonRequest({ reason: 'a'.repeat(20) }), CONTEXT),
    ]) {
      actor = { ...(actor as object), isAdministrator: false };

      const response = await call();

      expect(response.status).toBe(403);
    }
  });

  it('refuses a non-administrator without reading the body', async () => {
    // **The CSRF check comes after the authorisation, and before the body
    // is read.** A request from a non-administrator is refused without the
    // CSRF token being examined — there is no state to protect from someone
    // who may not change it.
    actor = { ...(actor as object), isAdministrator: false };

    const response = await REJECT(jsonRequest({ reason: 'a'.repeat(20) }), CONTEXT);

    expect(response.status).toBe(403);
    expect(receivedRequest).toBeNull();
  });
});

// ── The review screen ───────────────────────────────────────────────────────

describe('the administrator claim review route', () => {
  it('returns the screen for an administrator', async () => {
    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);

    expect(response.status).toBe(200);
  });

  it('carries the claim’s evidence to the administrator', async () => {
    // **FR-37 and FR-39 permit an administrator to see the reason and the
    // identifying details,** and the screen is the one place the finder is
    // not a viewer of them.
    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);
    const body = await bodyOf(response);

    expect(body['reason']).toBe('It is my brown leather wallet.');
    expect(body['identifyingDetails']).toBe('Blue cardholder with a dent.');
    expect(body['dateLost']).toBe('2026-10-20');
  });

  it('carries the item’s details', async () => {
    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);
    const body = await bodyOf(response);

    expect(body['item']).toEqual({
      name: 'A brown leather wallet',
      category: 'Wallet',
      date: '2026-10-28',
      campusArea: 'library',
    });
  });

  it('lists the competing claims by reference with their count', async () => {
    reviewOutcome = {
      ...aScreen(),
      competingClaims: [
        { claimId: 'claim-2', submittedAt: new Date('2026-10-29T09:00:00.000Z') },
      ],
      competingClaimCount: 1,
    };

    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);
    const body = await bodyOf(response);

    expect(body['competingClaimCount']).toBe(1);
    expect(body['competingClaims']).toEqual([
      { claimId: 'claim-2', submittedAt: '2026-10-29T09:00:00.000Z' },
    ]);
  });

  it('offers the decision action while the claim is pending', async () => {
    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);

    expect((await bodyOf(response))['decisionAvailable']).toBe(true);
  });

  it('withdraws the decision action once the claim is decided', async () => {
    // **A decided Claim still answers.** An administrator following a stale
    // link must see *what happened*, not a 404.
    reviewOutcome = { ...aScreen(), claimStatus: 'Approved' };

    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(body['status']).toBe('Approved');
    expect(body['decisionAvailable']).toBe(false);
  });

  it('answers a claim that does not exist with a 404', async () => {
    reviewOutcome = new Error('No claim with that id.');

    const response = await GET(new Request('http://localhost/api/admin/claims'), CONTEXT);

    // An ordinary `Error` is a defect, so it is answered generically.
    expect(response.status).toBe(500);
  });
});

// ── The approval ────────────────────────────────────────────────────────────

describe('the administrator claim approval route', () => {
  it('approves the claim and returns the report’s new status', async () => {
    const response = await APPROVE(jsonRequest({}), CONTEXT);

    expect(response.status).toBe(200);

    const body = await bodyOf(response);

    expect(body['claimId']).toBe(CLAIM_ID);
    expect(body['reportStatus']).toBe('Claim Approved');
  });

  it('reports how many competing claims were auto-rejected', async () => {
    approveOutcome = {
      claimId: CLAIM_ID,
      reportStatus: 'Claim Approved',
      autoRejected: [{ claimId: 'claim-2' }, { claimId: 'claim-3' }],
    };

    const response = await APPROVE(jsonRequest({}), CONTEXT);

    expect((await bodyOf(response))['autoRejectedCount']).toBe(2);
  });

  it('takes the actor from the session, never from the body', async () => {
    // **A client cannot assert its own role.** The body is not even read
    // by the approval — it carries no input at all.
    await APPROVE(jsonRequest({ actorId: 'someone-else' }), CONTEXT);

    expect(receivedRequest).toEqual({
      claimId: CLAIM_ID,
      actor: { actorId: ADMINISTRATOR_ID },
    });
  });

  it('answers a decision that lost a race with a 409', async () => {
    approveOutcome = new ClaimDecisionConflictError(
      'This claim has already been decided. Its recorded decision is shown instead.',
    );

    const response = await APPROVE(jsonRequest({}), CONTEXT);

    expect(response.status).toBe(409);
    expect((await bodyOf(response))['error']).toContain('already been decided');
  });
});

// ── The rejection ───────────────────────────────────────────────────────────

describe('the administrator claim rejection route', () => {
  it('rejects the claim and returns the report’s new status', async () => {
    const response = await REJECT(
      jsonRequest({ reason: 'The item does not match the description given.' }),
      CONTEXT,
    );

    expect(response.status).toBe(200);

    const body = await bodyOf(response);

    expect(body['claimId']).toBe(CLAIM_ID);
    expect(body['reportStatus']).toBe('Open');
  });

  it('reads only the reason from the body', async () => {
    // **The parser names the field it reads, and drops everything else.** A
    // request carrying `{"status": "Approved"}` has that key dropped
    // before the service sees it.
    await REJECT(
      jsonRequest({
        reason: 'The item does not match the description given.',
        status: 'Approved',
        decidedAt: '2026-10-30T09:00:00.000Z',
      }),
      CONTEXT,
    );

    expect(receivedRequest).toEqual({
      claimId: CLAIM_ID,
      actor: { actorId: ADMINISTRATOR_ID },
      reason: 'The item does not match the description given.',
    });
  });

  it('answers a reason that breaks its bound with a 400 that names the field', async () => {
    rejectOutcome = new ValidationError(
      'reason',
      'The rejection reason must be at least 10 characters.',
    );

    const response = await REJECT(jsonRequest({ reason: 'short' }), CONTEXT);

    expect(response.status).toBe(400);
    expect((await bodyOf(response))['field']).toBe('reason');
  });

  it('answers a decision that lost a race with a 409', async () => {
    rejectOutcome = new ClaimDecisionConflictError(
      'This claim has already been decided. Its recorded decision is shown instead.',
    );

    const response = await REJECT(
      jsonRequest({ reason: 'The item does not match the description given.' }),
      CONTEXT,
    );

    expect(response.status).toBe(409);
  });
});

// ── The parser ──────────────────────────────────────────────────────────────

describe('the claim rejection body parser', () => {
  it('reads the reason', () => {
    expect(parseClaimRejectionBody({ reason: 'A good enough reason.' })).toEqual({
      reason: 'A good enough reason.',
    });
  });

  it('drops every other field', () => {
    // **The closed field set is enforced at the parse.** A request that
    // tried to smuggle a status through has it dropped before the service
    // sees it.
    const parsed = parseClaimRejectionBody({
      reason: 'A good enough reason.',
      status: 'Approved',
      decidedByAdministratorId: 'someone-else',
    });

    expect(Object.keys(parsed)).toEqual(['reason']);
  });

  it('reads a missing reason as the empty string', () => {
    // **The bound is the domain's, not the parser's.** The empty string is
    // what the domain's own bound then refuses.
    expect(parseClaimRejectionBody({})).toEqual({ reason: '' });
  });

  it('refuses a reason that is not text', () => {
    expect(() => parseClaimRejectionBody({ reason: 42 })).toThrow(ValidationError);
  });

  it('names the field and never the value', () => {
    try {
      parseClaimRejectionBody({ reason: { text: 'no' } });
      expect.unreachable('the reason should have been refused.');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe('reason');
      expect((error as ValidationError).message).not.toContain('no');
    }
  });
});
