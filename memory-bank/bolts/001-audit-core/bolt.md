---
id: 001-audit-core
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 001-append-only-audit-writes
  - 003-non-numbered-audit-records
  - 004-append-only-enforcement
  - 006-operational-logging-and-quota
created: 2026-10-23T13:05:00Z
started: null
completed: null
current_stage: null
stages_completed: []

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

- [ ] **1. model**: Pending → `ddd-01-domain-model.md`
- [ ] **2. design**: Pending → `ddd-02-technical-design.md`
- [ ] **3. implement**: Pending → source
- [ ] **4. test**: Pending → `ddd-03-test-report.md`

## Dependencies

### Requires
- None (first bolt)

### Enables
- 002-audit-reads
- 003-audit-lost-side-events
- 004-identity-core
- 005-identity-security

## Success Criteria

- [ ] An audit write cannot commit outside its caller's transaction
- [ ] A rolled-back state change leaves no audit record
- [ ] No code path can update or delete an audit record, enforced at the schema level
- [ ] No password, hash, token, claim reason, identifying detail, exact place, or thread body appears in any log or audit record
- [ ] Blob storage at its limit refuses new uploads; all other quotas warn at 70% and 90%
- [ ] No paid logging, analytics, or APM dependency was introduced

## Notes

Build this first even though it depends on nothing. Retrofitting audit after the
other units are written would mean every state change in the system was built
without it, and the trail would be reconstructed from application logs that
Vercel Hobby discards after one hour.