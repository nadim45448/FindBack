---
title: "EXPERIENCE.md — FindBack"
status: final
created: 2026-08-29
updated: 2026-08-29
project: FindBack
run: ux-FindBack-2026-08-29
design_md: ./DESIGN.md
prd: ../../prds/prd-FindBack-2026-08-28/prd.md
brief: ../../briefs/brief-FindBack-2026-08-28/brief.md
---

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

FindBack has **four role states** for members and **one operator role** (Administrator). Role state is an attribute of an account, not a separate account type — an Administrator is a Member with the `administrator` flag (PRD §3).

| Role state | Can do | Cannot do | Realized by |
|---|---|---|---|
| **Anonymous User** | Browse summary listings; search/filter listings | View details; report; claim; message | FR-12, FR-38 |
| **Pending User** | Log in; see pending banner | Anything else | FR-2 |
| **Active Member** | Report; search; view details; claim; edit own reports; withdraw own reports; message on own claims | Approve/reject anything; see audit trail; administer accounts | FR-6..FR-15, FR-26, FR-39 |
| **Active Member — Reporter / Claimant** | All Active capabilities + see reporter display name on own items + see member-facing status history + see exact location on own items + see own identifying details on own items | Sensitive fields of others; audit trail | FR-13, FR-39 |
| **Administrator** | All Active capabilities + approve/reject registrations + deactivate accounts + approve/reject/auto-reject claims + confirm Returned + close reports + view full audit trail | Multi-org admin; SSO; analytics | FR-3, FR-5, FR-16..FR-18, FR-21, FR-23, FR-24, FR-31..FR-36 |

**Role resolution.** The server resolves role from session and persists the role in the request context. UI never infers role from URL alone.

---

## 3. Information Architecture

### 3.1 Top-level surfaces (site map)

FindBack has **two top-level surfaces** for users and **one for administrators**. We do not flatten everything into one nav.

```
FindBack (single deployment, one organization)
│
├── Public surface
│   ├── /                          Landing page
│   ├── /login                     Login
│   ├── /register                  Self-registration
│   └── /listings                  Combined Lost & Found summary listing (anonymous-viewable)
│
├── Member surface (authenticated; requires Active member)
│   ├── /home                      Member dashboard
│   ├── /report/lost               Report Lost Item (form)
│   ├── /report/found              Report Found Item (form)
│   ├── /listings                  Combined Lost & Found (full listing, same surface, richer view)
│   ├── /listings/:id              Item detail (role- and relationship-aware)
│   ├── /listings/:id/claim        Claim form (Found item only, Active member only)
│   ├── /my/reports                My Reports
│   ├── /my/claims                 My Claims
│   ├── /my/claims/:id             Claim detail (status + thread)
│   └── /account                   Account settings (theme, logout, basic profile)
│
├── Account-lifecycle surfaces
│   ├── /pending                   Pending state landing (post-login while Pending)
│   ├── /rejected                  Rejected state landing (post-login attempt if Rejected)
│   └── /deactivated               Deactivated state landing (post-login attempt if Deactivated)
│
└── Administrator surface (authenticated; requires administrator flag)
    ├── /admin                     Administrator dashboard (counts + queue links)
    ├── /admin/registrations       Pending registrations queue
    ├── /admin/claims              Pending claims queue
    ├── /admin/awaiting-return     Items awaiting physical return queue
    ├── /admin/claims/:id          Claim review (single)
    ├── /admin/items/:id           Item administration (edit, close, confirm returned)
    ├── /admin/items/:id/audit     Audit trail view
    ├── /admin/items/:id/return    Confirm Returned workflow (default or substitute receiver)
    └── /admin/accounts            Account management (search, deactivate)
```

### 3.2 Navigation rules

- **Anonymous.** Top nav: `Lost & Found` (listings), `Log in`, `Register`. No dashboard, no "Report" buttons.
- **Active Member.** Top nav: `My Reports`, `My Claims`, `Browse`, `Report ▾` (dropdown with Lost / Found), `Account`. `Browse` and `Lost & Found` map to the same `/listings` surface.
- **Pending User.** Top nav collapses to brand mark + status banner + `Log out`. No Browse, no Report.
- **Administrator.** A second nav layer under the member nav exposes `Admin ▾` containing `Dashboard`, `Registrations`, `Claims`, `Awaiting Return`, `Accounts`. The admin section is visually delineated from member actions (e.g., a divider + label).

### 3.3 IA closure check

Every need in the PRD has a surface. Every surface has a journey (Section 8) that lands there. Examples:

| Need | Surface | Journey |
|---|---|---|
| Register | `/register` | UJ-3 |
| Browse anonymously | `/listings` | Implicit (anonymous browse) |
| Report Lost | `/report/lost` | UJ-1 step 1 |
| Submit Claim | `/listings/:id/claim` | UJ-1 step 4–5 |
| Review pending registrations | `/admin/registrations` | UJ-3 step 4 |
| Compare competing claims | `/admin/items/:id/audit?tab=claims` (or `/admin/items/:id` Competing tab) | UJ-4 step 4 |
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

| Concept | User-facing label |
|---|---|
| Account states | `Pending`, `Active`, `Rejected`, `Deactivated` |
| Report lifecycle | `Open`, `Claim Requested`, `Claim Approved`, `Returned`, `Closed` |
| Claim states | `Pending`, `Approved`, `Rejected` |
| Item type | `Lost item`, `Found item` |
| Roles | `Member`, `Administrator` |

