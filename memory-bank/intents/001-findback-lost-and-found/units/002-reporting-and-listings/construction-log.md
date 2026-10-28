---
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
created: 2026-10-28T18:10:00Z
last_updated: 2026-10-28T20:10:00Z
---

# Construction Log: reporting-and-listings

## Original Plan

**From Inception**: 5 bolts planned
**Planned Date**: 2026-10-23

| Bolt ID | Stories | Type |
|---|---|---|
| `006-reporting-visibility` | 010-visibility-matrix-by-actor | DDD |
| `007-reporting-core` | 001-create-lost-item-report, 002-create-found-item-report, 003-validate-report-field-set | DDD |
| `008-reporting-lifecycle` | 004-edit-own-report, 005-delete-own-report, 006-withdraw-own-report, 012-administrator-edit-report | DDD |
| `009-reporting-search` | 007-public-summary-listing, 008-authenticated-detail-view, 009-search-and-filter, 011-member-facing-view-partition | DDD |
| `010-reporting-images` | 013-attach-image-to-report | DDD |

## Replanning History

| Date | Action | Change | Reason | Approved |
|---|---|---|---|---|

## Current Bolt Structure

| Bolt ID | Stories | Status | Changed |
|---|---|---|---|
| `006-reporting-visibility` | 1 | ⏳ in-progress | 2026-10-28 — stages 1–5 complete, awaiting bolt completion |
| `007-reporting-core` | 3 | [ ] planned | - |
| `008-reporting-lifecycle` | 4 | [ ] planned | - |
| `009-reporting-search` | 4 | [ ] planned | - |
| `010-reporting-images` | 1 | [ ] planned | - |

## Execution History

| Date | Bolt | Event | Details |
|---|---|---|---|
| 2026-10-28 | `006-reporting-visibility` | started | Stage 1: Domain Model |
| 2026-10-28 | `006-reporting-visibility` | stage-complete | model → design (pending owner review). The FR-39 projection is modelled as a **pure function of viewer and report**, with seven `ProjectionColumn`s, five projectors (`Report`, `Claim`, `RecoveryResponse`, `Thread`, `AuditTrail`), and a `VisibilityResolver`. The load-bearing decision is the **reader contract**: the reader ports take the *resolved column set*, not the viewer, so the query's `SELECT` list is derived from the field set — which is how FR-39's "never loaded" is made structural rather than filtered. The model also settles the actor-status question bolt 004 left open: a `Pending`/`Rejected`/`Deactivated` actor resolves to `Viewer.kind: 'anonymous'`, because it holds no member capability and therefore has no matrix column. **Four open questions** raised for Stage 2, each with a stated default: anonymous detail refusal shape, whether the projection decides existence as well as fields, administrator-as-single-column vs union, and the relationship query's shape |
| 2026-10-28 | `006-reporting-visibility` | stage-complete | design → adr (pending owner review). The design's mechanism is a **pure resolver in the domain, a column-shaped query in the infrastructure, and a port whose signature carries the authorisation decision**. `select-builder.ts` is a pure function from a column set to a `SELECT` list, read by **both** the projector and the query builder so the field set is one artefact and the two cannot drift. The "never loaded" property is tested by asserting on the **generated SQL string**, not on the response — a response test would still pass if the value were loaded and dropped, which is what FR-39 forbids. **Participation is never permission:** the relationship carries `hasClaim`/`hasRecoveryResponse` as facts, and the resolver reads them to choose a *column*, never to decide what a column grants. The member-facing "last-action timestamp" is read from `audit_events` — no schema change, no drift from the trail, already indexed — and **only the timestamp is selected**, never the event row, because an event row carries the actor and type, which is trail content (FR-32). The relationship query uses `LEFT JOIN` so a report's existence never depends on the viewer's relationships. **Three alternatives rejected:** load-then-filter (the defect FR-39 names), PostgreSQL RLS (right tool for multi-tenant; FindBack is single-tenant, RLS omits rows silently, and it fights pooled connections), column-level encryption (wrong boundary — the rule is about relationships). **All four Stage 1 open questions settled:** an anonymous detail request is refused with a `NotFoundError`/404 (the login redirect is Unit 007's); the projection decides **fields only**, existence is bolt 009's FR-49 concern; the administrator is **one column**; the relationship is a **separate indexed query**. **One significant open item raised for owner confirmation:** the `006`/`007` schema split — `006` needs the tables to integration-test its readers, but `007` is the bolt that creates them. **Also recorded:** `coding-standards.md` claims an ESLint boundary rule that **does not exist** in `eslint.config.mjs`; the dependency rule is upheld by convention today, and adding the rule is a project-wide change rather than a bolt change |
| 2026-10-28 | `006-reporting-visibility` | decision | Owner **skipped Stage 3 (ADR Analysis)** — no ADRs created, the decision index is unchanged at 19 decisions. The three candidates the design surfaced (the `006`/`007` schema split, the first cross-module domain import, and the columns-not-viewer port contract) remain recorded in the Stage 2 design and the bolt narrative, so the reasoning is not lost. Owner also **confirmed the `006`/`007` schema split**: bolt `006` ships the domain and application layers complete and fully tested, plus the readers written and unit-tested against the generated SQL string; bolt `007` creates the tables and integration-tests the readers `006` left behind. The item moves from open to settled |

