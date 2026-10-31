/**
 * Design tokens, transcribed from the frozen DESIGN.md.
 *
 * Source of truth:
 *   _bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/DESIGN.md
 *
 * This file is a transcription, not a design decision. Values are copied
 * verbatim; changing one means the frozen design has changed, which requires
 * explicit owner approval.
 *
 * ## The tokens and the CSS variables are one thing, written twice
 *
 * `src/app/globals.css` declares the same values as CSS custom properties,
 * because **a CSS variable cannot be read from TypeScript** and a token
 * cannot be read by the browser. The two are bound together by
 * `tokens.test.ts`, which asserts that every token here has a matching
 * variable and that every value agrees — so the two copies cannot drift.
 *
 * ## The theme is bound to `[data-theme]`, not to the media query alone
 *
 * DESIGN.md binds tokens to `[data-theme="light"]` and `[data-theme="dark"]`.
 * The `<html data-theme>` attribute is set **inline before first paint**, so
 * there is no flash of the wrong theme (story 001's criterion 9). The
 * `prefers-color-scheme` media query is only the *initial* resolution — a
 * stored `System` preference keeps following the OS, but a stored `Light`
 * preference overrides it.
 */

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The light-theme brand palette.
 *
 * Dark theme uses `brandDark`: the mockups shift the fill to a brighter
 * terracotta so a primary button still reads on a dark surface.
 */
export const brand = {
  primary: '#7C2907',
  primaryHover: '#5C1F05',
  primaryActive: '#3D1403',
  primarySoft: '#FFE7D6',
  onPrimary: '#FFFFFF',
  secondary: '#1E5A4E',
} as const;

/**
 * The dark theme's button accent.
 *
 * The generated mockups shift primary to a brighter terracotta so a
 * filled button still reads on a dark surface. Dark text sits on that
 * fill (`onPrimary`), the inverse of the light theme.
 */
export const brandDark = {
  primary: '#FB923C',
  primaryHover: '#FFB875',
  primaryActive: '#FBA86C',
  primarySoft: '#3A1F0E',
  onPrimary: '#1F1B16',
  secondary: '#7BC9B5',
} as const;

/** `danger-strong` — DESIGN.md's Buttons table. Irreversible, high-stakes. */
export const dangerStrong = {
  base: '#7F1D1D',
  hover: '#641111',
  active: '#4D0C0C',
} as const;

/* -------------------------------------------------------------------------- */
/* Theme surfaces                                                             */
/* -------------------------------------------------------------------------- */

/** The light theme. DESIGN.md → Colors → Light theme. */
export const light = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceDim: '#F2EDE4',
  surfaceContainerLow: '#F7F2EA',
  surfaceContainer: '#F2EDE4',
  surfaceContainerHigh: '#ECE5D9',
  surfaceOverlay: '#00000080',
  onBackground: '#1F1B16',
  onSurface: '#1F1B16',
  onSurfaceVariant: '#5C5246',
  borderSubtle: '#E7DFD1',
  borderDefault: '#D1C5B0',
  borderStrong: '#9A8E78',
  focusRing: '#7C2907',
  disabledBg: '#ECE5D9',
  disabledText: '#9A8E78',
  link: '#7C2907',
} as const;

/** The dark theme. DESIGN.md → Colors → Dark theme. */
export const dark = {
  background: '#161310',
  surface: '#211C18',
  surfaceDim: '#1B1613',
  surfaceRaised: '#2A241F',
  surfaceContainerLow: '#1F1A16',
  surfaceContainer: '#251F1A',
  surfaceContainerHigh: '#2D2620',
  surfaceOverlay: '#000000B3',
  onBackground: '#F5EFE5',
  onSurface: '#F5EFE5',
  onSurfaceVariant: '#C4B8A4',
  borderSubtle: '#2D2620',
  borderDefault: '#3D352C',
  borderStrong: '#5C5246',
  focusRing: '#FB923C',
  disabledBg: '#251F1A',
  disabledText: '#5C5246',
  link: '#FB923C',
} as const;

