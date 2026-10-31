---
id: 001-design-foundations-and-theme
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: complete
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: 012-web-public
implemented: true
traces_to: [FR-30]
---

# Story: 001-design-foundations-and-theme

User Story

**As a** member or administrator on any FindBack surface
**I want** one shared token layer, layout shell, and theme control
**So that** every surface reads as the same product and honours my system accessibility preferences without me configuring anything

Acceptance Criteria

- [x] **Given** any FindBack surface, **When** it renders, **Then** its colors, type, spacing, radius, elevation, and component dimensions resolve to the tokens declared in `DESIGN.md` and to no hard-coded values
- [x] **Given** the light theme tokens, **When** they are applied, **Then** brand primary is `#7C2907`, background is `#FAF7F2`, surface is `#FFFFFF`, and on-background is `#1F1B16`
- [x] **Given** the dark theme tokens, **When** they are applied, **Then** background is `#161310`, surface is `#211C18`, on-background is `#F5EFE5`, and focus-ring is `#FB923C`
- [x] **Given** any status surface, **When** a status badge renders, **Then** the badge uses the matching status token from `DESIGN.md` and always pairs the color with a text label and an icon
- [x] **Given** a desktop viewport of at least 1024 px, **When** a content page renders, **Then** it uses a 12-column grid with content capped at `1024 px`, and forms capped at `640 px`
- [x] **Given** a viewport below 1024 px, **When** the layout renders, **Then** it uses the 8-column tablet grid between 640 px and 1023 px and the 4-column mobile grid below 640 px, with page margins of `24 px` and `16 px` respectively
- [x] **Given** the first visit and no stored theme preference, **When** the page is painted, **Then** the theme resolves from `prefers-color-scheme` with no flash of the wrong theme
- [x] **Given** the theme toggle on any surface, **When** it is inspected, **Then** it is a 44x44 icon button in the topbar, it is not inside the Account menu, and its icon is sun for Light, moon for Dark, and a half-filled circle for System
- [x] **Given** the theme toggle, **When** it is activated, **Then** a popover with `role="menu"` opens below it containing exactly three `role="menuitemradio"` items labelled `System`, `Light`, and `Dark`, with the active item carrying `aria-checked="true"`
- [x] **Given** the theme toggle trigger, **When** its accessible name is read, **Then** it is `Theme: <System|Light|Dark>. Click to change.` and the value updates when the selection changes
- [x] **Given** the theme menu is open, **When** the user presses Arrow Up, Arrow Down, Home, End, Enter, or Escape, **Then** the item focus moves, selects, or closes as specified, and Escape returns focus to the trigger
- [x] **Given** a theme is selected, **When** the user returns in a later session, **Then** the selection is read from `localStorage` key `findback.theme` and overrides the OS preference
- [x] **Given** the stored preference is `System`, **When** the operating system theme changes while a page is open, **Then** the page re-resolves the theme without any user action
- [x] **Given** the operating system requests `prefers-reduced-motion: reduce`, **When** any surface renders, **Then** toast entry/exit, modal entry/exit, dropdown entry/exit, card hover lift, and the image-upload drag-active border change are all disabled
- [x] **Given** reduced motion is requested, **When** a status value changes, **Then** the change renders instantly with no transition, and the image-upload drag-active state is an instant state swap
- [x] **Given** the theme changes, **When** the layout renders, **Then** the logo swaps to the theme-matching variant and the focus ring remains visible in both themes
- [x] **Given** a skip-to-content link, **When** the page is loaded and Tab is pressed once, **Then** the skip link is the first focusable element and activating it moves focus to `<main id="main" tabindex="-1">`
- [x] **Given** any interactive element, **When** its size is measured, **Then** it presents an interactive bounding box of at least 44 x 44 px with at least 8 px spacing from adjacent targets

Technical Notes

- `DESIGN.md` is the token authority. When any mockup, wireframe, or invented value disagrees with a token, the token wins.
- Tokens are bound to `[data-theme="light"]` and `[data-theme="dark"]`. The `<html data-theme>` attribute is set inline before first paint so there is no FOUC. Theme-toggle menu rows use a separate `data-theme-option` attribute so the global token selectors cannot accidentally re-theme a row labelled `Light` or `Dark`.
- UI system is vanilla CSS / CSS-modules with a tokenized design system. No external UI library. System font stack only — no webfont is shipped.
- Brand direction is `Warm & trustworthy` / `Warm Minimalism`: warm off-white linen surfaces, one terracotta accent used sparingly, evergreen as the second accent. Cool blues and pure white are prohibited.
- Button heights are 32 / 44 / 48 px with `height-md` at 44 px so a default button clears the 44 x 44 floor on both axes. Icon-only buttons use `rounded.full`; the theme toggle uses `radius.md`.
- Shape language is rounded organic — default radius `10 px`, cards and modals `16 px`, badges `9999 px`. Sharp corners are prohibited.
- Elevation is tonal layering: `elevation.1` for cards and queue rows at rest, `elevation.2` for interactive hover/focus, `elevation.3` for modals and popovers, `elevation.4` for the image-upload drag-active state.
- The `Recent activity` aggregation, the notification bell, and the notification centre are deliberately absent from this foundation — see story 009. Nothing in this story may create a place where a background event surfaces.
- Tabular figures (`font-variant-numeric: tabular-nums`) apply to timestamps, IDs, and queue counts so columns align.
- The prototype under `_bmad-output/.../mockups/` is a visual reference only. It is never modified, and its manual acceptance is deferred and is never claimed as passed by this workflow.

Dependencies

Requires
- None (foundation story for the unit)

Enables
- 002-public-and-authentication-surfaces
- 003-member-view-shell-and-navigation
- 007-administrator-dashboard
- 008-administrator-queues
- 011-accessibility-and-secure-image-delivery

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| First visit, OS in dark mode, no stored preference | Dark theme paints on first frame with no light flash |
| Stored preference is `System`, OS flips to dark at 18:00 | Page re-resolves to dark with no reload and no user action |
| Stored preference is `Dark`, OS flips to light | Page stays dark; the explicit choice overrides the OS |
| OS requests reduced motion and a modal opens | Modal appears instantly with no entry or exit animation |
| Theme popover is open and the user clicks elsewhere | Popover closes; focus is not trapped |
| Theme popover menu row labelled `Dark` renders | The row is not re-themed by the global `[data-theme]` selectors |
| Keyboard user tabs into the topbar | First stop is the skip-to-content link, then the nav, then the 44x44 theme toggle |

Out of Scope

- Any business rule — Units 001 through 006
- Any user-facing copy — `EXPERIENCE.md` owns it
- Any change to `DESIGN.md` or `EXPERIENCE.md`
- Per-surface accessibility conformance beyond the shared shell — story 011
- The notification-absence verification — story 009
