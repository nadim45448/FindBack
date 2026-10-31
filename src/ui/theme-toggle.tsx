'use client';

/**
 * The theme toggle.
 *
 * **A 44 × 44 icon button in the topbar, and a popover with three
 * `role="menuitemradio"` items** — DESIGN.md's Theme toggle section, and
 * story 001's criteria 10 through 13.
 *
 * ## The rules this component exists to satisfy
 *
 * | Rule | Where |
 * |---|---|
 * | 44 × 44 icon button in the topbar, **not** in the Account menu | story 001, criterion 10 |
 * | Icon is sun for Light, moon for Dark, half-filled circle for System | story 001, criterion 10 |
 * | Popover `role="menu"` with exactly three `role="menuitemradio"` items | story 001, criterion 11 |
 * | Accessible name `Theme: <state>. Click to change.` | story 001, criterion 12 |
 * | Arrow keys, Home, End, Enter, Escape | story 001, criterion 13 |
 * | Escape returns focus to the trigger | story 001, criterion 13 |
 * | `localStorage` key `findback.theme` | story 001, criterion 14 |
 * | `System` follows the OS live, with no user action | story 001, criterion 15 |
 *
 * ## Why the menu rows carry `data-theme-option`
 *
 * The tokens are bound to `[data-theme="light"]` and `[data-theme="dark"]`.
 * A menu row **labelled** `Light` or `Dark` would match a `[data-theme]`
 * selector if it ever carried that attribute — so the rows carry
 * `data-theme-option` instead, which no token selector matches. Without it,
 * a menu row named "Dark" could re-theme itself.
 *
 * ## Why the theme is read with `useSyncExternalStore`
 *
 * The stored preference and the OS preference are both **state the browser
 * owns**: one lives in `localStorage` and the other in the operating
 * system, and both can change without React's involvement. The
 * `useSyncExternalStore` hook is the sanctioned way to subscribe to them.
 *
 * The alternative — reading them into `useState` inside a `useEffect` —
 * has two problems. The first is the one the React Compiler's lint rule
 * names: a `setState` in an effect body causes a cascading render. The
 * second is subtler and more important: **the effect runs after the first
 * paint**, so the toggle's icon would show the wrong theme for one frame
 * on every page load. The subscription reads the current value during
 * render instead, so there is no stale frame.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { readStoredTheme, storeTheme } from './theme-script';
import {
  resolveTheme,
  themeAccessibleName,
  themeTitle,
  THEMES,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type Theme,
} from './tokens';

/** The icon each theme shows. DESIGN.md names all three. */
function ThemeIcon({ theme }: { readonly theme: Theme }) {
  if (theme === 'Light') {
    return (
      <svg
        aria-hidden="true"
        className="badge__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }

  if (theme === 'Dark') {
    return (
      <svg
        aria-hidden="true"
        className="badge__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    );
  }

  // System — the half-filled circle: left half solid, right half outline.
  return (
    <svg
      aria-hidden="true"
      className="badge__icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* The external stores                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The subscribers to the stored theme.
 *
 * **A module-level set, because `localStorage` is a single global
 * resource.** Every toggle on a page subscribes to the same storage, so a
 * change in one is seen by all of them.
 */
const themeSubscribers = new Set<() => void>();

/** The snapshot of the stored theme. */
let storedThemeSnapshot: Theme | null = null;

/** The raw storage value the snapshot was taken from. */
let storedThemeRaw: string | null = null;

/**
 * The current stored theme.
 *
 * **The snapshot is cached, and the cache is what makes the store
 * consistent.** `useSyncExternalStore` compares the snapshot by identity:
 * if `getSnapshot` returned a fresh value each time, React would loop
 * forever. So the value is read once and only re-read when a subscriber
 * says it changed.
 *
 * **The cache is keyed on the raw storage value**, so it stays correct
 * even when the stored value changes without a notification — the
 * snapshot is re-read whenever the raw value differs from the one the
 * snapshot was taken from. A stale snapshot is worse than a wasted
 * read: it would show the wrong icon.
 *
 * **The first read is the browser's** — it happens during render, so the
 * very first paint already shows the stored theme's icon.
 */
function getStoredThemeSnapshot(): Theme {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    raw = null;
  }

  if (storedThemeSnapshot === null || raw !== storedThemeRaw) {
    storedThemeSnapshot = readStoredTheme();
    storedThemeRaw = raw;
  }

  return storedThemeSnapshot;
}

/**
 * Subscribe to the stored theme.
 *
 * **The `storage` event is the signal.** It fires in *every* tab when
 * `localStorage` changes, so the theme follows across tabs.
 */
function subscribeToStoredTheme(onStoreChange: () => void): () => void {
  themeSubscribers.add(onStoreChange);

  const onStorage = (): void => {
    storedThemeSnapshot = null;
    storedThemeRaw = null;
    themeSubscribers.forEach((notify) => notify());
  };

  window.addEventListener('storage', onStorage);

  return () => {
    themeSubscribers.delete(onStoreChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Notify the subscribers that the stored theme changed. */
function notifyThemeChanged(): void {
  storedThemeSnapshot = null;
  storedThemeRaw = null;
  themeSubscribers.forEach((notify) => notify());
}

/* -------------------------------------------------------------------------- */
/* The OS preference                                                           */
/* -------------------------------------------------------------------------- */

/** The subscribers to the OS preference. */
const osSubscribers = new Set<() => void>();

/**
 * The OS's dark-mode preference.
 *
 * **The value is read fresh every time, and that is safe** — unlike the
 * stored theme, this snapshot is a **boolean primitive**, so it is
 * identity-stable by value. `useSyncExternalStore` compares snapshots by
 * `Object.is`, and two `true`s are the same `true`. The stored theme
 * needs a cache because it is a *string* that could be a new string with
 * the same text; a boolean cannot be.
 *
 * **Reading fresh also means the value can never be stale.** The
 * `change` listener below exists to tell React *that* the value changed;
 * it is not what makes the value current.
 */
function getOsSnapshot(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Subscribe to the OS preference.
 *
 * **The listener is attached to the media query**, so an OS theme change
 * notifies the subscribers and the page re-resolves with no user action —
 * story 001's criterion 15.
 */
function subscribeToOsPreference(onStoreChange: () => void): () => void {
  osSubscribers.add(onStoreChange);

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = (): void => {
    osSubscribers.forEach((notify) => notify());
  };

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onChange);
  } else {
    media.addListener(onChange);
  }

  return () => {
    osSubscribers.delete(onStoreChange);
    if (typeof media.removeEventListener === 'function') {
      media.removeEventListener('change', onChange);
    } else {
      media.removeListener(onChange);
    }
  };
}

/** Notify the subscribers that the OS preference changed. */
function notifyOsChanged(): void {
  osSubscribers.forEach((notify) => notify());
}

/* -------------------------------------------------------------------------- */
/* The component                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The theme toggle.
 *
 * **The trigger's icon shows the *active* theme**, not the theme the
 * menu is highlighting: sun for Light, moon for Dark, half-filled circle
 * for System.
 */
export function ThemeToggle(): React.JSX.Element {
  const [open, setOpen] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const theme = useSyncExternalStore(subscribeToStoredTheme, getStoredThemeSnapshot, getServerTheme);

  const prefersDark = useSyncExternalStore(
    subscribeToOsPreference,
    getOsSnapshot,
    getServerOsSnapshot,
  );

  const resolved = resolveTheme(theme, prefersDark);

  /**
   * Apply the resolved theme to the document.
   *
   * **The attribute is written on every change**, including the first one
   * after hydration. The no-flash script has already set it, so this
   * writes the same value — but if the user changed the OS theme while the
   * page was open, this is the write that follows the OS.
   */
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  /**
   * Select a theme: persist it, apply it, close the menu, restore focus.
   *
   * **The store is notified after the write**, so the icon updates from the
   * store rather than from a separate state update — one source of truth.
   */
  const select = useCallback((next: Theme): void => {
    storeTheme(next);
    notifyThemeChanged();
    notifyOsChanged();
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  /** Close the menu without changing the selection. */
  const close = useCallback((restoreFocus: boolean): void => {
    setOpen(false);

    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  /**
   * Clicking outside closes the menu.
   *
   **Focus is not trapped** — DESIGN.md's edge case says so explicitly.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent): void => {
      const target = event.target as Node | null;

      if (target && menuRef.current?.contains(target)) {
        return;
      }

      if (target && triggerRef.current?.contains(target)) {
        return;
      }

      close(false);
    };

    document.addEventListener('mousedown', onPointerDown);

    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open, close]);

  /**
   * The keyboard contract.
   *
   * Arrow Down / Arrow Up move the focus between items, Home and End jump
   * to the first and last, Enter selects the focused item, and Escape
   * closes the menu and returns focus to the trigger.
   */
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );

    if (items.length === 0) {
      return;
    }

    const current = items.indexOf(document.activeElement as HTMLButtonElement);

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        items[(current + 1 + items.length) % items.length]?.focus();
        break;
      }

      case 'ArrowUp': {
        event.preventDefault();
        items[(current - 1 + items.length) % items.length]?.focus();
        break;
      }

      case 'Home': {
        event.preventDefault();
        items[0]?.focus();
        break;
      }

      case 'End': {
        event.preventDefault();
        items[items.length - 1]?.focus();
        break;
      }

      case 'Escape': {
        event.preventDefault();
        close(true);
        break;
      }

      default:
        break;
    }
  };

  const items = useMemo(() => THEMES, []);

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-button theme-toggle"
        aria-label={themeAccessibleName(theme)}
        title={themeTitle(theme)}
        aria-haspopup="menu"
        aria-expanded={open}
        // **The trigger names the panel it controls.** A disclosure whose
        // `aria-expanded` says "open" but whose `aria-controls` names
        // nothing is a disclosure a screen reader cannot relate to its
        // content.
        aria-controls={menuId}
        data-theme-state={theme}
        data-resolved-theme={resolved}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <ThemeIcon theme={theme} />
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className="theme-menu"
          aria-label="Theme"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((option) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              // **`data-theme-option`, never `data-theme`** — the token
              // selectors must not match a menu row labelled "Light" or
              // "Dark" and re-theme it.
              data-theme-option={option}
              aria-checked={theme === option}
              className="theme-menu__item"
              onClick={() => select(option)}
            >
              <ThemeIcon theme={option} />
              {option}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The theme on the server.
 *
 * **The server cannot know the stored preference**, so it assumes
 * `System`. The no-flash script has already set the real attribute before
 * the first paint, and the hydration pass replaces this value with the
 * stored one — so the server's answer is only ever the pre-hydration
 * placeholder.
 */
function getServerTheme(): Theme {
  return 'System';
}

/**
 * The OS preference on the server.
 *
 * **The server cannot know it**, and it does not matter: the same
 * pre-hydration placeholder applies.
 */
function getServerOsSnapshot(): boolean {
  return false;
}

export type { ResolvedTheme };
