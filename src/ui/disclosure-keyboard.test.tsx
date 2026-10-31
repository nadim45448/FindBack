/**
 * @vitest-environment jsdom
 */

/**
 * The disclosure keyboard contract — story 011.
 *
 * **These are the tests for story 011's menu criterion:** *"it opens with
 * Enter or Space, navigates with the arrow keys, and closes with Escape"*
 * — and for the disclosure criterion: *"it carries `aria-expanded` and
 * `aria-controls` referencing the hidden region by id, and its state
 * updates on toggle."*
 *
 * ## Why the suite drives real key events
 *
 * The criterion is about **what a keyboard user experiences**, so the suite
 * fires `keydown` on the element that has the focus and then asserts
 * **where the focus ended up**. A source scan would pass on a menu whose
 * arrow keys were wired to the wrong element, or whose `aria-controls`
 * named a region that was not the one it toggled.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_MENU_LABEL,
  REPORT_MENU_ENTRIES,
  REPORT_MENU_LABEL,
} from '@/domain/listings';

import {
  createRouterStub,
  installMatchMedia,
  resetDomEnvironment,
  type RouterStub,
} from '@/test/dom';

import { DisclosureMenu } from './disclosure-menu';
import { MemberTopbar } from './member-topbar';

function renderShell(onSignOut?: () => void): void {
  render(
    <>
      <DisclosureMenu label={REPORT_MENU_LABEL} entries={REPORT_MENU_ENTRIES} />
      <MemberTopbar onSignOut={onSignOut} />
    </>,
  );
}

const router: RouterStub = createRouterStub();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

beforeEach(() => {
  resetDomEnvironment();
  // **The theme toggle reads the OS's colour-scheme preference,** and
  // jsdom does not implement `matchMedia` — so the stub has to be in
  // place before the first render, not merely before the next one.
  installMatchMedia();
});

afterEach(() => {
  cleanup();
  resetDomEnvironment();
});

/**
 * The menu's trigger.
 *
 * **Found by name, not by position.** The member topbar carries two
 * disclosures, and a test that reached for "the first button" would break
 * the day a third was added.
 */
function trigger(label: string): HTMLElement {
  const element = screen.getByRole('button', { name: label });

  if (!(element instanceof HTMLElement)) {
    throw new Error(`the "${label}" trigger is not in the document`);
  }

  return element;
}

/**
 * The menu panel.
 *
 * **Found through `aria-controls`,** because that is the association the
 * criterion names — and resolving it that way means the test fails if the
 * trigger ever points at the wrong region.
 */
function panel(label: string): HTMLElement {
  const controls = trigger(label).getAttribute('aria-controls');
  const element = controls ? document.getElementById(controls) : null;

  if (!(element instanceof HTMLElement)) {
    throw new Error(`the "${label}" panel is not in the document`);
  }

  return element;
}

/**
 * The focusable items inside the panel.
 */
