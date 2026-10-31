---
id: 004-owner-determination-admin-records
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:48:30Z
assigned_bolt: 017-lost-lifecycle-determination
implemented: true
traces_to: [FR-43, FR-48]
---

# Story: 004-owner-determination-admin-records

User Story

**As the** owner of a Lost item
**I want** my decision on a candidate recorded on my behalf by an administrator
**So that** the trail shows both what I decided and who entered it

Acceptance Criteria

- [x] **Given** a response in `Selected for Verification`, **When** the owner determines it is a match and an administrator records that determination, **Then** the response becomes `Match Confirmed`, which is non-terminal
- [x] **Given** a response in `Selected for Verification`, **When** the owner determines it is not a match and an administrator records it, **Then** the response becomes `Not a Match` (terminal) and the report returns to `Open`
- [x] **Given** a `Not a Match` outcome and the report back in `Open`, **When** the owner selects another response, **Then** verification may proceed on the new candidate
- [x] **Given** a recorded determination, **When** audit events 18/19 are written, **Then** `determined_by` records the Lost-report owner and `recorded_by` records the acting administrator as two separate values
- [x] **Given** an administrator recording a determination, **When** no owner determination is supplied, **Then** the recording is refused
- [x] **Given** a non-administrator attempts to record a determination, **When** the action is attempted, **Then** it is refused
- [x] **Given** a response already in `Match Confirmed` or a terminal status, **When** a determination is recorded again, **Then** the transition throws and nothing changes
- [x] **Given** two administrators record different determinations concurrently, **When** both are processed, **Then** exactly one commits and the other receives a conflict
- [x] **Given** a recorded determination, **When** the audit record is written, **Then** no observed identifying details, exact place, or thread body appear in it

Technical Notes

- **Owner determines, administrator records.** The owner physically decides the match; the administrator enters that decision. The interface must never imply the administrator made the determination (FR-43, `EXPERIENCE.md` §4.7).
- Events 18/19 carrying both `determined_by` and `recorded_by` is the PRD's mechanism for keeping that separation honest and auditable.
- `Match Confirmed` is deliberately non-terminal: the item has been identified, but it has not yet been physically returned.

Dependencies

Requires
- 003-owner-provisional-selection
- 002-recovery-response-status-model

Enables
- 004-complete-lost-verification-closeout (Unit 005)

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Owner determination changed after `Match Confirmed` | No path; reversal is the exceptional-administrator cancellation recorded as FR-48 event 25 |
| Administrator records a determination for a report that is already `Returned` | Refused; report is terminal |
| Determination recorded with no competing siblings | Succeeds normally |

Out of Scope

- The physical return confirmation (Unit 005, FR-45)
- Owner-side self-service recording of the determination
- Standby display, which is a derived condition (story 002)