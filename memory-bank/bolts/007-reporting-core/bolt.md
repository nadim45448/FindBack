---
id: 007-reporting-core
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 001-create-lost-item-report
  - 002-create-found-item-report
  - 003-validate-report-field-set
created: 2026-10-23T13:08:00Z
started: 2026-10-28T20:20:00Z
completed: 2026-10-29T05:52:00Z
current_stage: null
stages_completed:
  - name: model
    completed: 2026-10-28T20:35:00.000Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-28T21:05:00.000Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-28T21:20:00.000Z
    artifact: adr-20-campus-area-configuration-mechanism.md
    note: One ADR created and ratified by the owner — ADR-20 closes OQ-1 (campus-area configuration mechanism)
  - name: implement
    completed: 2026-10-28T22:05:00.000Z
    note: The domain, application, infrastructure, and route layers are written. The stage also repaired three defects in bolt 006's visibility readers that the live-database integration test exposed — wrong physical column names, a column that never existed, and a missing comma before every scalar subquery.
  - name: test
    completed: 2026-10-29T05:52:00.000Z
    artifact: ddd-03-test-report.md
    note: The recorded verification command `npm run verify` passes — typecheck, lint, and build are clean and the suite is 71 files / 1,175 tests, all green. Coverage is 93% of lines against an 80% floor. All six of the bolt's success criteria are met, and the bolt's own tests are 15 files / 360 tests against a live database.

requires_bolts:
  - 001-audit-core
  - 004-identity-core
  - 006-reporting-visibility
enables_bolts:
  - 008-reporting-lifecycle
  - 009-reporting-search
  - 013-claim-submit
  - 015-lost-response-submit
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 007-reporting-core

## Overview

The Report aggregate and its authoritative FR-8 field set.

## Objective

Create Lost and Found reports with the exact field set and enforced date bounds,
so that every later unit has a well-formed report to attach to.

## Stories Included

- **001-create-lost-item-report**: file a Lost report with the FR-8 field set (Must)
- **002-create-found-item-report**: file a Found report with the FR-8 field set (Must)
- **003-validate-report-field-set**: date bounds, campus area enum, required fields (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: ✅ 2026-10-28 → `ddd-01-domain-model.md`
- [x] **2. design**: ✅ 2026-10-28 → `ddd-02-technical-design.md`
- [x] **3. adr**: ✅ 2026-10-28 → `adr-20-campus-area-configuration-mechanism.md`
- [x] **4. implement**: ✅ 2026-10-28 → source
- [x] **5. test**: ✅ 2026-10-29 → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): creation is audited
- **004-identity-core** (required): the reporter is the actor
- **006-reporting-visibility** (required): campus areas and field visibility are defined there

### Enables
- 008-reporting-lifecycle
- 009-reporting-search
- 013-claim-submit
- 015-lost-response-submit

## Success Criteria

- [x] Both report types are created with the exact FR-8 field set
- [x] Lost `date lost` is at most 365 days old and not in the future
- [x] Found `date` is at most 30 days old and not in the future
- [x] Campus area is drawn from the per-deployment enum
- [x] New reports are `Open` and attributed to the acting member
- [x] A `Pending` account cannot create a report

## Notes

The 365-day bound is the current product rule and is explicitly not relaxable.
Encoding it as a constant with a named origin makes a future change deliberate
rather than accidental.

---

## Stage 1 - Domain Model

✅ 2026-10-28 → `ddd-01-domain-model.md`

The Report aggregate modelled with the **closed FR-8 field set** as an
invariant rather than a convention — eight fields, no more. That closure is
what makes FR-14 search, FR-37 sensitivity, and FR-39 projection composable:
each of them reasons over a known, closed set of fields.

**One entity with a `type` discriminator**, not two. The two types share the
field set, the category enum, the validator, the status machine's shape, and
the FR-39 projection; they differ by a type label and one date constant. Two
entities would mean two validators, two aggregate roots, two status machines,
and two FR-39 matrix columns — for a difference of one date constant.

**Nine value objects**, because the length bounds are *inclusive at both
ends* and a bare string with a length check somewhere else is how a bound
gets re-implemented slightly differently on the edit path.

**Ten aggregate invariants.** The load-bearing one is that the **image is
stored before the report row is written**, which shapes the aggregate's
boundary: the image is part of the FR-8 field set so it is part of the
Report, but the blob lives in another system, so the resolution is
*ordering, not nesting*. The consequence is that the write is
**compensating, not atomic** — and the design says so, rather than claiming
a cross-system atomicity that does not exist.

The `ReportFieldValidator` is a **pure function** and the **only** path to a
Report, so creation and reporter edit share one implementation of the bounds
by construction rather than by discipline.

The model also records what the bolt does **not** model: the status machine,
edit/delete/withdraw, listings/search, the FR-39 projection, and image
validation.

**Five open questions carried to Stage 2**, each with a stated default, so
Stage 2 is never blocked.

## Stage 2 - Technical Design

✅ 2026-10-28 → `ddd-02-technical-design.md`

The mechanism is the **write-side analogue of bolt `006`'s "never loaded"**:
the route parses the request into a `ReportDraft` with a **fixed shape and no
index signature**, and the parser names each field it reads — so an unknown
key in the body is **dropped at the parse boundary** and cannot become a
stored column. The FR-8 closed field set is therefore closed **by
construction**, not by review.

