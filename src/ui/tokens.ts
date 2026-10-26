/**
 * Design tokens, transcribed from the frozen DESIGN.md.
 *
 * Source of truth:
 *   _bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29/DESIGN.md
 *
 * This file is a transcription, not a design decision. Values are copied
 * verbatim; changing one means the frozen design has changed, which requires
 * explicit owner approval.
 */

export const brand = {
  primary: '#7C2907',
  primaryHover: '#9A3412',
  primaryActive: '#7F1D1D',
  primarySoft: '#FFE7D6',
  onPrimary: '#FFFFFF',
  secondary: '#1E5A4E',
} as const;

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
 * Status colours. Every badge is paired with a text label and an icon — colour
 * is never the sole carrier of meaning (PRD NFR accessibility).
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

/** 4 px base unit. */
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

export const typography = {
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
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

/** WCAG 2.1 AA touch-target floor. */
export const touchTarget = '44px';

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '16px',
  pill: '999px',
} as const;
