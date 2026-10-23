---
id: 005-identity-security
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 004-deactivate-an-account
  - 008-reset-request-never-discloses-account
  - 009-reset-password
  - 010-update-member-profile
created: 2026-10-23T13:07:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 004-identity-core
enables_bolts: []
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 005-identity-security

## Overview

Account management where the risk is disclosure rather than correctness.

## Objective

Deliver deactivation with session revocation, anti-enumeration password reset,
and the tightly-bounded member profile editor.

## Stories Included

- **004-deactivate-an-account**: revoke every session, preserve all history (Must)
- **008-reset-request-never-discloses-account**: neutral response in body, timing, and screen state (Must)
- **009-reset-password**: single-use token, never changes lifecycle status (Must)
- **010-update-member-profile**: exactly display name and self-declared role (Must)

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
- **001-audit-core** (required): deactivation, reset, and profile edits are audited
- **004-identity-core** (required): needs accounts, sessions, and login

### Enables
- 020-web-profile

## Success Criteria

- [ ] Deactivation revokes all sessions in the same transaction as the status change
- [ ] Reports, Claims, Recovery Responses, messages, and audit history survive deactivation
- [ ] A deactivated member's audit entries are never rewritten to hide the actor
- [ ] Reset responses are indistinguishable across registered, unregistered, and all four account statuses
- [ ] Reset response timing does not vary with account existence
- [ ] A reset never approves, activates, reactivates, or undoes a rejection
- [ ] A used or expired token is refused
- [ ] The profile editor exposes exactly two editable fields; email and status are read-only

## Notes

Profile edit is in this bolt rather than with the frontend because it produces an
audit record, and the FR-52 edit surface is a domain constraint rather than a UI
affordance. The UI merely renders it.