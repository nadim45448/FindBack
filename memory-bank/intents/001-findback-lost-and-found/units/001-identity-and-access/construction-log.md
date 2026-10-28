---
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
created: 2026-10-27T10:15:00Z
last_updated: 2026-10-28T17:05:00Z
---

# Construction Log: identity-and-access

Original Plan

**From Inception**: 2 bolts planned
**Planned Date**: 2026-10-23

| Bolt ID | Stories | Type |
|---|---|---|
| `004-identity-core` | 001-self-registration, 002-administrator-review-of-registrations, 003-login-with-active-account, 005-logout-revokes-session, 006-pending-member-restricted-access, 007-owner-rejects-registration | DDD |
| `005-identity-security` | 004-deactivate-an-account, 008-reset-request-never-discloses-account, 009-reset-password, 010-update-member-profile | DDD |

Replanning History

| Date | Action | Change | Reason | Approved |
|---|---|---|---|---|
| 2026-10-27 | stage-list-correction | `004-identity-core` stage list corrected from 4 to 5 stages | The DDD bolt type defines 5 stages including the optional ADR Analysis stage; the bolt file listed only 4 — the same correction applied to bolts `001`–`003` in unit 006 | n/a — correction to match the authoritative bolt type, no scope change |

Current Bolt Structure

| Bolt ID | Stories | Status | Changed |
|---|---|---|---|
| `004-identity-core` | 6 | ✅ complete | 2026-10-27 |
| `005-identity-security` | 4 | ✅ complete | 2026-10-28 |

Execution History

| Date | Bolt | Event | Details |
|---|---|---|---|
| 2026-10-27 | `004-identity-core` | started | Stage 1: Domain Model. Stage list corrected from 4 to 5 stages to match the authoritative DDD bolt type, as with bolts 001–003 in unit 006. The unit's ten stories were split 6 / 4 between this bolt and `005-identity-security`; deactivation, password recovery, and the member profile are the latter's scope, because deactivation's defining property is session revocation and belongs with the security work |
| 2026-10-27 | `004-identity-core` | stage-complete | model → design (pending owner review). Two conflicts raised for owner confirmation before Stage 2 designs them: FR-2 requires a registration audit record that the frozen FR-31 numbered catalog does not have a number for, and FR-3's minimum-5-character rejection reason conflicts with the story's "rejected without a reason" edge case |
| 2026-10-27 | `004-identity-core` | decision | Owner confirmed both Stage 1 conflicts. Conflict 1 → a third **unnumbered** catalog type, `registration.submitted`, with `event_number` NULL, `parent_type` `account`, and FR-2's name/email/role in `metadata`. Conflict 2 → the route boundary enforces FR-3's 5-character minimum; the aggregate tolerates a missing reason as a safety net |
| 2026-10-27 | `004-identity-core` | stage-complete | design → adr (pending owner review). Nineteen design decisions recorded. Two runtime probes settled decisions the repository could not: **Node 24's built-in `crypto.argon2` exists** (no native dependency needed) and the **Argon2id work-factor cost** was measured. One item raised for owner confirmation — adding the FR-2 registration record to `EXPERIENCE.md` §17.7's account-disclosure list. One deployment prerequisite flagged — the Vercel runtime must be set to Node 24 |
| 2026-10-27 | `004-identity-core` | decision | Owner approved the Stage 2 open item: the FR-2 registration record is added to `EXPERIENCE.md` §17.7's administrator account-disclosure list. The frozen UX spine was updated in **six linked places** — §17's authority line and non-numbered bullet, §17.5a's heading, intro, record list, and closing line, §17.7's "Records shown" list, and the §24.1 FR-2 traceability row. A single-bullet edit would have left §17.5a claiming two non-numbered record types while §17.7 listed three. No event is renumbered; events 1–30 are untouched |
| 2026-10-27 | `004-identity-core` | stage-complete | adr → implement (pending owner review). Five ADR opportunities were presented and the owner selected "create all five". **ADR-12** Argon2id via Node's built-in `crypto.argon2`, `engines.node` raised to `>=24`, no native dependency, work factors `memory=65536 / iterations=3 / parallelism=1` configured and embedded in the stored hash. **ADR-13** the module is `accounts/`, not `identity/` — two standards and three prior bolts say `accounts/`, so the Stage 2 naming was withdrawn and the design revised. **ADR-14** the `accounts` module owns the FR-27 email end to end; the transport is a shared `EmailSender` port. **ADR-15** rate limiting is a database-backed fixed-window counter, not a Vercel product. **ADR-16** session activity refreshes at most once per hour, so the idle window is 13–14 days rather than exactly 14 |
| 2026-10-27 | `004-identity-core` | stage-complete | implement → test (pending owner review). The identity module is built end to end: schema and migration, domain, application, infrastructure, and six route handlers. `npm run verify` passes — typecheck, lint, **514/514 tests across 43 files**, and the production build with all six routes. Coverage **88.78%**. **Three real defects were found and fixed**, all in this bolt's own code: Node's Argon2 `iterations` key is silently ignored (the real field is `passes`, so the Stage 2 probe measured a 1-pass hash labelled 3-pass); the SMTP sender issued `STARTTLS` without upgrading the socket, so credentials and the message body would have gone out in plaintext; and the SMTP line reader attached and detached a `data` listener per response, so every line arriving between two responses was lost |
| 2026-10-27 | `004-identity-core` | stage-complete | test → complete (pending owner review). Stage 5 wrote the acceptance, security, and performance suites and drove the **real route handlers** against the live database. **604/604 tests pass across 47 files**; coverage **92.16% lines** / 88.25% branches / 96.35% functions, up from 88.78% at Stage 4. Typecheck, lint, and the production build pass with all six routes registered; `npm run smoke:identity` passes **12/12**; the six routes were exercised by hand with `curl` against the running dev server. **Two more High-severity defects were found and fixed in the Stage 4 code** — the login throttle answered 429 "Too many attempts", making it an account-existence oracle that ADR-15 and FR-4 forbid (now the generic inactive message with a 401 and a retained `Retry-After`), and `SessionService.resolve()` never consulted `canAuthenticate()`, so a `Rejected` account's session stayed live after rejection (now `null`). The stage also **found a gap in its own coverage and closed it**: story 003's `Rejected` and `Deactivated` criteria had no test at the route boundary, and two tests were added. One specification conflict is recorded as Open item 1 — story 003 criterion 2 contradicts PRD FR-4 on a `Pending` login; the implementation follows the PRD, and the story file was not amended |
| 2026-10-28 | `005-identity-security` | stage-complete | model → design → adr → implement. The four stories are implemented across the domain, application, and infrastructure layers, with four new route handlers. **Verified:** typecheck exit 0, lint exit 0, the full suite **790/790 across 54 files** (605 before, plus 185 new), the production build succeeds, and a **live `npm run dev` smoke test** exercised every new endpoint. **FR-51's three halves were proven live**: identical response bodies for registered and unregistered addresses, timings 0.27s/0.27s and 0.28s/0.26s against ADR-18's 250 ms floor and 100 ms tolerance, and 64-hex keyed digests — never an address — in the rate-limit counter rows and the logs. **"First use wins" is a conditional write**, so the write *is* the check. **FR-52 is structurally enforced** by the shape of `ProfileChange`, not by a runtime check. Two owner follow-ups carried forward: the `login:email:` bucket still holds a plaintext address (bolt `004`'s behaviour, the same reasoning as ADR-19), and the reset email's copy is still marked `[PENDING UX EDIT]` |
| 2026-10-28 | `005-identity-security` | stage-complete | test → complete (pending owner review). **Stage 5 found a High-severity defect in the Stage 2 design, and it found it by measurement rather than by reading.** The design required the route to "redact the `token` query parameter from request logs"; two live requests established that **no application code can do this** — a request to `/reset-password?token=…` was observed in the server's request log carrying the **full token**, and a proxy that stripped the query entirely did **not** remove it. The reason is structural: the access log records the **original** request URL and is written **before any application code runs**. **The fix is that the token now travels in the URL's fragment** — never sent to the server, so never in the request line and never in an access log; the page reads it in the browser and **posts it in the request body**. Measured live: **0** occurrences in the log, **0** in the HTML. This reverses the design's own reasoning, which had rejected the fragment because "the server could not read it to look up the token" — but the server does not need to: the page reads it and posts it. **`ddd-02-technical-design.md` was corrected** (the link's shape, obligation 5, and three traceability rows), and the proxy remains as a bounded **second** line of defence for a legacy `?token=…` link. **Two more gaps were closed:** the rate-limited path's timing floor was implemented but **unasserted** (now measured within `[250, 350]` ms), and the reset flow's **zero-audit-record** property was structurally true but **unasserted** (now counted before and after a full flow). **Verified:** typecheck pass, lint pass, **815/815 across 56 files**, coverage **93.72% lines** / 90.20% branches / 97.26% functions, build pass. The ten Stage 4 obligations were audited against the real code — nine hold as written, the tenth was the impossible one; one wording deviation recorded (`Account.deactivate()` vs the free function `deactivateAccount`, matching bolt `004`'s convention). Five owner follow-ups carried forward, none blocking |

Execution Summary

| Metric | Value |
|---|---|
| Original bolts planned | 2 |
| Current bolt count | 2 |
| Bolts completed | 2 |
| Bolts in progress | 0 |
| Bolts remaining | 0 |
| Stories in this bolt | 6 |
| Stories implemented | 6 |
| Stories remaining | 0 |
| Stories in `005-identity-security` | 4 |
| Stories implemented in `005-identity-security` | 4 |
| Stages completed | 10 (`004-identity-core`: model, design, adr, implement, test — 5 of 5; `005-identity-security`: model, design, adr, implement, test — 5 of 5) |
| ADRs created | 8 (ADR-12 … ADR-19) |

---

## Bolt `004-identity-core` — Stage 1 (Domain Model)

**Artifact:** `memory-bank/bolts/004-identity-core/ddd-01-domain-model.md`
**Completed:** 2026-10-27T10:15:00Z

### What the model fixes

**The lifecycle.** `Pending → Active → Deactivated` and `Pending → Rejected`.
`approve()` and `reject()` are legal **only** from `Pending`, so a second
administrator's decision is refused — this is the story's concurrent-decision
edge case, made structural rather than a check. `Rejected` and `Deactivated`
are terminal. `Active` has **no** outgoing edge in this bolt, because
deactivation is `005-identity-security`'s scope; modelling a transition this
bolt does not implement would leave a half-built path in the aggregate.

**The restriction is enforced once.** Story 006's technical note is explicit
that the restriction lives at the `ActorContext` boundary, not in each unit.
The model therefore makes it a property of the resolved actor —
`ActorContext.status` — and gives the `Account` entity no "is this allowed"
method, because that would invite a downstream unit to ask the wrong question.
A `Pending → Active` change needs no data migration, and a stale cached
context after deactivation is impossible, because the context is a per-request
value rather than a session attribute.

**The anti-enumeration rule is a type.** FR-4, story 003 criterion 5, and story
007 criterion 3 all require that a refused login be indistinguishable from a
wrong password and from an unknown email. The model gives
`AuthenticationService.authenticate()` exactly two outcomes — an
`AuthenticatedActor` or a single `GenericInactiveMessage` value object — so
there is no third shape to accidentally make differ. The copy is verbatim from
`EXPERIENCE.md` §9.3. The internal-only `reason` on the `LoginRefused` event
lets the operational log distinguish the cases for diagnosis while the
**response** distinguishes nothing.

**Sessions are rows, not tokens.** The `Session` aggregate stores a
`SessionTokenHash` and never the `SessionToken`; the plaintext exists only
long enough to hash and to set the `__Host-` cookie. Revocation is terminal
and idempotent. Expiry is 14 days of inactivity.

**The domain's transaction and email boundaries are explicit.** The audit
writer takes a transaction handle as a required parameter, so an audit entry
for a transition that did not happen is not constructible. The email sender is
called **only** from the approval path and **only after** the transaction
commits — a send failure is logged and never rolls back or blocks the
approval. Rejection and registration send no email at all.

### Two conflicts raised for owner confirmation

**Conflict 1 — FR-2 requires a registration audit record, and the frozen
catalog has no number for one.** FR-2's testable consequences state that "the
audit trail records the registration event with the user's name, email, and
self-declared role and timestamp." But FR-31's authoritative catalog has
**no registration-submitted event** — events 11, 12, and 13 cover *approved*,
*rejected*, and *deactivated* only, and FR-31 calls events 1–30 "the
complete numbered workflow/lifecycle audit-event catalog" while permitting
non-numbered records only where another requirement explicitly asks for one.

Three readings were considered. A **numbered** event was rejected outright —
it contradicts a frozen requirement. The model is built on an **unnumbered**
record, on the grounds that FR-2 *does* explicitly require the record and
FR-31's own non-numbered rule is written for exactly that case ("additional
audit records explicitly required by other requirements"). The alternative is
to record nothing at registration, which leaves FR-2's requirement unmet.

The model leaves the record's **name and field set** to Stage 2, because those
are catalog decisions. It fixes the *shape*: one append-only,
administrator-only, unnumbered record per registration, carrying the display
name, the registered email, the self-declared role, and the timestamp.

One sub-question rides along: **the registered email.** FR-37 lists the
*reporter's* email on a *report* as a Sensitive Field, but an account's own
registered email is administrator-visible by design — FR-3 shows it on the
registration queue, and the account-management surface shows it. The model
therefore treats it as administrator-visible but **never loggable**: it appears
on the trail record and the queue, never on an operational log line, which has
no field capable of holding it (`RequestContext` is a closed shape).

**Conflict 2 — FR-3's minimum-5-character rejection reason versus the
story's own edge case.** FR-3 says a rejection "requires a short reason (free
text, minimum 5 characters)". Story 002's edge-case table says "Rejection
reason left blank → Rejected without a reason string". Both cannot hold.

