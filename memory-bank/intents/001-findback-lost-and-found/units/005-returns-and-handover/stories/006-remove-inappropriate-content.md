---
id: 006-remove-inappropriate-content
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:49:30Z
assigned_bolt: null
implemented: false
traces_to: [FR-36]
---

# Story: 006-remove-inappropriate-content

User Story

**As an** administrator
**I want** to remove inappropriate content while preserving the record of it
**So that** the community stays usable and the moderation action stays defensible

Acceptance Criteria

- [ ] **Given** a report or thread message containing inappropriate content, **When** the administrator removes it with a reason, **Then** the content is no longer presented to members
- [ ] **Given** a removal, **When** it completes, **Then** an audit record is written with the acting administrator, timestamp, target, and reason
- [ ] **Given** a removal, **When** the audit trail is viewed by an administrator, **Then** the record of the removed content is preserved rather than erased
- [ ] **Given** removed content, **When** it is requested directly by a member, **Then** it is not served
- [ ] **Given** a removal, **When** the surrounding report lifecycle is inspected, **Then** the report's status is unchanged unless closure was separately requested
- [ ] **Given** a non-administrator attempts a removal, **When** the action is attempted, **Then** it is refused
- [ ] **Given** a removal, **When** it is repeated on the same target, **Then** it is idempotent and does not create a duplicate audit entry

Technical Notes

- Removal hides content from members; it does **not** delete the audit record of it. The trail is append-only and removal is itself an audited action.
- "Inappropriate content" is an administrator judgement under FR-36. There is no automated classifier and no member reporting queue in the frozen product.
- Removal and closure are separate actions: removing content does not by itself move a report to `Closed` (story 005).

Dependencies

Requires
- 005-close-report

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Removal on an image rather than text | Image is withdrawn from member access; the audit record persists |
| Removal on a report that is already `Closed` | Permitted; content remains subject to moderation |
| Removal reason containing markup | Stored verbatim; never rendered as HTML |

Out of Scope

- Member-facing report-a-content feature
- Editing content rather than removing it
- Banning or suspending an account, which is deactivation in Unit 001 (FR-5)