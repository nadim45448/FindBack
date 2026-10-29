/**
 * The report lifecycle routes' suite — the four routes FR-9, FR-10, FR-11,
 * and FR-53 add.
 *
 * **The route is thin, so what is under test is the route's own logic:** the
 * refusals, the status codes, the error mapping, and the response shape. The
 * business rules live in the services and are tested there — a duplicate
 * here would prove the mock, not the route.
 *
 * **The load-bearing assertion is on the response shape.** None of the four
 * routes may return a stored field: the reporter's view of their own report
 * is a **read** concern governed by FR-39, and bolt `009` owns it. A write
 * path that returned the name, the description, or the exact place would
 * create a second, ungoverned read path.
 *
 * **The actor is derived from the session, never from the request.** The
 * refusal assertions cover that: a body naming another member does not
 * become the actor.
 */

import { describe, expect, it, vi } from 'vitest';

import { ConflictError } from '@/lib/errors';
import { TerminalStateError } from '@/lib/errors';
import { ValidationError } from '@/lib/errors';

import { WithdrawalRefusedError } from '@/application/listings/report-withdrawal-service';

// ── The request scope ───────────────────────────────────────────────────────
//
// `next/headers` needs a Next.js request scope, which a unit test does not
// have. The mock supplies the cookie and the headers the routes read.

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
// The routes build their stacks per request. The mocks let the test drive
// the actor, the CSRF verdict, and the use case's outcome.

/** The actor the resolver returns. */
let actor: unknown = null;

/** The CSRF verdict. */
let csrfValid = true;

/** The use case's outcome, or the error it throws. */
let outcome: unknown = null;

/** The request the use case received. */
let receivedRequest: unknown = null;

/** Which use case the route called. */
let calledUseCase: string | null = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: csrfValid }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    reportEdits: {
      edit: async (request: unknown) => {
        calledUseCase = 'reportEdits';
        receivedRequest = request;

        if (outcome instanceof Error) {
          throw outcome;
        }

        return outcome;
      },
    },
    reportDeletions: {
      delete: async (request: unknown) => {
        calledUseCase = 'reportDeletions';
        receivedRequest = request;

        if (outcome instanceof Error) {
          throw outcome;
        }

        return outcome;
      },
    },
    reportWithdrawals: {
      withdraw: async (request: unknown) => {
        calledUseCase = 'reportWithdrawals';
        receivedRequest = request;

        if (outcome instanceof Error) {
          throw outcome;
        }

        return outcome;
      },
    },
    administratorEdits: {
      edit: async (request: unknown) => {
        calledUseCase = 'administratorEdits';
        receivedRequest = request;

        if (outcome instanceof Error) {
          throw outcome;
        }

        return outcome;
      },
    },
  }),
}));

const { PATCH: edit } = await import('./[id]/edit/route');
const { DELETE: remove } = await import('./[id]/delete/route');
const { POST: withdraw } = await import('./[id]/withdraw/route');
const { PATCH: administratorEdit } = await import('../admin/reports/[id]/edit/route');

const { parseReportEditBody } = await import('./parse-report-edit-request');

const ACTOR_ID = '00000000-0000-4000-8000-000000000a01';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The route's dynamic parameter. */
const CONTEXT = { params: Promise.resolve({ id: 'report-1' }) };

/** A JSON request. */
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/reports/report-1/edit', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A request with no body. */
function emptyRequest(method: string): Request {
  return new Request('http://localhost/api/reports/report-1', { method });
}

/** Reset the mocked world to a signed-in member with a valid CSRF token. */
function signIn(overrides: Record<string, unknown> = {}): void {
  cookieJar.clear();
  headerJar.clear();
  cookieJar.set(SESSION_COOKIE, SESSION_TOKEN);

  actor = {
    actorId: ACTOR_ID,
    status: 'Active',
    isAdministrator: false,
    displayName: 'The Reporter',
    capability: 'member',
    ...overrides,
  };

  csrfValid = true;
  outcome = null;
  receivedRequest = null;
  calledUseCase = null;
}

/** The outcome the edit routes return. */
function anEditOutcome(): unknown {
  return {
    outcome: { kind: 'Changed' },
    report: {
      id: 'report-1',
      type: 'Found',
      status: 'Open',
      updatedAt: new Date('2026-10-29T12:00:00.000Z'),
    },
    event: { type: 'report.edited_by_reporter' },
  };
}

