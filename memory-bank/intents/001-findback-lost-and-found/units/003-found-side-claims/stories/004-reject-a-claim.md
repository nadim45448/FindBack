---
id: 004-reject-a-claim
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-18]
---

# Story: 004-reject-a-claim

User Story

**As an** administrator
**I want** to reject a pending claim with a reason
**So that** an unsupported claim is declined on the record and the item can stay open for a genuine owner

Acceptance Criteria

- [ ] **Given** a `Pending` claim, **When** an administrator rejects it with a reason of 10-500 characters, **Then** the claim status becomes `Rejected`
- [ ] **Given** a reason shorter than 10 characters or longer than 500 characters, **When** an administrator attempts to reject, **Then** the rejection is refused and the claim remains `Pending`
- [ ] **Given** a rejected claim, **When** the rejection commits, **Then** an audit event records the administrator, claim ID, item ID, the reason, and the timestamp
- [ ] **Given** a rejected claim, **When** the item status does not change because other `Pending` claims remain, **Then** the rejected claim's audit entry is still retained
- [ ] **Given** a rejected claim that was the only `Pending` claim on the report, **When** the rejection commits, **Then** the Found report lifecycle status returns to `Open`
- [ ] **Given** a rejected claim while other `Pending` claims remain on the report, **When** the rejection commits, **Then** the Found report lifecycle status remains `Claim Requested`
- [ ] **Given** a committed rejection, **When** the transaction commits, **Then** a claim decision email carrying the reason is sent to the rejected claimant
- [ ] **Given** a committed rejection, **When** the emails are dispatched, **Then** no claim decision email of any kind is sent to the finder (reporter) of the Found report
- [ ] **Given** an administrator attempting to reject a claim that is no longer `Pending`, **When** they submit the rejection, **Then** the request is refused as a conflict and the existing decision is left unchanged
- [ ] **Given** a non-administrator actor, **When** they attempt to reject a claim, **Then** the action is refused and the claim status is unchanged

Technical Notes

- A rejection is an administrator decision, not an auto-rejection. The audit event is event 4 (claim rejected by administrator); the three auto-rejection triggers are event 5 and belong to story 006
- The return to `Open` is evaluated against the count of remaining `Pending` claims on that report, in the same transaction as the rejection
- Rejected claims and their history are retained; nothing is deleted on rejection
- Emails are dispatched only after commit (story 008)

Dependencies

Requires
- 002-administrator-claim-review
- 001-submit-a-claim

Enables
- 005-auto-status-transitions
- 007-per-claim-message-thread
- 008-claim-notification-emails

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Last pending claim is rejected | Report returns to `Open` and accepts a new claim |
| One of several pending claims is rejected | Report stays `Claim Requested`; the other claims are untouched |
| Reason exactly 10 characters | Accepted at the boundary; refused below 10 |
| Two administrators reject competing claims concurrently | Each rejection applies to its own claim; the last one to commit returns the report to `Open` |
| Report is already `Claim Approved` when a rejection is attempted | Conflict; the approved state is unchanged |

Out of Scope

- Approving a claim (story 003)
- Auto-rejection on approval, withdrawal, or closure (story 006)
- The reject-confirmation modal copy (Unit 007)
---
