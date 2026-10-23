# Unit Decomposition: 001-findback-lost-and-found

> **Derived from:** the frozen PRD (FR-1..FR-53), `requirements.md`, and
> `standards/system-architecture.md`. No product fact is invented here. Every
> unit traces to PRD requirements and to UX surfaces in `EXPERIENCE.md`.

## Decomposition basis

`project.yaml` sets `project_type: full-stack-web`, so the catalog prescribes
backend units with domain-driven decomposition plus a frontend unit. Because
FindBack deploys as **one modular monolith**, the frontend is not a separate
deployable — it is a unit inside the same application. It is still decomposed
separately so its stories, bolt plan, and tests are independently schedulable.

## Proposed units

### Unit 1: `001-identity-and-access`
- **Purpose:** Registration, approval, authentication, session lifecycle, deactivation, password recovery, member profile
- **Responsibility:** Who may act in FindBack and in what capacity
- **Assigned Requirements:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-27, FR-51, FR-52
- **Dependencies:** None — root unit
- **Interface:** Session cookie; `ActorContext` consumed by every other unit
- **Unit type:** backend · **Bolt type:** ddd-construction-bolt

### Unit 2: `002-reporting-and-listings`
- **Purpose:** Lost/Found report lifecycle, search, detail view, visibility projection, edit/delete/withdraw
- **Responsibility:** What exists and who may see it
- **Assigned Requirements:** FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-19, FR-20, FR-37, FR-38, FR-39, FR-49, FR-53
- **Dependencies:** `001-identity-and-access` (actor context, FR-39 needs the actor)
- **Unit type:** backend · **Bolt type:** ddd-construction-bolt

### Unit 3: `003-found-side-claims`
- **Purpose:** Claim submission, administrator review, approve/reject with atomic competing-claim rejection, per-Claim thread
- **Responsibility:** The Found-side recovery workflow, end to end
- **Assigned Requirements:** FR-15, FR-16, FR-17, FR-18, FR-22, FR-26, FR-28, FR-29
- **Dependencies:** `001` (actor context), `002` (Found report), `006` (audit writes)
- **Unit type:** backend · **Bolt type:** ddd-construction-bolt

### Unit 4: `004-lost-side-recovery`
- **Purpose:** Recovery Response submission, provisional selection, verification outcomes, Lost-report lifecycle, per-Recovery-Response thread
- **Responsibility:** The Lost-side recovery workflow, end to end — **a separate state machine from Unit 3**
- **Assigned Requirements:** FR-40, FR-41, FR-42, FR-43, FR-44, FR-47, FR-48
- **Dependencies:** `001` (actor context), `002` (Lost report), `006` (audit writes)
- **Unit type:** backend · **Bolt type:** ddd-construction-bolt

### Unit 5: `005-returns-and-handover`
- **Purpose:** Confirm Returned with default and substitute receivers, no-receiver guard, close and moderation actions
- **Responsibility:** The terminal transitions shared by both recovery directions
- **Assigned Requirements:** FR-21, FR-23, FR-24, FR-25, FR-36, FR-45, FR-46
- **Dependencies:** `001` (actor context), `003`, `004` (both recovery directions), `006` (audit writes)
- **Unit type:** backend · **Bolt type:** ddd-construction-bolt

### Unit 6: `006-audit-and-observability`
- **Purpose:** Append-only audit trail, audit visibility, audit-read logging, operational logging, quota monitoring
- **Responsibility:** Defensible record of who did what, and the evidence it exists
- **Assigned Requirements:** FR-31, FR-32
- **Dependencies:** None — every other unit **writes** to it; it depends on nothing
- **Unit type:** backend · **Bolt type:** ddd-construction-bolt

### Unit 7: `007-web-surfaces`
- **Purpose:** All member, administrator, and public surfaces defined in the UX spines
- **Responsibility:** Rendering the four member views, four administrator queues, and the public surfaces
- **Assigned Requirements:** FR-30, FR-33, FR-34, FR-35, FR-50 (administrator queues and notification suppression) — all other user-facing requirements are realized here but owned by their domain unit
- **Dependencies:** All backend units
- **Unit type:** frontend · **Bolt type:** simple-construction-bolt

## Dependency graph

```text
001-identity-and-access ──────────────────────────────┐
      │                                               │
      ▼                                               │
002-reporting-and-listings                            │
      │                                               │
      ├────────────────┬──────────────────┐            │
      ▼                ▼                  │            │
003-found-side     004-lost-side          │            │
   -claims           -recovery            │            │
      │                │                 │            │
      └────────┬───────┘                 │            │
               ▼                         │            │
   005-returns-and-handover               │            │
               │                         │            │
               └──────────┬──────────────┘            │
                          ▼                           │
        006-audit-and-observability ──────────────────┘
             ▲
             │  (006 depends on nothing; 001, 003, 004, 005 write to it)

007-web-surfaces depends on 001 through 006
```

