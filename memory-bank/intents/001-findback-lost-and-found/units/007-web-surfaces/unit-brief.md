---
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
phase: inception
status: stories-defined
created: 2026-10-23T12:30:00.000Z
updated: 2026-10-23T12:25:00.000Z
unit_type: frontend
default_bolt_type: simple-construction-bolt
---

# Unit Brief: Web Surfaces

## Purpose

Renders every member, administrator, and public surface defined by the UX spines,
and enforces the **no-other-notifications** rule in the interface itself.

The design contract already exists and is frozen: `EXPERIENCE.md` and `DESIGN.md`
under `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/`. This
unit implements them; it does not invent or revise them.

## Scope

### In Scope
- Public surfaces: landing, login, register (+ errors, confirmation), pending /
  rejected / deactivated states, forgot password (+ sent) — `EXPERIENCE.md` §9.1,
  §9.3, §9.3a, §16
- The four member views: **My Reports**, **Browse**, **My Claims**, **My Recovery
  Responses** — §9.4, §3.1
- Member Profile `/my/profile` — §9.4a
- The four administrator queues: **Pending Registrations**, **Pending Claims**,
  **Items Awaiting Return**, **Items in Verification** — §15
- Administrator dashboard — §15.1
- Administrator report edit `/admin/items/:id/edit`, `/admin/lost/:id/edit` — §9.4b
- Contextual audit trail at `/admin/items/:id/audit` and `/admin/lost/:id/audit` — §17
- Image delivery route with server-side FR-39 authorization
- Theme switching (System / Light / Dark) — §19

### Out of Scope
- All business rules — Units 001 through 006
- **Any change to the UX spines**
- **Any change to the prototype** and any claim of prototype acceptance

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-30 | Unsupported Notification Channels and Events | Must |
| FR-33 | Administrator Dashboard | Must |
| FR-34 | Pending Claims Queue | Must |
| FR-35 | Items Awaiting Return Queue | Must |
| FR-50 | Items-in-Verification Queue | Must |

> These four are *owned* here because they are queue and interface requirements.
> Every other user-facing requirement is **realized** in this unit but **owned** by
> its domain unit, so that no requirement has two owners.

## Domain Concepts

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `renderPublicSurface` | Anonymous and auth-flow pages | route | HTML per `EXPERIENCE.md` |
| `renderMemberView` | One of the four disjoint member views | view, actor | actor-scoped HTML |
| `renderAdminQueue` | One of the four administrator queues | queue, actor | HTML |
| `renderAuditTrail` | Contextual audit view | reportId, actor | paginated HTML |
| `serveImage` | Authorized image delivery | reportId, actor | streamed image or 403 |

## Surfaces to build

### Public and authentication — 10 surfaces
Landing · Login · Register · Register errors · Register confirmation · Pending ·
Rejected · Deactivated · Forgot password · Forgot-password sent
(`EXPERIENCE.md` §16.1–§16.3, §9.3, §9.3a)

### Active member — 22 surfaces
Four views plus item detail per relationship, Claim form and detail, Recovery Response
form, per-Recovery-Response detail, profile, and edit/withdraw actions
(`EXPERIENCE.md` §9.4, §9.4a, §12, §13)

### Administrator — 17 surfaces
Dashboard, four queues, verification review, claim review, confirm-returned (default
and substitute), registration approve/reject, claim approve/reject, accounts,
administrator report edit, and the contextual audit views
(`EXPERIENCE.md` §15, §9.5, §9.4b, §17)

## Rules this unit must not break

1. **The spines are the contract.** `EXPERIENCE.md` and `DESIGN.md` win over any
   mockup or wireframe. Do not reword, restructure, or "improve" user-facing copy —
   error copy comes from §4.9, status labels from §4.2, and recovery-status
   microcopy from §4.6.
2. **No in-app notification stream exists.** There is no bell, no notification
   centre, no toast for a background event (FR-30). The dashboard shows entry points
   only — the `Recent activity` aggregation was deliberately removed in the
   2026-09-17 reconciliation.
3. **Audit is contextual, not a fifth queue.** There is **no** global
   `/admin/audit` route (`EXPERIENCE.md` §9.5, §15.1, §17.1).
4. **The four member views are disjoint** and must never render a member's own
   report in Browse (FR-49).
5. **Visibility is not the UI's job.** The server already filtered the data by
   FR-39; the UI must not re-implement the matrix as a display filter, because that
   would hide a leak rather than fix one.
6. **WCAG 2.1 AA is a build requirement:** 44×44 targets, keyboard reach, reduced
   motion, semantic tables, `aria-expanded` disclosures, validate-after-submit with
   `role="alert"` summaries (§20, `pass3-validation-report.md` §1).
7. **Image delivery authorizes server-side** immediately before the blob read. No
   `s-maxage` on a private image response (`image-handling.md` §3).
