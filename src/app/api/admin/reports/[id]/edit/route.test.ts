/**
 * The `PATCH /api/admin/reports/[id]/edit` route's suite.
 *
 * **The route's own decisions are what is under test.** The terminal-status
 * block, the field whitelist, the validation, the change detection, and the
 * image replacement all live in the service; what lives *here* is the
 * transport layer's part — who may call it, the order of the checks, the
 * status codes, the messages, and the shape of the response.
 *
 * **The image replacement is the reason this route exists in its current
 * form.** FR-53 names image replacement as one of the eight editable things,
 * and the service implements it — but a JSON-only route could never reach
 * it, because the blob store's upload path takes bytes and bytes do not fit
 * in a JSON body. So the route accepts `multipart/form-data`, and these
 * tests are what hold that capability in place.
 *
 * **The route must not become a second, looser image path.** The 5 MB
 * ceiling and the three allowed content types are asserted here for the same
 * reason they are asserted on the creation route: a form that accepts a
 * 10 MB file is a hole in the byte ceiling.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TerminalStateError, ValidationError } from '@/lib/errors';

import { ImageRejectedError, ImageStorageError } from '@/application/listings/ports/image-store';

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
let editOutcome: unknown = null;

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
    administratorEdits: {
      edit: async (request: unknown) => {
        receivedRequest = request;
        useCaseReached = true;

        if (editOutcome instanceof Error) {
          throw editOutcome;
        }

        return editOutcome;
      },
    },
  }),
}));

const { PATCH } = await import('./route');

const ADMINISTRATOR_ID = '00000000-0000-4000-8000-000000000821';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The report being edited. */
const REPORT_ID = '00000000-0000-4000-8000-000000000823';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: REPORT_ID }) };

/** A JSON request carrying the body the route reads. */
function jsonRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/admin/reports/${REPORT_ID}/edit`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * A multipart request carrying the text fields and, optionally, an image.
 *
 * **The image part is a real `File`**, because the route reads it through
 * the same reader the creation route uses — and that reader checks the
 * part's declared type and size.
 */
function multipartRequest(
  fields: Record<string, string>,
  image?: { bytes: Buffer; type: string; name: string },
): Request {
  const form = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  if (image) {
    form.append(
      'image',
      new File([new Uint8Array(image.bytes)], image.name, { type: image.type }),
    );
  }

  return new Request(`http://localhost/api/admin/reports/${REPORT_ID}/edit`, {
    method: 'PATCH',
    body: form,
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

  editOutcome = {
    outcome: { kind: 'Changed', snapshots: [] },
    report: {
      id: REPORT_ID,
      status: 'Open',
      updatedAt: new Date('2026-10-30T12:00:00.000Z'),
    },
    event: { type: 'report.edited_by_administrator' },
  };

  receivedRequest = null;
  useCaseReached = false;
});

// ── The refusals ────────────────────────────────────────────────────────────

