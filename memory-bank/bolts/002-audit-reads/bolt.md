---
id: 002-audit-reads
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 005-audit-visibility-and-read-logging
created: 2026-10-23T13:05:30Z
started: null
completed: null
current_stage: null
stages_completed: []

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

- [ ] **1. model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. implement**: Pending → source
- [ ] **4. test**: Pending → `ddd-03-test-report.md`

## Dependencies

### Requires
- **001-audit-core** (required): needs the append-only write path and schema

### Enables
- 021-web-admin
- 022-web-audit-accessibility

## Success Criteria

- [ ] A non-administrator cannot reach any audit view or receive trail content
- [ ] Every read writes an AuditReadLog record with administrator, query, filters, count, timestamp
- [ ] AuditReadLog is a distinct record type, not an event on the audited entity
- [ ] Reads are reviewable later than one hour, which requires a table rather than a log line
- [ ] Trail query completes within 1s p95 at 10,000 reports × 50 events
- [ ] Pagination is reverse-chronological, 25 per page, no infinite scroll

## Notes

This bolt carries one story but earns its own bolt: it is the only place where a
performance budget is at risk, and it is separable from the write path without
disturbing it.