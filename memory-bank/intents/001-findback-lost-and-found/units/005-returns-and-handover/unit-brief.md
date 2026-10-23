---
unit: 005-returns-and-handover
intent: 001-findback-lost-and-found
phase: inception
status: ready
created: 2026-10-23T12:30:00Z
updated: 2026-10-23T12:30:00Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Returns and Handover

## Purpose

Owns the **terminal transitions shared by both recovery directions**: confirming a
physical return (default and substitute receivers), the no-receiver guard, closing
and moderating reports, and the Lost-side email events that fire when a Lost report
reaches Returned.

> Both directions converge here. There must be exactly **one** Confirm Returned
> implementation, not one per side — otherwise the receiver and substitute rules
> drift apart.

## Scope

### In Scope
- Confirm Returned with the default receiver (FR-23)
- Confirm Returned with a substitute receiver, authorization, and relationship (FR-24)
- The no-receiver-no-returned guard (FR-25)
- Administrator close action (FR-21)
- Remove inappropriate content (FR-36)
- Administrator verification management and Lost-side Returned confirmation (FR-45)
- Lost-side email events 4–8, including the two that fire atomically on Lost
  Returned (FR-46)

### Out of Scope
- Claim decisions — Unit 003
- Verification determinations — Unit 004
- Rendering the confirm-Returned form and queues — Unit 007

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-21 | Administrator Close Action | Must |
| FR-23 | Confirm Returned (Default Receiver) | Must |
| FR-24 | Confirm Returned (Substitute Receiver) | Must |
| FR-25 | No-Receiver-No-Returned Guard | Must |
| FR-36 | Remove Inappropriate Content | Must |
| FR-45 | Administrator Verification Management and Returned Confirmation | Must |
| FR-46 | Recovery Response Email Notifications (Lost-side) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| ReturnConfirmation | The record of a physical hand-off | id, reportId, receiverId, substituteReceiverName, substituteAuthorizationConfirmed, substituteRelationship, confirmedByAdministratorId, confirmedAt |
| ContentRemoval | A moderation record for inappropriate content | id, reportId, actingAdministratorId, reason, removedAt |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `confirmReturned` | Record the physical return | reportId, receiver | Report → `Returned`, audit event 6 |
| `confirmReturnedWithSubstitute` | Return to an authorized substitute | reportId, substituteName, authorization, relationship | as above, plus substitute fields |
| `closeReport` | Administrator close | reportId, reason, actingAdministrator | Report → `Closed` + dependent resolution |
| `removeContent` | Remove inappropriate content | reportId, reason, actingAdministrator | content removed + audit |
| `completeLostVerification` | Administrator closes out a verified Lost report | lostReportId, actingAdministrator | report `Returned`; selected response → `Completed — Report Returned`; all others → `Resolved — Report Returned`; threads read-only; events 7 and 8 fire |

## Default receiver rules

| Report type | Default receiver |
|-------------|-----------------|
| Found | the approved claimant |
| Lost | the Lost-report owner |

If the actual receiver differs, the administrator records the substitute's name,
confirms the default receiver authorized them, and records the relationship —
**Friend, Family Member, Colleague, Classmate, or Other**. If the substitute *is*
the default receiver, authorization and relationship do not apply.

## Rules this unit must not break

1. **No receiver, no Returned.** The guard is absolute (FR-25).
2. **Returned is confirmed by an administrator only** — never by the member, and
   never by the owner on the Lost side (FR-23, FR-45).
3. **On Lost Returned, in one transaction:**
   - the Lost report → `Returned`
   - the selected, matched response → `Completed — Report Returned`
   - every other non-terminal response → `Resolved — Report Returned`
   - all per-Recovery-Response threads become **read-only**
   - FR-46 events 7 (to the Lost-report owner) and 8 (to the matched responder) fire
   (FR-41, FR-45, FR-46, UJ-5 step 10)
