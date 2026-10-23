---
id: 005-lost-report-lifecycle
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:49:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-42]
---

# Story: 005-lost-report-lifecycle

User Story

**As the** owner of a Lost item
**I want** my Lost report to move through its lifecycle correctly
**So that** its status always reflects what is actually happening

Acceptance Criteria

- [ ] **Given** a newly created Lost report, **When** it is persisted, **Then** its status is `Open`
- [ ] **Given** an `Open` Lost report, **When** the owner selects a response for verification, **Then** the report becomes `Verification Pending`
- [ ] **Given** a report in `Verification Pending`, **When** the selected response becomes `Match Confirmed`, **Then** the report remains `Verification Pending` because the physical return has not yet been confirmed
- [ ] **Given** a report in `Verification Pending`, **When** the selected response becomes `Not a Match`, **Then** the report returns to `Open`
- [ ] **Given** a Lost report, **When** the owner withdraws it, **Then** the report reaches `Closed`, never `Returned`
- [ ] **Given** a report in `Open` or `Verification Pending`, **When** an administrator closes it, **Then** the report reaches `Closed` (terminal)
- [ ] **Given** a report that has reached `Verification Pending` and beyond, **When** the lifecycle is inspected, **Then** the only exits are `Returned` (terminal, via Unit 005) or `Closed` (terminal)
- [ ] **Given** a report in `Returned` or `Closed`, **When** any lifecycle transition is attempted, **Then** it is refused because both are terminal

Technical Notes

- `Returned` is reached only through Unit 005's Confirm Returned, never by a lifecycle transition inside this unit. That is what keeps the return a single implementation.
- Withdrawal reaching `Closed` rather than `Returned` mirrors the Found-side rule and prevents a withdrawal from ever implying a successful handover.
- Unit 004 owns the transitions up to the threshold of `Verification Pending`; Unit 005 owns both terminal exits.

Dependencies

Requires
- 002-recovery-response-status-model
- 003-owner-provisional-selection

Enables
- 004-complete-lost-verification-closeout (Unit 005)
- 005-close-report (Unit 005)

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Report reaches `Verification Pending` with no later action | Remains there indefinitely; no timeout auto-transition exists |
| Withdrawal attempted on a `Verification Pending` report | Reaches `Closed`; non-terminal responses resolve per Unit 005 |
| Attempt to move `Returned` back to `Open` | Refused; terminal |
| Owner withdraws a report with sibling responses still `Submitted` | Reaches `Closed`; siblings resolve, none is marked as a match |

Out of Scope

- Confirm Returned and the `Returned` transition (Unit 005, FR-45)
- Administrator close mechanics (Unit 005, FR-21)
- Reporter-side edit and delete rules (Unit 002, FR-9/FR-10)