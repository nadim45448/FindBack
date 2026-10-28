---
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
phase: inception
status: in-progress
created: 2026-10-23T12:30:00Z
updated: 2026-10-28T14:45:00Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Identity and Access

## Purpose

Decides **who may act in FindBack and in what capacity**. Owns the account
lifecycle from registration through deactivation, the session that carries that
identity, password recovery, and the member profile.

This is the root unit. Everything else consumes the `ActorContext` it produces.

## Scope

### In Scope
- Self-registration into `Pending` (FR-1)
- Administrator approval and rejection of registrations (FR-3)
- Login and logout (FR-4)
- Deactivation, with full preservation of historical artifacts (FR-5)
- Forgot Password / password recovery (FR-51)
- Member Profile (FR-52)
- The `administrator` flag and ActorContext resolution
- Account-approved email trigger (FR-27)
- Account deactivation and session revocation

### Out of Scope
- Lost/Found reporting — Unit 002
- Claims and Recovery Responses — Units 003, 004
- Audit trail mechanics — Unit 006 owns the trail; this unit **writes** to it
- Email delivery mechanics — Unit 007's notification concerns; this unit triggers
- Administrator queues and their rendering — Unit 007

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Self-Registration | Must |
| FR-2 | Pending State and Restricted Access | Must |
| FR-3 | Administrator Review of Pending Registrations | Must |
| FR-4 | Login and Logout | Must |
| FR-5 | Deactivation | Must |
| FR-27 | Account Approved Email (Found-side event 1) | Must |
| FR-51 | Forgot Password / Password Recovery | Must |
| FR-52 | Member Profile | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Account | A registered user | id, email (unique per organization), passwordHash, displayName, selfDeclaredRole, status (`Pending`/`Active`/`Rejected`/`Deactivated`), isAdministrator, rejectionReason, createdAt, activatedAt, deactivatedAt |
| Session | A revocable authenticated session | id, accountId, tokenHash, createdAt, lastActivityAt, expiresAt, revokedAt, revocationReason |
| PasswordResetToken | Single-use recovery credential | id, accountId, tokenHash, createdAt, expiresAt, usedAt |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `register` | Create a `Pending` account | name, email, password, selfDeclaredRole | Account — **no email sent** |
| `approveAccount` | Administrator approval | accountId, actingAdministratorId | `Active` account + FR-27 email trigger |
| `rejectAccount` | Administrator rejection with recorded reason | accountId, reason, actingAdministratorId | `Rejected` account — **no email sent** |
| `authenticate` | Login | email, password | Session, or the generic inactive-account message |
| `logout` | Revoke the current session | sessionId | revoked Session |
| `deactivate` | Turn off an Active account | accountId, actingAdministratorId | `Deactivated` account + **all sessions revoked** |
| `requestPasswordReset` | Start recovery | email | always a neutral confirmation — **never** discloses account existence |
| `completePasswordReset` | Set a new password | token, newPassword | new hash; token invalidated; prior password no longer authenticates |
| `updateProfile` | Edit display name and self-declared role | accountId, changes | updated profile + non-numbered audit record |

## Rules this unit must not break

1. **No email at registration or rejection.** Only approval sends one (FR-1, FR-27).
2. **Rejected and Deactivated share one generic login message.** The rejection reason
   is preserved in the audit trail but is **never** shown to the user (PRD §3, UJ-3).
3. **Password reset never changes lifecycle state.** A `Pending` account stays
   `Pending`; reset does not approve, activate, reactivate, or undo a rejection
   (FR-51).
4. **Reset responses are anti-enumeration** in body, timing, and subsequent screen
   state — for registered, unregistered, `Pending`, `Active`, `Rejected`, and
   `Deactivated` alike.
5. **FR-52 edit surface is exactly display name and self-declared role.** Email is
   read-only. No avatar, bio, social links, notification preferences, email change,
   self-deactivation, self-deletion, public profile page, or lifecycle/administrator
   edits (`EXPERIENCE.md` §9.4a).
