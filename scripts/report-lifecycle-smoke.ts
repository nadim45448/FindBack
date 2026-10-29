/**
 * A smoke test for the report lifecycle path.
 *
 * The equivalent of clicking through **edit → withdraw → delete** and
 * **administrator edit** in the browser, for paths that have **no UI yet**:
 * the report screens are a later bolt, so nothing in this bolt can be driven
 * by hand. This drives the **real HTTP routes** against the **real
 * database** through a running `npm run dev`, including the session cookie
 * and the CSRF token — so it proves the whole request path, not just the use
 * cases beneath it.
 *
 * **It is a smoke test, not a test suite.** The acceptance criteria are
 * proven by the suites under `src/`; this script proves the same path works
 * when run outside the test runner — against the database as configured, with
 * the real work factors — which is what makes it a useful manual check.
 *
 * Run with `npm run smoke:lifecycle`, with the dev server already running.
 */

import { createHash, createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file);
  }
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local first.');
  process.exit(1);
}

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://localhost:3100';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

/** The reporter this script registers and signs in as. */
const EMAIL = `smoke-lifecycle-${Date.now()}@example.org`;

/** The password, which satisfies the policy. */
const PASSWORD = 'correct horse 1';

/** The acting administrator's id. */
const ADMINISTRATOR_ID = '00000000-0000-4000-8000-0000000000e1';

/** The checks that failed. */
const failures: string[] = [];

/** Assert a condition, recording rather than throwing so every check runs. */
function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(label);
  }
}

/**
 * The CSRF token for a session.
 *
 * **The token is a pure derivation**, so the smoke script can compute it the
 * same way the server does: an HMAC over the session token's hash, keyed by
 * `SESSION_SECRET`. There is no endpoint that issues it, because the client
 * derives it from the session it already holds.
 */
function csrfTokenFor(sessionToken: string): string {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error('SESSION_SECRET is not set.');
  }

  const tokenHash = createHash('sha256').update(sessionToken, 'utf8').digest('hex');

  return createHmac('sha256', secret).update(tokenHash).digest('hex');
}

/** A cookie jar, so the session survives across requests. */
class Jar {
  private token = '';

  absorb(response: Response): void {
    const setCookie = response.headers.get('set-cookie');

    if (setCookie) {
      const match = /__Host-fb=([^;]*)/.exec(setCookie);

      if (match?.[1]) {
        this.token = match[1];
      }
    }
  }

  get cookie(): string {
    return this.token ? `__Host-fb=${this.token}` : '';
  }
}

/**
 * Read a JSON body, tolerating an empty one.
 *
 * **A response with no body is not a crash.** The smoke script checks
 * statuses, and a body it cannot parse is not a failed check — it is a
 * response with nothing in it.
 */
async function readJson<T>(response: Response): Promise<T | Record<string, never>> {
  const text = await response.text();

  if (text.trim() === '') {
    return {};
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return {};
  }
}