/**
 * Semantic feedback. **The same four colours in both themes, per DESIGN.md.**
 *
 * The soft fill is the background; the saturated foreground drives the
 * **icon and heading only**. Body text on a soft fill renders in the
 * theme's `on-background` — that rule is load-bearing for AA contrast and
 * lives in `globals.css`.
 */
export const semantic = {
  success: '#2D7A4F',
  successSoft: '#D6F0DF',
  warning: '#B45309',
  warningSoft: '#FFE7D6',
  error: '#B91C1C',
  errorSoft: '#FDE2E2',
  info: '#1E5A8E',
  infoSoft: '#D6E8F5',
} as const;

/**
 * The **dark theme's** semantic feedback.
 *
 * ## Why the dark theme has its own values
 *
 * DESIGN.md calls the semantic palette "theme-independent", and it is — in
 * the sense that the four *semantics* are the same four in both themes, and
 * the light theme's values are the canonical ones above.
 *
 * **The rendered values cannot be identical, though, and DESIGN.md's own
 * soft-fill rule is what says so.** The rule is that body text on a soft
 * fill renders in the theme's `on-background`, "since `on-background` passes
 * AA on every soft-fill token". That is true in the light theme — dark ink
 * on a light pastel. In the dark theme `on-background` is *light* ink, so
 * the same light pastel measures **1.04:1**: light ink on near-white, which
 * is invisible.
 *
 * EXPERIENCE.md §1117 is explicit that the two themes carry their own soft
 * fills (`colors.light.info-soft` / `colors.dark.info-soft`), and §20.2
 * requires that "Both themes meet AA contrast". So the dark theme needs
 * **dark-tinted** soft fills, and the saturated foregrounds need to be
 * **lighter** so they clear 4.5:1 on the dark surface and on the dark fill.
 *
 * **The hue family is preserved** — a dark red is still a dark red, a dark
 * teal is still a dark teal — so the palette reads as the same four
 * semantics in both themes.
 */
export const semanticDark = {
  success: '#86EFAC',
  successSoft: '#14301F',
  warning: '#FCD34D',
  warningSoft: '#3A2410',
  error: '#FCA5A5',
  errorSoft: '#3D1616',
  info: '#93C5FD',
  infoSoft: '#12293D',
} as const;

/**
 * Status colours. Every badge is paired with a text label and an icon —
 * colour is never the sole carrier of meaning (PRD NFR accessibility).
 */
