---
id: 006-pending-member-restricted-access
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:43:00.000Z
assigned_bolt: 004-identity-core
implemented: true
traces_to:
  - FR-2
---

# Story: 006-pending-member-restricted-access

User Story

**As the system**
I want to enforce that a `Pending` account can do nothing except wait
**So that** unapproved members cannot participate in FindBack

Acceptance Criteria

- [ ] **Given** a `Pending` account, **When** the account attempts to create a Lost or Found report, **Then** the action is refused
- [ ] **Given** a `Pending` account, **When** the account attempts to submit a Claim or a Recovery Response, **Then** the action is refused
- [ ] **Given** a `Pending` account, **When** the account attempts to post in any Claim or Recovery Response thread, **Then** the action is refused
- [ ] **Given** a `Pending` account, **When** the account requests any administrator surface, **Then** the request is refused
- [ ] **Given** a `Pending` account, **When** the account resolves to an `ActorContext`, **Then** the context carries the `Pending` status so that downstream units enforce the same restriction without re-deriving it
- [ ] **Given** a status change from `Pending` to `Active`, **When** the restriction is evaluated, **Then** the same account is no longer restricted, with no data migration required

Technical Notes

- The restriction is enforced once, at the `ActorContext` boundary, not re-implemented per unit — that is the point of Unit 001 being the root unit
- Refusals are audited where they represent a meaningful lifecycle attempt; they are not errors

Dependencies

Requires
- 001-self-registration
- 003-login-with-active-account

Enables
- All other units, which rely on `ActorContext` carrying a usable status

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Account approved mid-request | The in-flight request still applies the pre-approval context |
| Administrator flag set on a `Pending` account | Still restricted; flag alone grants nothing before approval |
| Stale cached `ActorContext` after deactivation | Status re-read per request, never cached across requests |

Out of Scope

- Allowing `Pending` members to browse listings
- Any exception path for `Pending` members