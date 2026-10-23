---
id: 018-lost-threads
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 006-per-recovery-response-thread
  - 008-recovery-response-audit-events
created: 2026-10-23T13:13:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 003-audit-lost-side-events
  - 011-lost-status-model
  - 015-lost-response-submit
  - 017-lost-lifecycle-determination
enables_bolts:
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 018-lost-threads

## Overview

One private conversation per Recovery Response, and the audit record of it.

## Objective

Deliver per-Recovery-Response threads with server-enforced isolation between
competing responders, plus the FR-48 audit events for the Lost-side workflow.

## Stories Included

- **006-per-recovery-response-thread**: one thread per response, never per report (Must)
- **008-recovery-response-audit-events**: events 15–30 recorded with actors and no sensitive values (Must)

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
- **001-audit-core** (required): posting and lifecycle are audited
- **011-lost-status-model** (required): thread writability derives from response status
- **015-lost-response-submit** (required): the responses that own threads
- **017-lost-lifecycle-determination** (required): statuses that lock and unlock threads

### Enables
- 021-web-admin

## Success Criteria

- [ ] There is exactly one thread per Recovery Response and never one per Lost report
- [ ] A competing responder cannot read another response's thread; denial happens at the API layer
- [ ] Threads are writable while `Submitted`, `Selected for Verification`, or `Match Confirmed`
- [ ] Threads are read-only at any terminal status or when the report is `Returned` or `Closed`
- [ ] Messages are never deleted; a locked thread still shows its full history
- [ ] Administrators see every response's thread during verification, standby included
- [ ] No audit record contains an observed identifying detail, exact place, or thread body

## Notes

A per-report thread would leak every candidate's conversation to every other
candidate. The isolation must be enforced in the query, not by omitting a link
from the page.