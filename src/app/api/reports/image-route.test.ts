/**
 * The image delivery route's suite.
 *
 * **The load-bearing assertions are the headers and the refusals.** A
 * delivered image carries exactly the four headers `image-handling.md` §3
 * requires, and — the assertion that matters most — it carries **no
 * `s-maxage`**. A shared cache keyed on the URL would serve one member's
 * image to another member, and no header combination can undo that once the
 * bytes are cached.
 *
 * **The refusals are all 404s, and all the same one.** An anonymous
 * visitor, a member the service refuses, and a report with no image all
 * receive the same answer. A 403 would confirm that the report exists —
 * which is exactly what a refused viewer must not learn.
 *
 * **The route is driven through its real seams.** `next/headers` is mocked
 * (it needs a request scope), and the composition roots are mocked so the
 * route's *own* logic — the actor resolution, the headers, the status
 * codes, and the body — is what is under test. The service's own refusals
 * are tested in the service's suite.
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

/** The delivery request the route handed to the use case. */
let receivedRequest: unknown = null;

/** The delivery outcome, or the error it throws. */
let deliveryOutcome: unknown = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: true }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    imageDelivery: {
      deliver: async (requestActor: unknown, reportId: string) => {
        receivedRequest = { actor: requestActor, reportId };

        if (deliveryOutcome instanceof Error) {
          throw deliveryOutcome;
        }

        return deliveryOutcome;
      },
    },
  }),
}));

const { GET: IMAGE } = await import('./[id]/image/route');

const { NotFoundError } = await import('@/lib/errors');
const { ImageNotFoundError, ImageReadError } = await import(
  '@/application/listings/ports/image-reader'
);

const SESSION_COOKIE = '__Host-fb';
const MEMBER_ID = '00000000-0000-4000-8000-000000000811';

const IMAGE_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);

/**
 * Give the request a session.
 *
 * **The actor is only ever derived from the session.** The route reads the
 * `__Host-fb` cookie and resolves it; a request with no cookie has no actor,
 * whatever else the caller might send.
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

/** An image request. */
function imageRequest(id = 'report-1'): Request {
  return new Request(`http://localhost/api/reports/${id}/image`);
}

/** The route's context. */
function context(id = 'report-1'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('the image delivery route', () => {
  beforeEach(() => {
    cookieJar.clear();
    headerJar.clear();
    actor = null;
    receivedRequest = null;
    deliveryOutcome = { bytes: IMAGE_BYTES, contentType: 'image/jpeg' };
  });

  describe('the delivery', () => {
    it('serves the image bytes', async () => {
      withSession();
      actor = aMember();

      const response = await IMAGE(imageRequest(), context());

      expect(response.status).toBe(200);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(IMAGE_BYTES);
    });

    it('serves the server-set content type', async () => {
      withSession();
      actor = aMember();
      deliveryOutcome = { bytes: IMAGE_BYTES, contentType: 'image/png' };

      const response = await IMAGE(imageRequest(), context());

      expect(response.headers.get('content-type')).toBe('image/png');
    });

    it('passes the actor and the report id to the use case', async () => {
      withSession();
      actor = aMember();

      await IMAGE(imageRequest('report-42'), context('report-42'));

      expect(receivedRequest).toEqual({ actor: aMember(), reportId: 'report-42' });
    });

    it('passes a null actor when the request carries no session', async () => {
      // **The cookie is the identity.** A request with no cookie has no
      // actor, and the route passes that null through to the use case —
      // the *service* refuses it, before anything is loaded. The route does
      // not re-implement the refusal.
      await IMAGE(imageRequest(), context());

      expect(receivedRequest).toEqual({ actor: null, reportId: 'report-1' });
    });
  });

  describe('the delivery headers', () => {
    it('sets nosniff', async () => {
      withSession();
      actor = aMember();

      const response = await IMAGE(imageRequest(), context());

      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('sets inline disposition', async () => {
      withSession();
      actor = aMember();

      const response = await IMAGE(imageRequest(), context());

      expect(response.headers.get('content-disposition')).toBe('inline');
    });

    it('sets a private, no-cache cache control', async () => {
      withSession();
      actor = aMember();

      const response = await IMAGE(imageRequest(), context());

      expect(response.headers.get('cache-control')).toBe('private, no-cache');
    });

    it('never sets s-maxage', async () => {
      // **The assertion that matters most.** A shared cache keyed on the URL
      // would serve one member's image to another member, and no header
      // combination can undo that once the bytes are cached.
      withSession();
      actor = aMember();

      const response = await IMAGE(imageRequest(), context());

      expect(response.headers.get('s-maxage')).toBeNull();
      expect(response.headers.get('cache-control')).not.toContain('s-maxage');
    });

    it('sets the content length', async () => {
      withSession();
      actor = aMember();

      const response = await IMAGE(imageRequest(), context());

      expect(response.headers.get('content-length')).toBe(String(IMAGE_BYTES.length));
    });
  });

  describe('the refusals', () => {
    it('answers a refused viewer with a 404', async () => {
      withSession();
      actor = aMember();
      deliveryOutcome = new NotFoundError('That image could not be found.');

      const response = await IMAGE(imageRequest(), context());

      expect(response.status).toBe(404);
    });

    it('answers a missing blob with a 404', async () => {
      withSession();
      actor = aMember();
      deliveryOutcome = new ImageNotFoundError();

      const response = await IMAGE(imageRequest(), context());

      expect(response.status).toBe(404);
    });

    it('gives every refusal the same body', async () => {
      // **The refusals are indistinguishable.** A refused viewer must not be
      // able to tell "you may not have this image" from "there is no image
      // here" — that difference would itself be information.
      withSession();
      actor = aMember();

      const bodies: string[] = [];

      for (const outcome of [
        new NotFoundError('That image could not be found.'),
        new ImageNotFoundError(),
      ]) {
        deliveryOutcome = outcome;

        const response = await IMAGE(imageRequest(), context());

        bodies.push(await response.text());
      }

      expect(new Set(bodies).size).toBe(1);
    });

    it('answers a read failure with a 500 and a neutral message', async () => {
      // **A read failure is never a partial or a wrong-type body**
      // (image-handling §5). There is nothing to serve but an error.
      withSession();
      actor = aMember();
      deliveryOutcome = new ImageReadError('the store is down at store-7.internal');

      const response = await IMAGE(imageRequest(), context());

      expect(response.status).toBe(500);
      expect(await response.text()).not.toContain('store-7.internal');
    });

    it('answers the service\'s refusal with a 404', async () => {
      // **The route maps the refusal; it does not decide it.** An anonymous
      // visitor, an unrelated member, a claimant, and a recovery responder
      // all arrive here as the service's refusal, and all get this answer.
      deliveryOutcome = new NotFoundError('That image could not be found.');

      const response = await IMAGE(imageRequest(), context());

      expect(response.status).toBe(404);
    });
  });
});
