/**
 * The token layer's tests.
 *
 * **These are the tests that keep the two copies of the tokens from
 * drifting.** `src/ui/tokens.ts` holds the values as typed constants;
 * `src/app/globals.css` holds the same values as CSS custom properties.
 *
 * **A CSS variable cannot be read from TypeScript, and a token cannot be
 * read by the browser** — so the values are written down twice, and this
 * suite is what makes the second copy honest. It reads the CSS file from
 * disk and compares it against the typed constants.
 *
 * The suite also asserts the theme helpers' behaviour, because those
 * carry the anti-FOUC and the "System follows the OS" rules.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  brand,
  brandDark,
  dark,
  elevation,
  elevationDark,
  grid,
  light,
  parseTheme,
  radii,
  resolveTheme,
  semantic,
  semanticDark,
  statusColors,
  themeAccessibleName,
  themeTitle,
  THEMES,
  THEME_STORAGE_KEY,
  type Theme,
} from './tokens';

/**
 * The CSS file, read from disk.
 *
 * **Read once, at module load** — the file does not change during a test
 * run, and reading it per assertion would be wasteful.
 */
const CSS_PATH = join(process.cwd(), 'src/app/globals.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/**
 * The stylesheet with its comments removed.
 *
 * **A CSS comment can contain braces.** A comment that quotes a design
 * token path such as `colors.dark.info-soft` — or any other braced
 * fragment — would terminate the block being read, and every property
 * after it would look absent. Stripping the comments first is what makes
 * the block boundaries the real ones.
 */
const CSS_WITHOUT_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The value of a custom property in a selector block.
 *
 * **The block is located by its opening brace**, so the same property name
 * in the light block and the dark block is read from the right one.
 *
 * **The selector is matched as a whole block header** — the text is
 * normalised (newlines become spaces) and then searched for as
 * `<selector> {`. A bare `indexOf(':root')` would find the *first*
 * occurrence, which is the combined `:root, [data-theme='light']` header —
 * a block that carries no `--radius-sm` — and every shape-token assertion
 * would read `undefined` from the wrong block. Matching the header
 * exactly means `':root'` only ever finds the standalone `:root` block.
 */
function cssValue(selector: string, property: string): string | undefined {
  const normalised = CSS_WITHOUT_COMMENTS.replace(/\s+/g, ' ');
  const header = new RegExp(`${escapeRegExp(selector)}\\s*\\{`);

  const match = header.exec(normalised);

  if (!match) {
    return undefined;
  }

  const blockStart = match.index + match[0].length;
  const blockEnd = normalised.indexOf('}', blockStart);

  if (blockEnd === -1) {
    return undefined;
  }

  const block = normalised.slice(blockStart, blockEnd);
  const propertyMatch = new RegExp(`--${property}\\s*:\\s*([^;]+);`).exec(block);

  return propertyMatch?.[1]?.trim();
}

/**
 * A regular-expression-safe literal.
 *
 * **The selectors contain `[`, `]`, and `'`** — characters that are
 * meaningful in a regular expression — so they are escaped before being
 * used as a pattern.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A hex colour as the CSS writes it — lower-case, six digits. */
function hex(value: string): string {
  return value.toLowerCase();
}

describe('the light theme tokens', () => {
  it('binds the light values to the light selector', () => {
    expect(cssValue("[data-theme='light']", 'brand-primary')).toBe(hex(brand.primary));
    expect(cssValue("[data-theme='light']", 'brand-primary-hover')).toBe(hex(brand.primaryHover));
    expect(cssValue("[data-theme='light']", 'brand-primary-active')).toBe(hex(brand.primaryActive));
    expect(cssValue("[data-theme='light']", 'brand-on-primary')).toBe(hex(brand.onPrimary));
    expect(cssValue("[data-theme='light']", 'background')).toBe(hex(light.background));
    expect(cssValue("[data-theme='light']", 'surface')).toBe(hex(light.surface));
    expect(cssValue("[data-theme='light']", 'on-background')).toBe(hex(light.onBackground));
  });

  it('binds every light surface token to the same value', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ['surface-dim', light.surfaceDim],
      ['surface-container-low', light.surfaceContainerLow],
      ['surface-container', light.surfaceContainer],
      ['surface-container-high', light.surfaceContainerHigh],
      ['surface-overlay', light.surfaceOverlay],
      ['on-surface', light.onSurface],
      ['on-surface-variant', light.onSurfaceVariant],
      ['border-subtle', light.borderSubtle],
      ['border-default', light.borderDefault],
      ['border-strong', light.borderStrong],
      ['focus-ring', light.focusRing],
      ['disabled-bg', light.disabledBg],
      ['disabled-text', light.disabledText],
      ['link', light.link],
    ];

    for (const [property, value] of pairs) {
      expect(cssValue("[data-theme='light']", property)).toBe(hex(value));
    }
  });

  it('uses the light values as the default, so a page with no attribute is legible', () => {
    // The `:root, [data-theme='light']` selector is what makes the light
    // theme the default. The values are asserted through the light block,
    // which is the same declaration.
    expect(cssValue("[data-theme='light']", 'background')).toBe(hex(light.background));
  });
});

