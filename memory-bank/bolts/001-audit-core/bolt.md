---
id: 001-audit-core
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 001-append-only-audit-writes
  - 003-non-numbered-audit-records
  - 004-append-only-enforcement
  - 006-operational-logging-and-quota
created: 2026-10-23T13:05:00Z
started: 2026-10-26T08:23:50Z
completed: 2026-10-26T11:14:35Z
current_stage: complete
stages_completed:
  - name: model
    completed: 2026-10-26T08:23:50Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-26T09:13:30Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-26T09:41:00Z
    artifact: adr-6-fr10-audit-deletion-flag.md
  - name: implement
    completed: 2026-10-26T10:22:00Z
    artifact: src/domain/audit, src/application/audit, src/infrastructure/audit

requires_bolts: []
enables_bolts:
  - 002-audit-reads
  - 003-audit-lost-side-events
  - 004-identity-core
  - 005-identity-security
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 2
---

# Bolt: 001-audit-core

## Overview

The write path every other unit calls. Nothing else in FindBack can be built
honestly until audit records exist, because every unit writes through this bolt.

## Objective

Establish the append-only audit substrate: transactional writes, non-numbered
records for profile and moderator edits, the absence of any update or delete
path, structured operational logging, and quota monitoring against the $0 budget.

## Stories Included

- **001-append-only-audit-writes**: audit written inside the caller's transaction (Must)
- **003-non-numbered-audit-records**: FR-52 and FR-53 edits recorded without new event numbers (Must)
- **004-append-only-enforcement**: no update or delete path exists for any trail record (Must)
- **006-operational-logging-and-quota**: structured logs, no sensitive values, Vercel quota warnings (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: ✅ 2026-10-26 → `ddd-01-domain-model.md`
- [x] **2. design**: ✅ 2026-10-26 → `ddd-02-technical-design.md`
- [x] **3. adr**: ✅ 2026-10-26 → `adr-6-fr10-audit-deletion-flag.md`
- [x] **4. implement**: ✅ 2026-10-26 → `src/domain/audit/`, `src/application/`, `src/infrastructure/audit/`
- [x] **5. test**: ✅ 2026-10-26 → `ddd-03-test-report.md`

> Stage list corrected 2026-10-26 to the 5 stages defined by
> `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`.
> The bolt type is the execution plan; the earlier 4-item list omitted the
> optional ADR Analysis stage.

## Dependencies

### Requires
- None (first bolt)

### Enables
- 002-audit-reads
- 003-audit-lost-side-events
- 004-identity-core
- 005-identity-security

## Success Criteria

- [x] An audit write cannot commit outside its caller's transaction
- [x] A rolled-back state change leaves no audit record
- [x] No code path can update or delete an audit record, enforced at the schema level
- [x] No password, hash, token, claim reason, identifying detail, exact place, or thread body appears in any log or audit record
- [x] Blob storage at its limit refuses new uploads; all other quotas warn at 70% and 90%
- [x] No paid logging, analytics, or APM dependency was introduced

## Notes

Build this first even though it depends on nothing. Retrofitting audit after the
other units are written would mean every state change in the system was built
without it, and the trail would be reconstructed from application logs that
Vercel Hobby discards after one hour.