The model resolves it by reading them as rules at **different layers**, which
is the only reading that leaves both intact: the **route boundary** enforces
the PRD's minimum — a submitted reason of fewer than 5 characters is a
validation error and the decision does not commit — while the **aggregate**
does not require a reason to exist, because a decision must always be
recordable and an administrator must never be unable to reject an account
because the reason box was empty. A request reaching the domain with a
sub-minimum reason was already refused earlier; the domain's tolerance is a
safety net for a path the boundary closed. The alternative — enforcing the
minimum in the domain — would make the story's edge case untestable.

### Two open items carried into Stage 2

**The Argon2id work factors are unconfigured.** The PRD requires adaptive
hashing and the unit brief names Argon2id, but no factor is specified
anywhere, and the brief requires the factors to be **configured, not
hardcoded**. Stage 2 picks the value and the configuration surface; Stage 3
should record it as an ADR if the trade-off is real (a higher factor slows
the login path against stronger resistance to offline cracking).

**The session-expiry update granularity.** FR-4 says sessions expire after 14
days of inactivity. The model treats `expiresAt` as a stored timestamp
recomputed from `lastActivityAt`, but on Vercel Hobby that is a database write
on the hot path of every authenticated request. Stage 2 must decide whether
`lastActivityAt` is updated on **every** request or only when it crosses a
threshold. The model fixes the semantics — 14 days from the last activity — and
leaves the update granularity to Stage 2.

### Scope held back deliberately

**Password reset (FR-51)** is out: the `PasswordResetToken` entity and its
repository are modelled so the aggregate's shape is complete, but no use case
here creates one. FR-51's anti-enumeration requirement is harder than
FR-4's — the response must match in body, timing, **and** screen state
whether or not the account exists — and it belongs with the security work.

**Deactivation (FR-5)** is out: event 13 is modelled, the use case is not
built. The `Session` aggregate's `revoke()` **is** built, because
deactivation's whole point is revoking every session, and bolt `005` will
call it.

**Rate limiting is not modelled.** The PRD requires it on registration and
login, and the mechanism — including where the counters live on a free-tier
database — is a Stage 2 decision, not a domain fact. **It must not be
forgotten**: Stage 2 must place it.

**CSRF tokens** are not modelled. They are a cross-cutting transport concern,
not a domain concept.

### The stage's checkpoint

Stage 1 is an **artifact-only** step. There is nothing to run, and no check
was run for it. The dev server is still up at `http://localhost:3000` (PID
142358, HTTP 200) and was left running for the owner, as required by
`construction-protocol.md` CP-3.

**The bolt is paused at the Stage 1 checkpoint.** The two conflicts above need
owner confirmation before Stage 2 designs around them.

---

## Bolt `004-identity-core` — Stage 2 (Technical Design)

