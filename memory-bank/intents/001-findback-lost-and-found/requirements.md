---
intent: 001-findback-lost-and-found
phase: inception
status: construction
created: 2026-10-23T11:28:55.000Z
updated: 2026-10-23T13:25:00.000Z
---

# Requirements: FindBack — Lost & Found Management System

> **This file is an index, not a restatement.** The normative requirements are
> `FR-1` … `FR-53` in the frozen PRD at
> `_bmad-output/planning-artifacts/prds/prd-FindBack-2026-08-28/prd.md`.
> Where this file and the PRD differ, **the PRD wins**. This index exists so
> SpecsMD/Construction tooling can trace a requirement ID to its architecture
> component, unit, and story without a second copy drifting out of sync.

## Normative sources

| Source | Path | Authority |
|---|---|---|
| Product Brief | `_bmad-output/planning-artifacts/briefs/brief-FindBack-2026-08-28/brief.md` | Product direction. Frozen. |
| PRD | `_bmad-output/planning-artifacts/prds/prd-FindBack-2026-08-28/prd.md` | **Product behavior. Authoritative.** |
| UX spines | `_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/EXPERIENCE.md`, `DESIGN.md` | Interaction + visual contract. |

## Intent overview

FindBack is a **single-tenant** Lost & Found management system. One organization
runs one deployment. Members register, are approved by an administrator, report
Lost and Found items, browse and search, submit Claims on Found items, and submit
Recovery Responses on other members' Lost items. Administrators approve accounts,
review Claims, manage Lost-side verification (the Lost-report owner determines the
match; the administrator records it), confirm Returned on both sides, and close or
moderate reports. Every lifecycle action is reconstructable from an append-only,
administrator-only audit trail.

## Business goals

| Goal | Success metric (PRD §7) | Priority |
|---|---|---|
| A recovered item reaches its owner | Item lifecycle completes `Returned` with a full audit trail | Must |
| Low-friction member participation | Member can report and search without training | Must |
| Defensible administrator decisions | Every admin action recorded with actor + timestamp | Must |
| No sensitive leakage | FR-37/FR-39 visibility rules hold at the API layer | Must |

## Requirements index (FR-1 … FR-53)

All FindBack in-scope items are **Must**. `Unit` is a slot to fill at the
unit-decomposition stage — assigning it here would pre-empt that decision.

| FR | Requirement | PRD § | UX surface | Unit |
|---|---|---|---|---|
| FR-1 | Self-Registration | 4.1 | §16.1 | — |
| FR-2 | Pending State and Restricted Access | 4.1 | §9.2 | — |
| FR-3 | Administrator Review of Pending Registrations | 4.1 | §15.2 | — |
| FR-4 | Login and Logout | 4.1 | §16.2, §16.5 | — |
| FR-5 | Deactivation | 4.1 | §15.6 | — |
| FR-6 | Create Lost Item Report | 4.2 | §10 | — |
| FR-7 | Create Found Item Report | 4.2 | §10 | — |
| FR-8 | Report Field Set (Authoritative) | 4.2 | §10.3 | — |
| FR-9 | Edit Own Report | 4.2 | §10.4 | — |
| FR-10 | Delete Own Report (Interaction-Free Open Only) | 4.2 | §10.4 | — |
| FR-11 | Withdraw Own Report | 4.2 | §10.4 | — |
| FR-12 | Public Summary Listings (Anonymous) | 4.3 | §9.1, §11.2 | — |
| FR-13 | Authenticated Detail View | 4.3 | §9.4, §11.3 | — |
| FR-14 | Search and Filter | 4.3 | §7.1 | — |
| FR-15 | Submit a Claim | 4.4 | §12.1 | — |
| FR-16 | Administrator Review Screen | 4.4 | §12.3 | — |
| FR-17 | Approve a Claim | 4.4 | §12.4, §12.5 | — |
| FR-18 | Reject a Claim | 4.4 | §12.6 | — |
| FR-19 | Reporter Edits (Audit Trail) | 4.5 | §10.4, §17 | — |
| FR-20 | Reporter Withdrawals (Audit Trail) | 4.5 | §10.4, §17 | — |
| FR-21 | Administrator Close Action | 4.5 | §9.5 | — |
| FR-22 | Auto-Status Transitions (Found-side) | 4.5 | §12, §14 | — |
| FR-23 | Confirm Returned (Default Receiver) | 4.6 | §14 | — |
| FR-24 | Confirm Returned (Substitute Receiver) | 4.6 | §14 | — |
| FR-25 | No-Receiver-No-Returned Guard | 4.6 | §14.4 | — |
| FR-26 | Per-Claim Thread | 4.7 | §13 | — |
| FR-27 | Account Approved Email | 4.8 | §16.2 | — |
| FR-28 | New Claim Email | 4.8 | §13.6 | — |
| FR-29 | Claim Decision Email | 4.8 | §4.4 | — |
| FR-30 | Unsupported Notification Channels and Events | 4.8 | §13.6 | — |
| FR-31 | Audit Trail Scope (Authoritative) | 4.9 | §17 | — |
| FR-32 | Audit Trail Visibility | 4.9 | §17 | — |
| FR-33 | Administrator Dashboard | 4.10 | §15.1 | — |
| FR-34 | Pending Claims Queue | 4.10 | §15.3 | — |
| FR-35 | Items Awaiting Return Queue | 4.10 | §15.4 | — |
| FR-36 | Remove Inappropriate Content | 4.10 | §9.5 | — |
| FR-37 | Sensitive Fields (Authoritative Set) | 4.11 | §11.1 | — |
| FR-38 | Public Summary Fields (Authoritative) | 4.11 | §11.2 | — |
| FR-39 | Member-Facing Visibility Matrix by Actor | 4.11 | §11.3 | — |
| FR-40 | Submit a Recovery Response | 4.12 | §9.6, §10.5 | — |
| FR-41 | Recovery Response Statuses and Transitions | 4.12 | §4.6 | — |
| FR-42 | Lost-Report Lifecycle and Auto-Transitions | 4.12 | §4.5, §6.3 | — |
| FR-43 | Owner Review, Provisional Selection, Verification Outcomes | 4.12 | §9.6, §15.5 | — |
| FR-44 | Recovery Response Field Set (Authoritative) | 4.12 | §9.6 | — |
| FR-45 | Administrator Verification Management and Returned Confirmation | 4.12 | §14.5 | — |
| FR-46 | Recovery Response Email Notifications (Lost-side) | 4.12 | §4.4, §13.7 | — |
| FR-47 | Per-Recovery-Response Message Thread | 4.12 | §13.4 | — |
| FR-48 | Recovery Response Audit Events | 4.12 | §17.4 | — |
| FR-49 | Listing Partition and Participation Views | 4.13 | §3, §9.4 | — |
| FR-50 | Items-in-Verification Queue | 4.14 | §15.5 | — |
| FR-51 | Forgot Password / Password Recovery | 4.15 | §9.3a | — |
| FR-52 | Member Profile | 4.16 | §9.4a | — |
| FR-53 | Administrator Report Edit | 4.17 | §9.4b | — |

