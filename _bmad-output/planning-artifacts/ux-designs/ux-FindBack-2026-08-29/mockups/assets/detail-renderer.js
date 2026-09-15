// ============================================================================
// FindBack Prototype — Shared item-detail renderer.
// All 4 detail variants (03-member, 04-reporter, 05-claimant, 06-returned)
// import this script after state.js + app.js. They each render through
// window.FB.renderItemDetail(rootEl, options).
//
// visibilityRules come from EXPERIENCE.md §11.1. The page-level scope (member
// vs reporter vs claimant vs admin) is computed from the current user and
// the chosen report — not from which HTML file is opened — so a stranger
// opening "04-reporter" still sees the stranger view (no special PII access).
// ============================================================================
(function () {
  'use strict';

  function statusLabel(s) {
    return ({
      open: 'Open',
      claimRequested: 'Claim Requested',
      claimApproved: 'Claim Approved',
      returned: 'Returned',
      closed: 'Closed'
    })[s] || s;
  }
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }
  function plural(n, singular, plural) {
    return n === 1 ? singular : (plural || singular + 's');
  }

  function renderItemDetail(root, options) {
    options = options || {};
    var FB = window.FB;
    if (!FB || !FB.state) {
      root.innerHTML = '<div class="fb-listings__empty"><strong>Loading…</strong></div>';
      return;
    }
    var user = FB.state.getCurrentUser();

    var params = new URLSearchParams(window.location.search);
    var itemId = options.itemId || params.get('item') || 'rpt_wallet_found';
    var r = FB.state.getReport(itemId);
    if (!r) {
      root.innerHTML = '<div class="fb-listings__empty"><strong>Item not found.</strong><div>It may have been removed or closed.</div></div>';
      return;
    }
    var reporter = FB.state.getUser(r.reporterId);
    var claims = FB.state.listClaimsForReport(r.id);

    // Default: as the current signed-in member. For anonymous paths, user=null.
    var isAdmin = !!user && user.role === 'administrator';
    var isReporter = !!user && r.reporterId === user.id;
    var myClaims = user ? claims.filter(function (c) { return c.claimantId === user.id; }) : [];
    var isClaimant = myClaims.length > 0;
    // Has a relationship if any of these:
    var hasRelationship = isReporter || isClaimant || isAdmin;
    // Visibility for the "returned-to" / "receiver" block (PRD FR-22/23;
    // EXPERIENCE.md §11.1 — return info is sensitive, visible only to
    // Reporter / Claimant / Administrator).
    var canSeeReturnInfo = hasRelationship;
    // Visibility for "reporter display name" (EXPERIENCE.md §11.1).
    var canSeeReporterName = hasRelationship;

    var statusL = statusLabel(r.status);

    // Push title onto the document.
    document.title = r.name + ' — FindBack';

    var html = '';

    // Breadcrumb
    var breadcrumb = options.breadcrumb || [
      { href: '02-listings-member.html', label: 'Lost & Found' },
      { current: true, label: r.name }
    ];
    html += '<nav class="fb-detail__breadcrumb" aria-label="Breadcrumb">';
    breadcrumb.forEach(function (b, i) {
      if (i > 0) html += ' › ';
      if (b.current) html += '<span aria-current="page">' + escapeHtml(b.label) + '</span>';
      else html += '<a href="' + b.href + '">' + escapeHtml(b.label) + '</a>';
    });
    html += '</nav>';

    // Title + badges
    html += '<div class="fb-detail__header" style="margin-top: var(--fb-space-3);">';
    html += '  <div class="fb-detail__title-wrap"><h1 class="fb-detail__title">' + escapeHtml(r.name) + '</h1>';
    html += '    <div class="fb-detail__badges">';
    html += '      <span class="fb-type-badge fb-type-badge--' + r.type + '">' + (r.type === 'lost' ? 'Lost' : 'Found') + '</span>';
    html += '      <span class="fb-status fb-status--report-' + r.status + '" aria-label="Status: ' + statusL + '">' + statusL + '</span>';
    html += '    </div></div>';
    html += '</div>';

    // Reporter toolbar
    if (isReporter && r.status !== 'closed') {
      html += '<div class="fb-row fb-row--between" style="margin-bottom: var(--fb-space-5); padding: var(--fb-space-3) var(--fb-space-4); background: var(--fb-brand-primary-soft); border-radius: var(--fb-radius-md);">';
      html += '  <span style="color: var(--fb-brand-primary); font-weight: 500;">You reported this item.</span>';
      html += '  <div class="fb-row">';
      html += '    <a href="09-edit-report.html?item=' + r.id + '" class="fb-btn fb-btn--secondary fb-btn--sm">Edit</a>';
      html += '    <button type="button" class="fb-btn fb-btn--tertiary fb-btn--sm" data-action="withdraw-report" data-item="' + r.id + '">Withdraw</button>';
      html += '  </div>';
      html += '</div>';
    }

    html += '<div class="fb-detail__grid">';
    html += '  <div>';

    // Image
    if (r.imageDataUrl) {
      html += '<div class="fb-detail__image"><img src="' + r.imageDataUrl + '" alt="Photo of ' + escapeHtml(r.name) + '"></div>';
    } else {
      html += '<div class="fb-detail__image"><span>No photo attached</span></div>';
    }

    // Description
    html += '  <section class="fb-detail__section" aria-labelledby="desc-h">';
    html += '    <h2 id="desc-h" class="fb-detail__section-title">Description</h2>';
    html += '    <p class="fb-detail__section-body">' + escapeHtml(r.description) + '</p>';
    html += '  </section>';

    // Identifying details
    if (hasRelationship) {
      html += '  <section class="fb-detail__section" aria-labelledby="id-h">';
      html += '    <h2 id="id-h" class="fb-detail__section-title">Identifying details <span class="fb-sensitive-flag">Visible to you</span></h2>';
      html += '    <p class="fb-detail__section-body">' + escapeHtml(r.identifyingDetails || '(none)') + '</p>';
      if (r.exactPlace) {
        html += '    <p style="margin: var(--fb-space-3) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;"><strong>Exact place:</strong> ' + escapeHtml(r.exactPlace) + '</p>';
      }
      html += '  </section>';
    }

    // Submit-claim CTA: only for **Found** items (EXPERIENCE.md §87, §679).
    // Eligibility (server + UX): Active member + Found item + status
    // Open/ClaimRequested + no existing claim from this user.
    var userCanSubmitClaim = !!user && user.role === 'member' && r.type === 'found' &&
      (r.status === 'open' || r.status === 'claimRequested') &&
      !isReporter && !isClaimant && !isAdmin;
    if (userCanSubmitClaim) {
      html += '  <section class="fb-detail__section" aria-labelledby="claim-h">';
      html += '    <h2 id="claim-h" class="fb-detail__section-title">Does this look familiar?</h2>';
      html += '    <p class="fb-detail__section-body">If this might be yours, submit a claim with a reason and identifying details. An administrator will review competing claims.</p>';
      html += '    <div style="margin-top: var(--fb-space-4);">';
      html += '      <a href="11-submit-claim.html?item=' + r.id + '" class="fb-btn fb-btn--primary">Submit a claim</a>';
      html += '    </div>';
      html += '  </section>';
    }
    // Sign-in prompt for **Found** items only.
    var canShowSignInCTA = !user && r.type === 'found' &&
      (r.status === 'open' || r.status === 'claimRequested');
    if (canShowSignInCTA) {
      html += '  <section class="fb-detail__section" aria-labelledby="claim-h">';
      html += '    <h2 id="claim-h" class="fb-detail__section-title">Does this look familiar?</h2>';
      html += '    <p class="fb-detail__section-body">Sign in to submit a claim with a reason and identifying details. An administrator will review it.</p>';
      html += '    <div style="margin-top: var(--fb-space-4);"><a href="../public/02-login.html?next=' + encodeURIComponent('03-item-detail-member.html?item=' + r.id) + '" class="fb-btn fb-btn--primary">Sign in to claim</a></div>';
      html += '  </section>';
    }

    // Claimant-specific status alerts
    if (isClaimant) {
      var pendingClaim = myClaims.find(function (c) { return c.status === 'pending'; });
      var approvedClaim = myClaims.find(function (c) { return c.status === 'approved'; });
      var rejectedClaim = myClaims.find(function (c) { return c.status === 'rejected'; });
      if (pendingClaim) {
        html += '  <div class="fb-detail__alert" role="status"><span aria-hidden="true">⏳</span><div><strong>You have a pending claim</strong> for this item. <a href="13-claim-detail.html?claim=' + pendingClaim.id + '">View claim</a></div></div>';
      }
      if (approvedClaim && r.status === 'claimApproved') {
        html += '  <div class="fb-detail__alert" style="background: var(--fb-success-soft); border-color: var(--fb-success);" role="status"><span aria-hidden="true">✓</span><div><strong>Your claim was approved.</strong> An administrator will reach out to confirm the handoff. <a href="13-claim-detail.html?claim=' + approvedClaim.id + '">View claim</a></div></div>';
      }
      if (approvedClaim && r.status === 'returned') {
        var rb = FB.state.getUser(r.returnedBy);
        html += '  <div class="fb-detail__alert" style="background: var(--fb-success-soft); border-color: var(--fb-success);" role="status"><span aria-hidden="true">✓</span><div><strong>This item was returned.</strong> Returned to <strong>' + escapeHtml(r.receiver ? r.receiver.name : 'you') + '</strong> by ' + escapeHtml(rb ? rb.name : 'administrator') + ' ' + window.fbRelativeTime(new Date(r.returnedAt)) + '.</div></div>';
      }
      if (rejectedClaim && !pendingClaim && !approvedClaim) {
        html += '  <div class="fb-detail__alert" role="status"><span aria-hidden="true">✕</span><div><strong>Your claim was not approved.</strong> ' + escapeHtml(rejectedClaim.decisionReason || '') + ' <a href="16-claim-rejected-detail.html?claim=' + rejectedClaim.id + '">View claim</a></div></div>';
      }
    }

    // Reporter claims overview
    if (isReporter && claims.length) {
      html += '  <section class="fb-detail__section" aria-labelledby="claims-h">';
      html += '    <h2 id="claims-h" class="fb-detail__section-title">Claims on this item</h2>';
      var pending = claims.filter(function (c) { return c.status === 'pending'; });
      var approved = claims.filter(function (c) { return c.status === 'approved'; });
      var rejected = claims.filter(function (c) { return c.status === 'rejected'; });
      if (pending.length) {
        html += '  <div class="fb-alert fb-alert--info"><div><strong>' + pending.length + ' ' + plural(pending.length, 'pending claim') + '</strong><p style="margin: var(--fb-space-1) 0 0;">An administrator will review competing claims and notify you.</p></div></div>';
      } else if (approved.length) {
        html += '  <div class="fb-alert" style="background: var(--fb-success-soft); border-color: var(--fb-success);"><div><strong>1 approved claim</strong><p style="margin: var(--fb-space-1) 0 0;">An administrator will reach out to arrange the handoff.</p></div></div>';
      } else if (rejected.length && r.status === 'open') {
        html += '  <div class="fb-alert"><div><strong>No pending claims.</strong> The report has returned to <em>Open</em>.</div></div>';
      }
      html += '    <p style="margin-top: var(--fb-space-3);"><a href="08-my-reports.html" class="fb-btn fb-btn--secondary fb-btn--sm">Manage in My reports</a></p>';
      html += '  </section>';
    }

    // Activity trail (visible to member users)
    if (user) {
      var audit = FB.state.listAudit({ reportId: r.id });
      if (audit.length) {
        html += '  <section class="fb-detail__section" aria-labelledby="trail-h">';
        html += '    <h2 id="trail-h" class="fb-detail__section-title">Activity</h2>';
        html += '    <ul class="fb-detail__status-trail">';
        audit.slice(0, 8).forEach(function (a) {
          html += '<li><span>' + escapeHtml(a.detail || a.action) + '</span><time>' + window.fbRelativeTime(new Date(a.createdAt)) + '</time></li>';
        });
        html += '    </ul>';
        html += '  </section>';
      }
    }

    html += '  </div>';

    // Aside — quick facts
    html += '  <aside>';
    html += '    <div class="fb-detail__section">';
    html += '      <h2 class="fb-detail__section-title">Quick facts</h2>';
    html += '      <dl class="fb-detail__meta">';
    html += '        <div><dt>Category</dt><dd>' + escapeHtml(r.category) + '</dd></div>';
    html += '        <div><dt>Date ' + (r.type === 'lost' ? 'lost' : 'found') + '</dt><dd>' + window.fbFormatDate(r.date) + '</dd></div>';
    html += '        <div><dt>Campus area</dt><dd>' + escapeHtml(r.campusArea) + '</dd></div>';
    if (hasRelationship && r.exactPlace) {
      html += '        <div><dt>Exact place</dt><dd>' + escapeHtml(r.exactPlace) + '</dd></div>';
    }
    if (canSeeReporterName) {
      html += '        <div><dt>Reporter</dt><dd>' + escapeHtml(reporter ? reporter.name : 'Unknown') + '</dd></div>';
    } else {
      html += '        <div><dt>Reporter</dt><dd><span class="fb-helper" aria-label="Hidden from other members">Hidden from other members</span></dd></div>';
    }
    html += '        <div><dt>Reported</dt><dd>' + window.fbRelativeTime(new Date(r.createdAt)) + '</dd></div>';
    if (r.returnedAt && canSeeReturnInfo) {
      var rby = FB.state.getUser(r.returnedBy);
      html += '        <div><dt>Returned</dt><dd>' + window.fbFormatDate(r.returnedAt) + '</dd></div>';
      if (r.receiver) html += '        <div><dt>Returned to</dt><dd>' + escapeHtml(r.receiver.name) + '</dd></div>';
    }
    if (r.closedAt) {
      html += '        <div><dt>Closed</dt><dd>' + window.fbFormatDate(r.closedAt) + '</dd></div>';
    }
    if (isAdmin) {
      html += '        <div><dt>Admin tools</dt><dd><a href="../admin/01-dashboard.html">Admin dashboard</a></dd></div>';
    }
    html += '      </dl>';
    html += '    </div>';
    html += '  </aside>';
    html += '</div>';

    root.innerHTML = html;

    // Wire withdraw action
    var withdrawBtn = root.querySelector('[data-action="withdraw-report"]');
    if (withdrawBtn) {
      withdrawBtn.addEventListener('click', function () {
        var itemId = withdrawBtn.dataset.item;
        if (!window.confirm('Withdraw this report? It will move to Closed and be removed from active listings.')) return;
        FB.state.withdrawReport(itemId, user.id);
        FB.toast && FB.toast('Report withdrawn.', 'success');
        setTimeout(function () { window.location.reload(); }, 300);
      });
    }

    // Mockup-context line in nav
    var ctx = document.querySelector('[data-mockup-context]');
    if (ctx) {
      var role = isAdmin ? 'admin' : isReporter ? 'reporter' : isClaimant ? 'claimant' : (user ? 'member, no relationship' : 'anonymous');
      ctx.textContent = (user ? user.name : 'Anonymous') + ' · ' + role + ' · ' + r.name;
    }
  }

  window.FB = window.FB || {};
  window.FB.renderItemDetail = renderItemDetail;
})();