**Artifact:** `memory-bank/bolts/004-identity-core/ddd-02-technical-design.md`
**Completed:** 2026-10-27T11:40:00Z

### The two Stage 1 conflicts, now closed

The owner confirmed both readings at the Stage 1 checkpoint, and Stage 2
designed around them.

**Conflict 1 → a third non-numbered catalog type.** The record is
`registration.submitted`: `event_number` NULL, `parent_type` `account`,
`parent_id` the new account, `actor_id` the registering account's own id,
`actor_role` `member`, and FR-2's three fields — display name, registered
email, self-declared role — in `metadata`. The name is distinct from
`registration.approved` (event 11) and `registration.rejected` (event 12), so
the three are independently queryable. Events 1–30 are untouched.

**Conflict 2 → two layers.** The route boundary enforces FR-3's 5-character
minimum; the aggregate accepts a missing reason so an administrator is never
blocked from rejecting an account. The design makes this concrete: the
boundary raises `ValidationError`, and the domain's `reject()` takes an
optional reason.

### Two decisions the repository could not settle, resolved by probe

Stage 2 forbids reading or writing application source, so two decisions could
not be answered from the repository and were resolved by **read-only capability
probes** against the Node runtime and the npm registry. Both probes are
recorded in full in the design artifact and are reproducible.

**Node 24 has a built-in Argon2id.** `crypto.argon2Sync` exists in Node
24.19.0 (Krypton LTS), the version `construction-protocol.md` lists as a
prerequisite. The probe confirmed it produces a 32-byte tag, is deterministic
for the same nonce and parameters, and yields a different result for a
different password. The API needs `nonce` (not `salt`), `memory` (not
`memoryCost`), `iterations` (not `timeCost`), and `passes`.

**This removed a dependency.** `argon2` and `@node-rs/argon2` are both on npm
and would work, but each adds a compiled binary to the deployment. Node's
built-in implementation is the same algorithm with no build step and no
supply-chain dependency.

**The work-factor cost was measured, not guessed.** On this host:
19 MiB / 2 iterations ≈ 14 ms; **64 MiB / 3 iterations ≈ 81 ms**; 128 MiB /
3 iterations ≈ 151 ms. The chosen factors are **64 MiB / 3 iterations /
parallelism 1**, configurable, and embedded in the stored hash so raising them
later does not invalidate existing passwords. `parallelism = 1` over `4`
despite the 68 ms measurement, because a 4-way hash consumes roughly 4× the
memory per concurrent request and serverless memory is the scarcer resource.

### The session-refresh decision, and why it is stated rather than hidden

FR-4 says sessions expire after 14 days of inactivity. The design stores
`expires_at` and refreshes it — but **at most once per hour**, not on every
request. Updating two timestamp columns on every authenticated request puts
a database write on the hot path of every page view and every API call, which
is the largest avoidable write load in the system.

The cost is an approximation: the stored `last_activity_at` may lag by up to
an hour, so the effective idle window is **13 to 14 days** rather than
exactly 14. The design states this explicitly rather than burying it, and
Stage 5 should assert the effective window so the approximation is a tested
property rather than an accident.

**Expiry is enforced on read, not by a sweeper.** A session is usable only if
`revoked_at IS NULL AND expires_at > now()`, checked on every resolution, so
correctness never depends on a cron job. A daily idempotent sweep removes
rows older than 30 days for storage only.

### The rate-limiter decision, and the $0 ceiling

The unit brief names "Vercel rate limiting" as an integration point. **The
design does not use it.** The PRD requires the *behaviour*; it does not
require a vendor, and a paid product would strain the hard $0 ceiling.

The limiter is a database-backed fixed-window counter behind a `RateLimiter`
port. **Login has two buckets** — by IP and by normalized email — and a
request is allowed only if both are under their limits. One bucket alone
leaves a hole in each direction: an IP-only limiter lets one attacker lock out
a whole campus behind a NAT, and an email-only limiter lets an attacker
enumerate accounts by watching which addresses get throttled. **Registration
is IP-scoped only**, because an email-keyed registration limiter would be an
account-existence oracle and FR-1's 409 already is one.

An in-memory counter was rejected: on a serverless runtime it is per-instance
and resets on every cold start, so it would not limit anything.

### The registration record's three consequences, all required in Stage 4

Adding `registration.submitted` is not free, and the design names all three
consequences rather than discovering them at implementation time.

1. **`src/domain/audit/prd-parity.test.ts` must change.** It currently
   asserts there are exactly **two** non-numbered record types:
   `expect(nonNumbered.map((entry) => entry.type).sort()).toEqual(['member_profile.edited', 'report.edited_by_administrator'])`.
   A third type fails it. The test's own comment says "The PRD names two
   records that carry no numbered identifier" — after this bolt the PRD names
   **three**, because FR-2 is a third requirement that explicitly requires a
   record. FR-31's rule reads "Additional audit records explicitly required by
   other requirements … In particular: FR-52 … FR-53 …", and "in particular"
   is illustrative rather than exhaustive. The **numbered** parity check
   (events 1–30) is untouched.
2. **The catalog entry must name the three fields.** The catalog-aware
   sanitizer permits a field only where the entry names it, so
   `registration.submitted` names `displayName`, `email`, and
   `selfDeclaredRole` — and the sanitizer's deny-by-default behaviour then
   permits exactly those three.
3. **The `/admin/accounts` disclosure must show it.** `EXPERIENCE.md` §17.7
   lists events 11/12/13 and the FR-52 records. It does not list a
   registration record, because none existed when the spine was frozen. See
   the open item below.

### One item raised for owner confirmation — and resolved

**Adding the FR-2 registration record to `EXPERIENCE.md` §17.7.** The
administrator account disclosure lists the records shown in
`/admin/accounts`, and the registration record is now one of them — so
without the edit, the trail holds the record FR-2 requires but the surface
built to show account history omits it.

`EXPERIENCE.md` is a **frozen UX spine**, and Unit 007's brief explicitly
puts "any change to the UX spines" out of scope. So this was the owner's call.

**The owner approved it, and the spine has been updated.** The edit was made
in **six linked places**, not one. A single §17.7 bullet would have left the
spine internally inconsistent, because **§17.5a is the section that *defines*
the non-numbered record types** — and it listed exactly two.

| Location | Change |
|---|---|
| §17 authority line | `Authority: PRD FR-31, FR-32, FR-48, FR-2, FR-52, FR-53`; the bullet now reads "FR-2, FR-52 and FR-53 add **non-numbered** audit record types (`Registration submitted`, `Member profile edited`, `Report edited by Administrator`)" |
| §17.5a heading | `### 17.5a Non-numbered audit record types (PRD FR-2, FR-52, FR-53)` |
| §17.5a intro | Now names FR-2 as a third requirement that adds a non-numbered record type |
| §17.5a record list | New first bullet: **`Registration submitted` (FR-2)** — recorded once when a registration creates the `Pending` account; no numbered workflow-event ID; no email fires (FR-1); the actor is the registering member, who is the account being created; fields are actor, account target, timestamp, display name, registered email, self-declared role |
| §17.5a closing line | "The FR-2, FR-52 and FR-53 audit records above are additional non-numbered record types." |
| §17.7 "Records shown" | New bullet: **FR-2 non-numbered `Registration submitted`** records (actor, target account, timestamp, display name, registered email, self-declared role) |
| §24.1 FR matrix | The FR-2 row now also names the registration audit record and points at §17.5a and §17.7, so the matrix's coverage claim matches what the spine specifies |

**What the change does not do.** It adds no member-facing surface, no
notification, and no new user action — a record in an administrator-only
disclosure. It **renumbers nothing**: events 1–30 are untouched, and the
spine's own "No new audit events are introduced. No event is renumbered."
remains true. The new entry is a *record*, not an *event* — FR-31's numbered
catalog is unchanged, and §17.5a's own opening line already distinguished the
two.

### A deployment prerequisite, flagged for visibility

The Argon2id decision requires **Node ≥ 24**. `package.json` currently
declares `"node": ">=20"`, and Vercel's default runtime is Node 22.x with 24
available as a selectable project setting.

**If the deployment stays on Node 22, `crypto.argon2Sync` is `undefined` at
runtime and every password hash fails.** This is a deployment setting the
owner must change on the Vercel project, plus an `engines` bump in Stage 4.