export const statusColors = {
  report: {
    Open: { fg: '#7C2907', soft: '#FFE7D6', icon: '#7C2907' },
    'Claim Requested': { fg: '#7C2907', soft: '#FFE7D6', icon: '#7C2907' },
    'Claim Approved': { fg: '#7C2D12', soft: '#FEF3C7', icon: '#B45309' },
    Returned: { fg: '#1E5A4E', soft: '#D6EBE5', icon: '#2D7A4F' },
    Closed: { fg: '#5C5246', soft: '#ECE5D9', icon: '#9A8E78' },
  },
  claim: {
    Pending: { fg: '#7C2D12', soft: '#FEF3C7', icon: '#B45309' },
    Approved: { fg: '#1E5A4E', soft: '#D6EBE5', icon: '#2D7A4F' },
    Rejected: { fg: '#7F1D1D', soft: '#FDE2E2', icon: '#B91C1C' },
  },
  account: {
    Pending: { fg: '#7C2D12', soft: '#FEF3C7', icon: '#B45309' },
    Active: { fg: '#1E5A4E', soft: '#D6EBE5', icon: '#2D7A4F' },
    Rejected: { fg: '#7F1D1D', soft: '#FDE2E2', icon: '#B91C1C' },
    Deactivated: { fg: '#5C5246', soft: '#ECE5D9', icon: '#9A8E78' },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Spacing                                                                    */
/* -------------------------------------------------------------------------- */

/** 4 px base unit. DESIGN.md → Layout & Spacing. */
export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

/**
 * Page margins per breakpoint. DESIGN.md → Layout & Spacing → Margins.
 *
 * **The acceptance criteria name 24 px and 16 px** for tablet and mobile;
 * DESIGN.md names 32 px for desktop as well.
 */
export const pageMargin = {
  mobile: '16px',
  tablet: '24px',
  desktop: '32px',
} as const;

/* -------------------------------------------------------------------------- */
/* Typography                                                                 */
/* -------------------------------------------------------------------------- */

/** The system font stack. **No webfont ships** — DESIGN.md is explicit. */
export const fontStack =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * The type scale.
 *
 * Each entry is a CSS `font` shorthand, so it can be bound to a variable
 * directly. The `label-caps` token carries uppercase and tracking, which the
 * shorthand cannot express — those live in `globals.css` as a separate
 * declaration on `.label-caps`.
 */
export const typography = {
  displayLg: '700 44px/1.15 system-ui, sans-serif',
  headlineLg: '700 32px/1.2 system-ui, sans-serif',
  headlineMd: '600 24px/1.25 system-ui, sans-serif',
  headlineSm: '600 20px/1.3 system-ui, sans-serif',
  titleMd: '600 16px/1.4 system-ui, sans-serif',
  bodyLg: '400 17px/1.55 system-ui, sans-serif',
  bodyMd: '400 15px/1.55 system-ui, sans-serif',
  bodySm: '400 13px/1.55 system-ui, sans-serif',
  label: '500 14px/1.4 system-ui, sans-serif',
  labelCaps: '600 12px/1.4 system-ui, sans-serif',
  caption: '400 12px/1.4 system-ui, sans-serif',
  helper: '400 13px/1.4 system-ui, sans-serif',
  errorText: '500 13px/1.4 system-ui, sans-serif',
  statusText: '600 13px/1.4 system-ui, sans-serif',
} as const;

/**
 * The tracking values DESIGN.md specifies.
 *
 * Display and headline sizes take slight negative tracking for optical
 * balance at large sizes; `label-caps` takes positive tracking.
 */
export const tracking = {
  display: '-0.02em',
  headline: '-0.015em',
  labelCaps: '0.06em',
} as const;

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Corner radii. DESIGN.md → Shapes.
 *
 * **The button radius is 12 px**, per DESIGN.md's Buttons section ("Radius:
 * `rounded.md` (12 px)"), which is a narrower statement than Shapes' "default
 * corner radius 10 px" — and Shapes itself lists buttons under the default.
 * The Buttons section is the more specific rule for buttons, so it wins for
 * buttons; `md` stays 10 px for everything else.
 */
export const radii = {
  sm: '6px',
  md: '10px',
  button: '12px',
  lg: '16px',
  pill: '9999px',
} as const;

/* -------------------------------------------------------------------------- */
/* Elevation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Elevation is **tonal layering**, not heavy shadows. Shadows are reserved
 * for hover lift and floating elements.
 *
 * The shadows are tinted with the page's ink — warm near-black in light,
 * true black in dark — at low opacity with a generous blur. A *soft glow*,
 * not a harsh drop shadow.
 */
export const elevation = {
  0: 'none',
  1: '0 1px 2px rgba(31, 27, 22, 0.06), 0 1px 3px rgba(31, 27, 22, 0.04)',
  2: '0 2px 6px rgba(31, 27, 22, 0.08), 0 4px 12px rgba(31, 27, 22, 0.06)',
  3: '0 8px 24px rgba(31, 27, 22, 0.14), 0 2px 6px rgba(31, 27, 22, 0.08)',
  4: '0 12px 32px rgba(31, 27, 22, 0.2), 0 4px 8px rgba(31, 27, 22, 0.1)',
} as const;

/** The dark theme's elevation shadows — ink-tinted black rather than warm. */
export const elevationDark = {
  0: 'none',
  1: '0 1px 2px rgba(0, 0, 0, 0.4), 0 1px 3px rgba(0, 0, 0, 0.3)',
  2: '0 2px 6px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.35)',
  3: '0 8px 24px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.4)',
  4: '0 12px 32px rgba(0, 0, 0, 0.6), 0 4px 8px rgba(0, 0, 0, 0.45)',
} as const;

/* -------------------------------------------------------------------------- */
/* Components                                                                  */
/* -------------------------------------------------------------------------- */

/** WCAG 2.1 AA touch-target floor. DESIGN.md → Icon-only buttons. */
export const touchTarget = '44px';

/**
 * Button heights. DESIGN.md → Buttons: **32 / 44 / 48 px** (sm/md/lg).
 *
 * `md` is 44 px so a default button clears the 44 × 44 floor on **both**
 * axes — a 40 px height would have met only the width.
 */
export const buttonHeight = {
  sm: '32px',
  md: '44px',
  lg: '48px',
} as const;

/** Button horizontal padding. DESIGN.md → Buttons: 12 / 16 / 20 px. */
export const buttonPadding = {
  sm: '12px',
  md: '16px',
  lg: '20px',
} as const;

/** Input height. DESIGN.md → Inputs: 44 px. */
export const inputHeight = '44px';

/** Textarea minimum height — about three lines of body-md. */
export const textareaMinHeight = '96px';

/** Form max width. DESIGN.md → Layout & Spacing → Forms. */
export const formMaxWidth = '640px';

/** Content max width on content-heavy pages. */
export const contentMaxWidth = '1024px';

/** The sticky top bar's height. DESIGN.md → Navigation. */
export const topbarHeight = '64px';

/* -------------------------------------------------------------------------- */
/* Motion                                                                     */
/* -------------------------------------------------------------------------- */

/** Durations. DESIGN.md → Motion. */
export const duration = {
  micro: '120ms',
  base: '200ms',
  slow: '320ms',
} as const;

/** Easings. DESIGN.md → Motion. */
export const easing = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasis: 'cubic-bezier(0.3, 0, 0.1, 1)',
} as const;

/* -------------------------------------------------------------------------- */
/* Layout grid                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The responsive grid. DESIGN.md → Layout & Spacing → Grid.
 *
 * 12 columns on desktop (≥ 1024 px), 8 on tablet (640–1023 px), 4 on
 * mobile (< 640 px).
 */
export const grid = {
  desktopColumns: 12,
  tabletColumns: 8,
  mobileColumns: 4,
  desktopBreakpoint: '1024px',
  tabletBreakpoint: '640px',
} as const;

/* -------------------------------------------------------------------------- */
/* Theme                                                                      */
/* -------------------------------------------------------------------------- */

/** The three theme choices. */
export const THEMES = ['System', 'Light', 'Dark'] as const;

/** One of the three theme choices. */
export type Theme = (typeof THEMES)[number];

/** The `localStorage` key the theme preference is stored under. */
export const THEME_STORAGE_KEY = 'findback.theme';

/**
 * The theme a stored preference resolves to.
 *
 * `System` is not a concrete theme — it means *"follow the operating
 * system"*. The two concrete themes are `light` and `dark`.
 */
export type ResolvedTheme = 'light' | 'dark';

/**
 * The accessible name of the theme trigger.
 *
 * DESIGN.md's Theme toggle section names it exactly:
 * `Theme: <System|Light|Dark>. Click to change.`
 */
export function themeAccessibleName(theme: Theme): string {
  return `Theme: ${theme}. Click to change.`;
}

/** The `title` attribute of the theme trigger. DESIGN.md: `Theme: <state>`. */
export function themeTitle(theme: Theme): string {
  return `Theme: ${theme}`;
}

/**
 * Parse a stored preference.
 *
 * **An unrecognised value is treated as `System`,** not as an error: a
 * corrupted `localStorage` entry must not leave the page unthemed. The
 * stored value is untrusted input from the browser's own storage.
 */
export function parseTheme(value: string | null | undefined): Theme {
  if (value === 'Light' || value === 'Dark' || value === 'System') {
    return value;
  }

  return 'System';
}

/**
 * The concrete theme a preference resolves to on a given OS preference.
 *
 * `System` follows the operating system; `Light` and `Dark` override it.
 */
export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === 'Light') {
    return 'light';
  }

  if (theme === 'Dark') {
    return 'dark';
  }

  return prefersDark ? 'dark' : 'light';
}
