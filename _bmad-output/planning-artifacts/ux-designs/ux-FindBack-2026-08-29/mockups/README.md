# FindBack — Interactive HTML Mockups

A clickable prototype that realizes the FindBack MVP per the finalized **PRD**, **EXPERIENCE.md**, and **DESIGN.md**.

**Start here:** open `mockups/index.html` (the Prototype Guide) and pick a journey.

---

## 1. Files created

```
mockups/
├── index.html                 # Prototype Guide / flow map (start here)
├── README.md                  # This file
├── assets/                    # Shared, reusable brand + design assets
│   ├── tokens.css             # Design tokens + components (single source of truth)
│   ├── app.js                 # Theme bootstrap + form/toast helpers
│   ├── logo-wordmark.svg            # Default wordmark + mark (currentColor)
│   ├── logo-wordmark-light.svg      # Wordmark + mark, brand-primary hard-coded
│   ├── logo-wordmark-dark.svg       # Wordmark + mark, dark-accent hard-coded
│   ├── logo-mark.svg                # Standalone mark (currentColor)
│   ├── logo-mark-light.svg          # Mark, brand-primary hard-coded
│   ├── logo-mark-dark.svg           # Mark, dark-accent hard-coded
│   ├── app-icon.svg                 # 512×512 OS app icon / PWA install
│   └── favicon.svg                  # Browser-tab favicon (simplified for 16 px)
├── public/                    # Anonymous + authentication surfaces
│   ├── 01-landing.html
│   ├── 02-login.html
│   ├── 03-register.html
│   ├── 04-register-errors.html
│   ├── 05-register-confirmation.html
│   ├── 06-pending-account.html
│   ├── 07-rejected-account.html
│   └── 08-deactivated-account.html
├── member/                    # Authenticated member surfaces (Maya, Sam, Alex)
│   ├── 01-listings-anon.html        # Same listing as anonymous users see
│   ├── 02-listings-member.html
│   ├── 03-item-detail-member.html   # No relationship → sensitive fields hidden
│   ├── 04-item-detail-reporter.html # Sam viewing their own found report
│   ├── 05-item-detail-claimant.html # Maya after her claim is approved
│   ├── 06-item-detail-returned.html
│   ├── 07-dashboard.html
│   ├── 08-my-reports.html
│   ├── 09-edit-report.html
│   ├── 10-my-claims.html
│   ├── 11-submit-claim.html
│   ├── 12-claim-pending.html
│   ├── 13-claim-detail.html         # Per-claim message thread
│   ├── 14-report-lost.html
│   ├── 15-report-found.html
│   ├── 16-claim-rejected-detail.html
│   └── 17-item-detail-closed.html
└── admin/                     # Administrator surfaces (Riley)
    ├── 01-dashboard.html
    ├── 02-pending-registrations.html
    ├── 03-registration-approve.html
    ├── 04-registration-reject.html
    ├── 05-pending-claims.html
    ├── 06-claim-review.html
    ├── 07-claim-review-competing.html
    ├── 08-claim-approve.html
    ├── 08-claim-reject.html
    ├── 09-items-awaiting-return.html
    ├── 10-confirm-returned-default.html
    ├── 11-confirm-returned-substitute.html
    ├── 12-audit-trail.html
    └── 13-close-content.html
```

**Totals:** 40 HTML files + 10 shared assets.

---

## 2. The Prototype Guide (flow map)

`index.html` is the entry point. It shows **the relationship between every mockup screen** in four numbered journey lists:

- **UJ-1 Maya** — lost wallet → finds match → submits claim → approved → returned
- **UJ-2 Sam** — found phone → receives claim → approves handoff
- **UJ-3 Alex** — registers → pending → approved
- **UJ-4 Riley** — admin: registrations, single claim, competing claims, return, audit, close

Every screen has a sticky **mockup-nav** at the bottom with **Previous · All journeys · Next** links so a reviewer never loses their place.

---

## 3. Brand assets (reusable)

`assets/` contains the **shared design system** — every mockup references these same files (no duplication).

