---
id: 007-public-summary-listing
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-12, FR-38]
---

# Story: 007-public-summary-listing

User Story

**As an** anonymous visitor
**I want** to browse a paginated summary of Lost and Found reports
**So that** I can see that the organization runs a lost-and-found service

Acceptance Criteria

- [ ] **Given** an anonymous visitor, **When** they open the public listing, **Then** they receive a paginated list of Lost and Found reports
- [ ] **Given** the public listing, **When** rows are rendered without an explicit ordering, **Then** they are ordered by date, most recent first
- [ ] **Given** the public listing, **When** a summary row is returned, **Then** it contains exactly item name, category, date, campus area enum value, status, and type
- [ ] **Given** an anonymous request to the public listing endpoint, **When** the response is produced, **Then** it contains no image, no exact location, no identifying details, no description, and no reporter identity
- [ ] **Given** an anonymous request to the public listing endpoint, **When** the response is produced, **Then** it contains no Claims, no Recovery Responses, no workflow threads, and no audit history
- [ ] **Given** an anonymous visitor who clicks a summary row, **When** the click is handled, **Then** the visitor is routed to the login page with a return-after-login affordance
- [ ] **Given** an anonymous visitor, **When** they request a report detail, **Then** no anonymous report-detail page exists and no detail fields are returned
- [ ] **Given** the default public view, **When** statuses are selected, **Then** Found reports show only `Open`, `Claim Requested`, and `Claim Approved`, and Lost reports show only `Open` and `Verification Pending`, excluding `Returned` and `Closed`

Technical Notes

- FR-38 governs anonymous users only. Authenticated users — including unrelated authenticated members — are governed by FR-39, not by FR-38.
- There is no anonymous report-detail page in FindBack. The listing row is the whole of anonymous visibility on a report.
- FR-38 field set is exactly: item name, category, date, campus area (enum value, not exact place), status, type. Every other field is excluded, including description and image.
- The default non-administrator status view excludes `Returned` and `Closed`; the user can opt to include them. Administrators see all statuses by default.
- `Verification Pending` is discoverable: it is an active Lost-side intermediate status, not a terminal status, and appears in the default view.
- Authorization and field selection happen at the API layer. A response that loads sensitive columns and then strips them is not compliant (PRD §10, unit brief rule 1).
- Anonymous viewing is not partitioned (FR-49); it spans Lost and Found reports of all members.

Dependencies

Requires
- 001-create-lost-item-report
- 002-create-found-item-report

Enables
- 008-authenticated-detail-view

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Anonymous user pastes a report detail URL | Login page with return-after-login affordance; no detail data returned |
| Campus area is also the exact place text | Only the enum value is returned |
| Report in `Verification Pending` | Included in the default public view |
| Report in `Returned` or `Closed` | Excluded by default; includable on opt-in |
| Empty result set | An empty paginated page, not an error |
| Anonymous request with an `Active` session cookie absent | Treated as anonymous; the FR-38 field set applies |

Out of Scope

- Authenticated detail view (story 008)
- Search and filtering behaviour (story 009)
- The actor visibility matrix (story 010)
- Authenticated member partitions (story 011)
- Login implementation (Unit 001)