### 4.3 Status microcopy

#### Account

- **Pending (banner).** "Your account is pending administrator approval. You'll get an email when you're approved." Plus a secondary line: "You can sign out below — your registration is saved."
- **Rejected (login screen).** "We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator." (PRD FR-4: rejected reason is *not* exposed.)
- **Deactivated (login screen).** Same neutral message as Rejected. The administrator's reason is not exposed.

#### Report lifecycle

- **Open.** "Active. No claims yet." (Action hint: report owner sees "Edit" and "Delete" if claim-free; otherwise "Withdraw".)
- **Claim Requested.** "An administrator is reviewing {N} claim{plural} on this item."
- **Claim Approved.** "A claim has been approved. The administrator is arranging the return."
- **Returned.** "This item has been returned. No further action is needed."
- **Closed.** "This report is no longer active." (Action hint: none. Read-only history.)

#### Claim

- **Pending.** "Submitted. An administrator will review your claim and email you with the decision."
- **Approved.** "Your claim was approved. The administrator will arrange the return with you."
- **Rejected.** "Your claim was not approved. {Reason}" — for auto-rejection see Section 4.4.
- **Approved-then-auto-rejected (competing claims).** See Section 4.4.

### 4.4 Auto-rejection copy (competing claims) — implements OQ-5

PRD FR-17 specifies the audit reason "another claim was approved for this item". UX recommendation for the email body and the rejection screen:

> **Subject (email).** "Your claim on '{Item name}' was not approved"
>
> **Body.** "Hi {Claimant},
>
> Thanks for submitting your claim on *{Item name}*. Another claim on the same item was approved by the administrator, so your claim has been closed.
>
> If you believe this is in error, please contact the administrator — they can reopen your claim or take another look.
>
> — The FindBack team"

**Reasoning.** The PRD wording "another claim was approved for this item" is the audit-trail reason (administrator-facing). The user-facing email softens this without contradicting the audit record: it states the consequence, names the action, and offers a human escalation path. It does not name the winning claimant (privacy / trust).

**On the rejected claim detail screen.** A neutral banner: "Your claim was not approved because another claim on this item was approved. Contact the administrator if you think this is a mistake." The audit reason ("another claim was approved for this item") is preserved verbatim in the audit trail but is not surfaced as user-facing copy — the user-facing copy uses the language above.

### 4.5 Copy for restricted permissions

When a Pending user lands on a member surface (deep-link, browser back button), show a friendly, non-blocking message rather than a hard error:

> "Your account is pending administrator approval. This part of FindBack will be available once your account is approved."

The header still shows the brand mark and the Pending banner. The page body shows the message and a "Back to your account" link. Do **not** redirect-loop between the destination and the pending page.

### 4.6 Error copy

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
- `secondary` — paired with a primary action when a destructive or cancel path exists. Example: "Save draft" on report form.
- `tertiary` / `ghost` — low-emphasis actions. Example: "Clear filters" on listing.
- `danger` — destructive actions. Example: "Delete report" (only when Open + claim-free, per FR-10).
- `danger-strong` — irreversible / high-stakes. Used only for **Confirm Returned** approval-with-substitute (Section 12) and for closing a report with active claims.

**Behavioral rules.**

