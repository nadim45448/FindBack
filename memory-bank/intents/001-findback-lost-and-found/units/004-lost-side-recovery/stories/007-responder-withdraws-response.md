---
id: 007-responder-withdraws-response
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:50:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-40]
---

# Story: 007-responder-withdraws-response

User Story

**As a** responder
**I want** to withdraw my Recovery Response
**So that** I can step back from a claim that is no longer accurate

Acceptance Criteria

- [ ] **Given** a response in `Submitted` that has not been selected, **When** the responder withdraws it, **Then** the response becomes `Withdrawn` (terminal)
- [ ] **Given** a response in `Selected for Verification`, **When** the responder attempts to withdraw it, **Then** the withdrawal is refused because selection is now the owner's decision in progress
- [ ] **Given** a response in `Match Confirmed` or any terminal status, **When** withdrawal is attempted, **Then** it is refused
- [ ] **Given** a withdrawn response, **When** the Lost report is in `Verification Pending` because of a different selection, **Then** the report status is unaffected
- [ ] **Given** a responder whose account has been deactivated, **When** their existing responses are inspected, **Then** the responses remain intact and their history is preserved
- [ ] **Given** a withdrawal, **When** it completes, **Then** an audit event is recorded with the responder as actor and timestamp
- [ ] **Given** a withdrawn response's thread, **When** it is viewed, **Then** prior messages remain visible and the thread is read-only

Technical Notes

- Withdrawal is the responder's own exit and is deliberately narrow: only while the response is untouched `Submitted` and unselected. Once the owner has selected it, the decision belongs to the owner and the administrator.
- Deactivation under FR-5 preserves everything; a deactivated responder's responses must not cascade into withdrawal or deletion.

Dependencies

Requires
- 001-submit-a-recovery-response
- 002-recovery-response-status-model

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Withdrawn response was the only one on the report | Report remains `Open` |
| Responder withdraws after being deactivated | Refused; the account cannot act |
| Response withdrawn while the owner has the selection screen open | Selection screen reflects the withdrawn state on next load |

Out of Scope

- Administrator cancellation of a verified response, which is the exceptional path recorded as FR-48 event 25
- Deleting a response outright