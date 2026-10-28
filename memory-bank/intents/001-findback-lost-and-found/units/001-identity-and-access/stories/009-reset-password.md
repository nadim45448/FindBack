---
id: 009-reset-password
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:44:30Z
assigned_bolt: 005-identity-security
implemented: true
traces_to: [FR-51]
---

# Story: 009-reset-password

User Story

**As a** member who received a reset link
**I want** to set a new password
**So that** I can log in again without administrator help

Acceptance Criteria

- [ ] **Given** a valid unexpired reset token, **When** the member submits a new password meeting the policy, **Then** the password hash is replaced and the member can log in with the new password
- [ ] **Given** a completed reset, **When** the member attempts to log in with the previous password, **Then** authentication fails
- [ ] **Given** a reset token that has already been used, **When** it is presented again, **Then** the reset is refused
- [ ] **Given** an expired reset token, **When** it is presented, **Then** the reset is refused
- [ ] **Given** a reset on a `Pending`, `Rejected`, or `Deactivated` account, **When** the reset completes, **Then** the account's lifecycle status is unchanged — reset never approves, activates, reactivates, or undoes a rejection
- [ ] **Given** a completed reset, **When** it is audited, **Then** the record contains no password, hash, or token value

Technical Notes

- Tokens are stored hashed and invalidated on use
- Password reset does **not** revoke other sessions by default; that is a separate decision not present in the PRD
- Argon2id work factor is applied to the new hash exactly as at registration

Dependencies

Requires
- 008-reset-request-never-discloses-account

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Token replayed after a successful reset | Refused; the second use cannot alter the password |
| Two resets requested concurrently | Both tokens valid until used; the first use wins |
| New password fails policy | Rejected; the existing password remains valid |

Out of Scope

- Forcing logout of other sessions
- Email delivery of the reset message body