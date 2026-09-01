---
title: "DESIGN.md — FindBack"
status: final
created: 2026-08-29
updated: 2026-08-29
project: FindBack
run: ux-FindBack-2026-08-29
spec: https://github.com/google-labs-code/design.md
experience: ./EXPERIENCE.md
---

name: FindBack
brand: "FindBack"
style: "Warm & trustworthy"

colors:
  # ── Brand ────────────────────────────────────────────────────────────────
  brand:
    primary: "#7C2907"          # Deep firebrick — single warm accent. Bold enough to read as a CTA from any viewing distance.
    primary-hover: "#5C1F05"
    primary-active: "#3D1403"
    primary-soft: "#FFE7D6"      # Soft fill for primary backgrounds
    on-primary: "#FFFFFF"

    secondary: "#1E5A4E"        # Deep evergreen — supportive, trustworthy
    secondary-hover: "#16463C"
    secondary-active: "#0F352C"
    secondary-soft: "#D6EBE5"
    on-secondary: "#FFFFFF"

  # ── Light theme surfaces ────────────────────────────────────────────────
  light:
    background: "#FAF7F2"        # Warm off-white "linen"
    surface: "#FFFFFF"           # Pure surface (cards, modals)
    surface-dim: "#F2EDE4"       # Slightly recessed surface
    surface-raised: "#FFFFFF"
    surface-container-low: "#F7F2EA"
    surface-container: "#F2EDE4"
    surface-container-high: "#ECE5D9"
    surface-overlay: "#00000080" # Modal scrim

    on-background: "#1F1B16"     # Primary text on warm canvas
    on-surface: "#1F1B16"
    on-surface-variant: "#5C5246"  # Secondary text

    border-subtle: "#E7DFD1"
    border-default: "#D1C5B0"
    border-strong: "#9A8E78"

    focus-ring: "#7C2907"        # Same as primary for consistency
    focus-ring-offset: "#FAF7F2"

    disabled-bg: "#ECE5D9"
    disabled-text: "#9A8E78"

    link: "#1E5A4E"
    link-hover: "#16463C"
    link-visited: "#5A3A6E"

  # ── Dark theme surfaces ─────────────────────────────────────────────────
  dark:
    background: "#161310"         # Warm-tinted near-black
    surface: "#211C18"
    surface-dim: "#1B1613"
    surface-raised: "#2A241F"
    surface-container-low: "#1F1A16"
    surface-container: "#251F1A"
    surface-container-high: "#2D2620"
    surface-overlay: "#000000B3"

    on-background: "#F5EFE5"      # Warm white text
    on-surface: "#F5EFE5"
    on-surface-variant: "#C4B8A4"

    border-subtle: "#2D2620"
    border-default: "#3D352C"
    border-strong: "#5C5246"

    focus-ring: "#FB923C"         # Brighter accent on dark
    focus-ring-offset: "#161310"

    disabled-bg: "#251F1A"
    disabled-text: "#5C5246"

    link: "#7BC9B5"
    link-hover: "#A1DCCB"
    link-visited: "#C2A1D5"

  # ── Semantic feedback ────────────────────────────────────────────────────
  semantic:
    success: "#2D7A4F"
    success-soft: "#D6F0DF"
    on-success: "#FFFFFF"

    warning: "#B45309"
    warning-soft: "#FFE7D6"
    on-warning: "#FFFFFF"

    error: "#B91C1C"
    error-soft: "#FDE2E2"
    on-error: "#FFFFFF"

    info: "#1E5A8E"
    info-soft: "#D6E8F5"
    on-info: "#FFFFFF"

  # ── Status colors (report lifecycle) ────────────────────────────────────
  status-report:
    open:          { fg: "#7C2907", soft: "#FFE7D6", icon: "#7C2907" }
    claimRequested:{ fg: "#7C2907", soft: "#FFE7D6", icon: "#7C2907" }
    claimApproved: { fg: "#7C2D12", soft: "#FEF3C7", icon: "#B45309" }
    returned:      { fg: "#1E5A4E", soft: "#D6EBE5", icon: "#2D7A4F" }
    closed:        { fg: "#5C5246", soft: "#ECE5D9", icon: "#9A8E78" }

  # ── Status colors (claim) ────────────────────────────────────────────────
  status-claim:
    pending:  { fg: "#7C2D12", soft: "#FEF3C7", icon: "#B45309" }
    approved: { fg: "#1E5A4E", soft: "#D6EBE5", icon: "#2D7A4F" }
    rejected: { fg: "#7F1D1D", soft: "#FDE2E2", icon: "#B91C1C" }

  # ── Status colors (account) ──────────────────────────────────────────────
  status-account:
    pending:     { fg: "#7C2D12", soft: "#FEF3C7", icon: "#B45309" }
    active:      { fg: "#1E5A4E", soft: "#D6EBE5", icon: "#2D7A4F" }
    rejected:    { fg: "#7F1D1D", soft: "#FDE2E2", icon: "#B91C1C" }
    deactivated: { fg: "#5C5246", soft: "#ECE5D9", icon: "#9A8E78" }

