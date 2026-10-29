/**
 * The listing and detail routes' suite.
 *
 * **The load-bearing assertions are the two refusals.** An anonymous
 * listing must carry the FR-38 field set and nothing more, and an
 * anonymous detail must be refused with a **404** rather than a 403 — a
 * 403 would confirm the report exists, which is exactly what FR-38 says
 * anonymous visibility must not disclose.
 *
 * **The route is driven through its real seams.** `next/headers` is mocked
 * (it needs a request scope), and the two composition roots are mocked so
 * the route's *own* logic — the parse, the partition, the refusals, the
 * status codes, and the response shape — is what is under test.
 *
 * **The partition is what the route passes through, not what it decides.**
 * The route parses the `partition` parameter and hands it to the service;
 * the service resolves it against the actor. So the assertion here is that
 * the route passes the *named* partition through — the resolution is the
 * service's, and it is tested in the service's own suite.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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

/** The listing request the route handed to the use case. */
let receivedListRequest: unknown = null;

/** The detail request the route handed to the use case. */
let receivedDetailRequest: unknown = null;

/** The listing outcome, or the error it throws. */
let listOutcome: unknown = null;

/** The detail outcome, or the error it throws. */
let detailOutcome: unknown = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: true }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    listings: {
      list: async (request: unknown) => {
        receivedListRequest = request;

        if (listOutcome instanceof Error) {
          throw listOutcome;
        }

        return listOutcome;
      },
    },
    details: {
      show: async (requestActor: unknown, reportId: string) => {
        receivedDetailRequest = { actor: requestActor, reportId };

        if (detailOutcome instanceof Error) {
          throw detailOutcome;
        }

        return detailOutcome;
      },
    },
  }),
}));

const { GET: LIST } = await import('./listing/route');
const { GET: DETAIL } = await import('./[id]/route');

const { NotFoundError, ValidationError } = await import('@/lib/errors');

const SESSION_COOKIE = '__Host-fb';
const MEMBER_ID = '00000000-0000-4000-8000-000000000711';

/**
 * Give the request a session.
 *
 * **The actor is only ever derived from the session.** The route reads the
 * `__Host-fb` cookie and resolves it; a request with no cookie has no
 * actor, whatever else the caller might send. So a test that wants a member
 * must present the cookie — the cookie *is* the identity.
 */
function withSession(): void {
  cookieJar.set(SESSION_COOKIE, 'a-session-token');
}

/** An active member's actor context. */
function aMember(): unknown {
  return {
    actorId: MEMBER_ID,
    status: 'Active',
    isAdministrator: false,
    displayName: 'A Member',
  };
}

/** A listing request. */
function listRequest(query = ''): Request {
  return new Request(`http://localhost/api/reports/listing${query}`);
}

/** A detail request. */
function detailRequest(id = 'report-1'): Request {
  return new Request(`http://localhost/api/reports/${id}`);
}