## Requirement-to-unit mapping

Every FR maps to exactly one owning unit. No FR is unassigned; no FR is double-owned.

| FR | Requirement | Owning unit |
|---|---|---|
| FR-1 | Self-Registration | 001 |
| FR-2 | Pending State and Restricted Access | 001 |
| FR-3 | Administrator Review of Pending Registrations | 001 |
| FR-4 | Login and Logout | 001 |
| FR-5 | Deactivation | 001 |
| FR-6 | Create Lost Item Report | 002 |
| FR-7 | Create Found Item Report | 002 |
| FR-8 | Report Field Set | 002 |
| FR-9 | Edit Own Report | 002 |
| FR-10 | Delete Own Report | 002 |
| FR-11 | Withdraw Own Report | 002 |
| FR-12 | Public Summary Listings | 002 |
| FR-13 | Authenticated Detail View | 002 |
| FR-14 | Search and Filter | 002 |
| FR-15 | Submit a Claim | 003 |
| FR-16 | Administrator Review Screen | 003 |
| FR-17 | Approve a Claim | 003 |
| FR-18 | Reject a Claim | 003 |
| FR-19 | Reporter Edits (Audit Trail) | 002 |
| FR-20 | Reporter Withdrawals (Audit Trail) | 002 |
| FR-21 | Administrator Close Action | 005 |
| FR-22 | Auto-Status Transitions (Found-side) | 003 |
| FR-23 | Confirm Returned (Default Receiver) | 005 |
| FR-24 | Confirm Returned (Substitute Receiver) | 005 |
| FR-25 | No-Receiver-No-Returned Guard | 005 |
| FR-26 | Per-Claim Thread | 003 |
| FR-27 | Account Approved Email | 001 |
| FR-28 | New Claim Email | 003 |
| FR-29 | Claim Decision Email | 003 |
| FR-30 | Unsupported Notification Channels and Events | 007 |
| FR-31 | Audit Trail Scope | 006 |
| FR-32 | Audit Trail Visibility | 006 |
| FR-33 | Administrator Dashboard | 007 |
| FR-34 | Pending Claims Queue | 007 |
| FR-35 | Items Awaiting Return Queue | 007 |
| FR-36 | Remove Inappropriate Content | 005 |
| FR-37 | Sensitive Fields | 002 |
| FR-38 | Public Summary Fields | 002 |
| FR-39 | Member-Facing Visibility Matrix | 002 |
| FR-40 | Submit a Recovery Response | 004 |
| FR-41 | Recovery Response Statuses and Transitions | 004 |
| FR-42 | Lost-Report Lifecycle | 004 |
| FR-43 | Owner Review, Selection, Verification Outcomes | 004 |
| FR-44 | Recovery Response Field Set | 004 |
| FR-45 | Administrator Verification Management | 005 |
| FR-46 | Recovery Response Email Notifications | 005 |
| FR-47 | Per-Recovery-Response Message Thread | 004 |
| FR-48 | Recovery Response Audit Events | 004 |
| FR-49 | Listing Partition and Participation Views | 002 |
| FR-50 | Items-in-Verification Queue | 007 |
| FR-51 | Forgot Password / Password Recovery | 001 |
| FR-52 | Member Profile | 001 |
| FR-53 | Administrator Report Edit | 002 |

**Coverage check:** 53 of 53 FRs assigned. FR-45 is assigned to 005 rather than 004
because Confirm Returned is shared by both recovery directions; Unit 4 owns the
*verification outcome*, Unit 5 owns the *return*.

## Independence validation

| Criterion | Result |
|---|---|
| Single responsibility | ✅ each unit owns one domain concern |
| Independently testable | ✅ domain logic has no cross-unit imports except shared types |
| Clear interface | ✅ units communicate through `ActorContext` and domain events |
| Deployable | ⚠️ **All units deploy together** — they are one modular monolith. This is a deliberate consequence of the $0 Hobby constraint, not a decomposition failure. Units are independently *buildable and testable*, not independently deployable. |
| No circular dependencies | ✅ verified against the graph above |

## Composition per catalog preset

`full-stack-web` prescribes a frontend unit named `{intent}-ui`. Because the
frontend lives in the same Next.js application, it is named `007-web-surfaces`
rather than `001-findback-lost-and-found-ui`, and it is marked
`unit_type: frontend` with `default_bolt_type: simple-construction-bolt`.

## Status

- [x] Requirements mapped to units — 53 of 53, no gaps, no duplicates
- [x] Dependency graph validated — no cycles
- [x] Unit briefs written
- [ ] Stories created per unit
- [ ] Bolt plan
- [ ] Owner review (Checkpoint 3)