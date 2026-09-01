// ============================================================================
// FindBack Mockup App — shared helpers.
// Inlines before first paint: theme bootstrap (per EXPERIENCE.md §19).
// Theme selection: System | Light | Dark, persisted in localStorage.
// ============================================================================
(function () {
  'use strict';

  // ---------- Theme bootstrap (must run before first paint) ----------
  function getInitialTheme() {
    try {
      const stored = localStorage.getItem('findback.theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch (e) { /* localStorage may be unavailable */ }
    return 'system';
  }
  function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  function applyTheme(pref) {
    const actual = resolveTheme(pref);
    document.documentElement.setAttribute('data-theme', actual);
    document.documentElement.setAttribute('data-theme-pref', pref);
  }

  // Run immediately.
  const pref = getInitialTheme();
  applyTheme(pref);

  // Listen for OS changes when user is on "system".
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      const current = (function () {
        try { return localStorage.getItem('findback.theme') || 'system'; }
        catch (e) { return 'system'; }
      })();
      if (current === 'system') applyTheme('system');
    });
  }

  // ---------- Mockup helpers (available on DOMContentLoaded) ----------
  document.addEventListener('DOMContentLoaded', function () {

    // ---------- Theme toggle widget (icon button + popover menu) ----------
    const toggle = document.querySelector('[data-theme-toggle]');
    if (toggle) {
      const trigger = toggle.querySelector('.fb-theme-toggle__trigger');
      const triggerIcon = toggle.querySelector('[data-theme-icon]');
      const menu = toggle.querySelector('.fb-theme-toggle__menu');
      // NOTE: we use `data-theme-option` (not `data-theme`) on the menu
      // buttons so the global `[data-theme="dark"]` / `[data-theme="light"]`
      // CSS attribute selectors — which switch design tokens on <html> — don't
      // accidentally re-theme the row that bears that label.
      const menuButtons = menu ? menu.querySelectorAll('button[data-theme-option]') : [];

      // Which icon class to apply for each pref. 'sun' is the base
      // .fb-theme-toggle__icon; 'half' and 'moon' are explicit modifiers.
      const ICON_FOR_PREF = {
        system: 'fb-theme-toggle__icon--half',
        light:  'fb-theme-toggle__icon',
        dark:   'fb-theme-toggle__icon--moon'
      };
      const LABEL_FOR_PREF = {
        system: 'System',
        light:  'Light',
        dark:   'Dark'
      };

      const sync = function () {
        const current = document.documentElement.getAttribute('data-theme-pref') || 'system';
        const label = LABEL_FOR_PREF[current] || 'System';
        // Update trigger icon
        if (triggerIcon) {
          // Remove all icon modifier classes, then add the right one
          triggerIcon.classList.remove('fb-theme-toggle__icon--half', 'fb-theme-toggle__icon--moon');
          const mod = ICON_FOR_PREF[current];
          // mod is the base 'fb-theme-toggle__icon' for light; for system/dark
          // it includes the modifier class.
          mod.split(' ').forEach(function (c) { triggerIcon.classList.add(c); });
        }
        // Update trigger aria-label and title
        if (trigger) {
          const al = 'Theme: ' + label + '. Click to change.';
          trigger.setAttribute('aria-label', al);
          trigger.setAttribute('title', 'Theme: ' + label);
        }
        // Update menu items aria-checked
        menuButtons.forEach(function (b) {
          b.setAttribute('aria-checked', String(b.dataset.themeOption === current));
        });
      };
      sync();

      // Open/close helpers
      const openMenu = function () {
        if (!menu || !trigger) return;
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        toggle.classList.add('fb-theme-toggle--open');
      };
      const closeMenu = function () {
        if (!menu || !trigger) return;
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('fb-theme-toggle--open');
      };
      const isOpen = function () {
        return !!(menu && !menu.hidden);
      };

      // Trigger click → toggle menu
      if (trigger) {
        trigger.addEventListener('click', function (e) {
          e.stopPropagation();
          if (isOpen()) closeMenu(); else openMenu();
        });
      }

      // Menu item click → apply theme, sync, close, return focus to trigger
      menuButtons.forEach(function (b) {
        b.addEventListener('click', function () {
          const next = b.dataset.themeOption;
          try { localStorage.setItem('findback.theme', next); } catch (e) {}
          applyTheme(next);
          sync();
          closeMenu();
          if (trigger) trigger.focus();
        });
      });

      // Click outside → close
      document.addEventListener('click', function (e) {
        if (!isOpen()) return;
        if (!toggle.contains(e.target)) closeMenu();
      });

      // Escape → close + return focus
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen()) {
          closeMenu();
          if (trigger) trigger.focus();
        }
      });

      // Keyboard nav inside the menu: ArrowDown/ArrowUp move between items,
      // Home/End jump to first/last.
      if (menu) {
        menu.addEventListener('keydown', function (e) {
          const items = Array.prototype.slice.call(menuButtons);
          if (!items.length) return;
          const i = items.indexOf(document.activeElement);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            items[(i + 1) % items.length].focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            items[(i - 1 + items.length) % items.length].focus();
          } else if (e.key === 'Home') {
            e.preventDefault();
            items[0].focus();
          } else if (e.key === 'End') {
            e.preventDefault();
            items[items.length - 1].focus();
          }
        });
      }

      // OS-change listener should also re-sync the trigger icon (the underlying
      // theme flips but the pref stays 'system').
      if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          const current = (function () {
            try { return localStorage.getItem('findback.theme') || 'system'; }
            catch (e) { return 'system'; }
          })();
          if (current === 'system') applyTheme('system'); // re-resolves & re-syncs
        });
      }
    }

    // ---------- Form submission stub (mockup-only) ----------
    // Forms with [data-mock-form] intercept submit, simulate the post-action
    // route, and optionally show a toast. They do NOT persist anything.
    document.querySelectorAll('form[data-mock-form]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const next = form.getAttribute('data-next') || form.action || '';
        const toastMsg = form.getAttribute('data-toast');
        if (toastMsg) showToast(toastMsg, 'success');
        if (next) {
          // Tiny delay to let any toast render.
          setTimeout(function () { window.location.href = next; }, 200);
        }
      });
    });

    // ---------- Mock-confirm (anchor with data-mock-confirm) ----------
    document.querySelectorAll('a[data-mock-confirm], button[data-mock-confirm]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        const msg = el.getAttribute('data-mock-confirm');
        if (window.confirm(msg)) {
          const href = el.getAttribute('href') || el.getAttribute('data-next');
          if (href) window.location.href = href;
        }
      });
    });

    // ---------- Initial paint timestamp ----------
    document.querySelectorAll('[data-now]').forEach(function (el) {
      el.textContent = formatDate(new Date(), el.dataset.now);
    });
  });

  // ---------- Toast helper (auto-dismiss 4s) ----------
  function showToast(msg, variant) {
    variant = variant || 'info';
    let container = document.querySelector('.fb-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'fb-toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'fb-toast fb-toast--' + variant;
    toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.transition = 'opacity 200ms ease';
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 220);
    }, 4000);
  }
  window.showToast = showToast;

  // ---------- Date formatter ----------
  function formatDate(d, mode) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = months[d.getMonth()];
    const day = d.getDate();
    const yr = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (mode === 'time') return hh + ':' + mm;
    if (mode === 'datetime') return m + ' ' + day + ', ' + yr + ' · ' + hh + ':' + mm;
    return m + ' ' + day + ', ' + yr;
  }
  window.fbFormatDate = formatDate;
})();