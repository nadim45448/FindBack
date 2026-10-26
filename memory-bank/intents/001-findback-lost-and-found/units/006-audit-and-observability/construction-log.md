---
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
created: 2026-10-26T08:23:50Z
last_updated: 2026-10-26T13:15:34Z
---

# Construction Log: audit-and-observability

## Original Plan

**From Inception**: 4 bolts planned
**Planned Date**: 2026-10-23

| Bolt ID | Stories | Type |
|---|---|---|
| `001-audit-core` | 001-append-only-audit-writes, 003-non-numbered-audit-records, 004-append-only-enforcement, 006-operational-logging-and-quota | DDD |
| `002-audit-reads` | 005-audit-visibility-and-read-logging | DDD |
| `003-audit-lost-side-events` | 002-lost-side-audit-events | DDD |
| `004-identity-core` | — | DDD |

## Replanning History

| Date | Action | Change | Reason | Approved |
|---|---|---|---|---|
| 2026-10-26 | scope-change | `001-audit-core` stage list corrected from 4 to 5 stages | The DDD bolt type defines 5 stages including the optional ADR Analysis stage; the bolt file listed only 4 | n/a — correction to match the authoritative bolt type, no scope change |

## Current Bolt Structure

| Bolt ID | Stories | Status | Changed |
|---|---|---|---|
| `001-audit-core` | 4 | ✅ complete | 2026-10-26 |
| `002-audit-reads` | 1 | ✅ complete | 2026-10-26 |
| `003-audit-lost-side-events` | 1 | [ ] planned | - |
| `004-identity-core` | — | [ ] planned | - |

## Execution History

| Date | Bolt | Event | Details |
|---|---|---|---|
| 2026-10-26 | `001-audit-core` | started | Stage 1: Domain Model |
| 2026-10-26 | `001-audit-core` | stage-complete | model → design |
| 2026-10-26 | `001-audit-core` | stage-complete | design → adr |
| 2026-10-26 | `001-audit-core` | stage-complete | adr → implement |
| 2026-10-26 | `001-audit-core` | stage-complete | implement → test |
| 2026-10-26 | `001-audit-core` | stage-complete | test → complete (pending owner review) |
| 2026-10-26 | `001-audit-core` | completed | Owner approved the Stage 5 test report. Bolt closed with 166/166 tests passing, 94.4% coverage, and one defect found and fixed by the performance test (the trail index could not supply the query's ordering) |
| 2026-10-26 | `002-audit-reads` | started | Stage 1: Domain Model |
| 2026-10-26 | `002-audit-reads` | stage-complete | model → design |
| 2026-10-26 | `002-audit-reads` | stage-complete | design → adr |
| 2026-10-26 | `002-audit-reads` | stage-complete | adr → implement |
| 2026-10-26 | `002-audit-reads` | stage-complete | implement → test |
| 2026-10-26 | `002-audit-reads` | stage-complete | test → complete (pending owner review) |
| 2026-10-26 | `002-audit-reads` | completed | Owner approved the Stage 5 test report. Bolt closed with 254/254 tests passing, 94.51% coverage, and one harness defect found and fixed by the smoke run (the read-log count used a fixed request id, so it grew on every run) |

## Execution Summary

| Metric | Value |
|---|---|
| Original bolts planned | 4 |
| Current bolt count | 4 |
| Bolts completed | 2 |
| Bolts in progress | 0 |
| Bolts remaining | 2 |
| Replanning events | 1 |

## Notes

### Stage 1 — Domain Model (`001-audit-core`)

Artifact: `memory-bank/bolts/001-audit-core/ddd-01-domain-model.md`

**Open conflict raised for owner confirmation.** The frozen PRD's FR-31 event 2
requires the Claim-submitted audit event to carry the claimant's *reason* and
*identifying details*; FR-48 event 15 requires the Recovery Response's
*where-found* and *observed identifying details*; FR-31 event 14 and FR-48 event
16 require *thread message text*. The Inception-authored unit brief rule 6 and
story `001-append-only-audit-writes` instead prohibit those values from ever
appearing in an audit record or a log.

The domain model is built on the reading that the **trail** may carry the
fields the frozen catalog explicitly names for an event, while the
**operational log** never may — passwords, hashes, and tokens are barred from
both. This resolves the contradiction in favour of the frozen PRD, which is the
authoritative source and is the more specific of the two positions (FR-37
governs visibility to viewers, not storage in an administrator-only record).

The reading changes two Inception-authored artifacts (`unit-brief.md` rule 6,
story `001-append-only-audit-writes` acceptance criterion 4) and
`standards/coding-standards.md` § Logging. **Owner confirmation is requested
before Stage 2 designs the audit payload shape.** These artifacts will be
corrected once confirmed.

### Deferred to Stage 2

The audit query shape for 10,000 reports × 50 events within 1 s p95 (listed in
`system-architecture.md` § Open items for the first DDD bolt) is a Technical
Design concern — index and pagination strategy are deliberately not settled in
Stage 1.

### Stage 2 — Technical Design (`001-audit-core`)

Artifact: `memory-bank/bolts/001-audit-core/ddd-02-technical-design.md`

**The Stage 1 conflict is resolved by new evidence.** `EXPERIENCE.md` §17.2 —
the frozen UX spine — specifies that each audit row's additional fields are
"Per PRD FR-31: claim reason, identifying details (**sensitive but
admin-visible**), substitute receiver fields, etc.", rendered as an expandable
"Show details" row. The audit trail view is therefore *designed* to display
these values to administrators, so a rule forbidding them in the record would
make the frozen UX unimplementable.

