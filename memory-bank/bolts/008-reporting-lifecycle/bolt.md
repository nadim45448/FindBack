---
id: 008-reporting-lifecycle
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 004-edit-own-report
  - 005-delete-own-report
  - 006-withdraw-own-report
  - 012-administrator-edit-report
created: 2026-10-23T13:08:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 007-reporting-core
enables_bolts:
  - 016-claim-decisions
  - 017-lost-lifecycle-determination
  - 019-returns-closeout
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 008-reporting-lifecycle

## Overview

What a reporter and a moderator may do to a report after it exists.

## Objective

Deliver edit, delete, withdraw, and administrator edit with their exact
preconditions, field restrictions, and audit consequences.

## Stories Included

- **004-edit-own-report**: blocked at both terminal statuses, each with its own message (Must)
- **005-delete-own-report**: hard delete only when `Open` and interaction-free (Must)
- **006-withdraw-own-report**: withdrawal reaches `Closed`, never `Returned` (Must)
- **012-administrator-edit-report**: field-restricted, non-terminal only, non-numbered audit record (Must)

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
- **001-audit-core** (required): edits, withdrawals, and moderator edits are audited
- **007-reporting-core** (required): needs the Report aggregate

### Enables
- 016-claim-decisions
- 017-lost-lifecycle-determination
- 019-returns-closeout

## Success Criteria

- [ ] Edit is refused on `Returned` and on `Closed`, with two distinct messages
- [ ] Hard delete requires `Open` and no interaction — no Claim for Found, no Recovery Response for Lost
- [ ] Withdrawal reaches `Closed` and resolves dependent Recovery Responses
- [ ] Administrator edit is refused on terminal reports
- [ ] Administrator edit exposes exactly the eight permitted fields and refuses reporter, type, lifecycle status, Claim content, Recovery Response content, audit entries, Returned-confirmation fields, and substitute-receiver fields
- [ ] Every administrator edit writes a non-numbered append-only audit record with previous values
- [ ] Hard delete is the only path that removes audit records, and only for an interaction-free `Open` report

## Notes

The asymmetric interaction-free rule is deliberate in the frozen product: a Found
report is blocked by a Claim, a Lost report by a Recovery Response. Conflating
them would let one direction's history be deleted while the other was preserved.