typography:
  # Use system fonts for performance + trust (no FOUT, no licensing burden)
  # Modern system stack tuned for legibility at body sizes.
  font-sans:
    family: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

  display-lg:
    fontFamily: "system-ui"
    fontSize: "44px"
    fontWeight: "700"
    lineHeight: "1.15"
    letterSpacing: "-0.02em"

  display-lg-mobile:
    fontFamily: "system-ui"
    fontSize: "32px"
    fontWeight: "700"
    lineHeight: "1.15"

  headline-lg:
    fontFamily: "system-ui"
    fontSize: "32px"
    fontWeight: "700"
    lineHeight: "1.2"
    letterSpacing: "-0.015em"

  headline-lg-mobile:
    fontFamily: "system-ui"
    fontSize: "26px"
    fontWeight: "700"
    lineHeight: "1.2"

  headline-md:
    fontFamily: "system-ui"
    fontSize: "24px"
    fontWeight: "600"
    lineHeight: "1.25"

  headline-md-mobile:
    fontFamily: "system-ui"
    fontSize: "20px"
    fontWeight: "600"
    lineHeight: "1.25"

  headline-sm:
    fontFamily: "system-ui"
    fontSize: "20px"
    fontWeight: "600"
    lineHeight: "1.3"

  title-md:
    fontFamily: "system-ui"
    fontSize: "16px"
    fontWeight: "600"
    lineHeight: "1.4"

  body-lg:
    fontFamily: "system-ui"
    fontSize: "17px"
    fontWeight: "400"
    lineHeight: "1.55"

  body-md:
    fontFamily: "system-ui"
    fontSize: "15px"
    fontWeight: "400"
    lineHeight: "1.55"

  body-sm:
    fontFamily: "system-ui"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "1.5"

  label:
    fontFamily: "system-ui"
    fontSize: "14px"
    fontWeight: "500"
    lineHeight: "1.4"

  label-caps:
    fontFamily: "system-ui"
    fontSize: "12px"
    fontWeight: "600"
    lineHeight: "1.4"
    letterSpacing: "0.06em"
    textTransform: "uppercase"

  caption:
    fontFamily: "system-ui"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "1.4"

  helper:
    fontFamily: "system-ui"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "1.4"
    color-ref: "on-surface-variant"

  error-text:
    fontFamily: "system-ui"
    fontSize: "13px"
    fontWeight: "500"
    lineHeight: "1.4"
    color-ref: "semantic.error"

  status-text:
    fontFamily: "system-ui"
    fontSize: "13px"
    fontWeight: "600"
    lineHeight: "1.4"

rounded:
  none: "0"
  sm: "6px"
  DEFAULT: "10px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  full: "9999px"

spacing:
  unit: "4px"            # Base unit; everything is a multiple of 4px
  gutter: "24px"         # Default horizontal/vertical gap between components
  container-max: "1024px" # Max content width on detail pages
  container-narrow: "640px" # Form max width (single-column)
  margin-mobile: "16px"
  margin-tablet: "24px"
  margin-desktop: "32px"
  section-gap: "48px"    # Vertical gap between major page sections

elevation:
  0: "none"
  1: "0 1px 2px 0 rgba(31, 27, 22, 0.06), 0 1px 3px 0 rgba(31, 27, 22, 0.04)"
  2: "0 2px 4px 0 rgba(31, 27, 22, 0.08), 0 4px 8px 0 rgba(31, 27, 22, 0.04)"
  3: "0 4px 8px 0 rgba(31, 27, 22, 0.10), 0 8px 16px 0 rgba(31, 27, 22, 0.06)"
  4: "0 8px 16px 0 rgba(31, 27, 22, 0.12), 0 16px 32px 0 rgba(31, 27, 22, 0.08)"

components:
  button:
    height-sm: "32px"
    height-md: "44px"      # Default size clears 44x44 touch-target floor (PRD NFR)
    height-lg: "48px"
    min-width: "44px"      # Touch target floor (WCAG 2.1 AA)
    padding-x-sm: "12px"
    padding-x-md: "16px"
    padding-x-lg: "20px"
    radius: "{rounded.md}"
    font-weight: "600"

  input:
    height: "44px"          # Min touch target
    padding-x: "14px"
    radius: "{rounded.md}"
    border-width: "1px"
    border-color-default: "{colors.light.border-default}"
    border-color-focus: "{colors.brand.primary}"

  textarea:
    min-height: "96px"
    padding-x: "14px"
    padding-y: "12px"
    radius: "{rounded.md}"

  card:
    radius: "{rounded.lg}"
    padding: "20px"
    elevation: "{elevation.1}"

  badge:
    radius: "{rounded.full}"
    padding-x: "10px"
    padding-y: "3px"
    font-size: "{typography.status-text.fontSize}"
    font-weight: "600"

  modal:
    radius: "{rounded.lg}"
    padding: "24px"
    elevation: "{elevation.3}"
    max-width: "520px"

  avatar:
    size-sm: "24px"
    size-md: "32px"
    size-lg: "40px"
    radius: "{rounded.full}"

  status-icon:
    size: "16px"

  focus-ring:
    width: "2px"
    color: "{colors.light.focus-ring}"
    offset: "2px"

breakpoints:
  mobile: "0px"
  tablet: "640px"
  desktop: "1024px"
  wide: "1280px"

container:
  max-width: "1024px"   # Default content container
  narrow: "640px"       # Single-column forms
  wide: "1280px"        # Admin queues / audit trail

icon:
  stroke-width: "1.75"
  size-sm: "16px"
  size-md: "20px"
  size-lg: "24px"

