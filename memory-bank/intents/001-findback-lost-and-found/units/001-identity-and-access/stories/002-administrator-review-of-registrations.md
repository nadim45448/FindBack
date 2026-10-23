---
id: 002-administrator-review-of-registrations
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:41:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-3, FR-27]
---

# Story: 002-administrator-review-of-registrations

User Story

**As an** administrator
**I want** to approve or reject pending registrations
**So that** only vetted members can use FindBack

Acceptance Criteria

- [ ] **Given** a `Pending` account, **When** the administrator approves it, **Then** the account becomes `Active` and the approval email (FR-27) is sent to the account's email address
- [ ] **Given** a `Pending` account, **When** the administrator rejects it with a reason, **Then** the account becomes `Rejected`, the reason is recorded in the audit trail, and **no** email is sent
- [ ] **Given** a `Pending` account, **When** the administrator approves or rejects, **Then** an audit event is recorded with the acting administrator and timestamp
- [ ] **Given** a non-`Pending` account, **When** the administrator attempts a decision, **Then** the action is refused because the account is no longer pending
- [ ] **Given** a non-administrator actor, **When** they attempt a decision, **Then** the action is refused with an authorization error
- [ ] **Given** an approval whose email send fails, **When** the failure is recorded, **Then** the approval still stands and the failure is logged without sensitive values

Technical Notes

- Only approval sends an email (FR-1, FR-27). Rejection sends none.
- The rejection reason is stored and audited but is never surfaced to the user in any response
- Email is sent **after** the transaction commits, so a send failure cannot roll back or block the decision

Dependencies

Requires
- 001-self-registration

Enables
- 003-login-with-active-account
- 004-deactivate-an-account

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Two administrators decide the same account concurrently | Exactly one decision commits; the other receives a conflict |
| Approval with an invalid stored email address | Approval stands; send failure logged |
| Rejection reason left blank | Rejected without a reason string |

Out of Scope

- Sending the account-approved email content (Unit 007 notification rendering)
- Auditing mechanics (Unit 006)