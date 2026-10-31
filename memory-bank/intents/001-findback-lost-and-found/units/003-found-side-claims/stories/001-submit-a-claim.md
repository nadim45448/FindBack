---
id: 001-submit-a-claim
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 013-claim-submit
implemented: true
traces_to: [FR-15]
---

# Story: 001-submit-a-claim

User Story

**As a** member who believes they lost an item that has been found
**I want** to submit a claim with my reason, my identifying details, and the date I lost it
**So that** an administrator can decide whether the found item is mine

Acceptance Criteria

- [x] **Given** an `Active` member viewing a Found report, **When** they submit a claim with a reason of 20-1000 characters, identifying details of 10-500 characters, and a date lost, **Then** a Claim is created in `Pending` status linked to that Found report
- [x] **Given** a date lost more than 365 days before today, **When** the claim is submitted, **Then** submission is refused with a validation error and no Claim is created
- [x] **Given** a date lost in the future, **When** the claim is submitted, **Then** submission is refused with a validation error and no Claim is created
- [x] **Given** a reason shorter than 20 characters or longer than 1000 characters, **When** the claim is submitted, **Then** submission is refused with a validation error and no Claim is created
- [x] **Given** identifying details shorter than 10 characters or longer than 500 characters, **When** the claim is submitted, **Then** submission is refused with a validation error and no Claim is created
- [x] **Given** the member already has a `Pending` claim on the same item, **When** they submit another claim, **Then** submission is refused and the existing `Pending` claim is left unchanged
- [x] **Given** the member's previous claim on the same item is `Rejected`, **When** they submit a new claim, **Then** a new `Pending` claim is created alongside the retained history
- [x] **Given** a member attempting to claim a Found report they authored, **When** they submit the claim, **Then** the request returns HTTP 403 and no Claim is created
- [x] **Given** an actor whose account is not `Active`, **When** they attempt to submit a claim, **Then** the request returns HTTP 403 with a clear message and no Claim is created
- [x] **Given** a successful claim submission, **When** the transaction commits, **Then** an audit event records the actor (claimant), claim ID, item ID, reason, identifying details, date lost, and timestamp
- [x] **Given** a successful claim submission on a Found report whose status is `Open`, **When** the transaction commits, **Then** the Found report lifecycle status becomes `Claim Requested`
- [x] **Given** a successful claim submission, **When** the transaction commits, **Then** the FR-28 new-claim email is dispatched to the reporter (finder) of that Found report
- [x] **Given** claim submissions exceeding the configured rate limit, **When** a further claim is submitted, **Then** submission is refused and no Claim is created

Technical Notes

- This is the Found-side Claim aggregate. No Recovery Response state, status, or transition may be referenced or reused here (Unit 004 owns that separate machine)
- The `date lost` bound is the FR-14 rule applied to a claim field: at most 365 days old and never in the future
- All three fields are validated before any row is written; a refused submission writes nothing to the Claim, the report, or the audit trail
- The one-`Pending`-Claim-per-item-per-member rule is enforced by a database uniqueness constraint, not only by an application check
- The 403 on claiming one's own report is enforced at the API layer, not in the UI (FR-49)
- The FR-28 email is dispatched after commit and never inside the submission transaction (story 008)
- Rate limiting follows `standards/system-architecture.md` §Rate limiting

Dependencies

Requires
- 003-login-with-active-account (Unit 001)
- 002-create-found-item-report (Unit 002)

Enables
- 002-administrator-claim-review
- 003-approve-a-claim
- 004-reject-a-claim
- 006-auto-reject-competing-claims
- 007-per-claim-message-thread
- 008-claim-notification-emails

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Date lost is exactly 365 days before today | Accepted; the bound is inclusive |
| Date lost is today | Accepted; only future dates are refused |
| Reason exactly 20 chars, identifying details exactly 10 chars | Accepted at the boundary; refused outside the boundary |
| Two submissions from the same member in the same moment | Uniqueness constraint refuses the second; exactly one `Pending` claim exists |
| Report is `Claim Approved` when the member submits | Refused; a decided report accepts no new claim |
| Report is `Closed` when the member submits | Refused; a closed report accepts no new claim |
| Member deactivated between opening the form and submitting | Refused with HTTP 403; no Claim created |

Out of Scope

- Editing or withdrawing a submitted Claim
- Claim approval and rejection (stories 003 and 004)
- Claim thread messages (story 007)
- Email delivery mechanics, retries, and suppression (Units 005/007)
---