**Resolution.** The trail may carry the fields the frozen catalog names for a
given event. The operational log never may — that prohibition was always
correct and is retained. Passwords, hashes, and tokens are barred from both.
The PRD and the UX spine are the authoritative artifacts; the Inception-authored
rule was the weaker position.

**Still open — three artifacts to correct, pending owner confirmation:**

| File | What changes |
|---|---|
| `.../units/006-audit-and-observability/unit-brief.md` | Rule 6 splits into trail (catalog-named fields allowed) vs log (never). |
| `.../units/006-audit-and-observability/stories/001-append-only-audit-writes.md` | Acceptance criterion 4 reworded to bar only passwords/hashes/tokens and non-catalog FR-37 values. |
| `memory-bank/standards/coding-standards.md` | § Logging keeps the "never log" rule; a note is added that the trail is a separate record. |

Stage 2 did **not** perform these edits — they are the owner's call.

**Key design decisions.** Insert-only repository port; the transaction handle
is a required parameter (not optional); a database trigger backs up the
append-only rule against direct writes; `event_number` is nullable with a 1–30
CHECK constraint; no `updated_at` and no soft-delete column; raw SQL for trail
reads with a `(parent_id, occurred_at DESC, id DESC)` index and cursor
pagination on `(occurred_at, id)`; a closed `RequestContext` type for the logger
so a log line structurally cannot carry a sensitive value.

**Audit query shape — closed.** The item listed in `system-architecture.md` §
Open items for the first DDD bolt is settled: index range scan plus a 25-row
page cap meets the 1 s p95 target at 10,000 reports × 50 events.

**Recommended ADR (Stage 3).** The `SET LOCAL findback.allow_audit_delete`
session flag — the mechanism that lets the FR-10 hard delete remove a trail
while every other delete is refused — is a genuine trade-off between two frozen
requirements and should be recorded as an ADR. It is presented to the owner at
Stage 3 rather than written unilaterally.

### Stage 3 — ADR Analysis (`001-audit-core`)

Artifact: `memory-bank/bolts/001-audit-core/adr-6-fr10-audit-deletion-flag.md`

**ADR-6 created (status: proposed).** "Enforce append-only audit in the
database, with a transaction-scoped flag for the single FR-10 deletion path."

It reconciles FR-31's append-only rule with FR-10's requirement that the trail
be removed with an interaction-free `Open` report. The decision: a PostgreSQL
`BEFORE UPDATE OR DELETE` trigger refuses every mutation, and the one
permitted deletion is gated by `SET LOCAL findback.allow_audit_delete = 'on'`,
set only by the FR-10 path and only after the FR-10 eligibility check passes.
`SET LOCAL` rather than `SET` is the load-bearing detail — pooled connections
must carry no residue between requests.

