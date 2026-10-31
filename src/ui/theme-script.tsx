/**
 * The no-flash theme script.
 *
 * **This runs before the first paint.** It is inlined into the document
 * head by `layout.tsx`, and it is the only thing that decides the theme
 * before React hydrates — so the page never paints the wrong theme first
 * (story 001's criterion 9, and DESIGN.md's "no FOUC").
 *
 * ## Why this is a raw script and not a React component
 *
 * A React component's effect runs **after** the first paint, which is
 * exactly the flash the requirement forbids. The only way to set the
 * attribute before paint is to run script in the document, before the
 * browser paints anything.
 *
 * ## The script is deliberately small and total
 *
 * It cannot fail. `localStorage` access can throw (a browser with storage
 * disabled, a sandboxed iframe, a privacy mode that denies access), so
 * every access is wrapped. A failure means "no stored preference", which
 * means `System`, which means the OS preference — the safe default.
 */

import { THEME_STORAGE_KEY, type Theme } from './tokens';

/**
 * The inline script.
 *
 * **It must be kept in sync with `src/ui/tokens.ts`** — the storage key
 * and the three theme names appear in both. `theme-script.test.ts` asserts
 * they agree, so the script cannot silently drift onto a different key.
 */
export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var s=window.localStorage.getItem(k);var t=(s==='Light'||s==='Dark')?s:'System';var d=t==='Dark'||(t==='System'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){document.documentElement.setAttribute('data-theme',window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}})();`;

/**
 * The script element.
 *
 * `suppressHydrationWarning` on `<html>` is required and not optional:
 * the script mutates `data-theme` before React hydrates, so React would
 * otherwise report a mismatch on the attribute it did not write.
 */
export function ThemeScript(): React.JSX.Element {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}

/**
 * The theme a stored value names, read in the browser.
 *
 * **The browser's `localStorage` is untrusted input.** A value that is
 * not one of the three names is treated as `System` rather than throwing —
 * a corrupted entry must not leave the page unthemed.
 */
export function readStoredTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (stored === 'Light' || stored === 'Dark' || stored === 'System') {
      return stored;
    }
  } catch {
    // Storage is unavailable — fall through to `System`.
  }

  return 'System';
}

/** Persist the theme preference. Storage failures are not fatal. */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage is unavailable. The theme still applies for this session.
  }
}
