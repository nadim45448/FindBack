---
id: 003-member-view-shell-and-navigation
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: 014-web-threads
implemented: true
traces_to: []
realizes_fr: [FR-49]
---

# Story: 003-member-view-shell-and-navigation

User Story

**As an** `Active` member
**I want** four disjoint participation views and a shell that navigates only between entry points
**So that** each of my kinds of participation has exactly one home and I never confuse an authored report with a Claim or a Recovery Response

Acceptance Criteria

- [x] **Given** an `Active` member on any member surface, **When** the topbar renders, **Then** it exposes `My Reports`, `Browse`, `My Claims`, and `My Recovery Responses`, plus `Report ▾` (Lost / Found) and `Account`
- [x] **Given** an `Active` member, **When** the four views are inspected, **Then** no report appears in more than one of them for that member
- [x] **Given** a member who authored a report, **When** that member browses `Browse` under any filter combination, **Then** their own report never appears in the results
- [x] **Given** a member viewing `My Reports`, **When** the view renders, **Then** it contains only reports they authored and never their Claims or Recovery Responses
- [x] **Given** a member viewing `My Claims`, **When** the view renders, **Then** it contains only Claims they submitted against other members' Found reports and never their authored reports
- [x] **Given** a member viewing `My Recovery Responses`, **When** the view renders, **Then** it contains only Recovery Responses they submitted against other members' Lost reports and never their authored reports
- [x] **Given** `My Reports`, **When** the view renders, **Then** it shows tabs `Lost`, `Found`, and `Closed`, and each row shows a type badge, item name, status badge, and a last-updated timestamp
- [x] **Given** `My Claims`, **When** the view renders, **Then** it shows tabs `Pending`, `Approved`, and `Rejected`, and each row shows the item name, item type, status badge, and claim submission time
- [x] **Given** `My Recovery Responses`, **When** the view renders, **Then** it shows tabs by canonical Recovery Response status, and each row shows the related Lost item name, the canonical status badge with the `Submitted — Standby` derivation applied where applicable, and the submission time
- [x] **Given** a member whose Recovery Response reached a terminal status, **When** `My Recovery Responses` renders, **Then** the terminal response remains visible and retrievable
- [x] **Given** an anonymous visitor, **When** the topbar renders, **Then** it shows `Lost & Found`, `Log in`, and `Register` only, with no dashboard and no Report actions
- [x] **Given** a `Pending` account, **When** the topbar renders, **Then** it collapses to brand mark plus status banner plus `Log out`, with no Browse, no Report, no Claims, and no Recovery Responses
- [x] **Given** an administrator who is also a member, **When** the topbar renders, **Then** a second nav layer `Admin ▾` exposes the four operational queues plus `Accounts`, visually delineated from member actions by a divider and label
- [ ] **Given** `Admin ▾`, **When** it is opened, **Then** it lists exactly Pending Registrations, Pending Claims, Items Awaiting Return, Items in Verification, and Accounts — **not delivered by this bolt**; the administrator nav belongs to `021-web-admin`
- [x] **Given** a member on `/home`, **When** the dashboard renders, **Then** it presents `Report Lost Item` and `Report Found Item` as two paired primary buttons, and below the fold shows entry-point links to the four participation views
- [x] **Given** a member on `/home`, **When** the page is inspected, **Then** there is no aggregate activity feed of any kind
- [ ] **Given** `Browse`, **When** a member views it, **Then** it is the same listings surface as anonymous with a richer view including filter pills, a type toggle, and sort — **partially delivered**; the member Browse serves the `browse` partition with the richer rows, but the filter-pill bar and the sort headers are `009-reporting-search`'s surface
- [x] **Given** the `Account` menu, **When** it is opened, **Then** it contains `Profile` and `Logout` only, and it is a navigation control with no `/account` route
- [x] **Given** a member on a detail page, **When** breadcrumbs render, **Then** they are keyboard-navigable, for example `Listings / Wallet / Claim`
- [x] **Given** any member surface with an empty view, **When** it renders, **Then** it shows a friendly headline, a one-sentence body, and a single next-action button with no illustration

Technical Notes

- FR-49 defines the four disjoint views and is owned by Unit 002 (story `011-member-facing-view-partition`). This story renders that partition; it does not re-derive it.
- The four views are participation views. `/home`, `/report/lost`, `/report/found`, and `/my/profile` are entry points, not participation views, and must not be presented as a fifth view.
- Navigation is entry-point navigation only. No view links into another view's list as a filtered convenience, because that would blur the partition the user is meant to hold.
- The exclusion of a member's own report from their own `Browse` is realized here at the render layer on top of the server-side partition. It must never be reimplemented as a client-side CSS or display filter.
- The member dashboard is the single sanctioned exception to the one-primary-per-view rule: the two report CTAs route to distinct forms and do not compete for one outcome.
- `Admin ▾` is a second nav layer under the member nav, not a replacement for it. An administrator keeps their member views.
- `Logout` lives inside `Account ▾` and is not a standalone topbar control.
- Theme is not in the `Account` menu; it is a separate topbar icon control on every surface (story 001).
- Listing filters use the pattern in §7.1: a filter bar above the results, collapsible on mobile; active filters render as removable pills; a `Clear all` pill appears when two or more filters are active.
- No notification affordance may be added to the topbar or to any view — story 009.

Dependencies

Requires
- 001-design-foundations-and-theme
- 002-public-and-authentication-surfaces

Enables
- 004-item-detail-by-relationship
- 005-report-forms-and-member-actions
- 006-claim-and-recovery-threads

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Member authored a report and also claimed on another's Found report | The authored report appears only in `My Reports`; the Claim appears only in `My Claims` |
| A filter would match the member's own report in `Browse` | The member's own report is still excluded |
| Member has no Claims and no Recovery Responses | `My Claims` and `My Recovery Responses` render empty states, not errors |
| Administrator signs in who is also a member | Member nav and `Admin ▾` both present |
| `Pending` user deep-links to `/my/claims` | Restricted message; no Claims nav item is revealed |
| Member navigates browser-back from a member surface to `/` | No redirect loop; the public surface renders |

Out of Scope

- The FR-49 partition rules themselves — Unit 002
- Item detail rendering — story 004
- Report forms and edit/delete/withdraw actions — story 005
- Claim and Recovery Response surfaces — story 006
- Member Profile `/my/profile` — Unit 001 owns its business rules
