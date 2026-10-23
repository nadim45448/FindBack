---
id: 021-web-admin
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
type: simple-construction-bolt
status: planned
stories:
  - 007-administrator-dashboard
  - 008-administrator-queues
  - 009-no-other-notifications
  - 010-contextual-audit-views
created: 2026-10-23T13:15:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 002-audit-reads
  - 012-web-public
  - 014-web-threads
  - 016-claim-decisions
  - 017-lost-lifecycle-determination
  - 018-lost-threads
  - 020-returns-moderation
  - 023-claim-threads-notifications
enables_bolts:
  - 022-web-audit-accessibility
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 021-web-admin

## Overview

The administrator experience — dashboard, four queues, and contextual audit.

## Objective

Render the administrator surfaces as entry points, with no notification stream,
no global audit route, and the owner-determines / administrator-records wording
used exactly as the spine prescribes.

## Stories Included

- **007-administrator-dashboard**: entry points only, no `Recent activity` aggregation (Must)
- **008-administrator-queues**: Pending Registrations, Pending Claims, Items Awaiting Return, Items in Verification (Must)
- **009-no-other-notifications**: no bell, no notification centre, no toast for a background event (Must)
- **010-contextual-audit-views**: `/admin/items/:id/audit` and `/admin/lost/:id/audit` only (Must)

## Bolt Type

**Type**: simple-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. design**: Pending → `implementation-plan.md`
- [ ] **2. implement**: Pending → source
- [ ] **3. test**: Pending → `simple-03-test-report.md`

## Dependencies

### Requires
- **002-audit-reads** (required): administrator-only trail and read logging
- **012-web-public** (required): shell, tokens, theme, navigation
- **014-web-threads** (required): shared layout and surface patterns
- **016-claim-decisions** (required): Pending Claims queue and review screen
- **017-lost-lifecycle-determination** (required): Items in Verification queue
- **020-returns-moderation** (required): Items Awaiting Return queue and confirm-returned form

### Enables
- 022-web-audit-accessibility

## Success Criteria

- [ ] The dashboard shows entry points only and contains no `Recent activity` section
- [ ] All four queues render and link to their work
- [ ] No `/admin/audit` route exists
- [ ] No notification bell, notification centre, or background-event toast exists
- [ ] The audit view is reachable only from a report context
- [ ] Owner-determines / administrator-records wording matches `EXPERIENCE.md` §4.7 exactly
- [ ] Administrator report edit exposes exactly the eight permitted fields

## Notes

FR-30 is an absence. Story 009 must be verified by confirming that what should not
exist does not exist — a negative requirement that passes silently if nobody
checks for it.