describe('the reporter\'s edit route', () => {
  it('refuses an anonymous request with a 401', async () => {
    signIn();
    cookieJar.delete(SESSION_COOKIE);
    actor = null;

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(401);
  });

  it('refuses a Pending actor with a 403', async () => {
    signIn({ status: 'Pending', capability: 'none' });

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(403);
  });

  it('refuses a request with no valid CSRF token with a 403', async () => {
    signIn();
    csrfValid = false;

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(403);
  });

  it('calls no use case when it refuses', async () => {
    signIn();
    cookieJar.delete(SESSION_COOKIE);
    actor = null;

    await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(calledUseCase).toBeNull();
  });

  it('returns a 200 with the id, the status, and whether anything changed', async () => {
    signIn();
    outcome = anEditOutcome();

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body['id']).toBe('report-1');
    expect(body['status']).toBe('Open');
    expect(body['changed']).toBe(true);
    expect(body['updatedAt']).toBe('2026-10-29T12:00:00.000Z');
  });

  it('returns no stored field at all', async () => {
    signIn();
    outcome = anEditOutcome();

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    const body = (await response.json()) as Record<string, unknown>;

    // **The write path returns no stored field.** The reporter's view of
    // their own report is a read concern, and bolt `009` owns it.
    expect(Object.keys(body).sort()).toEqual(['changed', 'id', 'status', 'updatedAt']);
  });

  it('never echoes the name, the description, or the exact place', async () => {
    signIn();
    outcome = anEditOutcome();

    const response = await edit(
      jsonRequest({
        name: 'Brown leather wallet',
        description: 'A brown leather wallet.',
        exactPlace: 'Second floor, east stacks',
      }),
      CONTEXT,
    );

    const text = JSON.stringify(await response.json());

    expect(text).not.toContain('Brown leather wallet');
    expect(text).not.toContain('Second floor');
  });

  it('reports an unchanged edit as changed: false', async () => {
    signIn();
    outcome = {
      outcome: { kind: 'Unchanged' },
      report: {
        id: 'report-1',
        status: 'Open',
        updatedAt: new Date('2026-10-29T12:00:00.000Z'),
      },
      event: null,
    };

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body['changed']).toBe(false);
  });

  it('derives the actor from the session, never from the body', async () => {
    signIn();
    outcome = anEditOutcome();

    await edit(jsonRequest({ name: 'New name', reporterId: 'someone-else' }), CONTEXT);

    const request = receivedRequest as { actor: { actorId: string } };

    expect(request.actor.actorId).toBe(ACTOR_ID);
  });

  it('drops a status the body tried to set', async () => {
    signIn();
    outcome = anEditOutcome();

    await edit(jsonRequest({ name: 'New name', status: 'Closed' }), CONTEXT);

    const request = receivedRequest as { changes: Record<string, unknown> };

    // **The parser drops it at the boundary,** so the edit structurally
    // cannot change the status.
    expect(request.changes).not.toHaveProperty('status');
  });

  it('maps a terminal report to a 409', async () => {
    signIn();
    outcome = new TerminalStateError('Closed reports cannot be edited.');

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(409);
  });

  it('maps a conflict to a 409 with the domain\'s message', async () => {
    signIn();
    outcome = new ConflictError('Only an open report can be deleted.');

    const response = await edit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(409);

    const body = (await response.json()) as { error?: string };

    expect(body.error).toBe('Only an open report can be deleted.');
  });

  it('maps a validation failure to a 400 naming the field', async () => {
    signIn();
    outcome = new ValidationError('name', 'The "name" field must not be empty.');

    const response = await edit(jsonRequest({ name: '' }), CONTEXT);

    expect(response.status).toBe(400);

    const body = (await response.json()) as { field?: string };

    expect(body.field).toBe('name');
  });
});