describe('the dark theme tokens', () => {
  it('binds the dark values to the dark selector', () => {
    expect(cssValue("[data-theme='dark']", 'background')).toBe(hex(dark.background));
    expect(cssValue("[data-theme='dark']", 'surface')).toBe(hex(dark.surface));
    expect(cssValue("[data-theme='dark']", 'on-background')).toBe(hex(dark.onBackground));
    expect(cssValue("[data-theme='dark']", 'focus-ring')).toBe(hex(dark.focusRing));
  });

  it('binds every dark surface token to the same value', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ['surface-dim', dark.surfaceDim],
      ['surface-raised', dark.surfaceRaised],
      ['surface-container-low', dark.surfaceContainerLow],
      ['surface-container', dark.surfaceContainer],
      ['surface-container-high', dark.surfaceContainerHigh],
      ['surface-overlay', dark.surfaceOverlay],
      ['on-surface', dark.onSurface],
      ['on-surface-variant', dark.onSurfaceVariant],
      ['border-subtle', dark.borderSubtle],
      ['border-default', dark.borderDefault],
      ['border-strong', dark.borderStrong],
      ['disabled-bg', dark.disabledBg],
      ['disabled-text', dark.disabledText],
      ['link', dark.link],
    ];

    for (const [property, value] of pairs) {
      expect(cssValue("[data-theme='dark']", property)).toBe(hex(value));
    }
  });

  it('uses the mockup’s brighter terracotta for dark-theme buttons', () => {
    expect(cssValue("[data-theme='dark']", 'brand-primary')).toBe(hex(brandDark.primary));
    expect(cssValue("[data-theme='dark']", 'brand-primary-hover')).toBe(hex(brandDark.primaryHover));
    expect(cssValue("[data-theme='dark']", 'brand-primary-active')).toBe(hex(brandDark.primaryActive));
    expect(cssValue("[data-theme='dark']", 'brand-primary-soft')).toBe(hex(brandDark.primarySoft));
    expect(cssValue("[data-theme='dark']", 'brand-on-primary')).toBe(hex(brandDark.onPrimary));
    expect(cssValue("[data-theme='dark']", 'brand-secondary')).toBe(hex(brandDark.secondary));
  });

  it('keeps the canonical semantic feedback in the light theme', () => {
    for (const [property, value] of [
      ['semantic-success', semantic.success],
      ['semantic-success-soft', semantic.successSoft],
      ['semantic-warning', semantic.warning],
      ['semantic-warning-soft', semantic.warningSoft],
      ['semantic-error', semantic.error],
      ['semantic-error-soft', semantic.errorSoft],
      ['semantic-info', semantic.info],
      ['semantic-info-soft', semantic.infoSoft],
    ] as const) {
      expect(cssValue("[data-theme='light']", property)).toBe(hex(value));
    }
  });

  it('gives the dark theme its own contrast-passing semantic feedback', () => {
    // **The semantic palette's *identity* is theme-independent; its rendered
    // values are not.** DESIGN.md's soft-fill rule puts body text in the
    // theme's `on-background` on the soft fill, and in the dark theme that
    // ink is light — so the light theme's light-pastel soft fills measured
    // 1.04:1 and were invisible.
    //
    // EXPERIENCE.md §1117 names the two themes' soft fills separately
    // (`colors.light.info-soft` / `colors.dark.info-soft`), and §20.2
    // requires that both themes meet AA. The dark theme therefore carries
    // its own dark-tinted fills and its own lighter foregrounds.
    for (const [property, value] of [
      ['semantic-success', semanticDark.success],
      ['semantic-success-soft', semanticDark.successSoft],
      ['semantic-warning', semanticDark.warning],
      ['semantic-warning-soft', semanticDark.warningSoft],
      ['semantic-error', semanticDark.error],
      ['semantic-error-soft', semanticDark.errorSoft],
      ['semantic-info', semanticDark.info],
      ['semantic-info-soft', semanticDark.infoSoft],
    ] as const) {
      expect(cssValue("[data-theme='dark']", property)).toBe(hex(value));
    }
  });

  it('gives the dark theme soft fills that differ from the light theme\'s', () => {
    // **The regression this bolt found.** The dark theme used to declare the
    // light theme's soft fills, so light ink landed on a near-white fill.
    for (const property of [
      'semantic-success-soft',
      'semantic-warning-soft',
      'semantic-error-soft',
      'semantic-info-soft',
    ]) {
      expect(cssValue("[data-theme='dark']", property)).not.toBe(
        cssValue("[data-theme='light']", property),
      );
    }
  });

  it('swaps the logo colour with the theme', () => {
    expect(cssValue("[data-theme='light']", 'fb-logo-color')).toBe(hex(brand.primary));
    expect(cssValue("[data-theme='dark']", 'fb-logo-color')).toBe(hex(dark.onBackground));
  });
});