6. **Deactivation preserves everything** — reports, Claims, Recovery Responses,
   messages, audit history (FR-5).

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| — | Root unit; no dependencies |

### Depended By
| Unit | Reason |
|------|--------|
| 002 | Needs ActorContext to apply the FR-39 visibility matrix |
| 003 | Needs actor and administrator flag for Claim decisions |
| 004 | Needs actor for selection and verification actions |
| 005 | Needs actor to record Returned and moderation actions |
| 007 | Needs the resolved actor for every surface |

### External Dependencies
| System | Purpose | Risk |
|--------|---------|------|
| Email provider | FR-27 approval email; FR-51 reset message | Medium — failure must not block approval (PRD §10) |

## Technical Context

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| PostgreSQL | DB | Transactions via Prisma |
| Email provider | Outbound | SMTP/HTTPS API |
| Vercel rate limiting | Inbound | Registration, login, password reset are rate-limited (PRD §10) |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Accounts | SQL | Small | **Indefinitely**, including after deactivation (FR-5) |
| Sessions | SQL | Moderate | Until expiry or revocation |
| Password reset tokens | SQL | Small | Purged after expiry or use |

## Constraints

- Adaptive password hashing (Argon2id); work factors set here
- `__Host-` session cookie: `HttpOnly`, `Secure`, `SameSite=Lax`
- CSRF token on every state-changing request
- Sessions are **database rows, not JWTs** — deactivation, logout, and reset must all
  be able to revoke server-side (PRD A2)
- Rate limits: registration, login, password reset

## Success Criteria

### Functional
- [ ] New user registers into `Pending` and sees a confirmation; **no email is sent**
- [ ] Administrator approves → account becomes `Active` and FR-27 email fires
- [ ] Administrator rejects → account becomes `Rejected`, reason recorded in audit, **no email**
- [ ] `Pending` user cannot report, claim, respond, or message
- [ ] `Rejected` and `Deactivated` users see the same generic login message
- [ ] Deactivation revokes all sessions immediately
- [ ] Password reset is neutral, rate-limited, single-use, and never changes state
- [ ] Member can edit display name and role; email is read-only

### Non-Functional
- [ ] Password hashing is adaptive with configurable work factors
- [ ] No secret, hash, or reset token ever appears in a log (coding-standards §Logging)
- [ ] Reset response timing does not reveal account existence

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-identity-1 | DDD | registration, approval, login, session | Account lifecycle and ActorContext |
| bolt-identity-2 | DDD | deactivation, password reset, profile | Security and account management |

## Notes

This unit is first in the dependency order and should be built first — every other
unit's tests need an `ActorContext`. FR-27 is placed here rather than in the
notifications unit because approval is an account-lifecycle action.

---

## Story Summary

- **Total Stories**: 10
- **Must Have**: 10
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-self-registration**: to register an account with my name, email, password, and self-declared role - must - Planned
  <br>traces: FR-1
- [ ] **002-administrator-review-of-registrations**: to approve or reject pending registrations - must - Planned
  <br>traces: FR-3, FR-27
- [ ] **003-login-with-active-account**: to log in with my email and password - must - Planned
  <br>traces: FR-2, FR-4
- [ ] **004-deactivate-an-account**: to deactivate a member's account - must - Planned
  <br>traces: FR-5
- [ ] **005-logout-revokes-session**: to log out - must - Planned
  <br>traces: FR-4
- [ ] **006-pending-member-restricted-access**: unapproved members cannot participate in FindBack - must - Planned
  <br>traces: FR-2
- [ ] **007-owner-rejects-registration**: to record why a registration was rejected - must - Planned
  <br>traces: FR-3
- [ ] **008-reset-request-never-discloses-account**: to request a password reset link - must - Planned
  <br>traces: FR-51
- [ ] **009-reset-password**: to set a new password - must - Planned
  <br>traces: FR-51
- [ ] **010-update-member-profile**: to view and edit my profile - must - Planned
  <br>traces: FR-52
