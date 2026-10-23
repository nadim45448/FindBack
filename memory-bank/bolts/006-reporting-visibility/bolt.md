---
id: 006-reporting-visibility
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 010-visibility-matrix-by-actor
created: 2026-10-23T13:07:30Z
started: null
completed: null
current_stage: null
stages_completed: []

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

- [ ] **1. model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. implement**: Pending → source
- [ ] **4. test**: Pending → `ddd-03-test-report.md`

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

- [ ] Each of the seven FR-39 roles receives exactly the field set the PRD grants
- [ ] Sensitive fields are absent from the query, not removed from the result
- [ ] Visibility never unlocks as a side effect of submitting a Claim or Recovery Response
- [ ] Anonymous actors receive summary fields only
- [ ] The projection is the only implementation; no unit reimplements it
- [ ] Every role is covered by a test asserting the exact field set

## Notes

This bolt comes before report creation itself. The projection is a pure function
of actor and report, so it can be built and verified against fixtures, and every
later read path then inherits it rather than re-deciding visibility.

This is also the highest-complexity bolt in the plan: the matrix has seven
columns, several with conditional visibility, and a mistake here is a privacy
incident rather than a bug.