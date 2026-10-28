---
id: 004-identity-core
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 001-self-registration
  - 002-administrator-review-of-registrations
  - 003-login-with-active-account
  - 005-logout-revokes-session
  - 006-pending-member-restricted-access
  - 007-owner-rejects-registration
created: 2026-10-23T13:06:30Z
started: 2026-10-27T10:15:00Z
completed: 2026-10-28T14:45:00Z
current_stage: complete
stages_completed:
  - name: model
    completed: 2026-10-27T10:15:00Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-27T11:40:00Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-27T13:30:00Z
    artifact: adr-12-node-builtin-argon2.md, adr-13-module-name-accounts.md, adr-14-fr27-email-ownership.md, adr-15-database-rate-limiter.md, adr-16-session-activity-refresh.md
  - name: implement
    completed: 2026-10-27T18:30:00Z
    artifact: source
  - name: test
    completed: 2026-10-27T21:40:00Z
    artifact: ddd-03-test-report.md

requires_bolts:
  - 001-audit-core
enables_bolts:
  - 005-identity-security
  - 007-reporting-core
  - 012-web-public
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 004-identity-core

## Overview

The account lifecycle and the `ActorContext` every other unit consumes.

## Objective

Deliver registration, administrator review, login, logout, and the restricted
state of a `Pending` account, so that every later unit has an actor to act as.

## Stories Included

