---
id: 002-recovery-response-status-model
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:47:30Z
assigned_bolt: null
implemented: false
traces_to: [FR-41]
---

# Story: 002-recovery-response-status-model

User Story

**As the system**
I want to persist exactly the seven real Recovery Response statuses and derive `Standby`
**So that** the Lost-side state machine is unambiguous and cannot drift

Acceptance Criteria

- [ ] **Given** a Recovery Response, **When** its status is read, **Then** it is one of: `Submitted`, `Selected for Verification`, `Match Confirmed`, `Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, `Withdrawn`
- [ ] **Given** a sibling response while another is `Selected for Verification`, **When** a display status is derived, **Then** the sibling renders as `Submitted — Standby` while its stored status remains `Submitted`
- [ ] **Given** any attempt to persist `Standby` as a status value, **When** the write is attempted, **Then** the database rejects it
- [ ] **Given** a response in `Match Confirmed`, **When** its status is evaluated, **Then** it is treated as non-terminal and the parent Lost report remains `Verification Pending`
- [ ] **Given** a response in any terminal status, **When** a further transition is attempted, **Then** the transition throws rather than silently degrading or partially applying
- [ ] **Given** a response in any of the three terminal statuses `Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, `Withdrawn`, **When** its status is evaluated, **Then** it is terminal and no outgoing transition exists
- [ ] **Given** the schema, **When** it is inspected, **Then** the status is constrained by an enum or CHECK constraint so an unlisted value cannot be stored

Technical Notes

- `Standby` is a **display condition**, never a persisted value (FR-41, D7). Persisting it would create a status that no transition can produce and no rule could reason about.
- `Match Confirmed` being non-terminal is the single most consequential fact here: it is why the Lost report does not become `Returned` at match time, and why Unit 005 must still confirm the physical hand-off.
- Terminal statuses: `Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, `Withdrawn`.

Dependencies

Requires
- 001-submit-a-recovery-response

Enables
- 003-owner-provisional-selection
- 005-lost-report-lifecycle
- 006-per-recovery-response-thread

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Attempt to write `Standby` directly | Database rejects the write |
| Attempt to move a terminal response to any other status | Throws; no partial write |
| Attempt to move `Match Confirmed` directly to `Completed` without the report being `Returned` | Throws; the report Returned transition is the only door |
| Sibling response after the selected one becomes `Not a Match` | No longer standby; displays plain `Submitted` |

Out of Scope

- The Lost report's own lifecycle (story 005)
- Who performs each transition (stories 003, 004)