---
id: 007-administrator-dashboard
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: null
implemented: false
traces_to: [FR-33]
---

# Story: 007-administrator-dashboard

User Story

**As an** administrator
**I want** a dashboard that shows me four queue entry points with live counts
**So that** I know where the work is and can walk straight into it, without the product inventing a second inbox for me

Acceptance Criteria

- [ ] **Given** an administrator opens `/admin`, **When** the dashboard renders, **Then** exactly four count tiles appear at the top
- [ ] **Given** the dashboard tiles, **When** they are inspected, **Then** they are Pending Registrations, Pending Claims (Found-side), Items Awaiting Return (Found-side, `Claim Approved`), and Items in Verification (Lost-side, `Verification Pending`)
- [ ] **Given** a count tile, **When** it is activated, **Then** it navigates to its corresponding queue route
- [ ] **Given** a count tile, **When** its count is read, **Then** the count matches the number of rows the corresponding queue returns under its own filter
- [ ] **Given** all four counts are zero, **When** the dashboard renders, **Then** each tile shows `All caught up.` with a subtle check icon and each tile remains navigable
- [ ] **Given** the dashboard, **When** it is inspected, **Then** there is no `Recent activity` aggregation, activity feed, timeline, or digest section of any kind
- [ ] **Given** the dashboard, **When** it is inspected, **Then** there is no notification bell, no notification centre, no unread badge, and no notification count anywhere in the topbar or the page
- [ ] **Given** the dashboard, **When** it is inspected, **Then** there is no `Audit` tile, no fifth queue, and no `Reports to edit` tile
- [ ] **Given** the administrator topbar, **When** it is inspected, **Then** there is no link to audit and no link to any global audit route
- [ ] **Given** any `/admin` route, **When** the topbar renders, **Then** no navigation entry points at `/admin/audit` or at any other global audit route
- [ ] **Given** a non-administrator requests `/admin`, **When** the response renders, **Then** the access screen shows `This area is for administrators only.` and no dashboard content is delivered
- [ ] **Given** the dashboard tiles, **When** they render, **Then** each tile is keyboard-reachable, presents an interactive bounding box of at least 44 x 44 px, and has a visible focus ring
- [ ] **Given** the dashboard is loading, **When** the counts are being fetched, **Then** skeleton tiles render using theme tokens and no count of zero is displayed as real data
- [ ] **Given** the dashboard fails to load, **When** the error renders, **Then** it shows a calm message with `Try again` as primary and `Go back` as secondary, with no stack trace
- [ ] **Given** a dashboard tile count, **When** it renders, **Then** it uses tabular figures so counts align across tiles
- [ ] **Given** the dashboard, **When** it renders in dark theme, **Then** every tile, count, and label uses the dark theme tokens and passes AA contrast

Technical Notes

- FR-33 is owned by this unit because it is an interface and queue requirement. The queue membership rules themselves belong to the domain units.
- **The `Recent activity` aggregation was deliberately removed in the 2026-09-17 reconciliation.** Reintroducing it, in any form, is a regression against a frozen contract. There is no activity feed anywhere in the product.
- Audit is cross-cutting and contextual, not a fifth operational queue. It is reached only from `/admin/items/:id/audit` (Found) and `/admin/lost/:id/audit` (Lost) — story 010.
- FR-53 Administrator Edit Report is explicitly not a queue and adds no fifth tile.
- The dashboard's whole job is routing an administrator into a queue. Every tile must therefore be a real link, not a click handler on a non-interactive element.
- Copy authority: §15.1 dashboard and empty states, §5.2 topbar, §5.6 cards, §5.14 empty/loading/error states, §15.6 loading/error/permission states.
- Empty state copy is `All caught up.` and is per tile, not a single dashboard-level empty state.
- Counts are derived from the same query that populates each queue so the dashboard can never disagree with the work it points to.
- The absence of a notification stream is a build requirement here, not merely a rendering choice — story 009 verifies it.

Dependencies

Requires
- 001-design-foundations-and-theme
- 002-public-and-authentication-surfaces
- 003-member-view-shell-and-navigation

Enables
- 008-administrator-queues

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Administrator has never signed in and has no queued work | All four tiles show `All caught up.` and remain navigable |
| A new Pending Claim arrives while the dashboard is open | The Pending Claims tile is the only affected tile; no toast, bell, or activity entry appears |
| A Lost report moves to `Verification Pending` | Items in Verification count increments; Items Awaiting Return is untouched because it is Found-side only |
| Administrator deep-links to `/admin/audit` | No such route exists |
| Non-administrator requests `/admin` | Access screen with `This area is for administrators only.`; no tile data delivered |
| Tile count is very large | Count renders with tabular figures and does not wrap or clip |

Out of Scope

- The four queues themselves — story 008
- Contextual audit views — story 010
- Administrator claim review, verification review, and Confirm Returned surfaces — Units 003, 004, and 005
- Account management `/admin/accounts` — Unit 001
- Any notification surface — story 009
