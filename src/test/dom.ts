/**
 * The browser environment the component tests need.
 *
 * ## Why this exists
 *
 * **jsdom is not a browser.** It implements the DOM but not the two
 * platform APIs the surfaces depend on:
 *
 * - **`window.matchMedia`** — jsdom does not implement it, and the theme
 *   toggle reads the OS's colour-scheme preference through it. Without a
 *   stand-in, every component that renders the theme toggle throws.
 * - **the Next.js app router** — `useRouter` throws unless an app router
 *   is mounted, and the Pending header's sign-out calls it.
 *
 * **These are environment gaps, not product defects**, so the stand-ins
 * live here — in the test layer — and not in the application code.
 *
 * ## Why the stand-ins are controllable
 *
 * **`matchMedia` returns an object whose `matches` is read through a
 * getter**, so a test can change the OS preference and the change is
 * visible on the next read. The theme toggle's own suite needs exactly
 * that, and a frozen value would make the "System follows the OS" rule
 * untestable.
 *
 * **The router's methods are spies**, so a test can assert that a
 * navigation happened — the sign-out navigates to the landing page after
 * the request, whichever way the request went.
 */

import { vi } from 'vitest';

/** The OS's dark-mode preference, as the stub reports it. */
let osPrefersDark = false;

/** The listener attached to the media query, if any. */
let mediaListener: ((event: { matches: boolean }) => void) | null = null;

/**
 * Install a controllable `window.matchMedia`.
 *
 * **The previous value is restored by `resetDomEnvironment`**, so one
 * test's OS preference cannot leak into the next.
 */
export function installMatchMedia(prefersDark = false): void {
  osPrefersDark = prefersDark;
  mediaListener = null;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return query.includes('dark') ? osPrefersDark : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
        mediaListener = listener;
      },
      removeEventListener: () => {
        mediaListener = null;
      },
      addListener: (listener: (event: { matches: boolean }) => void) => {
        mediaListener = listener;
      },
      removeListener: () => {
        mediaListener = null;
      },
      dispatchEvent: () => false,
    }),
  });
}

/** Change the OS's colour-scheme preference and notify the listener. */
export function setOsPrefersDark(prefersDark: boolean): void {
  osPrefersDark = prefersDark;
  mediaListener?.({ matches: prefersDark });
}

/**
 * The Next.js router stand-in.
 *
 * **`push`, `replace`, `refresh`, and `back` are spies** — a test
 * asserts on them with `expect(router.push).toHaveBeenCalledWith(...)`.
 */
export interface RouterStub {
  readonly push: ReturnType<typeof vi.fn>;
  readonly replace: ReturnType<typeof vi.fn>;
  readonly refresh: ReturnType<typeof vi.fn>;
  readonly back: ReturnType<typeof vi.fn>;
  readonly forward: ReturnType<typeof vi.fn>;
  readonly prefetch: ReturnType<typeof vi.fn>;
}

/**
 * Mock `next/navigation`'s router.
 *
 * **The module is mocked, not the router instance** — `useRouter` reads
 * from a module-level context, so mocking the module is the only way to
 * give a component a router at all.
 *
 * **`vi.mock` is hoisted** by the Vitest transform, so the mock factory
 * itself has to be written in the *test file*, at the top level. This
 * helper builds the object the factory hands back.
 */
export function createRouterStub(): RouterStub {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };
}

/**
 * Reset the environment between tests.
 *
 * **`localStorage` is cleared and the theme attribute removed**, so one
 * test's stored theme cannot decide the next test's icon.
 */
export function resetDomEnvironment(): void {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  installMatchMedia(false);
}
