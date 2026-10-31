/**
 * The `POST /api/reports` route's suite.
 *
 * **The load-bearing assertion is the "never stored beyond FR-8" one.** A
 * request body carrying extra keys must produce a stored row with exactly
 * the table's columns and no more — and that assertion is on the
 * **database row**, not on the response. A response-level assertion would
 * pass even if the extra key had been written to a column and then dropped
 * before the client saw it, which is the failure FR-8 exists to prevent.
 *
 * **The route is driven through its real seams.** `next/headers` is mocked
 * (it needs a request scope), and the two composition roots are mocked so
 * the route's *own* logic — the parse, the refusals, the status codes, and
 * the response shape — is what is under test.
 *
 * **The parser is tested separately, in the same file.** The parse is where
 * the closed field set is enforced, and it is the part that has to be right
 * about *which keys were read*.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { MalformedRequestError, parseReportBody } from './parse-report-request';

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
// actor, the CSRF verdict, and the use case's outcome.

/** The actor the resolver returns. */
let actor: unknown = null;

/** The CSRF verdict. */
let csrfValid = true;

/** The use case's outcome, or the error it throws. */
let createOutcome: unknown = null;

/** The draft the route handed to the use case. */
let receivedDraft: unknown = null;

/** The image the route handed to the use case. */
let receivedImage: unknown = null;

vi.mock('@/infrastructure/accounts/identity-stack', () => ({
  buildIdentityStack: () => ({
    resolver: { resolve: async () => actor },
    csrf: { validate: () => ({ valid: csrfValid }) },
    tokens: { hashToken: (token: string) => `hash:${token}` },
  }),
}));

vi.mock('@/infrastructure/listings/listings-stack', () => ({
  buildListingsStack: () => ({
    reports: {
      create: async (request: { draft: unknown; image: unknown }) => {
        receivedDraft = request.draft;
        receivedImage = request.image;

        if (createOutcome instanceof Error) {
          throw createOutcome;
        }

        return createOutcome;
      },
    },
  }),
}));

const { POST } = await import('./route');

const connectionString = process.env.DATABASE_URL;
const describeWithDatabase = connectionString ? describe : describe.skip;

const ACTOR_ID = '00000000-0000-4000-8000-000000000701';
const SESSION_TOKEN = 'a-session-token';

/** The session cookie's name — the same one the helper reads. */
const SESSION_COOKIE = '__Host-fb';

/** A body with every required field and one extra key. */
function aBody(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'Lost',
    name: 'Brown leather wallet',
    category: 'Wallet',
    description: 'A brown leather wallet with a folded receipt inside.',
    date: '2026-10-28',
    campusArea: 'library',
    exactPlace: null,
    identifyingDetails: null,
    ...extra,
  };
}

/** A JSON request. */
function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A multipart request carrying an image part. */
function multipartRequest(): Request {
  const form = new FormData();

  form.set('type', 'Lost');
  form.set('name', 'Brown leather wallet');
  form.set('category', 'Wallet');
  form.set('description', 'A brown leather wallet with a folded receipt inside.');
  form.set('date', '2026-10-28');
  form.set('campusArea', 'library');
  form.set(
    'image',
    new File([Buffer.from([0xff, 0xd8, 0xff, 0xe0])], 'photo.jpg', { type: 'image/jpeg' }),
  );

  return new Request('http://localhost/api/reports', { method: 'POST', body: form });
}

