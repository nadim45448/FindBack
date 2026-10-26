---
id: 002-audit-reads
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 005-audit-visibility-and-read-logging
created: 2026-10-23T13:05:30Z
started: 2026-10-26T11:14:35Z
completed: 2026-10-26T13:15:34Z
current_stage: complete
stages_completed:
  - name: model
    completed: 2026-10-26T11:14:35Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-26T11:30:58Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-26T12:32:12Z
    artifact:
      - adr-7-audit-read-record-durability.md
      - adr-8-audit-read-authorization-and-scope.md
  - name: implement
    completed: 2026-10-26T13:00:00Z
    artifact: source
  - name: test
    completed: 2026-10-26T13:15:34Z
    artifact: ddd-03-test-report.md

requires_bolts:
  - 001-audit-core
enables_bolts:
  - 021-web-admin
  - 022-web-audit-accessibility
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 002-audit-reads

## Overview

The read side of the trail: who may see it, and the record of who looked.

## Objective

Make the audit trail administrator-only, record every read of it, and prove the
query meets the 1s p95 budget at the PRD's scale of 10,000 reports × 50 events.

## Stories Included

- **005-audit-visibility-and-read-logging**: administrator-only trail, every read recorded, 25 per page (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: ✅ 2026-10-26 → `ddd-01-domain-model.md`
- [x] **2. design**: ✅ 2026-10-26 → `ddd-02-technical-design.md`
- [x] **3. adr**: ✅ 2026-10-26 → `adr-7-audit-read-record-durability.md`, `adr-8-audit-read-authorization-and-scope.md`
- [x] **4. implement**: ✅ 2026-10-26 → source
- [x] **5. test**: ✅ 2026-10-26 → `ddd-03-test-report.md`

> Stage list corrected 2026-10-26 to the 5 stages defined by
> `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`,
> matching bolt `001-audit-core`. The original 4-item list omitted the optional
> ADR Analysis stage.

## Dependencies

### Requires
- **001-audit-core** (required): needs the append-only write path and schema

### Enables
- 021-web-admin
- 022-web-audit-accessibility

## Success Criteria

- [x] A non-administrator cannot reach any audit view or receive trail content
- [x] Every read writes an AuditReadLog record with administrator, query, filters, count, timestamp
- [x] AuditReadLog is a distinct record type, not an event on the audited entity
- [x] Reads are reviewable later than one hour, which requires a table rather than a log line
- [x] Trail query completes within 1s p95 at 10,000 reports × 50 events
- [x] Pagination is reverse-chronological, 25 per page, no infinite scroll

## Notes

This bolt carries one story but earns its own bolt: it is the only place where a
performance budget is at risk, and it is separable from the write path without
disturbing it.