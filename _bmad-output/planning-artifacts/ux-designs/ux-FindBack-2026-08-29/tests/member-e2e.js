// Focused e2e test for two Active Member bugs:
//   1. Recent Activity generic verb (should distinguish Lost vs Found)
//   2. My Reports detail navigation (should resolve to clicked item, not wallet)

const { JSDOM } = require('/tmp/jsdom-tmp/node_modules/jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join('/home/bs01657/BS-23/Learning/AI-DLC/FindBack/_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29');
const MOCKUPS = path.join(ROOT, 'mockups');

async function loadPage(p, url) {
  const html = fs.readFileSync(p, 'utf8');
  const dom = new JSDOM(html, {
    url: url || 'file://' + p,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
  w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/app.js'), 'utf8'));
  return { dom, window: w };
}

// Shared localStorage shim so multiple JSDOM windows see the same session.
// (jsdom gives every window its own localStorage by default, which breaks
// the multi-step test scenarios.)
const sharedStore = new Map();
const sharedLocalStorage = {
  getItem: (k) => (sharedStore.has(k) ? sharedStore.get(k) : null),
  setItem: (k, v) => sharedStore.set(k, String(v)),
  removeItem: (k) => sharedStore.delete(k),
  clear: () => sharedStore.clear(),
};

// Load page AND sign in before firing DOMContentLoaded so the inline script
// sees the session. localStorage is shared across pages via sharedStore.
async function loadPageSignedIn(p, email, password, deps = []) {
  let html = fs.readFileSync(p, 'utf8');
  // Strip <script>...</script> blocks from the body — we'll eval them manually
  // AFTER state.js + app.js are in place so window.FB.state exists.
  // Keep theme bootstrap (in <head>) because it must run before first paint.
  const inlineScripts = [];
  html = html.replace(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi, (m, body) => {
    inlineScripts.push(body);
    return '<!-- stripped inline script -->';
  });

  const dom = new JSDOM(html, {
    url: 'file://' + p,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { value: sharedLocalStorage, configurable: true });
  // Evaluate state.js first so login() works.
  w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
  const loginResult = w.FB.state.login(email, password);
  if (DEBUG) console.log('[DEBUG] login:', email, '→', JSON.stringify(loginResult));
  // Now app.js and any extra deps.
  w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/app.js'), 'utf8'));
  deps.forEach((d) => w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets', d), 'utf8')));
  // Now run the page's stripped inline scripts.
  inlineScripts.forEach((s) => {
    try { w.eval(s); } catch (e) { console.log('[DEBUG] inline script error:', e.message); }
  });
  // Trigger DOMContentLoaded so any addEventListener('DOMContentLoaded') handlers fire.
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 80));
  if (DEBUG) {
    const list = w.document.querySelector('[data-activity-list]');
    console.log('[DEBUG] activity-list text:', list && list.textContent.slice(0, 200));
    const tbody = w.document.querySelector('[data-reports-list] tbody');
    console.log('[DEBUG] tbody exists:', !!tbody, 'rows:', tbody && tbody.children.length);
  }
  return w;
}

let passed = 0, failed = 0;
const DEBUG = process.env.DEBUG_E2E === '1';
function check(label, ok, extra) {
  if (ok) { passed++; console.log('  PASS  ' + label); }
  else    { failed++; console.log('  FAIL  ' + label + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const jsErrors = [];
  function trapErrors(w, label) {
    w.addEventListener('error', (e) => jsErrors.push(label + ': ' + (e.error?.stack || e.message)));
    w.onerror = (msg, src, l, c, err) => jsErrors.push(label + ': ' + (err?.stack || msg));
  }

  // ============================================================
  console.log('\n[Issue 1: Recent Activity verb type-awareness]\n');

  // Helper to render the dashboard with a signed-in user and read activity text
  async function renderDashboardAs(email, password) {
    const w = await loadPageSignedIn(
      path.join(MOCKUPS, 'member/07-dashboard.html'), email, password);
    const list = w.document.querySelector('[data-activity-list]');
    return { w, text: list ? list.textContent : '' };
  }

  // Sam — has multiple `created` audits on FOUND reports. Should see "found item".
  {
    const { text } = await renderDashboardAs('sam.patel@example.org', 'demo1234');
    check("[1/Sam] dashboard renders activity", text.length > 0, 'len=' + text.length);
    check("[1/Sam] 'You reported a found item' present (found-type audit)",
          /You reported a found item/.test(text));
    check("[1/Sam] generic-only 'You reported an item' is absent",
          !/You reported an item/.test(text));
  }

  // Pre-create one Lost + one Found report owned by Maya, then render her dashboard.
  // We use a temporary setup window so the createReport calls run, then load
  // the dashboard separately.
  {
    // Step 1: create the reports in a throwaway window
    const setup = await loadPageSignedIn(
      path.join(MOCKUPS, 'member/07-dashboard.html'),
      'maya.chen@example.org', 'demo1234');
    setup.FB.state.createReport({
      type: 'lost', name: 'TEST LOST ITEM (e2e)',
      category: 'Bags', description: 'A test lost item created by the e2e test.',
      date: new Date().toISOString().slice(0,10),
      campusArea: 'Library', exactPlace: 'Reading Room',
      identifyingDetails: 'A test identifying detail.'
    }, 'u_maya');
    setup.FB.state.createReport({
      type: 'found', name: 'TEST FOUND ITEM (e2e)',
      category: 'Electronics', description: 'A test found item created by the e2e test.',
      date: new Date().toISOString().slice(0,10),
      campusArea: 'Cafeteria', exactPlace: 'Table 3',
      identifyingDetails: 'A test identifying detail.'
    }, 'u_maya');

    // Step 2: load dashboard in a new window so it re-reads state from localStorage
    const w = await loadPageSignedIn(
      path.join(MOCKUPS, 'member/07-dashboard.html'),
      'maya.chen@example.org', 'demo1234');
    const list = w.document.querySelector('[data-activity-list]');
    const text = list ? list.textContent : '';
    check("[1/Maya+new] dashboard shows 'You reported a lost item'",
          /You reported a lost item/.test(text), 'text head: ' + text.slice(0, 200));
    check("[1/Maya+new] dashboard shows 'You reported a found item'",
          /You reported a found item/.test(text));
  }

  // ============================================================
  console.log('\n[Issue 2: My Reports detail navigation]\n');

  async function loadMyReportsAs(email, password) {
    return await loadPageSignedIn(
      path.join(MOCKUPS, 'member/08-my-reports.html'), email, password);
  }

  // The reporter-view detail page. Load it with a specific ?item= query and
  // confirm the rendered detail text matches the expected report.
  async function renderReporterDetail(itemId, email = 'sam.patel@example.org') {
    const detailPath = path.join(MOCKUPS, 'member/04-item-detail-reporter.html');
    let detailSrc = fs.readFileSync(detailPath, 'utf8');
    const url = 'file://' + detailPath + '?item=' + itemId;
    // Strip inline scripts so we can run them after state.js etc.
    const inlineScripts = [];
    detailSrc = detailSrc.replace(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi, (m, body) => {
      inlineScripts.push(body);
      return '<!-- stripped -->';
    });
    const dom = new JSDOM(detailSrc, {
      url: url,
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
    const dw = dom.window;
    Object.defineProperty(dw, 'localStorage', { value: sharedLocalStorage, configurable: true });
    dw.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
    dw.FB.state.login(email, 'demo1234');
    dw.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/app.js'), 'utf8'));
    dw.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/detail-renderer.js'), 'utf8'));
    inlineScripts.forEach((s) => { try { dw.eval(s); } catch (e) {} });
    dw.document.dispatchEvent(new dw.Event('DOMContentLoaded'));
    await new Promise((r) => setTimeout(r, 80));
    const root = dw.document.querySelector('[data-detail-root]');
    return { dw, text: root ? root.textContent : '' };
  }

  // Sam's reports — multiple distinct items (includes textbook_returned + backpack)
  const samReports = [
    { id: 'rpt_wallet_found',     name: 'Brown leather wallet' },
    { id: 'rpt_phone_found',      name: 'Black iPhone 14' },
    { id: 'rpt_scarf_found',      name: 'Wool scarf — burnt orange' },
    { id: 'rpt_charger_approved', name: 'USB-C charger, white' },
    { id: 'rpt_textbook_returned',name: 'Calculus textbook' }, // also Sam's
    { id: 'rpt_backpack_found',   name: 'Black backpack' },   // also Sam's (claim-flow demo)
  ];

  for (const r of samReports) {
    const { text } = await renderReporterDetail(r.id);
    const hasExpected = text.toLowerCase().indexOf(r.name.toLowerCase()) !== -1;
    check("[2/Sam/?item=" + r.id + "] detail renders '" + r.name + "'",
          hasExpected, 'text head: ' + text.slice(0, 150));
    // And the wallet does NOT show up unless this IS the wallet.
    if (r.id !== 'rpt_wallet_found') {
      check("[2/Sam/?item=" + r.id + "] does NOT show 'Brown leather wallet'",
            text.indexOf('Brown leather wallet') === -1);
    }
  }

  // Maya has a Lost report — rpt_wallet_lost. Confirm Lost detail also works.
  {
    const { text } = await renderReporterDetail('rpt_wallet_lost');
    check("[2/Maya/rpt_wallet_lost] detail renders 'Brown leather wallet' (Maya's lost one)",
          /Brown leather wallet/.test(text), 'text head: ' + text.slice(0, 150));
  }

  // ============================================================
  console.log('\n[Regression: My Reports row -> detail href]\n');

  // For each of Sam's reports, confirm the My Reports row's onclick targets
  // the right detail page with the right ?item=.
  {
    const w = await loadMyReportsAs('sam.patel@example.org', 'demo1234');
    const tbody = w.document.querySelector('[data-reports-list] tbody');
    check("[reg] Sam My Reports tbody present", !!tbody);
    const rows = tbody ? Array.from(tbody.querySelectorAll('tr')) : [];
    check("[reg] Sam My Reports has 6 rows (one per report)",
          rows.length === 6, 'rows=' + rows.length);
    rows.forEach((row, i) => {
      const onclick = row.getAttribute('onclick') || '';
      const m = onclick.match(/item=([a-z_0-9]+)/);
      const itemId = m && m[1];
      check("[reg] row " + i + " onclick itemId is one of Sam's seeded reports",
            samReports.some((r) => r.id === itemId), 'onclick=' + onclick);
    });
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
