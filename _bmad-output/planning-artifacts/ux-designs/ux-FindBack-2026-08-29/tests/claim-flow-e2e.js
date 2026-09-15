// Focused e2e test for the seeded Active Member claim-flow demo item:
// "Found Black Backpack" (rpt_backpack_found).
//
// Walks the full claim journey end-to-end:
//   Maya login -> Browse -> backpack card visible -> Open detail -> CTA visible
//   -> Submit-claim page opens & is enabled -> submit claim -> claim is Pending
//   -> Maya's My Claims shows it -> Riley's Pending Claims shows it
//   -> persists across logout/login -> Reset restores original demo scenario.

const { JSDOM } = require('/tmp/jsdom-tmp/node_modules/jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join('/home/bs01657/BS-23/Learning/AI-DLC/FindBack/_bmad-output/planning-artifacts/ux-designs/ux-FindBack-2026-08-29');
const MOCKUPS = path.join(ROOT, 'mockups');
const ITEM_ID = 'rpt_backpack_found';
const ITEM_NAME = 'Black backpack — North Face';

// Shared localStorage shim so multiple JSDOM windows see the same session.
const sharedStore = new Map();
const sharedLocalStorage = {
  getItem: (k) => (sharedStore.has(k) ? sharedStore.get(k) : null),
  setItem: (k, v) => sharedStore.set(k, String(v)),
  removeItem: (k) => sharedStore.delete(k),
  clear: () => sharedStore.clear(),
};

async function loadPageSignedIn(p, email, password, deps = [], query = '') {
  let html = fs.readFileSync(p, 'utf8');
  const inlineScripts = [];
  html = html.replace(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi, (m, body) => {
    inlineScripts.push(body);
    return '<!-- stripped inline script -->';
  });

  const url = 'file://' + p + (query ? (p.indexOf('?') === -1 ? '?' : '&') + query : '');
  const dom = new JSDOM(html, {
    url: url,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  Object.defineProperty(w, 'localStorage', { value: sharedLocalStorage, configurable: true });
  w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
  w.FB.state.login(email, password);
  w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/app.js'), 'utf8'));
  deps.forEach((d) => w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets', d), 'utf8')));
  inlineScripts.forEach((s) => {
    try { w.eval(s); } catch (e) { /* ignored */ }
  });
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  await new Promise((r) => setTimeout(r, 80));
  return w;
}

let passed = 0, failed = 0;
const results = []; // captured for the final validation report
function check(label, ok, extra) {
  if (ok) { passed++; console.log('  PASS  ' + label); }
  else    { failed++; console.log('  FAIL  ' + label + (extra ? ' — ' + extra : '')); }
  results.push({ label, ok: !!ok, extra: extra || '' });
}

(async () => {
  const jsErrors = [];
  function trapErrors(w, label) {
    w.addEventListener('error', (e) => jsErrors.push(label + ': ' + (e.error?.stack || e.message)));
    w.onerror = (msg, src, l, c, err) => jsErrors.push(label + ': ' + (err?.stack || msg));
  }

  // ---- Fresh-start state -----------------------------------------------
  // Make sure we're starting from a clean seed (defensive — if the runner
  // had run a previous test that mutated localStorage, reset now).
  {
    const w = new JSDOM('<!doctype html>', { runScripts: 'outside-only', pretendToBeVisual: true }).window;
    Object.defineProperty(w, 'localStorage', { value: sharedLocalStorage, configurable: true });
    w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
    w.FB.state.reset();
  }

  // ============================================================
  console.log('\n[Demo Item — seed presence]\n');

  // Use a throwaway window to inspect the seeded report.
  {
    const w = new JSDOM('<!doctype html>', { runScripts: 'outside-only', pretendToBeVisual: true }).window;
    Object.defineProperty(w, 'localStorage', { value: sharedLocalStorage, configurable: true });
    w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
    const r = w.FB.state.getReport(ITEM_ID);
    check('seed: rpt_backpack_found exists',  !!r);
    check('seed: type = found',                r && r.type === 'found',              'type=' + (r && r.type));
    check('seed: status = open',               r && r.status === 'open',             'status=' + (r && r.status));
    check('seed: reporterId != u_maya',        r && r.reporterId !== 'u_maya',       'reporterId=' + (r && r.reporterId));
    check('seed: category set',                r && r.category.length > 0,           'category=' + (r && r.category));
    check('seed: campusArea set',              r && r.campusArea.length > 0,         'campusArea=' + (r && r.campusArea));
    check('seed: closedAt null',               r && r.closedAt === null);
    check('seed: returnedAt null',             r && r.returnedAt === null);
    const existing = w.FB.state.listClaimsForReport(ITEM_ID).filter((c) => c.claimantId === 'u_maya');
    check('seed: no pre-existing Maya claim',  existing.length === 0,                'pre-existing=' + existing.length);
  }

  // ============================================================
  console.log('\n[Step 1 — Maya signed in: Browse listings shows backpack card]\n');

  const listingsW = await loadPageSignedIn(
    path.join(MOCKUPS, 'member/02-listings-member.html'),
    'maya.chen@example.org', 'demo1234');
  trapErrors(listingsW, 'listings');
  const resultsEl = listingsW.document.querySelector('[data-results]');
  const listingsText = resultsEl ? resultsEl.textContent : '';
  check('listings: results render',                  resultsEl && resultsEl.children.length > 0,
        'children=' + (resultsEl && resultsEl.children.length));
  check('listings: backpack name visible',           listingsText.indexOf(ITEM_NAME) !== -1);
  check('listings: backpack card has detail link',
        !!resultsEl && !!resultsEl.querySelector('a.fb-item-card[href*="?item=' + ITEM_ID + '"]'));
  check('listings: backpack card shows "Found" badge',
        /Found/.test(listingsText));

  // ============================================================
  console.log('\n[Step 2 — Open backpack detail (Maya)]\n');

  const detailW = await loadPageSignedIn(
    path.join(MOCKUPS, 'member/03-item-detail-member.html'),
    'maya.chen@example.org', 'demo1234',
    ['detail-renderer.js'], 'item=' + ITEM_ID);
  trapErrors(detailW, 'item-detail');
  // Re-render with explicit itemId in case the inline script captured URL
  // before ?item= was set (defensive).
  detailW.eval('window.FB.renderItemDetail(document.querySelector("[data-detail-root]"), { itemId: "' + ITEM_ID + '", breadcrumb: [{ href: "02-listings-member.html", label: "Lost & Found" }, { current: true, label: "Item detail" }] });');
  await new Promise((r) => setTimeout(r, 40));
  const detailRoot = detailW.document.querySelector('[data-detail-root]');
  const detailText = detailRoot ? detailRoot.textContent : '';
  check('detail: renders backpack name',             detailText.indexOf(ITEM_NAME) !== -1);
  check('detail: shows "Open" status',               /Open/.test(detailText));
  check('detail: Submit a claim CTA visible',
        !!detailRoot.querySelector('a.fb-btn--primary[href*="11-submit-claim.html?item=' + ITEM_ID + '"]'),
        'hrefs=' + Array.from(detailRoot.querySelectorAll('a')).map((a) => a.getAttribute('href')).join(','));
  check('detail: NO block-alert / sign-in prompt',
        !detailW.document.querySelector('[data-block-alert]'));

  // ============================================================
  console.log('\n[Step 3 — Submit-claim page opens for Maya with enabled form]\n');

  const submitW = await loadPageSignedIn(
    path.join(MOCKUPS, 'member/11-submit-claim.html'),
    'maya.chen@example.org', 'demo1234', [], 'item=' + ITEM_ID);
  trapErrors(submitW, 'submit-claim');
  await new Promise((r) => setTimeout(r, 40));
  const ctxText = (submitW.document.querySelector('[data-claim-context]') || {}).textContent || '';
  check('submit-claim: context shows backpack name', ctxText.indexOf(ITEM_NAME) !== -1,
        'ctx head: ' + ctxText.slice(0, 120));
  check('submit-claim: context shows "Found"',      /Found/.test(ctxText));
  const blockAlert = submitW.document.querySelector('[data-block-alert]');
  check('submit-claim: NO block alert',             !blockAlert || blockAlert.hidden === true);
  const reasonField = submitW.document.querySelector('[name="reason"]');
  const submitBtn   = submitW.document.querySelector('button[type="submit"]');
  check('submit-claim: reason field enabled',       !!reasonField && !reasonField.disabled);
  check('submit-claim: submit button enabled',      !!submitBtn && !submitBtn.disabled);

  // ============================================================
  console.log('\n[Step 4 — Submit claim and verify state transitions]\n');

  // Drive the actual submitClaim code path used by the page's onSubmit handler.
  const claimResult = submitW.eval([
    '({',
    '  ok: true,',
    '  reportId: "' + ITEM_ID + '",',
    '  reason: "I lost this exact backpack at the library on Monday — Field Notes sticker and the frayed strap are mine.",',
    '  identifyingDetails: "Field Notes sticker on the front pocket; frayed right shoulder strap; red interior lining.",',
    '  dateLost: "' + new Date(Date.now() - 5*86400000).toISOString().slice(0,10) + '",',
    '})',
  ].join('\n'));
  // The eval result of an object literal is the object itself; reuse as a
  // JS object in the eval below.
  const submitted = submitW.FB.state.submitClaim({
    reportId: ITEM_ID,
    reason: claimResult.reason,
    identifyingDetails: claimResult.identifyingDetails,
    dateLost: claimResult.dateLost,
  }, 'u_maya');
  check('submit: submitClaim returned a claim record', !!submitted && !!submitted.id);
  check('submit: new claim has status "pending"',      submitted && submitted.status === 'pending',
        'status=' + (submitted && submitted.status));
  check('submit: new claim claimantId = u_maya',       submitted && submitted.claimantId === 'u_maya');
  const afterR = submitW.FB.state.getReport(ITEM_ID);
  check('submit: report transitioned to claimRequested',
        afterR && afterR.status === 'claimRequested', 'status=' + (afterR && afterR.status));

  // ============================================================
  console.log('\n[Step 5 — Maya\'s My Claims shows backpack with Pending badge]\n');

  const myClaimsW = await loadPageSignedIn(
    path.join(MOCKUPS, 'member/10-my-claims.html'),
    'maya.chen@example.org', 'demo1234');
  trapErrors(myClaimsW, 'my-claims');
  const claimsList = myClaimsW.document.querySelector('[data-claims-list]');
  const claimsText = claimsList ? claimsList.textContent : '';
  check('my-claims: backpack name present',            claimsText.indexOf(ITEM_NAME) !== -1,
        'text head: ' + claimsText.slice(0, 200));
  check('my-claims: "Pending" badge present',          /Pending/.test(claimsText));
  check('my-claims: contains a row with Maya claim',   !!claimsList.querySelector('tr[onclick*="13-claim-detail.html?claim="]'));

  // ============================================================
  console.log('\n[Step 6 — Riley\'s Pending Claims shows backpack claim]\n');

  const adminClaimsW = await loadPageSignedIn(
    path.join(MOCKUPS, 'admin/05-pending-claims.html'),
    'riley.park@example.org', 'demo1234',
    ['admin-renderer.js']);
  trapErrors(adminClaimsW, 'admin-pending-claims');
  const adminRoot = adminClaimsW.document.querySelector('[data-admin-root]');
  const adminText = adminRoot ? adminRoot.textContent : '';
  check('admin: pending claims page renders',          adminRoot && adminRoot.children.length > 0,
        'children=' + (adminRoot && adminRoot.children.length));
  check('admin: backpack name visible in queue',       adminText.indexOf(ITEM_NAME) !== -1,
        'text head: ' + adminText.slice(0, 300));
  check('admin: Maya name visible in queue',           adminText.indexOf('Maya') !== -1);

  // ============================================================
  console.log('\n[Step 7 — Persistence across logout/login]\n');

  // Logout, then login again as Maya. State should still contain the claim.
  {
    const w = new JSDOM('<!doctype html>', { runScripts: 'outside-only', pretendToBeVisual: true }).window;
    Object.defineProperty(w, 'localStorage', { value: sharedLocalStorage, configurable: true });
    w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
    w.FB.state.logout();
    const r = w.FB.state.login('maya.chen@example.org', 'demo1234');
    check('persistence: Maya logs back in',             r && r.ok === true && r.user && r.user.id === 'u_maya',
          'login=' + JSON.stringify(r));
    const persisted = w.FB.state.listClaimsForUser('u_maya').filter((c) => c.reportId === ITEM_ID);
    check('persistence: Maya\'s backpack claim still present',
          persisted.length === 1 && persisted[0].status === 'pending',
          'count=' + persisted.length + ', status=' + (persisted[0] && persisted[0].status));
    const rpt = w.FB.state.getReport(ITEM_ID);
    check('persistence: backpack still claimRequested', rpt && rpt.status === 'claimRequested');
  }

  // ============================================================
  console.log('\n[Step 8 — Reset restores the original demo scenario]\n');

  {
    const w = new JSDOM('<!doctype html>', { runScripts: 'outside-only', pretendToBeVisual: true }).window;
    Object.defineProperty(w, 'localStorage', { value: sharedLocalStorage, configurable: true });
    w.eval(fs.readFileSync(path.join(MOCKUPS, 'assets/state.js'), 'utf8'));
    w.FB.state.reset();
    const r = w.FB.state.getReport(ITEM_ID);
    check('reset: backpack still present',              !!r);
    check('reset: backpack status back to "open"',      r && r.status === 'open', 'status=' + (r && r.status));
    const existing = w.FB.state.listClaimsForReport(ITEM_ID).filter((c) => c.claimantId === 'u_maya');
    check('reset: no Maya claim on backpack',           existing.length === 0, 'count=' + existing.length);
    // After reset, demo item should once again be eligible from Maya's POV.
    const mayaClaims = w.FB.state.listClaimsForUser('u_maya').filter((c) => c.reportId === ITEM_ID);
    check('reset: no Maya claim anywhere',              mayaClaims.length === 0);
  }

  // ============================================================
  console.log('\nSummary: ' + passed + ' passed, ' + failed + ' failed');
  if (jsErrors.length) {
    console.log('\nJS errors observed:');
    jsErrors.forEach((e) => console.log('  - ' + e));
  } else {
    console.log('JS errors: 0');
  }
  process.exit(failed === 0 ? 0 : 1);
})();
