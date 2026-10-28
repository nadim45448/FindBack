---
id: 008-reset-request-never-discloses-account
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:44:00Z
assigned_bolt: 005-identity-security
implemented: false
traces_to: [FR-51]
---

# Story: 008-reset-request-never-discloses-account

User Story

**As a** member who cannot log in
**I want** to request a password reset link
**So that** I can regain access to my account

Acceptance Criteria

- [ ] **Given** a request for a registered email, **When** the reset request is submitted, **Then** the response is a neutral confirmation that does not reveal whether the account exists
- [ ] **Given** a request for an unregistered email, **When** the reset request is submitted, **Then** the response is byte-for-byte identical to the registered case
- [ ] **Given** any reset request, **When** the response is produced, **Then** its timing does not vary with account existence
- [ ] **Given** a registered account in any status — `Pending`, `Active`, `Rejected`, or `Deactivated`, **When** a reset is requested, **Then** the response is the same neutral confirmation and no lifecycle state changes
- [ ] **Given** repeated reset requests for the same address, **When** the request count exceeds the configured limit, **Then** the request is rate-limited
- [ ] **Given** a reset request, **When** it is processed, **Then** no audit or log record contains the reset token or the submitted address in a way that would disclose account existence

Technical Notes

- Anti-enumeration is a PRD-level invariant, not a UI nicety: body, timing, and subsequent screen state must all match
- Rate limiting applies per address and per source
- Tokens are single-use and stored hashed

Dependencies

Requires
- 001-self-registration

Enables
- 009-reset-password

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Request for a `Deactivated` account | Neutral confirmation; no reactivation, no email promising access |
| Request for a `Pending` account | Neutral confirmation; no approval implied |
| Reset request from an attacker enumerating emails | No distinguishing signal in body, timing, or status code |

Out of Scope

- Performing the reset (story 009)
- Administrator-initiated password resets