logo:
  concept: "Pin + Recovery Arrow + Item — Lost → Found → Back to Owner"
  wordmark:
    currentColor: "/assets/logo-wordmark.svg"   # uses currentColor; pairs with CSS theme tokens
    light: "/assets/logo-wordmark-light.svg"   # hard-coded brand primary for non-CSS contexts
    dark: "/assets/logo-wordmark-dark.svg"     # hard-coded dark-theme accent for non-CSS contexts
  mark:
    currentColor: "/assets/logo-mark.svg"      # uses currentColor; pairs with CSS theme tokens
    light: "/assets/logo-mark-light.svg"       # hard-coded brand primary
    dark: "/assets/logo-mark-dark.svg"         # hard-coded dark-theme accent
  favicon: "/assets/favicon.svg"
  app-icon: "/assets/app-icon.svg"

imagery:
  use-real-photos-only: true
  stock-ilustrations: false   # Avoid stock illustrations (PRD §3 tone — calm, no fanfare)
  icons-only: true

animation:
  duration-fast: "120ms"
  duration-base: "200ms"
  duration-slow: "320ms"
  easing-standard: "cubic-bezier(0.2, 0, 0, 1)"
  easing-emphasis: "cubic-bezier(0.3, 0, 0.1, 1)"
  respect-prefers-reduced-motion: true

scrollbar:
  width: "10px"
  track-color: "{colors.light.surface-container}"
  thumb-color: "{colors.light.border-default}"
  thumb-color-hover: "{colors.light.border-strong}"

---

## Brand & Style

**FindBack** is the place each organization uses to return things to its members. The brand voice is **warm, trustworthy, and clear** — three product principles carried into every pixel.

**Style direction:** **Warm Minimalism**. Off-white linen backgrounds, generous spacing, rounded organic geometry, and a single warm accent (terracotta) used sparingly. We avoid the clinical feel of pure white-on-blue SaaS — FindBack should feel like a community ledger, not a tech platform.

**Why warm.** Items in FindBack carry a small human weight — a lost wallet, a found phone. The interface should treat that weight with respect. Cool, corporate, or "techy" palettes distance the user from the act of reuniting people with their things. Warm neutrals + a terracotta accent borrow from printed notebooks, library cards, and physical lost-and-found boxes.

**Why trustworthy.** The product handles sensitive information. Visual restraint signals that we are not extracting attention from the user. We do not chase delight with motion or color; we earn trust with clarity, hierarchy, and visible safeguards (Sensitive flags, audit trails).

**Why clear.** Every status has a color, an icon, and a text label — never color alone. Type hierarchy is conservative (one display weight, two body weights). Spacing is generous and rhythmic.

**Voice in language:** Plain English. Active voice. No exclamation marks. No emojis. Internal state names never surface to users verbatim (we use "Returned" not "Closed by administrator" outside admin views).

---

## Colors

### Brand

- **Deep firebrick `#7C2907`** — primary brand accent. Used for primary buttons, primary links, focus rings, and key status indicators (Open, Claim Requested). It is warm but bold enough that white text reads against it with 9.65:1 contrast (AAA) — the same punch the previous hover state had is now available in the resting state. Use sparingly — one firebrick accent per visible viewport where possible.
- **Evergreen `#1E5A4E`** — secondary brand color. Used for Returned status, success-adjacent affordances, and supporting links. It signals "good outcome" without competing with terracotta for attention.

### Light theme

| Token | Hex | Use |
|---|---|---|
| `background` | `#FAF7F2` | Page background — warm linen |
| `surface` | `#FFFFFF` | Cards, modals, popovers |
| `surface-dim` | `#F2EDE4` | Recessed surface (e.g., table header row) |
| `surface-container-low` | `#F7F2EA` | Subtle alternate row |
| `surface-container` | `#F2EDE4` | Side panel, secondary container |
| `surface-container-high` | `#ECE5D9` | Hover state on surfaces |
| `surface-overlay` | `#00000080` | Modal scrim |
| `on-background` | `#1F1B16` | Primary text |
| `on-surface-variant` | `#5C5246` | Secondary text, helper text |
| `border-subtle` | `#E7DFD1` | Card edges, dividers |
| `border-default` | `#D1C5B0` | Form inputs, table borders |
| `border-strong` | `#9A8E78` | Hover borders, strong dividers |
| `focus-ring` | `#7C2907` | Visible focus indicator |
| `disabled-bg` | `#ECE5D9` | Disabled controls |
| `disabled-text` | `#9A8E78` | Disabled text |

### Dark theme

| Token | Hex | Use |
|---|---|---|
| `background` | `#161310` | Page background — warm-tinted near-black |
| `surface` | `#211C18` | Cards, modals, popovers |
| `surface-dim` | `#1B1613` | Recessed surface |
| `surface-raised` | `#2A241F` | Elevated surfaces (menus) |
| `surface-container-low` | `#1F1A16` | Subtle alternate row |
| `surface-container` | `#251F1A` | Side panel |
| `surface-container-high` | `#2D2620` | Hover state |
| `surface-overlay` | `#000000B3` | Modal scrim |
| `on-background` | `#F5EFE5` | Primary text — warm white |
| `on-surface-variant` | `#C4B8A4` | Secondary text |
| `border-subtle` | `#2D2620` | Card edges |
| `border-default` | `#3D352C` | Form inputs |
| `border-strong` | `#5C5246` | Hover borders |
| `focus-ring` | `#FB923C` | Brighter terracotta on dark for AA contrast |
| `disabled-bg` | `#251F1A` | Disabled controls |
| `disabled-text` | `#5C5246` | Disabled text |

