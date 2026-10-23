---
id: 003-audit-lost-side-events
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 002-lost-side-audit-events
created: 2026-10-23T13:06:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
enables_bolts:
  - 017-lost-lifecycle-determination
  - 018-lost-threads
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 003-audit-lost-side-events

## Overview

The FR-48 event catalog for the Lost-side recovery workflow, including the two
events that carry `determined_by` and `recorded_by` as separate values.

## Objective

Define and wire events 15 through 30 so that a Lost report's verification can be
reconstructed end to end, spanning the determination made by Unit 004 and the
closeout performed by Unit 005.

## Stories Included

- **002-lost-side-audit-events**: every Lost-side transition recorded, events 18/19 carry both actors (Must)

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
- **001-audit-core** (required): needs the append-only write path

### Enables
- 017-lost-lifecycle-determination
- 018-lost-threads

## Success Criteria

- [ ] Every FR-48 event from 15 to 30 is defined with actor and timestamp
- [ ] Events 18 and 19 store `determined_by` and `recorded_by` as distinct values
- [ ] Events 24–26 and 30 fire from Unit 005's closeout in the same transaction
- [ ] The trail shows no gap between events emitted by Unit 004 and Unit 005
- [ ] Audit reasons are verbatim even where user-facing copy was softened
- [ ] No event records an observed identifying detail, exact place, or thread body

## Notes

This bolt is scheduled early but consumed late. The catalog must exist before
Units 004 and 005 can emit against it, but verifying it end to end requires
those units to be built — which is why its success criteria span the boundary.

Deferring it to sit beside the Lost-side bolts would be wrong: Units 004 and 005
would then have to invent event numbers as they go, and the frozen catalog is
precisely what must not drift.