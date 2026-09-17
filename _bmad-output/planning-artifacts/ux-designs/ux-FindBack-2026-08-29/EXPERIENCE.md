---
title: "EXPERIENCE.md — FindBack"
status: revision
created: 2026-08-29
updated: 2026-09-16
project: FindBack
run: ux-FindBack-2026-08-29
design_md: ./DESIGN.md
prd: ../../prds/prd-FindBack-2026-08-28/prd.md
brief: ../../briefs/brief-FindBack-2026-08-28/brief.md
---

> **Correction pass — 2026-09-16.** This revision is a targeted correction pass against the final PRD. Spines remain authoritative; corrections apply to UJ-1..UJ-5, Lost-side email events, RR lifecycle, Claim privacy, and Administrator-records / owner-determines semantics. See `.memlog.md` "Update — Final correction & validation pass (2026-09-06)" for prior pass and this file's §22 for the change log of THIS pass.

# EXPERIENCE.md — FindBack

> **How it works.** Visual identity lives in [`DESIGN.md`](./DESIGN.md). This document owns information architecture, behavior, states, interaction patterns, accessibility, and journeys. When tokens are referenced here, they use `{path.to.token}` syntax resolved against DESIGN.md. **Spines win on conflict** with any mock, wireframe, or import.

---

## Foundation

**Form-factor.** Web application. Responsive across desktop (≥ 1024 px), tablet (640–1023 px), and mobile web (< 640 px). No native mobile application (PRD §5 non-goal).

**UI system.** Vanilla CSS / CSS-modules with tokenized design system. No external UI library is prescribed by the PRD; framework selection (React, Vue, etc.) is an Architecture decision. Token semantics in DESIGN.md must be implementable in any framework.

**Browser support.** Modern evergreen browsers — Chrome, Edge, Firefox, Safari (latest two major versions). No IE support. (Inherited from PRD assumption A1.)

**Visual identity reference.** All tokens (colors, typography, spacing, radius, elevation) are defined in `{DESIGN.md}` and referenced here by `{path.to.token}`.

---

## 1. UX Goals & Principles

### 1.1 Goals

- Make **reporting** and **searching** require zero training for first-time users.
- Make **every status** (account, report, claim) obvious at a glance — and explicit in text, not color alone.
- Make the **administrator experience** operationally efficient: queues are scannable, decisions are unblocked, and the audit trail is trustworthy.
- Make **information visibility** *intentional and visible* — members should understand that sensitive fields are protected by design, not by accident.

### 1.2 Principles (inherited from locked Product Brief and PRD §11)

| Principle | UX translation |
|---|---|
| **Simple** | First-time-task completion without help text walls. Defaults that make sense. One primary action per screen. |
| **Trustworthy** | Information visibility is explained, not hidden. The system never silently changes a report's state. The audit trail is the source of truth. |
| **Clear** | Every status has a text label, an icon, and a color. No state is communicated by color alone. Every screen answers "what is this?" and "what can I do next?" |

---

## 2. Personas & Role Surfaces

FindBack has **four account states** for members and **one operator role** (Administrator). Role is an attribute of an account, not a separate account type — an Administrator is a Member with the `administrator` flag (PRD §3).

| Account state | Can do | Cannot do | Realized by |
|---|---|---|---|
| **Anonymous User** | Browse summary listings; search/filter listings | View any item detail; report; claim; submit Recovery Response; message; see audit trail | FR-12, FR-38 |
| **Pending User** | Log in; see pending banner | Anything else (no browsing detail, no reports, no Claims, no Recovery Responses, no messages) | FR-2 |
| **Active Member** | Report Lost/Found; browse + view detail; submit Claim on Found items; submit Recovery Response on Lost items; select Recovery Responses on own Lost reports; withdraw own reports; message on own per-Claim and per-RR threads; edit own reports; withdraw own reports | Approve/reject anything; see audit trail; administer accounts; substitute-receiver confirmation | FR-6..FR-15, FR-26, FR-39, FR-40, FR-47 |
| **Deactivated User** | (cannot log in) | Any active capability | FR-5 |

**Administrator** = Active Member with the `administrator` flag. Administrators approve/reject registrations, deactivate accounts, approve/reject/auto-reject Claims, confirm Returned (default or substitute receiver), close reports, view the full audit trail, and record the Lost-report owner's Match Confirmed / Not a Match determination during verification.

**Role resolution.** The server resolves role from session and persists the role in the request context. UI never infers role from URL alone.

---

## 3. Information Architecture

### 3.1 Top-level surfaces (site map)

FindBack has **three role-scoped surfaces** — public, member, administrator — and the authenticated member surface is partitioned into **four authoritative views** per PRD FR-49 + D5 + D8.

```
FindBack (single deployment, one organization)
│
├── Public surface
│   ├── /                          Landing page
│   ├── /login                     Login
│   ├── /register                  Self-registration
│   └── /listings                  Combined Lost & Found summary listing (anonymous-viewable, summary fields only)
│
├── Member surface — four authoritative views (FR-49, D5, D8)
│   │
│   ├── /my/reports                My Reports (own authored Lost + Found; never own Claims/RRs)
│   │   ├── /my/reports/:id        Report detail (reporter view; selectable Withdraw action)
│   │   ├── /my/reports/:id/edit   Edit report (FR-9 — until Returned/Closed)
│   │   └── /my/reports/:id/review-responses   Lost-only: Review Responses (UJ-5 step 5)
│   │
│   ├── /listings (Browse)         Other members' Lost + Found; never the member's own reports
│   │   ├── /listings/:id          Item detail (role- and relationship-aware)
│   │   ├── /listings/:id/claim    Claim form (Found item only, Active member only)
│   │   └── /listings/:id/submit-recovery-response   RR form (Lost item only, Active member only)
│   │
│   ├── /my/claims                 My Claims (Claims the member submitted on others' Found items)
│   │   └── /my/claims/:id         Claim detail (status + per-Claim thread)
│   │
│   └── /my/recovery-responses     My Recovery Responses (RRs the member submitted on others' Lost items)
│       └── /my/recovery-responses/:id          RR detail (canonical status + per-RR thread)
│
├── Account-lifecycle surfaces
│   ├── /pending                   Pending state landing
│   ├── /rejected                  Rejected state landing
│   └── /deactivated               Deactivated state landing
│
└── Administrator surface (authenticated; requires administrator flag)
    ├── /admin                              Administrator dashboard — four queue tiles
    ├── /admin/registrations                 Pending Registrations queue (FR-3)
    ├── /admin/claims                       Pending Claims queue (FR-34) — Found-side
    ├── /admin/awaiting-return               Items Awaiting Return queue (FR-35) — Found-side Claim Approved
    ├── /admin/verifications                 Items in Verification queue (FR-50) — Lost-side Verification Pending
    ├── /admin/claims/:id                    Claim review (single)
    ├── /admin/items/:id                     Item administration
    ├── /admin/items/:id/audit               Audit trail view
    ├── /admin/items/:id/return              Confirm Returned (Found-side; default or substitute)
    ├── /admin/lost/:id                      Lost report verification (record owner's Match Confirmed / Not a Match)
    ├── /admin/lost/:id/return               Confirm Returned (Lost-side; default or substitute)
    └── /admin/accounts                      Account management (search, deactivate)
```

### 3.2 Navigation rules

- **Anonymous.** Top nav: `Lost & Found` (listings), `Log in`, `Register`. No dashboard, no Report buttons. Clicking a summary row in the listing routes to `/login?return=/listings/:id` — there is **no anonymous detail page** (PRD FR-38).
- **Active Member.** Top nav exposes the **four authoritative views**: `My Reports`, `Browse`, `My Claims`, `My Recovery Responses` — plus `Report ▾` (Lost / Found) and `Account`. The four views are disjoint: a Claim or Recovery Response never appears under My Reports; an authored report never appears under My Claims or My Recovery Responses (PRD FR-49 + D5 + D8).
- **Pending User.** Top nav collapses to brand mark + status banner + `Log out`. No Browse, no Report, no Claims, no RRs.
- **Administrator.** A second nav layer under the member nav exposes `Admin ▾` containing the **four operational queues** plus `Accounts`. The admin section is visually delineated from member actions (e.g., a divider + label).

### 3.3 IA closure check

Every need in the PRD has a surface. Every surface has a journey (Section 8) that lands there. Examples:

| Need | Surface | Journey |
|---|---|---|
| Register | `/register` | UJ-3 |
| Browse anonymously | `/listings` | Implicit (anonymous browse) |
| Report Lost | `/report/lost` | UJ-1 step 1 |
| Submit Claim | `/listings/:id/claim` | UJ-1 step 4–5 |
| Review pending registrations | `/admin/registrations` | UJ-3 step 4 |
| Confirm Returned | `/admin/items/:id/return` | UJ-1 step 8, UJ-4 step 6 |
| Read audit trail | `/admin/items/:id/audit` | UJ-4 step 7 |

---

## 4. Voice and Tone

The brand voice lives in `{DESIGN.md → Brand & Style}`. This section owns the *behavioral* voice for copy and microcopy.

### 4.1 Voice rules

- **Plain English.** No jargon ("API", "endpoint", "database", "HTTP status"). Internal-state terms stay internal.
- **Concrete over abstract.** "We can't show the exact location to everyone yet" rather than "Sensitive data is redacted."
- **Active voice.** "We sent your claim to the administrator for review." Not "Your claim has been submitted."
- **Reassuring on the irreversible.** Withdraw / delete confirmations name the consequence in one line.
- **Honest on the automated.** Auto-rejection emails and screens say *why*, not just *what* — see Section 4.3.
- **No exclamation marks.** Even success states read calmly.
- **No emojis.** Status icons only.

### 4.2 Status label vocabulary (canonical)

These terms are surfaced to users verbatim. UX does not paraphrase the PRD glossary.