### Semantic feedback (theme-independent)

| Token | Foreground | Soft fill | Use |
|---|---|---|---|
| `success` | `#2D7A4F` | `#D6F0DF` | Confirmation, Returned, Approved |
| `warning` | `#B45309` | `#FFE7D6` | Pending, attention-required banners |
| `error` | `#B91C1C` | `#FDE2E2` | Validation errors, Rejected, Deactivated (deactivation surfaces) |
| `info` | `#1E5A8E` | `#D6E8F5` | Neutral notifications, hints |

### Status colors

**Report lifecycle:**

| Status | Foreground | Soft fill | Icon |
|---|---|---|---|
| Open | `#7C2907` | `#FFE7D6` | `#7C2907` |
| Claim Requested | `#7C2907` | `#FFE7D6` | `#7C2907` |
| Claim Approved | `#7C2D12` | `#FEF3C7` | `#B45309` |
| Returned | `#1E5A4E` | `#D6EBE5` | `#2D7A4F` |
| Closed | `#5C5246` | `#ECE5D9` | `#9A8E78` |

**Claim:**

| Status | Foreground | Soft fill | Icon |
|---|---|---|---|
| Pending | `#7C2D12` | `#FEF3C7` | `#B45309` |
| Approved | `#1E5A4E` | `#D6EBE5` | `#2D7A4F` |
| Rejected | `#7F1D1D` | `#FDE2E2` | `#B91C1C` |

**Account:**

| Status | Foreground | Soft fill | Icon |
|---|---|---|---|
| Pending | `#7C2D12` | `#FEF3C7` | `#B45309` |
| Active | `#1E5A4E` | `#D6EBE5` | `#2D7A4F` |
| Rejected | `#7F1D1D` | `#FDE2E2` | `#B91C1C` |
| Deactivated | `#5C5246` | `#ECE5D9` | `#9A8E78` |

**Color-blind safety note:** The status palette relies primarily on hue + lightness + text label + icon (PRD NFR accessibility). The four statuses within each domain span three lightness bands, which preserves distinguishability for the most common forms of color vision deficiency. Every status badge is paired with its text label and an icon — color is never the sole carrier of meaning. Status icons render in the icon-color token (`fg`-adjacent, slightly more saturated than `fg`); color-blind users distinguish by icon **shape** and text label, not by hue.

**Verbatim from PRD §3:** Account states (`Pending`, `Active`, `Rejected`, `Deactivated`), report lifecycle (`Open`, `Claim Requested`, `Claim Approved`, `Returned`, `Closed`), and claim states (`Pending`, `Approved`, `Rejected`) match the PRD glossary by name. Status icons and labels above are sourced from this taxonomy.

### Color contrast & safety

PRD §10 NFR target is **WCAG 2.1 AA**. The following table anchors load-bearing color pairs to their measured contrast ratios. All non-exempt pairs pass AA at normal text size (≥ 4.5:1) and large text size (≥ 3:1).

| Pair | Ratio | Verdict | Use |
|---|---|---|---|
| `colors.light.on-background` on `colors.light.background` | 16.02:1 | AAA | Body, headings |
| `colors.light.on-surface` on `colors.light.surface` | 19.41:1 | AAA | Card body |
| `colors.light.link` on `colors.light.background` | 7.48:1 | AAA | Inline links |
| `colors.brand.on-primary` on `colors.brand.primary` | 5.18:1 | AA | Primary button label |
| `colors.brand.on-primary` on `colors.brand.primary-hover` | 6.85:1 | AA | Hover button |
| `semantic.on-error` on `semantic.error` | 6.47:1 | AA | Danger button |
| `colors.light.focus-ring` on `colors.light.background` | 4.85:1 | AA (non-text 3:1) | Focus outline |
| Status fg on soft fill (all 12 statuses) | 6.10:1 – 8.42:1 | AA / AAA | Status badge text |
| Dark-theme text, link, focus-ring pairs | 8.18:1 – 16.18:1 | AAA | All dark surfaces |

**Exempt under WCAG 1.4.3:** disabled-text / disabled-bg pairs (2.13:1 – 2.58:1) intentionally fail AA; disabled controls are exempt.

**Soft-fill alert body text rule (load-bearing):** For toasts and inline alerts using the `semantic.*` tokens, the body text renders in `colors.{theme}.on-background` (page ink) on the soft-fill background — not the saturated foreground. The foreground (`semantic.success` / `.warning` / `.error` / `.info`) drives the **icon** and **heading** only. This keeps body text on the soft fills at AA regardless of which semantic variant is used, since `on-background` passes AA on every soft-fill token.

---

## Typography

**Stack:** `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`. System fonts keep text rendering native, fast, and accessible — no FOUT, no licensing risk, no performance cost. The character set aligns well with the warm-neutral palette.

**Hierarchy:** Two weights dominate (`400` for body, `600`/`700` for headings). One weight for the entire product. We do not introduce display faces, italics for emphasis, or all-caps for body copy. Display sizes are reserved for landing-page hero, member-dashboard greeting, and audit-trail headings.

**Type scale:**

