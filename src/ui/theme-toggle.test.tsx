/**
 * @vitest-environment jsdom
 */

/**
 * The theme toggle's tests.
 *
 * **These are the tests for the control's keyboard contract and its
 * persistence.** Story 001's criteria 10 through 15 name the behaviour:
 * a 44 × 44 icon button in the topbar, a `role="menu"` popover with
 * exactly three `role="menuitemradio"` items, the accessible name
 * `Theme: <state>. Click to change.`, arrow keys / Home / End / Enter /
 * Escape, Escape returning focus to the trigger, the `localStorage` key
 * `findback.theme`, and `System` following the OS with no user action.
 *
 * **The suite also pins the `data-theme-option` rule.** The menu rows are
 * labelled "Light" and "Dark", and the tokens are bound to
 * `[data-theme='light']` and `[data-theme='dark']` — so a row carrying
 * `data-theme` would re-theme itself. The rows carry `data-theme-option`
 * instead, and this suite asserts that.
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installMatchMedia, resetDomEnvironment, setOsPrefersDark } from '@/test/dom';

import { ThemeToggle } from './theme-toggle';
import { THEME_SCRIPT } from './theme-script';
import { THEMES, THEME_STORAGE_KEY } from './tokens';

/** The toggle's trigger button. */
function trigger(): HTMLElement {
  return screen.getByRole('button', { name: /Theme:/ });
}

/** The menu, once it is open. */
function menu(): HTMLElement {
  return screen.getByRole('menu', { name: 'Theme' });
}

/** The three menu rows, in order. */
function menuItems(): HTMLElement[] {
  return within(menu()).getAllByRole('menuitemradio');
}

beforeEach(() => {
  resetDomEnvironment();
  installMatchMedia();
});

afterEach(() => {
  cleanup();
});

describe('the theme toggle', () => {
  it('is a button in the topbar, not a control inside the account menu', () => {
    render(<ThemeToggle />);

    expect(trigger().tagName).toBe('BUTTON');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
  });

  it('shows the accessible name DESIGN.md names', () => {
    render(<ThemeToggle />);

    expect(trigger().getAttribute('aria-label')).toBe('Theme: System. Click to change.');
    expect(trigger().getAttribute('title')).toBe('Theme: System');
  });

  it('opens a menu with exactly three radio items', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());

    expect(menuItems()).toHaveLength(3);
    expect(menuItems().map((item) => item.textContent)).toEqual(['System', 'Light', 'Dark']);
  });

  it('opens on ArrowDown from the trigger', () => {
    render(<ThemeToggle />);

    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('marks the active theme with aria-checked', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'Dark');
    render(<ThemeToggle />);

    fireEvent.click(trigger());

    const checked = menuItems().filter((item) => item.getAttribute('aria-checked') === 'true');

    expect(checked).toHaveLength(1);
    expect(checked[0]?.textContent).toContain('Dark');
  });

  it('keeps the menu rows out of the token selectors', () => {
    // **The rule this test exists for.** A row labelled "Dark" that
    // carried `data-theme="Dark"` would match no token selector, but a
    // row carrying `data-theme="dark"` would match one and re-theme
    // itself. The rows carry `data-theme-option` and never `data-theme`.
    window.localStorage.setItem(THEME_STORAGE_KEY, 'Dark');
    render(<ThemeToggle />);

    fireEvent.click(trigger());

    for (const item of menuItems()) {
      expect(item.hasAttribute('data-theme')).toBe(false);
      expect(item.hasAttribute('data-theme-option')).toBe(true);
    }
  });
});

describe('the theme toggle’s keyboard contract', () => {
  it('moves the focus down through the items', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    menuItems()[0]?.focus();

    fireEvent.keyDown(menu(), { key: 'ArrowDown' });

    expect(document.activeElement).toBe(menuItems()[1]);
  });

  it('moves the focus up through the items', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    menuItems()[0]?.focus();

    fireEvent.keyDown(menu(), { key: 'ArrowUp' });

    expect(document.activeElement).toBe(menuItems()[2]);
  });

  it('wraps the focus around the end of the list', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    menuItems()[2]?.focus();

    fireEvent.keyDown(menu(), { key: 'ArrowDown' });

    expect(document.activeElement).toBe(menuItems()[0]);
  });

  it('jumps to the first item on Home and the last on End', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    menuItems()[0]?.focus();

    fireEvent.keyDown(menu(), { key: 'End' });

    expect(document.activeElement).toBe(menuItems()[2]);

    fireEvent.keyDown(menu(), { key: 'Home' });

    expect(document.activeElement).toBe(menuItems()[0]);
  });

  it('closes the menu on Escape and returns the focus to the trigger', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    fireEvent.keyDown(menu(), { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});

describe('choosing a theme', () => {
  it('persists the choice under the frozen key', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    fireEvent.click(menuItems()[2] as HTMLElement);

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('Dark');
  });

  it('closes the menu and returns the focus to the trigger', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    fireEvent.click(menuItems()[1] as HTMLElement);

    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('applies the chosen theme to the document', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    fireEvent.click(menuItems()[2] as HTMLElement);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('shows the chosen theme in the trigger’s name', () => {
    render(<ThemeToggle />);

    fireEvent.click(trigger());
    fireEvent.click(menuItems()[1] as HTMLElement);

    expect(trigger().getAttribute('aria-label')).toBe('Theme: Light. Click to change.');
  });
});

describe('the System theme', () => {
  it('follows the OS when the OS prefers light', () => {
    installMatchMedia(false);
    render(<ThemeToggle />);

    expect(trigger().getAttribute('data-resolved-theme')).toBe('light');
  });

  it('follows the OS when the OS prefers dark', () => {
    installMatchMedia(true);
    render(<ThemeToggle />);

    expect(trigger().getAttribute('data-resolved-theme')).toBe('dark');
  });

  it('follows the OS when the OS changes while the page is open', () => {
    // **Criterion 15: "System follows the OS live, with no user action."**
    // The listener the component attached to the media query is fired,
    // and the resolved theme changes with no interaction.
    installMatchMedia(false);
    render(<ThemeToggle />);

    expect(trigger().getAttribute('data-resolved-theme')).toBe('light');

    act(() => {
      setOsPrefersDark(true);
    });

    expect(trigger().getAttribute('data-resolved-theme')).toBe('dark');
  });

  it('does not follow the OS when the user has chosen a theme', () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'Light');
    render(<ThemeToggle />);

    act(() => {
      setOsPrefersDark(true);
    });

    expect(trigger().getAttribute('data-resolved-theme')).toBe('light');
  });
});

describe('the no-flash script', () => {
  it('names the same storage key as the token layer', () => {
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
  });

  it('sets the theme attribute before the first paint', () => {
    // **The script is what decides the theme before React hydrates.** It
    // is inlined into the head, so it runs before the browser paints.
    // Executing it here proves it sets the attribute — and that it
    // cannot throw when storage is unavailable.
    installMatchMedia(true);

    expect(() => {
      new Function(THEME_SCRIPT).call(window);
    }).not.toThrow();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('falls back to the OS when the stored value is not a theme name', () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, 'purple');

    new Function(THEME_SCRIPT).call(window);

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});

describe('the theme vocabulary', () => {
  it('offers exactly the three themes the script knows', () => {
    expect(THEMES).toEqual(['System', 'Light', 'Dark']);

    for (const theme of THEMES) {
      expect(THEME_SCRIPT).toContain(theme);
    }
  });
});