4. **Event 8 is gated on `Completed — Report Returned` + report `Returned`.** It
   does **not** fire at Match Confirmed, and standby responders receive **no** event
   8 (FR-46, UJ-5).
5. **Closure resolves non-terminal responses in the same transaction.** Pre-`Match
   Confirmed` closure moves every non-terminal response to `Resolved — Report
   Closed`. Post-`Match Confirmed` closure is exceptional-administrator-only, requires
   a documented reason, and is FR-48 event 25 (FR-21, FR-42).
6. **No closure email is sent to any responder** (FR-30, UJ-5 Edge Case C).
7. **Closed is terminal.** Nothing is hard-deleted by a close.
8. **Removals are audited** and preserved — the trail is append-only (FR-31, FR-36).

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 001 | ActorContext — the confirming administrator |
| 003 | Approved Claims define the Found-side default receiver |
| 004 | Verification outcomes define the Lost-side return path |
| 006 | Audit writes — FR-31 event 10, FR-48 events 24–26 and 30 |

### Depended By
| Unit | Reason |
|------|--------|
| 007 | Confirm-Returned form and Items Awaiting Return queue |

## Technical Context

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| PostgreSQL | DB | Row lock on the report; single transaction across both sides |
| Email provider | Outbound | FR-46 events 4–8, **after commit** |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Return confirmations | SQL | Small | Parent report lifetime |
| Content removals | SQL | Small | Parent report lifetime |

## Constraints

- **Email after commit.** A send failure is logged and never rolls back or blocks the
  return (PRD §10).
- Two administrators confirming Returned on the same report must not both succeed.
- `Returned` and `Closed` are terminal; the database rejects any further transition
  except those the PRD explicitly names.

## Success Criteria

### Functional
- [ ] Default-receiver Returned records receiver, administrator, and timestamp
- [ ] Substitute Returned requires name, authorization confirmation, and relationship
- [ ] Returned without a receiver is refused
- [ ] Lost Returned resolves all responses and locks all threads atomically
- [ ] Events 7 and 8 fire only under their exact conditions
- [ ] Standby responders receive no event 8
- [ ] Closure resolves non-terminal responses and sends no responder email

### Non-Functional
- [ ] Concurrent Confirm Returned calls cannot both commit
- [ ] Email failure never rolls back the transition

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-returns-1 | DDD | default receiver, substitute receiver, no-receiver guard | Found-side return |
| bolt-returns-2 | DDD | Lost-side verification closeout, atomic resolution, events 7/8 | Lost-side return |
| bolt-returns-3 | DDD | close, remove content, exceptional cancellation | Moderation and terminal paths |

## Notes

This is the only unit that writes both recovery directions' terminal state, which is
precisely why it must be a single implementation. The UJ-5 audit path cites events
15, 17, 18, 21, 26, and 30 — those span Units 004 and 005 and must be verifiable
end to end.

---

## Story Summary

- **Total Stories**: 7
- **Must Have**: 7
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-confirm-returned-default-receiver**: to confirm that an item was physically returned - must - Planned
  <br>traces: FR-23
- [ ] **002-confirm-returned-substitute-receiver**: to record who actually received an item when it was not the default receiver - must - Planned
  <br>traces: FR-24
- [ ] **003-no-receiver-no-returned-guard**: no item is ever marked recovered without someone being answerable for it - must - Planned
  <br>traces: FR-25
- [ ] **004-complete-lost-verification-closeout**: confirming a Lost return to resolve every recovery response at once - must - Planned
  <br>traces: FR-45
- [ ] **005-close-report**: to close a report that should not proceed - must - Planned
  <br>traces: FR-21
- [ ] **006-remove-inappropriate-content**: to remove inappropriate content while preserving the record of it - must - Planned
  <br>traces: FR-36
- [ ] **007-lost-side-notification-events**: to be told what happens to my response - must - Planned
  <br>traces: FR-46
