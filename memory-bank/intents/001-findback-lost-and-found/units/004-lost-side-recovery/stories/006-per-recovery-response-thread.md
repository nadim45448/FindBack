---
id: 006-per-recovery-response-thread
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:49:30Z
assigned_bolt: 018-lost-threads
implemented: true
traces_to: [FR-47]
---

# Story: 006-per-recovery-response-thread

User Story

**As a** responder
**I want** a private message thread on my own Recovery Response
**So that** I can sort out details without exposing other responders' conversations

Acceptance Criteria

- [x] **Given** a response in `Submitted`, `Selected for Verification`, or `Match Confirmed`, **When** an authorized participant posts a message, **Then** the message is added to that response's thread
- [x] **Given** a response in any terminal status, **When** a message is posted, **Then** the post is refused
- [x] **Given** the parent report is `Returned` or `Closed`, **When** a message is posted on any of its responses, **Then** the post is refused
- [x] **Given** two competing responders on the same Lost report, **When** responder A requests responder B's thread, **Then** the request is refused at the API layer
- [x] **Given** a thread that becomes read-only, **When** it is viewed, **Then** all prior messages remain visible in order and none have been deleted
- [x] **Given** a Lost report in verification, **When** an administrator views it, **Then** every response's thread is visible, including those of standby responders
- [x] **Given** a cross-thread access attempt, **When** it is made, **Then** it is denied by the server rather than hidden by the interface
- [x] **Given** a thread participant list, **When** it is assembled, **Then** it is derived from that single response's participants only, never from the parent report's other responses

Technical Notes

- **One thread per Recovery Response, never one per Lost report** (FR-47, D6). A per-report thread would leak every candidate's conversation to every other candidate.
- Isolation is enforced at the API layer, not by hiding links in the UI. A display-only boundary is not a boundary.
- Writable while `Submitted`, `Selected for Verification`, or `Match Confirmed`; read-only at any terminal status or when the parent report is `Returned`/`Closed`.

Dependencies

Requires
- 002-recovery-response-status-model

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Owner is also the selected responder | Not permitted by FR-49; the owner cannot respond to their own report |
| Post attempted concurrently with the report reaching `Returned` | Exactly one succeeds; the thread locks on the transition |
| Empty message body | Validation failure |
| Long thread | Paginated; ordering is stable |

Out of Scope

- Per-Claim threads, which belong to Unit 003 (FR-26) and use different rules
- Any notification for a new thread message
- Message editing or deletion