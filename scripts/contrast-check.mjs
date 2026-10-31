/**
 * A scratch script for choosing the dark theme's soft fills.
 *
 * **This is a design aid, not a test.** The enforced check is the contrast
 * suite in `src/ui/a11y-contract.test.ts`, which reads the real stylesheet.
 * This script exists so the candidate values can be measured before they are
 * written into `globals.css`.
 *
 * Run: `node scripts/contrast-check.mjs`
 */

/** The WCAG relative luminance of a hex colour. */
function luminance(hex) {
  const clean = hex.replace('#', '');

  const channels = [0, 2, 4].map((index) => {
    const raw = parseInt(clean.slice(index, index + 2), 16) / 255;

    return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** The WCAG contrast ratio between two hex colours. */
export function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);

  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const DARK_INK = '#f5efe5';

const CANDIDATES = {
  error: ['#3d1616', '#401a1a', '#431d1d', '#381414'],
  warning: ['#3a2410', '#3d2711', '#402a12', '#36220e'],
  info: ['#12293d', '#142c40', '#162e43', '#102639'],
  success: ['#14301f', '#163320', '#173521', '#122d1d'],
};

for (const [name, candidates] of Object.entries(CANDIDATES)) {
  for (const candidate of candidates) {
    const ratio = contrastRatio(DARK_INK, candidate);

    console.log(`${name} ${candidate}: ink-on-fill ${ratio.toFixed(2)}:1`);
  }
}

// The dark theme's saturated semantic foregrounds on the dark surface.
console.log('\n--- semantic foreground on dark surface #211c18 ---');

for (const [name, colour] of Object.entries({
  error: '#b91c1c',
  info: '#1e5a8e',
  warning: '#b45309',
  success: '#2d7a4f',
})) {
  console.log(`${name} ${colour}: ${contrastRatio(colour, '#211c18').toFixed(2)}:1`);
}

// Candidates for the dark theme's saturated semantic foregrounds. These carry
// the icon and the heading on a soft fill, so they must clear 4.5:1 against
// the DARK soft fill as well as against the dark surface.
console.log('\n--- dark semantic foreground candidates ---');

const DARK_FILLS = {
  error: '#3d1616',
  warning: '#3a2410',
  info: '#12293d',
  success: '#14301f',
};

const FOREGROUND_CANDIDATES = {
  error: ['#fca5a5', '#fca5a5', '#f87171', '#fecaca'],
  warning: ['#fcd34d', '#fbbf24', '#fde68a'],
  info: ['#93c5fd', '#7dd3fc', '#bfdbfe'],
  success: ['#86efac', '#6ee7b7', '#bbf7d0'],
};

for (const [name, candidates] of Object.entries(FOREGROUND_CANDIDATES)) {
  for (const candidate of candidates) {
    const onSurface = contrastRatio(candidate, '#211c18');
    const onFill = contrastRatio(candidate, DARK_FILLS[name]);

    console.log(
      `${name} ${candidate}: on-surface ${onSurface.toFixed(2)}:1  on-fill ${onFill.toFixed(2)}:1`,
    );
  }
}

// The brand pair in the dark theme. `--brand-primary-soft` is the soft fill
// and `--brand-primary` is the ink on it, so the two must be read together.
console.log('\n--- dark brand pair ---');

console.log(
  `brand-primary #7c2907 on brand-primary-soft #ffe7d6: ${contrastRatio('#7c2907', '#ffe7d6').toFixed(2)}:1`,
);
console.log(
  `brand-primary #7c2907 on surface #211c18: ${contrastRatio('#7c2907', '#211c18').toFixed(2)}:1`,
);
console.log(
  `brand-primary #7c2907 on background #161310: ${contrastRatio('#7c2907', '#161310').toFixed(2)}:1`,
);
console.log(
  `focus-ring #fb923c on surface #211c18: ${contrastRatio('#fb923c', '#211c18').toFixed(2)}:1`,
);
console.log(
  `border-strong #5c5246 on surface #211c18: ${contrastRatio('#5c5246', '#211c18').toFixed(2)}:1`,
);
