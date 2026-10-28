---
unit: 001-identity-and-access
bolt: 005-identity-security
stage: test
status: complete
updated: 2026-10-28T17:05:00Z
---

# Test Report - Identity and Access (Security)

Bolt `005-identity-security`, stories `004-deactivate-an-account`,
`008-reset-request-never-discloses-account`, `009-reset-password`, and
`010-update-member-profile`.

## Test Summary

| Category | Passed | Failed | Skipped | Coverage |
|----------|--------|--------|---------|----------|
| Unit | 328 | 0 | 0 | 95.55% lines (domain + application + lib) |
| Integration | 154 | 0 | 0 | 90.00% lines (infrastructure + the test harness) |
| Security | 33 | 0 | 0 | - |
| Performance | 12 | 0 | 0 | - |
| **Total** | **815** | **0** | **0** | **93.72% lines** |

56 test files, all passing. Line coverage **93.72%** against the 80% floor in
`vitest.config.mts`; branch coverage 90.20%; function coverage 97.26%. Stage 4
measured 93.48%, so this stage added **0.24 points** while adding **25 tests**.

The category counts overlap by design — a single test may be both an
acceptance test and a security test. The per-file breakdown is at the end of
this report, and it is the authoritative tally.

**Every suite is skipped when `DATABASE_URL` is not set**, so a checkout
without a database still runs the unit suite rather than failing.

## The headline finding

**The Stage 2 design's stated mechanism for obligation 5 was impossible, and
this stage found that by measurement rather than by reading.**

Obligation 5 said: *"The route redacts the `token` query parameter from request
logs."* Two live requests established that no route, proxy, or rewrite can do
this:

1. A request to `/reset-password?token=…` was observed in the server's
   request log carrying the **full token**.
2. A proxy that rewrote the request's URL — stripping the query entirely — did
   **not** remove the token from the log.

The reason is structural. **The access log records the original request URL —
the one on the wire — and it is written before any application code runs.** No
proxy, no rewrite, and no route handler can change what is already written.
Next.js's own dev logger shows the same rule: it prints `request.url`, the
original, from `node_modules/next/dist/server/dev/log-requests.js:62`.

**The fix is that the token now travels in the URL's fragment.** A fragment is
never sent to the server, so it never enters the request line and therefore
never reaches an access log. The page's own JavaScript reads the fragment in
the browser and **posts the token in the request body**, which is also not in
the request line.

This reverses the Stage 2 design's reasoning, which rejected the fragment
because *"a fragment is never sent to the server, so the server could not read
it to look the token up."* That reasoning was correct about the fragment and
wrong about the consequence: **the server does not need to read the token from
the fragment.** The page's JavaScript reads it and posts it in the body. The
design's own other constraint — *"the reset form must not be a GET"* — pointed
at exactly this solution.

**Measured, on the running dev server:**

| Link shape | Token in the request log | Token in the HTML |
|------------|------------------------|-------------------|
| **Fragment** (what the email now produces) | **0** | **0** |
| Query string (a legacy or hand-built link) | 1 | 1 |

The query-string row is **not** a defect that was left unfixed — it is
documented honestly. The token in a query-string URL is already in the access
log before the application sees it, and no application code can un-write it.
The proxy (`src/proxy.ts`) remains as a **second line of defence** for that
case: it moves the token into a request header and redacts the URL the route
handler is served from, so the token never reaches the route handler or the
page's markup. It cannot reach back in time to un-write the log line.

**The design artifact has been corrected.** `ddd-02-technical-design.md`'s
"The reset link's shape" section, the Stage 4 implementation checklist's
obligation 5, and the two traceability rows that cited it now describe the
fragment, the measurement that forced the change, and the proxy's bounded role.

## Acceptance Criteria Validation