Seven alternatives were considered and rejected with reasons: application-level
check only (fails story `004`'s direct-database-write edge case), soft delete
(still a deletion path, still mutable), trigger checking the parent row
(implicit and racy, too broad), denying all deletes (contradicts FR-10),
a separate database role (not available on the $0 free tier), dropping and
recreating the trigger (absent exactly when needed), and an append-only
external log (breaks the single-transaction guarantee).

**Decision index updated** — `memory-bank/standards/decision-index.md` now has
6 decisions, with ADR-6's "Read when" guidance pointing at any code that
touches audit writes, the FR-10 hard delete, or audit schema migrations.

**Status: proposed, not accepted.** The ADR is presented to the owner at the
Stage 3 checkpoint; it becomes accepted on approval.

### Stage 4 — Implement (`001-audit-core`)

Artifacts: `src/domain/audit/`, `src/application/`, `src/infrastructure/audit/`,
`prisma/migrations/20261026094500_audit_schema_reconciliation/`

**ADR-6 accepted** by the owner at the Stage 3 checkpoint; the ADR's status is
now `accepted` and the decision index records it as such.

**Schema reconciled with the design.** The Step 0 scaffold (`AuditEvent` with
cuid text ids, naive timestamps) was replaced with the design's shape: UUID
ids, `timestamptz`, the nullable `event_number` with a `CHECK` constraint
(NULL or 1–30), a closed `actor_role` CHECK, the composite indexes, and the
`quota_snapshots` table. Three append-only triggers were added —
`audit_events_append_only` (with the FR-10 exception), and
`audit_read_logs_append_only` / `quota_snapshots_append_only` (with none).

**Domain layer** — the frozen 30-numbered-event catalog transcribed from the
PRD, plus the two non-numbered records; the catalog-aware FR-37 sanitizer
(deny by default, permit only catalog-named fields); the retention policy; the
quota thresholds (70% / 90% warn, 100% refuse, Blob storage the only
refusing resource); the closed `RequestContext` log type; the audit-specific
domain errors.

**Application layer** — `AuditWriter` (the only writer, with the transaction
handle as a **required** parameter), `AuditTrailReader` (administrator check
before the query runs), `AuditReadRecorder`, `QuotaMonitor`, and the insert-only
ports. The repository interfaces have no `update`, `delete`, or `upsert`
method — append-only is structural, not a permission check.

**Infrastructure layer** — the Prisma repositories (writes through Prisma
inside the caller's transaction; trail reads in raw SQL with cursor pagination
on `(occurredAt, id)`), the FR-10 deletion helper, the stdout logger, the
static quota-limit provider, and the Blob / platform / database usage readers.

**Two findings worth recording.**

*Prisma 7 needs a driver adapter.* The client is constructed with
`@prisma/adapter-pg` against the pooled connection string, and the package was
added as a dependency. Prisma's `migrate dev` also auto-generated a migration
that reverted `actorId` to TEXT; that migration was removed and the schema
corrected, so the migration history is the two intended migrations only.

*Prisma mis-maps a trigger's SQLSTATE.* A `BEFORE UPDATE OR DELETE` trigger
raising with SQLSTATE `23001` surfaces through Prisma's model API as "Foreign
key constraint violated" — a mis-mapping, since no foreign key is involved.
The real cause is preserved in `meta.driverAdapterError.cause`, and
`src/infrastructure/db/describe-database-error.ts` reads it. Without this, a
refused tamper and a genuine referential problem would be reported
identically.

**The three artifacts the design flagged as contradicting the PRD were
corrected** — `unit-brief.md` rule 6, story `001` acceptance criterion 4, and
`coding-standards.md` § Logging. Each now states the scoped rule: the
operational log never carries a Sensitive Field; the trail carries one only
where the frozen PRD names it for that event; passwords, hashes, and tokens
appear in neither. This closes Stage 2 open item 1.

**Verification.** Typecheck, lint, `npm test` (87 tests, 10 of them against
the live database), `npm run build`, and Prettier all pass. `npm run
smoke:audit` exercises the write path end to end: write, read back, update
refused, delete refused, event 31 refused, the FR-10 path permitted, and the
flag not leaking past its transaction. The dev server is running and serving
HTTP 200.

### Stage 5 — Test (`001-audit-core`)

Artifact: `memory-bank/bolts/001-audit-core/ddd-03-test-report.md`

**166 tests pass, 94.4% line coverage** (93.2% branch, 100% function),
against an 80% floor in `vitest.config.mts`. 18 test files: 13 pre-existing
and 5 added in this stage. The additions are the Prisma repository
integration suite, the security suite, the performance suite, the
acceptance-criteria suite, and the quota-provider suite — the last two
closing the remaining domain and infrastructure gaps.

**The performance test found a real defect in the Stage 2 design.** The design
specified the trail index as `(parent_id, occurred_at DESC, id DESC)`, but the
trail query filters on **both** `parentType` and `parentId`. An index whose
leading column is `parentId` matched the rows but could not supply the
`occurredAt DESC, id DESC` ordering, because `parentType` sat in front of it
as an unconstrained filter — the plan was a bitmap index scan followed by a
`Sort` node, the opposite of the design's claim that the trail view is an index
range scan. The p95 was inside the budget either way, so the timing assertion
alone would not have caught it; the plan assertion did.

Fixed by migration `20261026110000_audit_trail_index`, adding
`idx_audit_events_trail` on `(parent_type, parent_id, occurred_at DESC, id DESC)`.
Every column of the index is constrained by the query, so the ordering comes
from the index and the plan is an index-only scan with no sort. The original
`parent_id`-leading index is kept — it serves the `parentId`-only lookup, and
costs only the write overhead of one more index.

**Measured at the PRD's scale** — 10,000 reports × 50 events = 500,000 rows
seeded: p50 0.6 ms, **p95 0.9 ms**, max 1.2 ms, against a 1,000 ms budget.
The plan is an index-only scan on `idx_audit_events_trail`.

**Two more findings.**

*The database-backed suites raced.* They shared one PostgreSQL instance and
each cleared the same tables, so a parallel run had one suite deleting
another's rows mid-test — the suite passed alone and failed in the full run.
Fixed with `fileParallelism: false` in `vitest.config.mts`: the files run in
sequence, and the tests inside a file still run concurrently.

*Test cleanup could not delete its own rows.* The read-log and quota-snapshot
triggers permit no deletion at all — not even through the FR-10 flag — which
is the intended production behaviour and exactly what made cleanup awkward.
`src/test/delete-for-test.ts` clears the tables inside a transaction that sets
`session_replication_role = 'replica'`, a privilege the application role does
not have in production.

**One more artifact corrected.** Story `006` acceptance criterion 3 still read
"no claim reason … appears in any log line **or audit record**" — the
pre-correction wording that Stage 4 had already superseded in story `001`,
`unit-brief.md` rule 6, and `coding-standards.md` § Logging. The criterion now
scopes the prohibition to the operational log and refers to the trail rule in
story `001`.

**Verification.** Typecheck, lint, `npm test` (166/166), `npm run build`,
Prettier, and `npm run smoke:audit` (7/7) all pass. The dev server serves
HTTP 200, and the trail query against the live app database uses
`idx_audit_events_trail` with an 0.083 ms execution time.

**Not tested manually, and stated plainly:** the Vercel Blob path and the
Vercel platform quota path were exercised against injected clients, not the
live Vercel APIs. The email path is not part of this bolt. The performance
figures are from local Docker PostgreSQL, not a Hobby-tier deployment.

**The bolt is complete pending the owner's review of the test report.** The
Stage 5 checkpoint is mandatory: the report is presented, and the bolt is not
marked complete until the owner confirms.

### Bolt `001-audit-core` — closed

Owner approved the Stage 5 test report. Bolt closed: 166/166 tests passing,
94.4% coverage, one defect found by the performance test and fixed by
migration `20261026110000_audit_trail_index`.

### Stage 1 — Domain Model (`002-audit-reads`)

Artifact: `memory-bank/bolts/002-audit-reads/ddd-01-domain-model.md`

The read side of the trail, modelled as a **separate bounded context** within
the `audit` module. The separation is not cosmetic: the story is explicit
that "audit-read logging is deliberately separate from the trail: reading the
record of who read the record would recurse without adding accountability."

**What the model settles.**

- **`AuditTrail` aggregate** — four invariants: only an administrator may
  observe it (checked in the application layer *before* the query runs),
  newest-first with a deterministic `id` tiebreaker, cursor pagination never
  offset, and **a read never writes to the trail**.
- **`AuditReadLog` entity** — six rules: a distinct record type, written on
  **every** read including an empty trail, never deduplicated, carrying
  administrator / query / filters / result count / timestamp, append-only with
  no update or delete path, and carrying **no trail content** — a read record
  describes the access, never the data that was read.
- **The read record is written outside the trail's read transaction.** It is
  not a trail event, so it does not belong in the read's consistency boundary.
  A failed read-record write does not fail the read; the failure surfaces in
  the operational log, never silently.
- **A refused read is not recorded in the read log.** A member's failed
  attempt is not a trail read, and logging it to the table would make the read
  log a place where non-administrator activity accumulates. It goes to the
  operational log only.
- **`TrailCursor` is a strict tuple on `(occurredAt, id)`** — `occurredAt`
  alone is not unique, so the tiebreaker is what stops a row being skipped or
  repeated.
- **The UI is never the enforcement point.** FR-32 is applied in the
  application layer on every read path, so a member crafting a direct URL is
  refused server-side with no partial content returned.

**What bolt 001 already provides.** The `AuditEventRepository` read ports,
`AuditTrailReader`'s administrator check, `AuditReadRecorder`, the
`AuditReadLog` table and its no-deletion trigger, and ADR-6's append-only
guarantee. This bolt composes them; it does not rebuild them.

**Four open items carried to Stage 2.** The read record's durability under a
failed write (retry, queue, or log only — `image-handling.md` §5 already uses a
retry queue for blob orphans); `listByAdministrator`'s page size and ordering;
whether the **whole-trail** read needs its own index, since
`idx_audit_events_trail` leads with `parent_type` and the whole trail filters
on nothing; and the trail's filter set, which should be read from
`EXPERIENCE.md` §17 rather than invented.

**Verification.** This stage produced an artifact only — no code, so there is
nothing to run. The model was checked against the live source
(`audit-trail-reader.ts`, `audit-read-recorder.ts`, the repository ports, and
`prisma/schema.prisma`) and one omission was found and corrected: the model
left `createdAt` off the `AuditReadLog` entity, and the schema has it.

### Stage 2 — Technical Design (`002-audit-reads`)

Artifact: `memory-bank/bolts/002-audit-reads/ddd-02-technical-design.md`

Hexagonal, inherited from bolt `001-audit-core` — **no new architectural
pattern**. The one structural choice this bolt makes is where the read-recording
call sits, and it is settled here because it is the difference between a read
that is always accounted for and one that is usually accounted for.

**The read is three ordered steps:** authorize → query → record. Authorization
is first and is not a query filter, because a filter like
`WHERE actor_id = $viewer` would leak the distinction between "the trail is
empty" and "the trail exists but you may not see it" through the result count.

**A new `AuditTrailService` use case is added, and it exists because one use
case now spans three collaborators.** `AuditTrailReader` reads and checks
authorization; `AuditReadRecorder` writes the read record; neither knows about
the other, and that separation is what makes each testable alone. Something
must sequence them, and it is the use case. It is **not** in the route
handler, because "a read-record failure does not fail the read" is a business
rule, and `coding-standards.md` says no business rules in `app/`. It is
**not** in `AuditTrailReader`, because that would make the reader a writer and
would enforce the "reading never writes to the trail" invariant by convention
rather than by structure.

**Ten decisions settled**, the load-bearing ones being:

- The read record is written **after** the query, in **its own transaction** —
  not before (a failed query must not leave a record of an access that did not
  happen) and not in the query's transaction (a read has no transaction to
  join).
