---
id: 003-audit-lost-side-events
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: in-progress
stories:
  - 002-lost-side-audit-events
created: 2026-10-23T13:06:00Z
started: 2026-10-26T13:20:00Z
completed: null
current_stage: implement
stages_completed:
  - name: model
    completed: 2026-10-26T13:20:00Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-26T13:20:00Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-27T06:05:52Z
    artifact:
      - adr-9-fr48-catalog-ownership.md
      - adr-10-batch-resolution-contract.md
      - adr-11-determination-owner-check.md
  - name: implement
    completed: 2026-10-27T07:05:00Z
    artifact:
      - src/domain/audit/lost-side-events.ts
      - src/application/lost-side-event-factory.ts
      - src/domain/audit/event-catalog.ts

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

- [x] **1. model**: ✅ 2026-10-26 → `ddd-01-domain-model.md`
- [x] **2. design**: ✅ 2026-10-26 → `ddd-02-technical-design.md`
- [x] **3. adr**: ✅ 2026-10-27 → `adr-9-fr48-catalog-ownership.md`, `adr-10-batch-resolution-contract.md`, `adr-11-determination-owner-check.md`
- [x] **4. implement**: ✅ 2026-10-27 → `src/domain/audit/lost-side-events.ts`, `src/application/lost-side-event-factory.ts`, `src/domain/audit/event-catalog.ts`
- [ ] **5. test**: Pending → `ddd-03-test-report.md`

> Stage list corrected 2026-10-26 to the 5 stages defined by
> `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`,
> matching bolts `001-audit-core` and `002-audit-reads`. The original 4-item
> list omitted the optional ADR Analysis stage.

## Dependencies

### Requires
- **001-audit-core** (required): needs the append-only write path

### Enables
- 017-lost-lifecycle-determination
- 018-lost-threads

## Success Criteria

- [ ] Every FR-48 event from 15 to 30 is defined with actor and timestamp
- [ ] Events 18 and 19 store `determined_by` and `recorded_by` as distinct values
- [ ] Events 21 or 22, 26, and 30 fire from Unit 005's closeout in the same transaction
  - *Corrected 2026-10-27 on owner confirmation.* The criterion previously read "Events 24–26 and 30". Events 24 and 25 are **Closed-path** events, and FR-21 makes `Returned → Closed` unavailable ("Returned is terminal"), so neither can occur in the Returned closeout's transaction. The corrected set is the four events the PRD names for that path. No code change follows from the correction — `recordReturnedCloseout` has no path to event 24 or 25.
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