---
unit: 003-found-side-claims
intent: 001-findback-lost-and-found
phase: inception
status: stories-defined
created: 2026-10-23T12:30:00.000Z
updated: 2026-10-23T12:30:00.000Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Found-Side Claims

## Purpose

Owns the **Found-side recovery workflow end to end**: a member recognizes a Found
item as theirs and submits a Claim; administrators review and decide; competing
Claims resolve atomically; and the Claim carries its own message thread.

> This is a **separate state machine** from Unit 004. The two must never share a
> transition function, an aggregate, or a status enum.

## Scope

### In Scope
- Claim submission with reason, identifying details, and date lost (FR-15)
- Administrator Claim review screen data (FR-16)
- Approve with **atomic rejection of competing Pending Claims** (FR-17)
- Reject (FR-18)
- Found-side auto-status transitions (FR-22)
- Per-Claim message thread (FR-26)
- New-Claim email to the finder (FR-28)
- Claim-decision email to the claimant only (FR-29)

### Out of Scope
- Lost-side Recovery Responses — Unit 004
- Confirm Returned — Unit 005
- Email delivery mechanics and suppression rules — Units 005/007
- Rendering — Unit 007

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-15 | Submit a Claim | Must |
| FR-16 | Administrator Review Screen | Must |
| FR-17 | Approve a Claim | Must |
| FR-18 | Reject a Claim | Must |
| FR-22 | Auto-Status Transitions (Found-side) | Must |
| FR-26 | Per-Claim Thread | Must |
| FR-28 | New Claim Email (Found-side event 2) | Must |
| FR-29 | Claim Decision Email (Found-side event 3) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Claim | Assertion that a Found report is the claimant's | id, foundReportId, claimantId, reason, identifyingDetails, dateLost, status (`Pending`/`Approved`/`Rejected`), decisionReason, decidedByAdministratorId, decidedAt, createdAt |
| ClaimMessage | A message in a Claim's thread | id, claimId, authorId, body, createdAt |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `submitClaim` | Member claims a Found report | foundReportId, reason, identifyingDetails, dateLost, actor | `Pending` Claim + FR-28 trigger |
| `reviewClaimData` | Assemble the administrator review screen | claimId, actor | Claim + item details + competing-Claim indicator |
| `approveClaim` | Approve atomically | claimId, actingAdministrator | `Approved` Claim, competing Claims auto-rejected, report → `Claim Approved` |
| `rejectClaim` | Reject | claimId, reason, actingAdministrator | `Rejected` Claim, report returns to `Open` if no other Pending Claims |
| `postClaimMessage` | Post in the Claim thread | claimId, body, actor | Message |
| `autoRejectClaims` | Reject Pending Claims on an external trigger | trigger, reason | Rejected Claims |

## The state machine

```text
Claim:   Pending ──approve──► Approved (terminal)
         Pending ──reject───► Rejected (terminal)

Report:  Open ──claim submitted──► Claim Requested
         Claim Requested ──last Pending rejected──► Open
         Claim Requested ──approve──► Claim Approved
         Claim Requested ──reporter withdraws──► Closed
         Open ──reporter withdraws──► Closed
         Open | Claim Requested | Claim Approved ──administrator close──► Closed
```

There is **no `Closed` Claim status** (PRD §3).

## Rules this unit must not break

1. **Approval is atomic.** Approving one Claim auto-rejects every other Pending
   Claim on that Found report with reason "another claim was approved for this
   item", and moves the report to `Claim Approved` — **all in one transaction**
   (FR-17, D3).
2. **Auto-rejection has three distinct triggers with distinct audit reasons:**
   another Claim approved (FR-17), reporter withdrew (FR-11), administrator closed
   (FR-21/FR-36). Each carries its own reason.
3. **One Pending Claim at a time per item, per member** (FR-15). A member cannot
   claim their own report — returns 403 (FR-49).
4. **The finder does not see the claimant's reason or identifying details.** Those
   are visible only to the claimant and administrators (FR-37, FR-39, UJ-2).