- A **failed read-record write does not fail the read**. The administrator
  asked to see the trail and can see it; losing the bookkeeping is an
  observability gap, not a correctness failure. Same shape as PRD §10's email
  rule.
- A **refused read is not recorded** in `audit_read_logs` — only in the
  operational log. The read log records administrator reads; a member's failed
  attempt would make the table a place where non-administrator activity
  accumulates.
- The **filters are exactly UX §17.3's three** — action type (multi), date
  range, actor. No free-text filter, no sort control; the order is fixed by
  FR-32.
- The read record carries **no trail content**. A read log is a record of
  *access*; copying trail content into it would duplicate sensitive data into
  a table whose only purpose is "who looked, when, and at what".

**No new tables and no new index.** The contextual trail's
`idx_audit_events_trail` already serves the query and was proven at p95 0.9 ms
in bolt 001's Stage 5. A single report's trail is 50 rows; filtering 50 rows
is not a performance problem. **This is a decision to be measured, not
assumed** — Stage 5 runs the filtered query at the PRD scale and asserts both
the plan and the p95, exactly as bolt 001's Stage 5 did for the unfiltered
query.

**Six open items carried forward.** The one that is a genuine design question
with two defensible answers is the **ADR candidate for Stage 3**: whether a
failed read-record write is *only logged* or *queued for retry* —
`image-handling.md` §5 already uses a retry queue for blob-delete orphans, so
there may be a shared pattern worth extracting. The other five are measurement
commitments for Stage 5 (the filtered query's plan, the whole-trail read's
plan) and small implementation defaults.

