/**
 * The accessibility contract's tests — bolt `022`, story `011`.
 *
 * ## Why this suite exists
 *
 * Story 011's last criterion says: *"Given a new surface is added, **When** it
 * is reviewed, **Then** it is checked against every criterion in this story
 * before it is considered complete."*
 *
 * **Until this suite, that was a convention and nothing more.** There was no
 * lint rule for it, no test harness for it, no checklist file, and no CI. A
 * surface added tomorrow would have passed `npm run verify` with no
 * accessibility gate at all. This suite is the gate.
 *
 * ## What it checks, and why it reads the stylesheet
 *
 * Most of the criteria below are properties of the **stylesheet**, not of any
 * one component: a contrast ratio is a fact about two tokens, a touch target
 * is a fact about a class, and reduced motion is a fact about whether every
 * transition is covered. **A component test cannot see any of that** — it
 * would be asserting on a mock of the CSS rather than on the CSS.
 *
 * So this suite reads `src/app/globals.css` from disk and measures the real
 * declarations. That is the same technique `tokens.test.ts` uses to keep the
 * two copies of the tokens honest, and it is the only way these criteria are
 * checkable at all.
 *
 * ## The contrast failure this suite was written for
 *
 * The dark theme shipped the **light theme's** semantic soft fills. DESIGN.md
 * calls the semantic palette "theme-independent" and states the rule: body
 * text on a soft fill renders in `colors.{theme}.on-background`. That is true
 * in the light theme — dark ink on a light pastel — and **false in the dark
 * theme**, where `on-background` is light ink on the same light pastel. The
 * pair measured **1.04:1**: light ink on near-white, which is invisible.
 *
 * The suite below is the regression test for exactly that, and it checks
 * **both** themes because a contrast rule that only ever ran against the
 * light theme is how the failure shipped in the first place.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The stylesheet, read once at module load. */