| 2026-10-28 | `006-reporting-visibility` | stage-complete | implement → test (pending owner review). Twenty-one source files across three layers plus **163 tests in three suites**. The domain holds the seven `ProjectionColumn`s, the `Viewer` (derived from `ActorContext`, so a `Pending`/`Rejected`/`Deactivated` actor resolves to `anonymous` — bolt 004's open item 1 settled), the `ReportRelationship` (**`isReporter` is derived from the id equality, never supplied** — roles are derived, never client-asserted), the `VisibilityResolver` as the single implementation point, the `ReportFieldSet`, and five projectors. The application layer holds the `ReportVisibilityService` and five reader ports; the service's **sequence is the mechanism** — the columns are resolved *before* any content is read, so the reads are shaped by them. The infrastructure layer holds the pure `select-builder`, the `physical-columns` map (**one artefact, five readers** — a raw `SELECT` bypasses Prisma's mapping layer, so the mapping is stated once), and the five Prisma readers. The scope sentinel is `null` ("every record on this report"), never a magic string; an empty array means "none" and the readers return early, so the "never fall back to all" rule is **structural**. **The matrix test caught a real defect:** `reportSelectColumns` gated the summary columns behind `grantsReportContent`, so the `anonymous` column selected **no summary fields** at all — while the domain's `reportFieldsFor` granted `summary` unconditionally. The two disagreed, which is exactly the drift the shared-artefact design exists to prevent; had they been separate implementations this would have shipped as a silent privacy defect, with the anonymous listing returning no summary. Fixed: the summary columns are now unconditional. **The schema contract was settled against the standards, not assumed:** `coding-standards.md` § Naming conventions says tables are **snake_case plural** and Prisma models **PascalCase singular**, so the physical names are `reports`/`claims`/`recovery_responses`/`thread_messages`/`audit_events`/`accounts`, and the existing `AuditEvent`/`Account` tables — which carry no `@@map` — need that mapping added in bolt `007`. **Verification:** typecheck clean; eslint clean; **978 tests across 60 files** green (the existing suite stayed green); coverage **92.41%** against the 80% floor; the Next.js production build succeeds; and the dev server smoke test passed with `/`, `/reset-password`, and `/api/session` all HTTP 200. **Not integration-tested against a live database**, by the confirmed `006`/`007` split — the readers are written against the schema `007` creates, and their row-mapping branches are the uncovered lines behind the infrastructure layer's 79.48%. **Not manually click-tested**: the bolt adds no route and no UI, since the projection has no page yet (bolt `009` consumes the service, bolt `012` builds the web surface) |
| 2026-10-28 | `006-reporting-visibility` | stage-complete | implement → test (pending owner review). The Stage 5 test report validates **all 22 acceptance criteria** of story `010`, each against a named backing test. **190 tests** across five suites: the matrix (82), the domain (36), the service (28), the never-loaded (24), and the **new row-mapping suite (20)** — which closes the Stage 4 coverage gap, taking the infrastructure layer from **79.48% to 99.14%** and all five readers to 100% lines. The row-mapping suite asserts the **`undefined` versus `null`** distinction the projection rests on: a column that was **not selected** is absent from the row and the key is left **off** the result, while a column that was **selected but empty** carries its `null` through — so "this field exists and is empty" stays distinguishable from "this field does not apply to you". It also asserts the **parameterisation** property directly: a report id of `report-1'; DROP TABLE reports; --` appears in the query's **bindings**, not its **text**. **Two criteria had no test** and needed the criteria re-read to see what they actually require. Criterion 21 ("no member is simultaneously the Found-report owner and the Lost-report owner") had only a *comment* asserting it; the new test asserts it **exhaustively** — both report types × all four participation combinations × both reporter states — because the split is structural (`resolveColumns` pushes **one** owner column, chosen by the report type), so there is no code path that could hand a viewer both. Criterion 22 ("authorization is enforced at the API layer and client-side hiding is not sufficient") names an API layer that does not yet exist, but the **enforcement point** is this bolt's and the criterion is satisfied structurally: the reporter role is derived from the **id equality** and never from a supplied flag; participation is derived from the **record ids** and never from a supplied flag; the `Viewer` is built from the `ActorContext` and carries no client-settable field; and the unauthorised Sensitive column is **absent from the `SELECT`** — a hidden field that was loaded is still disclosed to anyone who reads the response, so the route will have nothing to bypass. **One assertion corrected during the stage:** the first draft of criterion 22 asserted that *no* unauthorised column receives `whereFoundExactPlace`, and it failed — the **recovery responder** legitimately receives it, because it is the responder's own response evidence. The assertion was corrected to check each column against the Sensitive set **it may not receive**, with the Claim evidence and the Response evidence checked separately. The failure is worth recording: the naive assertion would have failed the build for the wrong reason, and "fixing" it by weakening the assertion would have left the criterion unverified. **Verification:** typecheck clean; eslint clean; **1005 tests across 61 files** green (the existing suite stayed green); coverage **94.19%** against the 80% floor (domain 95.07%, application 90%, infrastructure 99.14%); the Next.js production build succeeds. **Not integration-tested against a live database**, by the confirmed `006`/`007` split. **Not performance-tested** — the bolt adds no route and no UI, so there is nothing to measure end to end, and a benchmark against a synthetic fixture would assert a number the real workload never produces. **One open High issue, owned by bolt `007`:** the `AuditEvent` and `Account` tables carry no `@@map`, so their physical names are `"AuditEvent"` and `"Account"` rather than the snake_case plural the standards name — bolt `007` must add the annotations |

## Execution Summary

| Metric | Value |
|---|---|
| Original bolts planned | 5 |
| Current bolt count | 5 |
| Bolts completed | 1 |
| Bolts in progress | 0 |
| Bolts remaining | 4 |
| Replanning events | 0 |

## Notes

### Why this bolt goes first (2026-10-28)

`006-reporting-visibility` is the unit's load-bearing piece and the plan's first
bolt for it. The visibility projection is a **pure function of actor and report**,
so it can be built and verified against fixtures before any report exists —
and every later read path then inherits it rather than re-deciding visibility
for itself.

It is also the **first consumer of the `ActorContext`** that bolts `004` and
`005` produced. That makes the FR-39 actor-capability rules load-bearing here:
the `Pending` / `Rejected` / `Deactivated` distinctions decide *who may be
counted as a viewer at all*, which is upstream of every column in the matrix.

**Carried-in owner items** (from bolts `004`/`005`, none blocking this bolt):

1 - **Bolt 004 Open item 1** — the FR-2 `Pending` restriction. The
`ActorContext` resolves `Pending` to `capability: 'none'`, so a `Pending`
account has no member capability. This bolt must treat a non-member actor as
**anonymous for projection purposes**, not as a member with reduced rights.

2 - **Bolt 005's fragment-token reset link** — the `/reset-password` page is
Unit 007's and must be built against the **fragment** contract
(`{APP_BASE_URL}/reset-password#token=…`), not the query string.

3 - **Bolt 005's FR-51 timing and anti-enumeration rules** — inherited
unchanged; the projection adds no enumeration surface.

### The physical schema contract, for bolt `007` (2026-10-28)

`coding-standards.md` § Naming conventions settles the physical names, and
bolt `007` must satisfy them:

| Thing | Convention | Physical name |
|---|---|---|
| Database tables | snake_case, plural | `reports`, `claims`, `recovery_responses`, `thread_messages`, `audit_events`, `accounts` |
| Prisma models | PascalCase singular | `Report`, `Claim`, `RecoveryResponse`, `ThreadMessage`, `AuditEvent`, `Account` |

**The existing `AuditEvent` and `Account` tables predate the convention** and
carry no `@@map`, so their physical names are currently `"AuditEvent"` and
`"Account"`. Bolt `007` must add the `@@map` annotations so the raw SQL the
visibility readers issue reaches the tables the standards name.

The readers' column names are listed in one place —
`src/infrastructure/listings/physical-columns.ts` — so `007` has an explicit
contract to satisfy rather than having to infer it from the query builders.
The `reports` column set itself is the Stage 2 design's § The report schema
this bolt assumes.

**One item for the owner, unchanged from Stage 2:** `coding-standards.md`
claims an ESLint boundary rule that does not exist in `eslint.config.mjs`. The
dependency rule is upheld by convention today. Adding it is a project-wide
change rather than a bolt change.