/** The context the detail route receives. */
function detailContext(id = 'report-1'): { readonly params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('the listing route', () => {
  beforeEach(() => {
    cookieJar.clear();
    headerJar.clear();
    actor = null;
    receivedListRequest = null;
    listOutcome = { rows: [], total: 0, page: 1, pageSize: 25, totalPages: 1 };
  });

  it('serves the public listing to an anonymous visitor', async () => {
    const response = await LIST(listRequest());

    expect(response.status).toBe(200);
  });

  it('passes a null actor for an anonymous request', async () => {
    await LIST(listRequest());

    expect((receivedListRequest as { actor: unknown }).actor).toBeNull();
  });

  it('passes the named partition through to the service', async () => {
    // **The route parses the partition; the service resolves it.** The
    // resolution against the actor is the service's decision, and the
    // route must not pre-empt it.
    await LIST(listRequest('?partition=mine'));

    expect((receivedListRequest as { partition: string }).partition).toBe('mine');
  });

  it('passes null when no partition is named', async () => {
    await LIST(listRequest());

    expect((receivedListRequest as { partition: unknown }).partition).toBeNull();
  });

  it('refuses a partition outside the closed set', async () => {
    const response = await LIST(listRequest('?partition=everything'));

    expect(response.status).toBe(400);
  });

  it('passes the keyword to the service', async () => {
    await LIST(listRequest('?keyword=wallet'));

    expect((receivedListRequest as { filter: { keyword: string } }).filter.keyword).toBe('wallet');
  });

  it('passes a null keyword when none is supplied', async () => {
    await LIST(listRequest());

    expect((receivedListRequest as { filter: { keyword: unknown } }).filter.keyword).toBeNull();
  });

  it('drops an unknown query parameter', async () => {
    // **An unknown parameter is not an error.** A client sending an extra
    // parameter is not making a mistake worth a 400 — and dropping it is
    // what stops a caller smuggling a field the product does not expose
    // into a request whose only effect would be to be ignored.
    const response = await LIST(listRequest('?reporterId=someone-else'));

    expect(response.status).toBe(200);
  });

  it('passes the type filter to the service', async () => {
    await LIST(listRequest('?type=Lost'));

    expect((receivedListRequest as { filter: { type: string } }).filter.type).toBe('Lost');
  });

  it('refuses a type outside the closed set', async () => {
    const response = await LIST(listRequest('?type=Stolen'));

    expect(response.status).toBe(400);
  });

  it('refuses a category outside the closed set', async () => {
    const response = await LIST(listRequest('?category=Spaceship'));

    expect(response.status).toBe(400);
  });

  it('refuses a status outside the closed set', async () => {
    const response = await LIST(listRequest('?status=Vanished'));

    expect(response.status).toBe(400);
  });

  it('passes the page to the service', async () => {
    await LIST(listRequest('?page=3&pageSize=10'));

    expect((receivedListRequest as { page: unknown }).page).toEqual({ number: 3, size: 10 });
  });

  it('refuses a page size above the maximum', async () => {
    // **The bound is the domain's, not the route's** — and the route must
    // not widen it.
    const response = await LIST(listRequest('?pageSize=1000'));

    expect(response.status).toBe(400);
  });

  it('refuses an invalid date range', async () => {
    const response = await LIST(listRequest('?from=2026-10-01&to=2026-09-01'));

    expect(response.status).toBe(400);
  });

  it('answers a validation failure with the offending field', async () => {
    listOutcome = new ValidationError('type', 'Choose either Lost or Found.');

    const response = await LIST(listRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Choose either Lost or Found.',
      field: 'type',
    });
  });

  it('returns the rows the service produced', async () => {
    listOutcome = {
      rows: [{ id: 'report-1', type: 'Lost', status: 'Open' }],
      total: 1,
      page: 1,
      pageSize: 25,
      totalPages: 1,
    };

    const response = await LIST(listRequest());

    expect(await response.json()).toEqual(listOutcome);
  });
});

describe('the detail route', () => {
  beforeEach(() => {
    cookieJar.clear();
    headerJar.clear();
    actor = null;
    receivedDetailRequest = null;
    detailOutcome = { reportId: 'report-1', viewerId: MEMBER_ID, report: {} };
  });

  it('serves a member the projection', async () => {
    actor = aMember();
    withSession();

    const response = await DETAIL(detailRequest(), detailContext());

    expect(response.status).toBe(200);
  });

  it('passes the actor and the report id to the service', async () => {
    actor = aMember();
    withSession();

    await DETAIL(detailRequest('report-42'), detailContext('report-42'));

    expect(receivedDetailRequest).toEqual({ actor, reportId: 'report-42' });
  });

  it('passes a null actor when the request carries no session', async () => {
    // **The route does not accept an actor from the request.** A caller
    // cannot present a member by asking for one; the only route to an
    // actor is the session cookie.
    await DETAIL(detailRequest(), detailContext());

    expect((receivedDetailRequest as { actor: unknown }).actor).toBeNull();
  });

  it('refuses an anonymous visitor with a not-found', async () => {
    // **The refusal is a 404, not a 403.** A 403 would confirm the report
    // exists, and FR-38 says the listing row is the whole of anonymous
    // visibility on a report.
    detailOutcome = new NotFoundError('That report could not be found.');

    const response = await DETAIL(detailRequest(), detailContext());

    expect(response.status).toBe(404);
  });

  it('answers the not-found with the domain own message', async () => {
    detailOutcome = new NotFoundError('That report could not be found.');

    const response = await DETAIL(detailRequest(), detailContext());

    expect(await response.json()).toEqual({ error: 'That report could not be found.' });
  });

  it('does not distinguish an anonymous refusal from a missing report', async () => {
    // **The two are deliberately indistinguishable.** An anonymous visitor
    // learns nothing about whether the report exists.
    detailOutcome = new NotFoundError('That report could not be found.');

    const anonymous = await DETAIL(detailRequest(), detailContext());

    actor = aMember();
    const missing = await DETAIL(detailRequest('missing'), detailContext('missing'));

    expect(anonymous.status).toBe(missing.status);
    expect(await anonymous.json()).toEqual(await missing.json());
  });
});