| Concept | User-facing labels |
|---|---|
| Account states | `Pending`, `Active`, `Rejected`, `Deactivated` |
| Found report lifecycle | `Open`, `Claim Requested`, `Claim Approved`, `Returned`, `Closed` |
| Lost report lifecycle | `Open`, `Verification Pending`, `Returned`, `Closed` |
| Claim states | `Pending`, `Approved`, `Rejected` (no `Closed`) |
| Recovery Response states (8 canonical, PRD FR-41; corrections #16/#2) | `Submitted`, `Selected for Verification`, `Match Confirmed`, `Not a Match`, `Completed — Report Returned`, `Resolved — Report Returned`, `Resolved — Report Closed`, `Withdrawn` |
| Derived/display only | `Submitted — Standby` (rendered when another RR is Selected; canonical persisted status remains `Submitted`) |
| Item type | `Lost item`, `Found item` |
| Roles | `Member`, `Administrator` |

### 4.3 Status microcopy

#### Account

- **Pending (banner).** "Your account is pending administrator approval. You'll get an email when you're approved." Plus a secondary line: "You can sign out below — your registration is saved."
- **Rejected (login screen).** "We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator." (PRD FR-4: rejected reason is *not* exposed.)
- **Deactivated (login screen).** Same neutral message as Rejected. The administrator's reason is not exposed.

#### Report lifecycle

> Report lifecycle microcopy is **type-aware**: Found and Lost reports share status names but not the same helper copy. Mixing `Claims` and `Recovery Responses` terminology is wrong — Claims exist only for Found reports and Recovery Responses exist only for Lost reports.

- **Open (Found).** "Active. No Claims yet." (Action hint: report owner sees `Edit`; `Delete` if no Claim exists; otherwise `Withdraw`.)
- **Open (Lost).** "Active. No Recovery Responses yet." (Action hint: report owner sees `Edit`; `Delete` if no Recovery Response exists; otherwise `Withdraw`.)
- **Claim Requested (Found only).** "An administrator is reviewing {N} claim{plural} on this item."
- **Verification Pending (Lost only).** "The Lost-report owner selected a Recovery Response for verification. An administrator will record the determination."
- **Claim Approved (Found only).** "A Claim has been approved. The administrator is arranging the return."
- **Returned.** "This item has been returned. No further action is needed."
- **Closed.** "This report is no longer active." (Action hint: none. Read-only history.)

#### Claim

- **Pending.** "Submitted. An administrator will review your claim and email you with the decision."
- **Approved.** "Your claim was approved. The administrator will arrange the return with you."
- **Rejected.** "Your claim was not approved. {Reason}" — for auto-rejection see Section 4.4.
- **Auto-rejected (competing claims).** See Section 4.4. There is no `Approved-then-auto-rejected` Claim lifecycle state — a Claim moves to `Rejected` and stays there.

### 4.4 Auto-rejection copy (competing claims) — implements OQ-5

PRD FR-17 specifies the audit reason "another claim was approved for this item". UX recommendation for the email body and the rejection screen:

> **Subject (email).** "Your claim on '{Item name}' was not approved"
>
> **Body.** "Hi {Claimant},
>
> Thanks for submitting your claim on *{Item name}*. Another claim on the same item was approved by the administrator, so your claim was not approved.
>
> If you believe this is in error, please contact your administrator.
>
> — The FindBack team"

**Reasoning.** The PRD wording "another claim was approved for this item" is the audit-trail reason (administrator-facing). The user-facing email softens this without contradicting the audit record: it states the consequence, names the action, and offers a human escalation path. It does not name the winning claimant (privacy / trust). **There is no `Closed` Claim status — Claim has only `Pending` / `Approved` / `Rejected`**. There is no `Rejected → Pending` Claim transition; the email does not promise any reopen or restoration action.

**On the rejected claim detail screen.** A neutral banner: "Your claim was not approved because another claim on this item was approved. If you think this is a mistake, contact your administrator." The audit reason ("another claim was approved for this item") is preserved verbatim in the audit trail but is not surfaced as user-facing copy — the user-facing copy uses the language above.

### 4.5 Lost report status microcopy (PRD FR-42; corrections #22/#2)

- **Open.** "Active. No Recovery Responses yet." (Action hint: report owner sees "Withdraw" until Match Confirmed.)
- **Verification Pending.** "An administrator is verifying a Recovery Response on this item."
- **Returned.** "This item has been returned. No further action is needed."
- **Closed.** "This report is no longer active." (Action hint: none. Read-only history.)

**Important.** `Match Confirmed` is **a Recovery Response status, not a Lost-report status**. The Lost report remains `Verification Pending` throughout the Match Confirmed → physical handoff → Confirm Returned window. UX must not treat `Match Confirmed` as `Returned` or as a Lost-report status.

### 4.6 Recovery Response status microcopy (PRD FR-41; correction #2)

| Status | Member-facing copy |
|---|---|
| `Submitted` | "Submitted. The report owner may select this response for verification." |
| `Submitted — Standby` (derived) | "Submitted — Standby. Another response is currently being verified." Canonical persisted status is `Submitted`. |
| `Selected for Verification` | "Selected for verification. The owner is checking the item." |
| `Match Confirmed` (non-terminal) | "Owner confirmed this is a match. Awaiting physical handoff." |
| `Not a Match` (terminal) | "Not a match. The owner determined this item is not theirs." |
| `Completed — Report Returned` (terminal) | "Returned to owner." |
| `Resolved — Report Returned` (terminal) | "Resolved. The item was returned via another response." |
| `Resolved — Report Closed` (terminal) | "Resolved. The Lost report was closed." |
| `Withdrawn` (terminal) | "Withdrawn by the responder." |

### 4.7 Owner-Determines / Administrator-Records wording (PRD FR-43, FR-45; corrections #3/#15)

The Lost-report owner physically determines whether the candidate is theirs. The acting Administrator **records** that determination in FindBack on the owner's behalf. The Administrator does not independently decide ownership. UX wording must reflect this.

**Approved wording (use these):**
- "Record owner's determination"
- "Owner confirmed this is a match" / "Owner determined this is not a match"
- "Acting administrator: {Admin name}" shown next to the record action
- Audit-relevant fields: `determined_by` (Lost-report owner), `recorded_by` (acting administrator)

**Forbidden wording (avoid these):**
- "Administrator confirms ownership"
- "Administrator decides match"
- "Verify ownership" (implies Administrator decides)

### 4.8 Copy for restricted permissions

When a Pending user lands on a member surface (deep-link, browser back button), show a friendly, non-blocking message rather than a hard error:

> "Your account is pending administrator approval. This part of FindBack will be available once your account is approved."

The header still shows the brand mark and the Pending banner. The page body shows the message and a "Back to your account" link. Do **not** redirect-loop between the destination and the pending page.

### 4.9 Error copy

| Error class | Tone | Example |
|---|---|---|
| Validation error | Concrete, actionable | "Add at least 10 characters to the description." |
| Server error | Calm, with a path forward | "Something went wrong on our side. Try again, or come back in a moment." |
| Permission denied | No blame | "You don't have access to this. If you think you should, contact your administrator." |
| Session expired | Brief, helpful | "You've been signed out. Sign in again to continue." |
| Concurrent action (D3) | Factual | "This item's claim was already decided by another administrator. The item is now {status}. No action is needed from you." |

---

## 5. Component Patterns

Visual specs live in `{DESIGN.md → Components}`. This section owns the *behavior* of each component. Tokens referenced resolve in DESIGN.md.

### 5.1 Buttons

**Variants** (mapping to `{components.button.variant}`):

- `primary` — one per screen, the dominant action. Example: "Submit report" on the report form.
- `secondary` — paired with a primary action when a destructive or cancel path exists. Example: "Edit" on My Reports.
- `tertiary` / `ghost` — low-emphasis actions. Example: "Clear filters" on listing.
- `danger` — destructive actions. Example: "Delete report" (available only for an interaction-free Open report; see §10.4 for Found/Lost-specific gates — Found requires `Open` and no Claim; Lost requires `Open` and no Recovery Response).
- `danger-strong` — irreversible / high-stakes. Used only for **Confirm Returned** approval-with-substitute (Section 12) and for closing a report with active claims.

**Behavioral rules.**

- **One primary button per view.** If a screen has two competing primary actions, demote the secondary to `secondary` or move it into a menu.
- **Topbar Register / Sign in CTAs must read as buttons in the resting state.** Use `primary` style (filled, brand surface, on-brand text) — not `tertiary`. A tertiary topbar CTA disappears into the navigation labels and only becomes legible on hover, which fails the "visible at rest" expectation for an entry-point action. When a page already has a primary in its main content (e.g., the form's submit button), the topbar CTA is exempt from the "one primary per view" rule because it lives in a separate region (topbar vs content) and serves a different audience (anonymous vs already-filling-the-form). See `§5.2 Topbar` for the topbar's component treatment.
- **Destructive actions require explicit confirmation.** Confirmation uses a **modal dialog** that names the consequence, not a confirm() call. See Section 7.6.
- **Loading state.** Buttons enter a disabled + spinner state while the action is in flight (the `executing` state from `{components.button.state.executing}`). The button label remains visible (e.g., "Submitting…").
- **Disabled state.** Disabled buttons explain why on focus (tooltip or `aria-describedby`) for screen reader users.
- **Touch target.** Min 44 × 44 px (PRD NFR accessibility, Section 11).

### 5.2 Topbar (anonymous + auth-flow pages)

On public / auth-flow pages (`/`, `/login`, `/forgot`, `/forgot-sent`, `/register`, `/pending`, `/rejected`, `/deactivated`), the topbar exposes two actions to the anonymous visitor:

| Action | Style | Why |
|---|---|---|
| Browse Lost &amp; Found (primary nav link) | plain text link | Browse is exploration, not conversion — it does not require a button. |
| Sign in (when not the dominant CTA on the page) | `primary` button | Entry-point to an existing account. Must be legible at rest. |
| Register (when the dominant CTA) | `primary` button | Account creation is the conversion target — must read as a button, not as a quiet label. |

**Why primary, not tertiary.** A tertiary topbar CTA has no border, no fill, and shares its color with the surrounding nav labels. It disappears into the navigation chrome and only becomes legible on hover — which fails the resting-state legibility expectation for an entry-point action. A primary button (filled, brand surface, on-brand text) reads as a button without interaction. The "one primary per view" rule (`§5.1`) is **explicitly exempted** for topbar CTAs: the topbar and the page content are different regions serving different audiences (entry-point for anonymous visitors vs. the in-flow action for the form-filler).

**Where the tertiary topbar CTA pattern is acceptable.** On authenticated pages (member/admin), the topbar exposes account chrome (`Account ▾`, `Theme`, `Logout`) which is genuinely low-emphasis — those stay `tertiary`.

### 5.3 Inputs & textareas

- **Labels are persistent.** Labels sit above the input, never as floating placeholders. Helper text sits below the label, before the input. Error text replaces helper text on validation failure.
- **Required indicator.** A single character asterisk (`*`) on the label is *visually* required. The HTML `required` attribute and `aria-required="true"` carry the programmatic meaning. (PRD accessibility NFR.)
- **Character limits.** Where the PRD specifies a limit (e.g., description 10–2000 chars), show a live character counter near the bottom-right of the input: "1,432 / 2,000". Counter turns `{colors.light.on-surface-variant}` → `{colors.light.brand.warning-soft foreground}` at ≥ 90% of max. The counter is wrapped in `aria-live="polite"` so screen readers announce the change (Finding G2).
- **Date inputs.** Native `<input type="date">` with a server-side guard for the PRD's bounds. Native pickers improve accessibility and reduce custom-keyboard bugs.
- **Search input.** Single text input on the listing page. Submits on Enter or after 400 ms of inactivity (debounced). Includes a `clear` icon-button when non-empty.
- **Autocomplete / autocorrect.** Off for emails, dates, and category names. Off for search input to avoid noisy matching.

### 5.4 Selects

- **Native `<select>`** for category, location, type, and relationship (PRD FR-8, FR-24). These are short, fixed lists; native controls get keyboard, screen reader, and mobile support for free.
- **Custom select** for status filters with 5+ options, where the visual treatment of the status badge should carry into the option label.

### 5.5 Checkboxes & radio

- **Checkbox.** Authorization affirmation on substitute receiver (PRD FR-24). The checkbox label is the full affirmation sentence, not a bare "I confirm".
- **Radio group.** Used for fixed-choice inputs where exactly one option applies — for example, the substitute-receiver relationship radio (Friend, Family Member, Colleague, Classmate, Other) on the Confirm Returned form. The Lost-vs-Found choice is **not** a radio group: report type is determined by the entry route (`/report/lost` or `/report/found`), never by an in-form switch (see §10.1).

### 5.6 Cards (Listing card, Item card, Queue row)

The listing card is a wide card on desktop, stacked on mobile. Visual treatment uses tokens `{colors.light.surface}` with `{rounded.lg}` and `{elevation.1}`. On hover/focus, lifts to `{elevation.2}` (a *visual* lift only; do not move the layout).

Each card surfaces:
- Item name (heading).
- Type badge (`Lost` / `Found`) — see `{components.badge}`.
- Category (caption).
- Date (caption, formatted as "Lost on Mar 14, 2026").
- Campus area (caption).
- Status badge.

No image, no exact location, no reporter name (PRD FR-38).

### 5.7 Tables (administrator queues)

Administrator queues use a table layout on desktop and collapse to stacked rows on mobile. The four operational queues are: **Pending Registrations**, **Pending Claims** (Found-side), **Items Awaiting Return** (Found-side, `Claim Approved`), and **Items in Verification** (Lost-side, `Verification Pending`). Audit is **not** one of the four operational queues — it is cross-cutting and reachable from any item / Claim / RR detail (PRD FR-33; §15.1). Sortable columns: submission time (default), claim/item ID. Action column is right-aligned and exposes the primary action directly (Approve, Review, Confirm Returned, Record Match Confirmed, etc.).

Accessibility: `<th scope="col">`, sortable headers announced as "Sort by {column}, ascending/descending", keyboard navigable rows, and row focus moves to a focusable action when present. The `Items in Verification` queue uses the **ARIA grid pattern** (`role="grid"` / `row` / `gridcell`) with roving `tabindex` and arrow-key row navigation (correction D3).

### 5.8 Status badges & indicators

Every status uses three cues — color, icon, text label (PRD NFR accessibility). Mapping:

| Status | Color token | Icon | Label |
|---|---|---|---|
| Found Open | `{colors.status-report.open}` | circle (open) | `Open` |
| Found Claim Requested | `{colors.status-report.claimRequested}` | inbox | `Claim Requested` |
| Found Claim Approved | `{colors.status-report.claimApproved}` | check-shield | `Claim Approved` |
| Found Returned | `{colors.status-report.returned}` | check-circle | `Returned` |
| Found Closed | `{colors.status-report.closed}` | archive | `Closed` |
| Lost Open | `{colors.status-report.open}` | circle (open) | `Open` |
| Lost Verification Pending | `{colors.status-report.verificationPending}` (or closest evergreen token) | hourglass | `Verification Pending` |
| Lost Returned | `{colors.status-report.returned}` | check-circle | `Returned` |
| Lost Closed | `{colors.status-report.closed}` | archive | `Closed` |
| Claim Pending | `{colors.status-claim.pending}` | hourglass | `Pending` |
| Claim Approved | `{colors.status-claim.approved}` | check | `Approved` |
| Claim Rejected | `{colors.status-claim.rejected}` | x | `Rejected` |
| RR Submitted | `{colors.status-rr.submitted}` | inbox | `Submitted` |
| RR Submitted — Standby (derived) | `{colors.status-rr.submitted}` | inbox-pause | `Submitted — Standby` |
| RR Selected for Verification | `{colors.status-rr.selected}` | eye | `Selected for Verification` |
| RR Match Confirmed | `{colors.status-rr.matchConfirmed}` | check | `Match Confirmed` |
| RR Not a Match | `{colors.status-rr.notAMatch}` | x-circle | `Not a Match` |
| RR Completed — Report Returned | `{colors.status-rr.completed}` | package-check | `Completed — Report Returned` |
| RR Resolved — Report Returned | `{colors.status-rr.resolvedReturned}` | package | `Resolved — Report Returned` |
| RR Resolved — Report Closed | `{colors.status-rr.resolvedClosed}` | archive | `Resolved — Report Closed` |
| RR Withdrawn | `{colors.status-rr.withdrawn}` | undo | `Withdrawn` |
| Account Pending | `{colors.status-account.pending}` | hourglass | `Pending` |
| Account Active | `{colors.status-account.active}` | check-circle | `Active` |
| Account Rejected | `{colors.status-account.rejected}` | block | `Rejected` |
| Account Deactivated | `{colors.status-account.deactivated}` | lock | `Deactivated` |

Status icons render in the icon-color token from each status entry (slightly more saturated than `fg`); color-blind users distinguish by icon **shape** and text label, not by hue (Finding B2).

Semantic feedback colors (success / warning / error / info) are separate from status colors — see `{DESIGN.md → Semantic Colors}`. Toast and alert body text uses `colors.{theme}.on-background` (page ink) on the soft fill — not the saturated `semantic.*` foreground — to keep AA on every variant (DESIGN.md §Color contrast & safety).

### 5.9 Alerts & toasts

- **Inline alerts.** Long-lived, contextually anchored (e.g., a member-facing success banner after a report is submitted).
- **Toasts.** Transient feedback for non-blocking actions (e.g., "Filters cleared"). Auto-dismiss after 4 s, with a manual dismiss control. Toasts are `role="status"` (polite) or `role="alert"` (assertive) per WCAG.

### 5.10 Modals & dialogs

Used only when the consequence must be visible before the user commits. Examples: confirm delete, confirm withdraw, confirm approve-with-auto-reject, confirm Returned. Each modal:
- Names the action verb in the heading ("Withdraw this report?").
- States the consequence in the body in plain English.
- Exposes two actions: confirm (primary or danger variant) and cancel (tertiary).
- Is focus-trapped and dismissible with Escape (cancel default).
- Returns focus to the originating element on close.

### 5.11 Dropdowns & menus

Used for `Report ▾` (Lost / Found), `Account ▾` (Profile, Theme, Logout), and `Admin ▾` queues. Single-level menus. Selected option is shown in the trigger.

### 5.12 Pagination

Listings paginate at 20 items per page. Pagination control sits below the listing. URL reflects the page (`?page=2`) so deep links work. Keyboard-accessible.

### 5.13 File/image upload

- **Trigger.** A drop zone plus a button (both lead to the same picker).
- **Accept.** JPEG, PNG, WebP (PRD FR-8).
- **Size.** Up to 5 MB. Validation on the client (UX) and the server (architecture).
- **Behavior.** After file selection: thumbnail preview with a remove button. Progress indicator while uploading. After success: image preview persists with an edit affordance. Errors show inline below the thumbnail with a retry button.

### 5.14 Empty, loading, error states

Every screen has all four.

- **Loading.** Skeleton for listing rows (3 placeholder rows); spinner for buttons; full-page skeleton for the detail page. Skeleton respects theme tokens.
- **Empty.** Friendly headline + one-sentence body + a single next-action button. No illustrations or stock photos (avoids scope creep on assets).
- **Error.** Calm headline, sentence body, "Try again" as primary, "Go back" as secondary. No stack traces. Logs handle diagnostics.
- **Offline / connection lost.** Banner at the top of the page: "Connection lost. We'll retry when you're back online." FindBack does **not** queue actions for later replay — find/lost work requires a live server connection. Architecture may revisit in a future revision; UX preserves an honest message instead of false-positive reassurance.

---

## 6. State Patterns

### 6.1 Form states

Every form passes through: `pristine` → `editing` → `submitting` → (`success` | `validation-error` | `server-error`).

- **`pristine`.** Initial render with empty fields. Submit is disabled (or, if enabled, greys out until required fields are valid).
- **`editing`.** A field has been changed. Submit becomes enabled when all required fields satisfy validation.
- **`submitting`.** Submit is disabled, spinner visible. Cancel remains available.
- **`validation-error`.** First invalid field receives focus. Error text replaces helper text below the field. The error summary at the top of the form is announced to screen readers (`role="alert"`).
- **`server-error`.** Show inline at the top of the form ("Something went wrong on our side. Try again."). Preserve user input. Do not navigate away.
- **`success`.** Inline confirmation (toast or page-level success state), then route the user to the destination (e.g., the new report's detail page).

### 6.2 Authentication & session states

- **Anonymous on member surface.** Friendly access screen: brand mark, "Sign in to continue" with two actions (Log in, Register), and a deep-link return.
- **Session expired mid-flow.** If the session expires during a protected action, inform the user that they have been signed out and route them to `/login` with the intended return destination preserved where appropriate. UX does not mandate browser-side draft persistence (no `sessionStorage`, no `localStorage`-backed forms, no automatic form restoration, no automatic replay of the failed state-changing request); architecture decides whether unfinished form state can or should be preserved.

### 6.3 Permission states (PRD FR-39 / §11.1)

The visibility model is **relationship-aware** and uses the seven canonical audiences from §11.1. Reporter and claimant are **never** merged: a claimant on a Found report does not gain access to the report's exact location or report identifying details, and a Recovery responder on a Lost report does not gain access to the Lost report's exact location or report identifying details. The 7-column matrix in §11.1 is authoritative; this section names the audiences the UX must render for.

- **Anonymous.** Public summary fields only (PRD FR-38). No description, no image, no reporter identity, no exact place, no identifying details, no Claims, no Recovery Responses, no threads, no audit.
- **Authenticated, unrelated member.** Sees summary + description + image. Sensitive fields (exact place, identifying details) are hidden (PRD FR-13, FR-39).
- **Found-report owner / finder.** Sees summary + description + image + reporter display name + their own report's exact place + their own report's identifying details + member-facing status history + Claims submitted against this Found report (counts, statuses, per-Claim thread entry points; **not** claimant reason or claimant identifying details — §11.1, UJ-2 correction).
- **Claimant (against a Found report).** Sees summary + description + image + reporter display name + member-facing status history. **Does NOT** see exact place or report identifying details on the Found report. Sees their own Claim thread and their own Claim fields.
- **Recovery responder (against a Lost report).** Sees summary + description + image + Lost-report owner display name + member-facing status history. **Does NOT** see exact place or report identifying details on the Lost report. Sees their own RR thread and their own RR fields.
- **Lost-report owner.** Sees summary + description + image + their own report's exact place + their own report's identifying details + member-facing status history + Recovery Responses submitted against this Lost report (responder display name, RR fields, per-RR thread entry points). Owner-only access to the `Select for Verification` action on Submitted RRs.
- **Administrator.** Sees everything including the audit trail (PRD FR-32). Can see Claim reason and claimant identifying details in the Administrator review screens.

### 6.4 Concurrent-action state (PRD D3)

When two administrators attempt to approve different claims on the same item at the same time, the server returns a conflict. UX handling:

- The losing administrator sees a conflict message: "This item's claim was already decided by another administrator. The item is now *{status}*."
- The losing screen disables Approve and Reject.
- A link is offered to the item's audit trail.
- This is *not* an error — it's expected. Use the calm copy template from Section 4.6.

### 6.5 Terminal states

- **Returned** and **Closed** (PRD FR-22). All actions except view-only are disabled. Each is annotated with the closing action and timestamp. No further edits, withdrawals, or claims allowed.

---

## 7. Interaction Primitives

### 7.1 Selection & filtering

- Listing filters live in a **filter bar** above the results, collapsible on mobile.
- Active filters render as pills above the result list. Each pill has a `×` to remove it. A "Clear all" pill appears when ≥ 2 filters are active.
- Sort options: "Most recent" (default), "Oldest first". PRD does not require more.

### 7.2 Navigation

- Primary navigation is a top bar with brand mark on the left and user/admin menus on the right.
- Breadcrumbs appear on detail pages (e.g., `Listings / Wallet / Claim`). Breadcrumbs are keyboard-navigable.

### 7.3 Inline help

- Helper text is the only help surface. There is no help center, no chatbot, no tooltip tour.
- Field-level helper text for non-obvious fields (e.g., "This information is restricted according to your relationship to the report." on a Sensitive Field).

### 7.4 Submission & cancellation

- **Cancel/back.** Returns to the previous surface. If the form is dirty, prompt "Discard your changes?" with two actions (Discard, Keep editing).
- **Submission.** Submit button disabled until form is valid. On submit, the form enters `submitting` state; on success, navigate to the report detail page; on validation error, scroll to the first error.

### 7.5 Drag & drop

- Image upload supports drag-and-drop on desktop. Mobile uses the picker. The drop zone is keyboard-accessible (focus → Enter opens picker).

### 7.6 Confirmation patterns

Two-step confirmation (click action, then confirm in modal) is reserved for irreversible or high-stakes actions:

- Withdraw report
- Delete report (Found: Open + no Claim; Lost: Open + no Recovery Response — see §10.4 for type-aware gates)
- Approve a claim (when other pending claims exist — i.e., competing claims, see Section 12)
- Confirm Returned (default or substitute)
- Close report (administrator)
- Deactivate account (administrator)
- Reject registration (administrator, requires reason)

For low-stakes actions (clear filters), no confirmation — the action is reversible or harmless.

---

## 8. Key Flows

Each flow names a protagonist from the PRD (UJ-1 through UJ-5). Mirrors PRD source-spec names verbatim.

### 8.1 UJ-1 — Maya reports a Lost wallet, claims a Found wallet, then explicitly Withdraws her own Lost report

**Protagonist.** Maya, graduate student, Active member. Lost her wallet on campus. Separately, spots a Found wallet listed by another member and files a Claim.

**Step-by-step flow:**

1. **Landing.** Maya logs in, lands on `/home`. Two primary actions visible: `Report Lost Item`, `Report Found Item`.
2. **Report Lost.** Click `Report Lost Item` → `/report/lost`. Form opens with a single-column layout on desktop, full-screen on mobile.
3. **Fill the report.**
   - `Name` — "Wallet" (required, 1–80).
   - `Category` — selects "Wallets & purses" from the native select.
   - `Description` — "Brown leather, zip closure, contains student ID and a photo card" (10–2000).
   - `Date lost` — today's date via native picker (server validates ≤ 365 days, not future).
   - `Campus area` — selects "Main Library" from the native select.
   - `Exact place` (optional, **Sensitive**) — "2nd floor, behind the periodicals shelf".
   - `Identifying details` (optional, **Sensitive**) — "Scratched corner near the zipper".
   - `Image` (optional) — drag-and-drop or picker. Thumbnail preview appears.
4. **Submit.** Maya clicks `Submit report`. Submitting state shows. On success, toast confirms and Maya is routed to `/my/reports/:id` (her own report). **Status: `Open`**. Maya's Lost report is now retrievable under `My Reports`.
5. **Detail page (as reporter).** Maya sees her Lost report: name, type badge `Lost`, category, description, image, exact place, identifying details, member-facing status history. Status is `Open`. An `Edit` and a `Withdraw` action are visible.
6. **Browse Found items.** Maya clicks `Browse` in the nav → `/listings`. She filters: Type = `Found`, Category = `Wallets & purses`. Result list appears. She clicks a row.
7. **Item detail (authenticated, no relationship to this Found report).** Maya sees the Found item's summary + description + image. Status `Open`. A `Submit claim` CTA is visible because the item is `Found`.
   - **Important:** Maya does **NOT** see this Found report in `My Reports` — it is not her report. Authored reports and Claims against other members' reports are kept in separate views (§3).
8. **Submit Claim.** Maya clicks `Submit claim` → `/listings/:id/claim`. Form:
   - `Reason` — "This is my wallet — brown leather, with a photo of my dog inside" (20–1000).
   - `Identifying details` — "There is a small scratch on the back, and a folded metro card in the inner pocket" (10–500).
   - `Date lost` — same date.
9. **Submit claim.** Claim is created in `Pending` status. Maya sees claim detail under `/my/claims/:id`. Email goes to the finder (PRD FR-28). The Found report's status transitions to `Claim Requested` (PRD FR-22). **Maya's own Lost report remains `Open` — there is no automatic Lost↔Found linking.**
10. **Wait.** Maya sees her Claim status in `My Claims`. She does not receive any further email until a decision. Her Lost report remains `Open` in `My Reports` — independently of the Claim.
11. **Administrator approves the Claim.** Maya receives the "claim approved" email (PRD FR-29). Her Claim status moves to `Approved`. The Found report's status moves to `Claim Approved`.
   - **Critical:** Maya's own Lost report is still `Open`. Approving the Claim does **not** automatically close or update her Lost report. The two reports live independently.
12. **Visit desk.** Maya visits the administrator to pick up the wallet.
13. **Returned.** Administrator confirms Returned with Maya as receiver (default, PRD FR-23). Maya's email does not fire (PRD FR-30: Returned is not an email event). Maya's Claim status remains `Approved`; the Found report's status is `Returned` (terminal). Maya sees this on `/my/claims/:id` — the Found report does **not** appear in her `My Reports` because she did not author it.
14. **Manual Lost-report cleanup.** Maya opens `My Reports → her Lost report`. She clicks `Withdraw`. Confirmation modal: "Withdraw this report? It will move to `Closed` and be removed from active listings." Maya confirms.
15. **Closed.** Her Lost report transitions `Open → Closed` (PRD FR-11). Maya's original Lost report is now retrievable under `My Reports` in the historical view.
   - **Climax beat rule.** This is a deliberate reporter action. There is **no automatic Lost↔Found linking**, **no Claim-driven auto-closure** of Maya's Lost report, and **no system inference** that the Claim success means her Lost report should disappear. Maya is the author of her Lost report and is responsible for closing it.

**Climax beat.** Maya walks away with her wallet. She correctly sees the Claim under `My Claims` (not `My Reports`), and she explicitly cleans up her separate Lost report via Withdraw when she is satisfied. The system never silently links the two reports.

### 8.2 UJ-2 — Sam finds a phone and wants to do the right thing

**Protagonist.** Sam, employee, Active member. Found a phone at the cafeteria.

1. **Report Found.** Sam clicks `Report Found Item` → `/report/found`. Fills in the form (similar to UJ-1 step 3, but for Found; date field is "date found", location is "Cafeteria").
2. **Submit.** Report is created in `Open`. Audit trail records Sam.
3. **Wait.** Sam does nothing for three days. He does not manage the claim himself (PRD §2.3 UJ-2).
4. **Email arrives.** Sam receives "new claim on your found item" email (PRD FR-28). Email contains a link to the report detail (not the claim detail). **The email does not include the claimant's reason or identifying details** (PRD FR-37, FR-39 — privacy model).
5. **Open report detail.** Sam opens his own Found report from `/my/reports/:id`. He sees the report lifecycle status (`Claim Requested`) and the count of pending claims (`1 pending claim`). He does **NOT** see the claimant's name beyond a generic "a member has filed a claim" disclosure, and he does **NOT** see the Claim reason or identifying details.
   - **What Sam may see** (per FR-39 visibility matrix):
     - That a Claim exists on his report.
     - The Found report's lifecycle status.
     - The per-Claim message thread (post in it; the claimant can read his messages).
     - The audit-relevant events on his own report (member-facing status history, no Claim content).
   - **What Sam must NOT see** (per FR-37, FR-39):
     - The claimant's Claim reason.
     - The claimant's identifying details.
     - Any private ownership evidence.
6. **Coordinate via the thread (optional).** Sam can post in the per-Claim thread if he has logistics to coordinate (e.g., "I can leave it at the security desk after 3pm"). The thread is the only place where claimant and finder communicate in-product (PRD FR-26). Sam does not contact the claimant by any out-of-platform channel — the system does not expose the claimant's email or phone.
7. **Wait for decision.** Sam does not receive any further email (PRD FR-30). He can see the status change on `/my/reports` when he next visits. He does **not** receive an email about Claim approval or rejection — the administrator communicates the outcome to the claimant; Sam sees status only.
8. **Bring to administrator.** Once status is `Claim Approved`, Sam brings the phone to the administrator.
9. **Returned.** Administrator confirms Returned. The Administrator confirms the physical handoff to the approved claimant, who is the default receiver. Identity verification is not part of FindBack. Sam's report status moves to `Returned` (terminal). No email to Sam on Returned (PRD FR-30).

**Climax beat.** Sam does the right thing without chasing anyone. He never sees the claimant's private evidence. The system routes Claim approval and Returned through the administrator — Sam is informed via status changes on his own report, never via claimant-identifying content.

### 8.3 UJ-3 — Alex, a new intern, registers and is approved

**Protagonist.** Alex, new intern, never used FindBack.

1. **Discovery.** Alex visits the FindBack landing page `/`. Sees brand mark, two CTAs (`Sign in`, `Register`), and a one-paragraph value prop.
2. **Register.** Click `Register` → `/register`. Form:
   - `Name`
   - `Email` (unique within org, validated server-side)
   - `Password` (≥ 8 chars, ≥ 1 letter, ≥ 1 number; client-side hint)
   - `Confirm password`
   - `Self-declared role` (Student / Employee / Visitor / Other; single-select)
3. **Submit.** On success, Alex is shown a confirmation page: "Your account is pending administrator approval. You'll get an email when you're approved." He is **not** logged in.
4. **Pending state.** If Alex tries to "Log in" with his credentials while still pending, he lands on `/pending` with the Pending banner. He cannot browse, report, or claim.
5. **Administrator reviews.** Administrator sees Alex in `/admin/registrations`. Two actions: `Approve`, `Reject`.
6. **Approve.** Administrator clicks `Approve`. No reason required. Account becomes `Active`. **Account Approved email sent to Alex** (PRD FR-27). Audit trail records the approval with actor and timestamp.
7. **Rejected path.** Administrator clicks `Reject`. Modal asks for a reason (≥ 5 chars, used for audit only). Reason is recorded in the audit trail (PRD FR-3, FR-31). **No rejection email is sent.** Account state transitions to `Rejected`. The rejection reason is **not** exposed to the rejected user.
8. **Subsequent login attempt (rejected).** If Alex later tries to log in with his credentials, he sees the **neutral inactive-account message** on the login screen: "We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator." The form remains usable (so a typo can be corrected). The same neutral message fires for both Rejected and Deactivated states — no internal distinction surfaces to the user (PRD FR-3, FR-4; §9.3).
9. **Active path (approved).** If approved, Alex logs in and sees `/home` with the two `Report Lost Item` / `Report Found Item` CTAs.

**Climax beat.** Alex is approved in minutes and knows exactly what's happening at each step. Rejected users never learn *why* they were rejected through FindBack, and they are not bombarded with rejection emails. The audit trail preserves administrator reasoning internally without exposing it externally.

> **UX decision (correction pass — 2026-09-16).** Earlier revisions of this journey included a Rejected-account notification email. The final PRD does not list a registration-rejection email in FR-46 Events 1–8, and FR-30 explicitly says no other notifications beyond those listed. Therefore rejected registrations are **not** emailed. The UX surfaces this via the login-screen neutral inactive-account message instead.

### 8.4 UJ-4 — Riley, an administrator, handles a busy morning

**Protagonist.** Riley, security desk, sole administrator on shift. Starting workload on the dashboard:
- 2 pending registrations.
- 6 pending Claims (Found-side).
- 1 Found report awaiting return.
- 1 Lost report in `Verification Pending` (Lost-side — owner already selected a Recovery Response; Riley must record the owner's Match Confirmed / Not a Match determination and, if Match Confirmed, schedule the return).

That is **four operational queues**. Audit is **cross-cutting**, not a fifth queue (PRD FR-33; §15.1).

**Step-by-step flow:**

1. **Administrator dashboard.** Riley opens `/admin`. **Four** count tiles, each linking to the corresponding queue (PRD FR-33, FR-50):
   - Pending Registrations: `2` → `/admin/registrations`
   - Pending Claims: `6` → `/admin/claims` (Found-side)
   - Items Awaiting Return: `1` → `/admin/awaiting-return` (Found-side, `Claim Approved`)
   - Items in Verification: `1` → `/admin/verifications` (Lost-side, `Verification Pending`)
   - Audit is cross-cutting and lives at `/admin/audit`; it is **not** a fifth dashboard tile and there is no on-dashboard activity feed. Administrators reach audit from the relevant report, Claim, Recovery Response, or thread context.
2. **Pending Claims queue (Found-side).** Riley opens `/admin/claims`. Table: claim ID, item name, claimant display name, submission time, action. Default sort: oldest first (PRD §2.3 UJ-4 "ordered by submission time").
3. **Single-claim review (no competition).** Riley opens the first claim → `/admin/claims/:id`. Two-column layout: item details (left) and current claim (right). The "Other pending claims on this item" strip at the bottom shows `0` other pending claims. This is the non-competing path.
4. **Approve (no competition).** Riley clicks `Approve`. Confirmation modal: "Approve this claim? The item will move to *Claim Approved*." No auto-rejection warning because no other pending claims exist. Riley confirms. Claim status → `Approved`. Item status → `Claim Approved`. Email to claimant (PRD FR-29).
5. **Competing Claims (Found-side).** Riley opens the second item, which has two pending claims. The review screen shows the **current** claim details alongside the Found-item information. Other Pending claims on the same item are visible in a bottom strip with claimant display name and submission time — Riley can click each to navigate to that claim's review screen without losing context. Riley reads reasons, identifying details, date lost.
   - **Prominent warning** above the `Approve` action bar: "Approving this claim will automatically reject *{N}* other pending claim{plural} on this item. This cannot be undone."
   - **Two-step confirmation** (PRD FR-17, D3): the modal restates the consequence in plain English, names the losing claimants (display names), and confirms via a dedicated `Approve claim` button.
   - **Post-approval:** the approved claim becomes `Approved`; every other Pending claim on the item auto-transitions to `Rejected` atomically with audit reason "another claim was approved for this item" (PRD FR-17). The Found-item status moves to `Claim Approved`. Auto-rejected claimants receive the softer auto-rejection email per §4.4 / OQ-5.
6. **Concurrent-action edge.** If another administrator approves a competing claim first, Riley sees the conflict state from §6.4 ("This item's claim was already decided…"). The losing decision is recorded as a no-op.
7. **Items Awaiting Return.** Riley opens `/admin/awaiting-return`. The approved item is listed. Riley clicks `Confirm Returned` → `/admin/items/:id/return`.
   - **Default receiver.** Approved claimant's name prefilled; "Default receiver" radio selected. Confirmation modal: "Mark this item as returned to *{Name}*? This is final." Confirming records confirming administrator, receiver (claimant), timestamp (PRD FR-31 event 6).
   - **Substitute receiver.** "Substitute receiver" radio reveals three required fields: substitute name (1–80 chars), authorization affirmation checkbox, relationship radio (Friend / Family / Colleague / Classmate / Other). All three required when substitute ≠ claimant (PRD FR-24). Confirmation modal restates the substitute details. The audit event records all three (PRD FR-31 event 7).
   - **Lost-side Returned is handled in step 11** (via `/admin/verifications` → record Returned after Match Confirmed).
8. **Registrations.** Riley reviews `/admin/registrations`. Approves one (Account Approved email fires per PRD FR-27). Rejects the other with a reason (audit-only, ≥ 5 chars, **no email sent** per PRD FR-30 — the rejected user surfaces via the login-screen neutral inactive-account message instead).
9. **Items in Verification (Lost-side).** Riley opens `/admin/verifications`. One Lost report is in `Verification Pending`. Riley clicks `Manage verification` → `/admin/lost/:id` (the Lost-side verification screen).
10. **Verification review (Lost-side — Administrator-records).** Two-column layout. Left: Lost report summary (item details, owner, current lifecycle status `Verification Pending`, currently selected responder name). Right: the selected Recovery Response card — where-found area + exact place, observed identifying details, candidate image if any, canonical status `Selected for Verification`, per-RR thread entry point. Below: a list of other Submitted RRs (Pat's, etc.) shown as `Submitted — Standby` — display-only derivation, not a canonical status.
   - **Riley's actions on this screen (Administrator-records):**
     - **Record owner's Match Confirmed.** Button label: `Record Match Confirmed (owner says it's theirs)`. Confirmation modal names the owner (Maya) and the responder (Sam). On confirm: RR status → `Match Confirmed` (`determined_by = Maya`, `recorded_by = Riley`); Lost report remains `Verification Pending` (PRD FR-42 — `Match Confirmed` is an RR status, not a Lost-report status).
     - **Record owner's Not a Match.** Button label: `Record Not a Match (owner says it's not theirs)`. Confirmation modal asks for an internal reason (≥ 5 chars, audit-only). On confirm: RR status → `Not a Match`; Lost report reverts to `Open` (FR-48 event 28). Pat's `Submitted — Standby` RR becomes eligible for selection again.
     - **Administrator Close (pre-Match Confirmed; FR-48 Event 24).** Available when the selected RR is still `Selected for Verification`. Confirmation modal: "Close this Lost report? All non-terminal Recovery Responses will be marked Resolved — Report Closed and threads become read-only." On confirm: Lost report `Verification Pending → Closed`; selected RR `Selected for Verification → Resolved — Report Closed`; other non-terminal RRs `Submitted → Resolved — Report Closed`. Audit: FR-48 Event 24. **This is not a generic 'Cancel workflow → Open' — there is no such action. The canonical `Verification Pending → Open` path is `Not a Match` above.**
     - **Exceptional Administrator cancellation (post-Match Confirmed; FR-48 Event 25).** Available only after the selected RR is `Match Confirmed`. Confirmation modal: "Cancel this Lost workflow exceptionally? The matched Recovery Response will be marked Resolved — Report Closed. Threads become read-only." On confirm: Lost report `Verification Pending → Closed`; selected RR `Match Confirmed → Resolved — Report Closed`; other non-terminal RRs `Submitted → Resolved — Report Closed`. Audit: FR-48 Event 25. **This is not the owner "withdrawing"; it is an Administrator-only exceptional cancellation that operates after `Match Confirmed`.**
11. **Confirm Returned (Lost-side, after Match Confirmed).** Once RR is `Match Confirmed`, the same verification screen surfaces a `Confirm Returned` action. Riley opens `/admin/lost/:id/return`. Default receiver = Maya (the Lost-report owner). Substitute receiver follows the same three-field flow as Found-side. On confirm:
    - Selected matched RR: `Match Confirmed → Completed — Report Returned` (PRD FR-48 event 30).
    - Every other non-terminal RR: → `Resolved — Report Returned` (PRD FR-48 event 26).
    - Lost report: `Verification Pending → Returned` (terminal; PRD FR-48 event 21 or 22 for default/substitute).
    - Audit events fire; emails fire (PRD FR-46 Events 7 and 8 — to the Lost-report owner and to the matched responder; no email to Sam-equivalent non-matched standby responders).
12. **Audit trail.** Riley can open `/admin/items/:id/audit` (Found-side) or `/admin/lost/:id/audit` (Lost-side) for any report to see the full chronological record (PRD FR-31, FR-48 events 1–30). For audit-trail reads, an access log is created (PRD §10 Observability).

**Climax beat.** Riley processes work across **all four operational queues** — Found-side (Pending Claims, Items Awaiting Return) and Lost-side (Items in Verification) — plus Pending Registrations. Every action is captured; the audit trail is trustworthy; competing-Claim behavior is unmistakably signposted before approval; the owner-determines / Administrator-records distinction is preserved in the wording of every Lost-side button.

### 8.5 UJ-5 — Sam and Pat respond to Maya's Lost report (canonical Lost-side Recovery Response journey)

**Protagonists (PRD UJ-5).**

- **Maya** — Lost-report owner.
- **Sam** — Recovery responder (the matched responder in the climax).
- **Pat** — second Recovery responder (the standby responder).
- **Riley** — Administrator (records the owner's determination and confirms Returned).

> Quinn is preserved here only as an optional third-responder edge case (Edge Case G), not as the primary responder.

---

#### Step 1 — Maya's Lost report exists

Maya has an `Open` Lost wallet report retrievable under `My Reports → her Lost report`. Status: `Open`.

#### Step 2 — Sam browses

Sam, an unrelated Active member, opens `/listings` and filters `Type = Lost`. He sees Maya's Lost report. He clicks the row. As an authenticated unrelated member (per FR-39 visibility matrix), Sam **sees**: item name, category, date lost, campus area (enum), public lifecycle status `Open`, type `Lost`, description, image, reporter display name, member-facing status history. Sam does **NOT** see: exact place, identifying details, any private ownership evidence, any Claim content, any RR content, any audit content, reporter contact information.

#### Step 3 — Sam submits Recovery Response

Sam clicks the `I may have found this item` CTA. The RR form `/listings/:id/submit-recovery-response` opens. Required: campus area (prefilled with the Lost report's campus area, editable), observed identifying details (textarea), date found (date picker, bounded to today and 30 days past per FR-8). Optional: exact place found (free text), candidate image. Sam submits. RR row is created with canonical status `Submitted`. Audit: **PRD FR-48 Event 15 — Recovery Response submitted** (`actor = Sam`, `triggered_by = submit`). Lost report remains `Open`; the RR submission alone does not change the Lost-report lifecycle.

**Email — PRD FR-46 Event 4** ("New Recovery Response on my Lost report") fires to Maya. Maya is notified as soon as Sam's RR enters `Submitted`. (Earlier revisions stated "no email to Maya yet"; correction pass #9 says Event 4 fires.)

#### Step 4 — Pat submits another Recovery Response

Pat, another unrelated Active member, also opens Maya's Lost report and submits a separate Recovery Response. Pat's RR status is `Submitted`. Audit: PRD FR-48 Event 15 (`actor = Pat`).

- Maya's Lost report remains `Open`. Both Sam's and Pat's RRs are `Submitted`. No RR has been selected yet.
- **Email — PRD FR-46 Event 4** fires to Maya again for Pat's newly submitted response.

#### Step 5 — Maya selects a Recovery Response (owner-determines)

Maya opens `My Reports → her Lost report → Review Responses`. She sees Sam's and Pat's submitted RRs side by side, each with: responder display name (per FR-39 — the Lost-report owner is the only non-Administrator with cross-RR visibility on their own Lost report), permitted private details (where-found area + exact place, observed identifying details, date found, candidate image if any — these are RR-side fields, not Maya's own Lost-report fields), and a separate per-RR thread entry point.

Maya chooses Sam. She clicks **`Select for Verification`** on Sam's RR. Atomically:

- **Sam's RR** transitions `Submitted → Selected for Verification`.
- **Maya's Lost report** transitions `Open → Verification Pending`. The Lost report now appears in the Administrator's `Items in Verification` queue (PRD FR-50).
- **Pat's RR** remains `Submitted`. UI shows Pat as **`Submitted — Standby`** (derived/display label only; canonical status is `Submitted`).
- **Audit — PRD FR-48 Event 17** — "Recovery Response selected for verification", `actor = Maya` (the Lost-report owner), `triggered_by = select_response`.
- **Email — PRD FR-46 Event 5** — "My response was selected for verification" — fires to **Sam** (the selected responder). No "verification started" email fires to Maya here — Maya initiated the selection herself (correction pass #11).
- Maya does not need to email or contact the Administrator before the report enters `Verification Pending`. Once she selects, the queue update is immediate.

#### Step 6 — Administrator reviews verification (Administrator-records)

Riley sees the Lost report in `Items in Verification`. Riley opens `/admin/lost/:id`. Two-column layout:

- **Left.** Lost report summary (item name, category, date, campus area, owner display name Maya, current Lost-report status `Verification Pending`, selected responder Sam).
- **Right.** Selected Recovery Response card (where-found, exact place, observed identifying details, candidate image, canonical status `Selected for Verification`, per-RR thread entry point). Below: list of other Submitted RRs shown as `Submitted — Standby` (Pat's).

**Riley does not select the RR — Maya already did.** Riley's role is Administrator-records, not selection.

##### Step 6a — Maya says it's hers → Riley records Match Confirmed

Maya tells Riley in person at the security desk "that's mine." Riley, on `/admin/lost/:id`, clicks **`Record Match Confirmed (owner says it's theirs)`**. Confirmation modal names Maya and Sam. Riley confirms. Atomically:

- **Sam's RR** transitions `Selected for Verification → Match Confirmed`. **Lost report remains `Verification Pending`** — `Match Confirmed` is an RR status, not a Lost-report status (PRD FR-42).
- **Audit — PRD FR-48 Event 18** — "Match Confirmed determination recorded", `determined_by = Maya`, `recorded_by = Riley`, `triggering_action = record_match_confirmed`.
- Pat's RR remains `Submitted — Standby`.
- No email fires to either party at this point (Match Confirmed is not yet an email event).

##### Step 6b — Maya says it's not Sam's → Riley records Not a Match

If Maya tells Riley "that's not mine", Riley clicks **`Record Not a Match (owner says it's not theirs)`**. Confirmation modal asks for an internal reason (≥ 5 chars, audit-only). Atomically:

- **Sam's RR** transitions `Selected for Verification → Not a Match`.
- **Maya's Lost report** reverts `Verification Pending → Open` (PRD FR-48 Event 28).
- **Audit — PRD FR-48 Event 19** — "Not a Match determination recorded", `determined_by = Maya`, `recorded_by = Riley`, `reason = {audit-only}`.
- **Email — PRD FR-46 Event 6** ("Not a Match") fires to Sam.
- Pat's RR remains `Submitted` and is again eligible for Maya's selection (the Standby label lifts).

> **Owner-determines / Administrator-records rule (correction #13).** Maya (the owner) is the only party who can decide `Match Confirmed` or `Not a Match`. Riley records what Maya says. Riley cannot record `Match Confirmed` without Maya's determination — even if Maya has told Riley in person "just pick it up", Riley still records `determined_by = Maya`, `recorded_by = Riley`. **If Maya is unreachable or has not provided a determination, the verification remains pending: the selected RR stays `Selected for Verification` and the Lost report stays `Verification Pending`. The Administrator cannot independently record `Match Confirmed` or `Not a Match`. The Administrator cannot infer either outcome from Maya's absence.** No `Not a Match` determination is fabricated. Only an already-valid PRD closure path may end a stuck workflow (see §9.5 Administrator Close path, FR-48 Event 24).

#### Step 7 — Confirm Returned (Lost-side)

After Step 6a, Riley uses `Confirm Returned` on the same verification screen → `/admin/lost/:id/return`. Default receiver = Lost-report owner (Maya). Substitute radio reveals three required fields (substitute name, authorization affirmation checkbox, relationship radio: Friend / Family / Colleague / Classmate / Other). All three required when substitute ≠ default receiver (PRD FR-24).

On confirm:

- **Selected matched RR (Sam's)** transitions `Match Confirmed → Completed — Report Returned` (PRD FR-48 Event 30).
- **Every other non-terminal RR (Pat's `Submitted — Standby`)** transitions `Submitted → Resolved — Report Returned` (PRD FR-48 Event 26).
- **Maya's Lost report** transitions `Verification Pending → Returned` (terminal; PRD FR-48 Event 21 default receiver / Event 22 substitute).
- **Audit — PRD FR-48 Events 21/22/26/30** — all four with appropriate actor fields.
- **Email — PRD FR-46 Event 7** ("Lost Returned") fires to Maya (the Lost-report owner).
- **Email — PRD FR-46 Event 8** ("Successful completion") fires to Sam (the matched responder). This event covers BOTH `Match Confirmed → Completed — Report Returned` (RR-side) AND `Verification Pending → Returned` (Lost-report-side) atomically.
- **Pat receives no Event 8 email** — only the matched responder is notified of successful completion. Pat's RR is terminal `Resolved — Report Returned` and surfaces in Pat's historical view.

(Email split — correction pass #14: the earlier "no email on Lost Returned" wording is **replaced** with FR-46 Event 7 + Event 8 emails. PRD FR-30's "no other notifications" rule is preserved — only PRD-listed events fire.)

#### Step 8 — Sam and Pat's views

- **Sam opens `/my/recovery-responses/:id`.** RR shows canonical status `Completed — Report Returned`. Per-RR thread is read-only (PRD FR-47). The related Lost report appears in Sam's completed history.
- **Pat opens `/my/recovery-responses/:id`.** RR shows canonical status `Resolved — Report Returned`. Per-RR thread is read-only.

---

#### Edge cases

**Edge Case A — Maya withdraws her Lost report during Verification Pending (before Match Confirmed).** Maya opens `My Reports → her Lost report` and clicks `Withdraw`. Confirmation modal. Lost report transitions `Verification Pending → Closed` (PRD FR-11, FR-48 Event 23). Sam's RR (still `Selected for Verification`) follows lifecycle rules: `Selected for Verification → Resolved — Report Closed`. Pat's RR (`Submitted — Standby`) → `Resolved — Report Closed`. Per-RR threads become read-only.

**Edge Case A.2 — Maya attempts Withdraw after Match Confirmed is BLOCKED.** Reporter Withdraw is not available after Match Confirmed. Maya does not see an enabled Withdraw action on her Lost report once it has reached `Match Confirmed` on a selected RR. Only an Administrator may end the workflow via exceptional cancellation (PRD FR-50). That path uses **PRD FR-48 Event 25** and transitions: Lost report `Verification Pending → Closed`; selected RR `Match Confirmed → Resolved — Report Closed`; other non-terminal RRs `Submitted → Resolved — Report Closed`; threads read-only. The Administrator cancellation is **not** described as the owner "withdrawing".

**Edge Case B — Sam withdraws his Recovery Response.** Sam opens `/my/recovery-responses/:id` and clicks `Withdraw`. Withdrawal is allowed **only** while Sam's RR is `Submitted` **and** not currently `Selected for Verification`. Audit: PRD FR-48 Event 20 (`actor = Sam`). RR transitions `Submitted → Withdrawn`. The parent Lost report is **not** transitioned back to `Open` by responder withdrawal — selection of an RR does not lock the Lost report's `Open` state, and a `Submitted` RR that was not selected never held a selection. Withdrawing a `Selected for Verification` RR is **not permitted**; Sam cannot withdraw a RR that is mid-verification. The form gate blocks Withdraw when `rr.status !== 'Submitted'`.

**Edge Case C — Sam tries to submit another RR while he already has one.** The form gate checks the responder's existing RR state on the Lost report and shows **state-aware** messaging:

- **Existing RR is `Submitted` (and not currently `Selected for Verification`).** Sam is blocked from submitting a second active RR. System message: "You already have a Recovery Response on this item. Withdraw it first if you want to end it before submitting a new one." Sam may choose to withdraw the existing `Submitted` RR; that action is offered.
- **Existing RR is `Selected for Verification`.** Sam is blocked from submitting a second RR. System message: "You already have a Recovery Response being verified for this item. You cannot submit another response while verification is in progress." The Withdraw option is **not** offered — selected RRs cannot be withdrawn.
- **Existing RR is `Match Confirmed`.** Sam is blocked from submitting a new RR on the same Lost report. No new RR is allowed while verification is complete and pending Confirm Returned.
- **Existing RR is `Not a Match`.** Sam may later create a new RR record on the same Lost report if otherwise eligible. The old `Not a Match` RR remains terminal.

**Edge Case D — RR has been Match Confirmed; new RR submission is blocked.** After Step 6a (Match Confirmed), the Lost report is `Verification Pending`. Pat navigates to the Lost detail page. The `I may have found this item` CTA is hidden — system message: "This item is being returned to its owner." Pat sees no submission affordance.

**Edge Case E — Riley records Not a Match (Step 6b).** Sam's identifying details don't actually match. Riley records `Not a Match`. Sam's RR → `Not a Match`; Lost report → `Open`. Pat's `Submitted — Standby` RR is again eligible for selection (the Standby label lifts when no RR is currently `Selected for Verification`). PRD FR-46 Event 6 email fires to Sam.

**Edge Case F — Lost report is closed by Administrator (moderation) while Pat's RR is `Submitted`.** Riley opens `/admin/items/:id/close` and closes the Lost report (PRD FR-21, FR-50, FR-48 Event 24). Pat's RR → `Resolved — Report Closed`. Pat sees `Resolved — Report Closed` in `My Recovery Responses`.

**Edge Case G — A third responder (Quinn) appears late.** If a third member submits an RR after Maya has selected Sam, Quinn's RR enters `Submitted` and is rendered as `Submitted — Standby` (canonical status `Submitted`, derived label). At Confirm Returned, Quinn's RR transitions `Submitted → Resolved — Report Returned` alongside Pat's.

**Climax beat.** Maya is reunited with her wallet at the security desk. Maya correctly selected Sam (owner-determines); Riley correctly recorded the determination and the Returned (Administrator-records). Pat's standby RR auto-resolves without manual intervention. Every transition has an audit `actor`, `determined_by`, and `recorded_by` where appropriate. Sam's `Completed — Report Returned` and Pat's `Resolved — Report Returned` are both visible to their respective responders, each in their own `My Recovery Responses` view, with read-only per-RR threads.

---

## 9. Per-Audience Surfaces

### 9.1 Anonymous

- **Landing (`/`).** Brand mark, value proposition (1 paragraph), `Sign in` and `Register` CTAs. Below the fold: a "Browse the listings" link to `/listings` so visitors can see what FindBack is before signing up.
- **Listings (`/listings`).** Summary view (PRD FR-12, FR-38). Filter bar (keyword, category, location, type, status — but status defaults to `Open`, `Claim Requested`, `Claim Approved` only). Clicking a row routes to `/login?return=/listings/:id` with a message: "Sign in to see item details."

### 9.2 Pending

- **Pending landing (`/pending`).** Brand mark, banner: "Your account is pending administrator approval." Single CTA: `Log out`. No nav.
- **If a Pending user deep-links to a member surface**, render the access screen with a non-blocking message (Section 4.5).

### 9.3 Rejected / Deactivated (login attempt)

- **Login screen with rejection (`/login` error state).** Single message: "We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator." Form stays available so the user can correct typos if applicable; the same neutral message fires for both Rejected and Deactivated states (no internal distinction surfaces).

### 9.3a Forgot Password / Password Recovery (PRD FR-51)

> Authority: PRD FR-51.

The Login screen (`/login`) exposes a `Forgot your password?` action beneath the password field. Selecting it opens the Forgot Password form (`/forgot`).

- **Forgot Password form (`/forgot`).** Single `Email` field, `Send reset instructions` primary button, `Back to sign in` secondary link.
- **Confirmation screen (`/forgot-sent`).** Heading: `Check your email`. Body: `If an account exists for that email address, password reset instructions have been sent.` `Back to sign in` secondary link.
- **Anti-account-enumeration behavior.** The system always shows the neutral confirmation message regardless of whether the email belongs to an account (registered, not registered, `Pending`, `Active`, `Rejected`, `Deactivated`). The response, timing, and any subsequent state must not differ in a way that reveals whether the email is associated with an account. UX does not branch on account state at this surface.
- **Email is an authentication/security message.** The password-reset email is sent under FR-51 and is NOT part of the eight business/workflow email events (FR-46 Events 1–8). It is NOT a ninth FR-46 event. There is no in-app notification and no in-product surface for password-reset status beyond the confirmation screen.
- **Password reset does not alter account lifecycle state.** A `Pending` account remains `Pending`, a `Rejected` account remains `Rejected`, a `Deactivated` account remains `Deactivated`. Password recovery does not bypass Administrator approval.
- **Architecture owns implementation details.** Reset-token format, token hashing/storage, token expiry duration, invalidation strategy, email-provider implementation, backend endpoints, and session handling after reset are not specified by UX.

### 9.4 Active Member

- **Dashboard (`/home`).** Two primary CTAs (Report Lost, Report Found). Below: a "My recent activity" card showing the most recent 3 of each from `My Reports` and `My Claims`. Tabs to switch. A "Browse Lost & Found" link.
- **Browse (`/listings`).** Same surface as anonymous listings but with richer view (e.g., filter pills, type toggle, sort).
- **Item detail (`/listings/:id`).** Relationship-aware rendering per PRD FR-39 visibility matrix (§11.1). **The detail page never auto-reveals more sensitive fields when a member submits a Claim.** Sensitive fields (exact place, identifying details) stay hidden from non-owners, including non-owners who happen to have filed a Claim.
  - **Anonymous.** Public summary only; no detail, no image, no description, no reporter name, no Claim content, no RR content (PRD FR-12, FR-13, FR-38).
  - **Authenticated, no relationship.** Item name, category, date, campus area, type, public lifecycle status, description, image, reporter display name, member-facing status history. **No** exact place, **no** identifying details, **no** Claim content, **no** RR content (PRD FR-13, FR-39).
  - **Found-report owner / finder.** Same as authenticated-no-relationship, plus the per-Claim thread entry point and "your Found report" toolbar. **Finder does NOT see claimant reason or identifying details** (PRD FR-37, FR-39). The finder sees only "a member has filed a claim" and the per-Claim thread.
  - **Claimant (own Claim only).** Same as authenticated-no-relationship, plus their own Claim detail (reason, identifying details, date lost) and the per-Claim thread for their own Claim. They do **NOT** see Sensitive Fields on the Found report (PRD FR-39 — they are a claimant, not the reporter).
  - **Recovery responder (own RR only).** Same as authenticated-no-relationship, plus their own RR fields (where-found, observed identifying details, candidate image, RR status) and the per-RR thread for their own response. They do **NOT** see the Lost report's Sensitive Fields, other responders' RRs, or other responders' per-RR threads (PRD FR-39).
  - **Lost-report owner.** Full visibility on their own Lost report, including cross-RR visibility and per-RR threads for every RR on their Lost report (PRD FR-39). Plus the Lost-report lifecycle status and `Open → Verification Pending → Returned / Closed` transitions.
  - **Administrator.** Everything plus audit trail.
- **Report form (`/report/lost`, `/report/found`).** Two-step: type is fixed by URL; fields follow PRD FR-8. Helper text is concise; required indicator is `*`. Date picker for date; native selects for category and campus area.
- **My Reports (`/my/reports`).** Tabs: `Lost`, `Found`, `Closed` (PRD FR-11 closed states land here as historical). Each row shows type badge, item name, status badge, last-updated timestamp. Edit; Delete when Open and interaction-free (Found: no Claim; Lost: no Recovery Response — see §10.4); Withdraw otherwise. **My Reports contains only reports authored by the member — never Claims and never Recovery Responses** (PRD FR-49).
- **My Claims (`/my/claims`).** Tabs: `Pending`, `Approved`, `Rejected`. Each row shows the item name, item type, status badge, claim submission time. Click → claim detail. **My Claims contains only Claims the member submitted against other members' Found reports — never own authored reports** (PRD FR-49).
- **Claim detail (`/my/claims/:id`).** Item summary (link), claim reason, identifying details, date lost, claim status. Below: per-Claim message thread (§13) — read-only once the Claim is `approved`, `rejected`, or the item is `returned`/`closed` (§13.5). The thread is writable only while the Claim is `pending` and the item is not yet returned/closed.
- **My Recovery Responses (`/my/recovery-responses`).** Tabs by canonical RR status. Each row shows related Lost item name, canonical RR status badge (with `Submitted — Standby` derivation when applicable), submission time. Click → RR detail. Historical terminal RRs (e.g., `Resolved — Report Returned`, `Completed — Report Returned`, `Not a Match`, `Withdrawn`) remain visible (PRD FR-41). **My Recovery Responses contains only RRs the member submitted against other members' Lost reports** (PRD FR-49).
- **Recovery Response detail (`/my/recovery-responses/:id`).** Lost report summary, RR fields (where-found area + exact place, observed identifying details, date found, candidate image if provided), canonical status, per-RR message thread (PRD FR-47). Withdraw action available only while `Submitted` and not currently `Selected for Verification`. Read-only once terminal.
- **Account (`/account`).** Profile (read-only), Theme toggle, Logout. Email change and password change are out of scope per PRD — keep profile read-only and remove any affordance that would suggest they exist.

### 9.5 Administrator

- **Dashboard (`/admin`).** **Four** count tiles (PRD FR-33; correction #26): Pending Registrations, Pending Claims (Found-side), Items Awaiting Return (Found-side `Claim Approved`), Items in Verification (Lost-side `Verification Pending`). Each tile is a link to the corresponding queue. Audit is **not** one of the four operational queues (correction #26); it is cross-cutting, available from the relevant report, Claim, RR, or thread context and at `/admin/audit`. There is no on-dashboard activity feed.
- **Pending Registrations (`/admin/registrations`).** Table: name, email, self-declared role, registration timestamp, action. Action: `Approve` (primary), `Reject` (danger, opens reason modal, ≥ 5 chars).
- **Pending Claims (`/admin/claims`).** Table: claim ID, item name (link to item), claimant display name, submission time, action. Action: `Review` → claim review screen. **Found-side only** (correction #26).
- **Items Awaiting Return (`/admin/awaiting-return`).** Table: item name, claimant name, approval time, action. Action: `Confirm Returned`. **Found-side only** — Found reports in `Claim Approved`.
- **Items in Verification (`/admin/verifications`).** Table: Lost report name, Lost-report owner, currently selected responder, verification started at, action. Action: `Manage verification` → Lost-side verification screen. **Lost-side only** — Lost reports in `Verification Pending`.
- **Claim review (`/admin/claims/:id`).** Two-column on desktop, stacked on mobile:
  - Left column: item details (name, category, type, date, campus area, description, image if any, status, reporter).
  - Right column: claim details (claimant name, reason, identifying details, date lost, submission time).
  - Bottom strip: "Other pending claims on this item" — list each with claimant name and submission time. **Critical for competing claims UX** (Section 12).
  - Action bar (sticky on desktop): `Approve`, `Reject`. Reject opens reason modal (≥ 10 chars).
- **Item administration (`/admin/items/:id`).** Tabs: `Details`, `Audit Trail`, `Close`. (No dedicated comparison/compete tab; competing-Claim awareness lives in the bottom strip of `/admin/claims/:id` and in the Pending Claims queue.)
- **Audit trail (`/admin/items/:id/audit`).** Reverse-chronological list of all events for the report (PRD FR-31). Each event has: timestamp, actor, action verb, target, additional fields. Filters: action type, date range.
- **Confirm Returned — Found (`/admin/items/:id/return`).** Two-column layout. Left: item summary, approved claimant. Right: form. Default state: receiver = approved claimant (radio "Default receiver" selected). Substitute state: radio "Substitute receiver" → three required fields appear (name, authorization affirmation checkbox, relationship radio).
- **Lost-side verification (`/admin/lost/:id`).** Two-column layout. Left: Lost report summary (item details, owner, current Lost-report lifecycle status, selected responder). Right: the selected Recovery Response card with where-found, observed identifying details, candidate image, current canonical status, per-RR thread entry point. Action bar: **Record owner's Match Confirmed** | **Record owner's Not a Match** | **Confirm Returned (after Match Confirmed)** | **Administrator Close (pre-Match Confirmed; FR-48 Event 24)** | **Exceptional Administrator cancellation (post-Match Confirmed; FR-48 Event 25)**. Wording reflects owner-determines / Administrator-records (§4.7). The `Cancel workflow` action is **not** a generic pre-Match "cancel to Open"; it has been split into two named, scoped actions tied to specific PRD FR-48 events.
- **Confirm Returned — Lost (`/admin/lost/:id/return`).** Mirror of Found-side Confirm Returned (default = Lost-report owner; substitute same three fields).
- **Account management (`/admin/accounts`).** Search by name or email. Table: name, email, role state, registration date, action. Action: `Deactivate`. The PRD does **not** impose self-deactivation restrictions on administrators, nor a "last active administrator" minimum. If such governance is later desired, it requires a Product/Architecture decision.

### 9.6 Lost-side Recovery Response surfaces (member)

- **Submit Recovery Response (`/listings/:id/submit-recovery-response`).** Eligibility: Active member, item is Lost, status is Open or Verification Pending before Match Confirmed, member is not the Lost-report owner. CTA on the Lost item detail page reads `I may have found this item` (NOT "Submit claim").
- **My Recovery Responses (`/my/recovery-responses`).** Each row: related Lost report name, canonical RR status (with `Submitted — Standby` derivation when applicable), submission time, link to per-RR thread. Historical terminal RRs retained.
- **Recovery Response detail (`/my/recovery-responses/:id`).** Lost report summary, RR fields (where-found, observed identifying details, candidate image if provided, date found), canonical status, per-RR thread. Withdraw action available **only while** `Submitted` and not currently `Selected for Verification` (correction #31). Read-only once terminal.

---

## 10. Reporting UX (Section 7 of your PRD brief)

> Authority: PRD FR-6, FR-7, FR-8, FR-9, FR-10, FR-11.

### 10.1 Lost vs Found selection

The "Lost" or "Found" decision is encoded in the URL (`/report/lost` vs `/report/found`). The form opens with the type already chosen — the user does not need to pick it. The report form's heading reads "Report Lost Item" or "Report Found Item" respectively.

**Behavior.** No toggling between Lost and Found on the same form. If the user picked the wrong type, they can go back to the entry point and pick again — there is no in-form switch.

### 10.2 Form structure

The form is a **single-purpose page**, not a wizard. Sections:

1. **Heading.** "Report Lost Item" / "Report Found Item" + a one-line description ("Tell us what you lost so we can help you find it.").
2. **Required fields section.** Card containing: Name, Category, Description, Date, Campus area.
3. **Optional fields section.** Card containing: Exact place (Sensitive — flagged inline), Identifying details (Sensitive — flagged inline), Image.
4. **Footer.** `Cancel` (tertiary), `Submit report` (primary).

A **Sensitive** flag appears inline next to fields that are hidden from non-owners: "This is hidden from other members." See Section 11.

### 10.3 Fields

| Field | Required | Constraint | Notes |
|---|---|---|---|
| Name | yes | 1–80 chars | Single-line text |
| Category | yes | enum (PRD FR-8) | Native select |
| Description | yes | 10–2000 chars | Textarea with live counter |
| Date (Lost) | yes | last 365 days, not future | Native date picker |
| Date (Found) | yes | last 30 days, not future | Native date picker |
| Campus area | yes | enum | Native select |
| Exact place | no | 0–200 chars | Single-line, marked Sensitive |
| Identifying details | no | 0–500 chars | Textarea, marked Sensitive |
| Image | no | JPEG/PNG/WebP, ≤ 5 MB | Drag-drop + picker |

### 10.4 Edit, delete, withdraw

The reporter's edit/delete/Withdraw actions are **type-aware** — Found and Lost reports follow different gates. Both report types share the same audit story (PRD FR-19, FR-20).

#### Edit (Found and Lost)

- Available for the reporter while the report is active per PRD FR-9.
- **Blocked when** the report is `Returned` **or** `Closed`. (Not "until Returned" — once `Returned` or `Closed` is reached, edit is unavailable.)
- The Edit screen is the same form, pre-filled. Each edit is recorded in the audit trail with actor, timestamp, and a snapshot of changed fields (PRD FR-19).

#### Delete

- **Found report.** Hard delete is allowed only when the report is `Open` **and** no Claim exists. Confirmation modal: "Delete this report? This cannot be undone. The report will be removed from listings."
- **Lost report.** Hard delete is allowed only when the report is `Open` **and** no Recovery Response exists. The Lost rule is expressed in terms of `Recovery Response`s, **not** Claims.
- Once a Claim (Found) or RR (Lost) exists, the reporter must use Withdraw instead — hard delete is blocked.

#### Withdraw

Withdraw transitions the report to `Closed` and is recorded in the audit trail (PRD FR-20).

- **Found report Withdraw.** Allowed while status is `Open` **or** `Claim Requested`. Blocked at `Claim Approved`, `Returned`, and `Closed`. Confirmation modal: "Withdraw this report? It will be removed from listings. The administrator can still see it in history."
- **Lost report Withdraw.** Allowed while status is `Open` **or** `Verification Pending` **before** any selected RR reaches `Match Confirmed`. Once a selected RR is `Match Confirmed`, the Lost-report owner does **not** see an enabled Withdraw action. Blocked after `Match Confirmed`, and blocked at `Returned` and `Closed`. Confirmation modal is the same wording as Found-withdraw.

#### Closure-for-lost-by-administrator (separate from reporter Withdraw)

When the reporter cannot withdraw (i.e. after `Match Confirmed`), only an Administrator may end the Lost workflow. Two distinct paths exist:

- **Administrator Close (pre-Match Confirmed, FR-48 Event 24).** Lost report `Verification Pending → Closed`; selected RR `Selected for Verification → Resolved — Report Closed`; other non-terminal RRs `Submitted → Resolved — Report Closed`. Threads read-only.
- **Exceptional Administrator cancellation (post-Match Confirmed, FR-48 Event 25).** Lost report `Verification Pending → Closed`; selected RR `Match Confirmed → Resolved — Report Closed`; other non-terminal RRs `Submitted → Resolved — Report Closed`. Threads read-only. This is **not** described as the owner "withdrawing"; it is an Administrator-only exceptional cancellation that operates after `Match Confirmed`.

There is **no** generic Administrator "Cancel workflow → Open" action. The canonical `Verification Pending → Open` path is `Not a Match` (owner determines; Administrator records), which uses FR-48 Event 19 (RR-side) plus FR-48 Event 28 (Lost-report-side reversion to `Open`).

### 10.5 Submission outcome

- Success: inline confirmation, then navigate to the **own-report detail** at `/my/reports/:id`. The reporter's own report belongs under `My Reports`, not `Browse` (PRD FR-49 four-view partition). The member's own report is **not** surfaced in their `Browse` results.
- Validation error: scroll to first error, focus first invalid field, show error summary.
- Server error: show "Something went wrong on our side. Try again." Preserve user input.

---

## 11. Item Detail & Information Visibility (PRD Section 4.11)

PRD FR-13, FR-37, FR-38, FR-39 are the source of truth. This section translates them into rendering rules.

### 11.1 Visibility matrix

PRD FR-39 is the final authority. The matrix below is for **Found reports** and **Lost reports** together. Where a field has no per-Claim or per-RR counterpart on the report type, the row is marked `—` for that report type. Per-Claim and per-RR rows are scoped — see the row label.

| Field | Anonymous | Authenticated, no relationship | Found-report owner / finder | Claimant (own) | Recovery responder (own) | Lost-report owner | Administrator |
|---|---|---|---|---|---|---|---|
| name | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| category | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| date (lost/found) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| campus area (enum) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| status (Found lifecycle) | ✓ (Open/Claim Requested/Claim Approved only) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (all) |
| status (Lost lifecycle) | ✓ (Open/Verification Pending only) | ✓ | — | — | ✓ | ✓ | ✓ (all) |
| type (Lost/Found) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| description | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| image | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| reporter display name | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| exact place (Sensitive, on report) | — | — | ✓ (own Found) | — | — | ✓ (own Lost) | ✓ |
| identifying details (Sensitive, on report) | — | — | ✓ (own Found) | — | — | ✓ (own Lost) | ✓ |
| member-facing status history | — | ✓ | ✓ | ✓ (own) | ✓ (own) | ✓ (own) | ✓ |
| own Claim reason & identifying details | — | — | — | ✓ (own) | — | — | ✓ |
| other claimants' reason / identifying details | — | — | — | — | — | — | ✓ |
| per-Claim thread content | — | — | ✓ (scoped to Claims on own Found) | ✓ (own Claim) | — | — | ✓ |
| own RR (where-found / observed details / candidate image / status) | — | — | — | — | ✓ (own) | ✓ (scoped to own Lost) | ✓ |
| other RRs on same Lost | — | — | — | — | — | ✓ (own Lost) | ✓ |
| per-RR thread content (own response) | — | — | — | — | ✓ (own RR) | ✓ (scoped to own Lost) | ✓ |
| other responders' per-RR threads on own Lost | — | — | — | — | — | ✓ (own Lost) | ✓ |
| substitute receiver fields | — | — | — | — | — | — | ✓ |
| full audit trail | — | — | — | — | — | — | ✓ |

**Critical notes (PRD FR-39 final):**

- An **unrelated authenticated member** sees description, image, reporter display name, and member-facing status — but **no** Sensitive Fields, **no** Claim content, **no** RR content, **no** thread content, **no** audit.
- The **Found-report owner / finder** does **NOT** see claimant reason or identifying details, even though they have access to per-Claim threads.
- The **Recovery responder** sees only their own RR + thread. They do NOT see competing responders' RRs or threads, and they do NOT see the Lost report's Sensitive Fields just because they submitted an RR.
- The **Lost-report owner** is the only non-Administrator who gets cross-response visibility: they see every RR + every per-RR thread on their own Lost report.

A "Sensitive" inline flag appears next to fields that are hidden from non-owners, with helper text: "This is hidden from other members." This explains the *design* of the system (PRD §2.1 Emotional: trust).

### 11.2 Listing-page rendering

Listing pages always render the **public summary fields** (PRD FR-38) regardless of role. Sensitive fields and authentication-gated fields never appear in the listing view.

### 11.3 Detail-page rendering

Detail pages render the appropriate subset from the visibility matrix above. The page is composed of stacked sections:
1. **Header.** Item name (heading), type badge, status badge.
2. **Summary.** Category, date, campus area.
3. **Description** (if visible).
4. **Image** (if present and visible).
5. **Location.** Campus area (always). Exact place (only when visible).
6. **Identifying details** (only when visible).
7. **Reporter** (only when visible).
8. **Status history (member-facing)** (only when visible). A short list: current status + last-action timestamp + the most recent transition.
9. **Audit trail** (admin only) — see Section 17.
10. **Actions.** Role-dependent: Submit claim (Active member + Found + status Open/Claim Requested + no Pending claim from this user); Edit / Delete / Withdraw (reporter, depending on status); Administrator actions.

### 11.4 Permissions are intentional

The UX reinforces that sensitive fields are protected **by design**. When a field is hidden, an inline "Hidden from other members" label appears next to the section heading.

**Visibility does not "unlock" dynamically when a member submits a Claim or a Recovery Response.** Per PRD FR-39:

- Submitting a Claim on a Found report does **not** reveal the report's Sensitive Fields (exact place, identifying details) to the claimant. The claimant sees only their own Claim details and the per-Claim thread. Sensitive Fields on the Found report remain hidden from the claimant; only the Found-report owner and Administrators see them.
- Submitting a Recovery Response on a Lost report does **not** reveal the report's Sensitive Fields to the responder. The responder sees only their own RR fields (where-found, observed identifying details, date found, candidate image) and their own per-RR thread. Sensitive Fields on the Lost report remain hidden from non-owner responders.

This is the **explicit correction** of an earlier revision that described a "+ now visible to you" affordance triggered by Claim submission. That affordance violates FR-37 (sensitive fields visible to owner + Administrator only). The affordance is removed across all surfaces (claim detail, RR detail, item detail, thread rendering, summary cards, audit previews, email previews).

---

## 12. Claim UX and Competing Claims

> Authority: PRD FR-15, FR-16, FR-17, FR-18, FR-22, D3.

### 12.1 Claim form (`/listings/:id/claim`)

**Eligibility check (server + UX):**

- Active member (otherwise access screen).
- Item is a Found item.
- Item status is `Open` or `Claim Requested`.
- User does not have a Pending claim on the item already (PRD FR-15).

If any eligibility check fails, the CTA "Submit claim" is disabled with explanatory tooltip text. Re-enabling happens only when the state changes (server returns 403 → access screen).

**Fields.**

| Field | Required | Constraint |
|---|---|---|
| Reason | yes | 20–1000 chars, textarea |
| Identifying details | yes | 10–500 chars, textarea |
| Date lost | yes | last 365 days, not future |

**Submission outcome.** Success navigates to claim detail (`/my/claims/:id`). Toast confirms. Item status transitions Open → Claim Requested if it was Open (PRD FR-22).

### 12.2 Claim detail (member view)

- Header: claim ID, item name (link to the Found report), status badge.
- Body: claim reason, identifying details, date lost, submission timestamp.
- Below: per-Claim message thread (§13). The thread is **writable only while the claim is `pending` and the Found report is not `returned` or `closed`**. Once the Claim is `approved`, the Claim is `rejected`, or the Found report is `returned`/`closed`, the per-Claim thread becomes **read-only** (§13.5). The member sees the appropriate read-only notice with one of the four §13.5 messages; message history remains visible.
- **Visibility.** The claimant sees only their own Claim's reason and identifying details. They do **not** see Sensitive Fields on the Found report (PRD FR-39; §11.4).

### 12.3 Administrator review screen (`/admin/claims/:id`)

Two-column on desktop, stacked on mobile.

- **Left column.** Item details: name, type badge, category, date, campus area, description, image, status, reporter display name, status history.
- **Right column.** Claim details: claimant display name, reason, identifying details, date lost, submission timestamp.
- **Bottom strip.** "Other pending claims on this item" — a list of each other Pending claim on the item. For each: claimant display name, submission time. Click → opens that claim's review screen in a side panel (does not lose the current claim context).
- **Action bar.** Sticky on desktop. Buttons: `Approve` (primary), `Reject` (danger).
- **Reject.** Opens modal asking for a reason (≥ 10 chars). Reject reason is recorded in the audit trail (PRD FR-18) and surfaced in the rejection email (PRD FR-29).

### 12.4 Approving a claim with no competition

If no other Pending claims exist on the item, clicking `Approve` opens a one-step confirmation: "Approve this claim? The item will move to *Claim Approved*." Confirm → claim and item status update; emails fire.

### 12.5 Approving a claim with competition (PRD D3, FR-17) — **CRITICAL UX**

When other Pending claims exist on the item, the `Approve` action is visually elevated to convey consequence:

- **Pre-approval warning banner.** Persistent calm info-soft alert above the action bar: "Approving this claim will automatically reject *{N}* other pending claim{plural} on this item. This cannot be undone." Uses `{colors.light.info-soft}` / `{colors.dark.info-soft}` — not a loud amber alert — to honor the warm-and-trustworthy tone (DESIGN.md Brand).
- **Approve button.** `danger-strong` variant (red, prominent) — emphasizing irreversible consequence, not loud color.
- **Two-step confirmation.** First click opens a modal that:
  - Restates the consequence in plain English: "You're about to approve *{Claimant A}'s* claim. The other *{N}* pending claim{plural} will be automatically rejected. No further action can undo this."
  - Names the losing claimants (display names) so Riley knows exactly who is affected.
  - Confirms via `Approve claim` button.
- **Post-approval outcome.** The screen transitions to a "Result" view:
  - Approved claim highlighted in green with `Approved` status.
  - Each auto-rejected claim listed with `Rejected` status and the audit reason ("another claim was approved for this item"). The claimant-facing email body uses the softer wording from §4.4 ("Another claim on this item was approved. Contact the administrator if you think this is a mistake.").
  - Link to item audit trail.
- **Concurrent action handling.** If Riley clicks `Approve` and another administrator approves first, Riley sees the conflict state from §6.4.

### 12.6 Rejecting a claim

- `Reject` opens a modal with a reason field (≥ 10 chars).
- Modal text: "Reject this claim? Provide a short reason — this will be recorded in the audit trail and shown to the claimant."
- On confirm: claim status → `Rejected`. Email fires (PRD FR-29). Item status returns to `Open` if no other Pending claims remain (PRD FR-22).

### 12.7 Member's claim status badges

| Status | Badge text | Icon | Color token |
|---|---|---|---|
| Pending | `Pending` | hourglass | `{colors.status-claim.pending}` |
| Approved | `Approved` | check | `{colors.status-claim.approved}` |
| Rejected (administrator) | `Rejected` | x | `{colors.status-claim.rejected}` |
| Rejected (auto) | `Rejected — auto` | x-circle | `{colors.status-claim.rejected}` |

The "Rejected — auto" badge differentiates administrator-rejected from auto-rejected (PRD D3) so members can see the distinction without us saying "another claim was approved for this item" verbatim on their claim card. The auto-rejection explanation is on the rejection email and on the claim detail screen (Section 4.4).

---

## 13. Per-Claim Message Thread

> Authority: PRD FR-26, OQ-4.

### 13.1 Participants and visibility

- **Visible to:** claimant, finder (report owner of the Found item), and all administrators (PRD FR-26).
- **Hidden from:** members who are neither claimant nor finder.
- **Created:** when the first message is posted. Implementation choice is deferred to Architecture (PRD FR-26 "implementation choice, but the thread is visible from claim creation onward"). UX renders the thread component from the moment the claim exists; empty state says "No messages yet. Be the first to ask a question."

### 13.2 Thread layout

A vertical list of messages, oldest at top, newest at bottom. Each message:
- Author display name + role tag (e.g., "Maya (Claimant)", "Sam (Finder)", "Riley (Administrator)").
- Timestamp (full date + time on first message of a day, time-only within the same day).
- Body (plain text, preserves line breaks, no formatting).

### 13.3 Composer

- Single textarea, plain text, 2000-char limit with live counter.
- **Plain text only.** No attachments, no rich text, no images, no markdown.
- **Send button** is enabled when there are ≥ 1 and ≤ 2000 characters.
- **No typing indicators.** (PRD FR-26 — explicitly out of scope.)
- **No read receipts.** (PRD FR-26 — explicitly out of scope.)
- **No real-time updates.** The thread refreshes on page load and on send. Members do not see new messages without reloading.

### 13.4 Empty / error / permission states

- **Empty.** "No messages yet. Be the first to ask a question."
- **Permission denied.** "Only the claimant, finder, and administrators can see this thread."
- **Send error.** "We couldn't send your message. Try again." Composer retains input.
- **Server error (history fetch).** "We couldn't load the conversation. Try again."

### 13.5 Read-only logic (OQ-4) — final

The per-Claim thread is **read-only** as soon as any of these conditions becomes true:

- The claim is `approved`.
- The claim is `rejected`.
- The item is `returned`.
- The item is `closed`.

While the claim is `pending` (and the item is not returned/closed), the thread is writable for the claimant, the finder (reporter of the Found item), and administrators.

**Rationale.** The thread exists to coordinate the *active* claim. Once a claim is `approved`, the active claim is over — the next stage is physical handoff, which is arranged out-of-band by the administrator. Allowing further messages on an approved claim muddies the record (the read-only notice tells the user "your claim was approved" rather than "we are still discussing it"). The thread closes at `returned` and `closed` because the item lifecycle has ended; `rejected` because the claim is terminal.

> **Read-only notice variants** (mirrored in `13-claim-detail.html`):
>
> - Approved: *"This thread is read-only because this claim has been approved. An administrator will arrange the handoff."*
> - Rejected: *"This thread is read-only because this claim has been rejected."*
> - Returned: *"This thread is read-only because the item has been returned."*
> - Closed: *"This thread is read-only because this report has been closed."*
>
> Each variant ends with: *"Existing messages remain available for reference, but no new messages can be posted."*

### 13.5b Per-Recovery-Response Thread — Read-only Lifecycle

> Authority: PRD FR-47, FR-43, FR-44, FR-45, FR-50. Mirrors §13.5 for the Lost-side.

The per-RR thread is **read-only** as soon as any of these conditions becomes true:

- The RR has reached a **terminal canonical status**: `Not a Match`, `Withdrawn`, `Resolved — Report Returned`, `Resolved — Report Closed`, or `Completed — Report Returned`. (`Match Confirmed` is **non-terminal** — physical handoff is still pending — so the thread remains writable while `Match Confirmed` is the current status.)
- The parent Lost report is `Returned` (PRD FR-45) or `Closed` (PRD FR-11, FR-50).

While the RR is `Submitted`, `Selected for Verification`, or `Match Confirmed` AND the Lost report is `Open` or `Verification Pending`, the thread is **writable** for the authorized participants below — `Selected for Verification` and `Match Confirmed` are not thread-locking statuses.

**Thread participants (per PRD FR-47).** One thread per Recovery Response. Participants:

- The **Lost-report owner** (Maya).
- The **responder** who submitted that Recovery Response (Sam, Pat, etc.).
- **All Administrators** (Riley and any other administrator).

While the thread is writable, all authorized participants above may post. `Selected for Verification` and `Match Confirmed` do not change which participants may post — they only change the RR status.

**Privacy holds at all times:**

- A responder sees only their own RR's thread. Competing responders cannot see each other's threads.
- The Lost-report owner sees every per-RR thread on their own Lost report (and only those).
- Administrators see all per-RR threads.

> **Read-only notice variants** (mirrored in `19-recovery-response-detail.html`):
>
> - Not a Match: *"This thread is read-only because this response was not a match."*
> - Withdrawn: *"This thread is read-only because you withdrew this response."*
> - Resolved (parent Returned or Closed): *"This thread is read-only because the parent Lost report has been resolved."*
> - Terminal (Completed / Resolved): *"This thread is read-only because the recovery response is in a terminal state."*
>
> Each variant ends with: *"Existing messages remain available for reference, but no new messages can be posted."*
>
> **There is no read-only notice for `Selected for Verification` and no read-only notice for `Match Confirmed`.** A `Match Confirmed` informational message may render — e.g., "Owner confirmed this is a match. Physical handoff is pending. You can continue using this thread to coordinate the return." — but it must **not** imply the thread is locked.

State-layer enforcement lives in `mockups/assets/state.js` (`isThreadReadOnly`, `getThreadLockReason`, `postMessage`); UI in `mockups/member/19-recovery-response-detail.html`. Bypass at the UI layer is not possible because `postMessage` short-circuits when the thread is read-only.

### 13.6 Notifications (PRD FR-30)

Sending a message does **not** generate an email. Members learn about new messages only when they revisit the thread. This is explicit in the PRD; UX reinforces it with no in-app notification surface.

### 13.7 Lost-side Email Events (PRD FR-46 Events 4–8)

> Authority: PRD FR-46, FR-30. UX owns the rendering and copy semantics of these events; architecture owns the transport.

The PRD lists exactly **eight** notification events. Events 1–3 cover registration and Found-side Claim flow (covered in §16 and §12). Events 4–8 cover the Lost-side Recovery Response flow:

| Event | Trigger (status transition) | Recipient | Subject (UX copy direction) | What it does NOT contain |
|---|---|---|---|---|
| **4. New Recovery Response on my Lost report** | RR → `Submitted` | Lost-report owner (Maya) | "Someone responded to your Lost report — {item name}" | Responder contact info, full Recovery Response evidence, responder's identifying details (the email itself does **not** contain them; the Lost-report owner can review the submitted Recovery Response securely after signing in through `My Reports → Review Responses`) |
| **5. My response was selected for verification** | RR → `Selected for Verification` | The selected responder (Sam) | "Your response was selected for verification — {item name}" | Anything about Maya beyond her display name; the RR's own identifying details |
| **6. Not a Match** | RR → `Not a Match` | The responder whose RR was rejected (Sam) | "We couldn't match your response — {item name}" | The owner's identity, the audit reason verbatim, the owner's identifying details |
| **7. Lost Returned** | Lost report → `Returned` | Lost-report owner (Maya) | "Your Lost report has been marked returned — {item name}" | Substitute receiver details beyond Maya's own default receiver; any responder PII |
| **8. Successful completion** | RR → `Completed — Report Returned` AND Lost report → `Returned` (atomic) | The matched responder (Sam) | "Your response helped return this item — {item name}" | The owner's contact info, the audit reason verbatim |

**Critical rules.**

- **Event 4 fires on every RR → `Submitted` transition.** It is not a digest. If two responders submit, Maya receives two Event 4 emails. The Lost-report owner must know each time a new response arrives.
- **Event 5 fires only to the selected responder** (e.g., Sam). Standby responders (e.g., Pat) do not receive Event 5 — they remain in `Submitted — Standby` and only learn of their disposition when they next visit their `My Recovery Responses` view.
- **Event 6 fires only to the responder whose RR is rejected.** The owner (Maya) does not receive a "Not a Match" email — Maya already knows because she made the determination (or told Riley to record it).
- **Event 7 fires only to the Lost-report owner.** Not to responders.
- **Event 8 fires only to the matched responder.** Standby responders who auto-resolve to `Resolved — Report Returned` do not receive Event 8. They discover their terminal status the next time they visit `My Recovery Responses`.
- **No email on RR → `Withdrawn`**, **no email on RR → `Resolved — Report Closed`**, **no email on RR submission cancellation** — these are member-initiated or admin-moderation states, not user-pending events.
- **No email on Lost-report → `Closed` (withdrawal or moderation)** — PRD FR-30's "no other notifications" rule applies.
- **No email on RR transitions during `Verification Pending` aside from the events above.** Specifically, the `Match Confirmed` recording event itself does not email either party — only `Returned` emails via Events 7 and 8.

**Reuse with Found-side events.** The PRD does not duplicate copy between FR-46 and the Found-side notification events (FR-27, FR-28, FR-29). UX copy for Lost-side events follows the same warmth-and-clarity register as Found-side emails; the templates themselves are an architecture decision (PRD A6).

---

## 14. Confirm Returned UX

> Authority: PRD FR-23, FR-24, FR-25, FR-45.

Returned always requires Administrator confirmation of physical return. **Found-side** uses the approved claimant as the default receiver; **Lost-side** uses the Lost-report owner. Substitute receiver applies symmetrically to both flows.

**Identity verification is not part of FindBack.** The Administrator confirms the physical handoff and records the receiver. No identity check, identity confirmation, identity validation, administrator identity judgment, administrator identity attestation, or special identity-check workflow is performed or implied.

### 14.1 Entry points

- **Found-side.** From `/admin/awaiting-return`, click `Confirm Returned` on a row → `/admin/items/:id/return`.
- **Lost-side.** From `/admin/verifications` → `/admin/lost/:id` (verification screen), once the selected RR is in `Match Confirmed`, click `Confirm Returned` → `/admin/lost/:id/return`.

### 14.2 Layout

Two-column on desktop, stacked on mobile.

- **Left column (Found).** Item summary (name, type, category, date, campus area, image if any), approved claimant's name, claim submission timestamp, approval timestamp.
- **Left column (Lost).** Lost report summary, Lost-report owner name, currently selected Recovery Response, Match Confirmed timestamp, currently selected RR's per-RR thread entry point.
- **Right column.** The form.

### 14.3 Form

**Receiver radio group.**

- `Default receiver — {Owner / claimant name}` (selected by default).
- `Substitute receiver`.

**Default receiver state.** Confirm button is `Confirm Returned`. Confirmation modal: "Mark this item as returned to *{Name}*? This is final."

**Substitute receiver state.** Three required fields appear when selected:
- `Substitute receiver's name` (1–80 chars).
- `Authorization affirmation` (single checkbox, label = "The default receiver has authorized this person to collect the item on their behalf.").
- `Relationship` (radio group: Friend / Family Member / Colleague / Classmate / Other).

If any field is missing, `Confirm Returned` is disabled with a tooltip pointing to the first missing field. (PRD FR-25: "the system refuses to confirm Returned without a recorded receiver.")

**Confirmation modal (substitute).** "Mark this item as returned to *{Substitute name}*, a {Relationship} of the default receiver, with authorization? This is final."

### 14.4 No-receiver-no-returned guard (PRD FR-25)

If the administrator reaches the confirmation modal without selecting default-or-substitute (e.g., via direct URL manipulation), the system blocks at the form level with an inline error: "Pick a receiver before confirming Returned." The `Confirm Returned` button is disabled until the receiver is valid.

### 14.5 Outcome

On confirm:
- **Found-side.** Found report status → `Returned` (terminal). Approved Claim remains `Approved`. Audit trail records the action with confirming administrator, receiver (default or substitute fields), and timestamp (PRD FR-31 event 6/7). **No email** (PRD FR-30: Found-side Returned is not a notification event).
- **Lost-side.** Lost report status → `Returned` (terminal). Selected matched RR transitions `Match Confirmed → Completed — Report Returned`. Every other non-terminal RR transitions to `Resolved — Report Returned`. Audit trail records the action with confirming administrator, receiver (default or substitute), and timestamp (PRD FR-48 events 21/22 + 26 + 30). **Emails fire atomically**:
  - **PRD FR-46 Event 7** ("Lost Returned") to the Lost-report owner.
  - **PRD FR-46 Event 8** ("Successful completion") to the matched responder. Event 8 covers BOTH `Match Confirmed → Completed — Report Returned` (RR-side) AND `Verification Pending → Returned` (Lost-report-side) atomically.
  - Standby responders do **not** receive Event 8. Their RR has auto-resolved to `Resolved — Report Returned` (PRD FR-48 Event 26); they learn of their disposition by visiting `My Recovery Responses`.
  - Owner of the Lost report does **not** receive Event 8 (Event 8 is responder-only). Owner receives Event 7.

Items disappear from active listings.

The administrator lands back on the originating queue (Awaiting Return for Found-side, Items in Verification for Lost-side), which now shows the updated list.

---

## 15. Administrator Dashboard and Queues

> Authority: PRD FR-3, FR-33, FR-34, FR-35, FR-36, FR-50.

### 15.1 Dashboard (`/admin`)

- **Four count tiles** at the top, each linking to the corresponding queue (PRD FR-33; correction #26):
  1. Pending Registrations: count + label.
  2. Pending Claims (Found-side): count + label.
  3. Items Awaiting Return (Found-side, `Claim Approved`): count + label.
  4. Items in Verification (Lost-side, `Verification Pending`): count + label.
- Audit is **not** one of the four operational queues (correction #26). It is cross-cutting, available from any item / Claim / RR detail and at `/admin/audit`. There is no on-dashboard activity feed.
- **Empty states.** If all counts are zero, each tile shows "All caught up." with a subtle check icon. Riley can still navigate to the queues.

### 15.2 Pending Registrations queue (`/admin/registrations`)

- Table: name, email, self-declared role, registration timestamp, action.
- Action: `Approve` (primary), `Reject` (danger — opens reason modal, ≥ 5 chars).
- Sort: oldest first by default.
- Empty state: "No pending registrations." plus a one-line note: "When someone new registers, they appear here."

### 15.3 Pending Claims queue (`/admin/claims`) — Found-side only

- Table: claim ID, item name (link), claimant display name, submission time, action.
- Action: `Review` → claim review screen.
- Sort: oldest first by default.
- Empty state: "No pending claims."

### 15.4 Items Awaiting Return queue (`/admin/awaiting-return`) — Found-side only

- Table: item name, claimant name, approval time, action.
- Action: `Confirm Returned`.
- Sort: oldest first by default.
- Empty state: "No items are awaiting return."

### 15.5 Items in Verification queue (`/admin/verifications`) — Lost-side only

- Table: Lost report name, Lost-report owner, currently selected responder, verification started at, action.
- Action: `Manage verification` → Lost-side verification screen (`/admin/lost/:id`).
- Empty state: "No items are in verification."

### 15.6 Loading / error / permission states

- **Loading.** Each queue renders a skeleton table.
- **Error.** Calm message + retry button. Logs are server-side.
- **Permission.** Non-administrator hitting `/admin/*` routes sees the access screen (Section 4.5), but the message can be more specific: "This area is for administrators only."

### 15.7 Account management (`/admin/accounts`)

- Search by name or email.
- Table: name, email, role state, registration date, action.
- Action: `Deactivate` (administrator-only). The PRD does **not** impose self-deactivation restrictions on administrators, nor a "last active administrator" minimum. If such governance is later desired, it requires a Product/Architecture decision.
- Audit trail records deactivation with administrator and timestamp (PRD FR-31).

---

## 16. Account Lifecycle UX

> Authority: PRD FR-1, FR-2, FR-3, FR-4, FR-5.

### 16.1 Registration (`/register`)

- Form: name, email, password, confirm password, self-declared role.
- Validation: email format + server-side uniqueness; password ≥ 8 chars, ≥ 1 letter, ≥ 1 number (client hint, server authoritative).
- On success: redirect to `/pending-registered` (a confirmation page) with copy: "Your account is pending administrator approval. You'll get an email when you're approved." No automatic login.

### 16.2 Login (`/login`)

- Form: email, password.
- Outcomes:
  - Active → `/home`.
  - Pending → `/pending` with banner.
  - Rejected → error message (neutral, no reason exposed; PRD FR-3, FR-4).
  - Deactivated → error message (neutral, same wording as Rejected).
  - Invalid credentials → "Email and password don't match. Try again."

### 16.3 Pending (`/pending`)

- Banner: "Your account is pending administrator approval."
- Single action: `Log out`.
- All other nav items are hidden.

### 16.4 Rejected / Deactivated (login attempt)

- Neutral error on the login screen.
- Form remains usable (so the user can retry with corrected credentials in case of typo).
- No email is sent to a Rejected user that would expose the rejection reason (PRD FR-3).

### 16.5 Logout

- Single click from the Account menu. Clears session. Routes to `/`.

### 16.6 Account settings (`/account`)

- Read-only profile (name, email, role).
- Theme toggle (Section 19).
- Logout button.
- **No email change, no password change** (not in scope; PRD is silent; introducing them would be scope creep).

---

## 17. Audit Trail UX (Administrator-Only)

> Authority: PRD FR-31, FR-32.

### 17.1 Access

- Administrators only. PRD FR-32 explicitly forbids members from seeing audit entries.
- Surface: `/admin/items/:id/audit`.

### 17.2 Layout

A reverse-chronological list. Each row is an event.

- **Timestamp.** Full date + time, in the organization's locale (en-US — i18n deferred per PRD §5).
- **Actor.** Display name + role tag (Member / Administrator).
- **Action verb.** Plain-English verb (`created`, `edited`, `claimed`, `approved`, `rejected`, `auto-rejected`, `returned`, `withdrawn`, `closed`, `registered`, `deactivated`, `message posted`).
- **Target.** Item or claim identifier.
- **Additional fields.** Per PRD FR-31: claim reason, identifying details (sensitive but admin-visible), substitute receiver fields, etc. These render as a small expandable row ("Show details") so the audit trail stays scannable.

### 17.3 Filters

- Action type filter (multi-select).
- Date range filter.
- Actor filter.

### 17.4 Differentiation of event types

Each event has a small icon and a left border accent in the status color, so Riley can scan by event class without reading:

| Event | Icon | Accent color |
|---|---|---|
| Report created | plus-circle | `{colors.status-report.open}` |
| Report edited | edit | `{colors.light.on-surface-variant}` |
| Report withdrawn (Found, by reporter) | archive | `{colors.status-report.closed}` |
| Report withdrawn (Lost, by reporter) | archive | `{colors.status-report.closed}` |
| Report closed by admin (Found) | archive-x | `{colors.status-report.closed}` |
| Report closed by admin (Lost, normal) | archive-x | `{colors.status-report.closed}` |
| Report cancelled after Match Confirmed (Lost, exceptional) | archive-x | `{colors.status-report.closed}` |
| Claim submitted | inbox | `{colors.status-claim.pending}` |
| Claim approved | check | `{colors.status-claim.approved}` |
| Claim rejected (admin) | x | `{colors.status-claim.rejected}` |
| Claim auto-rejected | x-circle | `{colors.status-claim.rejected}` |
| Returned (Found default) | package-check | `{colors.status-report.returned}` |
| Returned (Found substitute) | package-check (variant) | `{colors.status-report.returned}` |
| Returned (Lost default) | package-check | `{colors.status-report.returned}` |
| Returned (Lost substitute) | package-check (variant) | `{colors.status-report.returned}` |
| Registration approved | user-check | `{colors.status-account.active}` |
| Registration rejected | user-x | `{colors.status-account.rejected}` |
| Account deactivated | lock | `{colors.status-account.deactivated}` |
| Message posted in per-Claim thread | message-circle | `{colors.light.on-surface-variant}` |
| RR submitted | inbox | `{colors.status-rr.submitted}` |
| RR selected for verification | eye | `{colors.status-rr.selected}` |
| RR Match Confirmed (recorded by admin) | check | `{colors.status-rr.matchConfirmed}` |
| RR Not a Match (recorded by admin) | x-circle | `{colors.status-rr.notAMatch}` |
| RR withdrawn by responder | undo | `{colors.status-rr.withdrawn}` |
| RR transition to Completed — Report Returned | package-check | `{colors.status-rr.completed}` |
| RR transition to Resolved — Report Returned | package | `{colors.status-rr.resolvedReturned}` |
| RR transition to Resolved — Report Closed | archive | `{colors.status-rr.resolvedClosed}` |
| Lost Verification Pending → Open (Not a Match) | refresh | `{colors.status-report.open}` |
| Message posted in per-RR thread | message-circle | `{colors.light.on-surface-variant}` |

### 17.5 Member-facing status history

Per PRD FR-32, members see a *member-facing* status history on their own items: current status and last-action timestamp. UX implementation:

- A short list (most recent first, max 3 entries).
- Each row: timestamp, status label, "by {actor}" (no audit verb, no additional fields).
- A "View full status" disclosure at the bottom — but PRD FR-32 says the full audit trail is admin-only, so the disclosure is *not* shown to members. Members see only the member-facing status history.

### 17.6 Audit access log (PRD §10 Observability)

The PRD requires audit-trail reads to be logged separately from the audit trail. UX does not surface this log to administrators; it is a backend concern. (If exposed later, it would be in `/admin/access-logs`, but that surface is not in scope.)

---

## 18. Validation Rules

| Surface | Validation |
|---|---|
| Register | email format + uniqueness; password ≥ 8 chars + ≥ 1 letter + ≥ 1 number; confirm password matches; role selected |
| Login | email format; non-empty password |
| Report form (lost) | name 1–80; category selected; description 10–2000; date ≤ 365 days ago, not future; campus area selected; exact place ≤ 200 (optional); identifying details ≤ 500 (optional); image ≤ 5 MB, type JPEG/PNG/WebP |
| Report form (found) | same as lost, except date ≤ 30 days ago, not future |
| Edit report | same as create |
| Claim form | reason 20–1000; identifying details 10–500; date lost ≤ 365 days ago, not future |
| Substitute receiver | name 1–80; authorization checkbox required; relationship selected |
| Administrator reject reason (registration) | ≥ 5 chars |
| Administrator reject reason (claim) | ≥ 10 chars |
| Message | 1–2000 chars |

Validation runs **client-side for UX feedback** and **server-side for authoritative enforcement** (PRD §10 Security).

---

## 19. Theme Switching

UX-decided in the Discovery step:

- **Initial.** Respects `prefers-color-scheme` at first visit.
- **Toggle placement.** The theme toggle is an **icon button in the topbar** of every page, present on all surfaces (anonymous listings, member pages, admin pages). It is not inside the Account menu — topbar placement was chosen so the toggle is reachable without first opening an account menu, and so the same control is available at every auth state.
- **Toggle UI.** A single 44×44 icon button. The icon reflects the currently active state: **sun** for Light, **moon** for Dark, **half-filled circle** for System. Clicking the icon opens a popover menu (`role="menu"`) directly below the button (right-aligned) with three `menuitemradio` items: `System`, `Light`, `Dark`. The active item is highlighted via `aria-checked="true"` and the `--fb-brand-primary-soft` background.
- **Accessibility.** The trigger has `aria-haspopup="menu"`, `aria-expanded`, and `aria-label="Theme: <state>. Click to change."` (updated as the state changes). Menu items are keyboard-navigable (Tab to enter, Arrow Up/Down to move, Home/End for first/last, Enter to select, Escape to close). Escape returns focus to the trigger.
- **Close behavior.** Click an item to select and close. Click outside the menu to close. Press Escape to close.
- **Persistence.** Choice is stored in `localStorage` (key: `findback.theme`). The choice persists across sessions and overrides the OS preference.
- **No FOUC.** The theme is set as an inline `<html data-theme>` attribute before the page renders, so the initial paint matches the user's preference. Tokens in DESIGN.md are bound to `[data-theme="light"]` and `[data-theme="dark"]`. Note: the menu items in the toggle popover use a separate `data-theme-option` attribute (not `data-theme`) so the global `[data-theme="dark"]` / `[data-theme="light"]` token selectors don't accidentally re-theme a row whose label happens to be "Light" or "Dark".
- **OS-change listener.** When the user's OS theme changes AND the FindBack preference is `System`, the page re-resolves automatically. No user action required.
- **Logo.** The logo is theme-aware: it ships in two variants (`logo-light`, `logo-dark`) and the layout swaps them based on `data-theme`.
- **Focus states.** Focus rings are visible in both themes (sufficient contrast against each background).
- **Hover/active.** Hover and active states are defined per-theme in `{DESIGN.md → Colors}`.

---

## 20. Accessibility Floor

PRD §10 declares **WCAG 2.1 AA** as the design target. UX-implementation checklist (architecture and QA own the enforcement surface; UX owns the contract):

### 20.1 Keyboard

- **Every interactive element is keyboard-reachable** in a logical tab order.
- **Visible focus rings** on all interactive elements (no `outline: none` without a replacement).
- **Skip-to-content** link is the first focusable element. The destination is `<main id="main" tabindex="-1">` so screen-reader users can jump past the nav (Finding D2). The destination gets focus on activation.
- **Modals trap focus** and return focus to the trigger on close.
- **Dropdowns and menus** open with Enter/Space, close with Escape, navigate with Arrow keys.
- **Admin queue tables** (registrations, claims, awaiting return) implement the ARIA grid pattern: `role="grid"`, `role="row"`, `role="gridcell"`, with roving `tabindex` on the focused row and arrow-key navigation between rows (Finding D3). Cells inside the focused row are reached with Tab. This keeps keyboard navigation aligned with screen-reader announcement order.
- **Message thread** (per-claim) navigation: each message is keyboard-reachable in document order; the newest message receives `tabindex="-1"` after send and `scrollIntoView` is invoked (Finding D4).

### 20.2 Color contrast

- **Text on background.** ≥ 4.5:1 for body text, ≥ 3:1 for large text (18 pt / 14 pt bold).
- **Status indicators.** Never rely on color alone — every status has a text label and an icon (Section 5.8).
- **Both themes meet AA contrast.** DESIGN.md defines both light and dark tokens with AA contrast as the constraint.

### 20.3 Screen readers

- **Form labels** are persistent and programmatically associated with inputs.
- **Error messages** are announced via `aria-live="polite"`; the error summary uses `role="alert"`.
- **Helper text and error text** are bound to the field via `aria-describedby` referencing the field id. On validation failure, error text replaces helper text while keeping the same `id` (Finding G3) so the association is preserved.
- **Character counters** are wrapped in `aria-live="polite"` so screen readers announce threshold crossings (Finding G2).
- **Status badges** have an `aria-label` that includes the status name (the visible text is also the label).
- **Modals** use `role="dialog"` with `aria-modal="true"` and an `aria-labelledby` pointing to the modal title.
- **Toasts** — decision rule (Finding E3): successful non-blocking actions (filters cleared, claim submitted) use `role="status"` (polite); validation or session errors use `role="alert"` (assertive).
- **Audit trail row aria-label** template per event type (Finding E2): each row carries `aria-label="{Action verb} {actor display name} {target} at {timestamp}"`. The visible text is the same content in semantic order; the `aria-label` is the screen-reader-friendly single-string summary.
- **Message thread live region** (Finding E4): the message list carries `aria-live="polite"`, so a newly sent message (and any message received on page reload) is announced without a focus change.
- **Sensitive-field transitions** (Finding H2): when a field becomes newly visible to a member (e.g., they submit a claim and the claimant's identifying details become visible), the affected section is announced via `aria-live="polite"` once.

### 20.4 Touch targets

- **Minimum 44 × 44 px** for any interactive element.
- **Spacing.** ≥ 8 px between adjacent touch targets.

### 20.5 Forms

- **Required fields** are programmatically required (`required`, `aria-required="true"`).
- **Errors** are announced and associated with the field via `aria-describedby`.
- **Help text** is associated with the field via `aria-describedby`.

### 20.6 Motion

- **Respect `prefers-reduced-motion`.** Disable non-essential transitions when the user prefers reduced motion. The non-essential list (Finding F2): toast entry/exit, modal entry/exit, dropdown entry/exit, card hover lift, and the image-upload drag-active border/background change. The drag-active state is an instant state swap (no transition) under reduced motion. Status changes are essential and remain instant regardless.

### 20.7 Tables

- **`<th scope="col">`** for header cells. The audit trail is rendered as a `<table>` (not a `<ul>`) with `<th scope="col">` for the Timestamp / Actor / Action / Target / Details columns, and per-row `aria-label` per §20.3 (Finding I1).
- **Sortable headers** are buttons with `aria-sort` set to `ascending` / `descending` / `none`.
- **Detail-expansion disclosures** on each audit event (the "Show details" toggle) commit to `aria-expanded` + `aria-controls` referencing the hidden region by id (Finding I2): `<button aria-expanded="false" aria-controls="audit-event-{id}">Show details</button>`.

---

## 21. Responsive Behavior

Web application across desktop (≥ 1024 px), tablet (640–1023 px), mobile (< 640 px).

| Surface | Desktop | Tablet | Mobile |
|---|---|---|---|
| Landing | Hero + nav | Hero + nav | Hero + nav |
| Listings | Filter bar (left), results (right) | Filters collapse to a "Filters" disclosure above results | Filters collapse to a "Filters" disclosure; cards stack |
| Item detail | Two-column summary + detail body | Single column | Single column; actions stack |
| Report form | Single column, max-width 640 px | Single column | Single column; helper text wraps naturally |
| Claim form | Single column, max-width 640 px | Single column | Single column |
| Claim review (admin) | Two-column (current Claim + Found item); other Pending Claims shown as a navigable reference/strip below | Two-column (narrower) or stacked sections; other Pending Claims reference/strip remains navigable | Single-column current Claim review; "Other pending claims" disclosure/list below |
| Message thread | Thread + composer stacked | Same | Same; composer pins to bottom on focus |
| Confirm Returned | Two-column | Two-column (narrower) | Single column |
| Audit trail | List view | List view | List view; details collapse |
| Administrator dashboard | 4 count cards in a responsive grid (Pending Registrations, Pending Claims, Items Awaiting Return, Items in Verification) | 2 × 2 card grid | 4 stacked cards |
| Tables (admin queues) | Table | Table with horizontal scroll | Cards (each row becomes a card with stacked fields) |

The framework owns the breakpoint mechanics; DESIGN.md tokens are bound to breakpoints via CSS custom properties.

---

## 22. UX Decisions vs Architecture Decisions (separation of concerns)

This section explicitly enumerates what UX owns and what UX does *not* own, to prevent scope drift.

### 22.1 UX decisions

- Page structure, navigation, IA.
- User flows and journeys.
- Form behavior, validation feedback, errors, success states.
- Visual design (colors, typography, components, themes).
- Logo direction.
- Accessibility floor (WCAG 2.1 AA target).
- Information visibility rules (PRD FR-37/38/39 — UX renders these; architecture enforces them).
- Lifecycle status presentation.
- Copy and microcopy.
- Responsive behavior.
- Empty / loading / error states.

### 22.2 Architecture decisions (out of scope for UX)

- Database schema (FR-8 fields, FR-31 events).
- API architecture (REST vs GraphQL, endpoints).
- Image storage provider and budget (PRD OQ-2).
- Email provider and templates (PRD A6).
- Session implementation (cookie-based; PRD A2).
- Authentication password hashing (PRD §10 Security).
- Concurrency implementation for competing claims (PRD D3 — "Implementation is a database-level atomic write per item").
- CSRF, rate limiting, CSP, image URL non-predictability (PRD §10 Security).
- Audit-trail retention policy (PRD FR-31).
- Campus area enum configuration mechanism (PRD OQ-1).
- Date lost 365-day hard rule vs relaxable (PRD OQ-3) — PM-owned.

### 22.3 Open and resolved upstream questions

The final PRD opens **OQ-1, OQ-2, OQ-3** for downstream owners. **OQ-4** and **OQ-5** were resolved in earlier correction passes and are recorded here as "resolved / retired" so architecture and story-dev can see what was already adopted as canonical UX. There is no PRD OQ-6; the per-RR thread read-only lifecycle lives as a UX decision in §13.5b, not as a PRD open question.

#### Open upstream questions

| OQ | Owner | UX recommendation |
|---|---|---|
| OQ-1 (Campus area enum) | Architecture | UX renders the list as a native select; the list itself comes from deployment configuration. |
| OQ-2 (Image storage budget) | Architecture | UX caps at 5 MB / JPEG/PNG/WebP per FR-8. No UX change needed. |
| OQ-3 (Date lost beyond 365 days) | PM | UX supports a server-side override if PM relaxes the rule; no UX change otherwise. |

#### Resolved / retired upstream questions

| OQ | Owner | Resolution |
|---|---|---|
| OQ-4 (Per-Claim thread read-only point) | PM | **Adopted (2026-09-16).** §13.5 closes the per-Claim thread at the canonical read-only lifecycle: `Approved` / `Rejected` / `Returned` / `Closed`. There is no Claim `Closed` lifecycle state; "Closed" here refers to the parent Found report reaching `Returned` or `Closed`. |
| OQ-5 (Auto-rejection message wording) | UX | **Adopted (2026-09-16).** §4.4 uses a softer user-facing email and a neutral banner on the Claim detail screen. Audit reason remains "another claim was approved for this item" verbatim. The email body says "Another claim on this item was approved. Contact the administrator if you think this is a mistake." |

#### Resolved UX decisions (not PRD open questions)

- **UX-RR-1 (Per-RR thread read-only point).** §13.5b closes the per-RR thread once the RR reaches a terminal canonical status **or** the parent Lost report reaches `Returned` / `Closed`. Specifically:

  **Non-terminal / thread-writable** (the thread composer remains available to authorized participants):
  - `Submitted`
  - `Selected for Verification`
  - `Match Confirmed`

  **Terminal / thread-read-only:**
  - `Not a Match`
  - `Completed — Report Returned`
  - `Resolved — Report Returned`
  - `Resolved — Report Closed`
  - `Withdrawn`

  **Parent Lost report statuses that also force the thread read-only** (even if the RR is still non-terminal):
  - `Returned`
  - `Closed`

---

## 23. Open UX Questions Surfaced (additional)

These are surfaced by UX for PM/Architecture follow-up. None are blockers for downstream story creation; all are documented to preserve traceability.

- **UX-OQ-A: Empty email-state handling.** If a user's email bounces (PRD FR-27/28/29), no UX surface surfaces this to administrators. Should the administrator item page indicate "claimant's email is bouncing"? Recommendation: *defer to v2; not in scope.* Logged here so it isn't lost.
- **UX-OQ-B: Approve claim after status has changed.** If the administrator's screen shows a Pending claim and another admin approves it while Riley is reading, the server-side conflict response handles it (Section 6.4). If the Claim state changes while an Administrator is reviewing it, the UI must surface the updated state when the next server interaction or architecture-defined freshness mechanism detects it. Architecture owns the freshness mechanism.
- **UX-OQ-C: Audit trail length.** With 10,000 reports × 50 events (PRD NFR target), the audit trail could be long. UX uses reverse-chronological pagination (load 25, "Load older" button). No infinite scroll (which can confuse screen readers).

---

## 24. PRD Traceability and Consistency Check

This section is the **rubric walker Pass 1 reference** for downstream consumers (architecture, story-dev). It enumerates every PRD requirement and asserts UX coverage. Any gap is flagged inline.

### 24.1 Functional requirements

| FR | Coverage |
|---|---|
| FR-1 (Self-Registration) | §16.1 |
| FR-2 (Pending State and Restricted Access) | §9.2, §4.5, §6.2 |
| FR-3 (Administrator Review of Pending Registrations) | §15.2 |
| FR-4 (Login and Logout) | §16.2, §16.5 |
| FR-5 (Deactivation) | §15.6 |
| FR-6 (Create Lost Item Report) | §10 |
| FR-7 (Create Found Item Report) | §10 |
| FR-8 (Report Field Set) | §10.3 |
| FR-9 (Edit Own Report) | §10.4 |
| FR-10 (Delete Own Report, interaction-free) | §10.4 (Found: no Claim; Lost: no Recovery Response) |
| FR-11 (Withdraw Own Report) | §10.4 |
| FR-12 (Public Summary Listings) | §9.1, §11.2 |
| FR-13 (Authenticated Detail View) | §9.4, §11.3 |
| FR-14 (Search and Filter) | §7.1, §9.1 |
| FR-15 (Submit a Claim) | §12.1 |
| FR-16 (Administrator Review Screen) | §12.3 |
| FR-17 (Approve a Claim) | §12.4, §12.5 |
| FR-18 (Reject a Claim) | §12.6 |
| FR-19 (Reporter Edits, Audit Trail) | §10.4, §17 |
| FR-20 (Reporter Withdrawals, Audit Trail) | §10.4, §17 |
| FR-21 (Administrator Close Action) | §9.5 (Close tab on item admin) |
| FR-22 (Auto-Status Transitions) | §12, §14, §6.5 |
| FR-23 (Confirm Returned, Default Receiver) | §14 |
| FR-24 (Confirm Returned, Substitute Receiver) | §14 |
| FR-25 (No-Receiver-No-Returned Guard) | §14.4 |
| FR-26 (Per-Claim Thread) | §13 |
| FR-27 (Account Approved Email) | §16.2, §4.4 |
| FR-28 (New Claim Email) | §13.6, §4 |
| FR-29 (Claim Decision Email) | §4.4, §12.6 |
| FR-30 (No Other Notifications) | §13.6, §4 |
| FR-31 (Audit Trail Scope) | §17 |
| FR-32 (Audit Trail Visibility) | §17 |
| FR-33 (Administrator Dashboard) | §15.1 |
| FR-34 (Pending Claims Queue) | §15.3 |
| FR-35 (Items Awaiting Return Queue) | §15.4 |
| FR-36 (Remove Inappropriate Content) | §9.5 (Close action) |
| FR-37 (Sensitive Fields) | §11.1 |
| FR-38 (Public Summary Fields) | §11.2 |
| FR-39 (Member-Facing Visibility) | §11.3 |
| FR-40 (Recovery Response Submission) | §9.6 (Submit Recovery Response), §10.5 |
| FR-41 (Recovery Response Statuses) | §4.6, §4.8 (Standby derivation) |
| FR-42 (Lost Report Lifecycle) | §4.5, §6.3 |
| FR-43 (Recovery Response Selection) | §9.6 (Verification Queue), §15.5 |
| FR-44 (Recovery Response Withdraw) | §9.6 (Withdraw action) |
| FR-45 (Confirm Returned, Lost) | §14.5 |
| FR-46 (Lost-side Email Events) | §4.4, §13.7 |
| FR-47 (Per-Recovery-Response Thread) | §13.4 |
| FR-48 (Lost-side Audit Events 15–30) | §17.4 (RR audit table) |
| FR-49 (Four-View Member Partition) | §3, §9.4 |
| FR-50 (Items-in-Verification Queue) | §15.5 |

### 24.2 User journeys

| UJ | Coverage |
|---|---|
| UJ-1 (Maya reports a Lost wallet, Claims a Found wallet, manually Withdraws her own Lost report) | §8.1 |
| UJ-2 (Sam finds a phone; finder does not see claimant reason/identifying details) | §8.2 |
| UJ-3 (Alex registers and is approved; rejection has no email) | §8.3 |
| UJ-4 (Riley handles operational work across four queues, Found + Lost sides) | §8.4 |
| UJ-5 (Sam & Pat respond to Maya's Lost report; Maya selects; Riley records; Quinn as third-responder edge case only) | §8.5 |

### 24.3 Product principles

| Principle | UX translation |
|---|---|
| Simple | §1.2; one primary action per screen; native controls; helper text concise |
| Trustworthy | §11.4 (visibility is intentional); audit trail visible to admins; no silent state changes |
| Clear | §5.8 (every status has color + icon + text); §4.2 (canonical status labels) |

### 24.4 PRD-author decisions

| Decision | Coverage |
|---|---|
| D1 (Per-Claim message thread — Found-side) | §13 |
| D2 (Sensitive / public / member-facing visibility) | §11 |
| D3 (Approve-one-auto-reject-others with audit retention) | §12.5, §6.4 |
| D4 (Pending registration review queue) | §15.2 |
| D5 (Listing partition: `My Reports` / `Browse`) | §3, §9.4 |
| D6 (Per-Recovery-Response message thread — Lost-side) | §13.4, §13.5b |
| D7 (Recovery Response selection is provisional; Standby is a derived/display condition only) | §4.6, §4.8, §8.5 |
| D8 (Member participation views: `My Reports` / `Browse` / `My Claims` / `My Recovery Responses`) | §3, §9.4 |

The owner-determines / Administrator-records rule for Lost-side verification is **not** a separate numbered PRD-author decision and is **not** derived from D6 (D6 is exclusively the per-Recovery-Response messaging decision). It is independently defined by the Lost-side behavioral requirements — especially **FR-43** (owner selects RR for verification), **FR-45** (Lost-side Confirm Returned by Administrator), and **FR-48 Events 18–19** (Match Confirmed / Not a Match audit). It is represented in §4.7, §8.5, §9.5, and §14.5.

### 24.5 Non-goals (no UX affordance introduced)

Cross-checked against PRD §5. None introduced. Specifically:

- No automatic match suggestions (no "suggested matches" UI surface anywhere).
- No in-app notifications.
- No proof-of-ownership uploads (the report form's image field is the item photo, not a receipt/serial — UX copy reinforces this).
- No native mobile.
- No real-time chat features in the thread (Section 13).
- No identity verification (Section 14).
- No internationalization toggle (en-US only).
- No auto-expiry or stale-report reminders.

### 24.6 Visual identity

The baseline brief explicitly defers brand and visual identity to this UX phase. DESIGN.md authors all tokens from first principles. There is no existing baseline visual decision to preserve or contradict.

### 24.7 Contradictions / gaps detected

- **Correction pass — 2026-09-16.** All 43 numbered corrections against the final PRD have been resolved in EXPERIENCE.md. Specifically:
  - UJ-1 ending is now manual Withdraw, not auto-link; Maya's Lost report cleanup is her own action.
  - UJ-2 corrects the finder to no longer see claimant reason or identifying details.
  - UJ-3 removes the registration-rejection email; rejected users see the neutral login-screen inactive-account message instead.
  - UJ-4 surfaces four operational queues (Pending Registrations, Pending Claims, Items Awaiting Return, Items in Verification), includes Lost-side verification work for Riley, and corrects competing-Claim wording to avoid implying a literal side-by-side layout.
  - UJ-5 is replaced with the canonical Maya/Sam/Pat/Riley flow: Maya is the owner who selects the RR; Riley is the administrator who records Match Confirmed / Not a Match; the Lost-side Returned fires FR-46 Events 7 (Lost-report owner) and 8 (matched responder); standby responders auto-resolve without an Event 8 email.
  - §9.4 relationship-aware roles now match the FR-39 7-column visibility matrix exactly; the prior "Authenticated, reporter or claimant" merged column is replaced with the four explicit relationship-aware roles.
  - §11.4 removes the misleading "+ now visible to you" affordance triggered by Claim submission. Sensitive Fields never leak to non-owner claimants or responders.
  - §13.5 reads only at Approved/Rejected/Returned/Closed (already correct from Pass 3); §13.5b added for per-RR thread lifecycle.
  - §14.5 Lost-side Returned now fires FR-46 Event 7 + Event 8 atomically (replaces the prior "no email on Lost Returned" wording).
  - §22.3 retires OQ-4 and OQ-5 as adopted UX recommendations; the per-RR thread read-only lifecycle is recorded as UX-RR-1 (a resolved UX decision, not a PRD open question).
- **OQ-1 / OQ-2 / OQ-3 remain open** and forwarded to Architecture / PM as in §22.3.
- All other UX recommendations stay within the PRD's existing rules.

---

## 25. UX Copy Guidance Summary

A condensed reference for story authors and engineers:

| Surface | Headline | Body |
|---|---|---|
| Anonymous on item detail | "Sign in to see item details" | "FindBack is open to members of {Org}. Sign in or register to continue." |
| Pending landing | "Your account is pending administrator approval." | "You'll get an email when you're approved. You can sign out below." |
| Rejected / Deactivated login | "We couldn't sign you in." | "Your account is not active. If you think this is a mistake, contact your administrator." |
| Submit report success | (toast) "Report submitted." | n/a |
| Submit claim success | (toast) "Claim submitted." | "An administrator will review your claim and email you with the decision." |
| Claim approved | (email + screen) "Your claim was approved." | "The administrator will arrange the return with you." |
| Claim rejected (admin) | "Your claim was not approved." | "{Reason}" |
| Claim auto-rejected | "Your claim was not approved." | "Another claim on this item was approved. Contact the administrator if you think this is a mistake." |
| Item Returned | "This item has been returned." | "No further action is needed." |
| Withdraw report | "Withdraw this report?" | "It will be removed from listings. The administrator can still see it in history." |
| Delete report | "Delete this report?" | "This cannot be undone. The report will be removed from listings." |
| Approve competing claim | "You're about to approve {Claimant A}'s claim." | "The other {N} pending claim(s) will be automatically rejected. No further action can undo this." |
| Confirm Returned (default) | "Mark this item as returned to {Claimant name}?" | "This is final." |
| Confirm Returned (substitute) | "Mark this item as returned to {Substitute name}, a {Relationship} of the claimant?" | "This is final. Confirm the claimant has authorized this person to collect on their behalf." |
| Server error | "Something went wrong on our side." | "Try again, or come back in a moment." |
| Session expired | "You've been signed out." | "Sign in again to continue." |
| Concurrent action | "This item's claim was already decided by another administrator." | "The item is now {status}. No action is needed from you." |
| Audit access log | (administrator-only, not surfaced) | n/a |

---

## 26. What's next

This document plus `DESIGN.md` complete the UX phase. The downstream handoff is **deferred** until the user manually reviews the prototype and confirms the corrections in this pass. The following consumers can begin once that review is complete:

1. **`bmad-architecture`** — Architecture owns: database schema, API contracts, image storage, email provider, session implementation, concurrency, audit-trail storage, campus area enum configuration.
2. **`bmad-create-epics-and-stories`** — Epic / story authoring can begin against the FR-1..FR-50 traceability in §24.1.
3. **`bmad-sprint-planning`** — Sprint sequencing follows the user journeys in §8.
4. **`bmad-build`** — Implementation. Spines are the contract; key-screen mocks in `mockups/` (promoted at Finalize) are an additional reference for visual surfaces.

---

*End of EXPERIENCE.md.*
