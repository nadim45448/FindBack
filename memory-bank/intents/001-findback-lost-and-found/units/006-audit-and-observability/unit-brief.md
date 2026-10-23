---
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
phase: inception
status: ready
created: 2026-10-23T12:30:00Z
updated: 2026-10-23T12:30:00Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Audit and Observability

## Purpose

Provides the **defensible record**: the append-only audit trail that makes every
lifecycle action reconstructable, the log of who read that trail, the structured
application log, and the quota monitoring that keeps the $0 ceiling intact.

This unit depends on nothing. Every other unit writes to it.

## Scope

### In Scope
- Audit trail scope and the numbered event catalog (FR-31)
- Audit trail visibility, administrator-only (FR-32)
- Audit-read logging, recorded separately from the trail itself (PRD §10)
- Structured application logging with `requestId`, `actorId`, `action`, `targetId`
- Quota monitoring against the verified Vercel free-tier limits

### Out of Scope
- Deciding **which** event fires for a business action — that belongs to the acting
  unit; this unit records whatever event is emitted
- Rendering the audit view — Unit 007
- Metrics/APM vendors — none are used, by budget constraint

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-31 | Audit Trail Scope (Authoritative) | Must |
| FR-32 | Audit Trail Visibility | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| AuditEvent | One numbered audit record | id, eventNumber, eventType, parentType, parentId, actorId, actorRole, actingAdministratorId, determinedByUserId, recordedByAdministratorId, reason, previousValues, changedFields, metadata, occurredAt |
| AuditReadLog | A recorded read of the audit trail | id, administratorId, query, filters, resultCount, readAt |
| QuotaSnapshot | A recorded usage reading against a free-tier limit | id, resource, usedAmount, limitAmount, observedAt |

### The audit event catalog

**FR-31 events 1–14** cover the Found-side and report lifecycle.
**FR-48 events 15–30** cover the Lost-side Recovery Response workflow.

Events 18 and 19 are special: they carry **both** `determined_by` (the Lost-report
owner) and `recorded_by` (the acting administrator). This is the PRD's mechanism
for keeping owner-determines / administrator-records honest.

**Non-numbered records** exist for FR-52 profile edits and FR-53 report edits. They
are append-only and administrator-visible but **introduce no new event numbers**.

## Rules this unit must not break

1. **Append-only.** There is no update path and no delete path for audit records —
   not for an administrator, not for retention cleanup, not for anything.
2. **Administrator-only visibility.** Members never see the audit trail (FR-32).
3. **Audit is written inside the same transaction as the state change.** An audit
   entry for a transition that did not happen is a defect.
4. **Audit-read logging is separate from the trail itself** (PRD §10) — a distinct
   record type, not an event on the audited entity.
5. **The trail is retained for the parent entity's lifetime**, and indefinitely for
   `Returned`/`Closed` reports. When an `Open` report with no interaction is
   hard-deleted under FR-10, its audit entries go with it — the only deletion path.
6. **No sensitive values in the trail.** Claim reasons, identifying details, exact
   places, thread bodies, passwords, and tokens are **never** written to an audit
   record or a log.
7. **Reason strings that are audit-significant stay verbatim** — for example
   "another claim was approved for this item" — even when user-facing copy is
   softened (OQ-5).

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| — | Depends on nothing; every other unit writes to it |

### Depended By
| Unit | Reason |
|------|--------|
| 001 | Registration, approval, deactivation, profile edits |
| 002 | Report creation, edits, withdrawals, administrator edits |
| 003 | Claim decisions and auto-rejections |
| 004 | Recovery Response events 15–30 |
| 005 | Returned confirmations and closures |

## Technical Context

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| PostgreSQL | DB | Append-only writes inside caller transactions |
| Vercel runtime logs | Outbound | stdout JSON — **diagnostic only** |
| Vercel dashboard / Blob / DB metrics | Inbound | Quota monitoring |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Audit events | SQL | ~50 events per report | Parent lifetime; indefinite for terminal reports |
| Audit read logs | SQL | Moderate | Retained for review |
| Quota snapshots | SQL | Small | Retained |

## Constraints

- **Audit query performance: ≤ 1 s p95 at 10,000 reports × 50 events** (PRD §10).
  Reverse-chronological, 25 per page, no infinite scroll (UX-OQ-C).
- **Vercel Hobby retains runtime logs for 1 hour.** Anything that must be
  reviewable — specifically audit-read logging — is written to the database, not
  only to stdout. This is the reason the read log is a table and not just a log line.
- No logging, analytics, or APM vendor may be added: each is a paid or
  externally-dependent service, and the budget is a hard $0.

## Quota monitoring

| Resource | Verified limit | Warning | Action at limit |
|----------|----------------|---------|-----------------|
| Blob storage | 1 GB | 70% and 90% | **Refuse** new uploads |
| Blob simple ops | 10,000 / month | 70% and 90% | Alert |
| Blob advanced ops | 2,000 / month | 70% and 90% | Alert |
| Blob data transfer | 10 GB / month | 70% and 90% | Alert |
| Fast origin transfer | 10 GB / month | 70% and 90% | Alert |
| Function invocations | 1,000,000 / month | 70% and 90% | Alert |
| Database storage | 1 GB | 70% and 90% | Alert |

No quota condition may trigger a purchase or a plan upgrade. Surfacing the condition
is the whole response.

## Success Criteria

### Functional
- [ ] Every numbered event 1–30 is recorded with actor and timestamp
- [ ] Events 18/19 record `determined_by` and `recorded_by` separately
- [ ] FR-52 and FR-53 edits appear as non-numbered append-only records
- [ ] Audit trail is invisible to members and visible to administrators
- [ ] Every audit read is recorded with administrator, query, and timestamp
- [ ] Hard delete under FR-10 removes the trail with the report; nothing else does

### Non-Functional
- [ ] Trail query ≤ 1 s p95 at 10,000 reports × 50 events
- [ ] No update or delete code path for audit records exists
- [ ] No sensitive value appears in any trail record or log line

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-audit-1 | DDD | event catalog, append-only writes, FR-31 events 1–14 | Found-side and report trail |
| bolt-audit-2 | DDD | FR-48 events 15–30, non-numbered records | Lost-side trail |
| bolt-audit-3 | DDD | audit visibility, read logging, query pagination | Access and reviewability |
| bolt-audit-4 | DDD | structured logging, quota monitoring | Operational evidence |

## Notes

Unit 006 is the reason the audit trail is credible: because every other unit writes
through it inside its own transaction, "the trail is complete" is a property of the
architecture rather than of anyone's diligence. Build it early enough that the other
units can write through it from their first bolt rather than retrofitting later.

---

## Story Summary

- **Total Stories**: 6
- **Must Have**: 6
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-append-only-audit-writes**: the trail is complete by construction rather than by diligence - must - Planned
  <br>traces: FR-31
- [ ] **002-lost-side-audit-events**: every Lost-side recovery action recorded with its numbers intact - must - Planned
  <br>traces: FR-31
- [ ] **003-non-numbered-audit-records**: the frozen event catalog stays intact while the record stays complete - must - Planned
  <br>traces: FR-31
- [ ] **004-append-only-enforcement**: the trail remains trustworthy for as long as it exists - must - Planned
  <br>traces: FR-31
- [ ] **005-audit-visibility-and-read-logging**: reading it is itself accountable - must - Planned
  <br>traces: FR-32
- [ ] **006-operational-logging-and-quota**: I can tell what happened and know before a free-tier limit stops the app - must - Planned
  <br>traces: FR-31