The alternatives, if the Vercel runtime cannot be moved to Node 24: use
`@node-rs/argon2` (a native dependency that works on Node 22), or use
`crypto.scrypt` (built in, but not Argon2id, and the unit brief names
Argon2id). The recommendation is to set the runtime to Node 24 and raise the
`engines` floor to match — but the owner should decide **before** Stage 4,
because it changes the dependency shape.

### Other design decisions worth knowing

**The API is backend-first; the pages belong to Unit 007.** This bolt owns
the use cases, the ports, the persistence, and the route handlers. Unit 007's
brief owns the surfaces ("All business rules — Units 001 through 006") and
lists `/register`, `/login`, `/pending`, and `/pending-registered` as its own
surfaces. This is the most likely place for scope drift, so the design states
the split as an explicit route-ownership table.

**The schema adds three tables** — `accounts`, `sessions`, and
`password_reset_tokens` — in one migration that does not touch the audit
tables. The `password_reset_tokens` table is created now so the schema is
coherent, and it **stays empty** until bolt 005.

**Email is stored normalized and protected by a functional unique index** on
`lower(btrim(email))`. One decision satisfies three story edge cases at once
(case-differing duplicates, whitespace trimming, case-differing login), and
the database is the final arbiter against a concurrent-registration race.

**The session cookie is `__Host-`**, with `HttpOnly`, `Secure`,
`SameSite=Lax`, `Path=/`, and no `Domain` attribute. The `Secure` flag is
omitted **only** when `NODE_ENV !== 'production'`, for local HTTP
development, and a test asserts that conditional so it cannot leak into a
production build.

**CSRF tokens are HMACs over the session token hash, keyed by
`SESSION_SECRET`** — no per-request store and no table, and bound to the
session. This is the design's weakest point and the design says so: the
token is valid for the session's life rather than one request. The PRD's
requirement ("a CSRF token on every state-changing request") is met.

### The stage's checkpoint

Stage 2 is an **artifact-only** step. There is nothing to run, and no test or
build was run for it — the two runtime probes described above were capability
checks against the Node runtime and the npm registry, not project checks.

The dev server is still up at `http://localhost:3000` (HTTP 200) and was left
running for the owner.

**The bolt is paused at the Stage 2 checkpoint.** The `EXPERIENCE.md` §17.7
open item is **closed** — the owner approved it and the spine has been
updated. The **Node 24 runtime prerequisite** should still be settled before
Stage 4, since it changes the dependency shape. Stage 3 (ADR Analysis) is
next, and the design nominates one ADR candidate: the Argon2id implementation
choice.

---

## Bolt `004-identity-core` — Stage 3 (ADR Analysis)

**Artifacts:** five ADRs in `memory-bank/bolts/004-identity-core/`
**Completed:** 2026-10-27T13:30:00Z

### Five opportunities, five ADRs

Stage 3 read the Stage 2 design against the standards and the already-
constructed bolts, and found **five** decisions worth recording. The design
nominated one; the comparison surfaced four more. The owner selected "create
all five."

### A defect in my own Stage 2 design, found and fixed

**The `Secure` cookie flag.** Stage 2 had proposed dropping the session
cookie's `Secure` flag when `NODE_ENV !== 'production'`, so the cookie would
work over local HTTP. That would have **broken local login entirely**: a
`__Host-` cookie missing `Secure` is **rejected outright** by the browser, not
accepted with a weaker guarantee.

Verified empirically against the installed Chromium through Playwright, each
variant in a clean browser context:

| Variant over `http://localhost` | Result |
|---|---|
| `__Host-` with `Secure`, `Path=/`, no `Domain` | **ACCEPTED**, and transmitted back |
| `__Host-` without `Secure` | **REJECTED** — no cookie stored |
| `__Host-` with `Secure` but missing `Path=/` | **REJECTED** — no cookie stored |

The fix: **`Secure` is always set, in every environment** — no conditional at
all. Browsers treat `http://localhost` and `http://127.0.0.1` as potentially-
trustworthy origins, so a `Secure` cookie works locally. One code path, one
set of attributes, and a Stage 4 test asserting `__Host-` + `Secure` +
`HttpOnly` + `SameSite=Lax` + `Path=/` + no `Domain`.

### ADR-12 — Argon2id via Node's built-in `crypto.argon2`

The unit brief names Argon2id but not how to obtain it, and **no work factor
is specified anywhere in the repository**. Stage 2 had probed the runtime;
Stage 3 recorded the decision and its cost.

**The probe results stand.** Node 24.19.0 (Krypton LTS) has
`crypto.argon2Sync`; it produces a 32-byte tag, is deterministic for the same
nonce and parameters, and differs on a wrong password. Node's parameter names
differ from the common libraries — `nonce` not `salt`, `memory` not
`memoryCost`, `iterations` not `timeCost`, plus a required `passes`.

**The measured cost:**

| Parameters | Cost per hash |
|---|---|
| 19 MiB / 2 iters / p=1 | ≈ 14 ms |
| **64 MiB / 3 iters / p=1** | **≈ 81 ms** |
| 64 MiB / 3 iters / p=4 | ≈ 68 ms |
| 128 MiB / 3 iters / p=1 | ≈ 151 ms |

**Chosen:** `memory=65536, iterations=3, parallelism=1` — the OWASP second
option, measured well inside the PRD's 1 s write NFR. `parallelism=1` over
`4` despite the 13 ms: a 4-lane hash needs roughly 4× the memory per
concurrent request, and on a serverless runtime memory is the scarcer
resource.

**The work factors are configuration, and they are embedded in the stored
hash.** That combination is what makes the hashing genuinely adaptive:
raising the factors is a config change with no migration, and verification
reads the parameters from the hash rather than from the current config, so old
and new hashes coexist safely.

**The cost is a hard environment constraint.** `crypto.argon2` requires Node
≥ 24, so `package.json`'s `engines.node` rises from `>=20` to `>=24` and
**the Vercel project runtime must be set to Node 24**. On Node 22 the
function is `undefined` and every password hash fails — loudly, not silently.
The fallback, if the runtime cannot move, is `@node-rs/argon2` (a native
build on every deploy) or `crypto.scrypt` (built in, but not Argon2id, and
the brief names Argon2id).

### ADR-13 — the module is `accounts/`, not `identity/`

**This reversed a Stage 2 decision.** The design had named the module
`identity/`, reasoning that the unit's concern is identity, not just the
`Account` row.

Two standards name `accounts/`: `system-architecture.md` § Module map
("Account lifecycle, session, password reset") and `coding-standards.md` §
File and folder organization. **Three prior bolts conform exactly** — bolt
`001-audit-core` cites the map as its explicit rationale. And ADR-9 resolved
a genuine overlap in that map (FR-48) **without renaming a module**, so the
map's structure survived contact with a real conflict.

The scope argument does not survive the map's own description: the map
already calls `accounts/` "Account lifecycle, **session**, password reset" —
the same three outputs the design cited. `ActorContext` is a projection
derived from an `Account` and a `Session`, not a separate bounded context.

**The `identity/` naming is withdrawn.** `ddd-02-technical-design.md` was
revised throughout — every path, the layer-structure tree, and the
architecture table. The **unit** is `001-identity-and-access`; the **module**
is `accounts/`. Different things, allowed to differ, as the project already
does elsewhere.

### ADR-14 — the FR-27 email belongs to the `accounts` module

A genuine conflict between two authored artifacts: the unit brief places
FR-27 in unit 001 ("approval is an account-lifecycle action"), while the
module map assigns FR-27..FR-30 to `notifications/`.

The resolution reads them as answering different questions — the brief answers
*which action triggers an email*, the map answers *where email content and
transport live*. The rule is now stated generally: **an email's owner is the
module that owns its trigger.** FR-27 is the only one of the eight workflow
emails triggered by an account lifecycle transition, so `accounts/` owns it
end to end: the trigger, the content, and the transport. The other seven
(FR-28, FR-29, FR-46 events 4–8) and the FR-51 reset message keep their
triggers in the Claim, Recovery Response, and report workflows, so
`notifications/` owns them.

**The transport is a shared port**, `application/ports/email-sender.ts`, not
a module-to-module call — `coding-standards.md`'s dependency rule forbids
`accounts → notifications`, and a port owned by one module and consumed by
another is a dependency in the wrong direction.

**No outbox table.** The PRD asks that a send failure not block the action,
not for delivery guarantees; an outbox would decouple the trigger from the
decision that FR-1's "only approval sends one" rule depends on.