8. **Owner-determines / administrator-records wording** has approved and forbidden
   phrasings in §4.7. Use them verbatim.

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 001 | Actor resolution for every surface |
| 002 | Report data and the FR-39 projection |
| 003 | Claim data and thread state |
| 004 | Recovery Response data and per-Response thread state |
| 005 | Return and close outcomes |
| 006 | Audit trail for the contextual audit views |

### Depended By
| Unit | Reason |
|------|--------|
| — | Final unit; nothing depends on it |

## Technical Context

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| All backend units | In-process | Server Components, Server Actions, Route Handlers |
| Vercel Blob (private) | Outbound | Authorized image streaming |
| Vercel CDN | Delivery | Static assets only; `s-maxage` never on private responses |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| None of its own | — | — | — |

## Constraints

- Catalog marks this `unit_type: frontend` with `simple-construction-bolt`, since
  there is no domain modelling to do here — the domain is owned by Units 001–006.
- It is **not independently deployable**: it ships in the same Next.js application.
  That is a deliberate consequence of the $0 Vercel Hobby constraint.
- 49 surfaces total. The prototype under `_bmad-output/.../mockups/` is a **visual
  reference only**. It is never modified, and its manual acceptance is **deferred**
  and is never claimed by this workflow.

## Success Criteria

### Functional
- [ ] All public, member, and administrator surfaces render per the spines
- [ ] The four member views are disjoint and correctly partitioned
- [ ] The four administrator queues render and link to their work
- [ ] No global `/admin/audit` route exists
- [ ] Image access is denied for unauthorized viewers at the server
- [ ] Theme switching persists and respects System preference

### Non-Functional
- [ ] WCAG 2.1 AA checks pass on every surface
- [ ] Initial HTML ≤ 2 s p95 on a 4G connection
- [ ] No user-facing copy differs from the spines

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-web-1 | Simple | design tokens, layout, public surfaces, theme | Foundations and anonymous experience |
| bolt-web-2 | Simple | member views, item detail, report forms | Member experience |
| bolt-web-3 | Simple | Claim and Recovery Response surfaces and threads | Recovery workflows |
| bolt-web-4 | Simple | administrator dashboard, queues, verification review | Administrator experience |
| bolt-web-5 | Simple | profile, administrator edit, audit views, image delivery | Remaining surfaces and secure delivery |

## Notes

The prototype's 42 HTML pages under `mockups/` are a **reference for visual
surfaces**, not an acceptance gate. Manual prototype acceptance remains deferred and
is never asserted as passed by this workflow. If implementing a surface reveals that
the spines are ambiguous, raise it — do not resolve ambiguity by inventing behavior.
Changing a spine requires explicit owner approval.

---

## Story Summary

- **Total Stories**: 11
- **Must Have**: 11
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-design-foundations-and-theme**: one shared token layer, layout shell, and theme control - must - Planned
  <br>traces: FR-30
- [ ] **002-public-and-authentication-surfaces**: ten clear public and authentication surfaces - must - Planned
  <br>realizes (owned by another unit): FR-1, FR-2, FR-4, FR-51, FR-27
- [ ] **003-member-view-shell-and-navigation**: four disjoint participation views and a shell that navigates only between entry points - must - Planned
  <br>realizes (owned by another unit): FR-49
- [ ] **004-item-detail-by-relationship**: the detail page rendered for exactly my relationship to that item - must - Planned
  <br>realizes (owned by another unit): FR-39, FR-13, FR-37
- [ ] **005-report-forms-and-member-actions**: to create, edit, delete, or withdraw a report with the correct actions offered at the correct lifecycle point - must - Planned
  <br>realizes (owned by another unit): FR-6, FR-7, FR-8, FR-9, FR-11, FR-10
- [ ] **006-claim-and-recovery-threads**: Claim and Recovery Response forms and their message threads - must - Planned
  <br>realizes (owned by another unit): FR-47, FR-26, FR-15, FR-40
- [ ] **007-administrator-dashboard**: a dashboard that shows me four queue entry points with live counts - must - Planned
  <br>traces: FR-33
- [ ] **008-administrator-queues**: four working queues that each list exactly their own work and link into it - must - Planned
  <br>traces: FR-34, FR-35, FR-50
- [ ] **009-no-other-notifications**: to prove that no in-app notification stream exists anywhere in the interface - must - Planned
  <br>traces: FR-30
- [ ] **010-contextual-audit-views**: that item's audit trail at its own URL - must - Planned
  <br>realizes (owned by another unit): FR-31, FR-32
- [ ] **011-accessibility-and-secure-image-delivery**: every surface to meet WCAG 2.1 AA and every image to be authorized at the server before it is read - must - Planned
  <br>realizes (owned by another unit): FR-37, FR-39
