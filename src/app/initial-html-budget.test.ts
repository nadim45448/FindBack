/**
 * The initial-HTML budget's tests — bolt `022`, story `011`.
 *
 * ## What the criterion is
 *
 * PRD §10: *"Page render (initial HTML): ≤ 2 seconds at p95 on a 4G
 * connection."* Bolt 022's eighth success criterion restates it.
 *
 * ## Why this is a structural test and not a timing test
 *
 * **A p95 is a property of a deployment, not of a unit test.** Measuring it
 * here would mean measuring a machine that is not the member's phone, on a
 * network that is not 4G — and the number would be a fiction that changed
 * every time the suite ran. **A timing test that cannot fail for the reason
 * it names is a test that lies.**
 *
 * So this suite asserts the **preconditions** that make the budget
 * achievable, and the preconditions are the ones this codebase controls:
 *
 * | Precondition | Why it decides the budget |
 * |---|---|
 * | The pages are **server-rendered** | The initial HTML is complete on the first byte; there is no client-side render to wait for. |
 * | The **client bundle is tiny** | On 4G the transfer dominates, so the bytes shipped to the browser are the budget. |
 * | The pages carry **no blocking third-party script** | A third-party script on a 4G connection is an unbounded wait. |
 * | The **CSS is one file** | A second round trip on 4G is a second RTT, and RTT is what 4G charges for. |
 *
 * **The first precondition is the one ADR-1 relies on:** *"Server rendering
 * satisfies PRD §10's ≤ 2 s p95 initial-HTML NFR."* This suite is that
 * claim made checkable — a page that became a client component would break
 * the reasoning the architecture decision rests on, and this suite would say
 * so.
 *
 * ## What is *not* asserted
 *
 * **The actual p95.** That is measured against the deployed application on a
 * 4G profile — an Operations measurement, not a Construction one. This
 * suite makes the number *plausible*; it does not claim it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The app directory. */
const APP_DIR = join(process.cwd(), 'src/app');

/** The app's source files, as paths relative to the app directory. */
function appFiles(): string[] {
  return readdirSync(APP_DIR, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.tsx') || entry.endsWith('.ts'))
    .filter((entry) => !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx'));
}

/** The source of one file. */
function sourceOf(relativePath: string): string {
  return readFileSync(join(APP_DIR, relativePath), 'utf8');
}

/** The route files — the pages the budget applies to. */
const ROUTE_FILES = appFiles().filter((entry) => entry.endsWith('/page.tsx'));

describe('the initial-HTML budget preconditions', () => {
  it('finds the routes it checks', () => {
    // **A precondition suite that checked nothing would pass forever.**
    expect(ROUTE_FILES.length).toBeGreaterThan(5);
  });

  it('server-renders every route', () => {
    // **The precondition the whole architecture rests on.** ADR-1 says
    // server rendering satisfies the ≤ 2 s p95 initial-HTML NFR — so a
    // route that became a client component would invalidate the decision,
    // and this suite is where that shows up.
    const offenders: string[] = [];

    for (const route of ROUTE_FILES) {
      if (/^\s*['"]use client['"]/m.test(sourceOf(route))) {
        offenders.push(route);
      }
    }

    expect(
      offenders,
      `these routes are client-rendered: ${offenders.join(' ')}`,
    ).toEqual([]);
  });

  it('keeps the client bundle to the interactive surfaces alone', () => {
    // **On 4G the transferred bytes dominate the budget.** So the set of
    // client components is the set of things that ship JavaScript, and it
    // is deliberately small: the forms that need local state, the theme
    // toggle, and the topbars' disclosure menus.
    const clientComponents = appFiles().filter((entry) =>
      /^\s*['"]use client['"]/m.test(sourceOf(entry)),
    );

    // **Every client component is a form or a navigation widget.** A
    // client component that is not one of those is a page shipping
    // JavaScript it does not need.
    const allowed = /form|panel|topbar|toggle|menu|surface/i;

    const offenders = clientComponents.filter((entry) => !allowed.test(entry));

    expect(
      offenders,
      `these client components ship JavaScript they do not need: ${offenders.join(' ')}`,
    ).toEqual([]);
  });

  it('loads no third-party script', () => {
    // **A third-party script is an unbounded wait on 4G.** It is not
    // bounded by anything this codebase controls, so the budget cannot be
    // claimed while one is present.
    const offenders: string[] = [];

    for (const route of ROUTE_FILES) {
      const source = sourceOf(route);

      if (/<script[^>]+src=["']https?:\/\//.test(source)) {
        offenders.push(route);
      }
    }

    expect(offenders, `these routes load a third-party script: ${offenders.join(' ')}`).toEqual([]);
  });

  it('serves the stylesheet from one file', () => {
    // **A second stylesheet is a second round trip,** and round-trip time
    // is exactly what 4G charges for. One file is one request.
    const layout = readFileSync(join(APP_DIR, 'layout.tsx'), 'utf8');
    const stylesheetLinks = layout.match(/<link[^>]+rel=["']stylesheet["']/g) ?? [];

    expect(stylesheetLinks.length).toBeLessThanOrEqual(1);
  });

  it('inlines the no-flash theme script rather than fetching it', () => {
    // **The theme script has to run before the first paint,** or the page
    // flashes the wrong theme — so it is inlined into the head rather than
    // fetched.
    //
    // **Inlining is what makes it free.** A fetched script would be a
    // render-blocking round trip on every page; an inlined one costs zero
    // requests, because it arrives with the HTML that is already being
    // downloaded.
    const layout = readFileSync(join(APP_DIR, 'layout.tsx'), 'utf8');

    expect(layout, 'the layout renders the theme script in the head').toContain('<ThemeScript />');
    expect(layout).not.toMatch(/<script[^>]+src=/);

    const script = readFileSync(join(process.cwd(), 'src/ui/theme-script.tsx'), 'utf8');

    // **The script is inlined through `dangerouslySetInnerHTML`,** so the
    // document carries the code itself.
    expect(script).toContain('dangerouslySetInnerHTML');
  });
});
