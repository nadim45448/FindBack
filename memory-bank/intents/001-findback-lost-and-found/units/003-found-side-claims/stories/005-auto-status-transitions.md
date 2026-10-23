---
id: 005-auto-status-transitions
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-22]
---

# Story: 005-auto-status-transitions

User Story

**As a** member or administrator acting on a Found report
**I want** the report's lifecycle status to change automatically and predictably as claims are submitted and decided
**So that** the item's state always reflects what is happening to it

Acceptance Criteria

- [ ] **Given** a Found report in `Open` with no `Pending` claims, **When** the first claim is submitted, **Then** the report status becomes `Claim Requested`
- [ ] **Given** a Found report already in `Claim Requested`, **When** an additional claim is submitted, **Then** the report status remains `Claim Requested`
- [ ] **Given** a Found report in `Claim Requested`, **When** the last remaining `Pending` claim on it is rejected or auto-rejected, **Then** the report status becomes `Open`
- [ ] **Given** a Found report in `Claim Requested`, **When** a `Pending` claim on it is approved, **Then** the report status becomes `Claim Approved`
- [ ] **Given** a Found report in `Open`, **When** the reporter withdraws the report, **Then** the report status becomes `Closed`
- [ ] **Given** a Found report in `Claim Requested`, **When** the reporter withdraws the report, **Then** the report status becomes `Closed`
- [ ] **Given** a Found report in `Open`, `Claim Requested`, or `Claim Approved`, **When** an administrator closes the report, **Then** the report status becomes `Closed`
- [ ] **Given** a Found report in a non-terminal status, **When** no human action has occurred, **Then** the system never auto-transitions the report directly to `Returned` or `Closed`
- [ ] **Given** a Found report, **When** a `Returned` status would be reached, **Then** reaching `Returned` requires an explicit administrator Confirm Returned action
- [ ] **Given** a report in `Returned` or `Closed`, **When** any further status change is attempted, **Then** the report is terminal and remains in its status
- [ ] **Given** any claim status value in the system, **When** the Claim status enum is inspected, **Then** it contains only `Pending`, `Approved`, and `Rejected` and there is no `Closed` Claim status

Technical Notes

- This is the Found-side report state machine only. Lost-side auto-transitions are governed by FR-42 in Unit 004 and share no transition function, aggregate, or status enum with this machine
- Report lifecycle statuses: `Open`, `Claim Requested`, `Claim Approved`, `Returned`, `Closed`. Both `Returned` and `Closed` are terminal
- Claim statuses are a different, smaller enum: `Pending`, `Approved`, `Rejected`. A `Closed` report does not imply any `Closed` Claim status
- `Claim Approved` can reach `Closed` only through administrator close (or withdrawal is not available after a decision), never through a claim event
- Withdrawal and close triggers are owned by Unit 002 and this unit respectively, but the resulting Found-side status values are fixed here
- Every transition is written in the same transaction as the claim event that caused it

Dependencies

Requires
- 001-submit-a-claim
- 003-approve-a-claim
- 004-reject-a-claim
- 006-auto-reject-competing-claims

Enables
- Items Awaiting Return queue consumption in Unit 005

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| First claim submitted on an `Open` report | `Open` to `Claim Requested`, once only |
| Competing claim auto-rejected by an approval | Report goes to `Claim Approved`; the auto-rejection does not also drive it back to `Open` |
| Last pending claim auto-rejected on withdrawal | Report becomes `Closed`; the `Open` return rule does not apply because withdrawal is terminal |
| Report already `Claim Approved` when administrator closes it | `Claim Approved` to `Closed` is permitted; no `Pending` claims remain to auto-reject |
| Report in `Returned` when a claim event occurs | Refused; `Returned` is terminal |

Out of Scope

- Lost-report auto-status transitions (FR-42, Unit 004)
- Confirm Returned and receiver substitution (Unit 005)
- Removal of inappropriate content beyond its effect on report status (FR-36, Unit 006)
---
