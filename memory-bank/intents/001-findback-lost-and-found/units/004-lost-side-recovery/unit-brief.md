---
unit: 004-lost-side-recovery
intent: 001-findback-lost-and-found
phase: inception
status: ready
created: 2026-10-23T12:30:00Z
updated: 2026-10-23T12:30:00Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Lost-Side Recovery

## Purpose

Owns the **Lost-side recovery workflow end to end**: a member who may have found
someone's lost item submits a Recovery Response; the Lost-report owner selects one
candidate for verification and determines the match; an administrator records that
determination.

> This is a **separate state machine** from Unit 003. The two must never share a
> transition function, an aggregate, or a status enum. The PRD keeps them separate
> deliberately, and Unit 4 is the more intricate of the two.

## Scope

### In Scope
- Recovery Response submission (FR-40)
- The canonical 8-status model and all transitions (FR-41)
- Lost-report lifecycle and auto-transitions (FR-42)
- Owner review, provisional selection, and verification outcomes (FR-43)
- Recovery Response field set (FR-44)
- Per-Recovery-Response message thread (FR-47)
- Recovery Response audit events 15–30 (FR-48)

### Out of Scope
- Found-side Claims — Unit 003
- Confirm Returned and the Lost-side return transition — Unit 005
- Lost-side email events 4–8 delivery mechanics — Unit 005
- Items-in-Verification queue rendering — Unit 007

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-40 | Submit a Recovery Response | Must |
| FR-41 | Recovery Response Statuses and Transitions (Authoritative) | Must |
| FR-42 | Lost-Report Lifecycle and Auto-Transitions | Must |
| FR-43 | Owner Review, Provisional Selection, and Verification Outcomes | Must |
| FR-44 | Recovery Response Field Set (Authoritative) | Must |
| FR-47 | Per-Recovery-Response Message Thread | Must |
| FR-48 | Recovery Response Audit Events | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| RecoveryResponse | A member's response to another member's Lost report | id, lostReportId, responderId, whereFound, observedIdentifyingDetails, dateFound, candidateImageRef, status, selectedAt, determination, determinedByUserId, determinedAt, createdAt |
| RecoveryResponseMessage | A message in one Recovery Response's thread | id, recoveryResponseId, authorId, body, createdAt |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `submitRecoveryResponse` | Respond to a Lost report | lostReportId, FR-44 fields, actor | `Submitted` Recovery Response |
| `selectForVerification` | Owner selects one candidate — **provisional** | lostReportId, recoveryResponseId, ownerId | `Selected for Verification`; report → `Verification Pending` |
| `recordMatchConfirmed` | Administrator records the owner's match determination | recoveryResponseId, ownerDetermination, actingAdministrator | `Match Confirmed` (non-terminal) |
| `recordNotAMatch` | Administrator records the owner's not-match determination | recoveryResponseId, ownerDetermination, actingAdministrator | `Not a Match` (terminal); report → `Open` |
| `withdrawResponse` | Responder withdraws | recoveryResponseId, responderId | `Withdrawn` (terminal) |
| `postResponseMessage` | Post in the per-Recovery-Response thread | recoveryResponseId, body, actor | Message |

## The canonical 8-status model (FR-41)

```text
Submitted ──select──► Selected for Verification ──not match──► Not a Match (TERMINAL)
                            │
                    match confirmed (NON-TERMINAL)
                            ▼
                     Match Confirmed ──report Returned──► Completed — Report Returned (TERMINAL)

any non-terminal ──report Returned (not the matched one)──► Resolved — Report Returned (TERMINAL)
any non-terminal ──report Closed──► Resolved — Report Closed (TERMINAL)
Submitted (not selected) ──responder withdraws──► Withdrawn (TERMINAL)
```

```text
Lost report:  Open ──select for verification──► Verification Pending
              Verification Pending ──Confirm Returned──► Returned (TERMINAL)
              Open | Verification Pending ──withdraw or close──► Closed (TERMINAL)
```

## Rules this unit must not break

1. **`Standby` is never persisted.** It is a display condition derived when a
   sibling is `Selected for Verification` (FR-41, D7).
2. **`Match Confirmed` is non-terminal.** The Lost report stays `Verification
   Pending` until an administrator confirms the physical return (Unit 005).
3. **Selection is provisional and reversible only through Not-a-Match.** Selecting
   one candidate never closes or rejects the others (D7).
4. **The owner determines; the administrator records.** The Lost-report owner
   physically decides the match; the administrator enters that decision on the
   owner's behalf. Audit events 18/19 record `determined_by` and `recorded_by`
   separately (FR-43, FR-45).
