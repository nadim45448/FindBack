---
id: 023-claim-threads-notifications
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 007-per-claim-message-thread
  - 008-claim-notification-emails
created: 2026-10-23T13:16:00Z
started: 2026-10-30T11:30:00Z
completed: 2026-10-30T12:55:00Z
current_stage: test
stages_completed: [implement, test]

requires_bolts:
  - 016-claim-decisions
enables_bolts:
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 023-claim-threads-notifications

## Overview

The per-Claim conversation and the two Found-side notification events.

## Objective

Deliver the per-Claim thread with its read-only states, and the emails that tell
the finder a claim arrived and the claimant their claim was decided.

## Stories Included

- **007-per-claim-message-thread**: one thread per claim, read-only once decided (Must)
- **008-claim-notification-emails**: FR-28 to the finder, FR-29 to the claimant only (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [ ] **1. model**: Skipped by owner direction → `ddd-01-domain-model.md`
- [ ] **2. design**: Skipped by owner direction → `ddd-02-technical-design.md`
- [x] **3. implement**: Complete → source
- [x] **4. test**: Complete → `ddd-03-test-report.md`

## Dependencies

### Requires
- **016-claim-decisions** (required): thread writability and decision emails both derive from claim status

### Enables
- 021-web-admin

## Success Criteria

- [x] There is exactly one thread per Claim
- [x] The thread is writable while the Claim is `Pending`
- [x] The thread is read-only once the Claim is `Approved` or `Rejected`, or the report is `Returned` or `Closed`
- [x] Messages are never deleted; a locked thread keeps its full history
- [x] The finder never sees the claimant's reason or identifying details
- [x] FR-28 reaches the finder when a claim is submitted
- [x] FR-29 reaches the claimant only — the finder receives no claim-decision email
- [x] Email is sent after commit; a send failure never rolls back or blocks a decision

## Notes

Numbered 023 rather than fitting into an existing bolt because both stories are
defined by claim status, which only exists once decisions can be made. This is
the Found-side mirror of bolt 018.