- **001-self-registration**: register into `Pending`, no email sent (Must)
- **002-administrator-review-of-registrations**: approve or reject, approval sends FR-27 email (Must)
- **003-login-with-active-account**: login, with one generic message for every inactive status (Must)
- **005-logout-revokes-session**: session row revoked, cookie cleared (Must)
- **006-pending-member-restricted-access**: a `Pending` account can do nothing except wait (Must)
- **007-owner-rejects-registration**: rejection reason audited, never shown (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: ✅ 2026-10-27 → `ddd-01-domain-model.md`
- [x] **2. design**: ✅ 2026-10-27 → `ddd-02-technical-design.md`
- [x] **3. adr**: ✅ 2026-10-27 → `adr-12-node-builtin-argon2.md`, `adr-13-module-name-accounts.md`, `adr-14-fr27-email-ownership.md`, `adr-15-database-rate-limiter.md`, `adr-16-session-activity-refresh.md`
- [x] **4. implement**: ✅ 2026-10-27 → source
- [x] **5. test**: ✅ 2026-10-27 → `ddd-03-test-report.md`

> Stage list corrected 2026-10-27 to the 5 stages defined by
> `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`,
> matching bolts `001-audit-core`, `002-audit-reads`, and `003-audit-lost-side-events`.
> The original 4-item list omitted the optional ADR Analysis stage.

> **Stage 1 raised two conflicts; the owner confirmed both at the Stage 1
> checkpoint.** Conflict 1 (FR-2 requires a registration audit record that the
> frozen FR-31 catalog has no number for) is resolved as a third **unnumbered**
> catalog type, `registration.submitted`. Conflict 2 (FR-3's minimum-5-character
> rejection reason versus the story's "rejected without a reason" edge case) is
> resolved as a route-boundary rule with a domain-level safety net. Both are
> carried into `ddd-02-technical-design.md`.

> **Stage 2 raised one item for owner confirmation** — whether to add the FR-2
> registration record to `EXPERIENCE.md` §17.7's administrator account-disclosure
> list. **The owner approved the edit and it has been made** — in six linked
> places, so the spine stays internally consistent (§17.5a is the section that
> defines the non-numbered record types and it listed only two). Stage 2 also
> flagged a **deployment prerequisite**: the Argon2id decision requires the
> Vercel runtime to be set to Node 24, and `package.json`'s `engines.node` to
> be raised from `>=20`.

> **Stage 3 (ADR Analysis) produced five ADRs; the owner selected "create all
> five."**
> - **ADR-12** — Argon2id via Node's built-in `crypto.argon2`; `engines.node`
>   raised to `>=24`; no native dependency. Work factors `memory=65536,
>   iterations=3, parallelism=1`, configured and embedded in the stored hash.
> - **ADR-13** — the module is `accounts/`, not `identity/`. Conforms to
>   `system-architecture.md` § Module map and `coding-standards.md`, and to
>   three prior bolts. **The Stage 2 design's `identity/` naming is withdrawn**;
>   `ddd-02-technical-design.md` was revised.
> - **ADR-14** — the `accounts` module owns the FR-27 email end to end; the
>   transport is a shared `EmailSender` port in `application/ports/`. The
>   `notifications` module keeps the other seven workflow emails and the FR-51
>   reset message.
> - **ADR-15** — rate limiting is a database-backed fixed-window counter behind
>   a shared `RateLimiter` port, not a Vercel product. The $0 ceiling is hard,
>   and an in-memory counter would be per-instance on serverless.
> - **ADR-16** — session activity is refreshed at most once per hour, so the
>   effective idle window is 13–14 days rather than exactly 14. Stated, tested,
>   and always on the late side; every explicit revocation stays exact.
>
> **Two follow-ups are owed by the owner**, both recorded in their ADRs:
> `system-architecture.md` § Module map still assigns FR-27 to `notifications/`
> (ADR-14), and the unit brief's Integration Points row still names "Vercel
> rate limiting" (ADR-15).
>
> **One deployment prerequisite remains open**: the Vercel project runtime must
> be set to **Node 24** (ADR-12). On Node 22, `crypto.argon2Sync` is
> `undefined` and every password hash fails.
>
> **Stage 4 (Implement) is complete.** The schema and migration, the domain,
> application, and infrastructure layers, the route handlers, and the audit
> catalog's third non-numbered record are all in place. `npm run verify`
> passes: typecheck, lint, **514/514 tests across 43 files**, and the
> production build with all six identity routes registered. Coverage is
> **88.78%** overall, above the 80% floor.
>
> **Three real defects were found and fixed during Stage 4**, all of them in
> code this bolt wrote:
>
> 1. **Node's `Argon2Parameters` has no `iterations` field** — the iteration
>    count is `passes`, and an `iterations` key is accepted silently and
>    **ignored**. The Stage 2 probe had passed `iterations: 3, passes: 1`, so
>    it measured a **1-pass** hash labelled 3-pass. Re-measured correctly:
>    64 MiB / 3 passes ≈ **160 ms**. ADR-12 and the design were corrected in
>    place, and the `passes=1` row was kept so the correction is legible.
> 2. **The SMTP sender issued `STARTTLS` but never upgraded the socket** —
>    the credentials and the message body would have gone out in plaintext.
>    The sender now replaces the plaintext socket with an encrypted one, and
>    the test server records the plaintext and the encrypted conversations
>    separately so the test proves *where* each line arrived.
> 3. **The SMTP line reader attached and detached a `data` listener per
>    response**, so every line arriving between two responses was **lost** —
>    the socket is in flowing mode, and a chunk with no listener attached is
>    discarded. The reader is now attached for the whole conversation and
>    buffers what arrives early.
>
> The second and third defects were found by **testing the transport against
> a TLS-capable fake server**, which is what the rewrite now does.
>
> **Stage 5 (Test) is complete.** The artifact is `ddd-03-test-report.md`.
> **604/604 tests pass across 47 files**; coverage is **92.16% lines**
> (88.25% branches, 96.35% functions), up from 88.78% at Stage 4. Typecheck,
> lint, and the production build all pass, the build registering all six
> identity routes. `npm run smoke:identity` passes **12/12**, and the six
> routes were exercised by hand with `curl` against the running dev server.
>
> **Two more real defects were found and fixed in product code**, both in the
> Stage 4 implementation, and both rated High:
>
> 1. **The login throttle was an account-existence oracle.**
>    `src/app/api/auth/login/route.ts` answered a throttled attempt with
>    **429 "Too many attempts"**. A distinct throttle response tells a caller
>    that the address it tried is a real account with traffic against it —
>    which is exactly the oracle ADR-15 and FR-4 forbid. The refusal is now
>    the **generic inactive message with a 401**, plus a retained
>    `Retry-After` header (the header discloses nothing, and a throttled
>    client still needs to know when to back off). The two buckets' limits
>    were also split to match ADR-15: **IP 20**, **email 10**.
> 2. **A `Rejected` account's session stayed live after rejection.**
>    `src/application/accounts/session-service.ts` built the actor context
>    without consulting `canAuthenticate()`, so an account rejected behind an
>    existing session's back continued to resolve to a live actor. `resolve()`
>    now returns `null` for an account that does not authenticate.
>
> **The stage also found a gap in its own coverage and closed it.** Story 003's
> `Rejected` and `Deactivated` criteria had **no test at the route boundary** —
> the domain suite asserted `canAuthenticate` and the use-case suite asserted
> the generic message, but the route a member actually calls was never driven
> with either status. Two tests were added to
> `src/infrastructure/accounts/identity-acceptance.test.ts`, asserting the
> generic message byte for byte, the 401, and no session row, for each. The
> acceptance suite is now **47** tests.
>
> **One specification conflict is recorded as Open item 1**, and it is not a
> code defect: story `003` criterion 2 says a `Pending` account's login
> returns the generic inactive message with no session, while **PRD FR-4**
> says "Pending — authentication succeeds but lands on a confirmation banner",
> **FR-2** says a `Pending` user can authenticate, and `EXPERIENCE.md` §16.3
> defines a `/pending` route. The implementation follows the PRD — `Pending`
> authenticates, gets a session, and carries `capability: 'none'` — which is
> consistent with this bolt's own Stage 1 model and ADR-16. **The story file
> was not amended**; that is the owner's call.
>
> **Three other open items are recorded in the report:** ADR-15's rate limits
> are now configurable (closed after the report — see below);
> ADR-16's deferred-failure refresh branch is untested (bolt `005`'s); and
> the Vercel runtime must be set to Node 24 (ADR-12), which is a project
> setting and cannot be made from the repository.
>
> **Two items were closed after the report was written.**
>
> 1. **The rate limits are now configuration, not constants.** ADR-15 said
>    "configured, not hardcoded, with the chosen values as defaults", and the
>    implementation had them as module constants. `rate-limit-config.ts` now
>    reads all six values from `AUTH_RATE_*` environment variables, with
>    ADR-15's values as the defaults and a malformed value falling back to
>    the default rather than failing the request. The routes read them from
>    `stack.rateLimits`, so there is one source of truth and no literal left
>    in a route handler. **The values are unchanged**, so the existing
>    throttle-boundary tests still pass.
> 2. **A flaky `EXPLAIN` assertion was fixed.** The pending-queue plan test
>    asserted the planner's choice on **stale statistics** — the 200 seeded
>    rows had not been vacuumed — so it passed alone and failed in the full
>    suite. It now `ANALYZE`s the table first, which is the convention the
>    audit performance suites already use.
>
> **The Stage 5 checkpoint was approved and the bolt is closed.** The owner
> confirmed the test report at 2026-10-28T14:45:00Z. **Verification was
> re-run at close time** against the working tree as it stands: typecheck
> exit 0 · lint exit 0 · **605/605 tests across 47 files** · production
> build exit 0, registering all six identity routes (`/api/auth/register`,
> `/api/auth/login`, `/api/auth/logout`, `/api/admin/registrations`,
> `/api/admin/registrations/[id]`, `/api/session`).
>
> **The suite is 605 rather than the report's 604** because of a defect
> found during bolt `005`'s Stage 1 reading of this bolt's aggregate:
> `rejectAccount()` in `src/domain/accounts/account.ts` set
> `deactivatedAt: at`, so a **rejected** account carried a deactivation
> timestamp it never earned. No behaviour was wrong at the time — nothing
> read the column for a decision — but the column was **latent and about to
> become reachable**, since bolt `005` is the bolt that gives it meaning.
> The fix was made before this bolt closed, with a test locking the
> behaviour. The `Account` table was empty, so no data migration was needed.
>
> **Three items are carried forward from this bolt, none of which blocks it.**
>
> 1. **Open item 1 — the story 003 criterion 2 / PRD FR-4 conflict.** The
>    implementation follows the PRD. The story file has **not** been
>    amended; that remains the owner's call.
> 2. **Open item 3 — ADR-16's deferred-failure refresh branch** is untested.
>    It belongs to bolt `005`, which owns the session sweep.
> 3. **The Vercel runtime must be set to Node 24** (ADR-12). On Node 22,
>    `crypto.argon2Sync` is `undefined` and every password hash fails. This
>    is a project setting and cannot be made from the repository.
>
> **Two owner follow-ups are still owed** and are recorded in their ADRs:
> `system-architecture.md`'s module map still assigns FR-27 to
> `notifications/` (ADR-14 gives it to `accounts/`), and the unit brief's
> Integration Points row still names "Vercel rate limiting" (ADR-15 gives
> it a database-backed counter).
>
> **The bolt is at the Stage 5 checkpoint**, with 604/604 tests passing across
> 47 files.

## Dependencies

### Requires
- **001-audit-core** (required): every lifecycle action writes an audit record

### Enables
- 005-identity-security
- 007-reporting-core
- 020-web-profile

## Success Criteria

- [x] Registration creates a `Pending` account and sends no email
- [x] Approval activates the account and fires FR-27; rejection does not send email
- [x] `Pending`, `Rejected`, and `Deactivated` all produce the same generic login message
- [x] A `Pending` account cannot report, claim, respond, message, or reach an admin surface
- [x] `ActorContext` carries status so downstream units do not re-derive it
- [x] Sessions are database rows, revocable server-side
- [x] The rejection reason is visible in audit and absent from every user-facing response

> **Stage 5 caveat on the third criterion.** `Pending`, `Rejected`, and
> `Deactivated` all produce the same generic login message **as each other**,
> and the message is the generic inactive message. A `Pending` account
> authenticates at all — PRD FR-4 says so — so it receives a session and
> `capability: 'none'` rather than the generic refusal. See the test report's
> Open item 1 for the conflict between PRD FR-4 and story 003 criterion 2.

## Notes

Six stories is at the upper limit of the 5–6 grouping rule. They stay together
because login is untestable without registration and approval, and because the
generic-message anti-enumeration requirement can only be verified against all
four inactive paths at once.

Deactivation is deliberately excluded and sits in the next bolt with the
security work, since its defining property is session revocation.