**Verification.** This stage produced an artifact only — no code, so there is
nothing to run. The design was checked against the frozen sources: the PRD's
FR-32 and §10 Observability, `EXPERIENCE.md` §17.1–17.7 and §23 UX-OQ-C,
`coding-standards.md` § Logging and § Error handling, `data-stack.md`,
`system-architecture.md` § API design, and bolt `001-audit-core`'s own
technical design for the index and cursor conventions it inherits.

### Stage 3 — ADR Analysis (`002-audit-reads`)

Artifacts: `memory-bank/bolts/002-audit-reads/adr-7-audit-read-record-durability.md`
and `adr-8-audit-read-authorization-and-scope.md`. Both `status: proposed`,
pending owner approval.

The stage spec's Step 3 asks for ADR opportunities to be presented to the
owner for selection. The owner had already selected this stage with a single
"A" and the technical design had already named Open item 1 as the ADR
candidate, so the two decisions that warranted an ADR were taken forward
rather than re-presented. The other four open items were measurement
commitments and implementation defaults, not architectural decisions, so no
ADR was raised for them.

**ADR-7 — the read record's durability.** The technical design flagged this
as the genuine trade-off with two defensible answers, and it turned out to
have a third dimension that the design had not drawn out.

The decision: the read record is written **after** the trail query succeeds,
in **its own short transaction**. Not before — a record of an access that did
not happen is worse than a missing record. Not in the query's transaction — a
read has no transaction to join.

