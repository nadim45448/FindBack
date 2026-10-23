---
id: 011-lost-status-model
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 002-recovery-response-status-model
  - 007-responder-withdraws-response
created: 2026-10-23T13:10:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 007-reporting-core
enables_bolts:
  - 015-lost-response-submit
  - 017-lost-lifecycle-determination
requires_units: []
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 011-lost-status-model

## Overview

The eight-status Lost-side state machine, defined before anything transitions it.

## Objective

Establish the Recovery Response status set, forbid `Standby` from ever being
persisted, and define responder withdrawal.

## Stories Included

- **002-recovery-response-status-model**: the canonical 8 statuses, `Standby` never stored (Must)
- **007-responder-withdraws-response**: withdrawal only while `Submitted` and unselected (Must)

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
- **001-audit-core** (required): every transition is audited
- **007-reporting-core** (required): responses attach to Lost reports

### Enables
- 015-lost-response-submit
- 017-lost-lifecycle-determination

## Success Criteria

- [ ] Status is constrained to the seven persisted values by schema, not only by code
- [ ] Writing `Standby` is rejected at the database level
- [ ] A sibling displays `Submitted — Standby` while its stored status stays `Submitted`
- [ ] `Match Confirmed` is treated as non-terminal everywhere it is evaluated
- [ ] An illegal transition throws rather than partially applying
- [ ] Withdrawal is refused once a response is selected or past `Submitted`
- [ ] Deactivating a responder leaves their existing responses intact

## Notes

This bolt precedes response submission deliberately. The status machine is the
most intricate part of FindBack, and building it first means the submit,
selection, determination, and closeout bolts are constrained by it rather than
each inventing a transition.