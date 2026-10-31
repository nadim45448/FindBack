---
id: 003-approve-a-claim
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 016-claim-decisions
implemented: true
traces_to: [FR-17]
---

# Story: 003-approve-a-claim

User Story

**As an** administrator
**I want** approving a claim to approve that claim, auto-reject every competing pending claim, and move the report to `Claim Approved` as one indivisible action
**So that** exactly one claimant ever wins an item and no item is left in a contradictory state

Acceptance Criteria

- [x] **Given** a `Pending` claim, **When** an administrator approves it, **Then** the claim status becomes `Approved` and the approving administrator and timestamp are recorded
- [x] **Given** a `Pending` claim with no other `Pending` claims on the item, **When** an administrator approves it, **Then** the Found report lifecycle status becomes `Claim Approved`
- [x] **Given** a `Pending` claim with other `Pending` claims on the same item, **When** an administrator approves it, **Then** every other `Pending` claim on that report becomes `Rejected` with audit reason "another claim was approved for this item"
- [x] **Given** a claim auto-rejected by an approval, **When** the approval commits, **Then** its Claim history is preserved and is not deleted
- [x] **Given** a claim auto-rejected by an approval, **When** the approval commits, **Then** a separate audit event is recorded for that auto-rejection with `triggered_by` set to the approving administrator, `triggering_action` set to Claim approval, and reason "another claim was approved for this item"
- [x] **Given** an approval that auto-rejects competing claims, **When** the approval commits, **Then** the claim approval and every auto-rejection and the report status change were written in a single transaction
- [x] **Given** any failure while writing the approval, the auto-rejections, or the report status change, **When** the transaction is rolled back, **Then** no claim is approved, no competing claim is rejected, and the report status is unchanged
- [x] **Given** two administrators approving two different claims on the same item at the same time, **When** both attempt to commit, **Then** only the first decision commits and the second receives a conflict response with no partial write
- [x] **Given** an administrator attempting to approve a claim that is no longer `Pending`, **When** they submit the approval, **Then** the request is refused as a conflict and the existing decision is left unchanged
- [x] **Given** a committed approval, **When** the transaction commits, **Then** a claim decision email is sent to the approved claimant and to each auto-rejected claimant
- [x] **Given** a committed approval, **When** the emails are dispatched, **Then** no claim decision email of any kind is sent to the finder (reporter) of the Found report

Technical Notes

- Approval is atomic and is implemented as a database-level atomic write per item (FR-17, D3). The Found report row is locked with `SELECT ... FOR UPDATE` before the decision is applied
- A decision on a non-`Pending` claim is a conflict surfaced to the administrator, never a silent overwrite (UX-OQ-B)
- The audit reason "another claim was approved for this item" is stored verbatim; the user-facing copy of that auto-rejection is softened (story 006)
- Audit writes for the approval and each auto-rejection occur inside the same transaction as the state change
- Emails are dispatched only after commit; a send failure never rolls back or blocks the decision (story 008)

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
| Approval is the only pending claim | Only the approved claim changes; no auto-rejection events are written |
| One claim remains `Pending` after auto-rejection | Not possible: every other `Pending` claim on the report is rejected, so zero remain |
| A competing claim was already `Rejected` | Left untouched; no duplicate auto-rejection event is written for it |
| Two administrators approve the same claim concurrently | One commits, the other receives a conflict and takes no action |
| Administrator's session ends mid-approval | The transaction rolls back as a unit; the item is never left with an approved claim and pending competitors |
| Email provider is unavailable after commit | The approval stands; the send failure does not roll back or block the decision |

Out of Scope

- Rejecting a claim on the administrator's initiative (story 004)
- Auto-rejection triggered by reporter withdrawal or administrator closure (story 006)
- Confirm Returned and handover (Unit 005)
---
