---
id: 010-update-member-profile
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:45:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-52]
---

# Story: 010-update-member-profile

User Story

**As a** member
**I want** to view and edit my profile
**So that** my name and declared role stay accurate

Acceptance Criteria

- [ ] **Given** an authenticated member, **When** they open their profile, **Then** their display name, email, self-declared role, and account status are shown
- [ ] **Given** a member editing their profile, **When** they change display name or self-declared role and save, **Then** the change persists and is reflected wherever the name appears
- [ ] **Given** a profile edit, **When** it is recorded in the audit trail, **Then** an append-only non-numbered audit record is created with the actor and timestamp
- [ ] **Given** a member editing their profile, **When** they attempt to change their email, **Then** the field is read-only and the change is refused
- [ ] **Given** a member editing their profile, **When** they attempt to change their account status, administrator flag, or any lifecycle or administrator control, **Then** the action is refused
- [ ] **Given** a non-`Active` member, **When** they attempt to open the profile editor, **Then** the editor is unavailable

Technical Notes

- The FR-52 edit surface is **exactly** display name and self-declared role. Nothing else is editable here (FR-52).
- Profile edits produce a non-numbered audit record — they introduce no new FR-31 or FR-48 event numbers.
- Absent from this story by design: avatar, bio, social links, notification preferences, email change, self-deactivation, self-deletion, and any public profile page (`EXPERIENCE.md` §9.4a)

Dependencies

Requires
- 003-login-with-active-account

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Display name cleared | Rejected by validation |
| Self-declared role set to a long free-text value | Accepted within the length bound |
| Profile edit attempted while deactivated | Refused |

Out of Scope

- Changing email address
- Managing notification preferences
- Any public-facing profile
- Self-service deactivation or deletion