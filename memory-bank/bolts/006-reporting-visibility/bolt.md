---
id: 006-reporting-visibility
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 010-visibility-matrix-by-actor
created: 2026-10-23T13:07:30.000Z
started: 2026-10-28T18:10:00.000Z
completed: "2026-10-28T12:10:58Z"
current_stage: null
stages_completed:
  - name: model
    completed: 2026-10-28T18:10:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-28T18:55:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-28T19:05:00.000Z
    artifact: null
    note: Skipped by owner decision - no ADRs created; the three candidates remain recorded in the Stage 2 design
  - name: implement
    completed: 2026-10-28T19:40:00.000Z
    artifact: null
    note: 21 source files across domain/application/infrastructure, plus 163 tests in 3 suites; typecheck, lint, 978-test suite, coverage, build, and dev smoke test all green
  - name: test
    completed: 2026-10-28T20:10:00.000Z
    artifact: ddd-03-test-report.md
    note: 22 of 22 acceptance criteria met; 1005 tests in 61 files; 94.19% coverage overall (95.07% / 90% / 99.14% by layer); typecheck, lint, and build all green
requires_bolts:
  - 001-audit-core
  - 004-identity-core
enables_bolts:
  - 007-reporting-core
  - 013-claim-submit
  - 015-lost-response-submit
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 006-reporting-visibility

## Overview

The FR-39 visibility projection — the single implementation point for who may
see which fields of which report.

## Objective

Build the seven-role projection so that every read path in FindBack inherits the
same visibility rules, and so that unauthorized sensitive fields are never even
loaded.

## Stories Included

- **010-visibility-matrix-by-actor**: seven actor roles, exact field sets, no load-then-filter (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: ✅ 2026-10-28 → `ddd-01-domain-model.md`
- [x] **2. design**: ✅ 2026-10-28 → `ddd-02-technical-design.md`
- [x] **3. adr**: ✅ 2026-10-28 — **skipped** (owner decision), no ADRs created
- [x] **4. implement**: ✅ 2026-10-28 → source
- [x] **5. test**: ✅ 2026-10-28 → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): visibility is auditable at every read boundary
- **004-identity-core** (required): the projection is keyed on `ActorContext`

### Enables
- 007-reporting-core
- 013-claim-submit
- 015-lost-response-submit
- 020-web-profile

## Success Criteria

- [x] Each of the seven FR-39 roles receives exactly the field set the PRD grants
- [x] Sensitive fields are absent from the query, not removed from the result
- [x] Visibility never unlocks as a side effect of submitting a Claim or Recovery Response
- [x] Anonymous actors receive summary fields only
- [x] The projection is the only implementation; no unit reimplements it
- [x] Every role is covered by a test asserting the exact field set

## Notes

This bolt comes before report creation itself. The projection is a pure function
of actor and report, so it can be built and verified against fixtures, and every
later read path then inherits it rather than re-deciding visibility.

This is also the highest-complexity bolt in the plan: the matrix has seven
columns, several with conditional visibility, and a mistake here is a privacy
incident rather than a bug.

---

## Stage 1 - Domain Model

✅ 2026-10-28 → `ddd-01-domain-model.md`

The FR-39 projection modelled as a **pure function of viewer and report**: seven
`ProjectionColumn`s, a `VisibilityResolver`, and five projectors (`Report`,
`Claim`, `RecoveryResponse`, `Thread`, `AuditTrail`).

The load-bearing decision is the **reader contract**: the reader ports take the
*resolved column set*, not the viewer, so the query's `SELECT` list is derived
from the field set. That is what makes FR-39's "never loaded" structural
rather than a filtering promise.

The model also settled the actor-status question bolt 004 left open: a
`Pending` / `Rejected` / `Deactivated` actor resolves to
`Viewer.kind: 'anonymous'`, because it holds no member capability and
therefore has no matrix column at all.

**Four open questions** raised for Stage 2, each with a stated default.

## Stage 2 - Technical Design

✅ 2026-10-28 → `ddd-02-technical-design.md`

The pattern: **a pure resolver in the domain, a column-shaped query in the
infrastructure, joined by a port whose signature carries the authorisation
decision.**

1 - **`select-builder.ts`** — a pure function from a column set to a
`SELECT` list, living in `infrastructure/listings/`. It is read by **both**
the projector and the query builder, so the field set is one artefact and the
query and the projection cannot drift.

