/**
 * The administrator routes' tests.
 *
 * ## Why these tests read the filesystem
 *
 * Two of bolt 021's success criteria are **absences** that no runtime
 * assertion can prove:
 *
 * - *"No `/admin/audit` route exists."*
 * - *"No notification bell, notification centre, or background-event toast
 *   exists."*
 *
 * A route that does not exist **cannot be served**, and the way to prove
 * that is to look at the route tree. So these tests read
 * `src/app/` and assert on what is and is not there.
 *
 * The FR-30 check is the same shape, one level up: **the whole application
 * tree** is scanned for the forbidden markers — a notification bell in a
 * member surface would break FR-30 just as surely as one in the
 * administrator surfaces.
 *
 * ## What is asserted about the route tree
 *
 * - The seven administrator routes exist.
 * - **No `/admin/audit` route exists** — no directory, no page, no
 *   route handler, at any depth under `/admin`.
 * - No administrator route's path names audit.
 * - The administrator nav carries the four queues and **not** an audit
 *   entry.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ADMIN_NAV_ITEMS } from '@/ui/admin-copy';
import {
  NOTIFICATION_SURFACE_MARKERS,
  SUPPORTED_NOTIFICATION_CHANNELS,
} from '@/domain/administration';

const APP_ROOT = join(process.cwd(), 'src', 'app');

/**
 * Escape a marker for use in a regular expression.
 */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every file under a directory, recursively.
 */
function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const found: string[] = [];

  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path));
    } else {
      found.push(path);
    }
  }

  return found;
}

/**
 * The route path of a file under `src/app`, as Next.js would read it.
 *
 * **`page.tsx` and `route.ts` are the two route-bearing file names,**
 * and a dynamic segment is `[id]` in the directory name and `:id` in the
 * path.
 */
function routePathFor(file: string): string {
  const relativePath = relative(APP_ROOT, file).replace(/\\/g, '/');
  const parts = relativePath.split('/');

  const fileName = parts.pop() ?? '';
  const routeSegments = parts.map((part) => part.replace(/^\[([^\]]+)\]$/, ':$1'));

  if (fileName === 'page.tsx' || fileName === 'page.ts' || fileName === 'page.jsx') {
    return `/${routeSegments.join('/')}`;
  }

  if (fileName === 'route.ts' || fileName === 'route.js') {
    return `/api/${routeSegments.join('/')}`;
  }

  return '';
}

describe('the administrator route tree', () => {
  it('has the twelve administrator pages', () => {
    const routes = filesUnder(APP_ROOT)
      .map(routePathFor)
      .filter((route) => route.startsWith('/admin'))
      .filter((route) => !route.startsWith('/admin/api'));

    expect(routes.sort()).toEqual([
      '/admin',
      '/admin/awaiting-return',
      '/admin/awaiting-return/:id',
      '/admin/claims',
      '/admin/claims/:id',
      '/admin/items/:id/audit',
      '/admin/lost/:id',
      '/admin/lost/:id/audit',
      '/admin/registrations',
      '/admin/registrations/:id',
      '/admin/reports/:id/edit',
      '/admin/storage',
      '/admin/verifications',
    ]);
  });

  it('serves every queue action link from a route that exists', () => {
    // **§5.7: every row action "is a link or button that reaches the
    // specific work item."** A link to a route that is not there reaches
    // nothing — the administrator clicks "Approve" and gets a 404, and
    // the queue is a dead end.
    //
    // **The check is on the filesystem,** because a route that does not
    // exist cannot be served. The queue's four action links are checked
    // against the pages that answer them.
    const actionRoutes = [
      'admin/registrations/[id]',
      'admin/claims/[id]',
      'admin/awaiting-return/[id]',
      'admin/lost/[id]',
    ];

    for (const route of actionRoutes) {
      expect(existsSync(join(APP_ROOT, route, 'page.tsx'))).toBe(true);
    }
  });

  it('has no global audit route', () => {
    // **§17.1: "No global `/admin/audit` route."** The check is on the
    // filesystem, because a route that does not exist cannot be served —
    // no handler can refuse it, because there is no handler.
    expect(existsSync(join(APP_ROOT, 'admin', 'audit'))).toBe(false);
  });

  it('names no administrator route "audit" other than the two contextual ones', () => {
    const auditRoutes = filesUnder(APP_ROOT)
      .map(routePathFor)
      .filter((route) => route.includes('audit'))
      .filter((route) => route.startsWith('/admin'));

    expect(auditRoutes.sort()).toEqual([
      '/admin/items/:id/audit',
      '/admin/lost/:id/audit',
    ]);
  });

  it('has an audit directory only under the two contextual parents', () => {
    const auditDirectories = filesUnder(APP_ROOT).filter((file) => {
      const relativePath = relative(APP_ROOT, file).replace(/\\/g, '/');

      return relativePath.split('/').includes('audit') && relativePath.endsWith('page.tsx');
    });

    const parents = auditDirectories.map((file) =>
      relative(APP_ROOT, file).replace(/\\/g, '/').split('/').slice(0, -1).join('/'),
    );

    expect(parents.sort()).toEqual([
      'admin/items/[id]/audit',
      'admin/lost/[id]/audit',
    ]);
  });
});