The `reports` table's column list is asserted against bolt `006`'s
`PHYSICAL.report` in an integration test. That is the **contract check** that
keeps the two bolts honest — and it is the test that would catch a schema
drift before bolt `009` reads from a mismatched table.

### The `@@map` obligation bolt `006` left open — settled and in scope

`AuditEvent` and `Account` are renamed to `audit_events` and `accounts` in
this bolt's migration, because bolt `006`'s raw `SELECT`s already target
those physical names. Four other unmapped tables are mapped in the same
migration for the same reason.

### The compensating write, designed precisely

Upload the blob → write the row and the audit event in one transaction → on
failure, roll back and **then** delete the blob. The delete is issued after
the rollback, not inside it: a blob delete inside a transaction that is about
to roll back would be undone by that rollback and orphan the blob anyway. A
failed compensating delete is recorded for retry through **image-handling
§5's existing mechanism**, so there is one retry path in the system, not two.

### Four decisions worth naming

1 - **The create response carries no stored field.** The creator's view of
   their own report is a *read* concern governed by FR-39 and owned by bolt
   `009`. Returning the fields from the create route would create a second,
   ungoverned read path — the same "one implementation point per decision"
   discipline bolt `006` enforced.

2 - **The `date` column is `date`, not `timestamptz`.** The domain compares
   by calendar day, so a timestamp would make "exactly 365 days ago" depend
   on the time of day.

3 - **The keyword search index excludes the Sensitive Fields.** It is GIN over
   a `'simple'` `tsvector` of `name || description`. A search index over a
   Sensitive Field is a **disclosure surface** — it would let an
   unauthorised member infer that a word appears in a field they may not
   read.

4 - **`campus_area` has no foreign key.** The membership rule is a
   *validation* rule, not a *referential* one — a deactivated area must not
   rewrite existing reports — and an FK cannot express that. The campus-area
   list is a **table** rather than a config file, because the reports already
   refer to it.

### One safety decision, and one owner item

A failure to read the campus-area set is a **503 refusal**, never a
permissive default. With an empty set every area is rejected; with a
fallback every area is accepted. A fail-open would store a report with an
unvalidated campus area.

**For the owner:** the database time zone must be set to UTC explicitly. The
validator's "today" is UTC and `CURRENT_DATE` is the session's time zone — a
session ahead of UTC would reject a report dated today as tomorrow.

### Open questions settled

All five Stage 1 open questions are settled: the campus-area list is a
table seeded per deployment; the orphan-image delete reuses image-handling
§5's retry path; `type` and `status` are text columns with CHECK
constraints rather than database enums; the indexes are FR-14's, created with
the table; and `updatedAt` is created now, non-null.

## Stage 3 - ADR Analysis

✅ 2026-10-28 → `adr-20-campus-area-configuration-mechanism.md`

**One ADR created, and it was ratified by the owner on 2026-10-28.**

The design's decisions were audited against the 19 existing ADRs and the
approved standards. Most of what the design makes is **already settled** and
was therefore recorded as a decision rather than an ADR: the compensating
write is dictated by `image-handling.md` §5 and ADR-2; the search index's
exclusion of the Sensitive Fields is mandated by FR-37/FR-39; the `@@map`
renames are required by `coding-standards.md` § Naming conventions; and the
one-entity-with-a-type-discriminator has no plausible alternative to weigh.

**One decision was genuinely new, and it is one the bolt had no authority to
make alone.** OQ-1 — the campus-area configuration mechanism — is recorded in
`requirements.md` as **Architecture-owned** and **open**, and story 003 puts
it explicitly out of scope. Stage 1 correctly reserved it. Stage 2 settled it
anyway, because the bolt could not build the validator without a set to
validate against and could not proceed without a default.

The ADR records the decision — a seeded `campus_areas` table, with
`reports.campus_area` as plain `text` and **no foreign key** — and it was
raised as **`proposed`** rather than asserted, because OQ-1 was
Architecture-owned. **The owner ratified it on 2026-10-28**, so the ADR's
status is **`accepted`** and OQ-1 is **closed** in both `requirements.md`
and the inception log.

**The no-foreign-key half is the part a schema reviewer would otherwise
"fix".** Story 003's edge case requires that a deactivated area not rewrite
existing reports, which a FK cannot express: `active = false` leaves the row
present, so the FK is satisfied while saying nothing about the rule. A FK
would also make a label rename a data migration touching every report that
used the area, and would force an `ON DELETE` decision where the requirement
is that the report keeps its value regardless. The membership rule is a
**validation** rule, and the validator is the one place that can see the
whole active set — the database cannot, because "the deployment's active
set" is a query against the same table.

**The seed is empty by default.** The migration seeds no rows, because the
areas are the deployment's content; a migration carrying area names would be
inventing product content the PRD does not name.

**Two cross-bolt side effects are flagged for Stage 4**, not given ADRs of
their own: the `@@map` renames reach tables this bolt does not otherwise own
(`AuditEvent`, `Account`, and four more), and the database time zone must be
set to UTC explicitly.