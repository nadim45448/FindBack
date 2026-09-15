// FindBack Prototype — Contrast audit (Pass-3, WCAG 2.1 AA).
// Computes contrast ratios for every foreground/background pair the prototype
// actually renders, in both light and dark themes, against the spec thresholds:
//   - Normal text: 4.5:1
//   - Large text:  3:1
//   - UI components/icons: 3:1
// Usage: `node contrast-audit.js`.

function srgbToLin(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}
function luminance(hex) {
  const m = String(hex).trim().replace('#', '');
  const v = m.length === 3
    ? m.split('').map((c) => c + c).join('')
    : m;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
function contrast(fg, bg) {
  const L1 = luminance(fg);
  const L2 = luminance(bg);
  const [a, b] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (a + 0.05) / (b + 0.05);
}

// Mix a color-mix(in srgb, A pct%, transparent) approximation: take A on the
// given opaque bg. (We treat "transparent" as mixing toward the bg itself —
// surfaces already factor in.)
function mix(fg, bg) {
  // simple linear blend in sRGB (alpha-blend fg over bg at p alpha)
  const a = parseInt(fg.slice(1, 3), 16);
  const ga = parseInt(fg.slice(3, 5), 16);
  const ba = parseInt(fg.slice(5, 7), 16);
  const a2 = parseInt(bg.slice(1, 3), 16);
  const g2 = parseInt(bg.slice(3, 5), 16);
  const b2 = parseInt(bg.slice(5, 7), 16);
  const p = 0.3;
  const m = (x, y) => Math.round(x * p + y * (1 - p));
  const out = [m(a, a2), m(ga, g2), m(ba, b2)].map((n) => {
    const hex = n.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  });
  return '#' + out.join('');
}

const LIGHT = {
  surface: '#FFFFFF',
  surfaceDim: '#F2EDE4',
  surfaceLow: '#F7F2EA',
  surfaceContainer: '#F2EDE4',
  surfaceHigh: '#ECE5D9',
  onSurface: '#1F1B16',
  onSurfaceVariant: '#5C5246',
  borderSubtle: '#E7DFD1',
  borderDefault: '#B8AB93',
  borderStrong: '#9A8E78',
  brandPrimary: '#7C2907',
  brandPrimaryHover: '#5C1F05',
  brandPrimaryActive: '#3D1403',
  brandPrimarySoft: '#FFE7D6',
  brandSecondary: '#1E5A4E',
  brandSecondarySoft: '#D6EBE5',
  success: '#1F6A42',
  successSoft: '#D6F0DF',
  warning: '#92400E',
  warningSoft: '#FFE7D6',
  error: '#B91C1C',
  errorSoft: '#FDE2E2',
  info: '#1E5A8E',
  infoSoft: '#D6E8F5',
  onError: '#FFFFFF',
  onPrimary: '#FFFFFF',
  onWarning: '#1F1B16',
  disabledBg: '#F2EDE4',
  disabledText: '#9A8E78'
};

const DARK = {
  surface: '#211C18',
  surfaceDim: '#1B1613',
  surfaceLow: '#1F1A16',
  surfaceContainer: '#251F1A',
  surfaceHigh: '#2D2620',
  onSurface: '#F5EFE5',
  onSurfaceVariant: '#C4B8A4',
  borderSubtle: '#2D2620',
  borderDefault: '#6B6051',
  borderStrong: '#9A8E78',
  brandPrimary: '#FB923C',
  brandPrimaryHover: '#FFB875',
  brandPrimaryActive: '#FBA86C',
  brandPrimarySoft: '#3A1F0E',
  brandSecondary: '#7BC9B5',
  brandSecondarySoft: '#16302A',
  success: '#4ADE80',
  successSoft: '#16302A',
  warning: '#FBBF77',
  warningSoft: '#3A2A14',
  error: '#FCA5A5',
  errorSoft: '#3A1414',
  info: '#93C5FD',
  infoSoft: '#142B45',
  onError: '#1F1B16',
  onPrimary: '#1F1B16',
  onWarning: '#1F1B16',
  disabledBg: '#251F1A',
  disabledText: '#8E8270'
};

// Approximation of color-mix(in srgb, X 30%, transparent) for type badges
// on dark theme — the prototype uses this for lost/found badges.
function badgeMixDark(badgeColor) {
  return mix(badgeColor, DARK.surface);
}

// Combinations the prototype actually renders.
// Each entry: [fg, bg, role (text|large|ui), description, theme]
const combos = [
  // -- LIGHT THEME --
  // Text on plain surfaces
  ['1F1B16', 'FFFFFF', 'text', 'Body text on surface (LIGHT)'],
  ['5C5246', 'FFFFFF', 'text', 'Muted text on surface (LIGHT)'],
  ['5C5246', 'F2EDE4', 'text', 'Muted text on surface-dim (LIGHT)'],
  ['5C5246', 'ECE5D9', 'text', 'Muted text on surface-high (LIGHT)'],
  ['5C5246', 'F7F2EA', 'text', 'Muted text on surface-low (LIGHT)'],
  ['FFFFFF', '7C2907', 'text', 'Primary button label on terracotta (LIGHT)'],
  ['7C2907', 'FFE7D6', 'text', 'Brand text on brand-primary-soft (LIGHT, e.g. nav-current, secondary button)'],
  ['FFFFFF', '1E5A4E', 'text', 'Evergreen button label (LIGHT, e.g. admin CTA)'],
  ['1E5A4E', 'D6EBE5', 'text', 'Evergreen text on secondary-soft (LIGHT)'],
  // Status
  ['1F6A42', 'D6F0DF', 'text', 'Success text on success-soft (LIGHT, e.g. approved banner)'],
  ['92400E', 'FFE7D6', 'text', 'Warning text on warning-soft (LIGHT)'],
  ['B91C1C', 'FDE2E2', 'text', 'Error text on error-soft (LIGHT)'],
  ['1E5A8E', 'D6E8F5', 'text', 'Info text on info-soft (LIGHT)'],
  // Form feedback (Pass-3)
  ['B91C1C', 'FFFFFF', 'text', 'Error text on white input (LIGHT)'],
  // Disabled
  ['7A6F5A', 'F2EDE4', 'text', 'Disabled text on disabled bg (LIGHT)'],
  // Borders (UI components)
  ['9A8E78', 'FFFFFF', 'ui', 'border-strong on surface (LIGHT)'],
  ['9A8E78', 'FFFFFF', 'ui', 'border-default on surface (LIGHT)'],
  // -- DARK THEME --
  ['F5EFE5', '211C18', 'text', 'Body text on surface (DARK)'],
  ['C4B8A4', '211C18', 'text', 'Muted text on surface (DARK)'],
  ['C4B8A4', '1B1613', 'text', 'Muted text on surface-dim (DARK)'],
  ['C4B8A4', '2D2620', 'text', 'Muted text on surface-high (DARK)'],
  ['1F1B16', 'FB923C', 'text', 'Primary button label on terracotta (DARK)'],
  ['FB923C', '3A1F0E', 'text', 'Brand text on brand-primary-soft (DARK, e.g. nav-current)'],
  ['1F1B16', 'FB923C', 'text', 'Dark text on terracotta button (DARK, e.g. invert)'],
  ['1F1B16', '7BC9B5', 'text', 'Dark text on evergreen button (DARK)'],
  ['7BC9B5', '16302A', 'text', 'Evergreen text on secondary-soft (DARK)'],
  ['4ADE80', '16302A', 'text', 'Success text on success-soft (DARK)'],
  ['FBBF77', '3A2A14', 'text', 'Warning text on warning-soft (DARK)'],
  ['FCA5A5', '3A1414', 'text', 'Error text on error-soft (DARK)'],
  ['93C5FD', '142B45', 'text', 'Info text on info-soft (DARK)'],
  ['FCA5A5', '211C18', 'text', 'Error text on surface (DARK)'],
  ['8E8270', '251F1A', 'text', 'Disabled text on disabled bg (DARK)'],
  ['C4B8A4', '211C18', 'ui', 'border-strong on surface (DARK)'],
  ['9A8E78', '211C18', 'ui', 'border-default on surface (DARK)'],
  // -- Status badges (light theme: soft bg, brand fg) --
  ['92400E', 'FFE7D6', 'text', 'Lost-badge text on warning-soft (LIGHT)'],
  ['1F6A42', 'D6F0DF', 'text', 'Found-badge text on success-soft (LIGHT)'],
  // -- Status badges dark theme (color-mix(in srgb, X 30%, transparent)) --
  // Approximate: 30% of brand color blended onto dark surface.
  ['FBBF77', '#3A2A14', 'text', 'Lost-badge (color-mix) bg DARK'],
  ['4ADE80', '#16302A', 'text', 'Found-badge (color-mix) bg DARK']
];

function verdict(ratio, role) {
  if (role === 'ui') return ratio >= 3 ? 'PASS' : 'FAIL';
  return ratio >= 4.5 ? 'PASS' : (ratio >= 3 ? 'LARGE-ONLY' : 'FAIL');
}

let output = '| Ratio | Verdict | Description |\n';
output += '|---|---|---|\n';
let failures = 0;
combos.forEach(([fg, bg, role, desc]) => {
  const fgHex = fg.startsWith('#') ? fg : '#' + fg;
  const bgHex = bg.startsWith('#') ? bg : '#' + bg;
  const r = contrast(fgHex, bgHex);
  const v = verdict(r, role);
  if (v === 'FAIL') failures++;
  output += '| ' + r.toFixed(2) + ':1 | ' + v + ' | ' + desc + '\n';
});
output += '\n' + (failures ? 'FAILURES: ' + failures : 'ALL PASS');
process.stdout.write(output);
process.exit(failures ? 1 : 0);