describe('the theme-independent tokens', () => {
  it('binds the shape tokens', () => {
    expect(cssValue(':root', 'radius-sm')).toBe(radii.sm);
    expect(cssValue(':root', 'radius-md')).toBe(radii.md);
    expect(cssValue(':root', 'radius-button')).toBe(radii.button);
    expect(cssValue(':root', 'radius-lg')).toBe(radii.lg);
    expect(cssValue(':root', 'radius-pill')).toBe(radii.pill);
  });

  it('binds the touch target and the grid breakpoints', () => {
    expect(cssValue(':root', 'touch-target')).toBe('44px');
    // DESIGN.md §"Grid": 4 columns below 640 px, 8 on tablet (640–1023),
    // 12 on desktop (≥ 1024). The token names are the breakpoints the
    // layout *starts* at, so the tablet breakpoint is 640 px.
    expect(grid.tabletBreakpoint).toBe('640px');
    expect(grid.desktopBreakpoint).toBe('1024px');
    expect(grid.mobileColumns).toBe(4);
    expect(grid.tabletColumns).toBe(8);
    expect(grid.desktopColumns).toBe(12);
  });

  it('binds the elevation shadows', () => {
    expect(cssValue(":root, [data-theme='light']", 'elevation-1')).toBe(elevation[1]);
    expect(cssValue(":root, [data-theme='light']", 'elevation-3')).toBe(elevation[3]);
    expect(cssValue("[data-theme='dark']", 'elevation-1')).toBe(elevationDark[1]);
    expect(cssValue("[data-theme='dark']", 'elevation-3')).toBe(elevationDark[3]);
  });
});

describe('the layout rules', () => {
  it('caps the content at 1024 px and the forms at 640 px', () => {
    // **Story 001's criterion: "content capped at 1024 px, and forms
    // capped at 640 px."** The two caps are different numbers for
    // different surfaces, so both are checked.
    expect(cssValue(':root', 'content-max-width')).toBe('1024px');
    expect(cssValue(':root', 'form-max-width')).toBe('640px');
  });

  it('uses a 12-column grid on desktop, 8 on tablet, and 4 on mobile', () => {
    // **The grid is declared mobile-first**, so the base rule is the
    // 4-column mobile grid and each breakpoint raises the count.
    expect(CSS).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(CSS).toContain('grid-template-columns: repeat(8, minmax(0, 1fr));');
    expect(CSS).toContain('grid-template-columns: repeat(12, minmax(0, 1fr));');
  });

  it('raises the grid at the tablet and desktop breakpoints', () => {
    // **The breakpoint must be the one the token names.** A rule that
    // switched at 700 px would still be a 4/8/12 grid, and the
    // criterion would be unmet.
    expect(CSS).toContain(`@media (min-width: ${grid.tabletBreakpoint})`);
    expect(CSS).toContain(`@media (min-width: ${grid.desktopBreakpoint})`);
  });

  it('gives every interactive control the 44 px touch target', () => {
    // **The floor is 44 x 44 px on both axes.** The buttons, the icon
    // buttons, and the inputs all resolve to the token rather than to a
    // hard-coded number.
    expect(cssValue(':root', 'touch-target')).toBe('44px');
    expect(cssValue(':root', 'button-height-md')).toBe('44px');
    expect(cssValue(':root', 'input-height')).toBe('44px');
    expect(CSS).toContain('min-height: var(--touch-target);');
    expect(CSS).toContain('min-width: var(--touch-target);');
  });
});

