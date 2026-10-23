---
id: 003-no-receiver-no-returned-guard
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:48:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-25]
---

# Story: 003-no-receiver-no-returned-guard

User Story

**As the system**
I want to refuse a Returned status when no receiver is identified
**So that** no item is ever marked recovered without someone being answerable for it

Acceptance Criteria

- [ ] **Given** a report eligible to become `Returned`, **When** a confirmation is submitted with no receiver and no substitute, **Then** the action is refused and the report's status is unchanged
- [ ] **Given** a substitute receiver is supplied without a name, **When** the confirmation is submitted, **Then** the action is refused
- [ ] **Given** a confirmation is refused by this guard, **When** the failure is recorded, **Then** no Returned audit event is written
- [ ] **Given** any report, **When** it reaches `Returned`, **Then** a receiver is present on the confirmation record
- [ ] **Given** a confirmation submitted with a receiver, **When** it is processed, **Then** the guard permits the transition to proceed

Technical Notes

- The guard is **absolute** (FR-25). It is not a warning and not a soft default.
- It must be enforced at the domain boundary, not only in the form, so that an API caller cannot bypass it.
- An existing Returned row with no receiver would be a data-integrity defect; this story prevents that state rather than repairing it.

Dependencies

Requires
- 001-confirm-returned-default-receiver

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Receiver field present but whitespace only | Treated as no receiver; refused |
| Default receiver deactivated before confirmation | Substitute path remains available; the guard is still satisfied |
| Guard hit concurrently with an administrator close | Exactly one terminal transition commits |

Out of Scope

- Choosing who the receiver should be
- Any appeal or correction process for a confirmed Returned
- Blocking `Closed`, which has no receiver requirement