**Product invariants that span FRs (carried from the PRD, not restated):**

1. Found Claim and Lost Recovery Response are **separate** mechanisms with
   separate form fields, statuses, selection rules, and audit trails (PRD §1, §4.4, §4.12).
2. Owner **determines** match/not-match; the administrator **records** it
   (FR-43, FR-45; audit events 18/19 carry `determined_by` + `recorded_by`).
3. Claim approval is atomic: approving one Pending Claim auto-rejects the others
   with reason "another claim was approved for this item" (FR-17, D3).
4. `Match Confirmed` is **non-terminal**; the Lost report stays `Verification Pending`
   until administrator Confirm Returned (FR-41, FR-42).
5. `Standby` is a **derived display condition**, not a persisted status (FR-41, D7).
6. Exactly **eight** workflow/business email events (FR-46 events 1–8). The
   password-reset email (FR-51) is an authentication/security message and is **not**
   a ninth (FR-30).
7. Audit is append-only and administrator-only (FR-31, FR-32); events 1–14 (FR-31)
   and 15–30 (FR-48); FR-52/FR-53 edits are non-numbered append-only records.
8. Edit is blocked at both terminal statuses — `Returned` **and** `Closed`
   (FR-9; FR-53 likewise).

## Non-functional requirements (PRD §10)

Targets are carried as written; architecture owns the mechanism, not the target.

| Class | Requirement |
|---|---|
| Performance | Initial HTML ≤ 2 s p95 (4G); reads ≤ 500 ms p95; writes ≤ 1 s p95; search ≤ 500 ms p95 @ 10k active reports; image upload ≤ 3 s p95 @ 5 MB JPEG; audit queries ≤ 1 s p95 @ 10k reports × 50 events |
| Security | Adaptive password hashing (algorithm = Architecture); revocable sessions with inactivity expiry; CSRF protection on state-changing endpoints; rate limits on registration, login, Claim submit, RR submit, thread posting; sensitive-field redaction **at the API layer**; non-guessable image delivery; append-only admin audit; per-RR thread access denied at the API layer |
| Reliability | 99% uptime in host-org business hours; email send failures logged, never block the triggering action |
| Accessibility | WCAG 2.1 AA (implementation; `review-accessibility.md` confidence **Strong**) |
| Observability | Logs carry request ID, actor ID, action, target ID; **audit-trail reads are themselves logged** |
| Retention | Reports/Claims/RRs/threads/audit retained for the parent report's lifetime; hard delete only for interaction-free `Open` reports (FR-10); accounts retained indefinitely |

## Constraints

**Business:** single-tenant; one organization per deployment; English only; no
automatic matching; no in-app notification stream; no cross-organization sharing;
no native mobile app; no external IdP; no proof-of-ownership uploads.

**Intent-specific technical constraints (not covered by project standards yet):**
- API-layer (not UI-layer) enforcement of FR-37/FR-39.
- Lost-side and Found-side recovery workflows must not share a state machine.
- FR-51 reset flow must be anti-enumeration and must not alter lifecycle state.

## Assumptions (PRD §9, verbatim IDs)

A1 evergreen browsers · A2 revocable sessions (mechanism = Architecture) ·
A3 image moderation is admin-only manual review · A4 fixed campus-area list per
deployment (config mechanism = Architecture) · A5 audit append-only, topology =
Architecture · A6 email is the only out-of-platform channel, provider = Architecture.

## Open questions carried forward (PRD §8)

| ID | Question | Owner | Status |
|---|---|---|---|
| OQ-1 | How is the campus-area enum configured per deployment? | Architecture | **Open — blocks the deployment-configuration story** |
| OQ-2 | Image storage budget per item; cleanup when a report is hard-deleted (FR-10) | Architecture | **Open** |
| OQ-3 | Date-lost bound is **365 days** today and is not relaxable in current product | PM | Settled at 365; revisit after first semester |
| OQ-5 | Auto-rejection message wording in email body | UX | Resolved in `EXPERIENCE.md` §4.4 (softened copy; audit reason stays verbatim) |
| OQ-4 | Per-Claim thread read-only point | — | Retired (FR-26 answers it) |

UX-OQ-A/B/C in `EXPERIENCE.md` §23 are also open and **non-blocking**;
UX-OQ-B (claim-state freshness under concurrent review) is Architecture-owned.