---
id: 001-create-lost-item-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 007-reporting-core
implemented: true
traces_to: [FR-6, FR-8]
---

# Story: 001-create-lost-item-report

User Story

**As a** member who has lost an item
**I want** to file a Lost item report
**So that** other members can recognise the item and return it to me

Acceptance Criteria

- [ ] **Given** an `Active` member, **When** they submit a Lost item report with name (1-80 chars), category (one of the fixed enum), description (10-2000 chars), date lost (within the last 365 days, not in the future), and campus area (from the deployment's fixed list), **Then** the report is created with type `Lost` and status `Open`
- [ ] **Given** a successfully created Lost report, **When** the creation is recorded in the audit trail, **Then** an audit event is recorded with the reporter as actor, the report ID, name, category, type `Lost`, date, location, optional fields, image presence, and a timestamp
- [ ] **Given** a member who is not `Active`, **When** they attempt to submit a Lost item report, **Then** creation is refused and no report is created
- [ ] **Given** a Lost report submitted without identifying details and without an image, **When** it is submitted, **Then** it is accepted, because both fields are optional
- [ ] **Given** a Lost report submitted with identifying details, **When** it is accepted, **Then** the identifying details are stored as a Sensitive Field (FR-37) and are not exposed to any actor the FR-39 matrix does not authorize
- [ ] **Given** a Lost report submitted with an exact place, **When** it is accepted, **Then** the exact place is stored as a Sensitive Field (FR-37) and the campus area enum value is stored separately as a non-sensitive field
- [ ] **Given** a Lost report submitted with an image, **When** the image fails validation or storage, **Then** the report is not created, because the upload is part of the write and not a follow-up step (image-handling §5)

Technical Notes

- The FR-8 field set is authoritative and enforced exactly: name, category, description, date, campus area, exact place, identifying details, image. No field beyond this set is stored on a Report.
- Date bounds are enforced per report type: Lost `date` is within the last 365 days and never in the future. The 365-day bound is the current product rule (OQ-3) and is not relaxable or configurable.
- The category enum is fixed: Wallet, Bag, Electronics, Keys, Clothing, Books/Notebooks, Identification, Water Bottle, Other.
- Campus area is an enum whose list is set per deployment (A4); the configuration mechanism is owned by Architecture (OQ-1).
- Report creation writes FR-31 audit event 1 (`Report created`); the audit-event catalog and numbering are owned by Unit 006.
- The reporter's email is a Sensitive Field (FR-37) reachable for FR-39 projection, but never returned by a listing endpoint.
- See story 003 for the field validation rules this story invokes.

Dependencies

Requires
- 003-login-with-active-account
- 003-validate-report-field-set

Enables
- 004-edit-own-report
- 005-delete-own-report
- 006-withdraw-own-report
- 007-public-summary-listing
- 009-search-and-filter
- 010-visibility-matrix-by-actor
- 013-attach-image-to-report

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Date lost exactly 365 days ago | Accepted; the bound is inclusive |
| Date lost 366 days ago | Rejected by validation |
| Date lost tomorrow | Rejected; neither date may be in the future |
| Description of 9 or 2001 chars | Rejected; the bound is 10-2000 |
| Category value outside the enum | Rejected |
| Campus area value not in the deployment list | Rejected |
| Name of 0 or 81 chars | Rejected; the bound is 1-80 |
| Category set to `Other` with no qualifying text | Accepted; the enum permits it |

Out of Scope

- Date and field validation mechanics (story 003)
- Image validation, quota, and delivery (story 013)
- Editing an existing report (story 004)
- Found item reports (story 002)
- Automatic Lost-to-Found matching (PRD constraint: no automatic matching)
