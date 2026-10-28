---
id: 004-append-only-enforcement
unit: 006-audit-and-observability
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:52:00.000Z
assigned_bolt: 001-audit-core
implemented: true
traces_to:
  - FR-31
---

# Story: 004-append-only-enforcement

User Story

**As the system**
I want no code path that can update or delete an audit record
**So that** the trail remains trustworthy for as long as it exists

Acceptance Criteria

- [ ] **Given** an existing audit record, **When** any update is attempted, **Then** the operation is refused
- [ ] **Given** an existing audit record, **When** any delete is attempted, **Then** the operation is refused
- [ ] **Given** an administrator, **When** they attempt to modify or delete a trail entry, **Then** the operation is refused with no privilege that could succeed
- [ ] **Given** a retention or cleanup job, **When** it attempts to prune audit records, **Then** no such pruning path exists
- [ ] **Given** an account that has been deactivated, **When** the trail is inspected, **Then** no record naming that actor has been rewritten, anonymized, or removed
- [ ] **Given** the FR-10 hard delete of an interaction-free `Open` report, **When** it occurs, **Then** that report's audit entries are removed with it as the single exception
- [ ] **Given** any report that reached `Returned` or `Closed`, **When** retention is considered, **Then** its audit entries are retained indefinitely

Technical Notes

- Append-only is enforced by the absence of an update or delete path, not by a permission check that could later be widened.
- The FR-10 exception is narrow and deliberate: hard delete is already restricted to interaction-free `Open` reports, so removing their trail removes no decision history.
- Deactivated actors stay named in the trail. Back-filling to hide an actor would defeat the purpose of the record.

Dependencies

Requires
- 001-append-only-audit-writes

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Direct database update bypassing the application | Prevented by database-level constraints, not by application convention alone |
| Hard delete of a report that has a Claim | Refused by FR-10; its trail is untouched |
| Data migration or seed script needing to reset audit tables | Not permitted in production; schema-level protection applies |

Out of Scope

- Archiving expired audit data
- Data-subject deletion requests against the trail
- Retention policy design beyond the frozen PRD