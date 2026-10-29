---
last_updated: 2026-10-28T21:20:00Z
total_decisions: 20
---

# Decision Index

Architecture decisions recorded during **Inception / project-init**, before any
Construction bolt exists. Construction ADRs append below these, newest first.

The entries with no `Path` are decisions locked by `standards/tech-stack.md` and
approved by the project owner on 2026-10-23. Bolt-scoped ADRs are written to
`bolts/{bolt-id}/adr-{n}-{slug}.md` as Construction proceeds.

## How to Use

**For Agents:** scan the "Read when" fields before implementing. ADR-2 in
particular constrains every read path and every image delivery. If a proposed
implementation contradicts one of these, stop and raise an ADR rather than
deviating silently.

**For humans:** ADR-1 through ADR-4 encode the $0 budget constraint and the
Vercel Hobby free-tier ceiling. Changing any of them has cost or privacy
consequences that must be re-approved by the project owner.

---

## Decisions

### ADR-1: TypeScript + Next.js App Router on Vercel Hobby
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/tech-stack.md`
- **Summary**: FindBack is a single-tenant server-rendered web application, so it runs on TypeScript with Next.js App Router, hosted on Vercel Hobby at a $0 ceiling. Server rendering satisfies the ≤ 2 s p95 initial-HTML NFR, and Vercel's docs confirm Next.js bundles dynamic code into the fewest Functions, so the 12-function Hobby limit is not binding.
- **Read when**: choosing runtime, rendering strategy, deployment target, or assessing Hobby-plan headroom.

### ADR-2: Vercel Blob private storage with server-side authorization on every read
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/image-handling.md`
- **Summary**: Report and candidate images are Sensitive Fields under FR-37/FR-39, so they are stored in a private Blob store and served only through an authenticated route handler that applies the FR-39 matrix immediately before the blob read. The store's access mode is immutable after creation, so this decision is one-way; caching a private response (`s-maxage`) or relying on middleware for authorization is forbidden.
- **Read when**: implementing any read of an image, upload path, FR-53 image replacement, FR-10 deletion, or cache headers.