| Token | Size | Weight | Use |
|---|---|---|---|
| `display-lg` | 44 / 32 (mobile) | 700 | Landing hero |
| `headline-lg` | 32 | 700 | Page titles, dashboard greeting |
| `headline-md` | 24 | 600 | Section headings (e.g., "My Reports") |
| `headline-sm` | 20 | 600 | Card titles, modal titles |
| `title-md` | 16 | 600 | Subsection titles, button text |
| `body-lg` | 17 | 400 | Lead paragraphs |
| `body-md` | 15 | 400 | Default body text |
| `body-sm` | 13 | 400 | Dense listings, table cells |
| `label` | 14 | 500 | Form labels |
| `label-caps` | 12 / 600 / uppercase / 0.06em | | Section eyebrows, "Sensitive" inline flags |
| `caption` | 12 | 400 | Timestamps, metadata |
| `helper` | 13 / 400 | | Field helper text |
| `error-text` | 13 / 500 | | Validation errors |
| `status-text` | 13 / 600 | | Status badge text |

**Tracking:** Display and headline sizes use slight negative tracking (`-0.02em` / `-0.015em`) for optical balance at large sizes. Labels with `label-caps` use `0.06em` positive tracking. Body copy is neutral.

**Leading:** Body text uses `1.55` line-height for comfortable reading. Headlines use `1.15–1.3`. Status text and labels use `1.4`.

**Numerals:** Tabular figures (`font-variant-numeric: tabular-nums`) for timestamps, IDs, and counts in tables — so they align across rows.

---

## Layout & Spacing

**Grid:** 12-column grid on desktop (≥ 1024 px), 8-column on tablet (640–1023 px), 4-column on mobile (< 640 px). The grid is fluid; content maxes out at `1024 px` for content-heavy pages (item detail, dashboard) and `640 px` for forms (single-column).

**Spacing rhythm:** 4 px base unit. Common values: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Components use the 4-multiples; section gaps use larger values (`48` to `64`).

**Margins:** `16` px on mobile, `24` px on tablet, `32` px on desktop. Containers respect the page margin on each breakpoint.

**Section gap:** `48` px between major page sections (e.g., between the listing and a sidebar). `64` px on desktop.

**Forms:** Single column. Max width `640 px`. Helper text wraps under labels. Buttons align to the bottom-right of the form on desktop; full-width on mobile.

**Tables:** Full container width on desktop. Each row has 16 px vertical padding and aligns columns to the baseline (not centers). On mobile, tables collapse to stacked cards (see Responsive).

**Listing grid:** Cards in a single column on mobile, two columns on tablet, three columns on desktop. Each card has `20` px padding and `16` px (rounded lg) corner radius.

---

## Elevation & Depth

**Tonal layering over heavy shadows.** FindBack's warm minimalism prefers *layered surface colors* to *deep drop shadows*. Shadows are reserved for hover lift and floating elements (popovers, modals).

- `elevation.0` — none. Default state for inline content.
- `elevation.1` — subtle lift. Used for cards at rest, queue rows.
- `elevation.2` — slight lift on hover/focus for cards (interactive feedback).
- `elevation.3` — modals, popovers, dropdown menus.
- `elevation.4` — drag-and-drop active state (image upload while dragging).

Shadows are tinted with the page's ink color (`rgba(31, 27, 22, …)` in light, `rgba(0, 0, 0, …)` in dark), low opacity, generous blur — *soft glow*, not harsh drop shadow.

**Borders over shadows** for table rows and input fields. A 1 px `border-default` reads more honestly than a tinted shadow in a UI that handles sensitive data.

---

## Shapes

**Shape language: rounded organic.**

- Default corner radius: `10 px` (`rounded.DEFAULT`). Buttons, inputs, badges.
- Card radius: `16 px` (`rounded.lg`). Modal radius: `16 px`.
- Pill radius: `9999 px` (`rounded.full`). Used for status badges, type tags.
- Icon-only buttons: `full` radius.
- Avatars: `full` radius.

We do not mix sharp and rounded geometry. No "skeuomorphic" notches, no chamfered corners, no asymmetric rounding. The organic feel comes from color and spacing, not from shape tricks.

**Aspect ratios:**
- Item images: 4:3 in detail view, 1:1 thumbnail in listings.
- Avatar: 1:1, always.
- Logo mark: 1:1.
- Modal: ~ 16:9 to 16:11 typical content ratio.

---

## Components

### Buttons

| Variant | Background | Text | Border | Hover | Active | Disabled |
|---|---|---|---|---|---|---|
| `primary` | `{brand.primary}` | `{on-primary}` | none | `{brand.primary-hover}` | `{brand.primary-active}` | bg → `{disabled-bg}`, text → `{disabled-text}` |
| `secondary` | `{surface}` | `{brand.primary}` | 1 px `{border-default}` | bg → `{brand.primary-soft}` | bg → `{brand.primary-soft}` | same as primary |
| `tertiary` (ghost) | transparent | `{on-surface-variant}` | none | bg → `{surface-container-high}` | bg → `{surface-container-high}` | text → `{disabled-text}` |
| `danger` | `{semantic.error}` | `{on-error}` | none | darker error | even darker error | same as primary |
| `danger-strong` | `#7F1D1D` | `{on-error}` | none | `#641111` | `#4D0C0C` | same as primary |

