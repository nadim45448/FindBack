---
id: 022-web-audit-accessibility
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
type: simple-construction-bolt
status: planned
stories:
  - 011-accessibility-and-secure-image-delivery
created: 2026-10-23T13:15:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 002-audit-reads
  - 010-reporting-images
  - 012-web-public
  - 021-web-admin
enables_bolts: []
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 022-web-audit-accessibility

## Overview

Cross-cutting verification that the whole surface set meets WCAG 2.1 AA and that
image delivery authorizes on every read.

## Objective

Audit every surface built so far against `EXPERIENCE.md` §20 and the
`pass3-validation-report.md` findings, and enforce server-side image authorization.

## Stories Included

- **011-accessibility-and-secure-image-delivery**: 44×44 targets, keyboard reach, reduced motion, authorized image reads (Must)

## Bolt Type

**Type**: simple-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/simple-construction-bolt.md`

## Stages

- [ ] **1. design**: Pending → `implementation-plan.md`
- [ ] **2. implement**: Pending → source
- [ ] **3. test**: Pending → `simple-03-test-report.md`

## Dependencies

### Requires
- **002-audit-reads** (required): the audit views being checked
- **010-reporting-images** (required): the image delivery route
- **012-web-public** (required): the shell, tokens, and theme
- **021-web-admin** (required): the administrator surfaces

### Enables
- None (final bolt)

## Success Criteria

- [ ] Every interactive target is at least 44×44 CSS pixels
- [ ] Every surface is fully reachable and operable by keyboard
- [ ] Reduced motion is honoured on every animated surface
- [ ] Data tables are semantic and disclosures use `aria-expanded`
- [ ] Validation errors are shown after submit with an `role="alert"` summary
- [ ] Image reads authorize server-side immediately before the blob fetch
- [ ] No `s-maxage` header appears on a private image response
- [ ] Initial HTML meets the 2s p95 budget on a 4G connection

## Notes

This is the last bolt deliberately. Accessibility is not a story that can be
finished in isolation — it is a property of every surface built before it, so it
must be verified once they all exist.

Manual prototype acceptance remains deferred and is never asserted as passed by
this workflow.