---
id: 002-lost-side-audit-events
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:51:00.000Z
assigned_bolt: 003-audit-lost-side-events
implemented: true
traces_to:
  - FR-31
  - FR-48
---

# Story: 002-lost-side-audit-events

User Story

**As an** administrator
**I want** every Lost-side recovery action recorded with its numbers intact
**So that** a verification can be reconstructed end to end

Acceptance Criteria

- [ ] **Given** any Recovery Response transition, **When** it commits, **Then** the corresponding FR-48 event from the range 15 to 30 is recorded
- [ ] **Given** events 18 or 19 are recorded, **When** they are stored, **Then** `determined_by` and `recorded_by` are present as two distinct values
- [ ] **Given** the Lost Returned closeout in Unit 005, **When** it commits, **Then** events 21 or 22, 26, and 30 are recorded in the same transaction
  - *Corrected 2026-10-27 on owner confirmation.* The criterion previously read "events 24 through 26 and 30". Events 24 and 25 are **Closed-path** events, and FR-21 makes `Returned → Closed` unavailable ("Returned is terminal"), so neither can occur in the Returned closeout's transaction or in any transaction after it. The PRD's own climax beat names the Returned path's events as "15, 17, 18, 21, 26, and 30". The corrected set is the four events the PRD names: **21 or 22, 26, and 30**. See the conflict section in `memory-bank/bolts/003-audit-lost-side-events/ddd-02-technical-design.md` for the full argument.
- [ ] **Given** a Lost report's trail, **When** it is assembled, **Then** it covers response submission, provisional selection, determination, closeout or closure, and the reason for each terminal resolution
- [ ] **Given** an event that fires in Unit 004 and an event that fires in Unit 005, **When** the trail is queried, **Then** both appear under the same parent report with no gap between them
- [ ] **Given** an audit reason string, **When** it is stored, **Then** it is verbatim even where the user-facing copy for the same event was softened

Technical Notes

- FR-48 spans two units: most events fire from Unit 004, the closeout events from Unit 005. Coverage must be verifiable **across** the boundary, not per unit.
- Events 18/19 are the PRD's mechanism for keeping owner-determines / administrator-records honest. A single actor field would destroy that distinction.
- The softened-copy rule cuts one way only: user-facing language may be gentler, audit reasons may not (OQ-5).

Dependencies

Requires
- 001-append-only-audit-writes

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Standby responders generate no events of their own | Only the selected response's transitions are recorded |
| Closeout rolls back partway | No closeout events exist |
| Trail queried for a report with many responses | Paged, reverse-chronological, complete, within the 1s p95 budget |

Out of Scope

- FR-31 events 1–14 (story 001 covers the write path; the specific events belong to their acting units)
- Non-numbered records (story 003)
- Deciding which event fires — that belongs to the acting unit