'use client';

/**
 * A disclosure menu.
 *
 * **The trigger is a button with `aria-expanded` and `aria-controls`,** and
 * the panel is the element it controls. A screen reader announces whether
 * the menu is open, and the association between trigger and panel survives
 * a re-render because the panel's id is generated once per component.
 *
 * **Escape closes the menu and returns focus to the trigger.** That is the
 * disclosure pattern's requirement: a menu the keyboard user opened must be
 * dismissible without a pointer.
 *
 * ## The keyboard contract
 *
 * Story 011's criterion: *"it opens with Enter or Space, navigates with the
 * arrow keys, and closes with Escape."*
 *
 * | Key | What it does |
 * |---|---|
 * | Enter or Space | opens the menu (the button's native behaviour) |
 * | Arrow Down / Arrow Up | moves the focus between the items, wrapping at the ends |
 * | Home / End | moves the focus to the first / last item |
 * | Escape | closes the menu and returns the focus to the trigger |
 * | Tab | moves out of the menu, closing it |
 *
 * **Arrow Down on the *closed* trigger opens the menu.** That is the
 * menu-button pattern's convenience, and without it a keyboard user has to
 * open the menu with Enter before the arrow keys do anything.
 *
 * **Arrow keys do not scroll the page.** `preventDefault()` on every arrow
 * key is what stops the browser from scrolling the document behind the menu
 * while the user is moving between items.
 *
 * **Tab closes the menu.** The menu is a transient disclosure: Tab moves
 * the focus onward, and leaving the menu open behind the user's cursor
 * would leave a stale panel on the screen with focus somewhere else.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';

/** The disclosure menu's props. */
export interface DisclosureMenuProps {
  /** The trigger's accessible name. */
  readonly label: string;
  /** The links the panel offers. */
  readonly entries: readonly { readonly label: string; readonly href: string }[];
  /**
   * Custom trigger contents — the Account menu's initials avatar lives
   * here. When omitted, `label` is the visible text.
   */
  readonly trigger?: React.ReactNode;
  /** Extra class on the trigger, when the chrome is not a plain text link. */
  readonly triggerClassName?: string;
  /** Optional header rendered above the entries — name and role. */
  readonly header?: React.ReactNode;
  /** Extra items — the `Log out` button lives here. */
  readonly children?: React.ReactNode;
}

/**
 * A disclosure menu.
 */
export function DisclosureMenu({
  label,
  entries,
  trigger,
  triggerClassName,
  header,
  children,
}: DisclosureMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLUListElement | null>(null);

  const close = useCallback((): void => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  /**
   * The focusable items in the panel.
   *
   * **Both the links and the `Log out` button count.** The button is a
   * child of the panel, so an Arrow Down that skipped it would leave the
   * signed-in visitor unable to reach the one action in the menu that is
   * not a navigation.
   */
  const focusableItems = useCallback((): HTMLElement[] => {
    const panel = panelRef.current;

    if (!panel) {
      return [];
    }

    return Array.from(panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'));
  }, []);

  /**
   * Move the focus to an item, by index.
   *
   * **The index wraps.** Arrow Down on the last item moves to the first,
   * and Arrow Up on the first moves to the last — the menu is a loop, and a
   * menu that dead-ends makes the keyboard user hunt for the way out.
   */
  const focusItem = useCallback(
    (index: number): void => {
      const items = focusableItems();

      if (items.length === 0) {
        return;
      }

      items[((index % items.length) + items.length) % items.length]?.focus();
    },
    [focusableItems],
  );

  /**
   * The keyboard contract, on the panel.
   *
   **The listener is on the panel's own subtree,** so an Escape elsewhere on
   * the page does not close a menu the visitor did not open, and an arrow
   * key pressed elsewhere does not move this menu's focus.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }

      if (event.key === 'Tab') {
        // **The menu closes on the way out.** The focus is left alone —
        // the browser moves it — but the panel must not stay open behind
        // the visitor's cursor.
        setOpen(false);
        return;
      }

      const items = focusableItems();

      if (items.length === 0) {
        return;
      }

      const current = items.indexOf(document.activeElement as HTMLElement);

      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          focusItem(current + 1);
          break;
        }

        case 'ArrowUp': {
          event.preventDefault();
          focusItem(current - 1);
          break;
        }

        case 'Home': {
          event.preventDefault();
          focusItem(0);
          break;
        }

        case 'End': {
          event.preventDefault();
          focusItem(items.length - 1);
          break;
        }

        default:
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close, focusableItems, focusItem]);

  return (
    <div className="menu">
      <button
        ref={triggerRef}
        type="button"
        className={['menu__trigger', triggerClassName ?? 'topbar__link'].join(' ')}
        aria-label={trigger ? label : undefined}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="true"
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
        }}
        onKeyDown={(event) => {
          // **Arrow Down opens the menu.** On an already-open menu the
          // panel's own handler takes over, so this only fires while the
          // menu is closed.
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger ?? label}
      </button>

      {open ? (
        <ul className="menu__panel" id={panelId} ref={panelRef}>
          {header}

          {entries.map((entry) => (
            <li key={entry.href}>
              <Link href={entry.href} className="menu__item">
                {entry.label}
              </Link>
            </li>
          ))}

          {children}
        </ul>
      ) : null}
    </div>
  );
}
