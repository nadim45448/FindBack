// End-to-end browser test for the login flow.
// Loads the actual public/02-login.html in jsdom, executes the actual
// state.js + app.js scripts, fills the form, submits, and asserts the
// resulting DOM. Catches problems that static analysis misses:
// JS errors at runtime, events that don't fire, etc.

const { JSDOM } = require('/tmp/jsdom-tmp/node_modules/jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join('/home/bs01657/BS-23/Learning/AI-DLC/FindBack/_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29');
const MOCKUPS = path.join(ROOT, 'mockups');
const LOGIN_URL = 'file://' + path.join(MOCKUPS, 'public/02-login.html');

async function loadPage() {
  const html = fs.readFileSync(path.join(MOCKUPS, 'public/02-login.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: LOGIN_URL,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  // Patch console to surface warnings/errors
  w.console.warn = (...args) => global.console.log('[browser warn]', ...args);
  w.console.error = (...args) => global.console.log('[browser error]', ...args);
  const stateSrc = fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8');
  const appSrc = fs.readFileSync(path.join(MOCKUPS, 'assets/app.js'), 'utf8');
  w.eval(stateSrc);
  w.eval(appSrc);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 50));
  return { dom, window: w };
}

let passed = 0, failed = 0;
function check(label, ok, extra) {
  if (ok) { passed++; console.log('  PASS  ' + label); }
  else    { failed++; console.log('  FAIL  ' + label + (extra ? ' — ' + extra : '')); }
}

(async () => {
  console.log('\n[End-to-end login flow]\n');

  const jsErrors = [];
  function trapErrors(w, label) {
    w.addEventListener('error', (e) => jsErrors.push(label + ': ' + (e.error?.stack || e.message)));
    w.onerror = (msg, src, l, c, err) => jsErrors.push(label + ': ' + (err?.stack || msg));
  }

  // ----- Debug: what does handleLoginForm actually see? -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 'dbg');
    const form = w.document.querySelector('[data-login-form]');
    console.log('--- DEBUG ---');
    console.log('form:', !!form);
    console.log('form.querySelector data-login-error:', !!form.querySelector('[data-login-error]'));
    console.log('document.querySelector data-login-error:', !!w.document.querySelector('[data-login-error]'));
    console.log('all [data-login-error] in doc:',
      w.document.querySelectorAll('[data-login-error]').length);
    console.log('window.FB.state.login:', typeof w.FB?.state?.login);
    const r = w.FB.state.login('wrong@example.com', 'badtries1');
    console.log('state.login result:', JSON.stringify(r));
    // Try calling handler directly
    console.log('---');
  }

  // ----- Scenario 1: invalid credentials, click Sign in -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 's1');
    const errEl = w.document.querySelector('[data-login-error]');
    const email = w.document.querySelector('[name="email"]');
    const pw    = w.document.querySelector('[name="password"]');
    const form  = w.document.querySelector('[data-login-form]');

    check("[1] initial: errEl exists", !!errEl);
    check("[1] initial: errEl hidden", errEl && errEl.hidden === true);
    check("[1] initial: errEl textContent empty", errEl && errEl.textContent === '');

    email.value = 'wrong@example.com';
    pw.value = 'badtries1';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));

    check("[1] after invalid submit: errEl.hidden === false",
          errEl.hidden === false,
          'hidden=' + errEl.hidden + ' text=' + JSON.stringify(errEl.textContent));
    check("[1] after invalid submit: errEl has the user-requested copy",
          /We couldn't sign you in\. Check your email and password and try again\./.test(errEl.textContent),
          'text was: ' + JSON.stringify(errEl.textContent));
    check("[1] after invalid submit: errEl has role=alert",
          errEl.getAttribute('role') === 'alert');
    check("[1] after invalid submit: errEl has aria-live=assertive",
          errEl.getAttribute('aria-live') === 'assertive');
  }

  // ----- Scenario 2: valid email + wrong password -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 's2');
    const errEl = w.document.querySelector('[data-login-error]');
    const email = w.document.querySelector('[name="email"]');
    const pw    = w.document.querySelector('[name="password"]');
    const form  = w.document.querySelector('[data-login-form]');
    email.value = 'maya.chen@example.org';
    pw.value = 'wrong';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    check("[2] valid email + wrong password → errEl shown",
          errEl.hidden === false && errEl.textContent.length > 0);
    check("[2] message does not leak which field was wrong",
          !/email is (wrong|invalid|correct|right)/i.test(errEl.textContent) &&
          !/password is (wrong|invalid|correct|right)/i.test(errEl.textContent));
  }

  // ----- Scenario 3: invalid email + valid-looking password -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 's3');
    const errEl = w.document.querySelector('[data-login-error]');
    const email = w.document.querySelector('[name="email"]');
    const pw    = w.document.querySelector('[name="password"]');
    const form  = w.document.querySelector('[data-login-form]');
    email.value = 'nobody@example.org';
    pw.value = 'demo1234';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    check("[3] invalid email + valid-looking password → errEl shown",
          errEl.hidden === false && errEl.textContent.length > 0);
  }

  // ----- Scenario 4: keystrokes after error must NOT clear it -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 's4');
    const errEl = w.document.querySelector('[data-login-error]');
    const email = w.document.querySelector('[name="email"]');
    const pw    = w.document.querySelector('[name="password"]');
    const form  = w.document.querySelector('[data-login-form]');
    email.value = 'wrong@example.com';
    pw.value = 'badtries1';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    check("[4] after failed submit: error visible", errEl.hidden === false);

    email.value = 'wrong2@example.com';
    email.dispatchEvent(new w.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    check("[4] after typing in email: error still visible (no premature clear)",
          errEl.hidden === false && errEl.textContent.length > 0,
          'hidden=' + errEl.hidden + ' text=' + JSON.stringify(errEl.textContent));
  }

  // ----- Scenario 5: re-submit after failure -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 's5');
    const errEl = w.document.querySelector('[data-login-error]');
    const email = w.document.querySelector('[name="email"]');
    const pw    = w.document.querySelector('[name="password"]');
    const form  = w.document.querySelector('[data-login-form]');
    email.value = 'wrong@example.com';
    pw.value = 'bad1';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    const firstText = errEl.textContent;
    check("[5] first failed submit: error shown", errEl.hidden === false && firstText.length > 0);

    email.value = 'maya.chen@example.org';
    pw.value = 'demo1234';
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    // Maya is a valid member → handler should navigate. errEl was cleared
    // at start of submit; on success the page navigates away.
    check("[5] second submit: errEl cleared at start of submit",
          errEl.hidden === true || errEl.textContent === '',
          'text=' + JSON.stringify(errEl.textContent) + ' hidden=' + errEl.hidden);
  }

  // ----- Scenario 6: Enter key submission -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 's6');
    const errEl = w.document.querySelector('[data-login-error]');
    const email = w.document.querySelector('[name="email"]');
    const pw    = w.document.querySelector('[name="password"]');
    const form  = w.document.querySelector('[data-login-form]');
    email.value = 'wrong@example.com';
    pw.value = 'badtries1';
    pw.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    check("[6] Enter path: errEl visible after invalid submit",
          errEl.hidden === false && errEl.textContent.length > 0,
          'hidden=' + errEl.hidden + ' text=' + JSON.stringify(errEl.textContent));
  }

  // ----- Scenario 7: empty fields → field-level validation -----
  {
    const { window: w } = await loadPage();
    trapErrors(w, 's7');
    const errEl = w.document.querySelector('[data-login-error]');
    const form  = w.document.querySelector('[data-login-form]');
    form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 50));
    check("[7] empty submit: login-failure alert stays hidden",
          errEl.hidden === true);
    const emailAria = w.document.querySelector('[name="email"]').getAttribute('aria-invalid');
    check("[7] empty submit: email input marked aria-invalid", emailAria === 'true');
  }

  console.log('\nSummary: ' + passed + ' passed, ' + failed + ' failed');
  if (jsErrors.length) {
    console.log('\nJS errors observed:');
    jsErrors.forEach((e) => console.log('  - ' + e));
  } else {
    console.log('JS errors: 0');
  }
  process.exit(failed === 0 ? 0 : 1);
})();