- Heights: **32 / 44 / 48 px** (sm/md/lg). Min-width 44 px for touch targets. Height-md is 44 px so any default-size button clears the 44 × 44 NFR floor on both axes (height-md 40 px would have only met width).
- Padding: 12 / 16 / 20 px horizontal.
- Radius: `rounded.md` (12 px).
- Font: `title-md` (16 / 600).
- Loading state: spinner replaces leading icon area; label becomes "Submitting…" / "Approving…"; button is disabled.
- Disabled state: background fades to `disabled-bg`, text to `disabled-text`. The disabled button never has a hover state — keyboard focus reveals a tooltip explaining why (UX Decision §20).

### Inputs

- Height: `44 px`. Padding: `14 px` horizontal.
- Border: `1 px` solid `{border-default}`. On focus: `2 px` solid `{focus-ring}` (with 2 px inset shadow to compensate for layout shift).
- Background: `{surface}`. Text: `{on-surface}`.
- Helper text: below input, `body-sm`, color `{on-surface-variant}`.
- Error state: border becomes `{semantic.error}`, error text replaces helper text with `error-text` style.
- Disabled: background `{disabled-bg}`, text `{disabled-text}`.

### Textarea

- Min height: 96 px (about 3 lines of body-md). Resizable vertically only.
- Same border / focus rules as inputs.
- Live character counter at bottom-right when a max length is specified (PRD FR-8 / FR-15).

### Selects

- Native `<select>` for category, location, type, relationship. Custom styling matches inputs.
- Triggers use the same height (`44 px`), padding, radius, and border as inputs.
- A 16 px chevron icon at the right edge; click target extends through the chevron.

### Checkboxes & Radios

- Native inputs with custom styling.
- Size: `20 × 20 px` for checkboxes, `20 px` diameter for radios.
- Label sits to the right with a `8 px` gap.
- Authorization affirmation checkbox uses the full sentence as its label (PRD FR-24).

### Cards (listing card, item card, queue row)

- Background: `{surface}`.
- Radius: `rounded.lg` (16 px).
- Padding: 20 px.
- Elevation: `1` at rest, `2` on hover (interactive cards only).
- Border: 1 px `{border-subtle}` on cards inside `surface-container-low` parents; otherwise rely on elevation alone.
- Click target: full card is a link or button (no dead zones).

### Status badges

- Radius: `rounded.full`.
- Padding: 10 px x / 3 px y.
- Font: `status-text` (13 / 600).
- Background: status-soft fill. Text: status foreground. Icon: 16 px, status icon color, sits at the leading edge of the label with 6 px gap.
- Used inline within cards, headers, and as filter pills.

### Tables (administrator queues)

- Full-width within container.
- Header row: `surface-dim` background, `label` text (14 / 500).
- Body rows: alternating `surface` / `surface-container-low` (subtle striping).
- Row height: 56 px min. Padding: 16 px horizontal.
- Cell text: `body-md` for primary, `body-sm` for metadata.
- Right-aligned action column. Action button is a `secondary` or `danger` variant as appropriate.
- Sortable columns show a small chevron and `aria-sort`.

### Modals & dialogs

- Background: `{surface}`. Elevation: `3`. Radius: `rounded.lg`.
- Padding: 24 px.
- Max width: `520 px`. Mobile: full-screen sheet from the bottom.
- Backdrop: `{surface-overlay}` (60–70% opacity).
- Heading: `headline-sm`. Body: `body-md`. Actions: row of buttons, primary rightmost.

### Toasts & alerts

- Toast: fixed position bottom-right on desktop, bottom-center on mobile. 16 px x / 12 px y padding. Radius: `rounded.md`. Elevation: `2`. Auto-dismiss after 4 s.
- Inline alert: `body-md` text, icon at leading edge, optional dismiss button at trailing edge.
- Alert variants: success / warning / error / info — use the semantic tokens.

### Navigation

- **Top bar:** Sticky, 64 px tall, surface background, subtle bottom border (`border-subtle`).
- Brand mark at left. Primary nav center-aligned (desktop) or hidden behind a hamburger (mobile).
- Account menu / admin menu at right.
- **Drop-downs:** Click trigger or hover (desktop); always click on touch. Items: `body-md`, padding 10 px x / 8 px y.

### Pagination

