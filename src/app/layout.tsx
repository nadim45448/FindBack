import type { Metadata } from 'next';
import './globals.css';

import { AppShell } from '@/ui/app-shell';
import { ThemeScript } from '@/ui/theme-script';

export const metadata: Metadata = {
  title: {
    default: 'FindBack',
    template: '%s — FindBack',
  },
  description: 'Lost and found for the campus community.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
    shortcut: '/favicon.svg',
  },
};

/**
 * The root layout.
 *
 * ## The theme script comes first, and it is not optional
 *
 * `<ThemeScript />` is inlined into the `<head>` and runs **before the
 * first paint**. That is the only way to satisfy story 001's criterion 9 —
 * *"the theme resolves from `prefers-color-scheme` with no flash of the
 * wrong theme"*. A React effect runs after the paint, which is exactly the
 * flash the criterion forbids, so the resolution is done by a script in the
 * document instead.
 *
 * **`suppressHydrationWarning` on `<html>` is required.** The script mutates
 * `data-theme` before React hydrates, so React would otherwise report a
 * mismatch on an attribute it did not write. The warning is suppressed on
 * the `<html>` element only — the mismatch is real and expected, and it is
 * confined to that one attribute.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
