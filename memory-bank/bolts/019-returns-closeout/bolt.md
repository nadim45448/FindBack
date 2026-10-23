---
id: 019-returns-closeout
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 001-confirm-returned-default-receiver
  - 002-confirm-returned-substitute-receiver
  - 003-no-receiver-no-returned-guard
created: 2026-10-23T13:14:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 008-reporting-lifecycle
  - 016-claim-decisions
  - 017-lost-lifecycle-determination
enables_bolts:
  - 020-returns-moderation
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 019-returns-closeout

## Overview

The single Confirm Returned implementation, shared by both recovery directions.

## Objective

Deliver Returned confirmation with the default receiver, with a substitute
receiver, and the absolute no-receiver guard — one code path for both directions.

## Stories Included

- **001-confirm-returned-default-receiver**: Found → approved claimant, Lost → report owner (Must)
- **002-confirm-returned-substitute-receiver**: name, default receiver's authorization, relationship (Must)
- **003-no-receiver-no-returned-guard**: no receiver, no Returned (Must)

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
- **001-audit-core** (required): confirmations are audited
- **008-reporting-lifecycle** (required): terminal status semantics
- **016-claim-decisions** (required): the approved claim defines the Found-side default receiver
- **017-lost-lifecycle-determination** (required): the Lost-side precondition of `Match Confirmed`

### Enables
- 020-returns-moderation

## Success Criteria

- [ ] Returned is confirmed by an administrator only, never by the member or the Lost-side owner
- [ ] The default receiver is derived: approved claimant for Found, report owner for Lost
- [ ] A substitute records name, the default receiver's authorization, and a relationship from the closed set
- [ ] Authorization and relationship are not recorded when the substitute is the default receiver
- [ ] Confirmation without a receiver is refused at the domain boundary, not only in the form
- [ ] Concurrent confirmations resolve to exactly one commit
- [ ] There is one implementation of this transition, not one per direction

## Notes

The guard belongs here rather than in the next bolt because it is a precondition
of the confirmation itself. Folding it in means a Returned row with no receiver is
impossible to construct rather than merely discouraged.