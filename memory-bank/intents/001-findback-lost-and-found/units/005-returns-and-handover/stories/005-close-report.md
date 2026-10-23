---
id: 005-close-report
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:49:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-21]
---

# Story: 005-close-report

User Story

**As an** administrator
**I want** to close a report that should not proceed
**So that** the workflow ends without implying a successful recovery

Acceptance Criteria

- [ ] **Given** a report in `Open`, `Claim Requested`, `Claim Approved`, or `Verification Pending`, **When** the administrator closes it with a reason, **Then** the report becomes `Closed` (terminal)
- [ ] **Given** a Lost report in `Verification Pending` whose selected response has NOT reached `Match Confirmed`, **When** the report is closed, **Then** in the SAME transaction every non-terminal response becomes `Resolved — Report Closed`
- [ ] **Given** a Lost report whose selected response HAS reached `Match Confirmed`, **When** closure is attempted, **Then** it is refused as an ordinary close and requires the exceptional-administrator path
- [ ] **Given** the exceptional post-`Match Confirmed` cancellation, **When** it is performed, **Then** a documented reason is required and the action is recorded as FR-48 audit event 25
- [ ] **Given** a Found report with `Pending` Claims, **When** the report is closed, **Then** those Claims are auto-rejected with the administrator-close trigger reason
- [ ] **Given** any closure, **When** it completes, **Then** no email is sent to any responder or claimant
- [ ] **Given** a closure, **When** it completes, **Then** no record is hard-deleted; reports, responses, messages, and audit entries all remain
- [ ] **Given** a report already `Returned` or `Closed`, **When** closure is attempted, **Then** it is refused because the report is terminal
- [ ] **Given** a non-administrator attempts closure, **When** the action is attempted, **Then** it is refused

Technical Notes

- Closure must never read as a recovery. That is why it reaches `Closed` and never `Returned`, why it sends no responder email, and why it requires a reason.
- The post-`Match Confirmed` path is deliberately awkward. Once an owner has determined a match, quietly closing the report would erase a determination that a person made in good faith.
- FR-36 content removal reuses this unit's audit path but is a separate action (story 006).

Dependencies

Requires
- 003-no-receiver-no-returned-guard

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Close attempted while a confirmation is in flight | Exactly one terminal transition commits |
| Report with no responses or claims closed | Reaches `Closed` normally |
| Close reason omitted | Refused; a reason is required |
| Administrator closes a report that is already `Closed` | Idempotent; no duplicate audit entry |

Out of Scope

- Confirm Returned (stories 001–004)
- Content removal specifics (story 006)
- Removing individual messages, which never happens