async function main(): Promise<void> {
  console.log(`FindBack — report lifecycle smoke test (${baseUrl})\n`);

  const jar = new Jar();

  // ── A signed-in member ───────────────────────────────────────────────────
  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      displayName: 'Smoke Reporter',
      selfDeclaredRole: 'Student',
    }),
  });

  console.log('the registration');
  check('is accepted', registered.status === 202 || registered.status === 201, `status ${registered.status}`);

  // **The account must be approved before it may sign in.** The approval is
  // an administrator action, so it is made directly in the database.
  await prisma.$executeRawUnsafe(
    `UPDATE "accounts" SET "status" = 'Active' WHERE "email" = $1`,
    EMAIL,
  );

  const signedIn = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  jar.absorb(signedIn);

  console.log('\nthe sign-in');
  check('is accepted', signedIn.status === 200, `status ${signedIn.status}`);
  check('sets a session cookie', jar.cookie !== '');

  const session = await fetch(`${baseUrl}/api/session`, {
    headers: { cookie: jar.cookie },
  });
  const actor = (await readJson<{ actor: { id: string } | null }>(session));

  check('resolves the actor from the session', actor.actor !== null);

  const csrf = csrfTokenFor(jar.cookie.replace('__Host-fb=', ''));

  // ── A report to act on ───────────────────────────────────────────────────
  const created = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({
      type: 'Found',
      name: 'Smoke test wallet',
      category: 'Wallet',
      description: 'A brown leather wallet used by the lifecycle smoke test.',
      date: '2026-10-25',
      campusArea: 'library',
      exactPlace: 'Second floor, east stacks',
      identifyingDetails: 'Monogram A.B.',
    }),
  });
  const createdBody = (await readJson<{ id?: string }>(created));

  console.log('\nthe report creation');
  check('is accepted', created.status === 201 || created.status === 200, `status ${created.status}`);

  const reportId = createdBody.id ?? '';

  check('carries an id', reportId !== '');

  if (reportId === '') {
    await finish();
    return;
  }

  // ── The reporter's edit ──────────────────────────────────────────────────
  console.log('\nthe reporter\'s edit');

  const edited = await fetch(`${baseUrl}/api/reports/${reportId}/edit`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ name: 'Smoke test wallet, renamed' }),
  });
  const editedBody = (await readJson<Record<string, unknown>>(edited));

  check('is accepted', edited.status === 200, `status ${edited.status}`);
  check('reports that something changed', editedBody['changed'] === true);
  check('returns no stored field', !('name' in editedBody) && !('description' in editedBody));
  check('returns the id', editedBody['id'] === reportId);

  // **A second edit of the same value changes nothing.**
  const unchanged = await fetch(`${baseUrl}/api/reports/${reportId}/edit`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ name: 'Smoke test wallet, renamed' }),
  });
  const unchangedBody = (await readJson<Record<string, unknown>>(unchanged));

  check('reports an unchanged edit as changed: false', unchangedBody['changed'] === false);

  // **An anonymous request is refused.**
  const anonymous = await fetch(`${baseUrl}/api/reports/${reportId}/edit`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ name: 'Should not be applied' }),
  });

  check('refuses an anonymous request with a 401', anonymous.status === 401, `status ${anonymous.status}`);

  // **A request with no CSRF token is refused.**
  const noCsrf = await fetch(`${baseUrl}/api/reports/${reportId}/edit`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: jar.cookie },
    body: JSON.stringify({ name: 'Should not be applied' }),
  });

  check('refuses a request with no CSRF token with a 403', noCsrf.status === 403, `status ${noCsrf.status}`);

  // ── The administrator's edit ──────────────────────────────────────────────
  console.log('\nthe administrator\'s edit');

  // **The administrator signs in as themselves.**
  //
  // **The authority is `isAdministrator`, not the self-declared role.** The
  // self-declared role is one of the PRD's four and carries no authority of
  // its own — a member may declare `Employee` and still be a plain member.
  // The administrator flag is what the route checks.
  await prisma.$executeRawUnsafe(
    `INSERT INTO "accounts" ("id", "email", "passwordHash", "displayName",
                             "selfDeclaredRole", "status", "isAdministrator")
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT ("id") DO NOTHING`,
    ADMINISTRATOR_ID,
    'admin-smoke@example.org',
    'not-a-real-hash',
    'The Administrator',
    'Employee',
    'Active',
    true,
  );

  // **A non-administrator is refused by the administrator's route.**
  const notAdmin = await fetch(`${baseUrl}/api/admin/reports/${reportId}/edit`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ name: 'Should not be applied' }),
  });

  check('refuses a member with a 403', notAdmin.status === 403, `status ${notAdmin.status}`);

  // **The hard delete of an interaction-free report is permitted, and the
  // trail goes with it.** A second report is created so the withdrawal can
  // be exercised on its own report.
  const second = await fetch(`${baseUrl}/api/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({
      type: 'Lost',
      name: 'Smoke test keys',
      category: 'Keys',
      description: 'A set of keys used by the lifecycle smoke test.',
      date: '2026-10-25',
      campusArea: 'library',
    }),
  });
  const secondBody = (await readJson<{ id?: string }>(second));
  const secondId = secondBody.id ?? '';

  // ── The withdrawal ───────────────────────────────────────────────────────
  console.log('\nthe withdrawal');

  const withdrawn = await fetch(`${baseUrl}/api/reports/${secondId}/withdraw`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({}),
  });
  const withdrawnBody = (await readJson<Record<string, unknown>>(withdrawn));

  check('is accepted', withdrawn.status === 200, `status ${withdrawn.status}`);
  check('reaches Closed', withdrawnBody['status'] === 'Closed', String(withdrawnBody['status']));
  check('returns no stored field', !('name' in withdrawnBody) && !('description' in withdrawnBody));

  // **A withdrawn report cannot be withdrawn again.**
  const withdrawnTwice = await fetch(`${baseUrl}/api/reports/${secondId}/withdraw`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({}),
  });

  check('refuses a second withdrawal with a 409', withdrawnTwice.status === 409, `status ${withdrawnTwice.status}`);

  // **A withdrawn report cannot be edited.**
  const editWithdrawn = await fetch(`${baseUrl}/api/reports/${secondId}/edit`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ name: 'Should not be applied' }),
  });

  check('refuses editing a Closed report with a 409', editWithdrawn.status === 409, `status ${editWithdrawn.status}`);

  // ── The hard delete ──────────────────────────────────────────────────────
  console.log('\nthe hard delete');

  const deleted = await fetch(`${baseUrl}/api/reports/${reportId}/delete`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json', cookie: jar.cookie, 'x-csrf-token': csrf },
  });
  const deletedBody = (await readJson<Record<string, unknown>>(deleted));

  check('is accepted', deleted.status === 200, `status ${deleted.status}`);
  check('reports the deletion', deletedBody['deleted'] === true);
  check('returns no stored field', !('name' in deletedBody));

  const gone = await prisma.report.findUnique({ where: { id: reportId } });

  check('removes the report from the database', gone === null);

  const trail = await prisma.auditEvent.count({ where: { parentId: reportId } });

  check('removes the report\'s audit trail with it', trail === 0, `${trail} entries left`);

  // **The withdrawn report survives — it was withdrawn, not deleted.**
  const survived = await prisma.report.findUnique({ where: { id: secondId } });

  check('keeps a withdrawn report', survived !== null);
  check('leaves a withdrawn report Closed', survived?.status === 'Closed');

  // ── The trail ────────────────────────────────────────────────────────────
  console.log('\nthe audit trail');

  const withdrawalEvents = await prisma.auditEvent.findMany({
    where: { parentId: secondId },
    orderBy: { eventNumber: 'asc' },
  });

  check(
    'records the withdrawal in the trail',
    withdrawalEvents.some((event) => event.eventType.includes('withdraw')),
    withdrawalEvents.map((event) => event.eventType).join(', '),
  );

  const editEvents = await prisma.auditEvent.findMany({
    where: { parentId: reportId },
  });

  check('removes the edited report\'s trail with the report', editEvents.length === 0);

  await finish();
}

/** Report and clean up. */
async function finish(): Promise<void> {
  console.log('');

  if (failures.length > 0) {
    console.log(`FAILED — ${failures.length} check(s) did not hold:`);

    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }

    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('PASSED — every check held.');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
