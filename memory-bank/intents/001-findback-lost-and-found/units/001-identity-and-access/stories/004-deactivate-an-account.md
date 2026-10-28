---
id: 004-deactivate-an-account
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:42:00Z
assigned_bolt: 005-identity-security
implemented: false
traces_to: [FR-5]
---

# Story: 004-deactivate-an-account

User Story

**As an** administrator
**I want** to deactivate a member's account
**So that** the member can no longer act, while their history stays intact

Acceptance Criteria

- [ ] **Given** an `Active` account, **When** the administrator deactivates it, **Then** the account becomes `Deactivated` and every open session for that account is revoked
- [ ] **Given** an account with reports, Claims, or Recovery Responses, **When** the account is deactivated, **Then** all of those records and their messages remain intact and unaltered
- [ ] **Given** a deactivation, **When** it completes, **Then** an audit event is recorded with the acting administrator and timestamp
- [ ] **Given** a deactivated member with an existing session, **When** they make any request, **Then** the session is treated as unauthenticated
- [ ] **Given** a deactivated member, **When** they attempt to log in, **Then** the generic inactive-account message is returned and no session is created
- [ ] **Given** a non-administrator actor, **When** they attempt to deactivate an account, **Then** the action is refused

Technical Notes

- Deactivation is **not** deletion. The account row is retained indefinitely (FR-5)
- Session revocation happens in the same transaction as the status change, so there is no window where a deactivated account holds a live session
- A deactivated member's audit entries must never be back-filled or rewritten to hide the actor

Dependencies

Requires
- 003-login-with-active-account

Enables
- None directly; every unit depends on the invariant it establishes

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Administrator deactivates another administrator | Permitted — the target's administrator flag confers no protection. The deactivated account's stored flag is cleared, so no stale privilege remains. *Amended 2026-10-28 on owner confirmation to match PRD FR-5, which says only "An administrator can deactivate an Active account" and states no self-preservation rule. The previous "refused by policy" reading created a trap — the last remaining administrator could never be deactivated by anyone — and the PRD nowhere carries an escalation path.* |
| Account with an in-flight request during deactivation | Request completes under the prior actor context; next request is unauthenticated |
| Deactivating an already `Deactivated` account | Idempotent no-op, no duplicate audit entry |

Out of Scope

- Account deletion
- Reactivation
- Anonymizing historical content