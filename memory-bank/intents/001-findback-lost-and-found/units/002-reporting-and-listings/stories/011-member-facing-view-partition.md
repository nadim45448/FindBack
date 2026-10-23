---
id: 011-member-facing-view-partition
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-49]
---

# Story: 011-member-facing-view-partition

User Story

**As an** `Active` member
**I want** my authored reports, other members' reports, my Claims, and my Recovery Responses in separate views
**So that** each view answers one question and nothing appears where it does not belong

Acceptance Criteria

- [ ] **Given** an `Active` member, **When** they list reports under the `mine` partition, **Then** only reports they authored are returned, both Lost and Found
- [ ] **Given** the `mine` partition, **When** default status filters are applied, **Then** reports remain retrievable across all lifecycle statuses including `Returned` and `Closed`, and the owner can opt to show them
- [ ] **Given** the `mine` partition, **When** its contents are returned, **Then** no other member's reports appear in it
- [ ] **Given** an `Active` member, **When** they list reports under the `browse` partition, **Then** other members' Lost and Found reports are returned, subject to the FR-14 filters and including `Verification Pending`
- [ ] **Given** an `Active` member, **When** any filter combination is applied under the `browse` partition, **Then** reports authored by that member are never returned, under any filter combination
- [ ] **Given** a Found report reached from `browse`, **When** its detail is opened, **Then** the `Submit Claim` action is exposed
- [ ] **Given** a Lost report reached from `browse`, **When** its detail is opened, **Then** the `Submit Recovery Response` action is exposed
- [ ] **Given** an `Active` member, **When** they list under the `claims` partition, **Then** only Claims they submitted on other members' Found reports are returned
- [ ] **Given** a row in the `claims` partition, **When** it is returned, **Then** it shows Claim status, the related Found report's FR-38 summary fields, submission timestamp, and a link to the per-Claim thread
- [ ] **Given** an `Active` member, **When** they list under the `recovery_responses` partition, **Then** only Recovery Responses they submitted on other members' Lost reports are returned
- [ ] **Given** a row in the `recovery_responses` partition, **When** it is returned, **Then** it shows the canonical Recovery Response status, the related Lost report's FR-38 summary fields, submission timestamp, and a link to the per-Recovery-Response thread
- [ ] **Given** any report visible to a member, **When** the four partitions are evaluated, **Then** no report appears in more than one of them for the same member
- [ ] **Given** an anonymous visitor, **When** they list reports, **Then** they receive the public summary listing which is not partitioned and spans Lost and Found reports of all members
- [ ] **Given** an authenticated request that specifies no partition, **When** it is served, **Then** the default partition is `browse`, which avoids accidental self-exposure
- [ ] **Given** a listing request, **When** the partition parameter is supplied, **Then** the accepted values are `mine`, `browse`, `claims`, `recovery_responses`, and `public` as the anonymous default
- [ ] **Given** a member whose Claim on another member's Found report is approved, **When** they view their own reports, **Then** no report they authored transitions as a result of that successful Claim
- [ ] **Given** a member whose Recovery Response is matched and returned, **When** they view their own reports, **Then** no report they authored transitions as a result of that successful Recovery Response

Technical Notes

- FR-49 defines four disjoint views: `My Reports` (authored), `Browse` (others' reports), `My Claims`, and `My Recovery Responses`. This story is authoritative for the partition; the field sets within each partition are governed by FR-39 (story 010).
- The four views are disjoint. A report authored by the member appears in `mine` and must never appear in their own `browse` under any filter combination.
- A successful Claim or Recovery Response on someone else's report does not transition any report the member authored. The Claim and Recovery Response mechanisms are separate from the report lifecycle.
- The default partition for an authenticated request is `browse`, not `mine`, so that self-exposure does not occur by accident.
- There is no automatic Lost-to-Found linkage anywhere in this story or in the product. The combined pool is a search pool, not a pairing mechanism (PRD constraint: no automatic matching).
- `Verification Pending` Lost reports are discoverable through `browse`; it is an active Lost-side intermediate status, not terminal.
- My Claims and My Recovery Responses are participation views over other members' reports; their threads are visible only in their own scope per FR-39.
- Anonymous viewing is not partitioned and remains governed by FR-12 and FR-38 (story 007).

Dependencies

Requires
- 007-public-summary-listing
- 009-search-and-filter
- 010-visibility-matrix-by-actor

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Member authored a report and also claimed on another's Found report | The authored report appears only in `mine`; the Claim appears only in `claims` |
| Member submitted a Recovery Response on a report they later cannot see | The response remains retrievable in `recovery_responses` |
| `mine` partition with default filters | `Returned` and `Closed` hidden by default, retrievable on opt-in |
| Member has no Claims and no Recovery Responses | `claims` and `recovery_responses` return empty results, not errors |
| Anonymous request supplying an authenticated-only partition | Not served as an authenticated partition; the public listing applies |
| Filter that would match the member's own report under `browse` | The member's own report is still excluded |

Out of Scope

- The FR-39 field sets inside each partition (story 010)
- Search and filter mechanics (story 009)
- Claim submission and its lifecycle (Unit 003)
- Recovery Response submission and its lifecycle (Unit 004)
- Navigation and menu rendering (Unit 007)
