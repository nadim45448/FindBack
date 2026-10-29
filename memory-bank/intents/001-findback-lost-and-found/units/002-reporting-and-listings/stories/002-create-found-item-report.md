---
id: 002-create-found-item-report
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:46:00Z
assigned_bolt: 007-reporting-core
implemented: true
traces_to: [FR-7, FR-8]
---

# Story: 002-create-found-item-report

User Story

**As a** member who has found an item
**I want** to file a Found item report
**So that** its owner can recognise it and claim it

Acceptance Criteria

- [ ] **Given** an `Active` member, **When** they submit a Found item report with name (1-80 chars), category (one of the fixed enum), description (10-2000 chars), date found (within the last 30 days, not in the future), and campus area (from the deployment's fixed list), **Then** the report is created with type `Found` and status `Open`
- [ ] **Given** a successfully created Found report, **When** the creation is recorded in the audit trail, **Then** an audit event is recorded with the reporter as actor, the report ID, name, category, type `Found`, date, location, optional fields, image presence, and a timestamp
- [ ] **Given** a member who is not `Active`, **When** they attempt to submit a Found item report, **Then** creation is refused and no report is created
- [ ] **Given** a Found item report, **When** it is created, **Then** the location field records the place where the item was found and the date field records the date it was found, not the date it was lost
- [ ] **Given** a Found item report, **When** it is created, **Then** its date bound is the last 30 days and it may not be in the future; the 30-day past bound is the authoritative requirement for Found reports and is not expanded or made configurable
- [ ] **Given** a Found report submitted with identifying details or an exact place, **When** it is accepted, **Then** both are stored as Sensitive Fields (FR-37) and are not exposed to any actor the FR-39 matrix does not authorize
- [ ] **Given** a Found item report submitted with an image, **When** the image fails validation or storage, **Then** the report is not created, because the upload is part of the write and not a follow-up step (image-handling §5)

Technical Notes

- FR-7 uses the same field set and validation rules as FR-6 except that the date field is "date found" and the location is where the item was found.
- Found and Lost reports share one field set and one category enum (FR-8); they differ only in type and in the date bound (365 days for Lost, 30 days for Found).
- The Found/Lost split is the anchor for FR-10 (interaction-free Open only) and FR-11 (withdrawal rules differ by type): a Found report's interaction is a Claim, a Lost report's interaction is a Recovery Response.
- The Found report's lifecycle starts `Open` and later reaches `Claim Requested`, `Claim Approved`, `Returned`, and `Closed` via FR-22 and Unit 003.
- Report creation writes FR-31 audit event 1 (`Report created`); the audit-event catalog is owned by Unit 006.
- See story 003 for the shared field validation rules this story invokes.

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
| Date found exactly 30 days ago | Accepted; the bound is inclusive |
| Date found 31 days ago | Rejected by validation |
| Date found tomorrow | Rejected; the date may not be in the future |
| A member filing a Found report for an item they themselves lost | Accepted; FindBack does not attempt to infer or block this |
| Found report submitted with no image | Accepted; the image is optional |
| Same item filed as both a Lost and a Found report by one member | Both are accepted; no automatic Lost-to-Found linkage exists |

Out of Scope

- Date and field validation mechanics (story 003)
- Image validation, quota, and delivery (story 013)
- Claim submission against a Found report (Unit 003)
- Editing an existing report (story 004)
- Automatic Lost-to-Found matching (PRD constraint: no automatic matching)
