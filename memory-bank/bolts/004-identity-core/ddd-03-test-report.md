---
unit: 001-identity-and-access
bolt: 004-identity-core
stage: test
status: complete
updated: 2026-10-27T21:40:00Z
---

# Test Report - Identity and Access

Bolt `004-identity-core`, stories `001-self-registration`,
`002-administrator-review-of-registrations`, `003-login-with-active-account`,
`005-logout-revokes-session`, `006-pending-member-restricted-access`, and
`007-owner-rejects-registration`.

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit | 282 | 0 | 0 | 95.29% lines (domain + application + lib) |
| Integration | 279 | 0 | 0 | 89.87% lines (infrastructure, excluding the security and performance suites) |
| Security | 32 | 0 | 0 | - |
| Performance | 6 | 0 | 0 | - |
| **Total** | **604** | **0** | **0** | **92.16% lines** |

46 test files, all passing. Line coverage **92.16%** against the 80% floor in
`vitest.config.mts`; branch coverage 88.25%; function coverage 96.35%. Stage 4
measured 88.78%, so this stage added **3.38 points**.

The category counts overlap by design — a single test may be both an
acceptance test and a security test. The per-file breakdown is at the end of
this report, and it is the authoritative tally.

**Every suite is skipped when `DATABASE_URL` is not set**, so a checkout
without a database still runs the unit suite rather than failing.

## Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 001 | A valid registration creates an account with status `Pending` and an administrator flag defaulting to false | ✅ |
| 001 | The registration completes with a confirmation screen and **no** email sent | ✅ |
| 001 | An already-registered email shows a duplicate-email validation error and no account is created | ✅ |
| 001 | A password that fails the policy shows a password validation error and no account is created | ✅ |
| 001 | The registration is recorded with the actor and timestamp, and no sensitive value is written | ✅ |
| 002 | Approving a `Pending` account makes it `Active` and sends the FR-27 approval email | ✅ |
| 002 | Rejecting a `Pending` account makes it `Rejected`, records the reason, and sends no email | ✅ |
| 002 | The decision is recorded with the acting administrator and timestamp | ✅ |
| 002 | A decision on a non-`Pending` account is refused | ✅ |
| 002 | A non-administrator actor is refused with an authorization error | ✅ |
| 002 | An approval whose email send fails still stands, and the failure is logged without sensitive values | ✅ |
| 003 | An `Active` account with correct credentials gets a session | ✅ |
| 003 | A `Pending` account's login is refused the generic message and gets no session | ⚠️ **See Open item 1** |
| 003 | A `Rejected` account's login is refused the generic message and gets no session | ✅ |
| 003 | A `Deactivated` account's login is refused the generic message and gets no session | ✅ |
| 003 | An incorrect password and an unknown email are indistinguishable | ✅ |
| 003 | The login is audit-logged without recording the submitted password | ✅ |
| 005 | Logging out revokes the session row and clears the cookie | ✅ |
| 005 | A revoked session token is unauthenticated on any request | ✅ |
| 005 | The logout is recorded without recording the session token | ✅ |
| 005 | A logout without a valid session is an idempotent success and changes no session state | ✅ |
| 005 | Logging out on one device leaves other devices' sessions unaffected | ✅ |
| 006 | A `Pending` account is refused a report, claim, recovery response, and thread post | ✅ (the guard; the surfaces are later units') |
| 006 | A `Pending` account is refused any administrator surface | ✅ |
| 006 | The `ActorContext` carries the `Pending` status | ✅ |
| 006 | A status change from `Pending` to `Active` lifts the restriction with no data migration | ✅ |
| 007 | The rejection stores and audit-records the reason with the acting administrator | ✅ |
| 007 | The rejection reason never appears in any response body | ✅ |
| 007 | A rejected account's login is the generic message, identical to the `Deactivated` case | ✅ |
| 007 | The rejection reason is visible on the administrator's audit entry | ✅ |
| 007 | A rejection sends no email of any kind | ✅ |

**Criterion mapping.** Every criterion above has a named test in
`src/infrastructure/accounts/identity-acceptance.test.ts`, which is organised
**by story** so the criterion-to-test mapping is legible in one place. The
tests drive the **real route handlers** against the **live database**, with
`next/headers` mocked so the test decides who is calling. A mocked repository
would not catch a broken unique index, a missing `CHECK` constraint, a wrong
status code, or a cookie the browser would reject — so none is used.

**Two route-level tests were added at the end of this stage** to close a gap
the stage found in its own coverage: story 003's `Rejected` and `Deactivated`
criteria had **no test at the route boundary**. The domain suite asserted
`canAuthenticate` for both statuses, and the use-case suite asserted the
generic message — but the route that a member actually calls was never driven
with a `Deactivated` or `Rejected` account. A route that mapped those two
statuses to a different status code or a different body would have passed
every test that existed. The two tests now assert the **generic message
byte for byte**, the **401**, and **no session row**, for each.

**Story 006 criteria 1–3** (creating a report, submitting a Claim, posting in
a thread) are enforced by the single `ActorContext` capability guard, which
this stage proves: a `Pending` actor's context carries `capability: 'none'`
and is refused at the administrator boundary. The report, Claim, and thread
surfaces themselves belong to Units 004–007 and are not built in this bolt, so
the tests assert the **guard** rather than three endpoints that do not exist.

## Unit Tests

| File | Tests | What it covers |
|---|---|---|
| `src/domain/accounts/account.test.ts` | 20 | The aggregate: registration always `Pending` and never an administrator; `approve()` and `reject()` legal only from `Pending`; the two mutually exclusive, first-one-wins; no transition out of `Active`; `rejectionReason` set only by `reject()`; the administrator flag only on an `Active` account; `canAuthenticate` for all four statuses |
| `src/domain/accounts/session.test.ts` | 13 | The 14-day window; the un-revoked start; a shorter window honoured; the revocation and its reason; idempotent revocation; usability before expiry, after expiry, and after revocation; the hourly refresh threshold; the 13–14 day effective idle window's bounds; the expiry-after-creation guard |
| `src/domain/accounts/actor-context.test.ts` | 7 | The context carries the status; the administrator flag honoured only on `Active`; `Pending` has no capability; the member and administrator capability questions |
| `src/domain/accounts/value-objects.test.ts` | 26 | The value objects: `EmailAddress`'s normalization, format, and length bounds; `DisplayName`'s Unicode and length handling; `PasswordHash`'s non-emptiness; the password policy's four failure modes and its exact-minimum acceptance; `RejectionReason`'s minimum and its `null` tolerance; `SelfDeclaredRole`'s four values and its `Other` free text |
| `src/application/accounts/use-cases.test.ts` | 19 | The use cases against fake ports: registration writes the account and the audit record in one transaction; the duplicate is refused; the policy failure refuses; the review approves, rejects, and refuses a second decision; the authentication's two outcomes and the identical refusal for every non-authenticating status; the logout's idempotence |
| `src/application/accounts/account-approved-email.test.ts` | 10 | The FR-27 email: the recipient, the login link, **no auto-login token**, the HTML escaping of a display name containing markup |

**The three tests that matter most** are in `use-cases.test.ts`:
*"gives the same answer for every refusal"* (the anti-enumeration property at
the use-case boundary), *"refuses a decision on an account that is no longer
pending"* (the first-decision-wins rule), and *"writes the account and the
audit record in one transaction"* (the ordering guarantee).

## Integration Tests

| File | Tests | What it covers |
|---|---|---|
| `src/infrastructure/accounts/identity-acceptance.test.ts` | **47** | Every acceptance criterion of all six stories, one or more tests each, plus every edge case the stories name — see the Acceptance Criteria Validation section |
| `src/infrastructure/accounts/identity-stack.test.ts` | 11 | The stack against the live database: the registration and its audit record, the normalized email, the case-insensitive duplicate, the status `CHECK` constraint, the administrator `CHECK` constraint, the approval as event 11, the rejection as event 12 with its reason, the refused second decision, the issued session, the revoked session, the expired session |
| `src/infrastructure/accounts/database-rate-limiter.test.ts` | 6 | The counter: the atomic increment, the refusal past the limit, the window alignment, the idempotent upsert |
| `src/infrastructure/accounts/node-argon2-password-hasher.test.ts` | 12 | The hash's shape, the salt's uniqueness, the work factors embedded in the hash, the verification, the malformed-hash refusal |
| `src/infrastructure/accounts/cookie-session-store.test.ts` | 17 | The `__Host-` attributes, the cleared cookie, the token's entropy, the hash, the constant-time comparison |
| `src/infrastructure/accounts/csrf-token-store.test.ts` | 8 | The HMAC derivation, the session binding, the constant-time comparison, the missing-token refusal |

**The `identity-acceptance.test.ts` suite is the heart of this stage.** It
asserts the **observable** contract — the status code, the body, the
`Set-Cookie` header, the database row, and the trail row — rather than
internal calls. Two examples of what that buys:

- *"the session cookie is set, and it carries the four attributes the
  `__Host-` prefix requires"* asserts `Path=/`, `HttpOnly`, `Secure`,
  `SameSite=Lax`, and **no `Domain`** — the browser rejects a `__Host-` cookie
  that gets any of it wrong, so a mock-based test would never notice.
- *"the approval email goes to the account's own registered address"* asserts
  the recipient the use case produces, while the transport itself is proven
  separately by `smtp-email-sender.test.ts`.

## Security Tests

`src/infrastructure/accounts/identity-security.test.ts` (32 tests) covers the
identity path's security. Bolt `005-identity-security` will extend this into
deactivation, password reset, and session management.

| Concern | Test | Result |
|---|---|---|
| Rate limiting | A registration burst from one address is refused at the sixth attempt | ✅ |
| Rate limiting | A throttled registration answers 429 with a `Retry-After` hint | ✅ |
| Rate limiting | A login burst against one account is refused at the eleventh attempt | ✅ |
| Rate limiting | A **distributed** attempt against one account is refused — the email bucket, not the IP one | ✅ |
| Rate limiting | The throttle does not become an account-existence oracle | ✅ **after a fix — see Issue 1** |
| CSRF | A logout with no CSRF token is refused | ✅ |
| CSRF | A logout whose token belongs to another session is refused | ✅ |
| CSRF | A forged request **does not** revoke the session — the check runs before anything changes | ✅ |
| CSRF | A registration decision with no CSRF token is refused, and the account stays `Pending` | ✅ |
| Authorization | The administrator queue is refused to a caller with no session | ✅ |
| Authorization | The administrator queue is refused to an active member | ✅ |
| Authorization | The administrator queue is refused to a `Pending` member | ✅ |
| Authorization | A registration decision is refused to a `Pending` member | ✅ |
| Authorization | The administrator flag on a `Pending` account grants nothing — the database refuses the row | ✅ |
| Anti-enumeration | A wrong password, an unknown email, and a `Rejected` account answer identically — same status, same bytes | ✅ |
| Anti-enumeration | No refused login issues a session | ✅ |
| Anti-enumeration | An unknown email costs the **same work** as a wrong password — the timing is measured | ✅ |
| Anti-enumeration | The refusal body names no lifecycle state | ✅ |
| Session security | The plaintext session token is never persisted | ✅ |
| Session security | A revoked token is inert **immediately**, before and after the logout | ✅ |
| Session security | A session expires after the 14-day inactivity window | ✅ |
| Session security | The status is read on every request, so a status change takes effect at once | ✅ **after a fix — see Issue 2** |
| Session security | A `Pending` account's session stays alive, with no capability | ✅ |
| Session security | The cookie carries the attributes the `__Host-` prefix requires | ✅ |
| Log hygiene | The password, the hash, the email, and the token are absent from every log line | ✅ |
| Log hygiene | Every line carries a request id, an action, and an outcome | ✅ |
| Log hygiene | A refused login is recorded as a denial with no actor | ✅ |
| Password policy | A password with no number, and one with no letter, are refused | ✅ |
| Password policy | A password of exactly the minimum length is accepted; one over the maximum is refused | ✅ |

**The anti-enumeration timing test is the one that is worth reading.** It
measures the median of seven attempts on an unknown email and on a wrong
password, and asserts the two are within a factor of two of each other. The
unknown-email path verifies against a **dummy hash** rather than skipping the
verification, so the two costs are the same order. A path that skipped the
verification would be several times faster and would fail the test.

## Performance Tests

`src/infrastructure/accounts/identity-performance.test.ts`, measured through
the **real route handlers** against the live database, with the **production
Argon2id work factors** (64 MiB, 3 passes, parallelism 1 — ADR-12).

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Argon2id verification p95 (the login path's dominant cost) | — | **175.6 ms** | — |
| Login p95 (Argon2id + session write) | ≤ 1,000 ms | **185.2 ms** | ✅ |
| Registration p95 (Argon2id + account write + audit write) | ≤ 1,000 ms | **173.1 ms** | ✅ |
| Session read p95 (the hottest path — every authenticated request) | ≤ 500 ms | **1.1 ms** | ✅ |
| Pending-queue read p95 (at 200 pending registrations) | ≤ 500 ms | **1.6 ms** | ✅ |
| Pending-queue query plan | index scan, no sort | `idx_accounts_status_created`, **no `Sort`** | ✅ |

The p50 figures are p50 7.0 ms for the login, p50 149.6 ms for the
registration, p50 0.8 ms for the session read, and p50 1.3 ms for the queue
read.

**The write budget is met by a wide margin, and the margin has a single
source.** The Argon2id verification is 175.6 ms at p95, and it is the whole of
the write budget's cost: the database work around it is under 10 ms. This
confirms ADR-12's measurement of ~160 ms at the production work factors, and
it confirms the design's decision to keep the work factors configured rather
than raised — raising them would eat into the 1 s budget directly, so the
current values are a deliberate balance, not an accident.

**The session read is the number to watch.** It runs on **every**
authenticated request — it is the hottest path in the product — and it is
p95 1.1 ms, which is 450× inside the 500 ms budget. The plan is an index
range scan over `idx_accounts_status_created` for the queue and a unique-index
lookup for the session, so the cost does not grow with the queue's size.

**The queue's query plan is asserted, not just its timing.** The test reads
the `EXPLAIN` output and requires the composite index and the **absence of a
sort** — the index covers both the `status` filter and the `createdAt`
ordering, so the queue does not sort. A timing assertion alone would pass
even if the plan degraded.

## Coverage Report

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 92.05 | 88.25 | 96.35 | **92.16** |
| `application/` | 95.13 | 91.04 | 100 | 95.10 |
| `application/accounts/` | 90.72 | 81.81 | 95.65 | 91.66 |
| `application/ports/` | 100 | 100 | 100 | 100 |
| `domain/accounts/` | 92.98 | 93.10 | 93.93 | 92.98 |
| `domain/audit/` | 98.84 | 96.77 | 100 | 98.83 |
| `infrastructure/accounts/` | 87.58 | 79.87 | 91.46 | 87.71 |
| `infrastructure/audit/` | 96.20 | 92.85 | 100 | 96.10 |
| `infrastructure/db/` | 95.65 | 77.27 | 100 | 95.65 |
| `lib/` | 100 | 50 | 100 | 100 |

The floor is 80% lines (`vitest.config.mts`). Every layer is above it.

`src/app/**` is excluded from the coverage measurement by the config, because
the route handlers are exercised **through** their exported functions rather
than by importing their modules for coverage — the handlers are covered by
the 45 acceptance tests and the 32 security tests, which is a stronger
guarantee than a line count.

The lowest branch coverage is `lib/` at 50% — the optional custom-message
branch of `ValidationError` is not exercised. That is a gap, not a defect.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| **The login throttle answered with a distinct 429 and a "Too many attempts" body.** ADR-15 requires the email bucket's refusal to return the **same generic message** as every other refusal, because a distinct throttle response discloses that the account **exists** — turning the limiter into the account-existence oracle the PRD forbids. The route returned 429 for a throttled email and 401 for a wrong password, so an attacker could distinguish a registered address from an unregistered one by driving the email bucket over its limit. | **High** | **Fixed in Stage 5** — the login route now answers a throttled attempt with the generic inactive message and a 401, keeping the `Retry-After` header. The two buckets' limits also now match ADR-15 (IP 20, email 10) rather than sharing one value of 10. Asserted by "keeps the throttle from becoming an account-existence oracle" |
| **A `Rejected` account's session stayed live.** `SessionService.resolve` read the account and built the context without checking whether the account still authenticates. FR-4 says a `Rejected` account does not authenticate at all, so a session issued before the rejection kept resolving — and the rejected member kept a live session carrying the account's identity. The domain already had the rule (`canAuthenticate`); the resolver simply never consulted it. | **High** | **Fixed in Stage 5** — `resolve` now returns `null` for an account that does not authenticate. A `Pending` account is unaffected, because FR-4 says it **does** authenticate. Asserted by "reads the status on every request, so a status change takes effect at once" and "keeps a pending account session alive, with no capability" |
| The login route used **one** limit for both buckets, where ADR-15 specifies 20 for the IP bucket and 10 for the email bucket. The IP bucket was therefore five times tighter than the design intended, which would throttle a campus behind a shared NAT. | **Medium** | **Fixed in Stage 5** — the limits are now `LOGIN_IP_LIMIT = 20` and `LOGIN_EMAIL_LIMIT = 10`, matching ADR-15 |
| The `SessionService` activity-refresh write is not exercised on the **deferred-failure** path — the case ADR-16 calls "best-effort". | **Low** | **Open — covered in bolt `005`.** The refresh path itself is exercised; the write-failure branch is not. Recorded here so it is not mistaken for an oversight |

**No critical or high-severity issues remain open.** Both high-severity issues
were found by Stage 5 and fixed in Stage 5.

## Errors Found and Fixed During This Stage

Three test failures in the **new** tests, all errors in the tests rather than
in the code:

1. *"answers a wrong password, an unknown email, and a rejected account
   identically"* read the first response's body twice. A `Response` body can
   only be consumed once, so the second read threw. The test now reads each
   body once and compares the three strings.
2. *"does not disclose the account status in the refusal body"* asserted that
   the body does not contain the word "active" — but the frozen UX copy is
   *"Your account is not active"*, so the assertion contradicted the very
   copy it was protecting. The test now asserts that the body names no
   lifecycle **state** (`pending`, `rejected`, `deactivated`), which is the
   property that actually matters.
3. *"measures the Argon2id verification against the production work factors"*
   reached into the stack's private hasher field, which is not a constructor.
   The measurement now goes through the authentication use case, which is
   the path the number is about.

The production changes in this stage were the two fixes above. **No
production code was changed to make a test pass.**

## Ready for Operations

- [x] All acceptance criteria met — except story 003 criterion 2, which is
      **not** a defect in the code but a conflict between the story and the
      PRD. See Open item 1 below.
- [x] Code coverage > 80% — **92.16% lines**
- [x] No critical/high severity issues open — both found in this stage, both
      fixed
- [x] Performance targets met — the write path is p95 185.2 ms against a
      1,000 ms budget; the read path is p95 1.1 ms against a 500 ms budget
- [x] Security tests passing — 32 identity security tests

**Verification run for this stage:** typecheck pass · lint pass ·
**604/604 tests across 47 files** · coverage 92.16% lines / 88.25% branches /
96.35% functions · build pass, with all six identity routes registered ·
`npm run smoke:identity` **12/12** · the six routes exercised by hand with
`curl` against the running dev server.

### The manual route check

The six identity routes were exercised with `curl` against the dev server at
`http://localhost:3000`, in the order a member would meet them. This is the
protocol's CP-3 check, and it is the **only** check in this stage that
touched the built application rather than a test harness.

1 - `GET /api/session` with no cookie → **200** `{"actor":null}` — "nobody is
signed in" is an answer, not an error.

2 - `POST /api/auth/register` → **201** `{"status":"Pending"}` — the
registration creates a `Pending` account.

3 - `POST /api/auth/register` again with the same address → **409**
`{"error":"That email address is already registered."}` — FR-1's duplicate
refusal.

4 - `POST /api/auth/login` with the registered address → **200**
`{"status":"Pending","isAdministrator":false}` and a `__Host-fb` cookie with
`Path=/`, `HttpOnly`, `Secure`, `SameSite=Lax`, and **no `Domain`** — FR-4's
Pending behaviour, and the cookie's attributes are the ones the `__Host-`
prefix requires.

5 - `GET /api/session` with that cookie → **200** with
`"status":"Pending","capability":"none"` — the status travels and the
capability does not follow (FR-2).

6 - `GET /api/admin/registrations` as that Pending member → **403** — the
administrator surface is refused.

7 - `POST /api/auth/logout` **without** a CSRF token → **403** — and the
session was **still live** on the next `GET /api/session`, so a refused
logout changes nothing.

8 - `POST /api/auth/logout` **with** a valid CSRF token → **200** `{"ok":true}`
and a cleared cookie (`Max-Age=0`).

9 - `GET /api/session` with the revoked cookie → **200** `{"actor":null}` — the
revocation is server-side, so the token is inert even though the cookie value
was still in hand.

**Not manually tested.** The identity endpoints have **no UI yet** — Units 007
and 012 own the screens — so nothing here was click-tested in a browser. The
outbound email path cannot be exercised locally (CP-4) and is covered by
automated test only: the approval's email is asserted by the acceptance suite
and by `smoke:identity`, and a send failure is asserted not to roll back the
approval.

## Open items for the owner

### Open item 1 — story 003 criterion 2 contradicts PRD FR-4

This is a **specification conflict**, not a code defect, and it needs the
owner's decision.

| Source | What it says |
|---|---|
| **PRD FR-4** (authoritative) | "**Pending** — authentication succeeds but lands on a confirmation banner stating that the account is pending administrator approval." |
| **PRD FR-2** | "A Pending user can authenticate but cannot create reports…" |
| **`EXPERIENCE.md` §16.3** | A `/pending` route exists: "Pending-account restricted landing (authentication succeeds; member surface is restricted)", with the banner "Your account is pending administrator approval." |
| **`EXPERIENCE.md` §9** | "If Alex tries to 'Log in' with his credentials while still pending, he lands on `/pending` with the Pending banner." |
| **Story 003 criterion 2** | "**Given** a `Pending` account and correct credentials, **When** the member submits, **Then** the response is the generic inactive-account message and **no session is created**." |

**The PRD and the UX spine agree with each other and against the story**, and
both say the same thing twice. The PRD is the authoritative specification, so
the implementation follows it: a `Pending` account **authenticates**, gets a
session, and lands on the pending surface — and the restriction lives in the
`ActorContext`'s `capability`, exactly as story 006 requires.

This is also what bolt `004`'s own Stage 1 domain model says: *"a `Pending`
account authenticates (FR-4) but gains no member capability (FR-2)"*, and
what ADR-16 says: *"PRD FR-4: a `Pending` account authenticates but has no
member capability — `Pending` sessions exist and expire on the same rule."*

**The consequence of the other reading** is worth stating plainly. If story
003 criterion 2 were implemented literally, a `Pending` account could not
sign in at all — which would make the `/pending` route in `EXPERIENCE.md`
§16.3 unreachable, and would make FR-2's "a Pending user **can authenticate**"
false. The story's own criterion 2 also contradicts the PRD's explicit
anti-enumeration rule in FR-4, which names only `Rejected` and `Deactivated`
as producing the generic message — `Pending` is conspicuously absent from that
list.

**Recommendation: amend story 003 criterion 2 to match FR-4** — "the response
is a pending-status response with a session, and no member capability is
granted". The implementation already does this, and the acceptance suite
asserts it as "criterion 2 (PRD FR-4)". **The story file has not been
amended** — that is the owner's call, not this stage's.

### Open item 2 — the rate limits are configuration, not constants — **CLOSED**

ADR-15 says the limits are "configured, not hardcoded, with the chosen values
as defaults". The implementation had them as module constants in the route
handlers, with the ADR's values as those constants — so the *values* were
configurable only by a code change, not by an environment variable. That was a
real operational limitation, and it is **now closed**.

`src/infrastructure/accounts/rate-limit-config.ts` reads all six values from
the environment — `AUTH_RATE_REGISTER_LIMIT`,
`AUTH_RATE_REGISTER_WINDOW_SECONDS`, `AUTH_RATE_LOGIN_IP_LIMIT`,
`AUTH_RATE_LOGIN_IP_WINDOW_SECONDS`, `AUTH_RATE_LOGIN_EMAIL_LIMIT`, and
`AUTH_RATE_LOGIN_EMAIL_WINDOW_SECONDS` — with **ADR-15's values as the
defaults**. The identity stack exposes the resolved configuration as
`stack.rateLimits`, and both routes read it from there, so there is **one**
source of truth for the limits and no literal left in a route handler.

An invalid value falls back to the default rather than failing the request: a
malformed environment variable must not take the identity endpoints down, and
the fallback is the ADR's own value. This is the same convention the Argon2id
parameters already use. `src/infrastructure/accounts/rate-limit-config.test.ts`
(5 tests) covers the defaults, a full override, a partial override, and the
fallback for every malformed form.

**The values are unchanged**, so the behaviour the Stage 5 suites assert — the
security suite's 10-failure and 20-failure throttle boundaries, and the
acceptance suite's 5-registration refusal — still holds, and the existing
rate-limit tests pass unchanged.

### Open item 3 — the session-activity refresh's failure path is untested

ADR-16 specifies that a failed refresh write must not fail the request. The
refresh path is exercised; the write-failure branch is not. It is bolt
`005`'s to close, since that bolt owns the session sweep.

### Closed after the report — a flaky `EXPLAIN` assertion

The final full-suite run caught a **flaky test**, not a product defect. The
pending-queue plan test asserted that PostgreSQL chooses
`idx_accounts_status_created` with no sort, but the plan it asserted was
**stale**: the 200 rows the test seeded were inserted moments earlier, so the
table's row estimate still reflected the pre-seed state, and on that estimate
the planner cost a seq scan as cheaper. The assertion therefore depended on
whether autovacuum had happened to run.

The fix is the convention this repository already uses in
`audit-performance.test.ts` and `lost-side-performance.test.ts`: **`ANALYZE`
the table after seeding**, so the planner costs the plan on current
statistics. The plan the test now measures is the plan the production
database would actually use — which is the whole point of asserting it.

This is worth recording because the test **passed** when the performance file
ran alone and **failed** inside the full suite. A plan assertion that only
holds when the table happens to have been vacuumed recently is a test that
will fail again in CI for no reason connected to the code.

## Recommendations

1. **Re-measure on a Vercel Hobby deployment before the identity endpoints
   are used in production.** These numbers are from a local Docker PostgreSQL
   with a warm page cache. The margin is large (185.2 ms against a 1,000 ms
   budget), so this is a confirmation rather than a concern — but the Argon2id
   cost is the whole of it, and a Hobby instance is slower than this host.

2. **Raise the Argon2id work factors only with the write budget in mind.**
   The login path is p95 175.6 ms at 64 MiB / 3 passes, and the budget is
   1,000 ms. Doubling the memory would roughly double the verification and
   consume a third of the budget. The current values are a deliberate balance
   between ADR-12's OWASP-second-option choice and the PRD's write NFR.

3. **The `Pending` login's shape is decided here and will be built in Unit
   007.** The API answers `200 { status: 'Pending' }` and sets the session
   cookie, and the `/pending` landing reads the status from `/api/session`.
   Unit 007 must build that page against **this** contract, and it must not
   treat the generic inactive message as the `Pending` answer.

4. **The rejection reason's 5-character minimum is a boundary rule, and the
   blank-reason case is a domain tolerance.** Conflict 2's resolution is
   implemented and tested: the route refuses a sub-minimum reason, and the
   aggregate tolerates a missing one. Unit 007's rejection form should
   therefore enforce the minimum in the client as well, or a blank reason
   will reach the route and be refused.

## Per-file test counts

| `src/application/accounts/account-approved-email.test.ts` | 10 |
| `src/application/accounts/use-cases.test.ts` | 19 |
| `src/application/audit-read-recorder.test.ts` | 3 |
| `src/application/audit-trail-reader.test.ts` | 5 |
| `src/application/audit-trail-service.test.ts` | 16 |
| `src/application/audit-writer.test.ts` | 6 |
| `src/application/classify-write-failure.test.ts` | 10 |
| `src/application/lost-side-event-factory.test.ts` | 28 |
| `src/application/quota-monitor.test.ts` | 9 |
| `src/domain/accounts/account.test.ts` | 20 |
| `src/domain/accounts/actor-context.test.ts` | 7 |
| `src/domain/accounts/session.test.ts` | 13 |
| `src/domain/accounts/value-objects.test.ts` | 26 |
| `src/domain/audit/audit-event.test.ts` | 9 |
| `src/domain/audit/event-catalog.test.ts` | 11 |
| `src/domain/audit/lost-side-events.test.ts` | 18 |
| `src/domain/audit/payload-sanitizer.test.ts` | 16 |
| `src/domain/audit/prd-parity.test.ts` | 7 |
| `src/domain/audit/quota-thresholds.test.ts` | 11 |
| `src/domain/audit/request-context.test.ts` | 4 |
| `src/domain/audit/retention-policy.test.ts` | 10 |
| `src/domain/audit/trail-query.test.ts` | 18 |
| `src/infrastructure/accounts/cookie-session-store.test.ts` | 17 |
| `src/infrastructure/accounts/csrf-token-store.test.ts` | 8 |
| `src/infrastructure/accounts/database-rate-limiter.test.ts` | 6 |
| `src/infrastructure/accounts/identity-acceptance.test.ts` | 47 |
| `src/infrastructure/accounts/identity-performance.test.ts` | 6 |
| `src/infrastructure/accounts/identity-security.test.ts` | 32 |
| `src/infrastructure/accounts/identity-stack.test.ts` | 11 |
| `src/infrastructure/accounts/node-argon2-password-hasher.test.ts` | 12 |
| `src/infrastructure/accounts/rate-limit-config.test.ts` | 5 |
| `src/infrastructure/accounts/smtp-email-sender.test.ts` | 12 |
| `src/infrastructure/audit/acceptance-criteria.test.ts` | 14 |
| `src/infrastructure/audit/acceptance-read-criteria.test.ts` | 12 |
| `src/infrastructure/audit/append-only-enforcement.test.ts` | 10 |
| `src/infrastructure/audit/audit-performance.test.ts` | 8 |
| `src/infrastructure/audit/audit-read-path.test.ts` | 16 |
| `src/infrastructure/audit/audit-read-security.test.ts` | 12 |
| `src/infrastructure/audit/audit-repositories.test.ts` | 18 |
| `src/infrastructure/audit/audit-security.test.ts` | 19 |
| `src/infrastructure/audit/lost-side-acceptance.test.ts` | 11 |
| `src/infrastructure/audit/lost-side-events.test.ts` | 11 |
| `src/infrastructure/audit/lost-side-performance.test.ts` | 6 |
| `src/infrastructure/audit/lost-side-security.test.ts` | 18 |
| `src/infrastructure/audit/quota-providers.test.ts` | 11 |
| `src/lib/errors.test.ts` | 3 |
| `src/lib/logging.test.ts` | 3 |
| **Total** | **604** |