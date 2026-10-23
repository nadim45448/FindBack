---
id: 007-owner-rejects-registration
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:43:30Z
assigned_bolt: null
implemented: false
traces_to: [FR-3]
---

# Story: 007-owner-rejects-registration

User Story

**As an** administrator
**I want** to record why a registration was rejected
**So that** the decision is defensible without exposing the reason to the member

Acceptance Criteria

- [ ] **Given** a `Pending` account, **When** the administrator rejects it with a reason, **Then** the account becomes `Rejected` and the reason is stored and audit-recorded with the acting administrator
- [ ] **Given** a rejected account, **When** any login, message, or API response is produced, **Then** the rejection reason never appears in the response body
- [ ] **Given** a `Rejected` account, **When** a login is attempted, **Then** the generic inactive-account message is returned, identical to the `Deactivated` case
- [ ] **Given** a `Rejected` account, **When** the audit trail is viewed by an administrator, **Then** the rejection reason is visible on the audit entry
- [ ] **Given** a rejection, **When** it completes, **Then** no email of any kind is sent

Technical Notes

- Reason strings are audit-significant and stay verbatim in the trail, even where user-facing copy would be softened
- Anti-enumeration applies: the `Rejected` response is byte-for-byte the same shape as the `Deactivated` response

Dependencies

Requires
- 002-administrator-review-of-registrations

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Rejection reason containing HTML or script | Stored verbatim for audit; never rendered as HTML |
| Administrator rejects with no reason | Rejected; reason field empty |
| Comparison of `Rejected` vs `Deactivated` login responses | Indistinguishable to the client |

Out of Scope

- Appealing a rejection
- Reinstating a rejected account