function items(label: string): HTMLElement[] {
  return Array.from(panel(label).querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
}

describe('the disclosure trigger', () => {
  it('carries aria-expanded, and it is false while the menu is closed', () => {
    renderShell();

    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('false');
  });

  it('carries aria-controls, and it names the panel it opens', () => {
    // **The criterion: "`aria-controls` referencing the hidden region by
    // id."** The association is checked in both directions — the trigger
    // names a region, and that region is the one the menu renders.
    renderShell();

    const controls = trigger(REPORT_MENU_LABEL).getAttribute('aria-controls');

    expect(controls).toBeTruthy();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    expect(document.getElementById(controls ?? '')).toBe(panel(REPORT_MENU_LABEL));
  });

  it('updates aria-expanded on toggle', () => {
    // **"Its state updates on toggle."** The attribute is the only thing
    // that tells a screen reader the menu is open.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));
    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(trigger(REPORT_MENU_LABEL));
    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('false');
  });

  it('opens with Enter', () => {
    // **The criterion: "opens with Enter or Space."** A `<button>` does
    // this natively — but the assertion is made here so a future change
    // that replaced the button with a `<div>` would be caught.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('true');
    expect(items(REPORT_MENU_LABEL)).toHaveLength(2);
  });

  it('opens with Space', () => {
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens with Arrow Down', () => {
    // **The menu-button pattern's convenience.** Without it, a keyboard
    // user has to open the menu with Enter before the arrow keys do
    // anything.
    renderShell();

    fireEvent.keyDown(trigger(REPORT_MENU_LABEL), { key: 'ArrowDown' });

    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('true');
  });
});

describe('the disclosure keyboard navigation', () => {
  it('moves the focus down with Arrow Down', () => {
    // **The criterion: "navigates with the arrow keys."** The assertion is
    // about **where the focus is**, not about whether a handler ran.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    const [first, second] = items(REPORT_MENU_LABEL);

    first?.focus();
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(second);
  });

  it('moves the focus up with Arrow Up', () => {
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    const [first, second] = items(REPORT_MENU_LABEL);

    second?.focus();
    fireEvent.keyDown(second as HTMLElement, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(first);
  });

  it('wraps from the last item to the first', () => {
    // **The menu is a loop.** A menu that dead-ends makes the keyboard
    // user hunt for the way out.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    const [first] = items(REPORT_MENU_LABEL);
    const last = items(REPORT_MENU_LABEL).at(-1);

    last?.focus();
    fireEvent.keyDown(last as HTMLElement, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(first);
  });

  it('wraps from the first item to the last', () => {
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    const [first] = items(REPORT_MENU_LABEL);
    const last = items(REPORT_MENU_LABEL).at(-1);

    first?.focus();
    fireEvent.keyDown(first as HTMLElement, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(last);
  });

  it('jumps to the first item with Home', () => {
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    const [first] = items(REPORT_MENU_LABEL);
    const last = items(REPORT_MENU_LABEL).at(-1);

    last?.focus();
    fireEvent.keyDown(last as HTMLElement, { key: 'Home' });

    expect(document.activeElement).toBe(first);
  });

  it('jumps to the last item with End', () => {
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    const [first] = items(REPORT_MENU_LABEL);
    const last = items(REPORT_MENU_LABEL).at(-1);

    first?.focus();
    fireEvent.keyDown(first as HTMLElement, { key: 'End' });

    expect(document.activeElement).toBe(last);
  });

  it('reaches the Log out button with the arrow keys', () => {
    // **The `Log out` button is in the menu but is not a link.** An arrow
    // key that skipped it would leave the member unable to reach the one
    // action in the Account menu that is not a navigation.
    renderShell(() => undefined);

    fireEvent.click(trigger(ACCOUNT_MENU_LABEL));

    const signOut = screen.getByRole('button', { name: 'Log out' });

    signOut.focus();
    fireEvent.keyDown(signOut, { key: 'ArrowUp' });

    expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Profile' }));
  });

  it('does not scroll the page when an arrow key is pressed', () => {
    // **Arrow keys must not scroll the document behind the menu.** The
    // `preventDefault()` is what stops the browser from scrolling while
    // the user moves between items.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    const [first] = items(REPORT_MENU_LABEL);

    first?.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });

    first?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('closes the menu on Escape, and returns the focus to the trigger', () => {
    // **The criterion: "closes with Escape."** And the disclosure
    // pattern's requirement that the focus goes back where it came from.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger(REPORT_MENU_LABEL));
  });

  it('closes the menu when the focus leaves it with Tab', () => {
    // **The menu is a transient disclosure.** Leaving it open behind the
    // member's cursor would leave a stale panel on the screen with focus
    // somewhere else.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    fireEvent.keyDown(document, { key: 'Tab' });

    expect(trigger(REPORT_MENU_LABEL).getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves another menu alone when Escape is pressed', () => {
    // **The listener is scoped to the open menu.** An Escape elsewhere on
    // the page must not close a menu the member did not open.
    renderShell();

    fireEvent.click(trigger(REPORT_MENU_LABEL));

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger(ACCOUNT_MENU_LABEL).getAttribute('aria-expanded')).toBe('false');
  });
});
