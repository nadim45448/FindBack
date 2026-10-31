---
id: 016-claim-decisions
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 002-administrator-claim-review
  - 003-approve-a-claim
  - 004-reject-a-claim
  - 005-auto-status-transitions
  - 006-auto-reject-competing-claims
created: 2026-10-23T13:12:30Z
started: 2026-10-30T05:00:00Z
completed: 2026-10-30T06:30:00Z
current_stage: test
stages_completed:
  - implement
  - test

requires_bolts:
  - 001-audit-core
  - 008-reporting-lifecycle
  - 013-claim-submit
enables_bolts:
  - 019-returns-closeout
  - 021-web-admin
  - 023-claim-threads-notifications
requires_units: []
blocks: false

complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 016-claim-decisions

## Overview

The administrator decides which claim is real, and every consequence of that decision.

## Objective

Deliver the review screen, the atomic approval that rejects competing claims in
the same transaction, rejection, Found-side status transitions, and the three
distinct auto-rejection triggers.

## Stories Included

- **002-administrator-claim-review**: review screen with competing-claim count and reference (Must)
- **003-approve-a-claim**: approve, auto-reject competitors, move report — one transaction (Must)
- **004-reject-a-claim**: reject with reason; report returns to `Open` if none pending (Must)
- **005-auto-status-transitions**: Open → Claim Requested → Claim Approved or Open or Closed (Must)
- **006-auto-reject-competing-claims**: three triggers, three distinct audit reasons (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: Skipped by owner direction → (no artifact)
- [x] **2. design**: Skipped by owner direction → (no artifact)
- [x] **3. implement**: Complete → source
- [x] **4. test**: Complete → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): every decision is audited with its distinct reason
- **008-reporting-lifecycle** (required): withdrawal and closure trigger auto-rejection
- **013-claim-submit** (required): the Pending claims these decisions act on

### Enables
- 019-returns-closeout
- 021-web-admin

## Success Criteria

- [x] Approval auto-rejects every other Pending claim and moves the report to `Claim Approved` in one transaction
- [x] Two administrators cannot both approve the same claim
- [x] Rejection returns the report to `Open` only when no Pending claim remains
- [x] The three auto-rejection triggers each record their own audit reason
- [x] User-facing auto-rejection copy is softened while the audit reason stays verbatim
- [x] There is no `Closed` Claim status
- [x] A decision on a non-`Pending` claim is a conflict, not a silent overwrite

## Notes

Five stories and the highest concurrency risk in the Found-side direction. The row
lock on the Found report is what makes approval atomic; without it, two
administrators can each believe they approved a claim for the same item.