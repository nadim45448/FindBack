---
id: 003-login-with-active-account
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:41:30.000Z
assigned_bolt: 004-identity-core
implemented: true
traces_to:
  - FR-2
  - FR-4
---

# Story: 003-login-with-active-account

User Story

**As a** member
**I want** to log in with my email and password
**So that** I can reach the FindBack surfaces available to my account

Acceptance Criteria

- [ ] **Given** an `Active` account and correct credentials, **When** the member submits the login form, **Then** a session is created and the member is routed to their starting view
- [ ] **Given** a `Pending` account and correct credentials, **When** the member submits, **Then** the response is the generic inactive-account message and no session is created
- [ ] **Given** a `Rejected` account and correct credentials, **When** the member submits, **Then** the response is the generic inactive-account message and no session is created
- [ ] **Given** a `Deactivated` account and correct credentials, **When** the member submits, **Then** the response is the generic inactive-account message and no session is created
- [ ] **Given** an incorrect password or unknown email, **When** the member submits, **Then** the response is indistinguishable from the inactive-account case and no account state is revealed
- [ ] **Given** any login attempt, **When** it completes, **Then** the result is audit-logged without recording the submitted password

Technical Notes

- `Rejected` and `Deactivated` share one generic message (PRD §3, UJ-3). The rejection reason is preserved in audit but never shown.
- Sessions are database rows, not JWTs, so logout and deactivation can revoke server-side (PRD A2)
- Session cookie is `__Host-` prefixed: `HttpOnly`, `Secure`, `SameSite=Lax`
- Login is rate-limited; repeat failures are throttled without revealing why

Dependencies

Requires
- 001-self-registration
- 002-administrator-review-of-registrations

Enables
- 004-deactivate-an-account
- 009-reset-password
- 010-update-member-profile

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Account deactivated while a session is open | Session revoked; next request is unauthenticated |
| Expired session cookie | Treated as unauthenticated, no error surfaced |
| Case-differing email at login | Matches, email is normalized on write |
| Login attempted from a revoked session | Rejected; no new session issued |

Out of Scope

- Password reset (story 009)
- Multi-factor authentication
- Social login