- **One primary button per view.** If a screen has two competing primary actions, demote the secondary to `secondary` or move it into a menu.
- **Topbar Register / Sign in CTAs must read as buttons in the resting state.** Use `primary` style (filled, brand surface, on-brand text) — not `tertiary`. A tertiary topbar CTA disappears into the navigation labels and only becomes legible on hover, which fails the "visible at rest" expectation for an entry-point action. When a page already has a primary in its main content (e.g., the form's submit button), the topbar CTA is exempt from the "one primary per view" rule because it lives in a separate region (topbar vs content) and serves a different audience (anonymous vs already-filling-the-form). See `§5.2 Topbar` for the topbar's component treatment.
- **Destructive actions require explicit confirmation.** Confirmation uses a **modal dialog** that names the consequence, not a confirm() call. See Section 7.6.
- **Loading state.** Buttons enter a disabled + spinner state while the action is in flight (the `executing` state from `{components.button.state.executing}`). The button label remains visible (e.g., "Submitting…").
- **Disabled state.** Disabled buttons explain why on focus (tooltip or `aria-describedby`) for screen reader users.
- **Touch target.** Min 44 × 44 px (PRD NFR accessibility, Section 11).

### 5.2 Topbar (anonymous + auth-flow pages)

On public / auth-flow pages (`/`, `/login`, `/register`, `/forgot`, `/forgot-sent`, `/pending`, `/rejected`, `/deactivated`), the topbar exposes two actions to the anonymous visitor:

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
- **Radio group.** Lost vs Found on the report form. (Implemented as a tab/step 1 to keep the visual treatment of the two types distinct — see Section 8.3.) For relationship (Friend, Family Member, Colleague, Classmate, Other), use a radio group.

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

Administrator queues (Pending Registrations, Pending Claims, Awaiting Return) use a table layout on desktop and collapse to stacked rows on mobile. Sortable columns: submission time (default), claim/item ID. Action column is right-aligned and exposes the primary action directly (Approve, Review, Confirm Returned).

Accessibility: `<th scope="col">`, sortable headers announced as "Sort by {column}, ascending/descending", keyboard navigable rows, and row focus moves to a focusable action when present.

### 5.8 Status badges & indicators

Every status uses three cues — color, icon, text label (PRD NFR accessibility). Mapping:

| Status | Color token | Icon | Label |
|---|---|---|---|
| Open | `{colors.status-report.open}` | circle (open) | `Open` |
| Claim Requested | `{colors.status-report.claimRequested}` | inbox | `Claim Requested` |
| Claim Approved | `{colors.status-report.claimApproved}` | check-shield | `Claim Approved` |
| Returned | `{colors.status-report.returned}` | check-circle | `Returned` |
| Closed | `{colors.status-report.closed}` | archive | `Closed` |
| Claim Pending | `{colors.status-claim.pending}` | hourglass | `Pending` |
| Claim Approved | `{colors.status-claim.approved}` | check | `Approved` |
| Claim Rejected | `{colors.status-claim.rejected}` | x | `Rejected` |
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
- **Empty.** Friendly headline + one-sentence body + a single next-action button. No illustrations or stock photos in MVP (avoids scope creep on assets).
- **Error.** Calm headline, sentence body, "Try again" as primary, "Go back" as secondary. No stack traces. Logs handle diagnostics.
- **Offline / connection lost.** Banner at the top of the page; queued actions resume on reconnect (architecture-owned).

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
- **Session expired mid-flow.** On any state-changing action, intercept the 401, save the in-flight form values to session storage, route to `/login?return=...`, and restore the values after successful login.

### 6.3 Permission states

- **Anonymous.** Public summary only.
- **Authenticated, no relationship to item.** Sees summary + description + image. Sensitive fields (exact location, identifying details) are hidden (PRD FR-13, FR-39).
- **Authenticated, reporter or claimant.** Sees summary + description + image + reporter's display name + exact location + identifying details + member-facing status history (PRD FR-13, FR-39).
- **Administrator.** Sees everything including the audit trail (PRD FR-32).

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

- Helper text is the only help surface in MVP. There is no help center, no chatbot, no tooltip tour.
- Field-level helper text for non-obvious fields (e.g., "Identifying details are hidden from other members until you submit a claim" on the report form).

### 7.4 Submission & cancellation

- **Cancel/back.** Returns to the previous surface. If the form is dirty, prompt "Discard your changes?" with two actions (Discard, Keep editing).
- **Submission.** Submit button disabled until form is valid. On submit, the form enters `submitting` state; on success, navigate to the report detail page; on validation error, scroll to the first error.

### 7.5 Drag & drop

- Image upload supports drag-and-drop on desktop. Mobile uses the picker. The drop zone is keyboard-accessible (focus → Enter opens picker).

### 7.6 Confirmation patterns

Two-step confirmation (click action, then confirm in modal) is reserved for irreversible or high-stakes actions:

- Withdraw report
- Delete report (only when Open + claim-free)
- Approve a claim (when other pending claims exist — i.e., competing claims, see Section 12)
- Confirm Returned (default or substitute)
- Close report (administrator)
- Deactivate account (administrator)
- Reject registration (administrator, requires reason)

For low-stakes actions (mark a notification read, clear filters), no confirmation — the action is reversible or harmless.

---

## 8. Key Flows

Each flow names a protagonist from the PRD (UJ-1 through UJ-4). Mirrors PRD source-spec names verbatim.

### 8.1 UJ-1 — Maya reports a lost wallet and is reunited with it

**Protagonist.** Maya, graduate student, Active member. Lost her wallet on campus.

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
4. **Submit.** Maya clicks `Submit report`. Submitting state shows. On success, toast confirms and Maya is routed to `/listings/:id`.
5. **Detail page.** Maya sees the full report as the reporter: name, type badge `Lost`, category, description, image, exact place, identifying details, status history. Status is `Open`.
6. **Browse Found items.** Maya clicks `Browse` in the nav → `/listings`. She filters: Type = `Found`, Category = `Wallets & purses`. Result list appears. She clicks a row.
7. **Item detail (logged in, no relationship).** Maya sees summary + description + image. Status `Open`. A `Submit claim` CTA is visible because the item is `Found`.
8. **Submit Claim.** Maya clicks `Submit claim` → `/listings/:id/claim`. Form:
   - `Reason` — "This is my wallet — brown leather, with a photo of my dog inside" (20–1000).
   - `Identifying details` — "There is a small scratch on the back, and a folded metro card in the inner pocket" (10–500).
   - `Date lost` — same date.
9. **Submit claim.** Claim is created in `Pending` status. Maya sees claim detail. Email goes to the finder (PRD FR-28). Maya's report's status transitions to `Claim Requested` (PRD FR-22).
10. **Wait.** Maya sees her claim status in `My Claims`. She does not receive any further email until a decision.
11. **Administrator approves.** Maya receives "claim approved" email. Her claim status moves to `Approved`. The item's status moves to `Claim Approved`.
12. **Visit desk.** Maya visits the administrator to pick up the wallet.
13. **Returned.** Administrator confirms Returned with Maya as receiver (default, PRD FR-23). Maya's email does not fire (PRD FR-30: Returned is not an email event). Maya's claim status is `Approved`; the report's status is `Returned` (terminal). Maya sees this on `/my/reports`.

**Climax beat.** Maya walks away with her wallet. She never sees sensitive fields of other members; she never receives an unexpected email; she always knows what to do next.

### 8.2 UJ-2 — Sam finds a phone and wants to do the right thing

**Protagonist.** Sam, employee, Active member. Found a phone at the cafeteria.

1. **Report Found.** Sam clicks `Report Found Item` → `/report/found`. Fills in the form (similar to UJ-1 step 3, but for Found; date field is "date found", location is "Cafeteria").
2. **Submit.** Report is created in `Open`. Audit trail records Sam.
3. **Wait.** Sam does nothing for three days. He does not manage the claim himself (PRD §2.3 UJ-2).
4. **Email arrives.** Sam receives "new claim on your found item" email (PRD FR-28). Email contains a link to the claim detail page.
5. **Read claim.** Sam opens the claim, reads the reason and identifying details. He does not reply directly through any out-of-platform channel (PRD FR-26, no email exposure). He can post in the per-claim message thread if needed.
6. **Wait for decision.** Sam does not receive any further email (PRD FR-30). He can see status change on `/my/reports` when he next visits.
7. **Bring to administrator.** Once status is `Claim Approved`, Sam brings the phone to the administrator.
8. **Returned.** Administrator confirms Returned (Maya as claimant, default receiver). Sam's report status moves to `Returned` (terminal).

**Climax beat.** Sam does the right thing without chasing anyone. The system handles routing.

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
4. **Pending state.** If Alex clicks "Log in" with his credentials, he lands on `/pending` with the Pending banner. He cannot browse, report, or claim.
5. **Administrator reviews.** Administrator sees Alex in `/admin/registrations`. Two actions: `Approve`, `Reject`.
6. **Approve.** Administrator clicks `Approve`. No reason required. Account becomes `Active`. Email sent to Alex (PRD FR-27). Audit trail records.
7. **Rejected path.** If `Reject`, modal asks for a reason (≥ 5 chars). Reason is recorded in the audit trail (PRD FR-3) but **not** exposed to Alex. Email is sent (PRD FR-29-equivalent — "account not approved" wording, no reason in body). Alex sees a neutral login-screen message on next attempt.
8. **Active.** Alex logs in, sees `/home` with the two `Report Lost Item` / `Report Found Item` CTAs.

**Climax beat.** Alex is approved in minutes and knows exactly what's happening at each step. Rejected users are protected from internal reasoning.

### 8.4 UJ-4 — Riley, an administrator, handles a busy morning

**Protagonist.** Riley, security desk, sole administrator on shift. 6 pending claims, 2 pending registrations, 1 approved claim awaiting return.

1. **Administrator dashboard.** Riley opens `/admin`. Three counts:
   - Pending registrations: `2` → `/admin/registrations`
   - Pending claims: `6` → `/admin/claims`
   - Awaiting return: `1` → `/admin/awaiting-return`
2. **Pending claims queue.** Riley opens `/admin/claims`. Table with claim ID, item name, claimant display name, submission time, action. Default sort: oldest first (PRD §2.3 UJ-4 "ordered by submission time").
3. **Single-claim review.** Riley opens the first claim → `/admin/claims/:id`. Side-by-side: item details (left) and claim (right). Other pending claims on the same item are listed at the bottom with their claimants. This is the **non-competing** path: only one pending claim.
4. **Approve (no competition).** Riley clicks `Approve`. Confirmation modal: "Approve this claim? The item will move to *Claim Approved*." No auto-rejection warning because no other pending claims exist. Riley confirms. Claim status → `Approved`. Item status → `Claim Approved`. Email to claimant (PRD FR-29).
5. **Compete case.** Riley opens the second item, which has two pending claims. The review screen shows both side by side (PRD FR-16 "side by side"). Riley reads reasons, identifying details, date lost. A **prominent warning** is shown above the Approve button: "Approving this claim will automatically reject the other pending claim on this item. This cannot be undone." Per Section 7.6, this is a two-step confirmation.
6. **Approve (competing).** Riley clicks `Approve` → confirmation modal restates the warning → Riley confirms. Approving administrator wins (PRD D3). Other claim auto-rejects with audit reason "another claim was approved for this item" (PRD FR-17). Item status → `Claim Approved`. Emails sent.
7. **Concurrent-action edge.** If a second administrator approved the *other* claim first, Riley sees the conflict state from Section 6.4 ("This item's claim was already decided…").
8. **Awaiting return.** Riley opens `/admin/awaiting-return`. The approved item is listed. Riley clicks `Confirm Returned` → `/admin/items/:id/return`.
9. **Returned confirmation (default).** Riley sees the approved claimant's name prefilled as the receiver. Default is "Default receiver". Riley confirms. Action records confirming administrator, receiver (claimant), timestamp. Item status → `Returned`. No email (PRD FR-30).
10. **Returned (substitute).** If a friend is picking up, Riley selects "Substitute receiver". Three required fields appear: substitute receiver's name, authorization affirmation checkbox, relationship radio group (Friend / Family Member / Colleague / Classmate / Other). All three required when substitute ≠ claimant (PRD FR-24). Confirmation modal restates: "Recording Returned with {substitute name} as the receiver. This is final."
11. **Registrations.** Riley reviews `/admin/registrations`. Approves one (email fires). Rejects the other with a reason (audit-trail-only, not exposed).
12. **Audit trail.** Riley can open `/admin/items/:id/audit` for any item to see the full chronological record (PRD FR-31). For audit-trail reads, an access log is created (PRD §10 Observability).

**Climax beat.** Riley processes 9 actions without confusion. Every action is captured. Audit trail is trustworthy.

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

### 9.4 Active Member

- **Dashboard (`/home`).** Two primary CTAs (Report Lost, Report Found). Below: a "My recent activity" card showing the most recent 3 of each from `My Reports` and `My Claims`. Tabs to switch. A "Browse Lost & Found" link.
- **Browse (`/listings`).** Same surface as anonymous listings but with richer view (e.g., filter pills, type toggle, sort).
- **Item detail (`/listings/:id`).** Role- and relationship-aware rendering:
  - Anonymous: summary only, no detail.
  - Authenticated, no relationship: summary + description + image. **No** exact place, **no** identifying details (PRD FR-13).
  - Authenticated, reporter or claimant: summary + description + image + exact place + identifying details + reporter's display name + member-facing status history (PRD FR-13, FR-39).
  - Administrator: everything plus audit trail.
- **Report form (`/report/lost`, `/report/found`).** Two-step: type is fixed by URL; fields follow PRD FR-8. Helper text is concise; required indicator is `*`. Date picker for date; native selects for category and campus area.
- **My Reports (`/my/reports`).** Tabs: `Lost`, `Found`, `Withdrawn`. Each row shows type badge, item name, status badge, last-updated timestamp. Edit, Delete (Open + claim-free), Withdraw (otherwise).
- **My Claims (`/my/claims`).** Tabs: `Pending`, `Approved`, `Rejected`. Each row shows the item name, item type, status badge, claim submission time. Click → claim detail.
- **Claim detail (`/my/claims/:id`).** Item summary, claim reason, identifying details, date lost, claim status. Below: per-claim message thread (Section 12).
- **Account (`/account`).** Profile (read-only for MVP), Theme toggle, Logout. Email change and password change are out of MVP scope per PRD — keep profile read-only and remove any affordance that would suggest they exist.

### 9.5 Administrator

- **Dashboard (`/admin`).** Three counts as cards or large tiles: Pending registrations, Pending claims, Items awaiting physical return. Each tile is a link to the corresponding queue. Below: a "Recent activity" feed showing the latest 5 audit events across all reports (read-only).
- **Pending registrations (`/admin/registrations`).** Table: name, email, self-declared role, registration timestamp, action. Action: `Approve` (primary), `Reject` (danger, opens reason modal).
- **Pending claims (`/admin/claims`).** Table: claim ID, item name (link to item), claimant display name, submission time, action. Action: `Review` → claim review screen.
- **Awaiting return (`/admin/awaiting-return`).** Table: item name, claimant name, approval time, action. Action: `Confirm Returned`.
- **Claim review (`/admin/claims/:id`).** Two-column on desktop, stacked on mobile:
  - Left column: item details (name, category, type, date, campus area, description, image if any, status, reporter).
  - Right column: claim details (claimant name, reason, identifying details, date lost, submission time).
  - Bottom strip: "Other pending claims on this item" — list each with claimant name and submission time. **Critical for competing claims UX** (Section 12).
  - Action bar (sticky on desktop): `Approve`, `Reject`. Reject opens reason modal (≥ 10 chars).
- **Item administration (`/admin/items/:id`).** Tabs: `Details`, `Audit Trail`, `Compete` (visible only when ≥ 2 pending claims), `Close`.
- **Audit trail (`/admin/items/:id/audit`).** Reverse-chronological list of all events for the report (PRD FR-31). Each event has: timestamp, actor, action verb, target, additional fields. Filters: action type, date range.
- **Confirm Returned (`/admin/items/:id/return`).** Two-column layout. Left: item summary, approved claimant. Right: form. Default state: receiver = approved claimant (radio "Default receiver" selected). Substitute state: radio "Substitute receiver" → three required fields appear (name, authorization affirmation checkbox, relationship radio).
- **Account management (`/admin/accounts`).** Search by name or email. Table: name, email, role state, registration date, action. Action: `Deactivate` (administrators cannot be deactivated by themselves; deactivating the last administrator is blocked).

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

- **Edit.** Available for the reporter until status is `Returned` (PRD FR-9). The Edit screen is the same form, pre-filled. Each edit is recorded in the audit trail with actor, timestamp, and a snapshot of changed fields (PRD FR-19).
- **Delete.** Available only when status is `Open` and there are no claims (PRD FR-10). Hard delete. Confirmation modal: "Delete this report? This cannot be undone. The report will be removed from listings."
- **Withdraw.** Available once any claim exists, until status reaches `Returned` (PRD FR-11). Transitions status to `Closed`. Confirmation modal: "Withdraw this report? It will be removed from listings. The administrator can still see it in history."

### 10.5 Submission outcome

- Success: inline confirmation, then navigate to the report detail page (`/listings/:id`).
- Validation error: scroll to first error, focus first invalid field, show error summary.
- Server error: show "Something went wrong on our side. Try again." Preserve user input.

---

## 11. Item Detail & Information Visibility (PRD Section 4.11)

PRD FR-13, FR-37, FR-38, FR-39 are the source of truth. This section translates them into rendering rules.

### 11.1 Visibility matrix

| Field | Anonymous | Authenticated, no relationship | Reporter / Claimant | Administrator |
|---|---|---|---|---|
| name | ✓ | ✓ | ✓ | ✓ |
| category | ✓ | ✓ | ✓ | ✓ |
| date (lost/found) | ✓ | ✓ | ✓ | ✓ |
| campus area (enum) | ✓ | ✓ | ✓ | ✓ |
| status (lifecycle) | ✓ (Open/Claim Requested/Claim Approved only; admin sees all) | ✓ (same restriction) | ✓ (own status; full set if admin) | ✓ (all) |
| type (Lost/Found) | ✓ | ✓ | ✓ | ✓ |
| description | — | ✓ | ✓ | ✓ |
| image | — | ✓ | ✓ | ✓ |
| reporter display name | — | — | ✓ (own) | ✓ |
| exact place (Sensitive) | — | — | ✓ (own) | ✓ |
| identifying details (Sensitive, on report) | — | — | ✓ (own) | ✓ |
| member-facing status history | — | — | ✓ (own) | ✓ |
| claimant identifying details (Sensitive, on claim) | — | — | ✓ (own claim) | ✓ |
| substitute receiver fields | — | — | — | ✓ |
| audit trail | — | — | — | ✓ |

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

The UX reinforces that sensitive fields are protected **by design**. When a field is hidden, an inline "Hidden from other members" label appears next to the section heading. When a user gains visibility (e.g., they submit a claim and the claim becomes Pending), they see previously hidden fields appear with a small "+ now visible to you" affordance once.

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

- Header: claim ID, item name (link), status badge.
- Body: claim reason, identifying details, date lost, submission timestamp.
- Below: per-claim message thread (Section 14) while the claim is Pending or Approved-and-not-yet-Returned. Read-only when Approved (post-Return) or Rejected (closed) — see Section 14 read-only logic.

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

- **Pre-approval warning banner.** Persistent amber alert above the action bar: "Approving this claim will automatically reject *{N}* other pending claim{plural} on this item. This cannot be undone."
- **Approve button.** `danger-strong` variant (red, prominent).
- **Two-step confirmation.** First click opens a modal that:
  - Restates the consequence in plain English: "You're about to approve *{Claimant A}'s* claim. The other *{N}* pending claim{plural} will be automatically rejected. No further action can undo this."
  - Names the losing claimants (display names) so Riley knows exactly who is affected.
  - Confirms via `Approve claim` button.
- **Post-approval outcome.** The screen transitions to a "Result" view:
  - Approved claim highlighted in green with `Approved` status.
  - Each auto-rejected claim listed with `Rejected` status and the audit reason ("another claim was approved for this item").
  - Link to item audit trail.
- **Concurrent action handling.** If Riley clicks `Approve` and another administrator approves first, Riley sees the conflict state from Section 6.4.

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
- **No typing indicators.** (PRD FR-26 — explicitly out of MVP.)
- **No read receipts.** (PRD FR-26 — explicitly out of MVP.)
- **No real-time updates.** The thread refreshes on page load and on send. Members do not see new messages without reloading.

### 13.4 Empty / error / permission states

- **Empty.** "No messages yet. Be the first to ask a question."
- **Permission denied.** "Only the claimant, finder, and administrators can see this thread."
- **Send error.** "We couldn't send your message. Try again." Composer retains input.
- **Server error (history fetch).** "We couldn't load the conversation. Try again."

### 13.5 Read-only logic (OQ-4)

PRD FR-26 closes the thread when the claim is `Approved`, `Rejected`, or the item is `Closed`. OQ-4 asks whether the thread should also close at `Returned`.

**UX recommendation:** *Close at `Returned` as well.* Once the item is `Returned`, the workflow is over. Continuing to post messages after the physical handoff is confusing — both participants would be writing into a void. The thread becomes read-only at `Returned`, alongside the existing closed states.

> **Why:** the purpose of the per-claim thread is to support the active claim workflow. Once the item is physically returned, the conversation has achieved its purpose. Read-only history remains visible so members can refer back.

> **User impact:** claimants and finders see an inline notice at `Returned`: "This conversation is now read-only because the item has been returned."

**The PRD's stated rule is "Approved, Rejected, or Closed"; UX proposes extending to "Returned". The PRD's OQ-4 explicitly says the owner of the question is PM and the revisit is "After UX design pass."** UX is making this recommendation as part of that revisit. If PM accepts, FR-26 wording should be updated to include `Returned`.

### 13.6 Notifications (PRD FR-30)

Sending a message does **not** generate an email. Members learn about new messages only when they revisit the thread. This is explicit in the PRD; UX reinforces it with no in-app notification surface.

---

## 14. Confirm Returned UX

> Authority: PRD FR-23, FR-24, FR-25.

### 14.1 Entry point

From the Awaiting Return queue (`/admin/awaiting-return`), click `Confirm Returned` on a row → `/admin/items/:id/return`.

### 14.2 Layout

Two-column on desktop, stacked on mobile.

- **Left column.** Item summary (name, type, category, date, campus area, image if any), approved claimant's name, claim submission timestamp, approval timestamp.
- **Right column.** The form.

### 14.3 Form

**Receiver radio group.**

- `Default receiver — {Claimant name}` (selected by default).
- `Substitute receiver`.

**Default receiver state.** Confirm button is `Confirm Returned`. Confirmation modal: "Mark this item as returned to *{Claimant name}*? This is final."

**Substitute receiver state.** Three required fields appear when selected:
- `Substitute receiver's name` (1–80 chars).
- `Authorization affirmation` (single checkbox, label = "The claimant has authorized this person to collect the item on their behalf.").
- `Relationship` (radio group: Friend / Family Member / Colleague / Classmate / Other).

If any field is missing, `Confirm Returned` is disabled with a tooltip pointing to the first missing field. (PRD FR-25: "the system refuses to confirm Returned without a recorded receiver.")

**Confirmation modal (substitute).** "Mark this item as returned to *{Substitute name}*, a {Relationship} of the claimant, with the claimant's authorization? This is final."

### 14.4 No-receiver-no-returned guard (PRD FR-25)

If the administrator reaches the confirmation modal without selecting default-or-substitute (e.g., via direct URL manipulation), the system blocks at the form level with an inline error: "Pick a receiver before confirming Returned." The `Confirm Returned` button is disabled until the receiver is valid.

### 14.5 Outcome

On confirm: item status → `Returned` (terminal). Audit trail records the action with confirming administrator, receiver (default or substitute fields), and timestamp (PRD FR-31). **No email** (PRD FR-30). Item disappears from active listings.

The administrator lands back on the Awaiting Return queue, which now shows the updated list.

---

## 15. Administrator Dashboard and Queues

> Authority: PRD FR-3, FR-33, FR-34, FR-35, FR-36.

### 15.1 Dashboard (`/admin`)

- **Three count cards** at the top, each linking to the corresponding queue:
  - Pending registrations: count + label.
  - Pending claims: count + label.
  - Items awaiting physical return: count + label.
- **Recent activity feed** below: last 5 audit events across all items. Read-only, no expansion. Each row: timestamp, actor, action, item name (link). Provides Riley a quick pulse on the system.
- **Empty states.** If all counts are zero, each card shows "All caught up." with a subtle check icon. Riley can still navigate to the queues.

### 15.2 Pending registrations queue (`/admin/registrations`)

- Table: name, email, self-declared role, registration timestamp, action.
- Action: `Approve` (primary), `Reject` (danger — opens reason modal, ≥ 5 chars).
- Sort: oldest first by default.
- Empty state: "No pending registrations." plus a one-line note: "When someone new registers, they appear here."

### 15.3 Pending claims queue (`/admin/claims`)

- Table: claim ID, item name (link), claimant display name, submission time, action.
- Action: `Review` → claim review screen.
- Sort: oldest first by default.
- Empty state: "No pending claims."

### 15.4 Awaiting return queue (`/admin/awaiting-return`)

- Table: item name, claimant name, approval time, action.
- Action: `Confirm Returned`.
- Sort: oldest first by default.
- Empty state: "No items are awaiting return."

### 15.5 Loading / error / permission states

- **Loading.** Each queue renders a skeleton table.
- **Error.** Calm message + retry button. Logs are server-side.
- **Permission.** Non-administrator hitting `/admin/*` routes sees the access screen (Section 4.5), but the message can be more specific: "This area is for administrators only."

### 15.6 Account management (`/admin/accounts`)

- Search by name or email.
- Table: name, email, role state, registration date, action.
- Action: `Deactivate` (administrator-only). Block deactivation of the last active administrator (a deployment-configured minimum is required; the UX surfaces this as a clear error if attempted).
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
- **No email change, no password change** (not in MVP scope; PRD is silent; introducing them would be scope creep).

---

## 17. Audit Trail UX (Administrator-Only)

> Authority: PRD FR-31, FR-32.

### 17.1 Access

- Administrators only. PRD FR-32 explicitly forbids members from seeing audit entries.
- Surface: `/admin/items/:id/audit`.

### 17.2 Layout

A reverse-chronological list. Each row is an event.

- **Timestamp.** Full date + time, in the organization's locale (en-US in MVP — i18n deferred per PRD §5).
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
| Report withdrawn | archive | `{colors.status-report.closed}` |
| Report closed (admin) | archive-x | `{colors.status-report.closed}` |
| Claim submitted | inbox | `{colors.status-claim.pending}` |
| Claim approved | check | `{colors.status-claim.approved}` |
| Claim rejected (admin) | x | `{colors.status-claim.rejected}` |
| Claim auto-rejected | x-circle | `{colors.status-claim.rejected}` |
| Returned (default) | package-check | `{colors.status-report.returned}` |
| Returned (substitute) | package-check (variant) | `{colors.status-report.returned}` |
| Registration approved | user-check | `{colors.status-account.active}` |
| Registration rejected | user-x | `{colors.status-account.rejected}` |
| Account deactivated | lock | `{colors.status-account.deactivated}` |
| Message posted in thread | message-circle | `{colors.light.on-surface-variant}` |

### 17.5 Member-facing status history

Per PRD FR-32, members see a *member-facing* status history on their own items: current status and last-action timestamp. UX implementation:

- A short list (most recent first, max 3 entries).
- Each row: timestamp, status label, "by {actor}" (no audit verb, no additional fields).
- A "View full status" disclosure at the bottom — but PRD FR-32 says the full audit trail is admin-only, so the disclosure is *not* shown to members. Members see only the member-facing status history.

### 17.6 Audit access log (PRD §10 Observability)

The PRD requires audit-trail reads to be logged separately from the audit trail. UX does not surface this log to administrators in MVP; it is a backend concern. (If exposed later, it would be in `/admin/access-logs`, but that surface is not in MVP.)

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
- **Toasts** — decision rule (Finding E3): successful non-blocking actions (filters cleared, draft saved) use `role="status"` (polite); validation or session errors use `role="alert"` (assertive).
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
| Claim review (admin) | Two-column | Two-column (narrower) | Single column; sections stack |
| Competing claims | Side-by-side compare | Side-by-side compare (narrower) | Tabs (`Claim A` / `Claim B`) |
| Message thread | Thread + composer stacked | Same | Same; composer pins to bottom on focus |
| Confirm Returned | Two-column | Two-column (narrower) | Single column |
| Audit trail | List view | List view | List view; details collapse |
| Administrator dashboard | 3 count cards in a row | 3 cards in a row | Cards stack |
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

### 22.3 Open Questions forwarded without resolution

| OQ | Owner | UX recommendation |
|---|---|---|
| OQ-1 (Campus area enum) | Architecture | UX renders the list as a native select; the list itself comes from deployment configuration. |
| OQ-2 (Image storage budget) | Architecture | UX caps at 5 MB / JPEG/PNG/WebP per FR-8. No UX change needed. |
| OQ-3 (Date lost beyond 365 days) | PM | UX supports a server-side override if PM relaxes the rule; no UX change otherwise. |
| OQ-4 (Per-claim thread read-only point) | PM | **Section 13.5 recommends closing the thread at `Returned` as well.** PM decides. |
| OQ-5 (Auto-rejection message wording) | UX | **Section 4.4 recommends a softer user-facing email and a neutral banner on the claim detail screen.** Audit reason preserved verbatim. |

---

## 23. Open UX Questions Surfaced (additional)

These are surfaced by UX for PM/Architecture follow-up. None are blockers for downstream story creation; all are documented to preserve traceability.

- **UX-OQ-A: Empty email-state handling.** If a user's email bounces (PRD FR-27/28/29), no UX surface in MVP surfaces this to administrators. Should the administrator item page indicate "claimant's email is bouncing"? Recommendation: *defer to v2; not in MVP.* Logged here so it isn't lost.
- **UX-OQ-B: Approve claim after status has changed.** If the administrator's screen shows a Pending claim and another admin approves it while Riley is reading, the server-side conflict response handles it (Section 6.4). UX recommends a 5-second `stale-data` poll on the review screen to surface the conflict sooner. Architecture owns the polling mechanism.
- **UX-OQ-C: Audit trail length.** With 10,000 reports × 50 events (PRD NFR target), the audit trail could be long. UX uses reverse-chronological pagination (load 25, "Load older" button). No infinite scroll (which can confuse screen readers).
- **UX-OQ-D: Substitute receiver and identity.** PRD §5 explicitly defers identity verification. UX surfaces this in the substitute-receiver form: "The administrator's affirmation is the entire confirmation mechanism. No identity check is performed." Helps members understand the boundary.

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
| FR-10 (Delete Own Report, claim-free) | §10.4 |
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

### 24.2 User journeys

| UJ | Coverage |
|---|---|
| UJ-1 (Maya reports a lost wallet) | §8.1 |
| UJ-2 (Sam finds a phone) | §8.2 |
| UJ-3 (Alex registers and is approved) | §8.3 |
| UJ-4 (Riley handles operational work) | §8.4 |

### 24.3 Product principles

| Principle | UX translation |
|---|---|
| Simple | §1.2; one primary action per screen; native controls; helper text concise |
| Trustworthy | §11.4 (visibility is intentional); audit trail visible to admins; no silent state changes |
| Clear | §5.8 (every status has color + icon + text); §4.2 (canonical status labels) |

### 24.4 PRD-author decisions

| Decision | Coverage |
|---|---|
| D1 (Per-claim message thread) | §13 |
| D2 (Sensitive / public / member-facing visibility) | §11 |
| D3 (Approve-one-auto-reject-others) | §12.5, §6.4 |
| D4 (Pending registration review queue) | §15.2 |

### 24.5 Non-goals (no UX affordance introduced)

Cross-checked against PRD §5. None introduced. Specifically:

- No automatic match suggestions (no "suggested matches" UI surface anywhere).
- No in-app notifications.
- No proof-of-ownership uploads (the report form's image field is the item photo, not a receipt/serial — UX copy reinforces this).
- No native mobile.
- No real-time chat features in the thread (Section 13).
- No identity verification (Section 14, UX-OQ-D).
- No internationalization toggle (en-US only in MVP).
- No auto-expiry or stale-report reminders.

### 24.6 Visual identity

The baseline brief explicitly defers brand and visual identity to this UX phase. DESIGN.md authors all tokens from first principles. There is no existing baseline visual decision to preserve or contradict.

### 24.7 Contradictions / gaps detected

- **None.** The PRD is internally consistent with the brief. The brief's "Brand and visual identity deferred" line is the only visual reference in upstream artifacts; UX honors it.
- The only deliberate UX *recommendation* that proposes a PRD-text change is **OQ-4** (read-only at `Returned`). This is flagged for PM (Section 22.3).
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
| Audit access log | (administrator-only, not surfaced in MVP) | n/a |

---

## 26. What's next

This document plus `DESIGN.md` complete the UX phase. Hand off to:

1. **`bmad-architecture`** — Architecture owns: database schema, API contracts, image storage, email provider, session implementation, concurrency, audit-trail storage, campus area enum configuration.
2. **`bmad-create-epics-and-stories`** — Epic / story authoring can begin against the FR-1..FR-39 traceability in §24.
3. **`bmad-sprint-planning`** — Sprint sequencing follows the user journeys in §8.
4. **`bmad-build`** — Implementation. Spines are the contract; key-screen mocks in `mockups/` (promoted at Finalize) are an additional reference for visual surfaces.

---

*End of EXPERIENCE.md.*