| Story | Criteria | Status |
|-------|----------|--------|
| 004 | An `Active` account becomes `Deactivated` and every open session is revoked | ✅ |
| 004 | Reports, Claims, Recovery Responses, messages, and history survive | ✅ (structural — the service has no repository that could reach them) |
| 004 | The deactivation is audit-recorded with the acting administrator and timestamp | ✅ |
| 004 | A deactivated member's session is unauthenticated | ✅ |
| 004 | The generic inactive message, and no session, on login | ✅ |
| 004 | A non-administrator actor is refused | ✅ |
| 004 | Edge: an administrator deactivates another administrator | ✅ (permitted; the flag is cleared) |
| 004 | Edge: an in-flight request during deactivation completes under the prior context | ✅ |
| 004 | Edge: an already-`Deactivated` target is an idempotent no-op with no duplicate record | ✅ |
| 008 | A neutral confirmation that does not reveal existence | ✅ |
| 008 | Byte-for-byte identical for an unregistered email | ✅ |
| 008 | The timing does not vary with existence | ✅ **measured** — see below |
| 008 | The same confirmation in all four statuses; no state change | ✅ |
| 008 | Rate-limited beyond the configured limit | ✅ |
| 008 | No audit or log record contains the token or discloses existence | ✅ — **the flow writes no audit record at all** |
| 008 | Edge: a `Deactivated` account; no reactivation | ✅ |
| 008 | Edge: a `Pending` account; no approval implied | ✅ |
| 008 | Edge: an attacker enumerating addresses | ✅ — no signal in body, timing, or status |
| 009 | A valid unexpired token replaces the hash, and the member can sign in with the new password | ✅ |
| 009 | The previous password no longer authenticates | ✅ |
| 009 | A used token is refused | ✅ — the conditional write, not a check-then-write |
| 009 | An expired token is refused | ✅ |
| 009 | The lifecycle status is unchanged | ✅ |
| 009 | The audited record holds no password, hash, or token | ✅ — there is **no** record |
| 009 | Edge: a token replayed after a successful reset | ✅ |
| 009 | Edge: two concurrent resets | ✅ |
| 009 | Edge: the new password fails the policy | ✅ — refused **before** the transaction, so the old password still works |
| 010 | Display name, email, role, and status are shown | ✅ |
| 010 | A change persists and is reflected wherever the name appears | ✅ |
| 010 | An append-only non-numbered record with the actor and timestamp | ✅ |
| 010 | The email is read-only and the change is refused | ✅ **structural** — the type has no `email` field |
| 010 | Status, administrator flag, and lifecycle edits are refused | ✅ **structural** — the type has exactly two fields |
| 010 | A non-`Active` member has no editor | ✅ |
| 010 | Edge: the display name is cleared | ✅ |
| 010 | Edge: a long free-text role | ✅ |
| 010 | Edge: a profile edit while deactivated | ✅ |

**Every criterion has a named test** in
`src/infrastructure/accounts/reset-deactivation-acceptance.test.ts` (50 tests),
which is organised **by story** so the criterion-to-test mapping is legible in
one place. The tests drive the **real route handlers** against the **live
database**, with `next/headers` mocked so the test decides who is calling.

**The FR-52 criteria are asserted structurally, not by a validation rule.**
The acceptance suite sends `email`, `status`, and `isAdministrator` in one
profile request body and asserts the row is unchanged on all three. A
validation-rule implementation would have had to enumerate the forbidden
fields, and this one has nothing to enumerate — `ProfileChange` has two
optional fields and no others.

## The Stage 4 checklist, audited against the code

Stage 2 carried forward ten obligations for Stage 4. Each was checked against
the real implementation by an independent audit pass, not by re-reading the
design:

| # | Obligation | Status |
|---|------------|--------|
| 1 | The conditional `markUsed` write — `UPDATE … WHERE used_at IS NULL AND expires_at > now()` | ✅ `PrismaPasswordResetTokenRepository.markUsed()` issues one statement with `RETURNING "id"`. **No read-then-write.** |
| 2 | Verify the existing `Deactivated` login path still holds, and add the missing test if not | ✅ The path was **not** rewritten. The acceptance suite drives a `Deactivated` account through the real login route and asserts the generic message, the 401, and no session row |
| 3 | An administrator deactivating another administrator succeeds, and the target's flag is cleared | ✅ Asserted at both the domain and acceptance layers |
| 4 | The unconditional dummy Argon2id verification and the floor on **every** path, including the rate-limited one | ✅ — **now asserted on the rate-limited path too**; see Issue 2 |
| 5 | The route redacts the `token` query parameter from request logs | ⚠️ **The mechanism was impossible.** The token now travels in the **fragment**, which leaves no trace in any log. The proxy remains as a bounded second line of defence — see the headline finding |
| 6 | The two HMAC keys are separate, from the environment, and a missing key fails loudly at startup | ✅ Asserted by four tests in `reset-primitives.test.ts` |
| 7 | The email is assembled from named parts, with the wording marked `PENDING UX EDIT` | ✅ 17 tests; no wording was invented |
| 8 | `ProfileChange` carries exactly two fields | ✅ Asserted at the type level and at the route |
| 9 | The audit rows are written inside the transactions, and the reset flow writes **no** audit row | ✅ — **now asserted directly**; see Issue 3 |
| 10 | `deactivate()` clears `isAdministrator` and sets `deactivatedAt`; a second deactivation is a no-op with no duplicate record | ✅ Asserted at both the domain and acceptance layers |

**One wording deviation, not a behavioural defect.** The design names
`Account.deactivate()` and `Account.updateProfile()` as **methods**; the
implementation exposes free functions `deactivateAccount` and
`updateAccountProfile` in `src/domain/accounts/account.ts`. This matches
bolt `004`'s convention — `approveAccount`, `rejectAccount`,
`registerAccount` are free functions too — and the behaviour is identical. It
is recorded here so a reader comparing the design to the code does not read it
as an unexplained divergence.

## Unit Tests

| File | Tests | What it covers |
|---|---|---|
| `src/domain/accounts/deactivation-and-profile.test.ts` | 18 | The aggregate: deactivation sets the time and clears the administrator flag; a non-`Active` account is refused; the account cannot authenticate afterwards; the row survives; the profile edit changes the two editable fields and leaves the email, the status, the administrator flag, and the deactivation time alone; `Pending`, `Rejected`, and `Deactivated` accounts are refused; an empty change does nothing |
| `src/domain/accounts/reset-and-profile-value-objects.test.ts` | 25 | The reset token's value objects; the token's length and alphabet; the profile-change value object's two-field shape; the reset URL's construction — now asserting the **fragment**, and that no `?` is present |
| `src/domain/accounts/redact-reset-token.test.ts` | 15 | The redaction mechanism: a token removed from a reset link; a query-string token redacted; a fragment token redacted; both sections handled; other parameters kept; `tokenizer` not matched; every occurrence; case-sensitive matching; URL-unsafe characters; and a property check over nine URL shapes |
| `src/application/accounts/reset-and-deactivation.test.ts` | 26 | The three services against fake ports: the neutral confirmation for both paths and byte-for-byte identity across the account states; an Argon2id verification on **every** path; a token issued only for a registered address; the status never changed; the floor held; the two paths measured within the tolerance; the completion's conditional write, its five refusals, and its silence on failure; the deactivation's revocations, its reason, its flag-clearing, its administrator-may-deactivate-another-administrator case, its in-transaction audit row, and its idempotence |
| `src/application/accounts/member-profile-service.test.ts` | 18 | The profile read and write: the view's four fields; the changed-field and previous-value computation; the audit payload; the actor recorded as the member; a no-op writing nothing; every non-`Active` status refused; an unknown account refused |
| `src/application/accounts/password-reset-email.test.ts` | 17 | The email: the lifetime rendered in a human-readable duration for hours, minutes, and seconds, with safe phrases for a zero or negative value; the recipient; the reset link; the **configured** lifetime, not a constant; the single-use statement; the "if you did not request this" statement; **no session and no auto-login token**; a nameless member greeted without a blank; and the HTML escaping of a display name and a URL carrying markup |
| `src/infrastructure/accounts/reset-primitives.test.ts` | 33 | The infrastructure primitives: the keyed token digest (deterministic, 64 hex, never the plaintext, different under a different secret, verified in constant time, a wrong-length digest refused without throwing); the keyed bucket key (never the address, not a bare SHA-256, different under a different secret); the reset configuration's five values and its fallback for every malformed form; the two secrets, each of which **fails loudly** when missing and neither of which is derived from the other; the token generator's length, alphabet, and uniqueness; and the reset link's **fragment** shape |