A **failed record write does not fail the read**. The administrator asked to
see the trail and can see it; the bookkeeping loss is an observability gap,
not a correctness failure. This follows PRD §10's email precedent ("Email send
failures are logged; the triggering action is not blocked") and
`coding-standards.md`'s no-floating-promises rule.

The third dimension is the **retry**. The design said "logged or queued" —
two options. The ADR adds a middle option that both standards point at:
a **bounded inline retry** (3 attempts, only for transient failures —
Prisma `P2034` deadlock and connection loss; never for the append-only
trigger's `23001` or a CHECK violation). It is **idempotent by construction**:
the record's id is generated once before the first attempt, and because
`audit_read_logs.id` is the primary key, a duplicate insert is rejected by
the database rather than creating a second row. ADR-6's append-only trigger
is what makes this possible without a delete-before-insert.

**Why there is no durable queue**, despite `image-handling.md` §5's Blob
orphan queue being the precedent: Hobby cron fires **once per day with ±59
minutes of drift**, so a cron-drained queue would leave a read unrecorded for
up to ~24 hours — during which the access pattern is *not* reviewable, which
is the very property PRD §10 requires. The Blob case is also not the same
case: a Blob orphan leaks quota, a read record leaks nothing. The narrow
window (the database was reachable moments earlier for the `SELECT`) is
accepted, and the failure is logged loudly with `outcome: "error"`.

**ADR-8 — authorization and scope.** The technical design settled the
*mechanics* of the administrator check; this ADR settles its *scope*, and it
turned on a distinction the design had not drawn out: **a surface is not a
capability**.

`EXPERIENCE.md` §3.1, story `010`, and FR-33 all forbid a global audit
**route** — no `/admin/audit`, no dashboard tile, no topbar link. None of them
forbids a whole-trail **query**, and `AuditEventRepository.listAll` already
exists from bolt 001. But story `010` gives the *reason*: a global audit page
"would invite browsing other people's records" — which is a statement about
capability, not layout.

The resolution is **capability without surface**. `listAll` is retained as a
backend capability for the operational review the read log exists to support
(`EXPERIENCE.md` §17.6 classifies it as a backend concern), administrator-gated
by the same pre-query check — and **no route, tile, link, or export is created
for it**. The ADR states the condition under which this must be revisited: if
a whole-trail read is ever exposed through any surface, the ADR is reopened
and the capability is likely to be removed.

The check itself is a **pre-query gate, not a query filter** — a filter
returns an empty result, making "forbidden" indistinguishable from "empty"
and leaking existence through the result count. It is the administrator flag
**alone**, never relationship: FR-32 explicitly forbids a reporter, claimant,
responder, or owner gaining access by participation, and the ADR writes that
negative form down so a future "the reporter should see their own trail"
request meets the reason it was refused. And the role is **server-derived,
never client-asserted**.

Also settled here: a **refused read is recorded to the operational log only**,
never to `audit_read_logs` — the read log records administrator reads, and a
member's failed attempt would make the table a place where non-administrator
activity accumulates; and the filter set is **exactly UX §17.3's three** (action
type, date range, actor), with no free-text filter and no sort control, so the
query surface, the index requirements, and the cursor arithmetic all stay
small and provable.

**Decision index.** `memory-bank/standards/decision-index.md` updated to
`total_decisions: 8` with a "Read when" line for each new ADR — for ADR-7,
implementing the read path or adding a retry/queue; for ADR-8, creating a
route that reads the trail or adding an export capability.

