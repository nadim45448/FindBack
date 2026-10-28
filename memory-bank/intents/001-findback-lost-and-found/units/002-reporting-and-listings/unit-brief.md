---
unit: 002-reporting-and-listings
intent: 001-findback-lost-and-found
phase: inception
status: stories-defined
created: 2026-10-23T12:30:00.000Z
updated: 2026-10-23T12:30:00.000Z
unit_type: backend
default_bolt_type: ddd-construction-bolt
---

# Unit Brief: Reporting and Listings

## Purpose

Owns **what exists and who may see it**: the Lost/Found report lifecycle, the
authoritative FR-8 field set, search and filtering, and — most importantly — the
FR-39 visibility projection that every other read path in FindBack depends on.

## Scope

### In Scope
- Create Lost and Found reports with the FR-8 field set (FR-6, FR-7, FR-8)
- Edit, delete, and withdraw by the reporter (FR-9, FR-10, FR-11)
- Audit-tracked reporter edits and withdrawals (FR-19, FR-20)
- Public summary listings for anonymous visitors (FR-12)
- Authenticated detail view (FR-13)
- Search and filter by keyword, category, location, date, type, status (FR-14)
- Sensitive field set (FR-37), public summary field set (FR-38)
- Member-facing visibility matrix by actor (FR-39)
- The four disjoint member views (FR-49)
- Administrator report edit for moderation (FR-53)
- Image attachment and its validation and authorization

### Out of Scope
- Account identity — Unit 001
- Claim lifecycle — Unit 003
- Recovery Response lifecycle — Unit 004
- Confirm Returned — Unit 005
- Rendering the surfaces — Unit 007

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-6 | Create Lost Item Report | Must |
| FR-7 | Create Found Item Report | Must |
| FR-8 | Report Field Set (Authoritative) | Must |
| FR-9 | Edit Own Report | Must |
| FR-10 | Delete Own Report (Interaction-Free Open Only) | Must |
| FR-11 | Withdraw Own Report | Must |
| FR-12 | Public Summary Listings (Anonymous) | Must |
| FR-13 | Authenticated Detail View | Must |
| FR-14 | Search and Filter | Must |
| FR-19 | Reporter Edits (Audit Trail) | Must |
| FR-20 | Reporter Withdrawals (Audit Trail) | Must |
| FR-37 | Sensitive Fields (Authoritative Set) | Must |
| FR-38 | Public Summary Fields (Authoritative) | Must |
| FR-39 | Member-Facing Visibility Matrix by Actor (Authoritative) | Must |
| FR-49 | Listing Partition and Participation Views (Authoritative) | Must |
| FR-53 | Administrator Report Edit | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Report | A Lost or Found report | id, type (`Lost`/`Found`), name, category, description, date, campusArea, exactPlace, identifyingDetails, imageRef, status, reporterId, createdAt, updatedAt |
| CampusArea | Fixed per-deployment location enum | value, label, active |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `createReport` | Create Lost or Found | FR-8 field set, actor | Report in `Open` |
| `editReport` | Reporter edit | reportId, changes, actor | updated Report + audit |
| `deleteReport` | Hard delete, interaction-free only | reportId, actor | deleted — Found with no Claim, Lost with no Recovery Response |
| `withdrawReport` | Reporter withdrawal → `Closed` | reportId, actor | Report + dependent records resolve |
| `listPublic` | Anonymous summary listing | filters | FR-38 fields only |
| `listForActor` | Actor-scoped listing | filters, actor | FR-49 partition, FR-39 filtered |
| `getReportDetail` | Authenticated detail | reportId, actor | actor-scoped projection |
| `administerEdit` | FR-53 moderation edit | reportId, changes, actingAdministrator | updated Report + non-numbered audit |

## The visibility projection — the core of this unit

FR-39 is a **7-column relationship model**: Anonymous, Unrelated member,
Found-report owner, Claimant, Recovery responder, Lost-report owner,
Administrator. This unit is the single implementation point.

Rules that are easy to get wrong:

1. **Sensitive data is never loaded for an actor who may not see it** — filtered
   after the fact is not sufficient (system-architecture §Authorization).
2. **Visibility never unlocks as a side effect** of the actor submitting a Claim or
   Recovery Response (`EXPERIENCE.md` §11.4).
