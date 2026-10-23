---
id: 009-reporting-search
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: planned
stories:
  - 007-public-summary-listing
  - 008-authenticated-detail-view
  - 009-search-and-filter
  - 011-member-facing-view-partition
created: 2026-10-23T13:09:00Z
started: null
completed: null
current_stage: null
stages_completed: []

requires_bolts:
  - 006-reporting-visibility
  - 007-reporting-core
enables_bolts:
  - 012-web-public
  - 014-web-threads
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

# Bolt: 009-reporting-search

## Overview

Reading the report pool — anonymously, by search, and through the four disjoint
member views.

## Objective

Deliver public summary listings, authenticated detail, indexed search within the
performance budget, and the FR-49 view partition.

## Stories Included

- **007-public-summary-listing**: anonymous access to FR-38 summary fields only (Must)
- **008-authenticated-detail-view**: detail requires login, filtered by FR-39 (Must)
- **009-search-and-filter**: keyword, category, area, date, type, status; ≤500ms p95 (Must)
- **011-member-facing-view-partition**: four disjoint views, no self-overlap in Browse (Must)

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
- **006-reporting-visibility** (required): every read path uses the FR-39 projection
- **007-reporting-core** (required): needs the Report aggregate and its indexes

### Enables
- 012-web-public
- 013-web-member

## Success Criteria

- [ ] Anonymous listing returns FR-38 fields and nothing more; detail requires login
- [ ] Search returns within 500ms p95 at 10,000 active reports
- [ ] Search queries are index-backed; no full table scan over reports
- [ ] The four views are disjoint: My Reports, Browse, My Claims, My Recovery Responses
- [ ] A member's own report never appears in their own Browse
- [ ] No Lost and Found reports are linked automatically

## Notes

Search performance is the one place in this unit with a numeric budget. Verify it
against 10,000 seeded active reports, not against a handful of fixtures — an
index that works on 50 rows is not evidence for 10,000.