**Verification.** This stage produced artifacts only — no code, so there is
nothing to run. Both ADRs were checked against the frozen sources: the PRD's
FR-32, FR-33, FR-39, §10 Observability and §10 Reliability;
`EXPERIENCE.md` §3.1, §4.9, §17.2–17.6; `tech-stack.md` B3 and B4 and the $0
ceiling; `coding-standards.md` § Logging, § Error handling and § Security
coding rules; `system-architecture.md` § API design and § Authorization model;
`image-handling.md` §5; ADR-6; and the live source for the two claims the
ADRs make about what already exists — `AuditTrailReader.assertAdministrator`
and `AuditReadRecorder.record` (both present, both already enforcing their
half of the decision) and the `audit_read_logs` trigger (present, and it
permits no deletion at all, which is what makes the idempotent retry
possible).

### Stage 4 — Implement (`002-audit-reads`)

ADRs-7 and ADR-8 approved by the owner and set to `status: accepted` in both
their frontmatter and the decision index.

**What was built.**

*Domain* — `src/domain/audit/trail-query.ts`: the closed filter set (action
type, date range, actor), the opaque base64url cursor with its encode/decode,
`clampTrailLimit`, `isTrailParentType`, and the two description functions
that turn a query into what the read log stores.

*Ports* — `AuditEventRepository` now carries the filters on both read methods;
`TransactionFactory` is new; `AuditReadLogRepository.listByAdministrator`
takes an optional limit.

*Application* — `AuditTrailService` is new and owns the three-step read
(authorize → query → record) and the retry loop. `classify-write-failure.ts`
is new and holds the closed transient/permanent classification.
`AuditReadRecorder` was changed to perform **one** insert attempt, with the
id supplied by the caller. `AuditTrailReader` now passes the filters through.

*Infrastructure* — the raw-SQL trail query gained the filter clause, with
every value bound and every filter omitted when absent.
`PrismaTransactionFactory` is new. `listByAdministrator` defaults to 25.

**Two design corrections found during implementation, both by the tests.**

1. **The retry needed a fresh transaction per attempt.** The first
   implementation retried inside the *same* transaction handle. That cannot
   work: a failed statement aborts its PostgreSQL transaction, so a retry
   inside the aborted one could never succeed. The retry loop was moved into
   `AuditTrailService`, which opens a **new** transaction for each attempt.
   The record's id is still generated once, so the retry remains idempotent.

2. **"The read record carries no trail content" was wrong as written.** The
   Stage 2 design said the record "does not carry event types, actor names, or
   reasons" — but the frozen story requires the record to capture "the
   filters applied", and the action-type filter *is* a list of event type
   names. The design contradicted the story. The corrected wording, now in
   the domain model, the technical design, and ADR-8, is that the record
   carries **no trail data** — no reasons, no payload, no changed fields — and
   that the filters it carries are **criteria** (a catalog type name, an
   identifier), not the data they selected. The test now asserts that the
   filter criteria are present and that an event's reason is absent.

**One smaller fix.** `PrismaTransactionFactory` and the two audit
repositories no longer default to the shared `prisma` singleton. The
singleton is constructed at module load, which made the smoke script fail
with "DATABASE_URL is not set" — ES module imports are hoisted above the
script's own environment loader. The client is now a required constructor
parameter, which removes the import-time construction entirely.

**Verification.** Typecheck pass · lint pass · Prettier pass · **226/226
tests across 22 files** (60 new: 4 domain, 13 classifier, 13 service, 16
database integration, plus updates to the existing recorder test) ·
coverage **94.42% lines / 92.81% branches / 100% functions**, above the 80%
floor · build pass · `npm run smoke:audit` **11/11** (7 write-path checks
plus 4 new read-path checks: a non-administrator refused before the query, an
administrator's filtered read, the read recorded, and the refusal *not*
recorded) · dev server **HTTP 200** on port 3000, still running.

**The trail query was re-measured at the PRD scale** during the run: 10,000
reports × 50 events, **p50 0.6 ms, p95 0.8 ms, max 1.2 ms** against the
1,000 ms budget.

**Not manually tested.** The Vercel Blob path and the outbound email path
were not touched by this bolt and remain covered by automated test only, per
construction-protocol.md CP-4.

### Stage 5 — Test (`002-audit-reads`)

Artifact: `memory-bank/bolts/002-audit-reads/ddd-03-test-report.md`

**Three new test files, 28 new tests** (254 total, up from 226).

**Acceptance criteria** — `acceptance-read-criteria.test.ts`, 12 tests, one
per criterion of story `005`. The two that carry the most weight are
*"refuses a non-administrator without reaching the database"* (a repository
that throws if called, proving the check is a pre-query gate and not a query
filter) and *"walks the whole trail one page at a time, without repeating an
event"* (30 events over two pages, no repeats).