- Pill-shaped buttons, **44 px height** (taller than the visible 36 px pill to meet the 44 × 44 touch-target floor; the pill is the visible element, the button's interactive bounding box is 44 × 44 via transparent padding). Active page uses `{brand.primary-soft}` background with `{brand.primary}` text. Disabled: `disabled-text`.
- Each page button has `aria-label="Page {n}"`; the active page is also `aria-current="page"`.

### Icon-only buttons (close, theme toggle, pagination chevrons, etc.)

- **Interactive bounding box 44 × 44 px** (PRD NFR). The icon is visually centered at 20 px.
- `rounded.full`. Background transparent by default; surface-dim on hover; brand-primary-soft on focus (with focus ring on top).
- Always paired with `aria-label` describing the action ("Close", "Toggle theme", "Next page").
- Mobile: "Prev / 1 of 5 / Next" with the count collapsed when ≤ 5 pages.

### Theme toggle (topbar icon button + popover menu)

- **Trigger.** A 44 × 44 square icon button in the topbar (radius = `radius.md` = 10 px, **not** fully rounded — distinguishes it from the segmented control it replaced). Border = `border-default` light / `border-strong` dark. Background = `surface` at rest, `surface-container-high` on hover, `brand-primary-soft` + `brand-primary` border when the popover is open.
- **Trigger icon (20 × 20).** Stroke-only line icons rendered via CSS `mask-image` + `currentColor`. Three states:
  - **Sun** → Light is active.
  - **Moon** → Dark is active.
  - **Half-filled circle** (left half solid, right half outline) → System (follows OS) is active.
- **Trigger labels.** `aria-label="Theme: <System|Light|Dark>. Click to change."` and `title="Theme: <state>"`, both updated reactively when the selection changes.
- **Popover.** A small floating menu, `position: absolute`, dropped below the trigger (8 px gap), right-aligned to the trigger's right edge. Min-width 180 px, surface background, `border-subtle`, `elev-3` shadow, `radius.md` rounding. A 12 × 12 px arrow at the top of the popover anchors it to the trigger.
- **Menu items.** Three `role="menuitemradio"` buttons, each with the matching icon + visible label (`System`, `Light`, `Dark`). Active item: `aria-checked="true"`, `brand-primary-soft` background, `brand-primary` color, `font-weight: 600`. Hover: `surface-container-high` background.
- **Close triggers.** Item click (selects + closes + returns focus to trigger). Click outside the toggle. `Escape` key (also returns focus to trigger).
- **Keyboard.** Tab to trigger; Enter/Space opens menu; ArrowDown/ArrowUp navigates items; Home/End jumps to first/last; Enter selects; Escape closes.

### Image upload

- Drop zone: dashed `1 px` `{border-default}` border, `surface-dim` background. Hover/drag-active: border becomes `{brand.primary}`, background becomes `{brand.primary-soft}`.
- Thumbnail preview: 96 × 96 px, `rounded.md`, with a 24 × 24 px remove button overlaid at top-right.
- Upload progress: thin terracotta progress bar below the thumbnail.
- Error: thumbnail replaces progress bar with red border + error message + retry button.

### Empty, loading, error states

- **Empty:** centered icon (40 px), `headline-sm` headline, `body-md` body, single primary action. No illustrations.
- **Loading:** skeleton rows for tables / listings; thin pulsing surface-dim rect for cards. Spinner only inside buttons and full-page loads.
- **Error:** `headline-sm` headline, calm `body-md` body, two buttons: `Try again` (primary), `Go back` (tertiary).

---

## Logo

### Concept

The FindBack logo is a single, deliberately designed **Pin + Recovery Arrow + Item** mark that communicates the product journey at a glance:

```
   Lost          →          Found          →          Back to Owner
   (item in pin)            (pin + item)                (arrow lifts out)
```

The mark is constructed from one integrated glyph, not three stacked icons:

- **Pin head** — a teardrop circle with a soft point at the bottom. Reads as the place where something was lost or found. Recognizable as a location pin even at small sizes.
- **Item** — a generic rounded-rectangle package silhouette with a tape line down the middle, sitting inside the pin head. Deliberately generic so it does not commit to any single category (wallet, phone, key, bag, etc.).
- **Recovery arrow** — a curved stroke that begins inside the pin over the item, arcs up and to the right, and exits the pin's edge with an arrowhead. The curve communicates "recovery / return to owner" rather than a generic forward arrow; the arrow's tail at the item is the climax beat of the journey.

The wordmark pairs the mark with the literal word "FindBack" in the system font at `headline-md` weight. The wordmark is the default for product surfaces; the standalone mark is used for favicons, app icons, and compact headers.

### Color treatment

| Theme | Mark strokes | Item fill | Wordmark fill |
|---|---|---|---|
| Light (default) | Brand primary `#7C2907` | Surface `#FFFFFF` | `on-background` `#1F1B16` |
| Dark | Dark-theme accent `#FB923C` | On-surface `#F5EFE5` | On-background `#F5EFE5` |

The mark uses **single ink color + one knockout fill** for the item — a single SVG therefore works on both light and dark backgrounds (via `currentColor`), and the brand's identity stays consistent.

### Variants

| Variant | Use |
|---|---|
| `logo-wordmark.svg` (currentColor) | Default wordmark in product surfaces. Inherits color from CSS `color` on the wrapping element. |
| `logo-mark.svg` (currentColor) | Standalone mark for compact headers, illustrations, footer. Same currentColor behavior. |
| `logo-wordmark-light.svg` | Hard-coded brand primary for non-CSS contexts (emails, exported PDFs, README badges). |
| `logo-wordmark-dark.svg` | Hard-coded dark-theme accent for dark-background contexts without CSS variables. |
| `logo-mark-light.svg` | Mark only, light theme hard-coded. |
| `logo-mark-dark.svg` | Mark only, dark theme hard-coded. |
| `favicon.svg` | Browser tab, bookmarks. Simplified silhouette — pin + item + single-stroke arrow. |
| `app-icon.svg` | 512 × 512 PWA / OS app launcher icon. Mark on a brand-primary rounded-square tile. |

### Logo assets

```
mockups/assets/
├── logo-wordmark.svg            # Default wordmark (currentColor)
├── logo-wordmark-light.svg      # Wordmark, brand-primary hard-coded
├── logo-wordmark-dark.svg       # Wordmark, dark-accent hard-coded
├── logo-mark.svg                # Standalone mark (currentColor)
├── logo-mark-light.svg          # Mark, brand-primary hard-coded
├── logo-mark-dark.svg           # Mark, dark-accent hard-coded
├── favicon.svg                  # Browser tab icon
└── app-icon.svg                 # 512×512 OS app icon
```

### Clear space and minimum size

- Clear space: 16 px on all sides of the mark, 24 px around the full wordmark.
- Minimum size, mark: **20 px tall** (lower than the previous badge minimum because the new construction is line-art and survives small sizes more cleanly than a filled monogram). At 16 px (favicon) the simplified favicon silhouette is preferred.
- Minimum size, wordmark: 96 px wide.
- Don't: place the logo on busy photographic backgrounds; always use a solid surface or transparent area.

### Usage rules

- Use the variant that matches the current theme. The `currentColor` variants pair with the `--fb-logo-color` token (`#7C2907` light / `#F5EFE5` dark). The hard-coded variants are for export / non-CSS contexts.
- Never outline, recolor, or stretch the logo.
- Never place two logos next to each other (e.g., light + dark side by side).
- The wordmark is the default for product surfaces; the standalone mark is for favicons, app icons, and compact headers only.

---

## Imagery

- **Item photos:** Real photographs uploaded by members. We do not illustrate items ourselves.
- **No stock illustrations.** The product voice is calm, not theatrical. Empty states use a single icon, not a drawing.
- **Icons:** Line icons, 1.75 px stroke, rounded line caps and joins. A small set: home, search, report, claim, inbox, check, x, alert, hourglass, archive, lock, message, eye, eye-off, edit, trash, user, package, user-check, user-x, plus, chevron, arrow, x-circle, check-circle, check-shield, inbox, package-check, archive-x, edit, message-circle.
- **Icons inherit `currentColor`** so they pick up the surrounding text color. Status icons use the status icon color from the status palette.
- **No emoji anywhere** in the product surface.

---

## Motion

- Durations: `120 ms` (micro), `200 ms` (base), `320 ms` (slow).
- Easings: `cubic-bezier(0.2, 0, 0, 1)` (standard), `cubic-bezier(0.3, 0, 0.1, 1)` (emphasis / entry).
- `prefers-reduced-motion: reduce` disables all non-essential transitions and animations. Status changes remain instant; modals and toasts skip entry/exit.

**Used in:**
- Toast entry / exit.
- Modal entry / exit.
- Dropdown menu entry / exit.
- Card hover lift (elevation 1 → 2).
- Status badge color transitions on update.
- Drag-active state on image upload.

**Never used in:**
- Status changes (instant — the user should see the new state, not a transition into it).
- Page navigation (full re-render, no cross-fade).
- Button states beyond hover.

---

## Theme switching

- Initial theme: respects `prefers-color-scheme`.
- Toggle: in the Account menu, three options (`System`, `Light`, `Dark`).
- Persistence: `localStorage` (`findback.theme`).
- Implementation: `<html data-theme="light|dark">` set inline before first paint (no FOUC).
- The current theme swaps logo variants automatically.
- Focus rings, hover states, and component states are defined per-theme in the tokens above.

---

## Do's and Don'ts

### Do

- **Use terracotta sparingly.** One primary terracotta accent per visible viewport where possible. The brand reads "warm community ledger," not "loud consumer app."
- **Trust the warm neutrals.** Pages are warm off-white, not pure white. Text is warm-tinted near-black, not pure black.
- **Pair every status with a label and an icon.** Color alone is never enough.
- **Use generous spacing.** Sections breathe. Cards have room. Forms have air.
- **Show sensitive fields as hidden by default and reveal them deliberately.** Reinforces trust.
- **Confirm destructive actions.** Withdraw / delete / approve-with-auto-reject / confirm-returned all use modals.
- **Keep one primary action per screen.** Demote secondary actions to `secondary` or `tertiary`.
- **Honor the system font stack.** We deliberately do not ship a webfont.

### Don't

- **Don't use cool blues or pure white.** The palette is warm on purpose.
- **Don't introduce more than one warm accent.** One terracotta + one evergreen. Anything else dilutes the brand.
- **Don't use sharp corners on cards, buttons, or inputs.** The shape language is rounded organic.
- **Don't use emoji in the product surface.** Status icons only.
- **Don't use color alone to communicate state.** Always pair with text + icon.
- **Don't use motion to mask state changes.** State changes are instant.
- **Don't introduce stock illustrations or photography** beyond member-uploaded item photos.
- **Don't expose internal terminology** ("API", "endpoint", "HTTP", "database") to users.
- **Don't auto-approve anything.** Every approval is a deliberate administrator action, recorded in the audit trail.
- **Don't ship a webfont.** System fonts only — fast, accessible, no licensing risk.
- **Don't introduce a light-mode-only or dark-mode-only affordance.** Both themes must work for every surface.
- **Don't break the rule of one primary action per screen.** If a screen has two competing primaries, demote or move one.

---

## Cross-reference

- All behavioral uses of these tokens (component variants, status mapping, copy, accessibility) live in [`EXPERIENCE.md`](./EXPERIENCE.md).
- When `EXPERIENCE.md` references a token (e.g., `{colors.brand.primary}`), this document is the source of truth.
- When a mock, wireframe, or import disagrees with these tokens, the tokens win.

---

*End of DESIGN.md.*