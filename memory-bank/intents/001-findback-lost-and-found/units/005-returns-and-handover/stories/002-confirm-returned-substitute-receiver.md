---
id: 002-confirm-returned-substitute-receiver
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:47:30Z
assigned_bolt: 019-returns-closeout
implemented: true
traces_to: [FR-24]
---

# Story: 002-confirm-returned-substitute-receiver

User Story

**As an** administrator
**I want** to record who actually received an item when it was not the default receiver
**So that** the handover is attributable even when the item went to someone else

Acceptance Criteria

- [x] **Given** the default receiver did not physically receive the item, **When** the administrator confirms Returned with a substitute, **Then** the substitute's name is recorded
- [x] **Given** a substitute receiver is recorded, **When** the confirmation is saved, **Then** the default receiver's authorization of that substitute is confirmed and recorded
- [x] **Given** a substitute receiver is recorded, **When** the confirmation is saved, **Then** the relationship is recorded as one of: Friend, Family Member, Colleague, Classmate, Other
- [x] **Given** the substitute IS the default receiver, **When** Returned is confirmed, **Then** authorization and relationship are not applicable and are not recorded
- [x] **Given** a substitute name is missing, **When** the confirmation is submitted, **Then** validation fails and Returned is not confirmed
- [x] **Given** a relationship outside the fixed set is supplied, **When** the confirmation is submitted, **Then** validation fails
- [x] **Given** a substitute confirmation, **When** it is audited, **Then** the record contains the substitute name and relationship but no recovery identifying details

Technical Notes

- The relationship enum is closed: Friend, Family Member, Colleague, Classmate, Other.
- Authorization is a record of the **default receiver's** consent, not the substitute's — the person who had a right to the item agrees to hand it to someone else.
- When the substitute is the default receiver, the extra fields would be noise and are omitted rather than left blank.

Dependencies

Requires
- 001-confirm-returned-default-receiver

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Substitute name is a single character | Accepted within length bounds |
| Relationship left unset while a substitute is given | Validation failure |
| Substitute is a deactivated account | Recorded by name as an unnamed party; no account link is created |

Out of Scope

- Collecting authorization from the substitute
- Verifying the relationship against any external source
- Confirming Returned itself (story 001)