describe('the administrator edit route', () => {
  describe('the refusals', () => {
    it('refuses an anonymous request with a 403', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a member who is not an administrator with a 403', async () => {
      actor = { ...(actor as object), isAdministrator: false };

      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(response.status).toBe(403);
    });

    it('refuses a content type it does not read with a 400', async () => {
      const request = new Request(`http://localhost/api/admin/reports/${REPORT_ID}/edit`, {
        method: 'PATCH',
        headers: { 'content-type': 'text/plain' },
        body: 'name=New name',
      });

      const response = await PATCH(request, CONTEXT);

      expect(response.status).toBe(400);
      expect(useCaseReached).toBe(false);
    });
  });

  // ── The order of the checks ───────────────────────────────────────────────

  describe('the order of the checks', () => {
    it('checks the actor before the CSRF token', async () => {
      actor = { ...(actor as object), isAdministrator: false };
      csrfValid = false;

      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('You do not have access to this.');
      expect(useCaseReached).toBe(false);
    });

    it('checks the CSRF token before the body', async () => {
      csrfValid = false;

      const response = await PATCH(jsonRequest({}), CONTEXT);

      expect(response.status).toBe(403);
      expect((await bodyOf(response))['error']).toBe('Your request could not be verified.');
      expect(useCaseReached).toBe(false);
    });

    it('never reaches the use case when the actor is refused', async () => {
      actor = { ...(actor as object), isAdministrator: false };

      await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(useCaseReached).toBe(false);
      expect(receivedRequest).toBeNull();
    });
  });

  // ── The image replacement ─────────────────────────────────────────────────

  describe('the image replacement', () => {
    it('hands the replacement image to the use case', async () => {
      const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xda]);

      await PATCH(
        multipartRequest(
          { name: 'New name' },
          { bytes, type: 'image/jpeg', name: 'replacement.jpg' },
        ),
        CONTEXT,
      );

      const sent = receivedRequest as { image: { bytes: Buffer; contentType: string } };

      // **The bytes reach the use case intact.** The blob store's upload path
      // takes bytes, and a route that re-encoded them would be a second
      // image path with its own rules.
      expect(sent.image.bytes.equals(bytes)).toBe(true);
      expect(sent.image.contentType).toBe('image/jpeg');
    });

    it('replaces the image without changing any text field', async () => {
      const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xda]);

      await PATCH(
        multipartRequest({}, { bytes, type: 'image/jpeg', name: 'replacement.jpg' }),
        CONTEXT,
      );

      const sent = receivedRequest as { changes: Record<string, unknown>; image: unknown };

      expect(sent.image).not.toBeNull();
      expect(sent.changes).toEqual({});
    });

    it('changes the text fields without replacing the image', async () => {
      await PATCH(multipartRequest({ name: 'New name' }), CONTEXT);

      const sent = receivedRequest as { changes: Record<string, unknown>; image: unknown };

      expect(sent.changes).toEqual({ name: 'New name' });
      expect(sent.image).toBeNull();
    });

    it('refuses an image part of a type the PRD does not name with a 400', async () => {
      const bytes = Buffer.from('GIF89a');

      const response = await PATCH(
        multipartRequest({}, { bytes, type: 'image/gif', name: 'replacement.gif' }),
        CONTEXT,
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['field']).toBe('image');
      expect(useCaseReached).toBe(false);
    });

    it('refuses an image larger than 5 MB with a 400', async () => {
      const bytes = Buffer.alloc(5 * 1024 * 1024 + 1, 0x41);

      const response = await PATCH(
        multipartRequest({}, { bytes, type: 'image/jpeg', name: 'too-big.jpg' }),
        CONTEXT,
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['field']).toBe('image');
      expect(useCaseReached).toBe(false);
    });

    it('answers a rejected image with a 400', async () => {
      editOutcome = new ImageRejectedError('That file is not a JPEG, PNG, or WebP image.');

      const response = await PATCH(
        multipartRequest({}, { bytes: Buffer.from([0xff, 0xd8]), type: 'image/jpeg', name: 'x.jpg' }),
        CONTEXT,
      );

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['field']).toBe('image');
    });

    it('answers a failed upload with a 503', async () => {
      // **A rejected image and a failed store are different answers.** The
      // first is the administrator's submission being wrong (400); the second
      // is the infrastructure being unavailable (503).
      editOutcome = new ImageStorageError('The blob store did not respond.');

      const response = await PATCH(
        multipartRequest({}, { bytes: Buffer.from([0xff, 0xd8]), type: 'image/jpeg', name: 'x.jpg' }),
        CONTEXT,
      );

      expect(response.status).toBe(503);
    });
  });

  // ── The JSON path ─────────────────────────────────────────────────────────

  describe('the JSON path', () => {
    it('hands the text-field changes to the use case', async () => {
      await PATCH(jsonRequest({ name: 'New name', description: 'New description' }), CONTEXT);

      const sent = receivedRequest as { changes: Record<string, unknown> };

      expect(sent.changes).toEqual({ name: 'New name', description: 'New description' });
    });

    it('hands no image to the use case', async () => {
      await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      const sent = receivedRequest as { image: unknown };

      expect(sent.image).toBeNull();
    });

    it('drops a field the administrator may not change', async () => {
      await PATCH(jsonRequest({ name: 'New name', status: 'Closed', type: 'Found' }), CONTEXT);

      const sent = receivedRequest as { changes: Record<string, unknown> };

      // **The status and the type are not editable** — FR-53's whitelist is
      // a whitelist, and the parser drops what is not on it before the
      // service ever sees it.
      expect(sent.changes).toEqual({ name: 'New name' });
    });
  });

  // ── The success answer ────────────────────────────────────────────────────

  describe('the success answer', () => {
    it('returns the report id, status, timestamp, and whether anything changed', async () => {
      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(response.status).toBe(200);

      const body = await bodyOf(response);

      expect(body['id']).toBe(REPORT_ID);
      expect(body['status']).toBe('Open');
      expect(body['updatedAt']).toBe('2026-10-30T12:00:00.000Z');
      expect(body['changed']).toBe(true);
    });

    it('reports an edit that changed nothing as not changed', async () => {
      editOutcome = {
        outcome: { kind: 'Unchanged' },
        report: {
          id: REPORT_ID,
          status: 'Open',
          updatedAt: new Date('2026-10-30T12:00:00.000Z'),
        },
        event: null,
      };

      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect((await bodyOf(response))['changed']).toBe(false);
    });

    it('carries no stored field', async () => {
      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      // **The response body is asserted key by key.** The name and the
      // description are FR-37 Sensitive Fields.
      expect(Object.keys(await bodyOf(response)).sort()).toEqual([
        'changed',
        'id',
        'status',
        'updatedAt',
      ]);
    });
  });

  // ── The domain's refusals ─────────────────────────────────────────────────

  describe("the domain's refusals", () => {
    it('answers a terminal report with a 409', async () => {
      editOutcome = new TerminalStateError('A closed report cannot be edited.');

      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(response.status).toBe(409);
    });

    it('answers a field rule failure with a 400 that names the field', async () => {
      editOutcome = new ValidationError('name', 'The name is too long.');

      const response = await PATCH(jsonRequest({ name: 'New name' }), CONTEXT);

      expect(response.status).toBe(400);
      expect((await bodyOf(response))['field']).toBe('name');
    });
  });

  // ── What the route hands the use case ─────────────────────────────────────

  describe('what the route hands the use case', () => {
    it('takes the actor from the session, never from the body', async () => {
      await PATCH(
        jsonRequest({ name: 'New name', isAdministrator: false, actorId: 'someone' }),
        CONTEXT,
      );

      const sent = receivedRequest as { actor: { actorId: string } };

      expect(sent.actor.actorId).toBe(ADMINISTRATOR_ID);
    });

    it('takes the report id from the route, never from the body', async () => {
      await PATCH(jsonRequest({ name: 'New name', reportId: 'another-report' }), CONTEXT);

      const sent = receivedRequest as { reportId: string };

      expect(sent.reportId).toBe(REPORT_ID);
    });
  });
});
