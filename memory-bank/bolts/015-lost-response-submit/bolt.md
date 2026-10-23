---
id: 015-lost-response-submit
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 001-submit-a-recovery-response
created: 2026-10-23T13:12:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 006-reporting-visibility
  - 007-reporting-core
  - 011-lost-status-model
enables_bolts:
  - 014-web-threads
  - 017-lost-lifecycle-determination
  - 018-lost-threads
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 015-lost-response-submit

## Overview

The Lost-side workflow begins: a member responds to a Lost report.

## Objective

Deliver Recovery Response submission with the FR-44 field set and the acceptance
window that runs through `Verification Pending`.

## Stories Included

- **001-submit-a-recovery-response**: where found, observed identifying details, date found (Must)

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
- **006-reporting-visibility** (required): the responder must not see the report's private fields
- **007-reporting-core** (required): responses attach to Lost reports
- **011-lost-status-model** (required): the status the submission creates

### Enables
- 014-web-threads
- 017-lost-lifecycle-determination
- 018-lost-threads

## Success Criteria

- [ ] A response requires where found, observed identifying details, and date found
- [ ] The response is created `Submitted` and appears in My Recovery Responses
- [ ] Submission is accepted while the report is `Verification Pending` if the selected response has not reached `Match Confirmed`
- [ ] Submission is refused once the selected response has reached `Match Confirmed`
- [ ] The response payload contains neither the report's exact place nor the owner's identifying details
- [ ] A member cannot respond to their own Lost report
- [ ] Submission is rate-limited

## Notes

This is the exact inverse of Unit 003's shape. Keeping the two symmetric in their
structure but separate in their implementation makes the difference obvious when
either is read.