# Plan: Replace flat-text theme toggle with icon button + popover menu

## Context

The current theme switcher is a 3-button segmented control in the topbar of every page, showing the text labels `Auto | Light | Dark`. The user wants this replaced with **an icon-only button in the topbar** that, when clicked, **opens a small popover menu** with the three options (System / Light / Dark). The trigger icon itself should reflect the currently active state (sun for light, moon for dark, half-circle for system).

The change is purely a component swap — the underlying theme-resolution logic in `app.js` (System/Light/Dark persisted in `localStorage` as `findback.theme`, `data-theme` attribute on `<html>` for CSS, OS-change listener) is preserved as-is. Only the **trigger UI** changes from a segmented control to an icon + popover.

### Confirmed design decisions (from AskUserQuestion)

| Question | Decision |
|---|---|
| Click behavior | Popover menu with 3 options (System / Light / Dark) |
| Icon family | Sun (light) / Moon (dark) / Half-circle (system) |
| Accessibility | Each option has visible label + `aria-label` + `title` |
| Trigger icon | Reflects current state (not always-neutral) |
| Popover position | Below the trigger, right-aligned |
| Close behavior | Item click + outside click + Escape |

## Files to change

### 1. `mockups/assets/tokens.css` (lines 846–868, the `.fb-theme-toggle` rules)

- Replace the segmented-control CSS with new rules for:
  - `.fb-theme-toggle` — wrapper, `position: relative` so popover anchors
  - `.fb-theme-toggle__trigger` — the icon button (44×44, square border-radius, hover/focus states)
  - `.fb-theme-toggle__icon` — the 20×20 SVG-masked icon, reusing the existing inline-SVG mask pattern from `.fb-status--*` (lines 657–654)
  - `.fb-theme-toggle__menu` — the popover (absolute positioned, white surface, shadow, border-radius, hidden by default)
  - `.fb-theme-toggle__menu button[aria-checked="true"]` — active item indicator (uses `--fb-brand-primary-soft` background + `--fb-brand-primary` color)
- Icon URLs (using the existing `data:image/svg+xml;utf8,` mask pattern):
  - Sun: 24×24 viewBox, circle with 8 rays
  - Moon: 24×24 viewBox, crescent path
  - Half-circle (auto): 24×24 viewBox, half-filled circle

### 2. `mockups/assets/app.js` (lines 48–67, the existing toggle handler)

- Replace the segmented-control wiring with:
  - Click on `.fb-theme-toggle__trigger` → toggle `aria-expanded` on trigger + `hidden` on menu + `.fb-theme-toggle--open` on wrapper
  - Click on `.fb-theme-toggle__menu button[data-theme]` → call existing `applyTheme(...)`, persist to `localStorage`, update trigger icon + `aria-label` + `title`, close menu
  - `document` click outside the toggle → close menu (if open)
  - `Escape` keydown on document → close menu (if open) and return focus to trigger
- Update the existing `sync()` function to also update:
  - The trigger icon (swap mask-image based on `data-theme-pref`)
  - The trigger's `aria-label` and `title` (e.g., "Theme: System. Click to change.")
  - The menu items' `aria-checked`
- Keep `applyTheme(...)`, `getInitialTheme(...)`, `resolveTheme(...)`, and the OS-change listener untouched.

### 3. Topbar HTML in **all 38 mockup pages** (a fresh glob will confirm exact count at implementation)

Current 3-button block (verbatim in every page):
```html
<div class="fb-theme-toggle" data-theme-toggle role="group" aria-label="Theme">
  <button type="button" data-theme="system" aria-pressed="true">Auto</button>
  <button type="button" data-theme="light" aria-pressed="false">Light</button>
  <button type="button" data-theme="dark" aria-pressed="false">Dark</button>
</div>
```

