// ============================================================================
// FindBack Prototype — App glue.
// Inlines before first paint: theme bootstrap.
// On DOMContentLoaded:
//   - mounts the theme toggle widget
//   - wires authentication-aware navigation (topbar account menu, redirects)
//   - mounts shared prototype controls (Reset Demo Data, persona switcher)
//   - intercepts forms with [data-mock-form] / data-action="..." and applies
//     state-mutating actions instead of hard-coded page redirects
// ============================================================================
(function () {
  'use strict';

  // ---------- Theme bootstrap (must run before first paint) ----------
  function getInitialTheme() {
    try {
      const stored = localStorage.getItem('findback.theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    } catch (e) {}
    return 'system';
  }
  function resolveTheme(pref) {
    if (pref === 'light' || pref === 'dark') return pref;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(pref) {
    const actual = resolveTheme(pref);
    document.documentElement.setAttribute('data-theme', actual);
    document.documentElement.setAttribute('data-theme-pref', pref);
  }
  const pref = getInitialTheme();
  applyTheme(pref);
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      const current = (function () {
        try { return localStorage.getItem('findback.theme') || 'system'; } catch (e) { return 'system'; }
      })();
      if (current === 'system') applyTheme('system');
    });
  }

  // ---------- Toast helper ----------
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
  window.FB = window.FB || {};
  window.FB.toast = showToast;

  // ---------- Date formatters ----------
  function formatDate(iso, mode) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = months[d.getMonth()], day = d.getDate(), yr = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (mode === 'time') return hh + ':' + mm;
    if (mode === 'datetime') return m + ' ' + day + ', ' + yr + ' · ' + hh + ':' + mm;
    if (mode === 'relative') return relativeTime(d);
    return m + ' ' + day + ', ' + yr;
  }
  function relativeTime(d) {
    const diff = Date.now() - d.getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' hr ago';
    const days = Math.round(h / 24);
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    return formatDate(d.toISOString());
  }
  window.fbFormatDate = formatDate;
  window.fbRelativeTime = relativeTime;

  // ---------- Topbar nav: rewrite brand/logo href based on session ----------
  function decorateTopbar() {
    const user = window.FB.state.getCurrentUser();
    const topbar = document.querySelector('.fb-topbar');
    if (!topbar) return;
    const brand = topbar.querySelector('.fb-topbar__brand');
    if (brand) {
      // Honour an explicit data-home override first.
      const explicitHome = brand.getAttribute('data-home');
      const here = window.location.pathname;
      const isAdminArea = topbar.classList.contains('fb-topbar--admin');
      const isMemberArea = here.indexOf('/member/') !== -1;
      const isPublicArea = here.indexOf('/public/') !== -1;
      const isIndexArea = !isAdminArea && !isMemberArea && !isPublicArea;

      if (explicitHome) {
        brand.setAttribute('href', explicitHome);
      } else if (isAdminArea) {
        // Admin topbar: brand goes to admin dashboard.
        brand.setAttribute('href', '01-dashboard.html');
      } else if (isMemberArea) {
        // Member-area pages: brand goes to member dashboard when signed in, else landing.
        if (user && user.role === 'member') brand.setAttribute('href', '07-dashboard.html');
        else if (user && user.role === 'administrator') brand.setAttribute('href', '../admin/01-dashboard.html');
        else brand.setAttribute('href', '../public/01-landing.html');
      } else if (isPublicArea) {
        // Public pages: brand goes to landing (sibling).
        brand.setAttribute('href', '01-landing.html');
      } else if (isIndexArea) {
        // Prototype guide (mockups/index.html): brand takes reviewers to the
        // actual public FindBack landing — not back to the guide itself.
        brand.setAttribute('href', 'public/01-landing.html');
      }
    }
  }

  // ---------- Mount: production-like Account menu on topbar ----------
  // This menu exposes ONLY actions supported by the locked PRD/EXPERIENCE.
  // Prototype-only utilities (Switch persona, Reset demo data) live in a
  // separate "Prototype controls" panel mounted via mountPrototypePanel().
  function mountAccountMenu() {
    const slot = document.querySelector('[data-account-menu-slot]');
    if (!slot) return;
    const user = window.FB.state.getCurrentUser();
    slot.innerHTML = '';
    if (!user) return;

    const wrap = document.createElement('div');
    wrap.className = 'fb-account-menu';
    wrap.innerHTML = `
      <button type="button" class="fb-account-menu__trigger" aria-haspopup="menu" aria-expanded="false"
              aria-label="Account menu for ${user.name}">
        <span class="fb-account-menu__avatar" aria-hidden="true">${initials(user.name)}</span>
        <span class="fb-account-menu__name">${user.name.split(' ')[0]}</span>
        <span class="fb-account-menu__caret" aria-hidden="true"></span>
      </button>
      <div class="fb-account-menu__menu" role="menu" hidden>
        <div class="fb-account-menu__header">
          <strong>${user.name}</strong>
          <span class="fb-helper">${user.email}</span>
          <span class="fb-helper">${user.role === 'administrator' ? 'Administrator' : 'Member'}</span>
        </div>
        <button type="button" role="menuitem" data-action="logout">Sign out</button>
      </div>
    `;
    slot.appendChild(wrap);

    const trigger = wrap.querySelector('.fb-account-menu__trigger');
    const menu = wrap.querySelector('.fb-account-menu__menu');
    const open = () => { menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); };
    const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const isOpen = () => !menu.hidden;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen()) close(); else open();
    });
    document.addEventListener('click', (e) => { if (isOpen() && !wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { close(); trigger.focus(); } });

    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'logout') {
        window.FB.state.logout();
        showToast('Signed out.');
        window.location.href = publicLandingHref();
      }
    });
  }

  // ---------- Mount: Prototype-only Controls panel ----------
  // Distinct visual treatment ("Prototype controls — not part of production
  // FindBack") so reviewers cannot confuse demo utilities with product UX.
  // Mounted on every page that includes data-prototype-controls-slot; the
  // Prototype Guide (index.html) and reviewer-toolbar pages opt in by adding
  // that attribute to the body or any container.
  function mountPrototypePanel() {
    const slot = document.querySelector('[data-prototype-controls-slot]');
    if (!slot) return;
    const user = window.FB.state.getCurrentUser();
    const persona = user
      ? `${user.name} · ${user.role === 'administrator' ? 'Administrator' : 'Member'}`
      : 'Anonymous';
    slot.innerHTML = `
      <aside class="fb-prototype-panel" aria-label="Prototype controls — not part of production FindBack" data-prototype-panel>
        <div class="fb-prototype-panel__badge">Prototype controls — not part of production FindBack</div>
        <div class="fb-prototype-panel__current">
          <span class="fb-caption">Current persona</span>
          <strong>${persona}</strong>
        </div>
        <div class="fb-prototype-panel__actions">
          <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" data-action="reset-state">Reset demo data</button>
        </div>
        <details class="fb-prototype-panel__creds">
          <summary>Demo credentials (prototype-only)</summary>
          <ul class="fb-prototype-panel__list">
            <li><code>maya.chen@example.org</code> · Maya · Active Member · <code>demo1234</code></li>
            <li><code>sam.patel@example.org</code> · Sam · Active Member · <code>demo1234</code></li>
            <li><code>alex.rivera@example.org</code> · Alex · Pending · <code>demo1234</code></li>
            <li><code>riley.park@example.org</code> · Riley · Administrator · <code>demo1234</code></li>
            <li><code>jordan.lee@example.org</code> · Jordan · Rejected · <code>demo1234</code></li>
            <li><code>priya.kapoor@example.org</code> · Priya · Deactivated · <code>demo1234</code></li>
          </ul>
        </details>
      </aside>
    `;
    slot.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'reset-state') {
        if (window.confirm('Reset demo data? This restores the original seeded state for all personas.')) {
          window.FB.state.reset();
          window.FB.state.logout();
          showToast('Demo data restored.');
          // Always return to the Prototype Guide (mockups/index.html).
          window.location.href = prototypeGuideHref();
        }
      }
    });
  }

  function initials(name) {
    return String(name).split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  }

  // ---------- Login-time routing ----------
  function routeAfterLogin(user) {
    if (user.role === 'administrator') {
      window.location.href = resolvePath('../admin/01-dashboard.html');
      return;
    }
    if (user.accountState === 'pending') {
      window.location.href = resolvePath('../public/06-pending-account.html');
      return;
    }
    if (user.accountState === 'rejected' || user.accountState === 'deactivated') {
      window.location.href = resolvePath('../public/02-login.html?blocked=' + user.accountState);
      return;
    }
    window.location.href = resolvePath('../member/07-dashboard.html');
  }

  // Resolve a relative path from the current page to a target.
  function resolvePath(target) {
    // If the path is already absolute (starts with http) or root-relative, return as-is.
    if (/^https?:|^\/|^\.{0,2}\//.test(target)) {
      // Already a URL/path — but we may need to fix relative paths.
      // Compute the relative location from this page to `target` by normalizing.
      return computeRelative(target);
    }
    return computeRelative(target);
  }
  function computeRelative(target) {
    // Detect current page location category by URL.
    const here = window.location.pathname;
    if (here.indexOf('/admin/') !== -1) {
      // In admin/, '../X' for member/public; 'X' for sibling admin.
      if (/^member\//.test(target) || /^public\//.test(target)) return '../' + target;
      return target;
    }
    if (here.indexOf('/member/') !== -1) {
      if (/^admin\//.test(target)) return '../' + target;
      if (/^public\//.test(target)) return '../' + target;
      return target;
    }
    if (here.indexOf('/public/') !== -1) {
      if (/^member\//.test(target)) return '../' + target;
      if (/^admin\//.test(target)) return '../' + target;
      return target;
    }
    // Index page (mockups/index.html). Siblings are member/, admin/, public/.
    if (/^(member|admin|public)\//.test(target)) return target;
    return target;
  }

  // Resolve the path back to the Prototype Guide (mockups/index.html)
  // from any page in the prototype.
  function prototypeGuideHref() {
    const here = window.location.pathname;
    if (here.indexOf('/admin/') !== -1) return '../index.html';
    if (here.indexOf('/member/') !== -1) return '../index.html';
    if (here.indexOf('/public/') !== -1) return '../index.html';
    return 'index.html';
  }
  // Resolve the path to the public landing page from any page.
  function publicLandingHref() {
    const here = window.location.pathname;
    if (here.indexOf('/admin/') !== -1) return '../public/01-landing.html';
    if (here.indexOf('/member/') !== -1) return '../public/01-landing.html';
    return 'public/01-landing.html';
  }

  // ---------- Form interception: state-mutating actions ----------
  function interceptForms() {
    document.querySelectorAll('form[data-mock-form]').forEach((form) => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const action = form.getAttribute('data-action');
        if (action && window.FB.actions[action]) {
          window.FB.actions[action](form, e);
          return;
        }
        // Fallback: simple toast + redirect.
        const next = form.getAttribute('data-next');
        const toast = form.getAttribute('data-toast');
        if (toast) showToast(toast, 'success');
        if (next) setTimeout(() => { window.location.href = next; }, 200);
      });
    });
  }

  // ---------- Validation helper (Pass-3) ----------
  // Spec: errors appear ONLY after submit attempt; clear on valid correction;
  // aria-invalid + aria-describedby wired; live-region alert for summary;
  // focus moves to first invalid field on submit failure.
  //
  // Usage:
  //   const v = attachFormValidation(form, {
  //     summaryEl: errEl,
  //     fields: [
  //       { input: nameInput, validate: (val) => val.length > 0 || 'Item name is required.' }
  //     ],
  //     onSubmit: (data) => { /* success */ }
  //   });
  function attachFormValidation(form, opts) {
    const summaryEl = opts.summaryEl || form.querySelector('[data-form-error]');
    const fields = opts.fields || [];
    const onSubmit = opts.onSubmit || function () {};
    const focusOnFail = opts.focusOnFail !== false;
    let liveMode = false; // becomes true after the first submit attempt

    function setFieldError(input, msg) {
      if (!input) return;
      const field = input.closest('.fb-field') || input.parentElement;
      // Remove any existing inline error text below the field.
      const existing = field && field.querySelector('.fb-field__error[data-inline-for="' + input.id + '"]');
      if (!msg) {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
        input.classList.remove('fb-input--error', 'fb-select--error', 'fb-textarea--error');
        if (existing) existing.remove();
        return;
      }
      input.setAttribute('aria-invalid', 'true');
      let errId = input.getAttribute('aria-describedby');
      if (!errId) {
        errId = (input.id || input.name || 'field') + '-error';
        input.setAttribute('aria-describedby', errId);
      }
      input.classList.add(input.tagName === 'SELECT' ? 'fb-select--error' : (input.tagName === 'TEXTAREA' ? 'fb-textarea--error' : 'fb-input--error'));
      // Insert/replace the inline error message bound by id.
      let msgEl = document.getElementById(errId);
      if (!msgEl) {
        msgEl = document.createElement('p');
        msgEl.className = 'fb-field__error';
        msgEl.id = errId;
        msgEl.setAttribute('data-inline-for', input.id);
        // Insert after the input (or after the counter if present).
        const anchor = field && (field.querySelector('.fb-field__counter') || input);
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(msgEl, anchor.nextSibling);
        else if (input.parentNode) input.parentNode.insertBefore(msgEl, input.nextSibling);
      }
      msgEl.textContent = msg;
    }

    function renderSummary(messages) {
      if (!summaryEl) return;
      if (!messages.length) { summaryEl.hidden = true; summaryEl.innerHTML = ''; return; }
      summaryEl.innerHTML = '<strong>Please correct the following:</strong><ul style="margin: var(--fb-space-1) 0 0; padding-left: var(--fb-space-5);">' +
        messages.map((m) => '<li>' + escapeHtml(m.fieldLabel ? m.fieldLabel + ': ' + m.message : m.message) + '</li>').join('') + '</ul>';
      summaryEl.hidden = false;
    }

    function validateAll() {
      const errors = [];
      let firstInvalid = null;
      fields.forEach((f) => {
        const val = (f.input.value || '').trim();
        const result = f.validate(val, f.input);
        if (result === true || result === undefined || result === null) {
          setFieldError(f.input, null);
        } else {
          const msg = typeof result === 'string' ? result : (result && result.message) || 'Invalid value.';
          setFieldError(f.input, msg);
          errors.push({ fieldLabel: f.label || f.input.name || '', message: msg });
          if (!firstInvalid) firstInvalid = f.input;
        }
      });
      renderSummary(errors);
      return { ok: errors.length === 0, firstInvalid: firstInvalid, errors: errors };
    }

    function clearIfValid() {
      if (!liveMode) return;
      const remaining = [];
      fields.forEach((f) => {
        const val = (f.input.value || '').trim();
        const result = f.validate(val, f.input);
        if (result === true || result === undefined || result === null) {
          setFieldError(f.input, null);
        } else {
          remaining.push({ fieldLabel: f.label || f.input.name || '', message: typeof result === 'string' ? result : (result && result.message) });
        }
      });
      renderSummary(remaining);
    }

    fields.forEach((f) => {
      const evt = (f.input.tagName === 'SELECT' || f.input.type === 'date' || f.input.type === 'file') ? 'change' : 'input';
      f.input.addEventListener(evt, clearIfValid);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      liveMode = true;
      const result = validateAll();
      if (!result.ok) {
        if (focusOnFail && result.firstInvalid) {
          try { result.firstInvalid.focus(); } catch (err) {}
        }
        return;
      }
      const data = {};
      fields.forEach((f) => { data[f.input.name || f.input.id] = (f.input.value || '').trim(); });
      onSubmit(data, form);
    });

    return { revalidate: clearIfValid, validateAll: validateAll };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }

  // ---------- Prototype-only Reset Banner ----------
  // Removed: the global "You're in a high-fidelity prototype..." banner was
  // unnecessary noise on every page. Prototype-only utilities remain
  // available via the in-account Prototype Controls panel on pages that
  // opt in via [data-prototype-controls-slot] (see mountPrototypePanel).
  function mountPrototypeBanner() { /* disabled */ }
  // ---------- DOMContentLoaded ----------
  document.addEventListener('DOMContentLoaded', function () {

    // 1. Theme toggle widget.
    mountThemeToggle();

    // 2. Decorate topbar brand.
    decorateTopbar();

    // 3. Mount account menu if slot exists.
    mountAccountMenu();

    // 3b. Mount prototype-only controls panel if slot exists.
    mountPrototypePanel();

    // 4. Mount prototype banner on all pages.
    mountPrototypeBanner();

    // 5. Form interception.
    interceptForms();

    // 6. Login form (special — does role-aware redirect).
    const loginForm = document.querySelector('[data-login-form]');
    if (loginForm) handleLoginForm(loginForm);

    // 7. Register form (special).
    const regForm = document.querySelector('[data-register-form]');
    if (regForm) handleRegisterForm(regForm);

    // 8. Run state-driven renders.
    if (window.FB && window.FB.pages) {
      document.querySelectorAll('[data-page]').forEach((root) => {
        const name = root.getAttribute('data-page');
        const fn = window.FB.pages[name];
        if (fn) fn(root);
      });
    }

    // 9. Set data-now placeholders.
    document.querySelectorAll('[data-now]').forEach((el) => {
      el.textContent = formatDate(new Date(), el.dataset.now);
    });
  });

  // Expose for inline callers.
  window.FB = window.FB || {};
  window.FB.routeAfterLogin = routeAfterLogin;
  window.FB.attachFormValidation = attachFormValidation;
  window.FB.escapeHtml = escapeHtml;
  window.FB.prototypeGuideHref = prototypeGuideHref;
  window.FB.publicLandingHref = publicLandingHref;

  // ---------- Theme toggle ----------
  function mountThemeToggle() {
    const toggle = document.querySelector('[data-theme-toggle]');
    if (!toggle) return;
    const trigger = toggle.querySelector('.fb-theme-toggle__trigger');
    const triggerIcon = toggle.querySelector('[data-theme-icon]');
    const menu = toggle.querySelector('.fb-theme-toggle__menu');
    const menuButtons = menu ? menu.querySelectorAll('button[data-theme-option]') : [];
    const ICON_FOR_PREF = {
      system: 'fb-theme-toggle__icon--half',
      light:  'fb-theme-toggle__icon',
      dark:   'fb-theme-toggle__icon--moon'
    };
    const LABEL_FOR_PREF = { system: 'System', light: 'Light', dark: 'Dark' };
    const sync = function () {
      const current = document.documentElement.getAttribute('data-theme-pref') || 'system';
      const label = LABEL_FOR_PREF[current] || 'System';
      if (triggerIcon) {
        triggerIcon.classList.remove('fb-theme-toggle__icon--half', 'fb-theme-toggle__icon--moon');
        const mod = ICON_FOR_PREF[current];
        mod.split(' ').forEach((c) => triggerIcon.classList.add(c));
      }
      if (trigger) {
        trigger.setAttribute('aria-label', 'Theme: ' + label + '. Click to change.');
        trigger.setAttribute('title', 'Theme: ' + label);
      }
      menuButtons.forEach((b) => {
        b.setAttribute('aria-checked', String(b.dataset.themeOption === current));
      });
    };
    sync();
    const openMenu = () => { if (!menu || !trigger) return; menu.hidden = false; trigger.setAttribute('aria-expanded', 'true'); };
    const closeMenu = () => { if (!menu || !trigger) return; menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
    const isOpen = () => !!(menu && !menu.hidden);
    if (trigger) trigger.addEventListener('click', (e) => { e.stopPropagation(); if (isOpen()) closeMenu(); else openMenu(); });
    menuButtons.forEach((b) => {
      b.addEventListener('click', () => {
        const next = b.dataset.themeOption;
        try { localStorage.setItem('findback.theme', next); } catch (e) {}
        applyTheme(next); sync(); closeMenu(); trigger.focus();
      });
    });
    document.addEventListener('click', (e) => { if (isOpen() && !toggle.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { closeMenu(); trigger.focus(); } });
    if (menu) {
      menu.addEventListener('keydown', (e) => {
        const items = Array.prototype.slice.call(menuButtons);
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
        else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      });
    }
  }

  // ---------- Login form ----------
  function handleLoginForm(form) {
    const errEl = form.querySelector('[data-login-error]');
    // Give the alert element a stable id so screen readers can associate it
    // with the inputs via aria-describedby. Inputs reference this id; when
    // hidden, the inputs effectively lose the description (intended).
    if (errEl && !errEl.id) errEl.id = 'login-error-summary';

    function showLoginError(msg) {
      if (!errEl) return;
      errEl.textContent = msg;
      errEl.hidden = false;
    }
    function clearLoginError() {
      if (!errEl) return;
      if (!errEl.hidden) { errEl.hidden = true; errEl.textContent = ''; }
    }

    // Per-field validation only (no top-of-form summary — that element is
    // reserved for login-failure messages, populated after a failed submit).
    // attachFormValidation falls back to form.querySelector('[data-form-error]')
    // when summaryEl is omitted; the login form has no such element so
    // renderSummary() is a no-op for the top-of-form region.
    attachFormValidation(form, {
      fields: [
        { input: form.querySelector('[name="email"]'),    label: 'Email',    validate: function (v) { return v.length > 0 || 'Email is required.'; } },
        { input: form.querySelector('[name="password"]'), label: 'Password', validate: function (v) { return v.length > 0 || 'Password is required.'; } }
      ],
      onSubmit: function () {
        // Any prior failed-login message is cleared at the start of every
        // submit attempt. A successful submit will redirect away; a failed
        // submit will re-populate below.
        clearLoginError();
        const email = form.querySelector('[name="email"]').value.trim();
        const password = form.querySelector('[name="password"]').value;
        const result = window.FB.state.login(email, password);
        if (result.ok) {
          showToast('Signed in as ' + result.user.name + '.', 'success');
          setTimeout(() => routeAfterLogin(result.user), 200);
          return;
        }
        if (result.reason === 'pending') {
          window.location.href = resolvePath('../public/06-pending-account.html');
          return;
        }
        if (result.reason === 'rejected' || result.reason === 'deactivated') {
          window.location.href = resolvePath('../public/02-login.html?blocked=' + result.reason);
          return;
        }
        // Generic invalid-credentials message. Does not reveal whether the
        // email or the password specifically was wrong.
        showLoginError("We couldn't sign you in. Check your email and password and try again.");
        // Move focus to the email field so screen readers announce the alert
        // and the user can immediately correct their input.
        var emailField = form.querySelector('[name="email"]');
        if (emailField) {
          try { emailField.focus(); } catch (e) {}
        }
      }
    });
  }

  // ---------- Register form ----------
  function handleRegisterForm(form) {
    const errEl = form.querySelector('[data-register-error]');
    attachFormValidation(form, {
      summaryEl: errEl,
      fields: [
        { input: form.querySelector('[name="name"]'),     label: 'Name',     validate: function (v) { return v.length > 0 || 'Name is required.'; } },
        { input: form.querySelector('[name="email"]'),    label: 'Email',    validate: function (v) { return v.length > 0 || 'Email is required.'; } },
        { input: form.querySelector('[name="password"]'), label: 'Password', validate: function (v) {
            if (!v) return 'Password is required.';
            if (v.length < 8) return 'Password must be at least 8 characters.';
            if (!/[A-Za-z]/.test(v)) return 'Password must contain at least one letter.';
            if (!/\d/.test(v)) return 'Password must contain at least one number.';
            return true;
          }
        },
        { input: form.querySelector('[name="confirm"]'),  label: 'Confirm password', validate: function (v) {
            const pw = form.querySelector('[name="password"]').value;
            if (!v) return 'Please confirm your password.';
            if (v !== pw) return 'Passwords do not match.';
            return true;
          }
        },
        { input: form.querySelector('[name="selfRole"]'), label: 'Role',     validate: function (v) { return v.length > 0 || 'Please select your role.'; } }
      ],
      onSubmit: function () {
        const data = {
          name: form.querySelector('[name="name"]').value.trim(),
          email: form.querySelector('[name="email"]').value.trim(),
          password: form.querySelector('[name="password"]').value,
          selfRole: form.querySelector('[name="selfRole"]').value
        };
        const result = window.FB.state.registerAccount(data);
        if (!result.ok && result.reason === 'duplicate') {
          if (errEl) { errEl.textContent = 'An account with that email already exists.'; errEl.hidden = false; }
          return;
        }
        const next = form.getAttribute('data-next') || '05-register-confirmation.html';
        window.location.href = next;
      }
    });
  }
})();
