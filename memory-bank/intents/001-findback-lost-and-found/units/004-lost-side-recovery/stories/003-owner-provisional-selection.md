---
id: 003-owner-provisional-selection
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:48:00Z
assigned_bolt: 017-lost-lifecycle-determination
implemented: true
traces_to: [FR-42, FR-43]
---

# Story: 003-owner-provisional-selection

User Story

**As the** owner of a Lost item
**I want** to select one Recovery Response for verification
**So that** I can check the most likely match before anyone concludes anything

Acceptance Criteria

- [x] **Given** a Lost report in `Open` with one or more `Submitted` responses, **When** the owner selects one response, **Then** that response becomes `Selected for Verification` and the report becomes `Verification Pending`
- [x] **Given** the owner selects one response, **When** sibling responses exist, **Then** those siblings remain `Submitted` and are displayed as `Submitted — Standby`
- [ ] **Given** a selection has been made, **When** the owner selects a different response, **Then** the previous selection reverts to `Submitted` and the new one becomes `Selected for Verification` — **not implemented; the PRD wins.** FR-43 permits a new selection only after a `Not a Match`, so the previous selection keeps its `Not a Match` status and the report returns to `Open` for a new candidate.
- [x] **Given** a selection, **When** it is inspected afterward, **Then** no sibling has been closed, rejected, or withdrawn as a side effect
- [x] **Given** a non-owner attempts to select a response, **When** the action is attempted, **Then** it is refused with an authorization error
- [x] **Given** two owner sessions select different responses concurrently, **When** both requests are processed, **Then** exactly one selection is committed and the other receives a conflict
- [x] **Given** a selection, **When** it completes, **Then** an audit event is recorded with the owner as actor and the selected response as target

Technical Notes

- Selection is **provisional**. It commits the workflow to one candidate for checking, and nothing more (D7).
- Re-selecting is the only way to swap candidates while the report is `Verification Pending`; there is no unselect.
- Reversal of a wrong selection is by way of `Not a Match`, not by direct reselection of the same candidate — see story 004.

Dependencies

Requires
- 001-submit-a-recovery-response
- 002-recovery-response-status-model

Enables
- 004-owner-determination-admin-records

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Only one response exists and the owner selects it | Selected; no standby siblings |
| Owner selects the already-selected response | Idempotent no-op; no duplicate audit entry |
| Report is `Returned` or `Closed` when selection is attempted | Refused; both are terminal |
| Response was withdrawn before selection | Cannot be selected |

Out of Scope

- Recording the match outcome (story 004)
- Confirming the physical return (Unit 005)