**Security** — `audit-read-security.test.ts`, 12 tests. Bolt 001 covered the
write path's injection safety; this covers the read path's three surfaces:
the filter values, the tampered cursor, and what a read may write into a
table that outlives the runtime log's one-hour window. The guarantee that
matters most — *no sensitive value reaches the read record* — is asserted
against a catalog-named sensitive value on the trail.

**Performance — the two measurements Stage 2 committed to, now measured
rather than assumed.** The design decided "no new index in this bolt" on the
grounds that a single report's trail is 50 rows and filtering 50 rows is not
a performance problem. That decision was explicitly a decision *to be
measured*.

| Query | p50 | p95 | Budget |
|---|---|---|---|
| Trail query (unfiltered) | 0.6 ms | **0.8 ms** | 1,000 ms |
| Filtered trail query | 0.5 ms | **0.8 ms** | 1,000 ms |
| Whole-trail read | 6.6 ms | **7.7 ms** | 1,000 ms |

**The decision holds.** The filtered query is as fast as the unfiltered one,
and its plan is still an index scan over `idx_audit_events_trail` with no
`Seq Scan` and no `Sort` — **no new index is needed**. The whole-trail read
uses `idx_audit_events_occurred`, exactly as Decision 9 predicted, and stays
130× inside the budget; it is 10× slower than the contextual read because it
scans 500,000 rows' worth of index rather than 50, which is expected for a
question that is genuinely different.

**One defect found and fixed.** The smoke script counted read records by a
**fixed** request id. The read log is append-only and its trigger permits no
deletion, so records accumulated across runs and the count grew every time —
**the script would have failed on every run after the first.** The request id
is now unique per run, and the script was run twice to confirm it is
repeatable. This was a real defect in the harness, found by running it
repeatedly rather than once.

**Three test failures, all errors in the new tests rather than in the code.**
Two were one-event trails where a cursor was needed (there is no next page
when there are fewer than 25 events), and one asserted the wrong thing about
cursor direction — a cursor means *older than*, so a future-dated cursor
correctly returns everything older. It was rewritten to assert the property
that actually matters: that a cursor taken from another parent's trail cannot
widen the result past the parent filter. **No production code was changed to
make a test pass.**

**Coverage:** **94.51% lines** / 92.52% branches / 100% functions, against the
80% floor. Every layer is above it. The one gap is `lib/`'s branch coverage
at 50% — the `ValidationError` class's optional custom-message path is
untested.

**Verification:** typecheck pass · lint pass · Prettier pass · **254/254
tests across 24 files** · build pass · `npm run smoke:audit` **11/11**, run
twice · dev server **HTTP 200** on port 3000, still running.

**Not manually tested.** The Vercel Blob path and the outbound email path
were not touched by this bolt and remain covered by automated test only, per
CP-4. The read path itself was exercised end to end against the real database
through the smoke script.

**Recommendation carried forward.** `AuditTrailService` is now the only place
that knows the read's failure rules. When Unit 007 builds the two audit page
routes, they must call the service rather than the reader — otherwise a read
would go unrecorded. This is the same class of risk ADR-6 addresses for the
write path.

### Bolt `002-audit-reads` — closed

Owner approved the Stage 5 test report. Bolt closed: 254/254 tests passing
across 24 files, 94.51% line coverage, one harness defect found and fixed by
running the smoke script twice (the read-log count used a fixed request id, so
it grew on every run and the script would have failed on every run after the
first).

**Verification re-run at close time, not carried over from Stage 5.** Typecheck
pass · lint pass · Prettier pass · 254/254 tests · coverage 94.51% lines /
92.52% branches / 100% functions · build pass · `npm run smoke:audit` 11/11, run
twice · dev server HTTP 200 on port 3000.

**The two measurements Stage 2 committed to, confirmed at close time** — 10,000
reports × 50 events = 500,000 rows: filtered trail query p50 0.6 ms / p95
0.7 ms, whole-trail read p50 5.8 ms / p95 7.0 ms, both far inside the 1,000 ms
budget. The filtered query's plan is still an index scan over
`idx_audit_events_trail` with no `Seq Scan` and no `Sort`, which confirms the
Stage 2 decision to add no new index in this bolt.

**Not manually tested.** The Vercel Blob path and the outbound email path were
not touched by this bolt and remain covered by automated test only, per
`construction-protocol.md` CP-4.

**Carried forward.** `AuditTrailService` is now the only place that knows the
read's failure rules. Unit 007's audit page routes must call the service
rather than the reader, or a read would go unrecorded.