2 - **The "never loaded" test asserts on the generated SQL**, not on the
response. A response-level test would still pass if the value were loaded and
dropped — which is precisely what FR-39 forbids.

3 - **Participation is never permission.** The `ReportRelationship` carries
`hasClaim` / `hasRecoveryResponse` as *facts*, and the resolver reads them to
choose a **column**, never to decide what a column grants. The grant is a
constant of the matrix, so submitting a Claim cannot change it.

4 - **The `last_action_at` is read from `audit_events`**, not from a
denormalised column on `reports`. It needs no schema change, cannot drift
from the trail, and is already indexed. **Only the timestamp is selected** —
never the event row — because an event row carries the actor and the event
type, which is trail content (FR-32).

5 - **The member-facing status history is not the trail**, and the SQL
distinguishes them.

6 - **The relationship query uses `LEFT JOIN`**, so a report's existence never
depends on the viewer's relationships — an inner join would return zero rows
for an unrelated member, making "not related" indistinguishable from "not
exist".

**Three alternatives considered and rejected**: load-then-filter (the defect
FR-39 names); PostgreSQL row-level security (right tool for multi-tenant, but
FindBack is single-tenant, RLS omits rows silently, and it fights pooled
connections — noted as possible future hardening); column-level encryption
(wrong boundary — the rule is about relationships, not secrecy at rest).

**The `006` / `007` schema split** is the significant open item: `006` needs
`reports` / `claims` / `recovery_responses` to exist before its readers can be
integration-tested, but `007` is the bolt that creates them. **Proposed:**
`006` ships the domain and application layers complete and fully tested plus
the readers unit-tested against the SQL string; `007` creates the tables and
integration-tests the readers `006` left behind.

**Also recorded:** `coding-standards.md` claims an ESLint boundary rule that
**does not exist** in `eslint.config.mjs` — the dependency rule is currently
upheld by convention. Adding it is a project-wide change, not a bolt change.

## Stage 3 - ADR Analysis

✅ 2026-10-28 — **skipped by owner decision**. No ADRs created; the decision
index is unchanged (`total_decisions: 19`).

The three candidates the Stage 2 design surfaced are preserved in
`ddd-02-technical-design.md` § Stage 3 candidates and in the narrative above, so
the reasoning is not lost:

1 - **The `006` / `007` schema split** — a boundary decision between two bolts,
with a stated risk and a rejected alternative.
2 - **The first cross-module domain import** — a new dependency edge between two
bounded contexts that later bolts will copy.
3 - **The columns-not-viewer port contract** — the mechanism that makes
FR-39's "never loaded" structural.

**Owner confirmed the `006`/`007` schema split** on 2026-10-28: bolt `006`
ships the domain and application layers complete and fully tested, plus the
readers written and unit-tested against the generated SQL string; bolt `007`
creates the tables and integration-tests the readers `006` left behind. This
is now a settled decision rather than an open item.

## Stage 4 - Implement

✅ 2026-10-28 → source

Twenty-one new files across three layers, plus three test suites.

**`src/domain/listings/`** — twelve modules. The seven `ProjectionColumn`s,
the `Viewer` and its derivation from `ActorContext`, the `ReportRelationship`
(**`isReporter` is derived from the id equality, never supplied** — the roles
are derived, never client-asserted), the `VisibilityResolver` (the single
implementation point for the matrix), the `ReportFieldSet`, the five
projectors, and the projection aggregate.

**`src/application/listings/`** — the `ReportVisibilityService` and the five
reader ports. The service's sequence **is** the mechanism: resolve the viewer
→ refuse a non-member → load the relationship → resolve the columns → read
→ assemble. The columns are resolved *before* any content is read, so the
reads are shaped by them. A service that loaded first and resolved the
columns afterwards would be the load-then-filter defect FR-39 names.

**`src/infrastructure/listings/`** — the `select-builder` (pure, and the
one artefact read by both the projector and the query builder), the
`physical-columns` map, and the five Prisma readers.

**The scope sentinel is `null`, not a magic string.** `null` means "every
Claim / Recovery Response on this report"; an **empty array** means "none",
and the readers return early on an empty scope so the "never fall back to
all" rule is **structural** — there is no query that could accidentally widen
it.

