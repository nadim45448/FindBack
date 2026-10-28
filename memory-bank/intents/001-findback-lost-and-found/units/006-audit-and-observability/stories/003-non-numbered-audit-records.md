---
id: 003-non-numbered-audit-records
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:51:30.000Z
assigned_bolt: 001-audit-core
implemented: true
traces_to:
  - FR-31
---

# Story: 003-non-numbered-audit-records

User Story

**As an** administrator
I want profile edits and report edits recorded without inventing new event numbers
**So that** the frozen event catalog stays intact while the record stays complete

Acceptance Criteria

- [ ] **Given** an FR-52 member profile edit, **When** it commits, **Then** an append-only non-numbered audit record is written with actor and timestamp
- [ ] **Given** an FR-53 administrator report edit, **When** it commits, **Then** an append-only non-numbered audit record is written with acting administrator, timestamp, changed fields, and previous values
- [ ] **Given** a non-numbered record, **When** it is stored, **Then** it carries no event number from the FR-31 or FR-48 catalogs
- [ ] **Given** a non-numbered record, **When** it is viewed by an administrator, **Then** it is visible in the audit trail alongside numbered events
- [ ] **Given** the FR-31 and FR-48 catalogs, **When** they are compared against the trail, **Then** no new event numbers were introduced by these edits
- [ ] **Given** a non-numbered record, **When** it is inspected, **Then** it contains no sensitive values

Technical Notes

- Two actions in the frozen product are auditable but carry no event number: FR-52 profile edits and FR-53 report edits. Numbering them would modify a frozen catalog; skipping them would leave real actions unrecorded.
- `previous_values` on the FR-53 record is what makes a moderation edit defensible after the fact.

Dependencies

Requires
- 001-append-only-audit-writes

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Administrator edits the same report repeatedly | Each edit produces its own record with its own previous values |
| Previous value contains user-supplied markup | Stored verbatim; never rendered as HTML |
| Profile edit changes a field to its existing value | Either no-op with no record, or a record with an empty changed-field set; must be consistent and must not silently lose the audit |

Out of Scope

- Numbered lifecycle events (story 001, story 002)
- The business rules of what an administrator may edit (Unit 002, FR-53)
- Audit visibility gating (story 005)