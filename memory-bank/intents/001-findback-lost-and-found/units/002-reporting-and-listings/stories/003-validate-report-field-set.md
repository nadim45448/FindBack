---
id: 003-validate-report-field-set
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-8]
---

# Story: 003-validate-report-field-set

User Story

**As a** member creating a report
**I want** my report validated against the authoritative field set
**So that** reports in the system are complete, comparable, and searchable

Acceptance Criteria

- [ ] **Given** a Lost item report submission, **When** the date is validated, **Then** a date more than 365 days ago is rejected and a date in the future is rejected
- [ ] **Given** a Found item report submission, **When** the date is validated, **Then** a date more than 30 days ago is rejected and a date in the future is rejected
- [ ] **Given** either report type, **When** the date is exactly on the allowed boundary, **Then** it is accepted
- [ ] **Given** a report submission, **When** the category is validated, **Then** only values from the fixed enum Wallet, Bag, Electronics, Keys, Clothing, Books/Notebooks, Identification, Water Bottle, Other are accepted
- [ ] **Given** a report submission, **When** the campus area is validated, **Then** only values from the deployment's configured campus-area list are accepted, and the value stored is the enum value rather than the exact-place free text
- [ ] **Given** a report submission, **When** required fields are validated, **Then** name, category, description, date, and campus area must be present, and the submission is rejected if any is missing
- [ ] **Given** a report submission, **When** string lengths are validated, **Then** name is 1-80 chars, description is 10-2000 chars, exact place is 0-200 chars, and identifying details is 0-500 chars
- [ ] **Given** a report submission with optional fields omitted, **When** it is validated, **Then** it is accepted, because exact place, identifying details, and image are optional
- [ ] **Given** a report submission that fails any rule, **When** validation completes, **Then** the report is not created and a field-level validation error identifies the offending field

Technical Notes

- FR-8 is the authoritative field set. The five required fields are name, category, description, date, and campus area; exact place, identifying details, and image are optional.
- Two date bounds coexist and are not configurable: Lost ≤ 365 days, Found ≤ 30 days, neither in the future. 365 is the settled current product rule (OQ-3) and is explicitly not relaxable.
- Validation runs server-side. Client-side checks are UX affordances only and are never trusted (image-handling §1 principle, applied to all fields).
- The category and campus-area enums are closed sets. A value outside either set is a validation rejection, not a stored free-text value.
- The same validator serves report creation (stories 001 and 002) and reporter edit (story 004), so bounds are enforced identically on both paths.
- Length bounds are inclusive at both ends.

Dependencies

Requires
- None (unit-internal)

Enables
- 001-create-lost-item-report
- 002-create-found-item-report
- 004-edit-own-report
- 009-search-and-filter

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Description of exactly 10 or 2000 chars | Accepted; the bound is inclusive |
| Exact place of exactly 200 chars | Accepted |
| Identifying details of exactly 500 chars | Accepted |
| Whitespace-only name | Rejected; minimum length is not met by whitespace |
| A campus area deactivated after a report was filed | The stored report keeps its value; the enum change affects new submissions only |
| Date entered with a time component | The date is compared by calendar day |
| Client submits a category not in the enum | Rejected server-side regardless of what the client displayed |

Out of Scope

- The report creation flows themselves (stories 001 and 002)
- Campus-area configuration mechanism (OQ-1, owned by Architecture)
- Image validation (story 013)
- Recovery Response field validation (Unit 004, FR-44)
