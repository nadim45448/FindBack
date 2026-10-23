---
id: 020-returns-moderation
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 004-complete-lost-verification-closeout
  - 005-close-report
  - 006-remove-inappropriate-content
  - 007-lost-side-notification-events
created: 2026-10-23T13:14:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 003-audit-lost-side-events
  - 019-returns-closeout
enables_bolts:
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 020-returns-moderation

## Overview

The terminal transitions and the notifications that fire with them.

## Objective

Deliver the atomic Lost-side closeout that resolves every response and locks
every thread, administrator closure with its resolution rules, content removal,
and the Lost-side notification events.

## Stories Included

- **004-complete-lost-verification-closeout**: report, all responses, all threads, events 7 and 8 — one transaction (Must)
- **005-close-report**: closure to `Closed`, resolving dependents, never implying recovery (Must)
- **006-remove-inappropriate-content**: removal that preserves the audit record (Must)
- **007-lost-side-notification-events**: events 4–8 with the event-8 gate enforced (Must)

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
- **001-audit-core** (required): every terminal transition and removal is audited
- **003-audit-lost-side-events** (required): events 24–26 and 30 fire from here
- **019-returns-closeout** (required): the Returned transition this bolt extends

### Enables
- 021-web-admin

## Success Criteria

- [ ] Lost closeout resolves the report, every response, every thread, and both notifications in one transaction
- [ ] A partial failure leaves no partial state
- [ ] Event 8 fires only when the response is `Completed — Report Returned` and the report is `Returned`
- [ ] Event 8 does not fire at `Match Confirmed`; standby responders never receive it
- [ ] Closure resolves non-terminal responses to `Resolved — Report Closed` in the same transaction
- [ ] Post-`Match Confirmed` closure is exceptional-administrator-only, requires a reason, and is event 25
- [ ] No closure email reaches any responder or claimant
- [ ] Content removal hides content from members while preserving its audit record
- [ ] A send failure never rolls back or blocks a transition

## Notes

Four stories at the upper limit, but they share one property: each is a terminal
state change with irreversible consequences, and splitting them would mean testing
the atomic closeout without the closure rules that share its transaction boundary.