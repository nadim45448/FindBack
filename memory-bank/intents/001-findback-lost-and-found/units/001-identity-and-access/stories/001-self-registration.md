---
id: 001-self-registration
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:40:00.000Z
assigned_bolt: 004-identity-core
implemented: true
traces_to:
  - FR-1
---

# Story: 001-self-registration

User Story

**As a** member of the organization
**I want** to register an account with my name, email, password, and self-declared role
**So that** I can be reviewed and later use FindBack

Acceptance Criteria

- [ ] **Given** a visitor on the registration form, **When** they submit a valid name, email, password, and self-declared role, **Then** an account is created with status `Pending` and an administrator flag defaulting to false
- [ ] **Given** a successful registration, **When** the registration completes, **Then** the user sees a confirmation screen and **no** email is sent
- [ ] **Given** an email already registered, **When** the user submits, **Then** the form shows a duplicate-email validation error and no account is created
- [ ] **Given** a password that fails the configured policy, **When** the user submits, **Then** the form shows a password validation error and no account is created
- [ ] **Given** a valid registration, **When** the registration is persisted, **Then** an audit event is recorded with the actor and timestamp, and no sensitive value is written to the audit record

Technical Notes

- Passwords are hashed with Argon2id; work factors are configured, not hardcoded (`coding-standards`)
- Email uniqueness is scoped to the organization
- Registration is rate-limited (`standards/system-architecture.md` §Rate limiting)
- The confirmation screen copy comes from `EXPERIENCE.md` §9.3

Dependencies

Requires
- None (first story)

Enables
- 002-administrator-review-of-registrations
- 003-login-with-active-account
- 004-deactivate-an-account

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Duplicate email differing only in case | Treated as duplicate |
| Unicode or very long display name | Accepted, length-bounded |
| Email with leading/trailing whitespace | Trimmed before uniqueness check |
| Self-declared role contains free text | Stored as entered; does not grant capabilities |

Out of Scope

- Email verification
- Administrator approval (story 002)
- Login (story 003)