---
id: 004-edit-own-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00.000Z
assigned_bolt: null
implemented: true
traces_to:
  - FR-9
  - FR-19
---

# Story: 004-edit-own-report

User Story

**As a** member who filed a report
**I want** to correct my own report while it is active
**So that** its details stay accurate and useful to others

Acceptance Criteria

- [ ] **Given** a member editing their own report in any non-terminal status, **When** they change an editable field and save, **Then** the change persists and the report's lifecycle status is unchanged
- [ ] **Given** a report whose status is `Returned`, **When** the owner attempts to edit it, **Then** the edit is blocked with the message "Returned reports cannot be edited."
- [ ] **Given** a report whose status is `Closed`, **When** the owner attempts to edit it, **Then** the edit is blocked with the message "Closed reports cannot be edited."
- [ ] **Given** a member who is not the reporter of a report, **When** they attempt to edit that report, **Then** the edit is refused
- [ ] **Given** any edit by the reporter, **When** it is recorded in the audit trail, **Then** an audit entry is created with actor, report ID, a snapshot of changed fields, and a timestamp
- [ ] **Given** an edit made after any Claim exists on a Found report or any Recovery Response exists on a Lost report, **When** the edit is recorded, **Then** the audit entry carries the changed fields and the previous values so administrators can see the report changed after interactions began
- [ ] **Given** a previous value captured in an audit entry, **When** an administrator reconstructs the report's history, **Then** the prior values are recoverable from the append-only audit history
- [ ] **Given** an edit submitted by the reporter, **When** the edit is saved, **Then** no email is sent to the reporter or to any other party

Technical Notes

- Edit is blocked at BOTH terminal statuses, `Returned` and `Closed`, and each carries its own message. This is a paired rule; neither message is reused for the other status.
- Editing never changes status. A report edit is a content correction, never a lifecycle transition (FR-22 and FR-42 own status movement).
- FR-19 records every reporter edit. Once interactions exist on the report, the audit entry must include previous values — this makes silent evidence mutation impossible. The traceability rule does not restrict which fields may be edited; it governs what the audit trail must preserve.
- FR-31 audit event 8 (`Report edited by reporter`) carries actor, item ID, snapshot of changed fields, and timestamp.
- The editable field set for a reporter edit is the FR-8 content set. Reporter identity, report type, and lifecycle status are not editable here; reporter identity is not a member-editable field on a report and type and status are lifecycle concerns.
- Administrator report edit is a separate, field-restricted capability under FR-53 (story 012) and is blocked on the same terminal statuses.
- The same field validator as story 003 applies, so bounds are enforced identically on create and edit.

Dependencies

Requires
- 001-create-lost-item-report
- 002-create-found-item-report
- 003-validate-report-field-set

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Edit submitted concurrently while status moves to `Closed` | The edit is re-evaluated against current status and blocked with the `Closed` message |
| Reporter edits a report that has no interactions | Audit entry records changed fields; previous values are not required by FR-19 at that point |
| Edit submitted with no field changed | No-op; no change snapshot and no meaningful audit event |
| Reporter attempts to edit another member's report | Refused |
| Edit includes a field outside the editable set | The field is not modified |

Out of Scope

- Deleting a report (story 005)
- Withdrawing a report (story 006)
- Administrator report edit (story 012)
- Lifecycle status transitions (FR-21, FR-22, FR-42)
- Email notification of an edit (FR-30 — no report-edit email)