**Follow-up owed by the owner:** the module map still names FR-27 under
`notifications/` and must be corrected.

### ADR-15 — rate limiting is a database-backed fixed-window counter

The unit brief's Integration Points row names "Vercel rate limiting". The
PRD requires the **behaviour** and names no vendor; the brief cites PRD §10
as its authority. Two constraints decide it:

- **The $0 ceiling is hard.** A hosted limiter is a paid add-on, and a
  requirement enforced only for paying customers is not the requirement.
- **An in-memory counter would not limit anything.** Vercel's Fluid Compute
  is horizontally scaled and ephemeral — a per-instance counter resets on
  every cold start and does not count across instances. It would provide no
  meaningful limit while appearing to.

The decision is a `rate_limit_counters` table with
`UNIQUE (bucket_key, window_start)` and a single
`INSERT … ON CONFLICT DO UPDATE … RETURNING count` statement, so the
increment and the decision are **atomic** and concurrent requests cannot
collectively exceed the limit.

**Two buckets on login, one on registration.** IP-only lets one attacker lock
out a campus behind a NAT; email-only turns the throttle into an
account-existence oracle. Together they close both. The email bucket's
refusal returns the same `GenericInactiveMessage` as every other refusal, so
the throttle discloses nothing. Registration is IP-only, because an
email-keyed bucket would add a second existence channel ahead of FR-1's
required 409.

The limiter runs **before** the use case — ADR-8's rule, and it avoids paying
the ~81 ms Argon2id cost for a request that will be refused.

**Follow-up owed by the owner:** the unit brief's Integration Points row must
be corrected.

### ADR-16 — session activity refreshes at most once per hour

FR-4 says "Sessions expire after 14 days of inactivity"; PRD A2 states the
mechanism is an Architecture decision. Honouring 14 days exactly needs a
database write on **every** authenticated request — the largest avoidable
write load in the identity module, on a free-tier pooled PostgreSQL, where a
single server-rendered user action produces several authenticated requests.

The timestamp is refreshed **only when the stored `last_activity_at` is more
than an hour old**, so the write volume falls from per-request to per-hour.

**The consequence is stated rather than hidden: the effective idle window is
13–14 days, not exactly 14.** The stored timestamp can lag by up to an hour,
so the approximation is always on the **safe** side — a session is never
revoked early. One hour is short enough that the error is 0.3% of the window
and long enough to collapse each burst into one write.

**The approximation touches only the housekeeping timer.** Every explicit
security action — logout, deactivation, password-reset revocation — is an
exact, immediate write with no threshold.

**Expiry is enforced on read** against the stored `expires_at`, so
correctness does not depend on a cron that drifts ±59 minutes. The daily
sweep removes expired sessions (30-day grace period) for **storage only**,
is idempotent, and never touches a live session. A failed refresh must not
fail the request: the timestamp is bookkeeping, and a failed write there must
not log a member out.

### The stage's checkpoint

Stage 3 is an **artifact-only** step. Nothing was run, and no test or build
was executed for it — the two probes described in Stage 2 were capability
checks against the Node runtime and the npm registry, and the cookie probe
was a browser behaviour check, not a project check.

**The Stage 2 design was revised** to conform to the ADRs: the module name
(`ADR-13`), the layer-structure tree and the shared-port locations
(`ADR-14`, `ADR-15`), the email-ownership passage, the data-persistence
table, the external-dependencies table, the open items, and the decision
table (now 25 decisions, cross-referenced to ADR-12 … ADR-16). The Stage 1
domain model was aligned where ADR-13, ADR-14, and ADR-16 changed a
statement in it.

**Three items are open before Stage 4 can complete:**

1. **The Vercel project runtime must be set to Node 24** (ADR-12). This is a
   project setting, not a repository change, and it cannot be made from here.
   On Node 22, every password hash fails.
2. **`system-architecture.md` § Module map** still assigns FR-27 to
   `notifications/` (ADR-14) — the owner's call.
3. **The unit brief's Integration Points row** still names "Vercel rate
   limiting" (ADR-15) — the owner's call.

The **bolt is paused at the Stage 3 checkpoint**, pending owner review. Stage
4 (Implement) is next.

---

## Bolt `004-identity-core` — Stage 4 (Implement)

**Artifact:** source
**Completed:** 2026-10-27T18:30:00Z

### What was built

**The schema.** Four models — `Account`, `Session`, `PasswordResetToken`,
and `RateLimitCounter` — added in one migration,
`20261027140000_identity_tables`. The functional unique index
`idx_accounts_email_unique` on `lower(btrim("email"))` makes one
normalization rule satisfy three story edge cases at once, and the
database is the final arbiter against a concurrent-registration race. Nine
CHECK constraints pin the vocabulary; the foreign keys use
`ON DELETE RESTRICT`, because accounts are never deleted.

**The layers.** `domain/accounts/` is pure — entities, value objects, and
typed errors with no I/O. `application/accounts/` holds the use cases and
the module's own ports. `application/ports/` holds the three **shared**
ports (`EmailSender`, `RateLimiter`, `CSRFTokenValidator`) that ADR-14 and
ADR-15 placed there. `infrastructure/accounts/` holds the adapters, and
`identity-stack.ts` is the single composition root — the one place that
knows both sides.

**The six routes.** `/api/auth/register`, `/api/auth/login`,
`/api/auth/logout`, `/api/session`, `/api/admin/registrations`, and
`/api/admin/registrations/[id]`. They are thin: parse, call, map. The
business rules live in the use cases.

**The audit catalog's third non-numbered record.** `registration.submitted`
names `displayName`, `email`, and `selfDeclaredRole`, and the deny-by-default
sanitizer permits exactly those three. `prd-parity.test.ts` was updated from
two non-numbered types to three, as Stage 2 required.

### Three real defects, found and fixed

**The defects were all in code this bolt wrote, and two of them were
security defects.** They are recorded here because the process that found
them — testing against a real TLS server rather than a mock — is the part
worth keeping.

**1. Node's `Argon2Parameters` has no `iterations` field.** The iteration
count is `passes`, and an `iterations` key is **accepted silently and
ignored**. The Stage 2 probe had passed `iterations: 3, passes: 1`, so it
measured a **1-pass** hash labelled 3-pass — and the design recorded a cost
that was a third of the real one. Re-measured correctly: 19 MiB / 2 passes
≈ 33 ms; **64 MiB / 3 passes ≈ 160 ms**; 128 MiB / 3 ≈ 331 ms; 64 MiB / 3
p=4 ≈ 91 ms. The chosen factors stand, and `parallelism = 1` stands — a
4-lane hash costs 4× the memory for 69 ms. ADR-12 and the design were
corrected in place, and the `passes=1` row was **kept** so the correction is
legible rather than silently overwritten.

**2. The SMTP sender issued `STARTTLS` but never upgraded the socket.** The
original implementation sent `STARTTLS`, read the `220`, and then carried
on writing to the **plaintext** socket. The credentials and the message
body would have gone out in the clear. The fix replaces the plaintext
socket with a TLS one over the same stream — Node's documented
`tls.connect({ socket })` upgrade — and the conversation after the upgrade
runs on the encrypted socket.

**3. The SMTP line reader lost every line that arrived between two
responses.** The reader attached a `data` listener, awaited one response,
and detached the listener. The socket is in **flowing mode**, so a chunk
that arrives with no listener attached is discarded outright — and the bytes
already read into the departing listener's buffer go with it. This was
confirmed empirically: a server that writes three lines at once loses two
of them. The reader is now attached for the whole conversation and buffers
what arrives early.

### The transport is now tested against a real TLS server

The test server generates a self-signed certificate with `openssl`, speaks
`STARTTLS`, and **records the conversation in two places** — the lines it
received before the upgrade and the lines it received after it. That is the
only way to prove the property that matters: the message body arrived over
the encrypted channel, and the plaintext channel never saw a line of it.
The tests also cover the base64 credentials arriving on the secure channel
only, a server that refuses `STARTTLS`, a server that refuses the message
at `MAIL FROM` and at `DATA`, and a relay whose certificate does not match
the host — which is refused rather than trusted, because an encrypted
connection to *whoever answered* is not the same thing as an encrypted
connection to the configured relay.

### The verification

