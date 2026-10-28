---
id: 005-logout-revokes-session
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:42:30.000Z
assigned_bolt: 004-identity-core
implemented: true
traces_to:
  - FR-4
---

# Story: 005-logout-revokes-session

User Story

**As a** member
**I want** to log out
**So that** my session ends on this device immediately

Acceptance Criteria

- [ ] **Given** an authenticated session, **When** the member logs out, **Then** the session row is revoked and the session cookie is cleared
- [ ] **Given** a revoked session token, **When** it is presented on any request, **Then** the request is unauthenticated
- [ ] **Given** a logout, **When** it completes, **Then** an audit event records the logout without recording the session token
- [ ] **Given** a logout request without a valid session, **When** it completes, **Then** the outcome is an idempotent success and no session state changes
- [ ] **Given** an open session on another device, **When** the member logs out on one device, **Then** sessions on other devices are unaffected

Technical Notes

- Sessions are database rows so revocation is authoritative and immediate
- Logout is a state-changing request and carries a CSRF token

Dependencies

Requires
- 003-login-with-active-account

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Double logout | Idempotent success both times |
| Logout with an expired session | Idempotent success; cookie cleared |
| Logout while another request is in flight | In-flight request completes; subsequent requests unauthenticated |

Out of Scope

- Logging out all devices
- Session history display