**The three tests that matter most** are in `reset-and-deactivation.test.ts`:
*"performs an Argon2id verification on every path"* (the work floor is
unconditional), *"marks the token used through the conditional write"* (the
write **is** the check), and *"records the audit event inside the transaction"*
(ADR-3's ordering guarantee).

## Integration Tests

| File | Tests | What it covers |
|---|---|---|
| `src/infrastructure/accounts/reset-deactivation-acceptance.test.ts` | **50** | Every acceptance criterion of all four stories, one or more tests each, plus every edge case the stories name — see the Acceptance Criteria Validation section |
| `src/infrastructure/accounts/reset-primitives.test.ts` | 33 | The infrastructure primitives against the real implementations — see above |
| `src/test/proxy-redaction.test.ts` | 8 | The proxy: the token redacted from the rewritten URL; the token moved into a header the page can still read; the path left intact; other query parameters kept; a no-token request passed through untouched (**the normal case**); an empty token passed through; another path passed through; and a property check over four query-string URL shapes |

**The acceptance suite is the heart of this stage.** It asserts the
**observable** contract — the status code, the body, the `Set-Cookie` header,
the database row, and the trail row — rather than internal calls.

Three of its tests are worth reading in full:

- *"the two responses are byte-for-byte identical"* compares the **raw
  response text** across a registered address, an unregistered address, and
  all four lifecycle states, and asserts a **single distinct body**. A test
  that compared parsed JSON fields could pass while a header or a trailing
  byte differed.
- *"the timing of the two paths is within the tolerance"* **measures** both
  paths rather than asserting a wall-clock bound, and the tolerance is
  configuration.
- *"criterion 3: the reset flow writes no audit record at all"* counts the
  `prisma.auditEvent` rows **before and after** a full request-and-completion
  flow and asserts equality — the property FR-51 requires, now asserted
  rather than inferred.

## Security Tests

`src/infrastructure/accounts/reset-deactivation-acceptance.test.ts` carries
the security concerns, because for this bolt the security properties **are**
the acceptance criteria. The security-specific assertions are:

| Concern | Test | Result |
|---|---|---|
| Anti-enumeration | A registered and an unregistered address return byte-for-byte identical bodies | ✅ |
| Anti-enumeration | The response is identical across all four account states | ✅ |
| Anti-enumeration | The timing of the two paths is within the configured tolerance — **measured** | ✅ |
| Anti-enumeration | The **rate-limited** path is held to the same floor, so a 429 cannot be told from a 202 by its timing | ✅ **after a fix — see Issue 2** |
| Anti-enumeration | A malformed address is a malformed request, not an existence disclosure | ✅ |
| Anti-enumeration | The reset flow writes **no** audit record | ✅ **after a fix — see Issue 3** |
| Anti-enumeration | The email bucket's key is an HMAC, so the counter table holds no address | ✅ |
| Anti-enumeration | The log line carries the keyed hash, never the address | ✅ |
| Anti-enumeration | The log line records the fact of a reset, never the token | ✅ |
| Token secrecy | The token is stored as a digest, never as its plaintext | ✅ |
| Token secrecy | The refusal message carries no token, account, or email | ✅ |
| Token secrecy | The reset link carries the token in the **fragment**, and the server's request log and the page's HTML carry **none** | ✅ — verified live; see the headline finding |
| Token secrecy | The email carries no session and no auto-login token | ✅ |
| Single use | A token is single-use; the replay is refused | ✅ |
| Single use | A used token is marked used, through the **conditional write** | ✅ |
| Single use | An expired token is refused | ✅ |
| Single use | Every token refusal — absent, unknown, used, expired — returns the **same** body | ✅ |
| Atomicity | The completion's token write and the password write commit together | ✅ |
| Atomicity | The deactivation's status change, session revocations, and audit row commit together | ✅ |
| Authorization | A non-administrator is refused the deactivation | ✅ |
| Authorization | The reset routes are available to a signed-out visitor — there is no actor and no invented check | ✅ |
| CSRF | The reset request, the reset completion, the deactivation, and the profile edit each refuse a request with no CSRF token | ✅ |
| Structural | The email, the status, and the administrator flag cannot be changed through the profile route | ✅ |
| Structural | A deactivated account cannot authenticate, and holds no administrator capability | ✅ |
| Idempotence | A second deactivation is a no-op with no duplicate audit record | ✅ |

**The timing test is the one worth reading.** It measures both paths and
asserts they are within the configured tolerance. The miss path performs a
**dummy Argon2id verification** rather than skipping the verification, so the
two costs are the same order; a path that skipped it would be several times
faster and would fail the test by orders of magnitude.

**The rate-limited path's floor was the one that was implemented but not
asserted.** It is now — see Issue 2.

## Performance Tests

The bolt's performance properties are the timing ones above, and they are
measured rather than assumed:

| Property | Target | Actual | Status |
|----------|--------|--------|--------|
| The reset request's response floor | ≥ 250 ms (`AUTH_RESET_MIN_RESPONSE_MS`) | held on every path, including the rate-limited one | ✅ |
| The hit path's and the miss path's difference | ≤ 100 ms (`AUTH_RESET_TIMING_TOLERANCE_MS`) | within tolerance, **measured** | ✅ |
| The rate-limited path's elapsed time | ≥ the floor, ≤ floor + 100 ms | within `[250, 350]` ms | ✅ **after a fix — see Issue 2** |
| The Argon2id verification | — | ~81 ms at ADR-12's work factors, as the design estimated | ✅ |
| The deactivation transaction | ≤ 1 s write budget | one transaction, three write groups, no external call inside it | ✅ |
| The profile edit | ≤ 1 s write budget | one transaction, two writes | ✅ |

**The floor is the dominant term**, which is why the design's own NFR section
was right that the reset request's p95 sits far inside the 2 s budget: the
request pays one Argon2id verification plus the 250 ms floor, and the floor
is a bounded configuration value.

**The email is outside the write**, by construction — it is sent after the
commit — so a slow SMTP relay cannot extend the write path's latency.

## Coverage Report

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 93.62 | 90.20 | 97.26 | **93.72** |
| `application/` | 92.65 | 85.23 | 96.55 | 92.70 |
| `domain/accounts/` | 95.55 | 95.52 | 95.91 | 95.55 |
| `domain/audit/` | 98.84 | 96.77 | 100 | 98.83 |
| `infrastructure/accounts/` | 89.85 | 85.77 | 94.11 | 90.00 |
| `infrastructure/audit/` | 96.20 | 92.85 | 100 | 96.10 |
| `infrastructure/db/` | 95.65 | 77.27 | 100 | 95.65 |
| `lib/` | 100 | 50 | 100 | 100 |
| `src/test/` | 89.65 | 61.11 | 100 | 89.65 |

The floor is 80% lines (`vitest.config.mts`). Every layer is above it.

**The new code is at or near 100%.** The redaction mechanism, the reset
configuration, the reset primitives, the token generator, the bucket key, the
token hasher, and the reset token's value objects all measure 100% lines. The
proxy's coverage is measured through `src/test/`, which shows 89.65%.

`src/app/**` is excluded from the coverage measurement by the config, because
the route handlers are exercised **through** their exported functions rather
than by importing their modules for coverage — the handlers are covered by the
50 acceptance tests, which is a stronger guarantee than a line count.

The lowest branch coverage is `lib/` at 50% — the optional custom-message
branch of `ValidationError` is not exercised. That is a pre-existing gap from
bolt `004`, not an oversight in this bolt.

## Issues Found

| Issue | Severity | Status |
|-------|----------|--------|
| **The design's mechanism for redacting the token from request logs was impossible.** Obligation 5 required the route to redact the `token` query parameter from request logs. A live request to `/reset-password?token=…` was observed in the server's request log carrying the **full token**, and a proxy that stripped the query entirely did **not** remove it from the log. The access log records the **original** request URL and is written **before any application code runs**, so no route, proxy, or rewrite can change it. A design that promised an impossible mechanism would have shipped a security property that did not exist. | **High** | **Fixed in Stage 5** — the token now travels in the URL's **fragment**, which is never sent to the server and therefore never reaches an access log. The page reads it in the browser and **posts it in the body**. Measured live: **0** occurrences in the log, **0** in the HTML. The design artifact is corrected. The proxy remains as a bounded second line of defence for a legacy query-string link |
| **The rate-limited reset request's timing floor was implemented but not asserted.** ADR-18 and the design both require the `RESET_MIN_RESPONSE_MS` floor to apply on the **rate-limited** path as well, because the reset path's accepted response (202) and refused response (429) differ in body — so their timing must not differ either. The implementation did apply the floor, but no test asserted it, so a future change could have removed it without any test failing. | **Medium** | **Fixed in Stage 5** — *"edge case: the rate-limited path is held to the floor too"* exhausts the email bucket, asserts the 429, and asserts the elapsed time is within `[250, 350]` ms |
| **The reset flow's zero-audit-record property was structurally true but unasserted.** FR-51 and the design require that **neither half** of the reset flow writes an audit record. The implementation honoured this, but nothing tested it: a future developer adding an audit call to the reset service would have broken FR-51 with the suite still green. | **Medium** | **Fixed in Stage 5** — *"criterion 3: the reset flow writes no audit record at all"* counts the `prisma.auditEvent` rows before and after a full request-and-completion flow and asserts equality, and asserts that no reset-named record names the account |
| The `login:email:` rate-limit bucket still holds a **plaintext address** — bolt `004`'s existing behaviour, and the very thing ADR-19 forbids on the reset path. | **Medium** | **Open — not a regression, and not this bolt's scope.** It is pre-existing code that this bolt deliberately did not touch, because the reset path's own bucket key is the keyed digest ADR-19 specifies. Raised for the owner to schedule |
| The reset email's subject and body are marked `[PENDING UX EDIT]`. `EXPERIENCE.md` §9.3a defines the confirmation screen's copy and classifies the email, but **defines no subject or body for the reset email itself**. | **Medium** | **Open — by design and by the owner's decision.** The email is assembled from **named parts** with the wording pending, so the eventual copy is a single visible edit in one place. It should be approved before the email reaches a real member |
| The `SessionService` activity-refresh's deferred-failure branch is untested — bolt `004`'s Open item 3. | **Low** | **Open — still not this bolt's scope.** The refresh path itself is exercised; the write-failure branch is not. Recorded here so it is not mistaken for an oversight |

**No critical or high-severity issues remain open.** The one high-severity
issue was found by Stage 5 and fixed in Stage 5 — and it was found by
**measurement**, which is the only way it could have been found.

## Errors Found and Fixed During This Stage

Four test failures in the **new** tests, all errors in the tests rather than
in the code:

1. *"never lets the token reach the rewritten URL"* asserted on the
   `x-middleware-rewrite` header, which was `null` — because `NextResponse.next()`
   with only modified request headers does not emit a rewrite header. The
   proxy now uses `NextResponse.rewrite(redactedUrl, { request: { headers } })`,
   which is also the correct mechanism: the request must be **served from**
   the redacted URL, not merely passed through.
2. *"moves the token into a header, so the page can still read it"* asserted
   the token under `x-middleware-override-headers`. Next.js carries an
   overridden request header under `x-middleware-request-<name>`, so the
   assertion now reads that prefix.
3. The redaction marker's first value was `[redacted]`, which `URLSearchParams`
   percent-encodes to `%5Bredacted%5D` — a log marker legible to nobody
   reading an access log at three in the morning. The constant is now
   `redacted`, with **no** characters needing encoding.
4. The `config.matcher` used a template literal, `` [`${RESET_PATH}`] ``,
   which Next.js rejected at build time: *"Entry 'matcher[0]' need to be
   static strings or static objects."* The matcher is now the static literal
   `['/reset-password']`.

**Two further problems were found by the tooling, and both were fixed in the
product rather than worked around:**

5. The build warned that *the `middleware` file convention is deprecated — use
   `proxy` instead*. Next 16 renamed the convention. The file was renamed
   `src/middleware.ts` → `src/proxy.ts`, the export `middleware` → `proxy`,
   and the test's import updated. This was verified against Next's own
   source — `PROXY_FILENAME = 'proxy'` in
   `node_modules/next/dist/server/constants.js` and `isProxy = page ===
   '/proxy'` in `get-page-static-info.js` — rather than taken from the warning
   alone.
6. The lint rule `react-hooks/set-state-in-effect` rejected the client
   component's original `useState` + `useEffect` implementation of reading
   `window.location.hash`. **The rule was right.** The URL is state the
   browser owns and can change on its own — a back button, a hash change, a
   pasted link — so it is subscribed to as an external store with
   `useSyncExternalStore`. The rewrite also removed a real defect: the
   `useState` version would have rendered the "not valid" message first and
   then the real one, and would have missed a hash change after the first
   render.

## Ready for Operations

- [x] All acceptance criteria met
- [x] Code coverage > 80% — **93.72% lines**
- [x] No critical/high severity issues open — the one found in this stage is
      fixed in this stage
- [x] Performance targets met — the floor holds on every path, and the two
      paths are measured within the tolerance
- [x] Security tests passing — 33 security assertions across the acceptance
      and proxy suites

**Verification run for this stage:** typecheck pass · lint pass ·
**815/815 tests across 56 files** · coverage 93.72% lines / 90.20% branches /
97.26% functions · build pass, with `ƒ Proxy (Middleware)` registered and
`/reset-password` served as a dynamic route · a **live `npm run dev` smoke
test** of the reset link's shape, measuring the token's presence in the
request log and in the served HTML.

### The manual route check

This is the construction protocol's CP-3 check, and it is the **only** check
in this stage that touched the built application rather than a test harness.

The reset link's shape was exercised against the dev server at
`http://localhost:3000`, in both the shape the email now produces and the
shape it used to produce:

1 - `GET /reset-password#token=live-smoke-token-abc123DEF456` (the fragment
link — what the email sends) → **200**, and the request log line reads
`GET /reset-password 200` — **no token**. The served HTML contains **zero**
occurrences of the token.

2 - `GET /reset-password?token=live-smoke-token-abc123DEF456` (the old
query-string shape) → **200**, and the request log line reads
`GET /reset-password?token=live-smoke-token-abc123DEF456 200` — **the token
is present**. The served HTML also carries it.

**The second result is the finding, not a failure.** It is the measurement
that proved the design's mechanism impossible: the token was already in the
access log before any application code ran, and the proxy could not remove
it. The first result is the fix, verified.

**The query-string case is now bounded rather than fixed.** The proxy keeps
the token out of the **route handler** and the **page's markup** for a legacy
or hand-built link. It cannot un-write the log line. This is recorded in
`src/proxy.ts`'s own documentation and in the corrected design, so no future
reader believes the application can redact an access log.

**Not manually tested.** The reset email's delivery cannot be exercised
locally (CP-4) and is covered by automated test only: the email's recipient,
its link, its configured lifetime, its escaping, and its "no session, no
auto-login token" property are asserted by
`password-reset-email.test.ts` and by the acceptance suite, and a send
failure is asserted not to roll back the token issue.

## Open items for the owner

### Open item 1 — the reset link's shape changed, and Unit 007 must build against it

The reset link is now:

```text
{APP_BASE_URL}/reset-password#token={plaintext}
```

**not**

```text
{APP_BASE_URL}/reset-password?token={plaintext}
```

This is a **contract change** for the `/reset-password` screen, which is
**Unit 007's**. Unit 007 must build the page against the **fragment** — the
page reads `window.location.hash`, and the token is posted in the request
**body**, never as a query parameter.

`src/app/reset-password/reset-password-form.tsx` in this bolt is a
**placeholder**: it proves the fragment is readable in the browser and that
the page is a server component rendering a client component. It is **not**
the finished form. Unit 007 replaces it with the real form, and it must keep
the fragment contract.

### Open item 2 — the reset email's copy is still pending

Unchanged from Stage 2 and Stage 4. The structure is built; the wording is
`[PENDING UX EDIT]`. The requested `EXPERIENCE.md` addition is written out
in full in `ddd-02-technical-design.md` under "The UX edit being requested".

**The copy must not describe the link as a query-string URL**, and it should
not describe the mechanism — it should say the link is single-use and
time-limited, which is what a member needs to know.

### Open item 3 — the `login:email:` bucket still holds a plaintext address

Bolt `004`'s existing behaviour, not a regression, and deliberately not
touched by this bolt. ADR-19's reasoning applies to it exactly as it applies
to the reset bucket. **Recommendation: schedule it.**

### Open item 4 — the Vercel runtime must be Node 24

ADR-12 requires Node 24 for `crypto.argon2`, and the reset path uses the same
hasher. The build passes locally on Node 24; the deployment's runtime setting
must match, or the reset completion and the login will fail at runtime.

### Open item 5 — the module map's FR-27 row

The module map still names FR-27 under `notifications/`. The reset email is
owned by `accounts/` (ADR-14's rule: the trigger's module owns the email), so
the map's row is out of date. The unit brief's "Vercel rate limiting" row is
also incorrect — the limiter is database-backed (ADR-15), and Vercel's rate
limiting is not used.

## Recommendations

1. **Do not treat the proxy as the protection it was once specified to be.**
   It is a **second** line of defence, and its own documentation now says so.
   The protection is the fragment. If a future change moves the token back
   into the query string, the access log will hold it again, and no test will
   fail — because the property being protected is a property of the **URL's
   shape**, not of the application code. **Recommendation: keep the
   `buildResetLink` test that asserts the fragment, and treat it as a
   security regression test.**

2. **The `reset-password` page must be `force-dynamic` and must never be
   cached.** A cached page would serve one member's rendered markup to
   another. This bolt's page sets `export const dynamic = 'force-dynamic'`;
   Unit 007's real form must keep it.

3. **Re-measure the reset timings on a Vercel Hobby deployment.** The
   Argon2id cost dominates, and a Hobby instance is slower than this host.
   The floor is a **minimum**, not a target — a slower host pushes both paths
   above it together, which preserves the property, but the tolerance's
   margin is worth confirming on the real infrastructure.

4. **The deactivation's audit row should be checked against the frozen
   catalog's numbering.** This bolt consumes event **13**
   (`account.deactivated`) and introduces **no new number**. If the catalog
   later grows, 13 must remain 13.

## Per-file test counts

| `src/application/accounts/account-approved-email.test.ts` | 10 |
| `src/application/accounts/member-profile-service.test.ts` | 18 |
| `src/application/accounts/password-reset-email.test.ts` | 17 |
| `src/application/accounts/reset-and-deactivation.test.ts` | 26 |
| `src/application/accounts/use-cases.test.ts` | 19 |
| `src/application/audit-read-recorder.test.ts` | 3 |
| `src/application/audit-trail-reader.test.ts` | 5 |
| `src/application/audit-trail-service.test.ts` | 16 |
| `src/application/audit-writer.test.ts` | 6 |
| `src/application/classify-write-failure.test.ts` | 10 |
| `src/application/lost-side-event-factory.test.ts` | 28 |
| `src/application/quota-monitor.test.ts` | 9 |
| `src/domain/accounts/account.test.ts` | 21 |
| `src/domain/accounts/actor-context.test.ts` | 7 |
| `src/domain/accounts/deactivation-and-profile.test.ts` | 18 |
| `src/domain/accounts/redact-reset-token.test.ts` | 15 |
| `src/domain/accounts/reset-and-profile-value-objects.test.ts` | 25 |
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
| `src/infrastructure/accounts/reset-deactivation-acceptance.test.ts` | 50 |
| `src/infrastructure/accounts/reset-primitives.test.ts` | 33 |
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
| `src/test/proxy-redaction.test.ts` | 8 |
| **Total** | **815** |