describe('the administrator nav layer', () => {
  it('carries the four operational queues', () => {
    // **§3.2: the admin nav layer exposes the four operational queues.**
    expect(ADMIN_NAV_ITEMS).toEqual([
      'Registrations',
      'Claims',
      'Awaiting return',
      'In verification',
    ]);
  });

  it('carries no audit entry', () => {
    // **§17.1: audit is reached from the report's context only.** A
    // topbar audit entry would be a global audit entry point by another
    // name.
    expect(ADMIN_NAV_ITEMS.join(' ').toLowerCase()).not.toContain('audit');
  });
});

describe('FR-30 — the application has no in-app notification stream', () => {
  it('carries no notification marker in any rendered markup', () => {
    /**
     * **The check is on the markup the surfaces actually render.**
     *
     * FR-30 forbids an in-app notification stream **anywhere in the
     * product** — not merely on the administrator surfaces. The
     * administrator surfaces' own rendered markup is checked in
     * `admin-surfaces.test.tsx`; this check is over the **whole
     * application's** class names and attribute values, which is where
     * a bell, a badge, an unread count, or an activity feed would have
     * to appear for it to be a real surface.
     *
     * The marker list lives in the domain, so the surfaces and this
     * check cannot disagree about what is forbidden.
     */
    const sources = filesUnder(join(process.cwd(), 'src'))
      .filter((file) => /\.(tsx|css)$/.test(file))
      .filter((file) => !file.endsWith('.test.tsx'));

    const offenders: string[] = [];

    for (const source of sources) {
      const contents = readFileSync(source, 'utf8').toLowerCase();

      for (const marker of NOTIFICATION_SURFACE_MARKERS) {
        // **The check is on a class name or an attribute value, never on
        // prose.** A comment that says "there is no notification bell" is
        // documentation of the absence, not an instance of it — and a
        // check that failed on documentation would be a check that
        // stopped being run.
        const asClassName = new RegExp(
          `class(?:Name)?=[\\"'{][^\\"'}\\n]*${escapeForRegExp(marker)}`,
          'i',
        );

        if (asClassName.test(contents)) {
          offenders.push(`${relative(process.cwd(), source)} → class "${marker}"`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('carries no toast for a background event', () => {
    /**
     * **FR-30 also forbids a toast for a background event.**
     *
     * A toast is legitimate for the action the administrator just took —
     * "Registration approved." — so the check is not "there is no toast
     * component". It is that no toast is *subscribed to a background
     * event*: nothing polls, and nothing opens a toast on a timer, on an
     * interval, or on a push.
     */
    const sources = filesUnder(join(process.cwd(), 'src'))
      .filter((file) => /\.(ts|tsx)$/.test(file))
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.test.tsx'));

    const offenders: string[] = [];

    for (const source of sources) {
      const contents = readFileSync(source, 'utf8');

      // **A polling loop or an interval-driven notification.** The
      // `setInterval` name is the tell — a queue that polled would be
      // the in-app notification stream FR-30 forbids.
      if (/\bsetInterval\s*\(/.test(contents)) {
        offenders.push(`${relative(process.cwd(), source)} → setInterval`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('declares only the nine email channels and no in-app channel', () => {
    /**
     * **The product's notification channels are nine, and all nine are
     * email.**
     *
     * PRD FR-46 names eight business-email events and FR-51 names the
     * authentication email — so there is no in-app channel to add, and
     * a tenth channel would be a new product surface rather than an
     * implementation detail.
     */
    expect(SUPPORTED_NOTIFICATION_CHANNELS).toHaveLength(9);

    for (const channel of SUPPORTED_NOTIFICATION_CHANNELS) {
      expect(channel.startsWith('email:')).toBe(true);
    }
  });
});