describe('the reports route', () => {
  beforeEach(() => {
    cookieJar.clear();
    headerJar.clear();

    // The route resolves the actor from the session cookie, so a signed-in
    // request carries one. The anonymous case below clears it.
    cookieJar.set(SESSION_COOKIE, SESSION_TOKEN);

    actor = {
      actorId: ACTOR_ID,
      status: 'Active',
      isAdministrator: false,
      displayName: 'The Reporter',
      capability: 'member',
    };

    csrfValid = true;

    createOutcome = {
      report: {
        id: 'a-minted-id',
        type: 'Lost',
        status: 'Open',
        createdAt: new Date('2026-10-28T12:00:00.000Z'),
        updatedAt: new Date('2026-10-28T12:00:00.000Z'),
      },
      event: { type: 'report.created' },
    };

    receivedDraft = null;
    receivedImage = null;
  });

  describe('the refusals', () => {
    it('refuses an anonymous request with a 401', async () => {
      // No session cookie at all — the actor cannot be determined.
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(401);
    });

    it('refuses a Pending actor with a 403', async () => {
      // FR-2: a Pending account can do nothing except wait.
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(403);
    });

    it('refuses a Pending actor’s upload with a 403', async () => {
      // **The refusal covers the upload, not just the text fields.** A
      // Pending member attaching an image is refused exactly as a Pending
      // member sending a JSON body is — and the gate sits *before* the
      // body is read, so the bytes are never even pulled in.
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      const response = await POST(multipartRequest());

      expect(response.status).toBe(403);
    });

    it('stores nothing when it refuses a Pending actor’s upload', async () => {
      actor = { ...(actor as object), status: 'Pending', capability: 'none' };

      await POST(multipartRequest());

      // **A refusal leaves no trace.** The image never reached the use
      // case, so no blob was written and no report row was created.
      expect(receivedImage).toBeNull();
      expect(receivedDraft).toBeNull();
    });

    it('refuses a request with no valid CSRF token with a 403', async () => {
      csrfValid = false;

      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(403);
    });

    it('stores nothing when it refuses', async () => {
      cookieJar.delete(SESSION_COOKIE);
      actor = null;

      await POST(jsonRequest(aBody()));

      // The body was never even parsed — a refusal leaves no trace.
      expect(receivedDraft).toBeNull();
    });
  });

  describe('the parse', () => {
    it('refuses a malformed body with a 400', async () => {
      const response = await POST(jsonRequest({ type: 'Lost' }));

      // The required fields are absent, so the request could not be
      // understood at all.
      expect(response.status).toBe(400);
    });

    it('refuses a non-object body with a 400', async () => {
      const response = await POST(jsonRequest(['not', 'an', 'object']));

      expect(response.status).toBe(400);
    });

    it('refuses a body that is not JSON with a 400', async () => {
      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not json',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('refuses an unknown content type with a 400', async () => {
      const request = new Request('http://localhost/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'name=A wallet',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it('refuses a body whose type is neither Lost nor Found with a 400', async () => {
      const response = await POST(jsonRequest(aBody({ type: 'Misplaced' })));

      expect(response.status).toBe(400);
    });

    it('names the offending field in the 400 response', async () => {
      const response = await POST(jsonRequest({ type: 'Lost' }));

      const body = (await response.json()) as { error?: string; field?: string };

      expect(body.field).toBeDefined();
    });
  });

  describe('the success path', () => {
    it('returns a 201 with the id and no stored field', async () => {
      const response = await POST(jsonRequest(aBody()));

      expect(response.status).toBe(201);

      const body = (await response.json()) as Record<string, unknown>;

      expect(body['id']).toBe('a-minted-id');
      expect(body['type']).toBe('Lost');
      expect(body['status']).toBe('Open');
    });

    it('returns no Sensitive Field and no stored field at all', async () => {
      const response = await POST(jsonRequest(aBody()));

      const body = (await response.json()) as Record<string, unknown>;

      // The write path returns the id and the timestamps — nothing else.
      // The creator's own view of their report is a **read** concern, and
      // bolt `009` owns it.
      expect(Object.keys(body).sort()).toEqual([
        'createdAt',
        'id',
        'status',
        'type',
        'updatedAt',
      ]);
    });

    it('never echoes the name, the description, or the exact place', async () => {
      const response = await POST(
        jsonRequest(aBody({ exactPlace: 'Second floor, east stacks' })),
      );

      const text = JSON.stringify(await response.json());

      expect(text).not.toContain('Brown leather wallet');
      expect(text).not.toContain('folded receipt');
      expect(text).not.toContain('Second floor');
    });

    it('points at the report it created', async () => {
      const response = await POST(jsonRequest(aBody()));

      expect(response.headers.get('Location')).toBe('/api/reports/a-minted-id');
    });

    it('derives the reporter from the actor, never from the body', async () => {
      await POST(jsonRequest(aBody({ reporterId: 'a-client-asserted-id' })));

      // The body's `reporterId` was dropped at the parse boundary.
      expect(receivedDraft).not.toHaveProperty('reporterId');
    });

    it('hands the use case no image for a JSON request', async () => {
      await POST(jsonRequest(aBody()));

      // **The image is never in the JSON body.** It is uploaded as a
      // multipart part, and a JSON request has none — so the use case is
      // handed an explicit absence, and the compensating write has
      // nothing to roll back.
      expect(receivedImage).toBeNull();
    });
  });
});

describe('the report body parser', () => {
  it('reads each field by name', () => {
    const draft = parseReportBody(aBody());

    expect(draft.type).toBe('Lost');
    expect(draft.name).toBe('Brown leather wallet');
    expect(draft.category).toBe('Wallet');
    expect(draft.description).toBe(
      'A brown leather wallet with a folded receipt inside.',
    );
    expect(draft.date).toBe('2026-10-28');
    expect(draft.campusArea).toBe('library');
  });

  it('drops an unknown key entirely', () => {
    const draft = parseReportBody(aBody({ secretLocation: 'the roof' }));

    // The key is not in the draft at all — not dropped later, never
    // carried.
    expect(Object.keys(draft)).not.toContain('secretLocation');
    expect(JSON.stringify(draft)).not.toContain('the roof');
  });

  it('drops every unknown key', () => {
    const draft = parseReportBody(
      aBody({ extraOne: 'a', extraTwo: 'b', reporterId: 'c' }),
    );

    expect(Object.keys(draft).sort()).toEqual([
      'campusArea',
      'category',
      'date',
      'description',
      'exactPlace',
      'identifyingDetails',
      'name',
      'type',
    ]);
  });

  it('reads an absent optional field as an explicit absence', () => {
    const draft = parseReportBody(aBody({ exactPlace: undefined }));

    expect(draft.exactPlace).toBeNull();
  });

  it('refuses a required field that is absent', () => {
    const body = aBody();

    delete body['name'];

    expect(() => parseReportBody(body)).toThrow(MalformedRequestError);
  });

  it('refuses a required field that is not a string', () => {
    expect(() => parseReportBody(aBody({ name: 42 }))).toThrow(MalformedRequestError);
  });

  it('refuses an optional field that is present but not a string', () => {
    // Silently dropping it would let the client believe it had set the
    // field.
    expect(() => parseReportBody(aBody({ exactPlace: 42 }))).toThrow(
      MalformedRequestError,
    );
  });

  it('refuses a type that is neither Lost nor Found', () => {
    expect(() => parseReportBody(aBody({ type: 'Misplaced' }))).toThrow(
      MalformedRequestError,
    );
  });
});

describeWithDatabase('the reports route, against a live database', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: connectionString! }),
  });

  beforeEach(async () => {
    cookieJar.clear();
    headerJar.clear();

    // The route's own stack is mocked above, so this suite drives the
    // **real** repository directly: the parse result is written through the
    // real `PrismaReportRepository`, and the stored row is read back with
    // raw SQL.
    actor = {
      actorId: ACTOR_ID,
      status: 'Active',
      isAdministrator: false,
      displayName: 'The Reporter',
      capability: 'member',
    };

    csrfValid = true;

    await prisma.$executeRawUnsafe('DELETE FROM "reports"');

    await prisma.$executeRawUnsafe(
      `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                               "selfDeclaredRole", "status", "isAdministrator")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT ("id") DO NOTHING`,
      ACTOR_ID,
      'reporter@example.test',
      'not-a-real-hash',
      'The Reporter',
      'Student',
      'Active',
      false,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DELETE FROM "reports"');
    await prisma.$executeRawUnsafe('DELETE FROM "accounts" WHERE "id" = $1', ACTOR_ID);
    await prisma.$disconnect();
  });

  /** The physical column names of the `reports` table. */
  async function reportColumnNames(): Promise<string[]> {
    const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'reports'
       ORDER BY ordinal_position`,
    );

    return rows.map((row) => row.column_name);
  }

  /** Write the parsed draft through the real repository. */
  async function store(draft: unknown): Promise<void> {
    const { PrismaReportRepository } = await import(
      '@/infrastructure/listings/prisma-report-repository'
    );
    const { validateReportDraft } = await import('@/domain/listings');

    const repository = new PrismaReportRepository(prisma);

    const validated = validateReportDraft(
      draft as never,
      {
        now: new Date('2026-10-28T12:00:00.000Z'),
        campusAreas: [{ value: 'library', label: 'Library', active: true }],
        imageRef: null,
      },
    );

    await prisma.$transaction(async (tx) =>
      repository.create(
        crypto.randomUUID(),
        { ...validated, reporterId: ACTOR_ID },
        { transaction: tx },
      ),
    );
  }

  it('stores nothing beyond the fourteen columns for a body carrying extra keys', async () => {
    // The load-bearing assertion: the extra keys are dropped **at the
    // parse boundary**, so the stored row has exactly the table's columns
    // and no more.
    const draft = parseReportBody(
      aBody({
        secretLocation: 'the roof',
        reporterId: 'a-client-asserted-id',
        imageUrl: 'https://example.org/elsewhere.jpg',
      }),
    );

    await store(draft);

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT * FROM "reports"',
    );

    const columns = await reportColumnNames();

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([...columns].sort());
  });

  it('stores no value from an extra key', async () => {
    const draft = parseReportBody(aBody({ secretLocation: 'the roof' }));

    await store(draft);

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      'SELECT * FROM "reports"',
    );

    expect(JSON.stringify(rows[0])).not.toContain('the roof');
    expect(JSON.stringify(rows[0])).not.toContain('a-client-asserted-id');
  });

  it('stores the reporter the route derived, never one the body asserted', async () => {
    const draft = parseReportBody(aBody({ reporterId: 'a-client-asserted-id' }));

    await store(draft);

    const rows = await prisma.$queryRawUnsafe<{ reporter_id: string }[]>(
      'SELECT "reporter_id" FROM "reports"',
    );

    expect(rows[0]?.reporter_id).toBe(ACTOR_ID);
  });
});