### A defect the matrix test caught

The matrix test asserted the FR-38 summary set against the **select builder**,
and it failed: `reportSelectColumns` gated the summary columns behind
`grantsReportContent`, so the `anonymous` column selected **no summary fields**
at all. The domain's `reportFieldsFor` granted `summary` unconditionally — the
two disagreed, which is exactly the drift the shared-artefact design is meant
to make impossible.

**Fixed**: the summary columns are now unconditional in the select builder.
They are the base every column includes, and the content columns are what the
authenticated columns add on top of it. Had the select builder and the
projector been separate implementations, this would have shipped as a silent
privacy defect — the anonymous listing would have returned no summary.

### The physical column names

`coding-standards.md` § Naming conventions settles the schema contract:
**tables snake_case plural** (`reports`, `claims`, `recovery_responses`,
`thread_messages`, `audit_events`, `accounts`) and **Prisma models PascalCase
singular** (`Report`, `Claim`, `RecoveryResponse`, `ThreadMessage`,
`AuditEvent`, `Account`). The existing `AuditEvent` and `Account` tables
predate that convention and carry no `@@map`, so bolt `007` must add the
mappings to reach the physical names.

Every reader now maps its Prisma field names through
`infrastructure/listings/physical-columns.ts` — **one artefact, five
readers**. A raw `SELECT` does not go through Prisma's mapping layer, so the
mapping has to be stated explicitly, and stating it once makes the `SELECT`
list reviewable in a single place.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx eslint src/{domain,application,infrastructure}/listings` | ✅ clean |
| `npx vitest run` | ✅ **978 tests, 60 files** — the existing suite stayed green |
| `npx vitest run --coverage` | ✅ **92.41%** lines overall (floor: 80%) |
| `npm run build` | ✅ Next.js 16.4.3 production build succeeds |
| `npm run dev` smoke test | ✅ server up on `localhost:3000`; `/`, `/reset-password`, `/api/session` all HTTP 200 |

**163 new tests** across three suites:

- `src/domain/listings/visibility-matrix.test.ts` — **75 tests.** The FR-39
  matrix as a **fixture-driven table test**: one row per viewer category,
  asserting the exact field set, the exact Sensitive-field treatment, the
  domain predicates, and the **select builder's** `SELECT` list — read twice,
  against both consumers, so the two cannot drift.
- `src/infrastructure/listings/never-loaded.test.ts` — **24 tests.** The
  "never loaded" assertions, on the **generated SQL**. A Sensitive column's
  physical name must not appear in the query text for a viewer who may not
  see it. Also asserts the `accounts` join is issued only when a reporter
  field is granted, that the last-action subquery selects **only**
  `occurred_at` and never the event row, that the relationship query uses
  `LEFT JOIN` and carries no report content, that an empty scope issues **no
  query at all**, and that the trail is refused **before** the query.
- `src/application/listings/report-visibility-service.test.ts` — **28
  tests.** The service against port fakes that record the column set they
  were handed, plus the **"participation grants nothing"** regression from
  both sides: the participant's projection carries no Sensitive Field, and
  the reader was handed a column set that grants none.
- `src/domain/listings/visibility-domain.test.ts` — **36 tests.** The viewer,
  the relationship, and the projectors directly — including that an absent
  value leaves the key **off** the projection (never `null`), and that a row
  carrying more than was authorised still cannot widen the projection.

**Not integration-tested against a live database** — by the confirmed
`006`/`007` split, bolt `007` owns that. The readers are written against the
schema `007` creates; their row-mapping branches are the uncovered lines
behind the infrastructure layer's 79.48%.

**Not manually click-tested**: the bolt adds **no route** and no UI — the
projection has no page yet (bolt `009` consumes the service; bolt `012`
builds the web surface). The smoke test therefore verified that the app
still starts and serves, and that the projection resolves correctly end to
end from the running code.

## Stage 5 - Test

✅ 2026-10-28 → `ddd-03-test-report.md`

**All 22 acceptance criteria of story `010` are met.** The test report
validates each one against a named backing test.

### The row-mapping suite

The Stage 4 verification left the infrastructure layer at **79.48% lines**
— the readers' row-mapping branches were the gap, because a mapping cannot
be exercised without rows. The new
`src/infrastructure/listings/row-mapping.test.ts` (**20 tests**) closes it.

The distinction under test is **`undefined` versus `null`**, and it is the
one the whole projection rests on. A reader maps the columns it *selected*:
a column that was **not selected** is absent from the row — `undefined` —
and the reader must leave the key **off** the result; a column that was
**selected but empty** is `null`, and the reader carries the `null` through.
Conflating the two would mean a selected-but-empty column silently
disappears, and the projection could no longer tell "this field exists and
is empty" from "this field does not apply to you".

The file also asserts the **parameterisation** property directly: a report
id of `report-1'; DROP TABLE reports; --` appears in the query's
**bindings**, not in its **text**.