describe('the hard delete route', () => {
  it('refuses an anonymous request with a 401', async () => {
    signIn();
    cookieJar.delete(SESSION_COOKIE);
    actor = null;

    const response = await remove(emptyRequest('DELETE'), CONTEXT);

    expect(response.status).toBe(401);
  });

  it('refuses a request with no valid CSRF token with a 403', async () => {
    signIn();
    csrfValid = false;

    const response = await remove(emptyRequest('DELETE'), CONTEXT);

    expect(response.status).toBe(403);
  });

  it('returns a 200 with the id and deleted: true', async () => {
    signIn();
    outcome = { report: { id: 'report-1' }, facts: null };

    const response = await remove(emptyRequest('DELETE'), CONTEXT);

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body['id']).toBe('report-1');
    expect(body['deleted']).toBe(true);
  });

  it('returns no stored field', async () => {
    signIn();
    outcome = { report: { id: 'report-1' }, facts: null };

    const response = await remove(emptyRequest('DELETE'), CONTEXT);

    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['deleted', 'id']);
  });

  it('calls the deletion use case', async () => {
    signIn();
    outcome = { report: { id: 'report-1' }, facts: null };

    await remove(emptyRequest('DELETE'), CONTEXT);

    expect(calledUseCase).toBe('reportDeletions');
  });

  it('maps the blocked deletion to a 409 pointing at Withdraw', async () => {
    signIn();
    outcome = new ConflictError(
      'Someone has responded to this report, so it can no longer be deleted. You can withdraw it instead, which closes it and keeps its history.',
    );

    const response = await remove(emptyRequest('DELETE'), CONTEXT);

    expect(response.status).toBe(409);

    const body = (await response.json()) as { error?: string };

    // **FR-10 requires the message to point at the Withdraw action.**
    expect(body.error).toContain('withdraw');
  });
});

describe('the withdrawal route', () => {
  it('refuses an anonymous request with a 401', async () => {
    signIn();
    cookieJar.delete(SESSION_COOKIE);
    actor = null;

    const response = await withdraw(emptyRequest('POST'), CONTEXT);

    expect(response.status).toBe(401);
  });

  it('refuses a request with no valid CSRF token with a 403', async () => {
    signIn();
    csrfValid = false;

    const response = await withdraw(emptyRequest('POST'), CONTEXT);

    expect(response.status).toBe(403);
  });

  it('returns a 200 with the status it reached', async () => {
    signIn();
    outcome = {
      report: { id: 'report-1', type: 'Found' },
      status: 'Closed',
      rejectedClaims: [{ claimId: 'claim-1' }],
      resolvedRecoveryResponses: [],
    };

    const response = await withdraw(emptyRequest('POST'), CONTEXT);

    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;

    expect(body['id']).toBe('report-1');
    expect(body['status']).toBe('Closed');
  });

  it('reports the counts of what the withdrawal ended', async () => {
    signIn();
    outcome = {
      report: { id: 'report-1', type: 'Found' },
      status: 'Closed',
      rejectedClaims: [{ claimId: 'claim-1' }, { claimId: 'claim-2' }],
      resolvedRecoveryResponses: [],
    };

    const response = await withdraw(emptyRequest('POST'), CONTEXT);

    const body = (await response.json()) as Record<string, unknown>;

    // **The counts are the member's answer to "what happened to my claim?"**
    expect(body['rejectedClaims']).toBe(2);
    expect(body['resolvedRecoveryResponses']).toBe(0);
  });

  it('returns no stored field', async () => {
    signIn();
    outcome = {
      report: { id: 'report-1', type: 'Found' },
      status: 'Closed',
      rejectedClaims: [],
      resolvedRecoveryResponses: [],
    };

    const response = await withdraw(emptyRequest('POST'), CONTEXT);

    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      'id',
      'rejectedClaims',
      'resolvedRecoveryResponses',
      'status',
    ]);
  });

  it('calls the withdrawal use case', async () => {
    signIn();
    outcome = {
      report: { id: 'report-1' },
      status: 'Closed',
      rejectedClaims: [],
      resolvedRecoveryResponses: [],
    };

    await withdraw(emptyRequest('POST'), CONTEXT);

    expect(calledUseCase).toBe('reportWithdrawals');
  });

  it('maps a refused withdrawal to a 409', async () => {
    signIn();
    outcome = new ConflictError('This report has already been closed, so it cannot be withdrawn.');

    const response = await withdraw(emptyRequest('POST'), CONTEXT);

    expect(response.status).toBe(409);
  });

  it('maps the service\'s own refusal to a 409', async () => {
    // **The refusal the service actually throws.** The test above uses the
    // shared `ConflictError`; the service throws `WithdrawalRefusedError`,
    // which is a *named kind* of it. If the two ever stopped being
    // related, the transport would fall through to its generic handler and
    // answer a **500** — telling the member the request failed for an
    // unknown reason rather than that their report cannot be withdrawn yet.
    //
    // **This is the test that found the bug.** The live smoke test returned
    // a 500 for a second withdrawal, and this assertion is why it cannot
    // come back.
    signIn();
    outcome = new WithdrawalRefusedError('This report has already been closed.');

    const response = await withdraw(emptyRequest('POST'), CONTEXT);

    expect(response.status).toBe(409);
  });

  it('carries the domain\'s message in the refusal', async () => {
    signIn();
    outcome = new WithdrawalRefusedError('This report has already been closed.');

    const response = await withdraw(emptyRequest('POST'), CONTEXT);
    const body = (await response.json()) as { error: string };

    expect(body.error).toBe('This report has already been closed.');
  });
});

