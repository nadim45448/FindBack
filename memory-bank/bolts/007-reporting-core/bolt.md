---
id: 007-reporting-core
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 001-create-lost-item-report
  - 002-create-found-item-report
  - 003-validate-report-field-set
created: 2026-10-23T13:08:00Z
started: null
completed: null
current_stage: null
stages_completed: []

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

- [ ] **1. model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. implement**: Pending → source
- [ ] **4. test**: Pending → `ddd-03-test-report.md`

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

- [ ] Both report types are created with the exact FR-8 field set
- [ ] Lost `date lost` is at most 365 days old and not in the future
- [ ] Found `date` is at most 30 days old and not in the future
- [ ] Campus area is drawn from the per-deployment enum
- [ ] New reports are `Open` and attributed to the acting member
- [ ] A `Pending` account cannot create a report

## Notes

The 365-day bound is the current product rule and is explicitly not relaxable.
Encoding it as a constant with a named origin makes a future change deliberate
rather than accidental.