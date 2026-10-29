---
id: 006-withdraw-own-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00.000Z
assigned_bolt: null
implemented: true
traces_to:
  - FR-11
  - FR-20
---

# Story: 006-withdraw-own-report

User Story

**As a** member who no longer needs a report to stay active
**I want** to withdraw my own report
**So that** it leaves active listings without destroying the record

Acceptance Criteria

- [ ] **Given** a Found report in status `Open` or `Claim Requested`, **When** the owner withdraws it, **Then** the report transitions to `Closed` and is removed from active listings
- [ ] **Given** a Found report in status `Claim Approved`, `Returned`, or `Closed`, **When** the owner attempts to withdraw it, **Then** the withdrawal is blocked
- [ ] **Given** a Found report in `Claim Requested` that is withdrawn, **When** Pending Claims exist on it, **Then** every Pending Claim transitions to `Rejected` with audit reason "report withdrawn by reporter" and Claim history is preserved
- [ ] **Given** a Found report withdrawal that auto-rejects Pending Claims, **When** the auto-rejections occur, **Then** per-Claim threads become read-only and the Claim rejection email (FR-29) is sent to each affected claimant
- [ ] **Given** a Lost report in status `Open` or `Verification Pending` before Match Confirmed has been recorded, **When** the owner withdraws it, **Then** the report transitions to `Closed`
- [ ] **Given** a Lost report withdrawal, **When** non-terminal Recovery Responses exist on it, **Then** every non-terminal Recovery Response, including any currently `Selected for Verification` and all `Submitted`, transitions to `Resolved — Report Closed`, and threads become read-only
- [ ] **Given** a Lost report withdrawal, **When** dependent records are resolved, **Then** history is preserved and no closure email is sent to responders (FR-30)
- [ ] **Given** a Lost report after Match Confirmed has been recorded, **When** the owner attempts to withdraw it, **Then** the withdrawal is blocked
- [ ] **Given** any report the owner withdraws, **When** the withdrawal completes, **Then** the report's status is `Closed` and never `Returned`
- [ ] **Given** any report the owner withdraws, **When** the withdrawal is recorded in the audit trail, **Then** an audit entry is created with actor and timestamp
- [ ] **Given** a withdrawn report, **When** the owner views My Reports, **Then** the report is still retrievable there, and members browsing listings do not see it
- [ ] **Given** a withdrawn report, **When** an administrator views history, **Then** the report and its history remain available

Technical Notes

- Withdrawal reaches `Closed`, never `Returned`. There is no path by which a reporter action produces a `Returned` status.
- Withdrawal rules differ by report type. Found: allowed on `Open` and `Claim Requested`, blocked on `Claim Approved`, `Returned`, `Closed`. Lost: allowed on `Open` and `Verification Pending` before Match Confirmed is recorded, blocked once Match Confirmed is recorded, and blocked on `Returned` and `Closed`.
- `Match Confirmed` is a Recovery Response status, not a Lost-report lifecycle status. The withdrawal guard tests whether that Recovery Response status has been recorded on the report.
- Withdrawal is the remaining path when hard deletion is unavailable because an interaction exists (FR-10).
- Found-side withdrawal writes FR-31 audit event 9 with actor, Found report ID, and the previous lifecycle status. Lost-side withdrawal uses FR-48 event 23, not event 9.
- Dependent-record resolution happens in the same transaction as the report transition; thread read-only state follows the dependent records.
- The My Reports retrieval rule is governed by FR-49, not FR-28.

Dependencies

Requires
- 001-create-lost-item-report
- 002-create-found-item-report

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `Closed` report withdrawn again | Blocked; the report is already terminal |
| Found report in `Claim Requested` with a mix of Pending, Approved, and Rejected Claims | Only Pending Claims transition to `Rejected`; other Claim records are preserved unchanged |
| Lost report withdrawn with an RR in `Match Confirmed` | Withdrawal is blocked |
| Lost report withdrawn with an RR in `Not a Match` | Allowed; the already-terminal RR is preserved unchanged |
| Withdrawal attempted by a non-owner | Refused |
| Withdrawal attempted after `Returned` | Blocked; the report has reached a terminal state |

Out of Scope

- Hard deletion of an interacting report (story 005)
- Claim auto-rejection causes other than withdrawal (FR-17 approval, FR-21 closure)
- Recovery Response status machine (Unit 004)
- Administrator close action (FR-21)
- Emails to responders on closure (FR-30 — not sent)
