---
id: 008-reporting-lifecycle
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 004-edit-own-report
  - 005-delete-own-report
  - 006-withdraw-own-report
  - 012-administrator-edit-report
created: 2026-10-23T13:08:30Z
started: 2026-10-29T05:55:00Z
completed: 2026-10-29T07:35:00.000Z
current_stage: test
stages_completed:
  - name: model
    completed: 2026-10-29T06:05:00.000Z
    artifact: ddd-01-domain-model.md
  - name: implement
    completed: 2026-10-29T07:20:00.000Z
    artifact: source
  - name: test
    completed: 2026-10-29T07:35:00.000Z
    artifact: ddd-03-test-report.md

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

- [x] **1. model**: ✅ 2026-10-29 → `ddd-01-domain-model.md`
- [ ] **2. design**: ⏭️ skipped 2026-10-29 — owner directed implementation to start directly
- [ ] **3. adr**: ⏭️ skipped 2026-10-29 — owner directed implementation to start directly
- [x] **4. implement**: ✅ 2026-10-29 → source
- [x] **5. test**: ✅ 2026-10-29 → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): edits, withdrawals, and moderator edits are audited
- **007-reporting-core** (required): needs the Report aggregate

### Enables
- 016-claim-decisions
- 017-lost-lifecycle-determination
- 019-returns-closeout

## Success Criteria

- [x] Edit is refused on `Returned` and on `Closed`, with two distinct messages
- [x] Hard delete requires `Open` and no interaction — no Claim for Found, no Recovery Response for Lost
- [x] Withdrawal reaches `Closed` and resolves dependent Recovery Responses
- [x] Administrator edit is refused on terminal reports
- [x] Administrator edit exposes exactly the eight permitted fields and refuses reporter, type, lifecycle status, Claim content, Recovery Response content, audit entries, Returned-confirmation fields, and substitute-receiver fields
- [x] Every administrator edit writes a non-numbered append-only audit record with previous values
- [x] Hard delete is the only path that removes audit records, and only for an interaction-free `Open` report

## Notes

The asymmetric interaction-free rule is deliberate in the frozen product: a Found
report is blocked by a Claim, a Lost report by a Recovery Response. Conflating
them would let one direction's history be deleted while the other was preserved.