describe('the administrator\'s edit route', () => {
  it('refuses an anonymous request with a 403', async () => {
    signIn();
    cookieJar.delete(SESSION_COOKIE);
    actor = null;

    const response = await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    // **Not a 401.** The route answers "are you an administrator?" and the
    // answer is no, whatever the reason.
    expect(response.status).toBe(403);
  });

  it('refuses a member who is not an administrator with a 403', async () => {
    signIn({ isAdministrator: false });

    const response = await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(403);
  });

  it('calls no use case when it refuses', async () => {
    signIn({ isAdministrator: false });

    await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(calledUseCase).toBeNull();
  });

  it('allows an administrator through', async () => {
    signIn({ isAdministrator: true });
    outcome = anEditOutcome();

    const response = await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(200);
  });

  it('calls the administrator use case', async () => {
    signIn({ isAdministrator: true });
    outcome = anEditOutcome();

    await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(calledUseCase).toBe('administratorEdits');
  });

  it('returns no stored field', async () => {
    signIn({ isAdministrator: true });
    outcome = anEditOutcome();

    const response = await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    const body = (await response.json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual(['changed', 'id', 'status', 'updatedAt']);
  });

  it('drops a status the body tried to set', async () => {
    signIn({ isAdministrator: true });
    outcome = anEditOutcome();

    await administratorEdit(jsonRequest({ name: 'New name', status: 'Open' }), CONTEXT);

    const request = receivedRequest as { changes: Record<string, unknown> };

    expect(request.changes).not.toHaveProperty('status');
  });

  it('maps a terminal report to a 409', async () => {
    signIn({ isAdministrator: true });
    outcome = new TerminalStateError('Closed reports cannot be edited.');

    const response = await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(409);
  });

  it('maps a validation failure to a 400 naming the field', async () => {
    signIn({ isAdministrator: true });
    outcome = new ValidationError('status', 'The field "status" cannot be changed.');

    const response = await administratorEdit(jsonRequest({ name: 'New name' }), CONTEXT);

    expect(response.status).toBe(400);

    const body = (await response.json()) as { field?: string };

    expect(body.field).toBe('status');
  });
});

describe('the report edit body parser', () => {
  it('reads each editable field by name', () => {
    const changes = parseReportEditBody({
      name: 'New name',
      category: 'Wallet',
      description: 'A newer description.',
      date: '2026-10-29',
      campusArea: 'library',
      exactPlace: 'Second floor',
      identifyingDetails: 'Monogram A.B.',
    });

    expect(changes.name).toBe('New name');
    expect(changes.category).toBe('Wallet');
    expect(changes.description).toBe('A newer description.');
    expect(changes.date).toBe('2026-10-29');
    expect(changes.campusArea).toBe('library');
    expect(changes.exactPlace).toBe('Second floor');
    expect(changes.identifyingDetails).toBe('Monogram A.B.');
  });

  it('drops an unknown key entirely', () => {
    const changes = parseReportEditBody({ secretLocation: 'the roof' });

    expect(Object.keys(changes)).not.toContain('secretLocation');
    expect(JSON.stringify(changes)).not.toContain('the roof');
  });

  it('drops the status, the type, and the reporter', () => {
    const changes = parseReportEditBody({
      name: 'New name',
      status: 'Closed',
      type: 'Lost',
      reporterId: 'someone-else',
    });

    // **The closed field set is enforced here,** one level above the
    // service. The edit structurally cannot carry a status.
    expect(Object.keys(changes).sort()).toEqual(['name']);
  });

  it('leaves an absent field absent', () => {
    const changes = parseReportEditBody({ name: 'New name' });

    // **Absent means "unchanged"** — not `null`, which would mean "set it to
    // nothing".
    expect(Object.keys(changes)).toEqual(['name']);
  });

  it('reads an explicit null as null', () => {
    const changes = parseReportEditBody({ exactPlace: null });

    expect(changes.exactPlace).toBeNull();
  });

  it('refuses a field that is present but not text', () => {
    // Silently dropping it would let the client believe it had set the
    // field.
    expect(() => parseReportEditBody({ name: 42 })).toThrow(ValidationError);
  });

  it('names the offending field in the refusal', () => {
    expect(() => parseReportEditBody({ name: 42 })).toThrow(/name/);
  });
});
