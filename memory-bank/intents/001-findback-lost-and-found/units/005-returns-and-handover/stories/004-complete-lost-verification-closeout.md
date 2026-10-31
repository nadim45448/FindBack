---
id: 004-complete-lost-verification-closeout
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:48:30Z
assigned_bolt: 020-returns-moderation
implemented: true
traces_to: [FR-45]
---

# Story: 004-complete-lost-verification-closeout

User Story

**As an** administrator
**I want** confirming a Lost return to resolve every recovery response at once
**So that** no responder is left in limbo after the item goes back to its owner

Acceptance Criteria

- [x] **Given** a Lost report with a selected response in `Match Confirmed`, **When** Returned is confirmed, **Then** in ONE transaction: the report becomes `Returned`, the matched response becomes `Completed — Report Returned`, and every other non-terminal response becomes `Resolved — Report Returned`
- [x] **Given** that same closeout, **When** it commits, **Then** every per-Recovery-Response thread on the report becomes read-only
- [x] **Given** that same closeout, **When** it commits, **Then** email events 7 (to the Lost-report owner) and 8 (to the matched responder) fire
- [x] **Given** the closeout, **When** any part fails, **Then** the entire transaction rolls back and no partial state exists
- [x] **Given** a response already in a terminal status before the closeout, **When** the closeout runs, **Then** that response is left as it was
- [x] **Given** a standby responder, **When** the closeout runs, **Then** they receive event 8 only if they are the matched responder; no other responder receives event 8
- [ ] **Given** the Items Awaiting Return queue, **When** it is assembled, **Then** it lists reports whose Lost side is `Match Confirmed` and which have not yet been confirmed Returned — **deferred to bolt `021` (Unit 007): the queue is a surface, and this bolt delivers the backend it reads**
- [ ] **Given** the confirm-returned form, **When** it is assembled for a Lost report, **Then** it shows the Lost-report owner as the default receiver and the matched response as context — **deferred to bolt `021` (Unit 007): the form is a surface, and this bolt delivers the reader it reads**

Technical Notes

- This is the single most atomic transition in the system. Report status, every response status, every thread lock, and both notifications are one unit of work.
- Event 8 is gated on `Completed — Report Returned` **plus** report `Returned`. It does not fire at `Match Confirmed`, which is why a non-terminal status exists there at all.
- Standby responders are resolved but not notified as the matched party — receiving event 8 would tell someone the item was not theirs to keep.

Dependencies

Requires
- 001-confirm-returned-default-receiver
- 004-owner-determination-admin-records (Unit 004)

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Matched responder's account deactivated before closeout | Event 8 send fails or is skipped; the transition still commits |
| Three or more non-terminal responses | All resolve in the same transaction as the matched one |
| Closeout attempted twice | Second attempt refused; the report is terminal |
| A thread post races the closeout | Exactly one succeeds; the thread locks on commit |

Out of Scope

- Found-side return resolution, which has no response fan-out
- Verification determination (Unit 004, FR-43)
- Substitute receiver rules (story 002)