// ============================================================================
// FindBack Prototype — Admin renderer helpers.
// State-driven renderers for the administrator-only surfaces.
// All functions are pure renderers that read from window.FB.state and write
// HTML to a root element. They never navigate — the caller controls flow.
// ============================================================================
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (m) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m];
    });
  }
  function statusLabel(s) {
    return ({
      open: 'Open',
      claimRequested: 'Claim Requested',
      claimApproved: 'Claim Approved',
      returned: 'Returned',
      closed: 'Closed',
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected'
    })[s] || s;
  }
  function statusBadgeClass(s) {
    // Map state values to the .fb-status class names defined in tokens.css.
    if (s === 'claimRequested') return 'fb-status--report-claimrequested';
    if (s === 'claimApproved') return 'fb-status--report-claimapproved';
    if (s === 'returned') return 'fb-status--report-returned';
    if (s === 'closed') return 'fb-status--report-closed';
    if (s === 'open') return 'fb-status--report-open';
    if (s === 'pending') return 'fb-status--claim-pending';
    if (s === 'approved') return 'fb-status--claim-approved';
    if (s === 'rejected') return 'fb-status--claim-rejected';
    return 'fb-status--neutral';
  }

  // Admin dashboard renderer — populates stats cards + activity feed.
  function renderAdminDashboard(root) {
    if (!window.FB || !window.FB.state) return;
    var admin = window.FB.state.getCurrentUser();
    if (!admin || admin.role !== 'administrator') {
      root.innerHTML = '<div class="fb-listings__empty"><strong>Administrator access required.</strong></div>';
      return;
    }
    var stats = window.FB.state.getAdminStats();
    var registrations = window.FB.state.listRegistrations().filter(function (r) { return !r.decision; });
    var pendingClaims = window.FB.state.listClaims().filter(function (c) { return c.status === 'pending'; });
    var awaitingReturn = window.FB.state.listReports().filter(function (r) { return r.status === 'claimApproved'; });
    var audit = window.FB.state.listAudit({ limit: 8 });

    var html = '';
    // Polished admin welcome card. Same salutation rule as the member
    // dashboard ("Good morning/afternoon/evening, <firstName>."), but the
    // surrounding composition is operational rather than welcoming: solid
    // warm-neutral surface, terracotta accent rule on the left, evergreen
    // role badge, a quick-glance KPI strip, and the two priority action
    // chips. KPI numbers echo the queue grid below so reviewers can scan
    // their top-of-funnel workload at a glance.
    var firstName = (admin.name || '').split(' ')[0] || 'there';
    var hour = new Date().getHours();
    var salutation = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
    var dateLong = window.fbFormatDate(new Date());
    // KPI counts for the welcome-card strip. Named with a `kpi` prefix to
    // avoid shadowing the `pendingClaims`/`awaitingReturn` arrays declared
    // above (which are used by the Review-workload section further down).
    var kpiPendingRegs = stats.pendingRegistrations;
    var kpiPendingClaims = stats.pendingClaims;
    var kpiAwaitingReturn = stats.awaitingReturn;
    html += '<section class="fb-admin-welcome" aria-labelledby="admin-welcome-greeting">';
    html += '  <div class="fb-admin-welcome__accent" aria-hidden="true"></div>';
    html += '  <div class="fb-admin-welcome__inner">';
    html += '    <div class="fb-admin-welcome__main">';
    html += '      <p class="fb-admin-welcome__eyebrow">Operations console</p>';
    html += '      <h1 class="fb-admin-welcome__greeting" id="admin-welcome-greeting">' + salutation + ', <em>' + escapeHtml(firstName) + '</em>.</h1>';
    html += '      <p class="fb-admin-welcome__meta">Administrator dashboard &middot; ' + escapeHtml(dateLong) + '</p>';
    html += '      <div class="fb-admin-welcome__actions">';
    html += '        <a href="02-pending-registrations.html" class="fb-btn fb-btn--secondary fb-btn--sm">Pending registrations</a>';
    html += '        <a href="05-pending-claims.html" class="fb-btn fb-btn--primary fb-btn--sm">Pending claims</a>';
    html += '      </div>';
    html += '    </div>';
    html += '    <span class="fb-admin-welcome__badge">Administrator</span>';
    html += '  </div>';
    html += '  <div class="fb-admin-welcome__kpis" aria-label="Workload summary">';
    html += '    <div class="fb-admin-welcome__kpi">';
    html += '      <div class="fb-admin-welcome__kpi-num' + (kpiPendingRegs ? ' fb-admin-welcome__kpi-num--alert' : '') + '">' + kpiPendingRegs + '</div>';
    html += '      <div class="fb-admin-welcome__kpi-label">Pending registrations</div>';
    html += '    </div>';
    html += '    <div class="fb-admin-welcome__kpi">';
    html += '      <div class="fb-admin-welcome__kpi-num' + (kpiPendingClaims ? ' fb-admin-welcome__kpi-num--alert' : '') + '">' + kpiPendingClaims + '</div>';
    html += '      <div class="fb-admin-welcome__kpi-label">Pending claims</div>';
    html += '    </div>';
    html += '    <div class="fb-admin-welcome__kpi">';
    html += '      <div class="fb-admin-welcome__kpi-num">' + kpiAwaitingReturn + '</div>';
    html += '      <div class="fb-admin-welcome__kpi-label">Awaiting return</div>';
    html += '    </div>';
    html += '  </div>';
    html += '</section>';

    // Workload panels
    html += '<h2 class="fb-h3" style="margin: var(--fb-space-2) 0 var(--fb-space-3);">Review workload</h2>';
    html += '<div class="fb-queue-grid">';

    html += '  <a href="02-pending-registrations.html" class="fb-queue-card" style="text-decoration: none; color: inherit;">';
    html += '    <p class="fb-queue-card__count">' + stats.pendingRegistrations + '</p>';
    html += '    <h3 style="margin: var(--fb-space-1) 0 0; color: var(--fb-on-surface);">Pending registrations</h3>';
    if (registrations.length) {
      var oldest = registrations[registrations.length - 1];
      var ageHours = Math.max(1, Math.round((Date.now() - new Date(oldest.requestedAt).getTime()) / 3600000));
      html += '    <p style="margin: var(--fb-space-2) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">' + registrations.length + ' awaiting review &middot; oldest: ' + ageHours + ' hours ago</p>';
    } else {
      html += '    <p style="margin: var(--fb-space-2) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">No new applications.</p>';
    }
    html += '  </a>';

    var withCompeting = 0;
    var reportToClaims = {};
    pendingClaims.forEach(function (c) {
      reportToClaims[c.reportId] = (reportToClaims[c.reportId] || 0) + 1;
    });
    Object.keys(reportToClaims).forEach(function (k) {
      if (reportToClaims[k] > 1) withCompeting++;
    });
    html += '  <a href="05-pending-claims.html" class="fb-queue-card" style="text-decoration: none; color: inherit;">';
    html += '    <p class="fb-queue-card__count">' + pendingClaims.length + '</p>';
    html += '    <h3 style="margin: var(--fb-space-1) 0 0; color: var(--fb-on-surface);">Pending claims</h3>';
    html += '    <p style="margin: var(--fb-space-2) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">' + pendingClaims.length + ' awaiting decision' + (withCompeting ? ' &middot; ' + withCompeting + ' report' + (withCompeting === 1 ? '' : 's') + ' with competing claims' : '') + '</p>';
    html += '  </a>';

    html += '  <a href="09-items-awaiting-return.html" class="fb-queue-card" style="text-decoration: none; color: inherit;">';
    html += '    <p class="fb-queue-card__count">' + awaitingReturn.length + '</p>';
    html += '    <h3 style="margin: var(--fb-space-1) 0 0; color: var(--fb-on-surface);">Items awaiting return</h3>';
    html += '    <p style="margin: var(--fb-space-2) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">' + awaitingReturn.length + ' approved claim' + (awaitingReturn.length === 1 ? '' : 's') + ' pending physical handoff</p>';
    html += '  </a>';

    html += '  <a href="12-audit-trail.html" class="fb-queue-card" style="text-decoration: none; color: inherit;">';
    html += '    <p class="fb-queue-card__count">∞</p>';
    html += '    <h3 style="margin: var(--fb-space-1) 0 0; color: var(--fb-on-surface);">Audit trail</h3>';
    html += '    <p style="margin: var(--fb-space-2) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">Append-only record &middot; ' + window.FB.state.listAudit().length + ' events</p>';
    html += '  </a>';

    html += '</div>';

    // Recent administrative activity
    html += '<h2 class="fb-h3" style="margin: var(--fb-space-6) 0 var(--fb-space-3);">Recent administrative activity</h2>';
    if (!audit.length) {
      html += '<p class="fb-helper">No activity recorded yet.</p>';
    } else {
      html += '<ul class="fb-activity-list">';
      audit.forEach(function (e) {
        var verb;
        if (e.action === 'created') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> created a report';
        else if (e.action === 'edited') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> edited a report';
        else if (e.action === 'withdrawn') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> withdrew a report';
        else if (e.action === 'closed') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> closed a report';
        else if (e.action === 'claim_submitted') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> submitted a claim';
        else if (e.action === 'claim_approved') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> approved a claim';
        else if (e.action === 'claim_rejected') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> rejected a claim';
        else if (e.action === 'claim_auto_rejected') verb = 'Auto-rejected competing claim';
        else if (e.action === 'returned') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> confirmed return';
        else if (e.action === 'message_posted') verb = '<strong>' + escapeHtml(e.actorName) + '</strong> posted a message';
        else verb = '<strong>' + escapeHtml(e.actorName) + '</strong> &middot; ' + escapeHtml(e.action);
        html += '<li><div><div>' + verb + '</div><p style="margin: var(--fb-space-1) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">' + window.fbRelativeTime(new Date(e.createdAt)) + ' &middot; ' + escapeHtml(e.detail || '') + '</p></div></li>';
      });
      html += '</ul>';
      html += '<p style="margin-top: var(--fb-space-3);"><a href="12-audit-trail.html" class="fb-btn fb-btn--secondary fb-btn--sm">View full audit trail</a></p>';
    }

    root.innerHTML = html;
  }

  // Admin registrations queue.
  function renderPendingRegistrations(root) {
    if (!window.FB || !window.FB.state) return;
    var regs = window.FB.state.listRegistrations().filter(function (r) { return !r.decision; });
    var html = '';
    html += '<div class="fb-row fb-row--between" style="margin-bottom: var(--fb-space-5); flex-wrap: wrap; gap: var(--fb-space-3);">';
    html += '  <h1 class="fb-h2">Pending registrations</h1>';
    html += '  <p class="fb-helper">' + regs.length + ' awaiting review &middot; ordered by submission time</p>';
    html += '</div>';
    if (!regs.length) {
      html += '<div class="fb-listings__empty"><strong>No pending registrations.</strong><div>All applications have been reviewed.</div></div>';
      root.innerHTML = html;
      return;
    }
    html += '<div class="fb-reviews-list">';
    regs.forEach(function (reg) {
      html += '  <div class="fb-review-card">';
      html += '    <div>';
      html += '      <div><strong>' + escapeHtml(reg.name) + '</strong> &middot; <code style="font-size: 13px;">' + escapeHtml(reg.email) + '</code></div>';
      html += '      <p style="margin: var(--fb-space-1) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">Role: ' + escapeHtml(reg.selfRole || '—') + ' &middot; Submitted ' + window.fbRelativeTime(new Date(reg.requestedAt)) + '</p>';
      html += '    </div>';
      html += '    <div class="fb-row" style="gap: var(--fb-space-2);">';
      html += '      <a href="03-registration-approve.html?reg=' + encodeURIComponent(reg.id) + '" class="fb-btn fb-btn--success fb-btn--sm">Approve</a>';
      html += '      <a href="04-registration-reject.html?reg=' + encodeURIComponent(reg.id) + '" class="fb-btn fb-btn--danger fb-btn--sm">Reject</a>';
      html += '    </div>';
      html += '  </div>';
    });
    html += '</div>';
    root.innerHTML = html;
  }

  // Pending claims queue
  function renderPendingClaims(root) {
    if (!window.FB || !window.FB.state) return;
    var claims = window.FB.state.listClaims().filter(function (c) { return c.status === 'pending'; });
    // Group by reportId to identify competing cases.
    var reportToClaims = {};
    claims.forEach(function (c) { (reportToClaims[c.reportId] = reportToClaims[c.reportId] || []).push(c); });
    var sorted = claims.slice().sort(function (a, b) { return (a.createdAt < b.createdAt ? -1 : 1); });

    var html = '';
    html += '<div class="fb-row fb-row--between" style="margin-bottom: var(--fb-space-5); flex-wrap: wrap; gap: var(--fb-space-3);">';
    html += '  <h1 class="fb-h2">Pending claims</h1>';
    html += '  <p class="fb-helper">' + claims.length + ' awaiting decision' + '</p>';
    html += '</div>';

    if (!claims.length) {
      html += '<div class="fb-listings__empty"><strong>No pending claims.</strong><div>All caught up.</div></div>';
      root.innerHTML = html;
      return;
    }

    html += '<div class="fb-reviews-list">';
    sorted.forEach(function (claim) {
      var report = window.FB.state.getReport(claim.reportId);
      var claimant = window.FB.state.getUser(claim.claimantId);
      var siblings = reportToClaims[claim.reportId] || [];
      var isCompeting = siblings.length > 1;

      html += '  <div class="fb-review-card">';
      html += '    <div style="flex: 1; min-width: 0;">';
      html += '      <div style="display: flex; align-items: center; gap: var(--fb-space-2); flex-wrap: wrap;">';
      html += '        <strong>' + escapeHtml(report ? report.name : '?') + '</strong>';
      if (report) {
        html += '        <span class="fb-type-badge fb-type-badge--' + report.type + '">' + (report.type === 'lost' ? 'Lost' : 'Found') + '</span>';
        html += '        <span class="fb-status ' + statusBadgeClass(report.status) + '">' + statusLabel(report.status) + '</span>';
      }
      html += '      </div>';
      html += '      <p style="margin: var(--fb-space-1) 0 0; color: var(--fb-on-surface-variant); font-size: 13px;">Claimant: <strong>' + escapeHtml(claimant ? claimant.name : '—') + '</strong> &middot; Submitted ' + window.fbRelativeTime(new Date(claim.createdAt)) + '</p>';
      if (isCompeting) {
        html += '      <p style="margin: var(--fb-space-1) 0 0; font-size: 13px;"><span class="fb-status fb-status--report-claimrequested">⚠ ' + siblings.length + ' competing claims</span></p>';
      }
      html += '    </div>';
      html += '    <div class="fb-row" style="gap: var(--fb-space-2);">';
      if (isCompeting) {
        html += '      <a href="07-claim-review-competing.html?report=' + encodeURIComponent(claim.reportId) + '" class="fb-btn fb-btn--primary fb-btn--sm">Review competing</a>';
      } else {
        html += '      <a href="06-claim-review.html?claim=' + encodeURIComponent(claim.id) + '" class="fb-btn fb-btn--primary fb-btn--sm">Review</a>';
      }
      html += '    </div>';
      html += '  </div>';
    });
    html += '</div>';
    root.innerHTML = html;
  }

  // Single-claim review
  function renderClaimReview(root, claimId) {
    if (!window.FB || !window.FB.state) return;
    var claim = window.FB.state.getClaim(claimId);
    if (!claim) {
      root.innerHTML = '<div class="fb-listings__empty"><strong>Claim not found.</strong></div>';
      return;
    }
    var report = window.FB.state.getReport(claim.reportId);
    var reporter = window.FB.state.getUser(report ? report.reporterId : null);
    var claimant = window.FB.state.getUser(claim.claimantId);
    var siblings = window.FB.state.listPendingClaimsForReport(claim.reportId).filter(function (c) { return c.id !== claim.id; });
    var isCompeting = siblings.length > 0;

    var html = '';
    html += '<nav class="fb-helper" aria-label="Breadcrumb" style="margin-bottom: var(--fb-space-3);">';
    html += '  <a href="05-pending-claims.html">Pending claims</a> › <span aria-current="page">Claim on "' + escapeHtml(report ? report.name : '?') + '"</span>';
    html += '</nav>';

    html += '<div class="fb-row fb-row--between" style="margin-bottom: var(--fb-space-4); flex-wrap: wrap; gap: var(--fb-space-3);">';
    html += '  <h1 class="fb-h2" style="margin: 0;">Review claim</h1>';
    html += '  <span class="fb-status ' + statusBadgeClass(claim.status) + '">' + statusLabel(claim.status) + '</span>';
    html += '</div>';

    if (isCompeting) {
      html += '<div class="fb-alert" style="background: var(--fb-warning-soft); border-color: var(--fb-warning);" role="status">';
      html += '  <span aria-hidden="true">⚠</span>';
      html += '  <div><strong>' + siblings.length + ' other pending claim' + (siblings.length === 1 ? '' : 's') + ' on this item.</strong>';
      html += '  <p style="margin: var(--fb-space-1) 0 0; font-size: 14px;">Approving this claim will move the item to <strong>Claim Approved</strong> and automatically reject the other' + (siblings.length === 1 ? '' : 's') + '. <a href="07-claim-review-competing.html?report=' + encodeURIComponent(claim.reportId) + '">Review all competing claims</a>.</p>';
      html += '  </div>';
      html += '</div>';
    } else {
      html += '<div class="fb-alert fb-alert--info" role="status"><span aria-hidden="true">ℹ</span><div><strong>No competing claims.</strong> Approving will move the item to <strong>Claim Approved</strong>.</div></div>';
    }

    html += '<div class="fb-review-grid">';

    // Item details
    html += '  <div class="fb-card">';
    html += '    <h2 class="fb-detail__section-title" style="margin: 0 0 var(--fb-space-3);">Item details</h2>';
    html += '    <dl style="margin: 0;">';
    if (report) {
      html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Name</dt><dd style="margin: 2px 0 0;"><strong>' + escapeHtml(report.name) + '</strong></dd></div>';
      html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Type</dt><dd style="margin: 2px 0 0;"><span class="fb-type-badge fb-type-badge--' + report.type + '">' + (report.type === 'lost' ? 'Lost' : 'Found') + '</span></dd></div>';
      html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Location</dt><dd style="margin: 2px 0 0;">' + escapeHtml(report.campusArea) + (report.exactPlace ? ' &middot; ' + escapeHtml(report.exactPlace) : '') + '</dd></div>';
      html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Date</dt><dd style="margin: 2px 0 0;"><time>' + escapeHtml(window.fbFormatDate(report.date)) + '</time></dd></div>';
      html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Reporter</dt><dd style="margin: 2px 0 0;">' + escapeHtml(reporter ? reporter.name : '—') + '</dd></div>';
      html += '      <div><dt class="fb-caption">Description</dt><dd style="margin: 2px 0 0;">' + escapeHtml(report.description) + '</dd></div>';
    }
    html += '    </dl>';
    html += '  </div>';

    // Claim details
    html += '  <div class="fb-card">';
    html += '    <h2 class="fb-detail__section-title" style="margin: 0 0 var(--fb-space-3);">This claim</h2>';
    html += '    <dl style="margin: 0;">';
    html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Claimant</dt><dd style="margin: 2px 0 0;"><strong>' + escapeHtml(claimant ? claimant.name : '—') + '</strong></dd></div>';
    if (claimant) {
      html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Email</dt><dd style="margin: 2px 0 0;"><code style="font-size: 13px;">' + escapeHtml(claimant.email) + '</code></dd></div>';
    }
    html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Submitted</dt><dd style="margin: 2px 0 0;"><time>' + escapeHtml(window.fbFormatDate(claim.createdAt, 'datetime')) + '</time></dd></div>';
    html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Date lost (claimant says)</dt><dd style="margin: 2px 0 0;"><time>' + escapeHtml(window.fbFormatDate(claim.dateLost)) + '</time></dd></div>';
    html += '      <div style="margin-bottom: var(--fb-space-3);"><dt class="fb-caption">Reason</dt><dd style="margin: 2px 0 0;">' + escapeHtml(claim.reason) + '</dd></div>';
    html += '      <div><dt class="fb-caption">Identifying details</dt><dd style="margin: 2px 0 0;">' + escapeHtml(claim.identifyingDetails) + '</dd></div>';
    html += '    </dl>';
    html += '  </div>';

    html += '</div>';

    html += '<div class="fb-actions">';
    html += '  <a href="08-claim-reject.html?claim=' + encodeURIComponent(claim.id) + '" class="fb-btn fb-btn--danger">Reject this claim</a>';
    html += '  <a href="08-claim-approve.html?claim=' + encodeURIComponent(claim.id) + '" class="fb-btn fb-btn--success">Approve this claim</a>';
    html += '</div>';

    root.innerHTML = html;
  }

  // Competing claims list for one report
  function renderCompetingClaims(root, reportId) {
    if (!window.FB || !window.FB.state) return;
    var report = window.FB.state.getReport(reportId);
    if (!report) {
      root.innerHTML = '<div class="fb-listings__empty"><strong>Report not found.</strong></div>';
      return;
    }
    var claims = window.FB.state.listPendingClaimsForReport(reportId);
    var html = '';
    html += '<nav class="fb-helper" aria-label="Breadcrumb" style="margin-bottom: var(--fb-space-3);">';
    html += '  <a href="05-pending-claims.html">Pending claims</a> › <span aria-current="page">"' + escapeHtml(report.name) + '" — competing claims</span>';
    html += '</nav>';

    html += '<div class="fb-row fb-row--between" style="margin-bottom: var(--fb-space-5); flex-wrap: wrap; gap: var(--fb-space-3);">';
    html += '  <h1 class="fb-h2" style="margin: 0;">' + claims.length + ' competing claims</h1>';
    html += '  <span class="fb-status ' + statusBadgeClass(report.status) + '">' + statusLabel(report.status) + '</span>';
    html += '</div>';

    html += '<div class="fb-alert" style="background: var(--fb-warning-soft); border-color: var(--fb-warning); display: flex; gap: var(--fb-space-3); align-items: flex-start;" role="status">';
    html += '  <span aria-hidden="true" style="font-size: 24px;">⚠</span>';
    html += '  <div><strong>Only one claim can be approved per item.</strong>';
    html += '  <p style="margin: var(--fb-space-1) 0 0; font-size: 14px;">Approving one of these claims will automatically reject the rest. The item moves to <strong>Claim Approved</strong>.</p>';
    html += '  </div>';
    html += '</div>';

    html += '<h2 class="fb-h3" style="margin-bottom: var(--fb-space-3);">Item summary</h2>';
    html += '<div class="fb-card" style="margin-bottom: var(--fb-space-5);">';
    html += '  <p style="margin: 0;"><strong>' + escapeHtml(report.name) + '</strong> &middot; <span class="fb-type-badge fb-type-badge--' + report.type + '">' + (report.type === 'lost' ? 'Lost' : 'Found') + '</span> at ' + escapeHtml(report.campusArea) + ' &middot; ' + escapeHtml(window.fbFormatDate(report.date)) + '</p>';
    html += '</div>';

    html += '<h2 class="fb-h3" style="margin-bottom: var(--fb-space-3);">Pending claims</h2>';
    html += '<div class="fb-compete-list">';

    claims.forEach(function (claim) {
      var claimant = window.FB.state.getUser(claim.claimantId);
      html += '  <div class="fb-claim-card">';
      html += '    <div class="fb-claim-card__head">';
      html += '      <strong style="font-size: 17px;">' + escapeHtml(claimant ? claimant.name : '—') + '</strong>';
      html += '      <span class="fb-helper">' + escapeHtml(claim.id) + ' &middot; <time>' + escapeHtml(window.fbFormatDate(claim.createdAt, 'datetime')) + '</time></span>';
      html += '      <span class="fb-status ' + statusBadgeClass(claim.status) + '">' + statusLabel(claim.status) + '</span>';
      html += '    </div>';
      html += '    <p style="margin: var(--fb-space-2) 0;"><strong>Reason:</strong> ' + escapeHtml(claim.reason) + '</p>';
      html += '    <p style="margin: 0;"><strong>Identifying details:</strong> ' + escapeHtml(claim.identifyingDetails) + '</p>';
      html += '    <div class="fb-row" style="margin-top: var(--fb-space-4); gap: var(--fb-space-2);">';
      html += '      <a href="08-claim-approve.html?claim=' + encodeURIComponent(claim.id) + '" class="fb-btn fb-btn--success fb-btn--sm">Approve this claim</a>';
      html += '      <a href="08-claim-reject.html?claim=' + encodeURIComponent(claim.id) + '" class="fb-btn fb-btn--danger fb-btn--sm">Reject</a>';
      html += '    </div>';
      html += '  </div>';
    });
    html += '</div>';

    root.innerHTML = html;
  }

  // Items awaiting return queue
  function renderAwaitingReturn(root) {
    if (!window.FB || !window.FB.state) return;
    var reports = window.FB.state.listReports().filter(function (r) { return r.status === 'claimApproved'; });
    var html = '';
    html += '<div class="fb-row fb-row--between" style="margin-bottom: var(--fb-space-5); flex-wrap: wrap; gap: var(--fb-space-3);">';
    html += '  <h1 class="fb-h2">Items awaiting physical return</h1>';
    html += '  <p class="fb-helper">' + reports.length + ' approved claims ready for handoff</p>';
    html += '</div>';

    if (!reports.length) {
      html += '<div class="fb-listings__empty"><strong>No items awaiting return.</strong><div>Approve a claim to see it here.</div></div>';
      root.innerHTML = html;
      return;
    }

    html += '<table class="fb-table">';
    html += '  <thead><tr><th>Item</th><th>Approved claimant</th><th>Approved on</th><th>Waiting</th><th class="fb-table__actions"></th></tr></thead>';
    html += '  <tbody>';
    reports.forEach(function (r) {
      var claim = window.FB.state.listClaimsForReport(r.id).find(function (c) { return c.status === 'approved'; });
      var claimant = claim ? window.FB.state.getUser(claim.claimantId) : null;
      var waiting = claim ? window.fbRelativeTime(new Date(claim.reviewedAt || claim.createdAt)) : '—';
      html += '    <tr>';
      html += '      <td data-label="Item"><strong>' + escapeHtml(r.name) + '</strong></td>';
      html += '      <td data-label="Approved claimant">' + escapeHtml(claimant ? claimant.name : '—') + '</td>';
      html += '      <td data-label="Approved on"><time>' + escapeHtml(claim && claim.reviewedAt ? window.fbFormatDate(claim.reviewedAt, 'datetime') : '—') + '</time></td>';
      html += '      <td data-label="Waiting">' + waiting + '</td>';
      html += '      <td class="fb-table__actions"><a href="10-confirm-returned-default.html?report=' + encodeURIComponent(r.id) + '" class="fb-btn fb-btn--primary fb-btn--sm">Confirm returned</a></td>';
      html += '    </tr>';
    });
    html += '  </tbody>';
    html += '</table>';
    root.innerHTML = html;
  }

  // Audit trail
  function renderAuditTrail(root) {
    if (!window.FB || !window.FB.state) return;
    var rows = window.FB.state.listAudit();
    var html = '';
    html += '<div class="fb-row fb-row--between" style="margin-bottom: var(--fb-space-3); flex-wrap: wrap; gap: var(--fb-space-3);">';
    html += '  <div>';
    html += '    <h1 class="fb-h2" style="margin: 0;">Audit trail</h1>';
    html += '    <p class="fb-helper" style="margin: var(--fb-space-1) 0 0;">Append-only record of all administrative and lifecycle events.</p>';
    html += '  </div>';
    html += '  <p class="fb-helper">' + rows.length + ' event' + (rows.length === 1 ? '' : 's') + '</p>';
    html += '</div>';

    // Filters
    html += '<form class="fb-filters" aria-label="Filter audit events" onsubmit="event.preventDefault();" data-audit-filter>';
    html += '  <div><label class="fb-field__label" for="kw">Search</label><input class="fb-input" type="search" id="kw" name="kw" placeholder="Actor, target, action…"></div>';
    html += '  <div><label class="fb-field__label" for="evt">Event type</label><select class="fb-select" id="evt" name="evt"><option value="">All</option>';
    ['created', 'edited', 'withdrawn', 'closed', 'claim_submitted', 'claim_approved', 'claim_rejected', 'claim_auto_rejected', 'returned', 'message_posted'].forEach(function (a) {
      html += '<option>' + a + '</option>';
    });
    html += '</select></div>';
    html += '  <div><label class="fb-field__label" for="target">Target</label><select class="fb-select" id="target" name="target"><option value="">All</option><option>Reports</option><option>Claims</option><option>Accounts</option></select></div>';
    html += '</form>';

    html += '<div data-audit-table><div class="fb-listings__empty">Loading…</div></div>';

    root.innerHTML = html;

    function actionLabel(a) {
      return ({
        created: 'Report created', edited: 'Report edited', withdrawn: 'Report withdrawn', closed: 'Report closed',
        claim_submitted: 'Claim submitted', claim_approved: 'Claim approved', claim_rejected: 'Claim rejected', claim_auto_rejected: 'Claim auto-rejected',
        returned: 'Return confirmed', message_posted: 'Message posted'
      })[a] || a;
    }

    function renderTable(filtered) {
      var wrap = root.querySelector('[data-audit-table]');
      if (!filtered.length) {
        wrap.innerHTML = '<div class="fb-listings__empty">No events match your filter.</div>';
        return;
      }
      var h = '<table class="fb-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Notes</th></tr></thead><tbody>';
      filtered.forEach(function (e) {
        h += '<tr aria-label="At ' + escapeHtml(window.fbFormatDate(e.createdAt, 'datetime')) + ', ' + escapeHtml(e.actorName) + ' ' + actionLabel(e.action) + '">';
        h += '<td data-label="Timestamp"><time>' + escapeHtml(window.fbFormatDate(e.createdAt, 'datetime')) + '</time></td>';
        h += '<td data-label="Actor">' + escapeHtml(e.actorName) + '</td>';
        h += '<td data-label="Action">' + escapeHtml(actionLabel(e.action)) + '</td>';
        h += '<td data-label="Target">' + (e.reportId ? escapeHtml(e.reportId) : '—') + (e.claimId ? ' &middot; ' + escapeHtml(e.claimId) : '') + '</td>';
        h += '<td data-label="Notes">' + escapeHtml(e.detail || '') + '</td>';
        h += '</tr>';
      });
      h += '</tbody></table>';
      wrap.innerHTML = h;
    }

    function apply() {
      var kw = (root.querySelector('#kw').value || '').toLowerCase().trim();
      var evt = root.querySelector('#evt').value;
      var tgt = root.querySelector('#target').value;
      var filtered = rows.filter(function (e) {
        if (evt && e.action !== evt) return false;
        if (tgt === 'Reports' && !e.reportId) return false;
        if (tgt === 'Claims' && (!e.claimId && e.action.indexOf('claim_') !== 0 && e.action !== 'message_posted')) return false;
        if (tgt === 'Accounts' && e.action.indexOf('account') !== 0) return false; // placeholder
        if (kw) {
          var blob = ((e.actorName || '') + ' ' + (e.detail || '') + ' ' + (e.action || '') + ' ' + (e.reportId || '') + ' ' + (e.claimId || '')).toLowerCase();
          if (blob.indexOf(kw) === -1) return false;
        }
        return true;
      });
      renderTable(filtered);
    }

    root.querySelector('#kw').addEventListener('input', apply);
    root.querySelector('#evt').addEventListener('change', apply);
    root.querySelector('#target').addEventListener('change', apply);
    apply();
  }

  // Expose renderer helpers
  window.FB = window.FB || {};
  window.FB.adminRender = {
    dashboard: renderAdminDashboard,
    pendingRegistrations: renderPendingRegistrations,
    pendingClaims: renderPendingClaims,
    claimReview: renderClaimReview,
    competingClaims: renderCompetingClaims,
    awaitingReturn: renderAwaitingReturn,
    auditTrail: renderAuditTrail,
    statusBadgeClass: statusBadgeClass,
    statusLabel: statusLabel,
    escapeHtml: escapeHtml
  };
})();
