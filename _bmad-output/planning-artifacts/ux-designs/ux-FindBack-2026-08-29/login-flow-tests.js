// Focused smoke test for the FindBack login-failure feedback fix.
// Loads state.js (IIFE) under a Node mock of the browser globals, then
// exercises every scenario the user asked to verify. App-side wiring
// (handleLoginForm) is verified statically against the markup.
//
// Run: node login-flow-tests.js

const fs = require('fs');
const path = require('path');

const MOCKUPS = path.join(__dirname, 'mockups');

// ---------- Minimal browser shim ----------
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
global.window = global;
global.document = {
  documentElement: { setAttribute: () => {} },
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
};
global.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} });

// ---------- Load state.js ----------
const stateSrc = fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8');
new Function(stateSrc)(); // executes the IIFE; populates window.FB.state

if (!window.FB || !window.FB.state) {
  console.error('FAIL: window.FB.state not exposed by state.js');
  process.exit(1);
}

let passed = 0, failed = 0;
function check(label, ok, extra) {
  if (ok) { passed++; console.log('  PASS  ' + label); }
  else    { failed++; console.log('  FAIL  ' + label + (extra ? ' — ' + extra : '')); }
}

// ---------- Login-failure matrix ----------
console.log('\n[Login matrix]');

const wrongEmail      = 'wrong@example.com';
const validEmail      = 'maya.chen@example.org';
const validEmailAdmin = 'riley.park@example.org';
const rightPassword   = 'demo1234';
const wrongPassword   = 'badpass1';

// 1. Invalid email + wrong password → reject, generic reason
{
  const r = window.FB.state.login(wrongEmail, wrongPassword);
  check("Invalid email + wrong password → rejected",
        r.ok === false && r.reason === 'invalid_credentials');
}

// 2. Valid email + wrong password → reject, generic reason (does NOT leak 'email ok')
{
  const r = window.FB.state.login(validEmail, wrongPassword);
  check("Valid email + wrong password → rejected (no leak)",
        r.ok === false && r.reason === 'invalid_credentials');
}

// 3. Invalid email + valid-looking password → reject, generic reason
{
  const r = window.FB.state.login(wrongEmail, rightPassword);
  check("Invalid email + valid-looking password → rejected",
        r.ok === false && r.reason === 'invalid_credentials');
}

// 4. Valid Member login → success + member role
{
  const r = window.FB.state.login(validEmail, rightPassword);
  check("Valid Member login (Maya) → success + member",
        r.ok === true && r.user && r.user.role === 'member' && r.user.id === 'u_maya');
  // simulate logout so other tests don't inherit session
  window.FB.state.logout();
}

// 5. Valid Administrator login → success + administrator role
{
  const r = window.FB.state.login(validEmailAdmin, rightPassword);
  check("Valid Administrator login (Riley) → success + administrator",
        r.ok === true && r.user && r.user.role === 'administrator' && r.user.id === 'u_riley');
  window.FB.state.logout();
}

// 6. Pending login still surfaces 'pending' (preserved behavior)
{
  const r = window.FB.state.login('alex.rivera@example.org', rightPassword);
  check("Pending login → reason=pending (unchanged)",
        r.ok === false && r.reason === 'pending');
}

// 7. Rejected login still surfaces 'rejected' (preserved behavior)
{
  const r = window.FB.state.login('jordan.lee@example.org', rightPassword);
  check("Rejected login → reason=rejected (unchanged)",
        r.ok === false && r.reason === 'rejected');
}

// 8. Deactivated login still surfaces 'deactivated' (preserved behavior)
{
  const r = window.FB.state.login('priya.kapoor@example.org', rightPassword);
  check("Deactivated login → reason=deactivated (unchanged)",
        r.ok === false && r.reason === 'deactivated');
}

// ---------- Static check: markup wiring ----------
console.log('\n[Markup wiring]');
const loginHtml = fs.readFileSync(path.join(MOCKUPS, 'public/02-login.html'), 'utf8');

check("Login page has [data-login-error] element",
      /data-login-error/.test(loginHtml));
check("Login-error element starts hidden on first load",
      /data-login-error[^>]*\bhidden\b/.test(loginHtml) || /\bhidden\b[^>]*data-login-error/.test(loginHtml));
check("Login-error element has role=\"alert\" for screen readers",
      /data-login-error[^>]*role="alert"/.test(loginHtml));
check("Email input has aria-describedby linking to error summary",
      /id="email"[^>]*aria-describedby="login-error-summary"/.test(loginHtml));
check("Password input has aria-describedby linking to error summary",
      /id="password"[^>]*aria-describedby="login-error-summary"/.test(loginHtml));
check("Submit button is type=submit (Enter triggers it)",
      /<button[^>]*type="submit"[^>]*>\s*Sign in\s*<\/button>/.test(loginHtml));

// ---------- Static check: app.js handleLoginForm ----------
console.log('\n[app.js handleLoginForm wiring]');
const appSrc = fs.readFileSync(path.join(MOCKUPS, 'assets/app.js'), 'utf8');

// New copy must be present.
check("handleLoginForm shows the user-requested generic copy",
      /We couldn't sign you in\. Check your email and password and try again\./.test(appSrc));

// No more premature keystroke-clear of login error.
check("handleLoginForm no longer clears error on every keystroke",
      !/addEventListener\('input', clearLoginError\)/.test(appSrc));

// No more double-purpose summary (summaryEl on login form removed).
const handleBlock = appSrc.match(/function handleLoginForm[\s\S]*?\n  \}\n/);
check("handleLoginForm source captured", !!handleBlock);
if (handleBlock) {
  const block = handleBlock[0];
  check("handleLoginForm does not pass summaryEl (decouples validation from login-failure alert)",
        !/summaryEl\s*:/.test(block));
  check("handleLoginForm calls clearLoginError() at the start of onSubmit",
        /onSubmit:\s*function[\s\S]*?clearLoginError\(\)/.test(block));
  check("handleLoginForm sets errEl.textContent on invalid_credentials",
        /errEl\.textContent\s*=/.test(block));
  check("handleLoginForm unhides errEl after failed login",
        /errEl\.hidden\s*=\s*false/.test(block));
}

// ---------- Static check: tokens.css alert readability ----------
const tokensCss = fs.readFileSync(path.join(MOCKUPS, 'assets/tokens.css'), 'utf8');
check(".fb-form-error has a Light-theme rule (background, border, color)",
      /\.fb-form-error\s*\{[^}]*var\(--fb-error-soft\)/.test(tokensCss) &&
      /\.fb-form-error\s*\{[^}]*color:\s*var\(--fb-error-on-soft\)/.test(tokensCss));
check(".fb-form-error dark-theme override re-asserts color token",
      /\[data-theme="dark"\]\s*\.fb-form-error\s*\{[^}]*var\(--fb-error-on-soft\)/.test(tokensCss));

// ---------- Summary ----------
console.log('\nSummary: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
