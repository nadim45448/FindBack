---
id: 013-claim-submit
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 001-submit-a-claim
created: 2026-10-23T13:11:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 004-identity-core
  - 006-reporting-visibility
  - 007-reporting-core
enables_bolts:
  - 014-web-threads
  - 016-claim-decisions
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 013-claim-submit

## Overview

The Found-side workflow begins: a member claims a Found report as theirs.

## Objective

Deliver Claim submission with its required fields, its uniqueness rule, and the
notification trigger to the finder.

## Stories Included

- **001-submit-a-claim**: reason, identifying details, date lost; one Pending claim per item per member (Must)

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
- **001-audit-core** (required): submission is audited
- **004-identity-core** (required): the claimant is the actor
- **006-reporting-visibility** (required): claims must not unlock claim-reason visibility
- **007-reporting-core** (required): claims attach to Found reports

### Enables
- 014-web-threads
- 016-claim-decisions

## Success Criteria

- [ ] A claim requires reason, identifying details, and date lost
- [ ] `date lost` is at most 365 days old and not in the future
- [ ] A member cannot claim their own report; the action returns 403
- [ ] One Pending claim per item per member
- [ ] A `Pending` account cannot submit a claim
- [ ] The claim is created `Pending` and the report becomes `Claim Requested`
- [ ] Submission does not make the finder able to see the claim's reason or identifying details

## Notes

The last criterion is the subtle one. Submitting a Claim must not widen the
finder's visibility — the whole point of the projection is that visibility is
determined by relationship, not by who recently did something.