### ADR-3: PostgreSQL with Prisma, pooled connections, transactional lifecycle changes
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/data-stack.md`
- **Summary**: FindBack needs real atomicity — FR-17 Claim approval and FR-45 verification completion each mutate several rows and must not partially apply — so state lives in PostgreSQL behind Prisma, with parent-row locking inside a single transaction and audit rows written in that same transaction. Pooled connections are mandatory because Vercel Functions cap file descriptors at 1,024.
- **Read when**: implementing any lifecycle transition, Claim approval, verification outcome, audit write, or data access.

### ADR-4: Free-tier quota enforcement with refusal, never silent acceptance or upgrade
- **Status**: accepted
- **Date**: 2026-10-23
- **Bolt**: n/a — project-init
- **Path**: `memory-bank/standards/tech-stack.md`, `memory-bank/standards/image-handling.md`
- **Summary**: Because the budget is a hard $0 ceiling, exceeding a verified free-tier limit must fail loudly and visibly rather than degrade silently. Uploads are refused before exceeding the Blob storage quota, warnings fire at 70% and 90%, no paid service or plan upgrade may occur without explicit owner approval, and Vercel's over-limit behavior is a project pause rather than a charge.
- **Read when**: implementing quota checks, upload rejection, monitoring, alerting, or any code path that would trigger a Vercel resource limit.

ADR-5: One construction step per turn, verified locally before the next step
- **Status**: accepted
- **Date**: 2026-10-25
- **Bolt**: n/a — owner protocol, applies to all bolts
- **Path**: `memory-bank/standards/construction-protocol.md`, `puku.md`
- **Summary**: The owner reviews and clicks through every increment of FindBack before the next one is built, so each bolt stage is completed, verified locally (lint, test, build, and a live `npm run dev` smoke test of the behaviour that step added), reported, and then held for explicit owner confirmation. Local verification runs against a Docker PostgreSQL container rather than the host cluster, which is not accessible to this user. The dev server is intentionally left running after Implement and Test steps. Vercel Blob and email paths are verified by automated test only and are always reported as not manually click-tested. The step granularity adds to, and never relaxes, the SpecsMD bolt stage checkpoints.
- **Read when**: starting any bolt, implementing any stage, running any verification, or deciding whether a step may be reported as complete.

ADR-6: Enforce append-only audit in the database, with a transaction-scoped flag for the single FR-10 deletion path
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 001-audit-core (audit-and-observability)
- **Path**: `memory-bank/bolts/001-audit-core/adr-6-fr10-audit-deletion-flag.md`
- **Summary**: FR-31 requires an append-only trail with no deletion mechanism, while FR-10 requires the trail to be removed with an interaction-free `Open` report. Append-only is enforced by a PostgreSQL `BEFORE UPDATE OR DELETE` trigger on `audit_events` (plus an insert-only repository interface and a single writer at the application layer), and the single permitted deletion is gated by a transaction-scoped `SET LOCAL findback.allow_audit_delete = 'on'` flag that only the FR-10 hard-delete path sets, after the FR-10 eligibility check passes. `SET LOCAL` is used rather than `SET` because pooled connections must carry no residue between requests. No soft-delete column, retention job, or pruning path exists.
- **Read when**: writing or reviewing any code that inserts, updates, or deletes audit rows, implementing the FR-10 hard delete, changing the audit schema or its migrations, adding a cleanup or retention job, or reviewing database-level access controls on the audit tables.

ADR-7: Record the audit-trail read in its own transaction, and treat a failed read record as a logged observability gap rather than a failed read
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 002-audit-reads (audit-and-observability)
- **Path**: `memory-bank/bolts/002-audit-reads/adr-7-audit-read-record-durability.md`
- **Summary**: PRD §10 requires a trail read to be recorded so the access pattern is reviewable, and Vercel Hobby retains runtime logs for only 1 hour, so the record goes to the `audit_read_logs` table. The record is written **after** the trail query succeeds, in **its own short transaction** — never before the query (a record of an access that did not happen is worse than a missing one) and never inside the query's transaction (a read has no transaction to join). A failed record write **does not fail the read** — the administrator asked to see the trail and can see it, mirroring PRD §10's email rule — and is retried inline up to 3 attempts, only for transient failures (P2034 deadlock, connection loss); the retry is idempotent because the record's id is generated once and the primary key rejects the duplicate. There is no durable queue, because Hobby cron fires once per day with ±59 min drift, so a queued read would be unreviewable for up to ~24 hours.
- **Read when**: implementing the audit read path, writing the read record, adding any retry or queue mechanism to a background write, changing the read-log schema, or deciding what happens when a secondary record of a successful action fails.

ADR-8: Enforce the administrator check before the trail query, and keep the trail read contextual
- **Status**: accepted
- **Date**: 2026-10-26
- **Bolt**: 002-audit-reads (audit-and-observability)
- **Path**: `memory-bank/bolts/002-audit-reads/adr-8-audit-read-authorization-and-scope.md`
- **Summary**: FR-32's administrator check runs in the application layer **before** the query, as a pre-query gate rather than a query filter, because a filter returns an empty result and would make "forbidden" indistinguishable from "empty" while leaking existence through the result count. The gate is the administrator flag **alone** — never relationship, since FR-32 forbids a reporter, claimant, responder, or owner gaining access by participation — and the role is server-derived, never client-asserted. A whole-trail read is **retained as a backend capability with no route, tile, link, or export**: the frozen constraints forbid a global audit *surface*, while the operational review the read log exists to support is real, so the capability is kept and the surface stays absent. If a whole-trail read is ever exposed through any surface, this ADR must be revisited and the capability is likely to be removed. Filters are exactly UX §17.3's three — action type, date range, actor — with no free-text filter and no sort control, and a refused read is logged to the operational log only, never to `audit_read_logs`.
- **Read when**: implementing or reviewing any audit read path, creating a route that reads the audit trail, changing the trail's filters or ordering, deciding who may see the trail, or adding a whole-trail or export capability.

ADR-9: Keep the FR-48 event catalog in the audit module, and let the firing modules call it
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 003-audit-lost-side-events (audit-and-observability)
- **Path**: `memory-bank/bolts/003-audit-lost-side-events/adr-9-fr48-catalog-ownership.md`
- **Summary**: `system-architecture.md` assigns FR-48 to two modules — `recovery/` (FR-40..FR-48) and `audit/` (FR-31, FR-32, FR-48) — and the overlap is load-bearing, because three modules fire into the catalog: unit 004 fires events 15–20, 28, 29; unit 005 fires 21, 22, 24, 25, 26, 30; and unit 002 fires 23 and 27, since FR-11 (reporter withdrawal) is assigned to unit 002, not unit 004. Event 27 therefore has **two** firing units. The catalog lives in the `audit` module; the firing modules own the transitions and call it through a typed factory in `src/domain/audit/`. The factory owns each event's number, type, required field set, and the per-event rules (the determination pair on 18/19, the system-actor rule on 26–30, the batch completeness on 26/27); the firing module owns the business values and decides whether the transition happened. The dependency stays one-way — `recovery → audit`, `returns → audit`, `listings → audit` — and the `audit` module never evaluates FR-41's status machine. The guarantee is structural rather than conventional: a firing module cannot invent an event number, omit a required field, or write a determination without both halves of the pair.
- **Read when**: writing or reviewing any code that emits an FR-48 event (15–30), adding a new audit event type, changing the audit module's boundaries or its imports, deciding which module owns a catalog entry, or reviewing why event 27 is not defined twice.
ADR-10: Resolve the batch child-response set inside the transaction that performs the resolution, and treat the cross-module handoff as an explicit contract
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 003-audit-lost-side-events (audit-and-observability)
- **Path**: `memory-bank/bolts/003-audit-lost-side-events/adr-10-batch-resolution-contract.md`
- **Summary**: FR-48 events 26 and 27 record, in one row, that many Recovery Responses reached a terminal status because their parent Lost report reached `Returned` or `Closed` — and that list **is** the trail's record of the reason for each terminal resolution. The set is knowable only by the module that performs the batch update, so it crosses a module boundary. The set is obtained from the batch update's own `UPDATE … RETURNING id, previous_status` clause, inside the same transaction as the audit inserts, so the list is a product of the write and cannot diverge from it, and each response's source status is captured atomically with the after-state. The `audit` module validates the set's **shape** (non-empty; every entry carrying an id and a prior status) and records it verbatim; it cannot verify correspondence, because the `recovery_responses` table belongs to unit 004. The guarantee is therefore stated as an **explicit contract** — the firing module owes that the set passed is the set the update returned, unmodified — and asserted in tests, rather than claimed as an enforced invariant. The alternative that would make it enforceable, a shared application-layer use case owning the update, the `RETURNING`, and the event together, is rejected and recorded: it would put a Recovery Response write in the audit module's application layer, making it a second implementation of FR-41's state machine, which `system-architecture.md` names as the single largest correctness risk in the system.
- **Read when**: implementing the Lost-side batch resolution (events 26, 27, 30), writing any code that resolves multiple Recovery Responses at once, changing how the `recovery_responses` table is updated, or reviewing why a wrong batch list could not be corrected after the fact.
ADR-11: Validate the determination pair against the report's actual owner, and refuse an event whose maker is not the owner
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 003-audit-lost-side-events (audit-and-observability)
- **Path**: `memory-bank/bolts/003-audit-lost-side-events/adr-11-determination-owner-check.md`
- **Summary**: FR-48 events 18 and 19 carry two fields — `determined_by` (the Lost-report owner) and `recorded_by` (the acting administrator) — and FR-43 is emphatic that "the administrator does not independently decide that the item belongs to the owner". Two populated fields are not a mechanism on their own: a determination attributed to someone other than the owner is well-formed and would pass any presence or distinctness check, and it would be **permanently** wrong, because ADR-6's append-only trail has no correction path. The determination pair is therefore validated against the Lost report's own owner at event-build time, and an event whose maker is not the owner is refused with a fatal error that rolls back the transaction. The owner id is a server-side fact supplied by the firing module, never a request field, per the standard that roles are derived and never client-asserted. The check is about **roles**, not identity: `administrator` is a flag on an Account, so the same person may legitimately fill both halves in two capacities — the rule is that the maker is the report's owner, not that the two ids differ. The check is a shape check on the record's truth, not a workflow rule, so it does not import FR-41 or FR-42 and the module boundary ADR-9 establishes is preserved.
- **Read when**: writing or reviewing any determination path (events 18/19), changing how the determination-maker or recording-administrator is supplied, adding a way for an administrator to record a determination, or reviewing why a false determination cannot be corrected after the fact.
ADR-12: Use Node's built-in Argon2id for password hashing, require Node ≥ 24, and add no native crypto dependency
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 004-identity-core (identity-and-access)
- **Path**: `memory-bank/bolts/004-identity-core/adr-12-node-builtin-argon2.md`
- **Summary**: The unit brief names Argon2id but not how to obtain it, and no work factor is specified anywhere in the repository. A read-only probe against the verified local runtime (Node 24.19.0, Krypton LTS) confirmed `crypto.argon2Sync` exists and produces a deterministic 32-byte tag, and established that Node's parameter names differ from the common libraries — `nonce` not `salt`, `memory` not `memoryCost`, `iterations` not `timeCost`, plus a required `passes`. A cost probe measured the candidates: 19 MiB/2 iters ≈ 14 ms, **64 MiB/3 iters ≈ 81 ms**, 128 MiB/3 iters ≈ 151 ms, 64 MiB/3 iters/p=4 ≈ 68 ms. The decision is Node's built-in `crypto.argon2`, with `memory=65536, iterations=3, parallelism=1` — the OWASP second option, measured well inside the PRD's 1 s write NFR, and `parallelism=1` over 4 because serverless memory is scarcer than the 13 ms the 4-lane form saves. The work factors are **configuration** (`AUTH_ARGON2_MEMORY_KIB` and friends), and they are **embedded in the stored hash**, so raising them is a config change with no migration and no invalidation of existing credentials — which is what "adaptive" means. The algorithm is fixed, not configurable. The implementation lives in `infrastructure/`, never in `domain/`, which keeps the standard's rule that `domain/` be importable with no Node runtime. **The cost is a hard environment constraint: `crypto.argon2` requires Node ≥ 24, so `engines.node` is raised from `>=20` and the Vercel project runtime must be set to Node 24** — on Node 22 the function is `undefined` and every password hash fails. The failure is loud rather than silent. The fallback, if the runtime cannot move, is `@node-rs/argon2` (a native build on every deploy) or `crypto.scrypt` (built in, but not Argon2id, and the brief names Argon2id).
- **Read when**: implementing or reviewing password hashing or verification, changing the Argon2id work factors or the `engines.node` floor, choosing a password-hashing library, deploying to a runtime whose Node version is in question, or reviewing why no `argon2` dependency was added.
ADR-13: Name the module `accounts/`, conforming to the standards' module map, rather than `identity/`
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 004-identity-core (identity-and-access)
- **Path**: `memory-bank/bolts/004-identity-core/adr-13-module-name-accounts.md`
- **Summary**: The Stage 2 design proposed `src/domain/identity/`, but `system-architecture.md` § Module map names `accounts/` for "Account lifecycle, session, password reset" — exactly this bolt's scope, and bolt `005`'s — and `coding-standards.md` § File and folder organization independently names `domain/accounts/`. Three prior bolts conform to the map exactly, with bolt `001-audit-core` citing the map as its explicit rationale, and ADR-9 resolved a genuine overlap in that map (FR-48) **without** renaming a module. The design's scope argument — that `Session` and `ActorContext` are first-class outputs — does not survive the map's own description, which already names the session as part of `accounts/`; `ActorContext` is a projection derived from an `Account` and a `Session`, not a separate bounded context. The decision is therefore `src/domain/accounts/`, `src/application/accounts/`, `src/infrastructure/accounts/`, and the `identity/` naming is withdrawn. The **unit** is `001-identity-and-access` and the **module** is `accounts/` — different things, allowed to differ, as the project already does elsewhere. The entities, value objects, layer split, port names, and kebab-case file names are all unchanged; only the directory name changes. This ADR exists to stop the same proposal being re-derived and re-litigated: the map is authoritative for directory names, and a divergence is a standards change, not a bolt decision.
- **Read when**: creating a module directory, deciding what a module is called, adding an import path under `src/domain/`, or reviewing why the code says `accounts/` while the unit is named `identity-and-access`.
ADR-14: The account module triggers the FR-27 email and owns its content, and the notification transport is a shared port
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 004-identity-core (identity-and-access)
- **Path**: `memory-bank/bolts/004-identity-core/adr-14-fr27-email-ownership.md`
- **Summary**: Two authored artifacts disagreed. The unit brief places FR-27 in unit 001 because "approval is an account-lifecycle action"; the standards' module map assigns FR-27..FR-30 to `notifications/`. The resolution reads them as answering different questions: the brief answers *which action triggers an email* (the account approval), the map answers *where email content and transport live* (`notifications/`). The rule is now stated generally — **an email's owner is the module that owns its trigger** — and FR-27 is the one of the eight workflow emails whose trigger is an account lifecycle transition, so `accounts/` owns it end to end: the trigger, the content, and the transport. The other seven (FR-28, FR-29, FR-46 events 4–8) and the FR-51 reset message keep triggers in the Claim, Recovery Response, and report workflows, so `notifications/` owns them. The transport is a **shared port** in `application/ports/email-sender.ts`, implemented in `infrastructure/accounts/` and later in `infrastructure/notifications/` — a port owned by one module and consumed by another would be a dependency in the wrong direction, and `coding-standards.md`'s dependency rule forbids `accounts → notifications`. The email is sent **after** the commit (ADR-3, decision 4) and a failure is logged without blocking the approval (PRD §10); there is no outbox table, because the PRD asks that a failure not block the action, not for delivery guarantees, and an outbox would decouple the trigger from the decision FR-1's rule depends on. The FR-27 content is UX-governed, so editing it re-opens frozen UX. **Follow-up for the owner:** the module map still names FR-27 under `notifications/` and must be corrected; until then this ADR is the authority.
- **Read when**: implementing or reviewing any email send, deciding which module owns an email event, adding a new notification event, changing the `EmailSender` port, or reviewing why the FR-27 email is not in the `notifications` module.
ADR-15: Enforce rate limits with a database-backed fixed-window counter, not a Vercel rate-limiting product
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 004-identity-core (identity-and-access)
- **Path**: `memory-bank/bolts/004-identity-core/adr-15-database-rate-limiter.md`
- **Summary**: The PRD requires rate limiting on registration, login, Claim submission, Recovery Response submission, thread posting, and password reset; the unit brief names "Vercel rate limiting" as the integration point. The brief's row cites PRD §10 as the authority, and the PRD states the *behaviour* without naming a vendor — so the product is a suggestion, and it is declined. Two constraints decide it: `tech-stack.md`'s **$0 hard ceiling** (a hosted limiter is a paid add-on, and a requirement enforced only for paying customers is not the requirement), and the **Vercel Hobby / Fluid Compute** runtime, where an in-memory counter would be per-instance, reset on every cold start, and therefore would not limit anything while appearing to. The decision is a **database-backed fixed-window counter** behind a `RateLimiter` port in `application/ports/`, with `UNIQUE (bucket_key, window_start)` and a single `INSERT … ON CONFLICT DO UPDATE … RETURNING count` statement, so the increment and the decision are atomic and concurrent requests cannot collectively exceed the limit. **Login uses two buckets** (IP and normalized email) because each alone leaves a hole: IP-only lets one attacker lock out a campus behind a NAT, email-only turns the throttle into an account-existence oracle. **Registration is IP-only**, because an email-keyed bucket would add a second existence channel ahead of FR-1's required 409. The email bucket's refusal returns the same `GenericInactiveMessage` as every other refusal, so the throttle discloses nothing. The limiter runs in the route handler, before the use case — ADR-8's rule, and it avoids paying the ~81 ms Argon2id cost for a request that will be refused. Limits are configuration: register 5/hour per IP, login 20/15 min per IP, login 10/15 min per email. A daily idempotent sweep removes counters older than 24 hours; drift is harmless because a stale row never affects a decision. **Follow-up for the owner:** the unit brief's integration row must be corrected.
- **Read when**: implementing or reviewing any rate-limited route, changing the rate limits or the window, deciding where rate-limit state lives, adding a new rate-limited operation, or reviewing why no Vercel rate-limiting product is used.
ADR-16: Refresh a session's activity timestamp at most once per hour, accepting an idle window of 13–14 days rather than exactly 14
- **Status**: accepted
- **Date**: 2026-10-27
- **Bolt**: 004-identity-core (identity-and-access)
- **Path**: `memory-bank/bolts/004-identity-core/adr-16-session-activity-refresh.md`
- **Summary**: FR-4 says "Sessions expire after 14 days of inactivity" and PRD A2 states the mechanism is an Architecture decision. Honouring 14 days exactly requires a database write on every authenticated request — the largest avoidable write load in the identity module, on a free-tier PostgreSQL behind a pooled connection, and server-rendered pages produce several authenticated requests per user action. The decision refreshes the activity timestamp **only when the stored `last_activity_at` is more than one hour old**, so the write volume falls from per-request to per-hour. The consequence is stated rather than hidden: the stored timestamp can lag the truth by up to an hour, so **the effective idle window is 13–14 days**, never earlier — the approximation is on the safe side, and a session is never revoked early. One hour is short enough that the error is 0.3% of the window and long enough to collapse each burst of requests into one write. The approximation touches **only** the housekeeping timer: every explicit security action — logout, deactivation, password-reset revocation — is an exact, immediate write with no threshold, and revocation is checked on every resolution. **Expiry is enforced on read** against the stored `expires_at`, so correctness does not depend on a cron that drifts ±59 minutes; a daily sweep removes expired sessions (with a 30-day grace period) for storage only, is idempotent, and never touches a live session. A failed refresh must not fail the request: the timestamp is bookkeeping, and a failed write there must not log a member out.
- **Read when**: implementing or reviewing session resolution, session expiry, or the session sweep; changing the inactivity window or the refresh threshold; deciding whether a session update may fail a request, or reviewing why the idle window is 13–14 days rather than exactly 14.

ADR-17: Set the reset token's lifetime to 1 hour, exposed as configuration
- **Status**: accepted
- **Date**: 2026-10-28
- **Bolt**: 005-identity-security (identity-and-access)
- **Path**: `memory-bank/bolts/005-identity-security/adr-17-reset-token-lifetime.md`
- **Summary**: FR-51 lists "Reset-token expiry duration" among the architecture-owned implementation details, so the value is legitimately Architecture's to choose, and the PRD names none. What makes it more than an internal constant is that **the reset email states the lifetime** — a member reading the email must know how long the link they are about to click stays valid, which makes the duration **product-visible** and therefore a value the owner should accept rather than one Architecture should slip in unremarked. The decision is **1 hour**, exposed as `AUTH_RESET_TOKEN_TTL_SECONDS` with that value as the default; a malformed, non-positive, or non-numeric value **falls back to the default** rather than failing the request, the same convention ADR-15's rate limits and ADR-12's Argon2id parameters use. **The email renders the configured value, not a constant** — if the lifetime is 1800, the email says 30 minutes — so the number in the message is always the number the server enforces. The reasoning: 1 hour is enough for the intended use (a member who cannot sign in now uses it now), short enough to contain a captured link to a working day, and long enough to survive a mistyped new password without a second email. A **shorter** lifetime (15 minutes) expires for a member who steps away, and a **longer** one (24 hours) keeps a captured link live for a full day; the owner chose 1 hour on 2026-10-28. Expiry is enforced **on read**, not by a sweeper — a token is dead the moment its window elapses — and the daily sweep removes expired rows for storage only.
- **Read when**: implementing or reviewing the reset token's issue or expiry, changing any reset-token lifetime, writing or reviewing a reset email that states a duration, or reviewing why the value is configuration rather than a constant.

ADR-18: Equalise the reset request's timing with a dummy Argon2id verification and a constant floor
- **Status**: accepted
- **Date**: 2026-10-28
- **Bolt**: 005-identity-security (identity-and-access)
- **Path**: `memory-bank/bolts/005-identity-security/adr-18-reset-timing-equalisation.md`
- **Summary**: FR-51 requires the reset response not to disclose account existence in the **body**, the **timing**, and the **screen state** — and the timing half is the hard one, because the hit path additionally creates a token row and sends an email while the miss path does neither, so the miss path is measurably faster. The decision applies **two** mechanisms on every path: an **unconditional dummy Argon2id verification** (the same `DUMMY_HASH` pattern bolt `004`'s login already uses for an unknown email, which equalises the ~81 ms dominant cost by reusing the codebase's existing answer rather than inventing a second one) and a **constant response floor** of 250 ms (`AUTH_RESET_MIN_RESPONSE_MS`), which is a floor rather than a tax because the hit path usually clears it already. The acceptance test asserts the two paths differ by no more than a **measured tolerance** of 100 ms (`AUTH_RESET_TIMING_TOLERANCE_MS`) — wide enough not to be flaky, narrow enough that a real existence oracle fails it by orders of magnitude. **The floor also applies to the rate-limited path**, a deliberate departure from ADR-15's login precedent: there, every refusal returns the identical `GenericInactiveMessage` so an early return leaks nothing, whereas the reset path's accepted (202) and refused (429) bodies differ and so must their timing. The branch decides only whether an email is sent and may shape no part of the response, which is built once after it from a single `NeutralResetConfirmation`. Rejected: constant-time comparison against a stored hash (equalises a comparison, not the surrounding work), a fixed delay alone (strictly worse at the same latency), a queue (Hobby cron drifts ±59 min, so the email arrives a day late), and a delay derived from account existence (self-defeating).
- **Read when**: implementing or reviewing the reset request path, its timing behaviour, its rate limiting, the dummy-hash pattern, or the tolerance any timing assertion uses; reviewing why the reset request pays ~81 ms of Argon2id on every call, or why the rate-limited path also pays the response floor.

ADR-20: Configure the campus-area list as a seeded database table, and store the report's campus area without a foreign key
- **Status**: accepted
- **Date**: 2026-10-28
- **Bolt**: 007-reporting-core (reporting-and-listings)
- **Path**: `memory-bank/bolts/007-reporting-core/adr-20-campus-area-configuration-mechanism.md`
- **Summary**: FR-8 makes the campus area a fixed per-deployment enum whose configuration mechanism OQ-1 assigns to Architecture, and `system-context.md` had already narrowed it to "deploy-time config or seed". The decision is the **seed** half: a `campus_areas` table with `value`, `label`, `active`, and `created_at`, seeded per deployment with **no** rows in the migration, because the areas are the deployment's content and a migration that invented them would be inventing product content. `reports.campus_area` is plain `text` with **no foreign key**, because the membership rule is a *validation* rule and story 003's edge case requires that a deactivated area not rewrite existing reports — a FK cannot express that, would make a label rename a data migration touching every report that used the area, and would force a wrong `ON DELETE` decision when the requirement is that the report keeps its value regardless. The domain stays deployment-agnostic because `CampusAreaReader` is a port, so the set's origin remains reversible at the infrastructure layer. **Ratified by the owner on 2026-10-28; OQ-1 is closed.**
- **Read when**: implementing or reviewing the campus-area list, its seeding, its reader, or any change to `reports.campus_area`; changing the `campus_areas` table or its `active` semantics; considering a foreign key from a report to a lookup table; changing how a per-deployment configuration list is stored; or reviewing why a report's campus area has no referential constraint.

ADR-19: Key the reset rate-limit bucket's email address with an HMAC, while the login bucket keeps the plaintext address
- **Status**: accepted
- **Date**: 2026-10-28
- **Bolt**: 005-identity-security (identity-and-access)
- **Path**: `memory-bank/bolts/005-identity-security/adr-19-keyed-rate-limit-bucket-key.md`
- **Summary**: ADR-15 settled that rate-limit counters live in a database-backed fixed-window counter with a **plaintext** `bucketKey`, and bolt `004`'s login bucket therefore stores the plaintext normalized address — acceptable there because the key discloses a *failed authentication*, which is a fact about an attempt. The reset flow's key discloses **registered accounts**, which is a fact about the account itself and is the enumeration FR-51 forbids; the counter table is also reachable by anyone with database read access, so the disclosure lands one layer down. The decision is that the reset email bucket's key is an **HMAC of the normalized address** with a dedicated per-deployment secret (`AUTH_RESET_BUCKET_HASH_SECRET`), and the **IP** bucket stays plaintext because an IP is not an account attribute. The critical constraint is that an **unsalted SHA-256 is forbidden**: the email address space is small and well known, so an unsalted digest is **trivially reversible by dictionary attack** — it looks protective and is not, which is exactly the failure this ADR exists to prevent. A missing secret **fails loudly at startup** rather than falling back to an unkeyed digest, because there is no safe default for a property whose fallback is the thing being forbidden. The secret is **separate** from `SESSION_SECRET` and from the reset token's own hashing secret, so the two rotate independently and rotating the bucket key does not invalidate outstanding reset tokens. The login path is **unchanged** — this ADR records the one place the two paths differ, and why the difference is deliberate rather than an inconsistency.
- **Read when**: implementing or reviewing any rate-limit bucket key, changing the counter schema or its sweep, deciding what may be stored in operational tables, adding a new email-scoped bucket, or reviewing why the reset bucket's key is not readable in the counter table while the login bucket's is.
