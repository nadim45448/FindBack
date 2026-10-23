---
id: 017-lost-lifecycle-determination
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 003-owner-provisional-selection
  - 004-owner-determination-admin-records
  - 005-lost-report-lifecycle
created: 2026-10-23T13:13:00Z
started: null
completed: null
current_stage: null
stages_completed: []

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

- [ ] **1. model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. implement**: Pending → source
- [ ] **4. test**: Pending → `ddd-03-test-report.md`

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

- [ ] Selecting one response moves it to `Selected for Verification` and the report to `Verification Pending`
- [ ] Siblings remain `Submitted` and display as `Submitted — Standby`
- [ ] Selection never closes or rejects a sibling
- [ ] Concurrent selections resolve to exactly one commit
- [ ] `Match Confirmed` is non-terminal and the report stays `Verification Pending`
- [ ] `Not a Match` is terminal and returns the report to `Open` so another candidate can be selected
- [ ] Events 18/19 record `determined_by` and `recorded_by` as two separate values
- [ ] Withdrawal reaches `Closed`, never `Returned`

## Notes

If one bolt in this plan had to be right on the first attempt, it is this one.
The owner-determines / administrator-records split is the product's most
distinctive integrity property, and collapsing it into a single actor field would
make the audit trail unable to answer who actually decided.