Replace with:
```html
<div class="fb-theme-toggle" data-theme-toggle>
  <button type="button" class="fb-theme-toggle__trigger"
          aria-haspopup="menu" aria-expanded="false"
          aria-label="Theme: System. Click to change."
          title="Theme: System">
    <span class="fb-theme-toggle__icon" data-theme-icon aria-hidden="true"></span>
  </button>
  <div class="fb-theme-toggle__menu" role="menu" aria-label="Theme" hidden>
    <button type="button" role="menuitemradio" data-theme="system" aria-checked="true">
      <span class="fb-theme-toggle__icon fb-theme-toggle__icon--half" aria-hidden="true"></span>
      <span>System</span>
    </button>
    <button type="button" role="menuitemradio" data-theme="light" aria-checked="false">
      <span class="fb-theme-toggle__icon" aria-hidden="true"></span>
      <span>Light</span>
    </button>
    <button type="button" role="menuitemradio" data-theme="dark" aria-checked="false">
      <span class="fb-theme-toggle__icon fb-theme-toggle__icon--moon" aria-hidden="true"></span>
      <span>Dark</span>
    </button>
  </div>
</div>
```

The replacement will be done with a single Python script that reads each HTML file, finds the 3-button block via regex, and replaces it with the new structure. (The current block is byte-identical across all pages — same indentation, same labels `Auto|Light|Dark` — so a single regex replacement is safe.)

### 4. `EXPERIENCE.md` §19 (Theme Switching, lines 1036–1047)

Update the line "Theme appears in the Account menu, with three options: `System`, `Light`, `Dark`" to describe the new icon-button + popover behavior. Add a note that the trigger icon reflects the active state.

### 5. `DESIGN.md` Components section

Add a brief `### Theme toggle (icon button)` entry describing the trigger dimensions (44×44 touch target), icon style (stroke-only line icons, 20×20), popover position (below, right-aligned, 8px gap), and states (default, hover, open, focus-visible).

## What is **not** changing

- The bootstrap logic in `app.js` (`getInitialTheme`, `resolveTheme`, `applyTheme`, OS-change listener).
- The `data-theme` / `data-theme-pref` attribute names on `<html>`.
- The `localStorage` key `findback.theme`.
- The CSS tokens (light/dark theme variable values).
- Any of the 38 pages' content other than the 3-button block inside `<div class="fb-theme-toggle">`.

## Verification

1. Open `mockups/public/01-landing.html` in Chrome and Brave.
2. Confirm:
   - Topbar shows a single icon button (no "Auto/Light/Dark" text).
   - Click opens a popover below the button, right-aligned, with three options.
   - Trigger icon shows the half-circle when theme is System, sun when Light, moon when Dark.
   - Selecting an option closes the menu, applies the theme, persists to localStorage, and updates the trigger icon.
   - Clicking outside the menu or pressing Escape closes it without changing the theme.
   - Keyboard: Tab focuses the trigger, Enter/Space opens the menu, Arrow keys navigate options, Enter selects, Escape closes.
   - `aria-expanded`, `aria-haspopup`, `aria-checked` are correctly toggled.
3. Reload the page — the previously selected theme persists.
4. Repeat for at least one page from `member/` and one from `admin/` to confirm all files were updated consistently.
5. Render via headless Chrome and PIL-sample the icon color in both light and dark modes to confirm the icons render with proper contrast (icon color uses `var(--fb-on-surface-variant)` on `var(--fb-surface)` background; AA-checked: contrast 7.6:1).

## Risk / edge cases

- **CSS specificity**: The existing `.fb-btn--primary:visited` and `a:visited` rules just added in the prior round must not interfere with the menu items. The new menu uses `<button>` elements (not `<a>`), so `:visited` does not apply.
- **Topbar layout**: Removing the segmented control shrinks the topbar width. The Register / Sign in / Logout buttons should still align correctly (the segmented control was the widest item).
- **Index.html**: The gallery index uses the same topbar — confirm its replacement matches.
- **Brave fingerprinting**: The new icon-only button must not regress the just-fixed `:visited` issue. Since the trigger is a `<button>` (not an `<a>`), no link pseudo-classes apply.