3. **FR-49's four views are disjoint and authoritative** — `My Reports` (authored),
   `Browse` (others' reports), `My Claims`, `My Recovery Responses`. A member's own
   reports never appear in their own Browse. No automatic Lost↔Found linkage.
4. **Anonymous users see summary listings only and cannot open detail** (FR-12,
   FR-13, FR-38).

## Rules this unit must not break

1. **Edit is blocked at both terminal statuses** — `Returned` and `Closed`, each with
   its own message (FR-9). FR-53 administrator edit is blocked on terminal reports
   too.
2. **Hard delete is `Open` + no interaction only** — Found requires no Claim, Lost
   requires no Recovery Response (FR-10). Nothing else is ever hard-deleted.
3. **Withdrawal reaches `Closed`, never `Returned`** (FR-11, FR-22).
4. **FR-53 edit scope is exactly:** name, category, description, date, campus area,
   exact place, identifying details, image replacement. **Not** reporter, type,
   lifecycle status, Claim content, Recovery Response content, audit entries,
   Returned-confirmation fields, or substitute-receiver fields.
5. **Every administrator edit is audited** with acting administrator, timestamp,
   changed fields, and previous values.
6. **No email is sent** for a report edit (FR-30).
7. **Date bounds:** Lost `date lost` ≤ 365 days; Found `date` ≤ 30 days; neither may
   be in the future (FR-6, FR-7, FR-8, OQ-3). 365 is the current product rule and is
   not relaxable.

## Dependencies

### Depends On
| Unit | Reason |
|------|--------|
| 001 | ActorContext drives the FR-39 projection |

### Depended By
| Unit | Reason |
|------|--------|
| 003 | Claims attach to Found reports |
| 004 | Recovery Responses attach to Lost reports |
| 005 | Returned and moderation act on reports |
| 007 | Every surface reads through this projection |

## Technical Context

### Integration Points
| Integration | Type | Protocol |
|-------------|------|----------|
| PostgreSQL | DB | Prisma, indexed queries for FR-14 |
| Vercel Blob (private) | Both | Images per `image-handling.md` |
| 006 audit | DB write | FR-31/FR-48 events plus non-numbered FR-53 records |

### Data Storage
| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| Reports | SQL | ~10,000 active at NFR scale | Parent report lifetime; hard delete only per FR-10 |
| Campus areas | SQL | Tiny | Indefinite |

## Constraints

- FR-14 search must meet **≤ 500 ms p95 at 10,000 active reports** (PRD §10)
- Image handling follows `image-handling.md` in full — validation, FR-39
  authorization, private delivery, quota, failure handling
- Search and listing queries must be index-backed; no full scans over reports
- Anonymous listing returns FR-38 fields and nothing else

## Success Criteria

### Functional
- [ ] Report created with the exact FR-8 field set and enforced date bounds
- [ ] Edit blocked on `Returned` and `Closed` with distinct messages
- [ ] Hard delete allowed only on interaction-free `Open` reports
- [ ] Withdrawal reaches `Closed` and resolves dependent Recovery Responses
- [ ] Anonymous sees summary listings only; detail requires login
- [ ] Each of the 7 FR-39 actor roles receives exactly the fields the PRD grants
- [ ] The four member views are disjoint, with no report in two of them
- [ ] Administrator edit is field-restricted, non-terminal-only, and audited

### Non-Functional
- [ ] Search ≤ 500 ms p95 at 10,000 active reports
- [ ] Sensitive fields are absent from unauthorized API responses (PRD §10)
- [ ] Image access is authorized server-side on every read

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| bolt-reporting-1 | DDD | report creation, field set, campus areas | Report aggregate |
| bolt-reporting-2 | DDD | visibility projection, public listing, search | FR-37/38/39 and FR-14 |
| bolt-reporting-3 | DDD | edit, delete, withdraw, admin edit | Reporter and moderator actions |

## Notes

FR-19 and FR-20 live here rather than in the audit unit: they are reporter actions
whose *audit consequence* is owned by Unit 006. FR-53's audit record is
non-numbered and append-only, matching FR-52's profile-edit record.

---

## Story Summary

- **Total Stories**: 13
- **Must Have**: 13
- **Should Have**: 0
- **Could Have**: 0

### Stories

- [ ] **001-create-lost-item-report**: to file a Lost item report - must - Planned
  <br>traces: FR-6, FR-8
- [ ] **002-create-found-item-report**: to file a Found item report - must - Planned
  <br>traces: FR-7, FR-8
- [ ] **003-validate-report-field-set**: my report validated against the authoritative field set - must - Planned
  <br>traces: FR-8
- [ ] **004-edit-own-report**: to correct my own report while it is active - must - Planned
  <br>traces: FR-9, FR-19
- [ ] **005-delete-own-report**: to delete my own report - must - Planned
  <br>traces: FR-10
- [ ] **006-withdraw-own-report**: to withdraw my own report - must - Planned
  <br>traces: FR-11, FR-20
- [ ] **007-public-summary-listing**: to browse a paginated summary of Lost and Found reports - must - Planned
  <br>traces: FR-12, FR-38
- [ ] **008-authenticated-detail-view**: to open a report's detail page from a listing - must - Planned
  <br>traces: FR-13
- [ ] **009-search-and-filter**: to search and narrow the combined pool of reports - must - Planned
  <br>traces: FR-14
- [ ] **010-visibility-matrix-by-actor**: to see exactly the fields my relationship to that item permits - must - Planned
  <br>traces: FR-39, FR-37
- [ ] **011-member-facing-view-partition**: my authored reports, other members' reports, my Claims, and my Recovery Responses in separate views - must - Planned
  <br>traces: FR-49
- [ ] **012-administrator-edit-report**: to correct a report's content and metadata on a non-terminal report - must - Planned
  <br>traces: FR-53
- [ ] **013-attach-image-to-report**: an image attached to a report and delivered privately - must - Planned
  <br>traces: FR-8