5. **New Recovery Responses are accepted during `Verification Pending`** — but only
   while the selected response has not reached `Match Confirmed` (FR-40, UJ-5 Edge
   Case B). After `Match Confirmed`, no further response can be selected or accepted.
6. **One thread per Recovery Response, never one per Lost report.** Competing
   responders cannot see each other's threads, enforced at the API layer (FR-47,
   D6, PRD §10).
7. **Thread is writable** while `Submitted`, `Selected for Verification`, or
   `Match Confirmed`; **read-only** at any terminal status or when the parent report
   is `Returned`/`Closed`. History is preserved; messages are never deleted.
8. **Administrator visibility during verification is total** — every Recovery
   Response on the Lost report, selected and standby (FR-45).
9. **A responder must not** see the Lost report's private fields — exact place or the
   owner's identifying details (FR-39, FR-40).
10. **Cancellation after `Match Confirmed`** is exceptional-administrator-only,
    requires a documented reason, and is recorded as FR-48 event 25 (UJ-5 Edge
    Case D).

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 001 | ActorContext — owner, responder, and administrator are distinct actors |
| 002 | The Lost report and its status |
| 006 | Audit writes — FR-48 events 15–30 |

### Depended By
| Unit | Reason |
|------|--------|
| 005 | Confirm Returned resolves this workflow's terminal statuses |

## Technical Context

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| PostgreSQL | DB | Row locks on the Lost report for selection and determination |
| Vercel Blob (private) | Both | Candidate image, per `image-handling.md` |
| 006 audit | DB write | Events 15–30, inside the transition transaction |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Recovery Responses | SQL | Moderate | Parent report lifetime |
| Response messages | SQL | Moderate | Parent report lifetime; never deleted |

## Constraints

- **Concurrency:** the owner selecting while another owner session acts, or two
  administrators recording a determination, must not both succeed.
- The 8 statuses are persisted; `Standby` is not. A `CHECK` constraint or enum in
  the schema enforces this at the database layer.
- Rate limiting on Recovery Response submission and thread posting (PRD §10).
- Audit query performance: the trail must answer a Lost report's full history within
  the 1 s p95 NFR at 10,000 reports × 50 events.

## Success Criteria

### Functional
- [ ] Response is created `Submitted` and appears in My Recovery Responses
- [ ] Owner selection moves it to `Selected for Verification` and the report to `Verification Pending`
- [ ] Siblings remain `Submitted` and render as `Submitted — Standby`
- [ ] Match determination records both `determined_by` and `recorded_by`
- [ ] Not-a-Match returns the report to `Open` and the owner may select another
- [ ] Threads are isolated between competing responders and admins-only by role
- [ ] Responder withdrawal works only while `Submitted` and not selected
- [ ] Deactivating a responder leaves existing responses intact (FR-5)

### Non-Functional
- [ ] Illegal status transitions throw rather than degrade
- [ ] `Standby` is never written to storage
- [ ] Cross-thread access is denied at the API layer

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-recovery-1 | DDD | submission, FR-44 field set, 8 statuses | Lost-side Recovery Response model |
| bolt-recovery-2 | DDD | provisional selection, owner determination, admin recording | FR-42 and FR-43 core |
| bolt-recovery-3 | DDD | per-Recovery-Response thread, withdrawal, resolution | FR-47 and FR-41 terminal paths |

## Notes

FR-45 is assigned to Unit 005 because Confirm Returned is shared by both directions
and belongs with the receiver/substitute rules. Unit 4 owns the *determination*;
Unit 5 owns the *return*. Do not let this split leak a second implementation of the
return transition — it must be exactly one code path.

---

## Story Summary

- **Total Stories**: 8
- **Must Have**: 8
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-submit-a-recovery-response**: to respond to a Lost report describing where I found it - must - Planned
  <br>traces: FR-40, FR-44
- [ ] **002-recovery-response-status-model**: the Lost-side state machine is unambiguous and cannot drift - must - Planned
  <br>traces: FR-41
- [ ] **003-owner-provisional-selection**: to select one Recovery Response for verification - must - Planned
  <br>traces: FR-42, FR-43
- [ ] **004-owner-determination-admin-records**: my decision on a candidate recorded on my behalf by an administrator - must - Planned
  <br>traces: FR-43, FR-48
- [ ] **005-lost-report-lifecycle**: my Lost report to move through its lifecycle correctly - must - Planned
  <br>traces: FR-42
- [ ] **006-per-recovery-response-thread**: a private message thread on my own Recovery Response - must - Planned
  <br>traces: FR-47
- [ ] **007-responder-withdraws-response**: to withdraw my Recovery Response - must - Planned
  <br>traces: FR-40
- [ ] **008-recovery-response-audit-events**: every Lost-side recovery action recorded in the audit trail - must - Planned
  <br>traces: FR-48
