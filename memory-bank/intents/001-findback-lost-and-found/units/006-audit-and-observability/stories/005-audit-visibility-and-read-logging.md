---
id: 005-audit-visibility-and-read-logging
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
status: implemented
priority: must
created: 2026-10-23T12:52:30Z
assigned_bolt: 002-audit-reads
implemented: true
traces_to: [FR-32]
---

# Story: 005-audit-visibility-and-read-logging

User Story

**As the owner**
I want to know who has reviewed my project's audit trail
**So that** reading it is itself accountable

Acceptance Criteria

- [x] **Given** a non-administrator member, **When** they attempt to reach any audit view, **Then** the request is refused and no trail content is returned
- [x] **Given** an administrator, **When** they open a report's audit trail, **Then** the trail is returned in reverse-chronological order
- [x] **Given** an administrator viewing a trail, **When** the read occurs, **Then** a record is written capturing administrator, query, filters, result count, and timestamp
- [x] **Given** an audit read record, **When** it is inspected, **Then** it is a distinct record type and not an event on the audited entity
- [x] **Given** audit trail storage, **When** a read must be reviewable later, **Then** it is stored in the database rather than only in runtime logs
- [x] **Given** a trail query, **When** it is executed at the PRD scale of 10,000 reports with 50 events each, **Then** it completes within 1 second at the 95th percentile
- [x] **Given** a trail listing, **When** it is paginated, **Then** it shows 25 entries per page with no infinite scroll

Technical Notes

- Vercel Hobby retains runtime logs for one hour, so audit-read logging **must** be a table. A stdout line would not survive long enough to answer the question.
- Audit-read logging is deliberately separate from the trail: reading the record of who read the record would recurse without adding accountability.
- Reverse-chronological, 25 per page, `Load older` — this is the UX-OQ-C decision, and it is settled.

Dependencies

Requires
- 001-append-only-audit-writes
- 004-append-only-enforcement

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Member crafts a direct URL to an audit view | Refused server-side; no partial content returned |
| Administrator filters the trail | The read record captures the filters applied |
| Administrator reads the same trail twice | Two read records; reads are never deduplicated |
| Trail is empty for a newly created report | Empty state rendered; the read itself is still recorded |

Out of Scope

- Rendering the audit view (Unit 007, contextual audit views)
- Exporting the trail
- Alerting on read activity