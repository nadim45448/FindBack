---
id: 001-append-only-audit-writes
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:51:00.000Z
assigned_bolt: 001-audit-core
implemented: true
traces_to:
  - FR-31
---

# Story: 001-append-only-audit-writes

User Story

**As the system**
I want to write an audit record inside the same transaction as every state change
**So that** the trail is complete by construction rather than by diligence

Acceptance Criteria

- [ ] **Given** any state-changing action in the system, **When** it commits, **Then** its audit record is present in the same transaction
- [ ] **Given** a state-changing action that rolls back, **When** the rollback completes, **Then** no audit record for that action exists
- [ ] **Given** an audit record is written, **When** it is stored, **Then** it carries the event number or non-numbered marker, actor, acting administrator where applicable, target, and timestamp
- [ ] **Given** FR-31 events 1 through 14, **When** any of them fires, **Then** it is recorded with actor and timestamp
- [ ] **Given** an audit write, **When** it is inspected, **Then** it contains no password, hash, or token, and no FR-37 value that the event's catalog entry does not name. A field the catalog *does* name for that event — the claim reason and identifying details on event 2, the where-found and observed identifying details on event 15, the thread message text on events 14 and 16 — is recorded on the administrator-only trail, and is never written to an operational log
- [ ] **Given** a caller that attempts to write an audit record outside its transaction, **When** the attempt is made, **Then** it is refused

Technical Notes

- Audit is written **inside** the caller's transaction. Writing it afterwards would allow an entry for a transition that never happened.
- This unit is the write path every other unit calls. Building it early is what makes "the trail is complete" a property of the architecture instead of of anyone's memory.
- The no-update, no-delete guarantee is story 004.

Dependencies

Requires
- None (this unit depends on nothing)

Enables
- 002-lost-side-audit-events
- 004-append-only-enforcement
- 005-audit-visibility-and-read-logging

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Transaction retries | No duplicate audit record; the record is tied to the committed attempt |
| Audit write fails while the state change would succeed | The whole transaction fails; an unaudited change is never committed |
| Actor's account is deactivated afterwards | The record still names that actor; it is never rewritten |

Out of Scope

- Deciding which event fires — that belongs to the acting unit
- Audit visibility and read logging (story 005)
- Lost-side events 15–30 (story 002)