5. **Claim-decision email goes to the claimant only.** The finder receives **no**
   Claim-decision email (FR-29, UJ-1, UJ-2).
6. **The Claim thread is read-only** once the Claim is `Approved` or `Rejected`, and
   when the report is `Returned` or `Closed` (FR-26, OQ-4 retired).
7. **User-facing auto-rejection copy is softened**; the audit reason stays verbatim
   (OQ-5, `EXPERIENCE.md` §4.4).

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 001 | ActorContext and administrator flag |
| 002 | The Found report and its status |
| 006 | Audit writes — FR-31 events 1–5 |

### Depended By
| Unit | Reason |
|------|--------|
| 005 | Items Awaiting Return queue and Confirm Returned act on approved Claims |

## Technical Context

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| PostgreSQL | DB | `SELECT ... FOR UPDATE` on the Found report |
| Email provider | Outbound | FR-28, FR-29 |
| 006 audit | DB write | Inside the same transaction |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Claims | SQL | Moderate | Parent report lifetime |
| Claim messages | SQL | Moderate | Parent report lifetime; never deleted |

## Constraints

- **Concurrency:** two administrators deciding the same Claim must not both succeed.
  Lock the report row first; a decision on a non-`Pending` Claim is a conflict, not
  a silent overwrite (UX-OQ-B).
- **Email after commit, never inside the transaction** — a send failure must not
  roll back or block the decision (PRD §10).
- Rate limiting on Claim submission (PRD §10).
- FR-14 date bound applies to `date lost`: ≤ 365 days, not future (FR-15).

## Success Criteria

### Functional
- [ ] Member submits a Claim with all three required fields
- [ ] Finder is notified (FR-28); finder never sees reason or identifying details
- [ ] Approval moves the Claim and the report atomically and rejects competitors
- [ ] Rejection returns the report to `Open` when no Pending Claims remain
- [ ] Competing-Claim count and reference are visible on the review screen
- [ ] Thread is writable while `Pending` and read-only after
- [ ] Claimant receives the decision email; finder receives none

### Non-Functional
- [ ] Concurrent approvals cannot both commit
- [ ] Email failure never rolls back the decision
- [ ] Claim submission is rate-limited

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-claims-1 | DDD | Claim submission, field validation, Claim aggregate | Found-side Claim model |
| bolt-claims-2 | DDD | review screen, approve with competing rejection, reject | Atomic decision logic |
| bolt-claims-3 | DDD | auto-transitions, per-Claim thread | FR-22 and FR-26 |

## Notes

FR-22 is assigned here because Found-side auto-transitions are triggered by Claim
events. Lost-side auto-transitions belong to Unit 004 under FR-42. This split is the
mechanical expression of the PRD's insistence that the two directions stay separate.

---

## Story Summary

- **Total Stories**: 8
- **Must Have**: 8
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-submit-a-claim**: to submit a claim with my reason, my identifying details, and the date I lost it - must - Planned
  <br>traces: FR-15
- [ ] **002-administrator-claim-review**: a review screen that shows a pending claim beside the item details and any competing pending claims - must - Planned
  <br>traces: FR-16
- [ ] **003-approve-a-claim**: approving a claim to approve that claim, auto-reject every competing pending claim, and move the report to `Claim Approved` as one indivisible action - must - Planned
  <br>traces: FR-17
- [ ] **004-reject-a-claim**: to reject a pending claim with a reason - must - Planned
  <br>traces: FR-18
- [ ] **005-auto-status-transitions**: the report's lifecycle status to change automatically and predictably as claims are submitted and decided - must - Planned
  <br>traces: FR-22
- [ ] **006-auto-reject-competing-claims**: every automatic claim rejection to record which of the three workflow triggers caused it - must - Planned
  <br>traces: FR-17
- [ ] **007-per-claim-message-thread**: one message thread per claim that closes when the claim is decided - must - Planned
  <br>traces: FR-26
- [ ] **008-claim-notification-emails**: an email when a claim arrives on my item and when my own claim is decided - must - Planned
  <br>traces: FR-28, FR-29
