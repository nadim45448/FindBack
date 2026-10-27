---
id: 008-recovery-response-audit-events
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:50:30Z
assigned_bolt: null
implemented: false
traces_to: [FR-48]
---

# Story: 008-recovery-response-audit-events

User Story

**As an** administrator
**I want** every Lost-side recovery action recorded in the audit trail
**So that** any decision on a Lost report can be reconstructed later

Acceptance Criteria

- [ ] **Given** any Recovery Response transition, **When** it commits, **Then** the corresponding FR-48 event is written inside the same transaction with actor and timestamp
- [ ] **Given** events 18 or 19, **When** they are written, **Then** `determined_by` and `recorded_by` are stored as two distinct values
- [ ] **Given** an audit record, **When** it is inspected, **Then** it contains no observed identifying details, no exact place, and no thread body
- [ ] **Given** an audit reason string that is audit-significant, **When** it is stored, **Then** it is verbatim even where the user-facing copy for the same event is softened
- [ ] **Given** a transition that does not commit, **When** the transaction rolls back, **Then** no audit record for that transition exists
- [ ] **Given** the trail for a Lost report, **When** it is assembled, **Then** it answers the full path from response submission through to terminal resolution, including the resolution reason
- [ ] **Given** a trail record, **When** an update or delete is attempted, **Then** the operation is refused because the trail is append-only

Technical Notes

- Audit is written **inside** the caller's transaction, never after it. An audit entry for a transition that did not happen is a defect, and an audit entry missing for one that did is worse.
- The softened-copy rule (OQ-5) cuts one way: user-facing language may be gentler, the audit reason may not.
- FR-48 spans events 15–30. Some of those events fire from Unit 005 (the return closeout at events 21, 22, 26, and 30), so this story's coverage must be verifiable end to end across both units.

Dependencies

Requires
- 002-recovery-response-status-model

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Transition and audit write race with a rollback | Neither persists |
| Reason string containing user-supplied text | Stored verbatim; never rendered as HTML |
| Audit query across a report with many responses | Paged, reverse-chronological, complete |

Out of Scope

- Audit visibility and read logging (Unit 006, FR-32)
- Deciding which event fires — that belongs to the acting unit
- FR-31 report-lifecycle events 1–14 (Unit 002 and Unit 003)