### Two criteria that had no test

Stage 4's suites covered twenty of the twenty-two criteria. The two
remaining ones were not merely untested — they were **unassertable as
written**, and needed the criteria re-read to see what they actually
require.

**Criterion 21** — "no single member is simultaneously the Found-report
owner and the Lost-report owner of the same report". There was a *comment*
in `projection-column.ts` saying so, but no test. The new block asserts it
**exhaustively**: both report types × all four participation combinations ×
both reporter states, checking that the two owner columns are never held
together. The split is structural — `resolveColumns` pushes **one** owner
column, chosen by the report type — so there is no code path that could
hand a viewer both.

**Criterion 22** — "authorization is enforced at the API layer and
client-side hiding is not sufficient". The API layer is bolt `009`'s, but
the **enforcement point** is this bolt's, and the criterion is satisfied
structurally rather than by a route that does not yet exist. Four
properties are asserted: the reporter role is derived from the **id
equality** and never from a supplied flag; participation is derived from
the **record ids** and never from a supplied flag; the `Viewer` is built
from the `ActorContext` and carries no client-settable field; and the
unauthorised Sensitive column is **absent from the `SELECT`**. The last is
the decisive one — a hidden field that was loaded is still disclosed to
anyone who reads the response, so the route will have nothing to bypass.

### One assertion corrected during the stage

The first draft of criterion 22's test asserted that **no** unauthorised
column receives `whereFoundExactPlace`. It failed — and the test was wrong,
not the code: the **recovery responder** legitimately receives it, because it
is the responder's *own* response evidence. The assertion was corrected to
check each column against the Sensitive set **it may not receive**, with the
Claim evidence and the Response evidence checked separately, since each
belongs to a different record. The failure is worth recording: the naive
assertion would have failed the build, but it would have failed for the
wrong reason, and "fixing" it by weakening the assertion would have left
the criterion unverified.

### Verification

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ clean |
| `npx eslint src/{domain,application,infrastructure}/listings` | ✅ clean |
| `npx vitest run` | ✅ **1005 tests, 61 files** — the existing suite stayed green |
| `npx vitest run --coverage` | ✅ **94.19% lines** overall (floor: 80%) |
| `npm run build` | ✅ Next.js 16.4.3 production build succeeds |

**190 tests belong to this bolt**, in five suites: the matrix (82), the
domain (36), the service (28), the never-loaded (24), and the row-mapping
(20).

**Coverage by layer**, against the 80% floor:

| Layer | Lines | Branches | Functions |
|-------|-------|----------|-----------|
| `src/domain/listings` | 95.07% | 95.39% | 87.17% |
| `src/application/listings` | 90% | 92.3% | 100% |
| `src/infrastructure/listings` | **99.14%** | 97.61% | 100% |
| **All files** | **94.19%** | 91.52% | 96.53% |

The infrastructure layer rose from **79.48% to 99.14%** on the strength of
the row-mapping suite; all five readers are now at 100% lines.
`src/application/listings/ports` reads 0% because those files are
**type-only interfaces** with no executable statements — an artefact of the
coverage tool counting an interface file, not a gap in the tests.

**Not integration-tested against a live database** — by the confirmed
`006`/`007` split. **Not performance-tested** — the bolt adds no route and
no UI, so there is nothing to measure end to end; a benchmark against a
synthetic fixture would assert a number the real workload never produces.

### One open High issue, owned by bolt `007`

The `AuditEvent` and `Account` tables carry no `@@map`, so their physical
names are `"AuditEvent"` and `"Account"` — not the snake_case plural the
standards name. Bolt `007` must add the annotations. This is recorded in
the construction log for `007` and is not a defect **inside** this bolt.