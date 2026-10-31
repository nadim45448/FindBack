---
id: 009-search-and-filter
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 009-reporting-search
implemented: true
traces_to: [FR-14]
---

# Story: 009-search-and-filter

User Story

**As a** visitor or member
**I want** to search and narrow the combined pool of reports
**So that** I can find a specific item quickly

Acceptance Criteria

- [ ] **Given** any listing caller, **When** a keyword is supplied, **Then** it matches item name and description case-insensitively on a partial match
- [ ] **Given** a category filter, **When** it is applied, **Then** results are restricted to the single selected category from the FR-8 enum
- [ ] **Given** a location filter, **When** it is applied, **Then** it filters on the campus area enum and not on exact-place free text
- [ ] **Given** a date range filter, **When** it is applied, **Then** it filters the report's own date field
- [ ] **Given** a type filter, **When** it is applied, **Then** results are restricted to `Lost`, `Found`, or both, defaulting to both
- [ ] **Given** a status filter on Found reports, **When** it is applied, **Then** the available values are `Open`, `Claim Requested`, `Claim Approved`, `Returned`, and `Closed`
- [ ] **Given** a status filter on Lost reports, **When** it is applied, **Then** the available values are `Open`, `Verification Pending`, `Returned`, and `Closed`
- [ ] **Given** a type filter and a status filter together, **When** both are applied, **Then** the combination is valid and composes, including Found with `Claim Requested` and Lost with `Verification Pending`
- [ ] **Given** a non-administrator caller, **When** no explicit status filter is supplied, **Then** the default status view excludes `Returned` and `Closed` and the caller can opt to include them
- [ ] **Given** an administrator caller, **When** no explicit status filter is supplied, **Then** all statuses are returned by default
- [ ] **Given** a Lost report in `Verification Pending`, **When** a default search runs, **Then** the report is discoverable because `Verification Pending` is an active Lost-side intermediate status and not terminal
- [ ] **Given** 10,000 active reports, **When** a search or filter query runs, **Then** results are returned within 500 ms at p95
- [ ] **Given** a search or filter query, **When** the query plan is inspected, **Then** it is index-backed and performs no full scan over the reports table

Technical Notes

- FR-14 searches the combined Lost and Found pool for every caller, including anonymous. Authorization and field selection still apply per the viewer's actor projection (stories 007, 010, 011).
- The performance target is ≤ 500 ms p95 at 10,000 active reports (PRD §10). The mechanism — indexes, query shape, pagination — is owned by Architecture; the target is not.
- Search and listing queries must be index-backed. A full scan over reports is not acceptable at this data volume.
- Location filtering uses the campus area enum, which is the only non-sensitive location field. Filtering on exact-place text would require loading a Sensitive Field for actors not authorized to see it.
- Keyword matching is a case-insensitive partial match against name and description only; it does not search exact place or identifying details, both of which are Sensitive Fields.
- Status filters are type-aware because the Found and Lost status sets differ.
- Default status visibility differs by role: non-administrators exclude `Returned` and `Closed` by default, administrators see all statuses.

Dependencies

Requires
- 007-public-summary-listing
- 010-visibility-matrix-by-actor
- 011-member-facing-view-partition

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Keyword with no matches | Empty result set |
| Keyword matching only on description | Matched; description is in the keyword search surface |
| Type `Found` with status `Verification Pending` | Invalid combination; `Verification Pending` is a Lost status only |
| Campus area filter set to a deactivated area | Returns nothing for newly deactivated areas; existing reports retain their stored value |
| Keyword that would match Sensitive Fields only | No match; the keyword surface excludes exact place and identifying details |
| Deep pagination beyond the first page | Still within the performance target; pagination is applied rather than loading the pool |

Out of Scope

- Sorting options beyond the default ordering
- Full-text relevance ranking (FR-14 specifies partial matching only)
- Anonymous versus authenticated field differences (stories 007 and 010)
- Listing partition behaviour (story 011)
- Index and query mechanism design (Architecture)
