---
id: 014-web-threads
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
type: simple-construction-bolt
status: planned
stories:
  - 003-member-view-shell-and-navigation
  - 004-item-detail-by-relationship
  - 005-report-forms-and-member-actions
  - 006-claim-and-recovery-threads
created: 2026-10-23T13:11:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 008-reporting-lifecycle
  - 009-reporting-search
  - 012-web-public
  - 013-claim-submit
  - 015-lost-response-submit
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

# Bolt: 014-web-threads

## Overview

The active member experience: four views, item detail, report forms, and both
thread types.

## Objective

Render the member surfaces against data the server has already filtered, without
re-implementing the visibility matrix in the interface.

## Stories Included

- **003-member-view-shell-and-navigation**: four disjoint views, no self-overlap in Browse (Must)
- **004-item-detail-by-relationship**: detail rendered per relationship role (Must)
- **005-report-forms-and-member-actions**: create, edit, delete, withdraw with their blocked messages (Must)
- **006-claim-and-recovery-threads**: both thread types with correct read-only states (Must)

## Bolt Type

**Type**: simple-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. design**: Pending → `implementation-plan.md`
- [ ] **2. implement**: Pending → source
- [ ] **3. test**: Pending → `simple-03-test-report.md`

## Dependencies

### Requires
- **008-reporting-lifecycle** (required): edit, delete, and withdraw actions
- **009-reporting-search** (required): view partition and detail data
- **012-web-public** (required): shell, tokens, theme, navigation
- **013-claim-submit** (required): Claim surfaces
- **015-lost-response-submit** (required): Recovery Response surfaces

### Enables
- 021-web-admin

## Success Criteria

- [ ] The four views are disjoint and correctly partitioned
- [ ] A member's own report never appears in their own Browse
- [ ] Item detail renders only the fields the server sent — no client-side visibility filter
- [ ] Threads are read-only at terminal status or when the parent report is `Returned` or `Closed`
- [ ] Blocked actions show their distinct messages for `Returned` and `Closed`
- [ ] Cross-thread access is denied by the server, not hidden in the interface

## Notes

The tempting shortcut here is to re-implement FR-39 as a display filter because it
is easier to test in the browser. That would hide a data leak rather than fix one,
because the sensitive field would already have been sent to the client.