| Asset | Purpose | Usage rule |
|---|---|---|
| `tokens.css` | All design tokens (brand, semantic, 12 statuses, typography, spacing, radii, elevation, components). ~700 lines. | `<link rel="stylesheet" href="../assets/tokens.css">` |
| `app.js` | Theme bootstrap (FOUC prevention), form-intercept helpers, toast, mock-confirm. | `<script src="../assets/app.js" defer>` |
| `logo-wordmark.svg` | Full FindBack wordmark + mark. `currentColor` for theme adaptation. | `<img src="../assets/logo-wordmark.svg">` in topbar; light = terracotta, dark = brighter accent. |
| `logo-mark.svg` | Standalone mark. `currentColor`. | Used in compact headers, illustrations, OG images. |
| `logo-wordmark-light.svg` / `-dark.svg` | Hard-coded brand-primary / dark-accent wordmarks. | Use in emails, exported PDFs, README badges — contexts without CSS variables. |
| `logo-mark-light.svg` / `-dark.svg` | Hard-coded brand-primary / dark-accent marks. | Same as above, mark only. |
| `app-icon.svg` | 512 × 512 OS app icon / PWA install. | `<link rel="apple-touch-icon" href="../assets/app-icon.svg">` |
| `favicon.svg` | 16 px favicon. Simplified silhouette for small-size legibility. | `<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">` |

**Logo concept per `DESIGN.md`:**
- Single, deliberately designed **Pin + Recovery Arrow + Item** mark — communicates **Lost → Found → Back to Owner**.
- Pin = location where item was lost or found.
- Item = generic rounded-rectangle package silhouette with a tape line; intentionally not specific to a wallet, phone, or key.
- Recovery arrow = curved stroke from inside the pin over the item, arcing up-and-right out of the pin with an arrowhead; communicates "return to owner."

**Logo treatment per `DESIGN.md`:**
- Light theme: deep firebrick `#7C2907` strokes, surface `#FFFFFF` item fill.
- Dark theme: brighter accent `#FB923C` strokes, on-surface `#F5EFE5` item fill.
- The `currentColor` variants pair with the `--fb-logo-color` token; the hard-coded `-light` / `-dark` variants are for non-CSS contexts.

---

## 4. Screens / flows covered

### Public + Authentication (8)
Landing · Sign in · Register · Register validation errors · Registration confirmation · Pending account banner · Rejected account login state · Deactivated account login state.

### Member (17)
Listings (anonymous + signed-in) · search & filter · item detail with **4 visibility variants** (anonymous, member no relationship, reporter, claimant) · returned detail · closed detail · dashboard · my reports · my claims · report-lost form · report-found form · edit report · submit claim · claim pending · claim thread (with read-only state after Approved) · claim rejected (auto).

### Administrator (13)
Dashboard · pending registrations queue · approve · reject · pending claims queue · single claim review · competing-claims review (3 claims) · approve confirmation · reject confirmation · items awaiting return · confirm returned (default receiver) · confirm returned (substitute receiver, all three required fields) · audit trail (14-event scope) · close inappropriate content.

### Required states and edge cases