const CSS_PATH = join(process.cwd(), 'src/app/globals.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/** The WCAG relative luminance of a hex colour. */
function luminance(hex: string): number {
  const clean = hex.replace('#', '');

  const channels = [0, 2, 4].map((index) => {
    const raw = parseInt(clean.slice(index, index + 2), 16) / 255;

    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

/** The WCAG contrast ratio between two hex colours. */
export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground);
  const b = luminance(background);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * The stylesheet with its comments removed.
 *
 * **A CSS comment can contain braces.** The dark theme's soft-fill comment
 * quotes DESIGN.md's rule as `colors.{theme}.on-background` — and a brace
 * inside a comment would terminate the block being read, so the properties
 * after it would look absent. Stripping the comments first is what makes the
 * block boundaries the real ones.
 */
const CSS_WITHOUT_COMMENTS = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * A block's custom properties.
 *
 * **The `token` accessor is the only way to read one,** and it throws when
 * the token is absent. A plain `Record<string, string>` would hand back
 * `undefined` for a token the block does not declare, and `undefined` reads
 * as a *value* — so a contrast assertion would quietly measure `NaN` and
 * the failure would be a wrong error message rather than a missing token.
 */
interface ThemeTokens {
  /** The value of a custom property. Throws when it is not declared. */
  token(name: string): string;
}

/**
 * The custom properties declared in a selector block.
 *
 * **The block header is matched as a whole, with a regular expression.**
 * A bare `indexOf("[data-theme='dark']")` would find the *first* occurrence
 * — which is the combined `:root, [data-theme='light']` header, a block
 * that carries no `--semantic-error-soft` — and every assertion would read
 * `undefined` from the wrong block. Matching the header exactly means the
 * selector only ever finds its own block.
 */
function blockProperties(selector: string): ThemeTokens {
  const normalised = CSS_WITHOUT_COMMENTS.replace(/\s+/g, ' ');
  const header = new RegExp(`${escapeRegExp(selector)}\\s*\\{`);

  const match = header.exec(normalised);

  expect(match, `the stylesheet declares a "${selector}" block`).not.toBeNull();

  const blockStart = match!.index + match![0].length;
  const blockEnd = normalised.indexOf('}', blockStart);

  const body = normalised.slice(blockStart, blockEnd);

  const properties: Record<string, string> = {};

  for (const declaration of body.split(';')) {
    const colon = declaration.indexOf(':');

    if (colon === -1) {
      continue;
    }

    const name = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();

    if (name.startsWith('--')) {
      properties[name] = value;
    }
  }

  return {
    token(name: string): string {
      const value = properties[name];

      if (value === undefined) {
        throw new Error(`the "${selector}" block declares no "${name}"`);
      }

      return value;
    },
  };
}

/** A regular-expression-safe literal. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The light theme's tokens. */
const LIGHT = blockProperties(":root, [data-theme='light']");

/** The dark theme's tokens. */
const DARK = blockProperties("[data-theme='dark']");

/**
 * The theme-independent tokens.
 *
 * **The spacing and sizing tokens live in their own `:root` block**, below
 * the theme blocks — they are the same in both themes, so they are not
 * repeated per theme. The bare `:root` selector is matched exactly, so it
 * cannot find the combined light header.
 */
const SHARED = blockProperties(':root');

/** Every theme's tokens, paired with the theme's name. */
const THEMES: ReadonlyArray<{ readonly name: string; readonly tokens: ThemeTokens }> = [
  { name: 'light', tokens: LIGHT },
  { name: 'dark', tokens: DARK },
];

/** WCAG 2.1 AA's floor for normal-size body text. */
const AA_BODY = 4.5;

/** WCAG 2.1 AA's floor for large text and for non-text UI components. */
const AA_LARGE = 3;

/**
 * The semantic soft fills, and the foreground that sits on them.
 *
 * **The soft fill is the background; the body ink sits on it.** That is
 * DESIGN.md's soft-fill alert rule, and it is the pair that failed.
 */
const SOFT_FILLS: ReadonlyArray<{ readonly token: string; readonly ink: string }> = [
  { token: '--semantic-success-soft', ink: '--on-background' },
  { token: '--semantic-warning-soft', ink: '--on-background' },
  { token: '--semantic-error-soft', ink: '--on-background' },
  { token: '--semantic-info-soft', ink: '--on-background' },
];

/**
 * The saturated semantic foregrounds, measured against the theme's surface.
 *
 * **These drive the icon and the heading** on a soft fill, and the heading is
 * text. The light theme's `#b91c1c` measures 2.61:1 on the dark theme's
 * surface, which is why the dark theme needed its own values.
 */
const SEMANTIC_FOREGROUNDS: ReadonlyArray<string> = [
  '--semantic-success',
  '--semantic-warning',
  '--semantic-error',
  '--semantic-info',
];

describe('the contrast contract', () => {
  it.each(THEMES)('gives the $name theme AA body contrast on every soft fill', ({ tokens }) => {
    for (const { token, ink } of SOFT_FILLS) {
      const fill = tokens.token(token);
      const colour = tokens.token(ink);

      const ratio = contrastRatio(colour, fill);

      expect(
        ratio,
        `${ink} (${colour}) on ${token} (${fill}) measures ${ratio.toFixed(2)}:1 and must clear ${AA_BODY}:1`,
      ).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it.each(THEMES)('gives the $name theme AA contrast for body text on its surface', ({ tokens }) => {
    const ratio = contrastRatio(tokens.token('--on-surface'), tokens.token('--surface'));

    expect(ratio, `body text on the surface measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it.each(THEMES)('gives the $name theme AA contrast for secondary text', ({ tokens }) => {
    const ratio = contrastRatio(tokens.token('--on-surface-variant'), tokens.token('--surface'));

    expect(
      ratio,
      `secondary text on the surface measures ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_BODY);
  });

  it.each(THEMES)('gives the $name theme AA contrast for a link', ({ tokens }) => {
    const ratio = contrastRatio(tokens.token('--link'), tokens.token('--surface'));

    expect(ratio, `a link on the surface measures ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_BODY,
    );
  });

  it.each(THEMES)('gives the $name theme AA contrast for every semantic foreground', ({ tokens }) => {
    for (const token of SEMANTIC_FOREGROUNDS) {
      const ratio = contrastRatio(tokens.token(token), tokens.token('--surface'));

      expect(
        ratio,
        `${token} (${tokens.token(token)}) on the surface measures ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it.each(THEMES)('gives the $name theme AA non-text contrast for the focus ring', ({ tokens }) => {
    const ratio = contrastRatio(tokens.token('--focus-ring'), tokens.token('--surface'));

    expect(
      ratio,
      `the focus ring on the surface measures ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('gives the dark theme its own soft fills rather than the light theme\'s', () => {
    // **This is the regression test for the failure this bolt found.**
    //
    // The dark theme shipped the light theme's pastel soft fills, so body
    // text rendered as light ink on near-white. The dark theme must now
    // carry its own, darker fills.
    for (const { token } of SOFT_FILLS) {
      expect(
        DARK.token(token),
        `${token} differs between the themes`,
      ).not.toBe(LIGHT.token(token));
    }
  });

  it('keeps the dark theme\'s soft fills dark enough to carry light ink', () => {
    // **A soft fill must be darker than the ink that sits on it.** The dark
    // theme's ink is light, so a light fill would make the text invisible —
    // which is exactly what the light theme's pastels did.
    //
    // The comparison is on *luminance*, not on the contrast ratio: the ratio
    // is symmetric and always at least 1, so it cannot express which of the
    // two is the darker colour.
    for (const { token } of SOFT_FILLS) {
      const fill = DARK.token(token);
      const ink = DARK.token('--on-background');

      expect(
        luminance(fill),
        `${token} (${fill}) is lighter than the dark theme's ink (${ink})`,
      ).toBeLessThan(luminance(ink));
    }
  });
});

describe('the reduced-motion contract', () => {
  it('honours prefers-reduced-motion', () => {
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('disables every transition and animation under reduced motion', () => {
    // **The blanket rule is the mechanism.** Every `transition` and
    // `animation` in the file is neutralised by it, so a new one cannot
    // escape — which is the point of checking the rule rather than
    // enumerating the declarations.
    const block = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'));
    const body = block.slice(0, block.indexOf('}'));

    expect(body).toContain('transition-duration: 0.01ms');
    expect(body).toContain('animation-duration: 0.01ms');
    expect(body).toContain('animation-iteration-count: 1');
    expect(body).toContain('scroll-behavior: auto');
  });

  it('sets no smooth scrolling anywhere', () => {
    // **Smooth scrolling is motion**, and the reduced-motion rule neutralises
    // it — but only if nothing opts back in *after* the rule.
    expect(CSS).not.toMatch(/scroll-behavior:\s*smooth/);
  });
});

describe('the touch-target contract', () => {
  it('declares the 44px floor', () => {
    expect(SHARED.token('--touch-target')).toBe('44px');
    expect(SHARED.token('--button-height-md')).toBe('44px');
    expect(SHARED.token('--input-height')).toBe('44px');
  });

  it.each([
    ['.button', 'min-width: var(--touch-target)'],
    ['.icon-button', 'width: var(--touch-target)'],
    ['.menu__item', 'min-height: var(--touch-target)'],
    ['.view-tabs__link', 'min-height: var(--touch-target)'],
    ['.listing__row', 'min-height: var(--touch-target)'],
    ['.home-cta', 'min-height: var(--touch-target)'],
    ['.action-card', 'min-height: var(--touch-target)'],
    ['.account-menu__trigger', 'min-height: var(--touch-target)'],
    ['.topbar__link', 'min-height: var(--touch-target)'],
    ['.menu__trigger', 'min-height: var(--touch-target)'],
    ['.admin-queue__sort', 'min-height: var(--touch-target)'],
    ['.audit-trail__disclosure', 'min-height: var(--touch-target)'],
    ['.breadcrumbs__item a', 'min-height: var(--touch-target)'],
  ])('gives %s the 44px floor', (selector, declaration) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = CSS.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));

    expect(match, `the stylesheet declares a "${selector}" block`).toBeTruthy();

    const body = (match?.[1] ?? '').replace(/\s+/g, ' ');

    expect(body, `${selector} declares "${declaration}"`).toContain(declaration);
  });

  it('keeps at least 8px between adjacent topbar targets', () => {
    const normalised = CSS.replace(/\s+/g, ' ');
    const start = normalised.indexOf('.topbar__actions {');
    const end = normalised.indexOf('}', start);

    expect(normalised.slice(start, end)).toContain('gap: var(--space-2)');

    // **8px is `--space-2`, and the criterion's floor is 8px.** The floor is
    // met exactly, so the token is asserted rather than the literal.
    expect(SHARED.token('--space-2')).toBe('8px');
  });
});

describe('the focus contract', () => {
  it('gives every interactive element a visible focus ring', () => {
    const normalised = CSS.replace(/\s+/g, ' ');
    const start = normalised.indexOf(':focus-visible {');
    const end = normalised.indexOf('}', start);

    expect(start, 'the stylesheet declares a global :focus-visible rule').toBeGreaterThan(-1);

    const body = normalised.slice(start + ':focus-visible {'.length, end);

    expect(body).toContain('outline: 2px solid var(--focus-ring)');
  });

  it('replaces every suppressed outline with a visible one', () => {
    // **A suppressed outline is only acceptable when something replaces it.**
    // The inputs suppress the outline and restore it as a border colour plus
    // an inset ring, so the focus is still visible.
    const suppressed = CSS.match(/outline:\s*none/g) ?? [];

    expect(suppressed.length, 'the stylesheet suppresses the outline in exactly one place').toBe(1);

    const normalised = CSS.replace(/\s+/g, ' ');
    const start = normalised.indexOf('.input:focus,');
    const end = normalised.indexOf('}', start);
    const body = normalised.slice(start, end);

    expect(body).toContain('border-color: var(--focus-ring)');
    expect(body).toContain('box-shadow: inset 0 0 0 1px var(--focus-ring)');
  });
});
