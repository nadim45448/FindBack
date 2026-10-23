---
id: 001-confirm-returned-default-receiver
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:47:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-23]
---

# Story: 001-confirm-returned-default-receiver

User Story

**As an** administrator
**I want** to confirm that an item was physically returned
**So that** the recovery is closed out with a recorded receiver

Acceptance Criteria

- [ ] **Given** a Found report with an `Approved` Claim, **When** the administrator confirms Returned with the approved claimant as receiver, **Then** the report becomes `Returned` and the confirmation records receiver, confirming administrator, and timestamp
- [ ] **Given** a Lost report whose selected response is `Match Confirmed`, **When** the administrator confirms Returned with the Lost-report owner as receiver, **Then** the report becomes `Returned` and the confirmation records receiver, confirming administrator, and timestamp
- [ ] **Given** a Found report, **When** the default receiver is derived, **Then** it is the approved claimant and not the finder
- [ ] **Given** a Lost report, **When** the default receiver is derived, **Then** it is the Lost-report owner
- [ ] **Given** any report, **When** Returned is confirmed by a non-administrator, **Then** the action is refused; only an administrator may confirm
- [ ] **Given** a Lost report, **When** the owner attempts to confirm Returned on their own report, **Then** the action is refused
- [ ] **Given** two administrators confirm Returned on the same report concurrently, **When** both are processed, **Then** exactly one commits and the other receives a conflict
- [ ] **Given** a Returned confirmation, **When** it is audited, **Then** the record contains no identifying details from the recovery conversation

Technical Notes

- Returned is confirmed by an **administrator only** (FR-23). This is the single implementation for both recovery directions — Unit 003 and Unit 004 must not each grow their own.
- The default receiver is derived, not chosen: Found → approved claimant, Lost → Lost-report owner.
- Email sends happen after commit; a send failure never rolls back or blocks the transition.

Dependencies

Requires
- 003-approve-a-claim (Unit 003, for the Found-side default receiver)
- 004-owner-determination-admin-records (Unit 004, for the Lost-side precondition)

Enables
- 004-complete-lost-verification-closeout

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Found report with no approved Claim | Cannot reach Returned; the precondition does not exist |
| Returned confirmed on a report already `Returned` or `Closed` | Refused; both are terminal |
| Confirming administrator is the finder or the owner | Permitted; the administrator flag governs, not the relationship |

Out of Scope

- Substitute receivers (story 002)
- The Lost-side atomic closeout of responses and threads (story 004)
- Verification determination (Unit 004, FR-43)