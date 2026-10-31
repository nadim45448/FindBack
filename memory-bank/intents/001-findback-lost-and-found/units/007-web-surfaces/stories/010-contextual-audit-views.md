---
id: 010-contextual-audit-views
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: 021-web-admin
implemented: true
traces_to: []
realizes_fr: [FR-31, FR-32]
---

# Story: 010-contextual-audit-views

User Story

**As an** administrator investigating one specific item
**I want** that item's audit trail at its own URL
**So that** I can reconstruct exactly what happened to it, without a global audit page that would invite browsing other people's records

Acceptance Criteria

- [x] **Given** an administrator opens `/admin/items/:id/audit` for a Found report, **When** the view renders, **Then** it shows the reverse-chronological event list for that report only
- [x] **Given** an administrator opens `/admin/lost/:id/audit` for a Lost report, **When** the view renders, **Then** it shows the reverse-chronological event list for that report only
- [x] **Given** any route request for `/admin/audit` or any other global audit route, **When** it is resolved, **Then** no such route exists and the request does not succeed
- [x] **Given** the dashboard, **When** it renders, **Then** there is no audit tile, no audit link, and no fifth queue
- [x] **Given** the administrator topbar, **When** it renders, **Then** it contains no audit link
- [x] **Given** an audit event row, **When** it renders, **Then** it shows timestamp in full date and time, actor display name with a role tag of `Member` or `Administrator`, a plain-English action verb, the target entity, and any additional fields
- [x] **Given** an audit event with additional fields such as a claim reason, identifying details, or substitute receiver fields, **When** it renders, **Then** those fields sit behind a `Show details` disclosure that is collapsed by default
- [x] **Given** the `Show details` disclosure, **When** its state is inspected, **Then** it is a button carrying `aria-expanded` and `aria-controls` referencing the hidden region by its id, and toggling updates `aria-expanded`
- [x] **Given** an audit trail page, **When** it first loads, **Then** 25 events are returned, newest first
- [x] **Given** more than 25 events exist, **When** the 25 are displayed, **Then** a `Load older` button is offered and there is no infinite scroll
- [ ] **Given** `Load older` is activated, **When** the next page returns, **Then** the additional 25 older events are appended to the existing list and the scroll position is preserved — *the button and the rule that governs whether it appears are delivered; the append behaviour itself is Unit 006's read path and is not wired in this bolt*
- [x] **Given** exactly 25 events exist, **When** the page renders, **Then** no `Load older` button is shown
- [x] **Given** fewer than 25 events exist, **When** the page renders, **Then** all events render and no `Load older` button is shown
- [ ] **Given** an audit filter, **When** it is applied, **Then** action type filter, date range filter, and actor filter are all available and the result set is recomputed against the same report — *the three filters are not part of this bolt's surface*
- [x] **Given** an audit event type, **When** it renders, **Then** it carries the specified icon and left border accent in the status color for its event class
- [x] **Given** a non-numbered `Member profile edited` or `Report edited by Administrator` record, **When** it renders, **Then** it shows its own label and its changed fields and previous values, and it does not consume or display a numbered workflow event ID
- [x] **Given** the numbered workflow events, **When** they render, **Then** events 1 through 14 and 15 through 30 are unchanged in label and semantics
- [x] **Given** an audit event that is a reporter edit, **When** it renders, **Then** it renders as `Report edited by reporter`, which is distinct from `Report edited by Administrator`
- [x] **Given** the audit trail renders, **When** it is inspected as markup, **Then** it is a `table` element, not a list, with `th scope="col"` for the Timestamp, Actor, Action, Target, and Details columns
- [x] **Given** an audit row, **When** its accessible name is read, **Then** it follows the template `{Action verb} {actor display name} {target} at {timestamp}`
- [x] **Given** a member, **When** they request either audit route, **Then** they are refused and no audit content is delivered
- [x] **Given** an administrator opens an audit trail, **When** the read occurs, **Then** an audit access log entry is created server-side, and that access log is not surfaced in this UX
- [x] **Given** a member viewing their own item, **When** they look for the audit trail, **Then** no control or disclosure exposes it and they see only the member-facing status history of at most 3 entries

Technical Notes

- FR-31 audit scope and FR-32 audit visibility are domain-owned by Unit 006. This story renders the views for the audit records that unit produces.
- Audit is **contextual, not a queue**. The two routes are the only audit surfaces. There is no global route, no dashboard tile, and no topbar link. This is the single most important structural constraint on this story.
- Pagination is reverse-chronological, 25 per page, with a `Load older` button. Infinite scroll is explicitly rejected because it confuses screen readers and makes an administrator's position in the list unrecoverable.
- Every audit record is append-only. Previous entries are never edited or deleted, and nothing on this page offers an edit or delete control.
- Event 1 to 14 are the FR-31 numbered core/Found/account catalogue. Events 15 to 30 are the FR-48 numbered Lost-side catalogue. FR-52 and FR-53 add two **non-numbered** record types that do not introduce event 31 or renumber anything.
- Additional fields are collapsed behind `Show details` so the trail stays scannable while remaining complete on demand.
- Copy authority: §17.1 access, §17.2 layout, §17.3 filters, §17.4 event differentiation table, §17.5 member-facing status history, §17.5a non-numbered record types, §17.6 audit access log, §17.7 contextual account audit access, §20.3 audit row aria-label template, §20.7 tables, §23 UX-OQ-C pagination decision.
- Timestamps render in full date and time in the organization locale (en-US; i18n is deferred).
- Within `/admin/accounts`, the contextual account and profile audit disclosure is a separate surface in Unit 001's scope; it introduces no new route, no queue, and no event numbering.

Dependencies

Requires
- 001-design-foundations-and-theme
- 004-item-detail-by-relationship
- 008-administrator-queues

Enables
- None

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Report has exactly 25 events | All render; no `Load older` button |
| Report has 26 events | First 25 render; `Load older` reveals the single remaining event |
| Report has 0 events | The view renders its empty state rather than a blank table |
| Administrator requests `/admin/audit` | No such route; the request does not succeed |
| Administrator filters by actor and then loads older | The filter persists across the additional page |
| Event has no additional fields | `Show details` is not rendered for that row |
| Two administrators read the same trail | Both reads produce an access log entry and the trail is unchanged |
| Member requests their own report's audit URL | Refused; only the member-facing status history is available to them |

Out of Scope

- Audit event production, ordering, and append-only enforcement — Unit 006
- Audit access logging implementation — Unit 006
- The claim review screen's link to the item audit trail — Unit 003
- Account and profile audit disclosure inside `/admin/accounts` — Unit 001
- Any global audit route, queue, or dashboard tile — explicitly excluded
- Notification of audit changes — story 009
