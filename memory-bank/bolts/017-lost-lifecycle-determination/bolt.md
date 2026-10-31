---
id: 017-lost-lifecycle-determination
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 003-owner-provisional-selection
  - 004-owner-determination-admin-records
  - 005-lost-report-lifecycle
created: 2026-10-23T13:13:00Z
started: 2026-10-30T08:00:00Z
completed: 2026-10-30T09:00:00Z
current_stage: test
stages_completed: [implement, test]

requires_bolts:
  - 001-audit-core
  - 003-audit-lost-side-events
  - 008-reporting-lifecycle
  - 011-lost-status-model
  - 015-lost-response-submit
enables_bolts:
  - 018-lost-threads
  - 019-returns-closeout
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 017-lost-lifecycle-determination

## Overview

The heart of the Lost-side workflow — the owner checks the item, an administrator records it.

## Objective

Deliver provisional selection, the owner-determines / administrator-records split
with both actors preserved in audit, and the Lost report lifecycle up to its
terminal threshold.

## Stories Included

- **003-owner-provisional-selection**: select one candidate; siblings stay standby (Must)
- **004-owner-determination-admin-records**: match or not-match, `determined_by` and `recorded_by` distinct (Must)
- **005-lost-report-lifecycle**: Open → Verification Pending → Returned or Closed (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [~] **1. model**: Skipped by owner direction
- [~] **2. design**: Skipped by owner direction
- [x] **3. implement**: Complete → source
- [x] **4. test**: Complete → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): every determination is audited
- **003-audit-lost-side-events** (required): events 18/19 need both actor fields
- **008-reporting-lifecycle** (required): withdrawal resolves the report to `Closed`
- **011-lost-status-model** (required): the statuses being transitioned
- **015-lost-response-submit** (required): the `Submitted` responses being selected

### Enables
- 018-lost-threads
- 019-returns-closeout
- 021-web-admin

## Success Criteria

- [x] Selecting one response moves it to `Selected for Verification` and the report to `Verification Pending`
- [x] Siblings remain `Submitted` and display as `Submitted — Standby`
- [x] Selection never closes or rejects a sibling
- [x] Concurrent selections resolve to exactly one commit
- [x] `Match Confirmed` is non-terminal and the report stays `Verification Pending`
- [x] `Not a Match` is terminal and returns the report to `Open` so another candidate can be selected
- [x] Events 18/19 record `determined_by` and `recorded_by` as two separate values
- [x] Withdrawal reaches `Closed`, never `Returned`

## Notes

If one bolt in this plan had to be right on the first attempt, it is this one.
The owner-determines / administrator-records split is the product's most
distinctive integrity property, and collapsing it into a single actor field would
make the audit trail unable to answer who actually decided.

## Outcome

The two actors are kept apart at every layer, and the separation is structural
rather than conventional:

- The **route** resolves the *recorder* from the session and reads the *maker*
  from the body — a client can never assert its own role.
- The **service** compares the maker against the report's owner read from the
  database, so a forged maker is refused at the boundary that owns the truth.
- The **event** carries the two in two separate columns —
  `determinedByUserId` and `recordedByAdministratorId`.

**The atomic-selection rule is enforced at the data layer, not only in the
application.** The migration adds the partial unique index
`uq_recovery_responses_one_selected_per_report`, scoped to exactly the one
status `Selected for Verification`, so the siblings are not forbidden — many
`Submitted` responses may coexist, and only one may hold the slot. The
application check is the *explanation* of the rule; the index is the rule. The
driver's `P2002` is translated into `ConcurrentSelectionError`, so a race is a
business outcome and not a 500.

**`Match Confirmed` non-terminality was made structural.** The report's status
is written *only* on the `not_a_match` path, so a future edit cannot
accidentally move the report on a confirmed match. It is proven three ways:
the domain transition table (whose `MatchConfirmed` cause is `Unchanged`, not
`Moved`), the service's exact call sequence (which contains no report write on
the confirmed path), and the live-database adapter suite.

**One story criterion was deliberately not implemented.** Story `003`'s
"the previous selection reverts to `Submitted`" is not what the PRD says: FR-43
permits a new selection only after a `Not a Match`. The PRD wins over the
story, so the criterion is recorded below as not implemented rather than
quietly satisfied.

**Verification.** 251 tests across 16 suites pass; `tsc --noEmit` exits 0;
eslint exits 0 on every changed file; scoped coverage is 97.4% statements /
89.1% branches / 97.4% functions against the project's 80% floor. The route
layer is excluded from coverage by `vitest.config.ts` (`src/app/**`) and is
verified by its own 25-test suite. The wider listings layer —
`src/infrastructure/listings`, `src/application/listings`, `src/domain/recovery` —
is **994 passing across 55 files**, 0 fail. The full suite was not run, by owner
direction.

## Acceptance Criteria Not Implemented

- Story `003`, "the previous selection reverts to `Submitted` and the new one
  becomes `Selected for Verification`". FR-43 permits a new selection only
  after a `Not a Match`; the PRD wins over the story. The sibling that held the
  slot keeps its `Not a Match` status, and the report returns to `Open` so a
  new candidate may be selected.