`npm run verify` passes end to end: typecheck, lint, **514/514 tests across
43 files**, Prettier, and the production build with all six identity routes
registered. `npm run smoke:lost-side` passes **8/8** against the live
database. Coverage is **88.78%** overall — `domain/accounts` 92.1%,
`application/accounts` 84.04%, `infrastructure/accounts` 79.29%.

### One deployment prerequisite remains open

**The Vercel project runtime must be set to Node 24** (ADR-12). This is a
project setting and cannot be made from the repository. On Node 22,
`crypto.argon2Sync` is `undefined` and every password hash fails — loudly,
not silently.

### The stage's checkpoint

Stage 4 is complete and verified. **The bolt is paused at the Stage 4
checkpoint**, pending owner review. Stage 5 (Test) is next, and it will
need to assert the effective session window (13–14 days, ADR-16) and the
acceptance criteria of the six stories.

---

Bolt `004-identity-core` — Stage 5 (Test)

**Artifact:** `memory-bank/bolts/004-identity-core/ddd-03-test-report.md`

Stage 5 wrote the acceptance, security, and performance suites and drove the
**real route handlers** against the live database, with `next/headers` mocked
so each test decides who is calling.

**604/604 tests pass across 47 files.** Coverage is **92.16% lines** /
88.25% branches / 96.35% functions, up from 88.78% at Stage 4. Typecheck,
lint, and the production build pass with all six identity routes registered.
`npm run smoke:identity` passes **12/12** against the live database, and the
six routes were exercised by hand with `curl` against the running dev server
— the CP-3 check.

Two more High-severity defects, both in the Stage 4 code

**The login throttle was an account-existence oracle.**
`src/app/api/auth/login/route.ts` answered a throttled attempt with **429
"Too many attempts"**. A distinct throttle response tells a caller that the
address it tried is a real account with traffic against it — precisely the
oracle ADR-15 and FR-4 forbid. The refusal is now the **generic inactive
message with a 401**, plus a retained `Retry-After` header: the header
discloses nothing, and a throttled client still needs to know when to back
off. The two buckets' limits were also split to match ADR-15 — **IP 20**,
**email 10** — from one shared limit of 10.

**A `Rejected` account's session stayed live after rejection.**
`src/application/accounts/session-service.ts` built the actor context
without consulting `canAuthenticate()`, so an account rejected behind an
existing session's back continued to resolve to a live actor. `resolve()`
now returns `null` for an account that does not authenticate.

Neither defect was caught by the Stage 4 unit tests. Both were caught by
writing the acceptance criteria as executable statements — the same pattern
as bolt 003.

The stage found a gap in its own coverage, and closed it

Story 003's `Rejected` and `Deactivated` criteria had **no test at the route
boundary**. The domain suite asserted `canAuthenticate` for both statuses,
and the use-case suite asserted the generic message — but the route a member
actually calls was never driven with either status, so a route that mapped
them to a different status code or a different body would have passed every
test that existed. Two tests were added to
`src/infrastructure/accounts/identity-acceptance.test.ts`, each asserting the
**generic message byte for byte**, the **401**, and **no session row**. The
acceptance suite is now **47** tests.

One specification conflict, recorded not resolved

**Story `003` criterion 2** says a `Pending` account's login returns the
generic inactive message with no session. **PRD FR-4** says "Pending —
authentication succeeds but lands on a confirmation banner"; **FR-2** says a
`Pending` user can authenticate; and `EXPERIENCE.md` §16.3 defines a
`/pending` route. The implementation follows the **PRD** — `Pending`
authenticates, gets a session, and carries `capability: 'none'` — which is
consistent with this bolt's own Stage 1 model and ADR-16. **The story file
was not amended**; that is the owner's call.

The stage's checkpoint

Stage 5 is complete and verified. **The bolt is paused at the Stage 5
checkpoint**, pending owner review. Stage 5 is the last stage of this bolt,
so the next work is **bolt `005-identity-security`** — and the four
administrator decisions recorded in the test report's open items should be
settled before it starts.

---

Bolt `005-identity-security` — Stage 1 (Domain Model)

Started 2026-10-28. The stage list was corrected from 4 to 5 stages to match
the authoritative DDD bolt type, as with bolts `001`–`004`.

The model **extends** bolt `004`'s `accounts/` module rather than creating a
second one. It fills the `PasswordResetToken` seam bolt `004` left open on
purpose, adds two decision methods to the existing `Account` aggregate
(`deactivate()` and `updateProfile()`), and introduces the closed two-field
`ProfileChange` edit surface, the `NeutralResetConfirmation` value, and the
reset-token value objects.

Three conflicts and two open items are raised for the owner:

1. **No conflict** on story `004` criterion 5 — the generic inactive message
   for a `Deactivated` login reuses bolt `004`'s existing
   `GenericInactiveMessage`, so `Rejected` and `Deactivated` share one message
   by construction.
2. **Conflict — deactivating an administrator.** Story `004`'s edge case says
   it is "Refused by policy"; the PRD does not say so anywhere. The model
   **does not refuse it**, because a refusal creates a trap and the PRD has no
   self-preservation rule. **The owner's call.**
3. **Conflict — the reset email's copy is not frozen.** `EXPERIENCE.md` §9.3a
   defines the confirmation screen and classifies the email, but defines no
   body or subject for the reset email itself.
4. **Open item — the reset token's lifetime** and the reset email's wording
   need owner input.
5. **Open item — the "first use wins" rule** under concurrent resets. The
   mechanism is a conditional `markUsed` write and a unique index, not a
   read-then-write.

Two properties Stage 2 must make concrete: the reset request's **timing**
must not vary with account existence (a fixed work floor, a constant delay,
and a **measured** tolerance), and the email-scoped rate-limit bucket's key
must be a **keyed hash** of the normalized address, never the address itself.

The reset flow writes **no audit record** — FR-51 names no event for it, the
request is anonymous, and a record holding the address would disclose
existence.

**One real defect was found in bolt `004`'s code** while reading the aggregate
this bolt extends: `rejectAccount()` sets `deactivatedAt: at`, so a
**rejected** account carries a deactivation timestamp it never earned. No
behaviour is wrong today — nothing reads the column for a decision — but this
bolt is the one that gives the column its meaning, so the defect is **latent
and about to become reachable**. The fix is one line and belongs to Stage 4.

**Fixed immediately after the Stage 1 checkpoint.** `rejectAccount()` no
longer takes a timestamp and no longer touches `deactivatedAt`; the call site
in `review-registration.ts` and the seven test call sites were updated, and a
test now locks the behaviour. **Verified:** typecheck exit 0, lint exit 0,
full suite **605/605 across 47 files**. The `Account` table was empty, so no
data migration was needed.

The bolt is **paused at the Stage 1 checkpoint**, pending owner review.

---

Bolt `004-identity-core` — closed

The Stage 5 checkpoint was **approved by the owner** and bolt
`004-identity-core` is **closed** at 2026-10-28T14:45:00Z. All five stages
are complete, all seven success criteria are ticked, and all six of the
bolt's stories are `implemented`.

**Verification was re-run at close time** against the working tree as it
stands, rather than trusting the report's figures:

- **Typecheck** — exit 0
- **Lint** — exit 0
- **Test** — **605/605 across 47 files**, all passing
- **Build** — exit 0, registering all six identity routes: `/api/auth/register`,
  `/api/auth/login`, `/api/auth/logout`, `/api/admin/registrations`,
  `/api/admin/registrations/[id]`, `/api/session`

**The suite is 605 rather than the report's 604** because of the
`rejectAccount()` defect fixed during bolt `005`'s Stage 1 — the one new
test that locks it is the difference. The fix landed **before** this bolt
closed, so the closed bolt contains no known defect.

**Three items are carried forward** from bolt `004`, none of which blocks
it:

1. **Open item 1** — the story 003 criterion 2 / PRD FR-4 conflict. The
   implementation follows the PRD; the story file has not been amended, and
   that remains the owner's call.
2. **Open item 3** — ADR-16's deferred-failure refresh branch is untested.
   It belongs to bolt `005`, which owns the session sweep.
3. **The Vercel runtime must be set to Node 24** (ADR-12). On Node 22,
   `crypto.argon2Sync` is `undefined` and every password hash fails. This is
   a project setting and cannot be made from the repository.

**Two owner follow-ups are still owed** and are recorded in their ADRs:
`system-architecture.md`'s module map still assigns FR-27 to `notifications/`
(ADR-14 gives it to `accounts/`), and the unit brief's Integration Points row
still names "Vercel rate limiting" (ADR-15 gives it a database-backed
counter).