describe('the reduced-motion rules', () => {
  it('honours prefers-reduced-motion: reduce', () => {
    // **Story 001: "toast entry/exit, modal entry/exit, dropdown
    // entry/exit, card hover lift, and the image-upload drag-active
    // border change are all disabled."** The blanket rule disables every
    // transition and animation; the named rules below it cover the
    // hover lift and the drag-active state.
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)');
    expect(CSS).toContain('transition-duration: 0.01ms !important;');
    expect(CSS).toContain('animation-duration: 0.01ms !important;');
  });

  it('cancels the card hover lift and the drag-active state', () => {
    expect(CSS).toContain('.card:hover {');
    expect(CSS).toContain('transition: none !important;');
  });
});

describe('the status colours', () => {
  it('gives every status a foreground, a soft fill, and an icon', () => {
    // **Three cues per status** — colour, icon, and a text label (§5.8).
    // The label is rendered by the badge; the icon colour lives here.
    const all = [
      ...Object.values(statusColors.report),
      ...Object.values(statusColors.claim),
      ...Object.values(statusColors.account),
    ];

    for (const status of all) {
      expect(status.fg).toMatch(/^#[0-9A-F]{6}$/);
      expect(status.soft).toMatch(/^#[0-9A-F]{6}$/);
      expect(status.icon).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('the theme vocabulary', () => {
  it('names exactly three themes', () => {
    expect(THEMES).toEqual(['System', 'Light', 'Dark']);
  });

  it('stores the preference under the frozen key', () => {
    expect(THEME_STORAGE_KEY).toBe('findback.theme');
  });

  it('names the trigger the way DESIGN.md names it', () => {
    expect(themeAccessibleName('System')).toBe('Theme: System. Click to change.');
    expect(themeAccessibleName('Light')).toBe('Theme: Light. Click to change.');
    expect(themeAccessibleName('Dark')).toBe('Theme: Dark. Click to change.');
  });

  it('titles the trigger with the state alone', () => {
    expect(themeTitle('System')).toBe('Theme: System');
    expect(themeTitle('Light')).toBe('Theme: Light');
    expect(themeTitle('Dark')).toBe('Theme: Dark');
  });
});

describe('parsing a stored preference', () => {
  it('accepts the three names', () => {
    expect(parseTheme('System')).toBe('System');
    expect(parseTheme('Light')).toBe('Light');
    expect(parseTheme('Dark')).toBe('Dark');
  });

  it('treats an unrecognised value as System, because storage is untrusted', () => {
    // A corrupted entry must not leave the page unthemed.
    expect(parseTheme('purple')).toBe('System');
    expect(parseTheme('')).toBe('System');
    expect(parseTheme(null)).toBe('System');
    expect(parseTheme(undefined)).toBe('System');
    expect(parseTheme('light')).toBe('System');
    expect(parseTheme('DARK')).toBe('System');
  });
});

describe('resolving a preference', () => {
  it('overrides the OS for an explicit Light', () => {
    expect(resolveTheme('Light', false)).toBe('light');
    expect(resolveTheme('Light', true)).toBe('light');
  });

  it('overrides the OS for an explicit Dark', () => {
    expect(resolveTheme('Dark', false)).toBe('dark');
    expect(resolveTheme('Dark', true)).toBe('dark');
  });

  it('follows the OS for System', () => {
    expect(resolveTheme('System', false)).toBe('light');
    expect(resolveTheme('System', true)).toBe('dark');
  });

  it('never resolves to anything but the two concrete themes', () => {
    const themes: readonly Theme[] = THEMES;

    for (const theme of themes) {
      expect(['light', 'dark']).toContain(resolveTheme(theme, true));
      expect(['light', 'dark']).toContain(resolveTheme(theme, false));
    }
  });
});
