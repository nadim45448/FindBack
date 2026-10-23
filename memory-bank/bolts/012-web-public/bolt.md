---
id: 012-web-public
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
type: simple-construction-bolt
status: planned
stories:
  - 001-design-foundations-and-theme
  - 002-public-and-authentication-surfaces
created: 2026-10-23T13:10:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 004-identity-core
  - 005-identity-security
  - 009-reporting-search
enables_bolts:
  - 014-web-threads
  - 021-web-admin
requires_units: []
blocks: false

complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 012-web-public

## Overview

Design foundations, theme switching, and the ten public and authentication surfaces.

## Objective

Stand up the application shell from `DESIGN.md` and render every anonymous and
authentication surface exactly as `EXPERIENCE.md` specifies.

## Stories Included

- **001-design-foundations-and-theme**: tokens, layout, System/Light/Dark (Must)
- **002-public-and-authentication-surfaces**: landing, login, register, pending, rejected, deactivated, forgot password (Must)

## Bolt Type

**Type**: simple-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. design**: Pending → `implementation-plan.md`
- [ ] **2. implement**: Pending → source
- [ ] **3. test**: Pending → `simple-03-test-report.md`

## Dependencies

### Requires
- **004-identity-core** (required): login, register, and account states
- **005-identity-security** (required): the password reset surfaces
- **009-reporting-search** (required): the anonymous summary listing

### Enables
- 013-web-member
- 014-web-threads
- 021-web-admin

## Success Criteria

- [ ] All ten public and authentication surfaces render per `EXPERIENCE.md` §9.3, §9.3a, §16
- [ ] User-facing copy is verbatim from the spines — error copy from §4.9, status labels from §4.2
- [ ] Theme selection persists and respects the System preference
- [ ] Reduced motion is honoured
- [ ] No administrator surface is reachable from any public route

## Notes

The spines are the contract. If a surface reveals that a spine is ambiguous, stop
and raise it rather than resolving the ambiguity by inventing behaviour — changing
a spine needs explicit owner approval.