**Next work** is bolt `005-identity-security`, which is at its **Stage 1
checkpoint** with two conflicts and two open items raised for the owner.
It depends on `004-identity-core`, which is now complete.

---

Bolt `005-identity-security` — Stage 1 checkpoint closed, advanced to Stage 2

The owner resolved all three items Stage 1 raised, and the resolutions are
recorded in `ddd-01-domain-model.md` beside the conflicts they settle. The
Stage 1 checkpoint is closed and the bolt has advanced to **Stage 2
(Technical Design)**.

1. **Conflict 2 — deactivating an administrator. The PRD reading is
   confirmed.** Any administrator may deactivate any `Active` account,
   **including another administrator**; the target's own administrator flag
   confers no protection, and it is cleared on deactivation so no stale
   privilege remains. **Story `004`'s edge case has been amended** to match
   FR-5, and the amendment carries its reasoning — the refusal reading would
   have trapped the last remaining administrator, since the PRD states no
   escalation path and the PRD's own rule allows another administrator to take
   over at any time.
2. **Open item 1 — the reset token's lifetime is 1 hour**, exposed as
   configuration with that value as the default (`RESET_TOKEN_TTL_SECONDS`,
   default `3600`). A malformed value falls back to the default rather than
   failing the request, matching ADR-15's rate-limit convention. The lifetime
   is **product-visible**, so the email renders the *configured* value rather
   than a constant. Stage 3 records the choice as an ADR, because it is a
   genuine trade-off: a short lifetime limits the window a stolen link is
   usable in but is harsh on a member who does not check email promptly.
3. **Conflict 3 — the reset email's copy is raised as a UX edit** for the
   owner's approval rather than drafted in this bolt. The email's **structure**
   is specified and assembled from **named parts** (subject, greeting,
   single-use link, lifetime statement, sign-off), so the eventual copy is a
   single visible edit in one place. This is the same pattern bolt `004` used
   for the FR-27 approval email.

**Open item 2 is not an owner decision** — the "first use wins" rule under
concurrent resets is settled by the model and the mechanism is the database:
a conditional `markUsed` write plus a unique index on `tokenHash`. Stage 4
must implement the conditional write, not a read-then-write, or the replay
protection is a race.

---

Bolt `005-identity-security` — Stage 2 (Technical Design) complete

The artifact is `memory-bank/bolts/005-identity-security/ddd-02-technical-design.md`.
**This step is documentation only — no source code was written or changed, so
there was nothing to run.** Per the construction protocol, an artifact-only
step has no check to report, and none is claimed.

The design is built to the three owner decisions Stage 1 raised, which are now
constraints rather than questions.

1. **The schema delta for the entire bolt is one index.** The
   `PasswordResetToken` table and its unique index on `tokenHash`, the
   `accounts.deactivated_at` and `accounts.is_administrator` columns, and the
   `sessions.revocation_reason` column all already exist — bolt `004` added
   the table expressly to leave this bolt a seam. The only migration is a
   composite index for the daily token sweep.
2. **The "first use wins" rule is enforced by the database.** The conditional
   write `UPDATE … WHERE used_at IS NULL AND expires_at > now()` *is* the
   check — one atomic statement with no read-then-write window. Its three
   refusals (unknown, used, expired) collapse into one internal reason and one
   response body, so a caller cannot probe the token space.
3. **The timing equalisation has a measured tolerance.** An unconditional dummy
   Argon2id verification on every path (the `DUMMY_HASH` pattern bolt `004`'s
   login already uses) plus a constant 250 ms floor
   (`AUTH_RESET_MIN_RESPONSE_MS`), asserted against a 100 ms tolerance
   (`AUTH_RESET_TIMING_TOLERANCE_MS`). Both are configuration. The floor also
   applies to the **rate-limited** path — a deliberate addition beyond ADR-15's
   login precedent, because the reset path's accepted (202) and refused (429)
   responses differ in body and so must not differ in timing either.
4. **Two keyed digests with two separate secrets.** The reset token's digest
   uses `AUTH_RESET_TOKEN_HASH_SECRET`; the rate-limit bucket's email key uses
   `AUTH_RESET_BUCKET_HASH_SECRET`. The second **must** be keyed — an unsalted
   digest of an email address is trivially reversible by dictionary attack, and
   the counter table would become a list of "which addresses were reset", which
   is the enumeration FR-51 forbids one layer down. Neither is derived from
   `SESSION_SECRET`, and a missing one fails loudly at startup rather than
   falling back to an unkeyed digest.
5. **The reset email's structure is designed; its wording is pending UX.** The
   email is assembled from named parts and the wording is marked
   `PENDING UX EDIT`. The lifetime statement renders the **configured** value,
   not a constant. The specific `EXPERIENCE.md` edit being requested is
   specified in full in the design.
6. **The profile edit surface is structural.** `ProfileChange` carries exactly
   two optional fields, so no code path can deliver an email, a status, or an
   administrator flag to the aggregate. FR-52's four forbidden edits are
   refused by the shape of the type rather than by validation rules.

Two additions beyond the model, each for a stated reason: the rate-limited
reset request also pays the timing floor, and the reset route redacts the
`token` query parameter from request logs.

**No open questions block implementation.** The one item raised is the UX edit
for the reset email's copy, which does not block Stage 4 — it is exactly how
bolt `004` shipped the FR-27 email's structure while its copy was settled —
but it should be approved before the email reaches a real member.

**Stage 3 (ADR Analysis) is next** and is optional. The design nominates three
candidates for the owner: the 1-hour token lifetime, the timing-equalisation
mechanism, and the keyed rate-limit bucket key.

---

Bolt `005-identity-security` — Stage 3 (ADR Analysis) complete

Three ADRs were created and the decision index was updated to
`total_decisions: 19`. **This step is documentation only — no source code was
written or changed, so there was nothing to run.** Per the construction
protocol, an artifact-only step has no check to report, and none is claimed.

The Stage 2 design nominated three ADR candidates, and the owner selected all
three.

**ADR-17 — `adr-17-reset-token-lifetime.md`.** The reset token's lifetime is
1 hour, exposed as `AUTH_RESET_TOKEN_TTL_SECONDS` with that value as the
default. The value was already the owner's decision; the ADR records the
*reasoning* so a future change is deliberate rather than accidental. It
records the trade-off on both sides — a short lifetime limits a captured link
but expires for a member who steps away, and a long one is comfortable but
keeps a captured link live for a day — the **fallback convention** (a
malformed value falls back to the default rather than failing the request),
and the rule that **the email renders the configured value**, so the number in
the message is always the number the server enforces.

**ADR-18 — `adr-18-reset-timing-equalisation.md`.** This is the ADR that
makes FR-51's *timing* half of anti-enumeration a **measured** property
rather than a wish. Two mechanisms, both on every path: the **unconditional
dummy Argon2id verification** — reusing bolt `004`'s existing `DUMMY_HASH`
pattern rather than inventing a second one — and a **constant 250 ms floor**,
asserted against a **100 ms tolerance**. The ADR records the rejected
alternatives (a constant-time comparison against a stored hash, a delay
alone, a queue, and a delay derived from account existence) and why each
fails. It also records the **deliberate departure from ADR-15's login
precedent**: the floor applies to the **rate-limited** path too, because the
reset path's accepted (202) and refused (429) bodies differ, so their timing
must not differ either.

**ADR-19 — `adr-19-keyed-rate-limit-bucket-key.md`.** The one place this
design departs from bolt `004`'s precedent, recorded so the difference reads
as deliberate rather than as an inconsistency. The reasoning is the part worth
keeping: the counter table is reachable by anyone with database read access,
and a plaintext key there is a list of "which addresses were reset" — the
enumeration FR-51 forbids, one layer down. The ADR records that an
**unsalted SHA-256 is forbidden** (the email address space is small and well
known, so it is trivially reversible by dictionary attack — it looks
protective and is not), that a **missing secret fails loudly at startup**
rather than falling back to an unkeyed digest, and that the secret is
**separate** from `SESSION_SECRET` and from the reset token's own hashing
secret, so the two rotate independently and rotating the bucket key does not
invalidate outstanding reset tokens.

**The decision index now records 19 decisions**, and each new entry carries a
**"Read when"** line so a future agent finds the relevant ADR by the scenario
it governs rather than by scanning every file.

**Stage 4 (Implement) is next.** The bolt's `current_stage` is `implement`.