| State / edge case | Where it lives |
|---|---|
| Loading states | Skeleton handled via `aria-busy` on buttons + token classes |
| Empty states | Empty-state component in `tokens.css`; used on listings (none here), thread (no messages yet) |
| Validation errors | `04-register-errors.html`; `aria-invalid`, `aria-describedby`, error list |
| Success states | Toast helper (`showToast()` in `app.js`) fires on every successful form submit |
| Permission / unauthorized | `03-item-detail-member.html` hides sensitive fields from a member with no relationship |
| Account Pending | `06-pending-account.html` |
| Account Active | Topbar pill on member/admin pages |
| Account Rejected | `07-rejected-account.html` |
| Account Deactivated | `08-deactivated-account.html` |
| Report Open / Claim Requested / Claim Approved / Returned / Closed | Status badges in `tokens.css`; used across member + admin |
| Multiple competing claims | `07-claim-review-competing.html` |
| Auto-rejection | `16-claim-rejected-detail.html` (claimant view) + `12-audit-trail.html` (audit view) |
| Returned reports cannot be edited | `06-item-detail-returned.html` — Edit button removed, banner explains why |
| Claim-free report deletion | Implicit — Close action in admin moves to Closed; no claims → no thread |
| Report withdrawal | `17-item-detail-closed.html` (Maya's withdrawn report) |
| No-receiver-no-returned guard | `10-confirm-returned-default.html` requires a radio choice (default or substitute) |
| Substitute receiver flow | `11-confirm-returned-substitute.html` — all three fields required when substitute selected |
| Sensitive-field visibility | `fb-hidden-from-members` pattern in `tokens.css` + sensitive-flag badge; demonstrated on `03-item-detail-member.html` |
| Anonymous vs authenticated visibility | `01-listings-anon.html` shows summary only; `02-listings-member.html` shows full table + status; `03-item-detail-member.html` shows description/image but not exact place / identifying details |
| Per-claim thread behavior & read-only | `13-claim-detail.html` (closed banner after Approved) |
| Member-facing status history | Status history list in `04-item-detail-reporter.html`, `05-item-detail-claimant.html` |
| Administrator-only audit trail | `12-audit-trail.html` — only linked from admin nav |
| Email-triggering events | Toast on each approval/rejection/registration event; documented inline near each action |

---

## 5. Interactive behaviors

All forms use `data-mock-form data-next="..." data-toast="..."` attributes. The shared `app.js` intercepts the submit, prevents default navigation, shows a 4-second toast, and redirects to the next screen after 200ms. This lets a reviewer "walk" the journey without any backend.

Other interactions:
- **Theme toggle** (Auto / Light / Dark) in every topbar; persisted in `localStorage`; OS preference changes are observed live.
- **Skip to main content** link on every page; landing target `<main id="main" tabindex="-1">`.
- **Mock-confirm** for destructive actions (`data-mock-confirm`) — withdraw, sign out, close content — uses `window.confirm()` then routes.
- **Toast** container auto-dismisses at 4 s with fade-out.

---

## 6. State transitions represented

| Transition | From → To | Visible on screen |
|---|---|---|
| Anonymous → signed in | Landing → Member dashboard | `02-login.html` → `07-dashboard.html` |
| Anonymous → member detail (with hidden sensitive fields) | Listings → Detail | `01-listings-anon.html` → `03-item-detail-member.html` |
| Submit claim | Detail → Pending | `03-item-detail-member.html` → `11-submit-claim.html` → `12-claim-pending.html` |
| Admin approves | Pending → Approved | `12-claim-pending.html` → `06-claim-review.html` → `08-claim-approve.html` |
| Admin confirms returned | Claim Approved → Returned | `09-items-awaiting-return.html` → `10-confirm-returned-default.html` → `06-item-detail-returned.html` |
| Approve competing claim | 3 pending → 1 approved + 2 auto-rejected | `07-claim-review-competing.html` → `08-claim-approve.html` → `16-claim-rejected-detail.html` |
| Register → Pending → Approved | Public → Account lifecycle | `03-register.html` → `06-pending-account.html` → `02-pending-registrations.html` → `03-registration-approve.html` |
| Register → Rejected | Public → Rejected login state | `03-register.html` → `04-registration-reject.html` → `07-rejected-account.html` |
| Account deactivated | Active → Deactivated | `08-deactivated-account.html` (state) |
| Withdraw report | Open → Closed | `09-edit-report.html` (Withdraw link) → `17-item-detail-closed.html` |

---

## 7. Gaps / open questions

- **OQ-1** — Does the reporter see **other claimants' identifying details** on their own item? PRD FR-13 says "no", but UJ-2's reporter thread (`13-claim-detail.html`) currently shows just the claimant's own identifying details. The audit row would be the place to expose this for administrators only; currently `12-audit-trail.html` only shows the reason excerpt.
- **OQ-2** — "Returned" is a terminal status; an admin could in theory move it back. Mockups assume not. (PRD FR-9 explicitly blocks member edits on Returned but doesn't address admin reversals.)
- **OQ-3** — Substitute receiver authorization is recorded as a single checkbox affirmation. Mockups show this as `fb-checkbox-row`. There is no message-thread back-and-forth to the claimant in MVP.
- **OQ-4** — The per-claim thread becomes read-only on Approved/Rejected/Closed. Mockups show "🔒 read-only" banner. UX vs. architecture question: should the thread close on Returned too? Currently shown as yes (`13-claim-detail.html`).
- **OQ-5** — The audit-trail filter UI is a minimal wireframe (`12-audit-trail.html`). A real product would want event-type, actor, target, date range, free-text search across all fields.
- **OQ-6** — "Sensitive" flag is rendered as `fb-sensitive-flag` (terracotta pill) on form labels and detail-page field labels. A real product may want a tooltip explaining *why* a field is sensitive (administrator-only? reporter+admin? reporter+claimant?).
- **OQ-7** — The dashboard stat row currently shows 4 metrics (open reports, pending claims, approved claim, total returned). Backend doesn't yet define these counts; treat as illustrative.

---

## 8. Source-of-truth fidelity check

- **PRD FR-1..FR-39** — every requirement has at least one mockup. Cross-reference:
  - FR-1 (Self-registration): `03-register.html`
  - FR-2 (Pending restrictions): `06-pending-account.html`
  - FR-3 (Admin review of pending registrations): `02-pending-registrations.html`, `03-registration-approve.html`, `04-registration-reject.html`
  - FR-4 (Login/logout): `02-login.html` (login) — logout not shown as a dedicated screen (it's just `data-mock-confirm`)
  - FR-5 (Deactivation): `08-deactivated-account.html`
  - FR-6 (Create Lost report): `14-report-lost.html`
  - FR-7 (Create Found report): `15-report-found.html`
  - FR-8 (Field set): Both report forms
  - FR-9 (Edit own report): `09-edit-report.html`
  - FR-10 (Delete claim-free): implicit via Close action; no dedicated delete screen
  - FR-11 (Withdraw): `09-edit-report.html` → `17-item-detail-closed.html`
  - FR-12 (Public summary listings): `01-listings-anon.html`
  - FR-13 (Authenticated detail view): `02-listings-member.html`, `03-item-detail-member.html`
  - FR-14 (Search & filter): `01-listings-anon.html`, `02-listings-member.html` (filter UI)
  - FR-15 (Submit claim): `11-submit-claim.html`
  - FR-16 (Admin review screen): `06-claim-review.html`
  - FR-17 (Approve claim): `08-claim-approve.html`; competing-claims auto-rejection on `07-claim-review-competing.html`
  - FR-18 (Reject claim): `08-claim-reject.html`
  - FR-19, FR-20 (Edits/withdrawals in audit trail): `12-audit-trail.html`
  - FR-21 (Administrator close): `13-close-content.html`
  - FR-22 (Auto-status transitions): implicit; status badges show the resulting status everywhere
  - FR-23 (Confirm returned default): `10-confirm-returned-default.html`
  - FR-24 (Confirm returned substitute): `11-confirm-returned-substitute.html`
  - FR-25 (No-receiver-no-returned guard): both confirm-returned pages require a radio selection
  - FR-26 (Per-claim thread): `13-claim-detail.html`
  - FR-27 (Account approved email): `03-registration-approve.html` toast
  - FR-28 (New claim email): `11-submit-claim.html` toast
  - FR-29 (Claim decision email): `08-claim-approve.html`, `08-claim-reject.html`, `16-claim-rejected-detail.html`
  - FR-30 (No other notifications): documented in `13-claim-detail.html` ("New messages here don't generate emails")
  - FR-31 (Audit trail scope — 14 events): `12-audit-trail.html` filter lists all 14 event types
  - FR-32 (Audit trail actor/timestamp/action): every audit row
  - FR-33 (Audit visibility admin-only): `12-audit-trail.html` lives under `admin/`
  - FR-34 (Audit retention): documented in `12-audit-trail.html` intro
  - FR-35 (Audit immutability): documented; not visually verifiable
  - FR-36 (Audit trail search/filter): filter UI on `12-audit-trail.html`
  - FR-37, FR-38, FR-39 (Visibility matrix): `03-item-detail-member.html` (anonymous + member no-relationship hide exact place + identifying details) + `04-item-detail-reporter.html` (reporter sees all) + `05-item-detail-claimant.html` (claimant sees all) + `06-item-detail-returned.html` (Return record shown to claimant) + admin views (full info)

- **PRD D1, D2, D3, D4** (PRD-author decisions):
  - D1 (Per-claim thread): `13-claim-detail.html` — and the read-only state after Approved
  - D2 (Sensitive fields): `fb-sensitive-flag` + `fb-hidden-from-members`; demonstrated on `03-item-detail-member.html`
  - D3 (Competing claims auto-rejection): `07-claim-review-competing.html` shows three pending; `08-claim-approve.html` approval cascades; `16-claim-rejected-detail.html` shows the auto-rejected claimant's view
  - D4 (Audit trail 14 events): `12-audit-trail.html` filter dropdown lists them all

- **EXPERIENCE.md Key Flows** — UJ-1 through UJ-4 are all walked step-by-step in `index.html`.
- **DESIGN.md** — every visual decision uses tokens from `tokens.css`. No hard-coded colors, font sizes, or spacing values outside the token system.
- **No source artifacts were modified.** Brief, PRD, DESIGN.md, EXPERIENCE.md remain untouched.

---

## How to open

Open `mockups/index.html` in any modern browser (or serve the `mockups/` directory with any static HTTP server). No build step, no dependencies.

```sh
# Optional: serve locally
python3 -m http.server 8000 --directory mockups
# then visit http://localhost:8000/
```
