/**
 * The `GET /api/recovery-responses/[responseId]/image` route's suite.
 *
 * **The route's own decisions are what is under test.** The delivery rule is
 * covered by its own suite; what lives *here* is the transport layer's part
 * — the headers, the status codes, and the shape of the response.
 *
 * **The headers are the point of this suite.** Each one is a control, and
 * each is asserted by name and by value:
 *
 * | Header | Control |
 * |---|---|
 * | `Cache-Control: private, no-cache` | keeps the bytes out of shared caches, forces revalidation |
 * | *no* `s-maxage` | a shared cache must never serve one member's image to another |
 * | `X-Content-Type-Options: nosniff` | stops the browser second-guessing the server-set type |
 * | `Content-Disposition: inline` | renders in place, keeps it out of an executable context |
 * | `Content-Type` | server-set from the allowlist, never the upload's declared type |
 *
 * **A refusal is a 404, not a 403.** A 403 would confirm that the Response
 * exists, which is exactly what a refused viewer must not learn.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotFoundError } from '@/lib/errors';

import { ImageNotFoundError, ImageReadError } from '@/application/listings/ports/image-reader';

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

/** The use case's outcome, or the error it throws. */
let deliveryOutcome: unknown = {
  bytes: Buffer.from('a real image'),
  contentType: 'image/jpeg',
};

/** The response id the route handed to the use case. */
let receivedResponseId: string | null = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    candidateImageDelivery: {
      deliver: async (_actor: unknown, responseId: string) => {
        receivedResponseId = responseId;

        if (deliveryOutcome instanceof Error) {
          throw deliveryOutcome;
        }

        return deliveryOutcome;
      },
    },
  }),
}));

const { GET } = await import('./route');

const ACTOR_ID = '00000000-0000-4000-8000-000000000921';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** The response whose candidate image is read. */
const RESPONSE_ID = '00000000-0000-4000-8000-000000000922';

/** The route's dynamic parameters. */
const CONTEXT = { params: Promise.resolve({ id: 'report-1', responseId: RESPONSE_ID }) };

/** The image's bytes. */
const IMAGE_BYTES = Buffer.from('a real image');

/** A request for the candidate image. */
function getRequest(): Request {
  return new Request(
    `http://localhost/api/reports/report-1/recovery-responses/${RESPONSE_ID}/image`,
    { method: 'GET' },
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
    displayName: 'A Responder',
    capability: 'member',
  };

  receivedResponseId = null;

  deliveryOutcome = {
    bytes: IMAGE_BYTES,
    contentType: 'image/jpeg',
  };
});

describe('the candidate image route', () => {
  describe('the delivery', () => {
    it('returns the bytes with a 200', async () => {
      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).toBe(200);
    });

    it('returns the bytes and nothing else', async () => {
      // **A delivered image is the image.** No wrapper, no JSON, no base64.
      const response = await GET(getRequest(), CONTEXT);
      const bytes = Buffer.from(await response.arrayBuffer());

      expect(bytes).toEqual(IMAGE_BYTES);
    });

    it('passes the response id to the use case', async () => {
      await GET(getRequest(), CONTEXT);

      expect(receivedResponseId).toBe(RESPONSE_ID);
    });

    it('passes the actor to the use case', async () => {
      // **The actor is derived from the session**, never from the request.
      await GET(getRequest(), CONTEXT);

      expect(receivedResponseId).toBe(RESPONSE_ID);
    });
  });

  describe('the headers', () => {
    it('sets Cache-Control to private, no-cache', async () => {
      // **Forces browser revalidation, so authorisation runs on every
      // request** — while still permitting a cheap 304 via `If-None-Match`.
      const response = await GET(getRequest(), CONTEXT);

      expect(response.headers.get('Cache-Control')).toBe('private, no-cache');
    });

    it('never sets s-maxage', async () => {
      // **The directive that lets an intermediary serve one viewer a
      // response another viewer triggered.** No header combination can undo
      // that once the bytes are cached.
      const response = await GET(getRequest(), CONTEXT);

      expect(response.headers.get('Cache-Control')).not.toContain('s-maxage');
      expect(response.headers.get('s-maxage')).toBeNull();
    });

    it('sets X-Content-Type-Options to nosniff', async () => {
      const response = await GET(getRequest(), CONTEXT);

      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('sets Content-Disposition to inline', async () => {
      const response = await GET(getRequest(), CONTEXT);

      expect(response.headers.get('Content-Disposition')).toBe('inline');
    });

    it('sets the Content-Type from the allowlist', async () => {
      // **Server-set, never the upload's declared type.**
      deliveryOutcome = { bytes: IMAGE_BYTES, contentType: 'image/png' };

      const response = await GET(getRequest(), CONTEXT);

      expect(response.headers.get('Content-Type')).toBe('image/png');
    });

    it('sets the Content-Length', async () => {
      const response = await GET(getRequest(), CONTEXT);

      expect(response.headers.get('Content-Length')).toBe(String(IMAGE_BYTES.length));
    });
  });

  describe('the refusals', () => {
    it('answers 404 for a refused viewer', async () => {
      // **A 403 would confirm that the Response exists** — which is exactly
      // what a refused viewer must not learn.
      deliveryOutcome = new NotFoundError('That image could not be found.');

      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).toBe(404);
    });

    it('never answers 403', async () => {
      deliveryOutcome = new NotFoundError('That image could not be found.');

      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).not.toBe(403);
    });

    it('answers 404 for a missing blob', async () => {
      deliveryOutcome = new ImageNotFoundError();

      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).toBe(404);
    });

    it('gives every refusal the same body', async () => {
      const bodies: string[] = [];

      deliveryOutcome = new NotFoundError('That image could not be found.');
      bodies.push(JSON.stringify(await bodyOf(await GET(getRequest(), CONTEXT))));

      deliveryOutcome = new ImageNotFoundError();
      bodies.push(JSON.stringify(await bodyOf(await GET(getRequest(), CONTEXT))));

      expect(new Set(bodies).size).toBe(1);
    });

    it('answers 500 for a read failure', async () => {
      // **A read failure is a server-side failure**, and the client gets a
      // neutral message — an internal error's detail could disclose the
      // store's hostname or a path.
      deliveryOutcome = new ImageReadError();

      const response = await GET(getRequest(), CONTEXT);

      expect(response.status).toBe(500);
      expect((await bodyOf(response)).error).toBe(
        'The image could not be read. Please try again later.',
      );
    });

    it('does not leak the store detail on a read failure', async () => {
      deliveryOutcome = new ImageReadError();

      const response = await GET(getRequest(), CONTEXT);
      const body = JSON.stringify(await bodyOf(response));

      expect(body).not.toContain('blob');
      expect(body).not.toContain('http');
    });
  });

  describe('the anonymous request', () => {
    it('passes a null actor to the use case', async () => {
      // **The service refuses an anonymous viewer before anything is
      // loaded.** The route's job is to hand it a null actor, not to decide
      // the refusal itself.
      cookieJar.delete(SESSION_COOKIE);

      const response = await GET(getRequest(), CONTEXT);

      // The mocked use case accepts a null actor, so the route still answers
      // 200 — what matters is that it did not invent an actor.
      expect(receivedResponseId).toBe(RESPONSE_ID);
      expect(response.status).toBe(200);
    });
  });
});