---

Bolt `005-identity-security` — Stage 4 (Implement)

Started 2026-10-28. The bolt's four stories are implemented across the domain,
application, and infrastructure layers, with four new route handlers.

**Verified** — typecheck exit 0, lint exit 0, the full suite **790/790 across
54 files** (605 before, plus 185 new), the production build **succeeds** with
all four new routes registered, and a **live `npm run dev` smoke test**
exercised every new endpoint against the running server.

**The "first use wins" rule is a conditional write, as the design required.**
`PrismaPasswordResetTokenRepository.markUsed()` issues one statement —
`UPDATE … SET "usedAt" = $now WHERE "id" = $id AND "usedAt" IS NULL AND
"expiresAt" > $now RETURNING "id"` — so the write *is* the check. There is no
read-then-write window for two concurrent resets to both win.

**FR-51's three halves were proven live, not merely unit-tested.** The
`forgot-password` route returned byte-for-byte identical bodies for a
registered and an unregistered address, with timings of 0.27s/0.27s and
0.28s/0.26s against ADR-18's 250 ms floor and 100 ms tolerance. The
`reset:email:` counter rows held 64-hex **keyed digests**, never an address.
The dev log contained zero occurrences of the password, the password's hash,
or any email address.

**FR-52 is structurally enforced.** `ProfileChange` carries exactly two
optional fields, so a forbidden edit is unreachable by the *shape of the
type*, not by a runtime check that could be forgotten. A live request carrying
`email`, `status`, and `isAdministrator` changed only the display name; the
row kept its email, its `Active` status, and `isAdministrator = false`.

**Two production seams were added** to `buildIdentityStack()` — the reset
token's generator and the email sender — because the token's plaintext exists
only in the email, so a test that must complete a reset has to know it. **The
two reset secrets are required and a missing one fails at startup** rather
than falling back to an unkeyed digest (ADR-19). Local-development values were
added to the gitignored `.env.local`; the committed `.env.example` keeps only
commented placeholders.

**The reset flow writes no audit record.** FR-51 names no event for it, the
request is anonymous, and a record holding the address would disclose
existence.

**Deactivation is atomic and idempotent.** A live run returned 200, was
idempotent on the second call with the same body, cleared the administrator
flag, revoked both sessions with the `account_deactivated` reason, and
produced **exactly one** audit row. The deactivated account was then fully
locked out: login 401, the old session returned `{"actor":null}`, and the
profile route 401.

**Two items are carried forward** for the owner, neither blocking the stage:

1. **The `login:email:` rate-limit bucket still holds a plaintext address.**
   This is bolt `004`'s existing behaviour, not a regression, but it is exactly
   what ADR-19 forbids on the reset path — the same reasoning applies, and the
   reset path should not be the only one that got it right.
2. **The reset email's subject and body are still marked `[PENDING UX EDIT]`.**
   `EXPERIENCE.md` §9.3a defines the confirmation screen and classifies the
   email but defines no copy for it. The copy in place satisfies the
   behavioural tests, but it is not the owner's.

**Stage 5 (Test) is next** — `ddd-03-test-report.md`.

---

Bolt `005-identity-security` — Stage 5 (Test)

Started 2026-10-28. The bolt's five stages are complete. The artifact is
`memory-bank/bolts/005-identity-security/ddd-03-test-report.md`.

**Verified** — typecheck exit 0, lint exit 0, the full suite **815/815 across
56 files**, coverage **93.72% lines** / 90.20% branches / 97.26% functions,
the production build **succeeds** with `ƒ Proxy (Middleware)` registered and
`/reset-password` served as a dynamic route, and a **live `npm run dev` smoke
test** measured the reset link's shape against the running server.

**The stage found a High-severity defect in the Stage 2 design — and it found
it by measurement, not by reading.** The design required the route to "redact
the `token` query parameter from request logs". Two live requests established
that **no application code can do this**:

1. A request to `/reset-password?token=…` was observed in the server's
   request log carrying the **full token**.
2. A proxy that rewrote the request's URL — stripping the query entirely —
   did **not** remove the token from the log.

The reason is structural: **the access log records the original request URL —
the one on the wire — and it is written before any application code runs.** No
proxy, no rewrite, and no route handler can change what is already written.
Next.js's own dev logger shows the same rule — it prints `request.url`, the
original, from `node_modules/next/dist/server/dev/log-requests.js:62`.

**The fix is that the token now travels in the URL's fragment.** A fragment
is never sent to the server, so it never enters the request line and
therefore never reaches an access log. The page's own JavaScript reads the
fragment in the browser and **posts the token in the request body**, which is
also not in the request line. Measured live: **0** occurrences of the token
in the request log, **0** in the served HTML.

**This reverses the design's own reasoning, and the reversal is the point.**
The design had rejected the fragment because *"a fragment is never sent to the
server, so the server could not read it to look up the token."* That was
correct about the fragment and wrong about the consequence: **the server does
not need to read the token from the fragment.** The page reads it and posts it.
The design's other constraint — *"the reset form must not be a GET"* —
pointed at exactly this solution, and the reasoning stopped one step short.

**`ddd-02-technical-design.md` was corrected** — the link's shape, the
Stage 4 checklist's obligation 5, and the three traceability rows that cited
it now describe the fragment, the measurement that forced the change, and the
proxy's bounded role.

**The proxy remains, as a second line of defence** for a legacy or
hand-built `?token=…` link. It moves the token into a request header and
serves the request from a redacted URL, so the token never reaches the route
handler or the page's markup. **It cannot un-write the access-log line**, and
`src/proxy.ts`'s own documentation now says so plainly rather than
overclaiming. Next 16 also renamed the file convention from `middleware` to
`proxy`, and the file was renamed to match — verified against Next's own
source (`PROXY_FILENAME = 'proxy'` in `server/constants.js`), not taken from
the deprecation warning alone.

**Two more gaps were closed.**

1. The **rate-limited** reset path's timing floor was implemented but **not
   asserted**. ADR-18 requires the floor on every path, because the accepted
   response (202) and the refused one (429) differ in body, so their timing
   must not differ either. The test now exhausts the email bucket, asserts
   the 429, and measures the elapsed time within `[250, 350]` ms.
2. The reset flow's **zero-audit-record** property was structurally true but
   **unasserted** — a future developer adding an audit call would have broken
   FR-51 with the suite still green. The test now counts the audit rows
   before and after a full request-and-completion flow and asserts equality.

**The ten Stage 4 obligations were audited against the real code.** Nine hold
as written; the tenth was the impossible redaction mechanism, now corrected.
One **wording deviation** was found and recorded: the design names
`Account.deactivate()` and `Account.updateProfile()` as **methods**, while the
implementation exposes free functions `deactivateAccount` and
`updateAccountProfile` — matching bolt `004`'s convention. The behaviour is
identical.

**Every acceptance criterion is met** across all four stories, with a named
test in the 50-test acceptance suite, which drives the **real route
handlers** against the live database. The FR-52 criteria are asserted
**structurally**: the suite sends `email`, `status`, and `isAdministrator` in
one profile request body and the row is unchanged on all three — not because
a validation rule enumerated them, but because `ProfileChange` has two
optional fields and no others.

**Two product changes were made in this stage**, both required by the
finding: the reset link's shape (query string → fragment), and the file
convention rename (`middleware` → `proxy`). The client's fragment reader is a
**client component** using `useSyncExternalStore`, because the URL is state
the browser owns and can change on its own.

**Five items remain open for the owner**, none of which blocks the bolt:

1. **The `/reset-password` page is Unit 007's**, and it must now be built
   against the **fragment** contract. The page in this bolt is a placeholder
   that proves the fragment is readable in the browser.
2. **The reset email's copy is still `[PENDING UX EDIT]`.** The structure is
   built; the wording is the owner's.
3. **The `login:email:` bucket still holds a plaintext address** — bolt `004`'s
   pre-existing behaviour, and the very thing ADR-19 forbids on the reset
   path. Not a regression, and deliberately not touched by this bolt.
4. **The Vercel runtime must be Node 24** (ADR-12) — the reset path uses the
   same Argon2id hasher as the login.
5. **The module map's FR-27 row** and the unit brief's "Vercel rate limiting"
   row are both out of date.

**Bolt `005-identity-security` is complete.** The unit's two planned bolts are
both done, and all ten of the unit's stories are implemented.

---
