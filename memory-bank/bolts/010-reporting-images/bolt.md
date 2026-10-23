---
id: 010-reporting-images
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 013-attach-image-to-report
created: 2026-10-23T13:09:30Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 001-audit-core
  - 006-reporting-visibility
  - 007-reporting-core
enables_bolts:
  - 022-web-audit-accessibility
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 2
---

# Bolt: 010-reporting-images

## Overview

Image attachment and — more importantly — authorized delivery.

## Objective

Attach an image to a report and serve it only to actors the FR-39 projection
permits, under the quota rules in `image-handling.md`.

## Stories Included

- **013-attach-image-to-report**: validate, store privately, authorize on every read (Must)

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
- **001-audit-core** (required): quota refusals are surfaced and logged
- **006-reporting-visibility** (required): image access follows the same matrix as fields
- **007-reporting-core** (required): images attach to reports

### Enables
- 022-web-audit-accessibility

## Success Criteria

- [ ] Uploads are validated for type and size per `image-handling.md`
- [ ] Images are stored privately and never publicly addressable
- [ ] Authorization is evaluated server-side immediately before every blob read
- [ ] No `s-maxage` is set on a private image response
- [ ] An unauthorized viewer receives a refusal, not the image
- [ ] Uploads are refused once Blob storage reaches its limit
- [ ] Replacing an image releases the prior blob per the cleanup rule in `image-handling.md` §4

## Notes

One story, its own bolt: image authorization is a privacy boundary, and it is the
only place in this unit where an authorization check happens on a read of
externally stored bytes rather than on a database query.