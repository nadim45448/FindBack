// ============================================================================
// FindBack Prototype — Shared Client-Side State Layer
// ----------------------------------------------------------------------------
// Single source of truth for the high-fidelity interactive prototype.
// Persists to localStorage under `findback.state.v1`. All HTML pages read and
// mutate state through this module. Personas, reports, claims, registrations,
// and audit events are simulated; the surface behavior matches the locked PRD,
// EXPERIENCE.md, and DESIGN.md.
//
// PROTOTYPE-ONLY. No real auth, no real backend, no real persistence beyond
// the browser's localStorage. Demo credentials are clearly labeled.
//
// State shape:
//   {
//     users: { [id]: { id, email, password, name, role, accountState,
//                      registeredAt, lastActiveAt, rejectedReason } },
//     registrations: [ { id, name, email, password, selfRole, requestedAt,
//                       reviewedAt, reviewedBy, decision, rejectionReason } ],
//     reports:   { [id]: { id, type, name, category, description, date,
//                          campusArea, exactPlace, identifyingDetails,
//                          imageDataUrl?, reporterId, status, createdAt,
//                          updatedAt, closedAt, returnedAt, returnedBy,
//                          receiver, substituteReceiver } },
//     claims:    { [id]: { id, reportId, claimantId, reason,
//                          identifyingDetails, dateLost, status, createdAt,
//                          reviewedAt, reviewedBy, decisionReason,
//                          autoRejected } },
//     threads:   { [claimId]: [ { id, authorId, authorName, body, createdAt } ] },
//     audit:     [ { id, reportId, claimId?, actorId, actorName, action,
//                    detail, createdAt } ],
//     session:   { userId, since } | null,
//     meta:      { seededAt, version }
//   }
// ============================================================================
(function () {
  'use strict';

  const STORAGE_KEY = 'findback.state.v1';
  const SCHEMA_VERSION = 1;

  // ---------- ID + time helpers ----------
  const newId = (prefix) => prefix + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const now = () => new Date().toISOString();
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const hoursAgo = (n) => new Date(Date.now() - n * 3600000).toISOString();
  const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();

  // ---------- Categories (PRD FR-8) ----------
  const CATEGORIES = [
    'Electronics', 'Wallets & purses', 'Bags & backpacks', 'Keys',
    'Clothing & accessories', 'Documents & IDs', 'Books & stationery',
    'Eyewear', 'Jewelry', 'Sports equipment', 'Other'
  ];
  const CAMPUS_AREAS = [
    'Main Library', 'Student Center', 'Cafeteria', 'Engineering Building',
    'Science Center', 'Gymnasium', 'Dormitory — North', 'Dormitory — South',
    'Lecture Hall A', 'Lecture Hall B', 'Outdoor Quad', 'Parking Lot 3'
  ];
  const SELF_ROLES = ['Student', 'Employee', 'Visitor', 'Other'];
  const RELATIONSHIPS = ['Friend', 'Family Member', 'Colleague', 'Classmate', 'Other'];

  // ---------- Seed data ----------
  function seedUsers() {
    return {
      u_maya:   { id: 'u_maya',   email: 'maya.chen@example.org',   password: 'demo1234',
                 name: 'Maya Chen',  role: 'member', accountState: 'active',
                 registeredAt: daysAgo(120), lastActiveAt: minutesAgo(8) },
      u_sam:    { id: 'u_sam',    email: 'sam.patel@example.org',   password: 'demo1234',
                 name: 'Sam Patel',  role: 'member', accountState: 'active',
                 registeredAt: daysAgo(95),  lastActiveAt: hoursAgo(2) },
      u_jordan: { id: 'u_jordan', email: 'jordan.lee@example.org',  password: 'demo1234',
                 name: 'Jordan Lee', role: 'member', accountState: 'rejected',
                 registeredAt: daysAgo(40), lastActiveAt: null,
                 rejectedReason: 'Not affiliated with the organization.' },
      u_priya:  { id: 'u_priya',  email: 'priya.kapoor@example.org', password: 'demo1234',
                 name: 'Priya Kapoor', role: 'member', accountState: 'deactivated',
                 registeredAt: daysAgo(220), lastActiveAt: daysAgo(60),
                 rejectedReason: 'Account deactivated by administrator.' },
      u_alex:   { id: 'u_alex',   email: 'alex.rivera@example.org',  password: 'demo1234',
                 name: 'Alex Rivera', role: 'member', accountState: 'pending',
                 registeredAt: daysAgo(2),  lastActiveAt: null },
      u_riley:  { id: 'u_riley',  email: 'riley.park@example.org',   password: 'demo1234',
                 name: 'Riley Park', role: 'administrator', accountState: 'active',
                 registeredAt: daysAgo(540), lastActiveAt: minutesAgo(1) }
    };
  }

  function seedRegistrations(users) {
    return [
      { id: 'reg_chen',  name: 'Chen Wei',     email: 'chen.wei@example.org',
        password: 'demo1234', selfRole: 'Student',  requestedAt: daysAgo(1),
        reviewedAt: null, reviewedBy: null, decision: null, rejectionReason: null },
      { id: 'reg_okafor',name: 'Ada Okafor',   email: 'ada.okafor@example.org',
        password: 'demo1234', selfRole: 'Employee', requestedAt: hoursAgo(20),
        reviewedAt: null, reviewedBy: null, decision: null, rejectionReason: null },
      { id: 'reg_das',   name: 'Rohan Das',    email: 'rohan.das@example.org',
        password: 'demo1234', selfRole: 'Student',  requestedAt: hoursAgo(6),
        reviewedAt: null, reviewedBy: null, decision: null, rejectionReason: null }
    ];
  }

  function seedReports() {
    // Build reports spanning the lifecycle.
    const r = {};
    const add = (rec) => { r[rec.id] = rec; };

    add({
      id: 'rpt_wallet_lost', type: 'lost', name: 'Brown leather wallet',
      category: 'Wallets & purses',
      description: 'Brown leather bifold wallet, zip closure. Contains my student ID and a folded photo of my dog.',
      date: daysAgo(8), campusArea: 'Main Library',
      exactPlace: '2nd floor, behind the periodicals shelf.',
      identifyingDetails: 'Small scratch on the back near the corner. A red metro card inside the inner pocket.',
      reporterId: 'u_maya', status: 'open',
      createdAt: daysAgo(8), updatedAt: daysAgo(8),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    add({
      id: 'rpt_wallet_found', type: 'found', name: 'Brown leather wallet',
      category: 'Wallets & purses',
      description: 'Brown leather wallet turned in to the security desk. Contains a metro card and a folded photo.',
      date: daysAgo(6), campusArea: 'Student Center',
      exactPlace: 'Security desk, drawer 3.',
      identifyingDetails: 'Photo inside appears to be a small dog.',
      reporterId: 'u_sam', status: 'claimRequested',
      createdAt: daysAgo(6), updatedAt: hoursAgo(3),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    add({
      id: 'rpt_phone_found', type: 'found', name: 'Black iPhone 14',
      category: 'Electronics',
      description: 'Black iPhone 14 in a clear case, screen intact. Found on a cafeteria table.',
      date: daysAgo(2), campusArea: 'Cafeteria',
      exactPlace: 'Cafeteria, table 7 near the south windows.',
      identifyingDetails: 'Lock screen is a small orange cat. Minor scratch on the lower-right corner.',
      reporterId: 'u_sam', status: 'claimRequested',
      createdAt: daysAgo(2), updatedAt: hoursAgo(10),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    add({
      id: 'rpt_keys_lost', type: 'lost', name: 'Set of keys with red lanyard',
      category: 'Keys',
      description: 'Four keys on a metal ring with a red Braves lanyard. One Yale-style key for a bike lock.',
      date: daysAgo(1), campusArea: 'Engineering Building',
      exactPlace: 'Second floor bathroom sink.',
      identifyingDetails: 'A small silver baseball charm on the keyring.',
      reporterId: 'u_maya', status: 'open',
      createdAt: daysAgo(1), updatedAt: daysAgo(1),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    add({
      id: 'rpt_backpack_found', type: 'found', name: 'Black backpack — North Face',
      category: 'Bags & backpacks',
      description: 'Black North Face backpack with red interior lining. Found tucked behind a study carrel.',
      date: daysAgo(3), campusArea: 'Main Library',
      exactPlace: 'Study carrel 4C, second floor quiet zone.',
      identifyingDetails: 'A small "Field Notes" sticker on the front pocket, and a frayed right shoulder strap.',
      reporterId: 'u_sam', status: 'open',
      createdAt: daysAgo(3), updatedAt: daysAgo(3),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    add({
      id: 'rpt_scarf_found', type: 'found', name: 'Wool scarf — burnt orange',
      category: 'Clothing & accessories',
      description: 'Long wool scarf, burnt orange, hand-knit. Found draped over a bench.',
      date: daysAgo(9), campusArea: 'Outdoor Quad',
      exactPlace: 'Bench near the oak tree by the south walkway.',
      identifyingDetails: 'A small loose thread near the fringe on one end.',
      reporterId: 'u_sam', status: 'open',
      createdAt: daysAgo(9), updatedAt: daysAgo(9),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    add({
      id: 'rpt_charger_approved', type: 'found', name: 'USB-C charger, white',
      category: 'Electronics',
      description: 'White 2m USB-C charging cable, no adapter. Left in a study room.',
      date: daysAgo(4), campusArea: 'Main Library',
      exactPlace: 'Study room 3B, on the long table.',
      identifyingDetails: 'A small kink about 30cm from the C-connector.',
      reporterId: 'u_sam', status: 'claimApproved',
      createdAt: daysAgo(4), updatedAt: hoursAgo(28),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    add({
      id: 'rpt_textbook_returned', type: 'found', name: 'Calculus textbook (Stewart, 8e)',
      category: 'Books & stationery',
      description: 'Hardcover calculus textbook with a name on the inside cover. Left in a lecture hall.',
      date: daysAgo(14), campusArea: 'Lecture Hall A',
      exactPlace: 'Row 4, seat 12.',
      identifyingDetails: 'Highlighting on chapter 3, page 188.',
      reporterId: 'u_sam', status: 'returned',
      createdAt: daysAgo(14), updatedAt: daysAgo(10),
      closedAt: null, returnedAt: daysAgo(10), returnedBy: 'u_riley',
      receiver: { type: 'default', name: 'Maya Chen' },
      substituteReceiver: null
    });

    add({
      id: 'rpt_umbrella_closed', type: 'lost', name: 'Compact umbrella — navy',
      category: 'Other',
      description: 'Navy compact umbrella, manual open, wooden handle. Possibly left behind at the dorm entrance.',
      date: daysAgo(30), campusArea: 'Dormitory — North',
      exactPlace: 'Lobby coat rack by the mailboxes.',
      identifyingDetails: 'Small tear on one panel near the top.',
      reporterId: 'u_maya', status: 'closed',
      createdAt: daysAgo(30), updatedAt: daysAgo(25),
      closedAt: daysAgo(25), returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    });

    return r;
  }

  function seedClaims() {
    return {
      clm_wallet_maya: {
        id: 'clm_wallet_maya', reportId: 'rpt_wallet_found', claimantId: 'u_maya',
        reason: 'This is my wallet — I lost it in the library last week. The metro card inside belongs to me and the photo is of my dog Mochi.',
        identifyingDetails: 'There is a small scratch on the back, and a folded metro card in the inner pocket.',
        dateLost: daysAgo(8),
        status: 'pending', createdAt: hoursAgo(3),
        reviewedAt: null, reviewedBy: null, decisionReason: null, autoRejected: false
      },
      clm_phone_alex: {
        id: 'clm_phone_alex', reportId: 'rpt_phone_found', claimantId: 'u_maya',
        reason: 'I left my phone at the cafeteria yesterday. The lock screen is my cat, Mango.',
        identifyingDetails: 'The case is clear, and there is a small scratch on the lower-right corner of the screen.',
        dateLost: daysAgo(2),
        status: 'pending', createdAt: hoursAgo(10),
        reviewedAt: null, reviewedBy: null, decisionReason: null, autoRejected: false
      },
      clm_phone_competing: {
        id: 'clm_phone_competing', reportId: 'rpt_phone_found', claimantId: 'u_sam',
        reason: 'I think this might be my roommate\'s phone. She lost it at lunch.',
        identifyingDetails: 'It has a small orange cat as the lock screen wallpaper, I think.',
        dateLost: daysAgo(2),
        status: 'pending', createdAt: hoursAgo(8),
        reviewedAt: null, reviewedBy: null, decisionReason: null, autoRejected: false
      },
      clm_charger_approved: {
        id: 'clm_charger_approved', reportId: 'rpt_charger_approved', claimantId: 'u_maya',
        reason: 'I left a USB-C charger in the library study room. It has a kink about 30cm from the connector end.',
        identifyingDetails: 'White cable, manual kink near the C-end, no adapter.',
        dateLost: daysAgo(4),
        status: 'approved', createdAt: hoursAgo(30),
        reviewedAt: hoursAgo(28), reviewedBy: 'u_riley',
        decisionReason: null, autoRejected: false
      },
      clm_textbook_returned: {
        id: 'clm_textbook_returned', reportId: 'rpt_textbook_returned', claimantId: 'u_maya',
        reason: 'That is my calculus textbook — my name is on the inside cover.',
        identifyingDetails: 'I have a highlight on chapter 3, page 188.',
        dateLost: daysAgo(14),
        status: 'approved', createdAt: daysAgo(11),
        reviewedAt: daysAgo(10), reviewedBy: 'u_riley',
        decisionReason: null, autoRejected: false
      },
      clm_wallet_rejected: {
        id: 'clm_wallet_rejected', reportId: 'rpt_scarf_found', claimantId: 'u_maya',
        reason: 'I think this is my scarf — I lost one that looked just like it.',
        identifyingDetails: 'It was burnt orange and hand-knit.',
        dateLost: daysAgo(10),
        status: 'rejected', createdAt: daysAgo(8),
        reviewedAt: daysAgo(7), reviewedBy: 'u_riley',
        decisionReason: 'Description does not match the registered item details. Please contact the administrator if you believe this is an error.',
        autoRejected: false
      }
    };
  }

  function seedThreads() {
    return {
      clm_wallet_maya: [
        { id: 'msg_1', authorId: 'u_maya', authorName: 'Maya Chen', body: 'Hi Sam — I think the wallet you turned in might be mine. Could you check inside the inner pocket for a folded metro card?', createdAt: hoursAgo(3) },
        { id: 'msg_2', authorId: 'u_sam',  authorName: 'Sam Patel', body: 'Hi Maya — yes, there is a metro card. I left it at the security desk and added it to the report.', createdAt: hoursAgo(2) }
      ],
      clm_phone_alex: [
        { id: 'msg_phone_1', authorId: 'u_maya',  authorName: 'Maya Chen', body: 'The lock screen is my cat Mango. I can describe him if it helps.', createdAt: hoursAgo(9) }
      ]
    };
  }

  function seedAudit() {
    return [
      { id: 'aud_1',  reportId: 'rpt_wallet_lost',     actorId: 'u_maya',   actorName: 'Maya Chen',  action: 'created',  detail: 'Report created',                          createdAt: daysAgo(8) },
      { id: 'aud_2',  reportId: 'rpt_wallet_found',    actorId: 'u_sam',    actorName: 'Sam Patel',  action: 'created',  detail: 'Report created',                          createdAt: daysAgo(6) },
      { id: 'aud_3',  reportId: 'rpt_wallet_found',    claimId: 'clm_wallet_maya', actorId: 'u_maya',   actorName: 'Maya Chen',  action: 'claim_submitted', detail: 'Claim submitted', createdAt: hoursAgo(3) },
      { id: 'aud_4',  reportId: 'rpt_phone_found',     actorId: 'u_sam',    actorName: 'Sam Patel',  action: 'created',  detail: 'Report created',                          createdAt: daysAgo(2) },
      { id: 'aud_5',  reportId: 'rpt_phone_found',     claimId: 'clm_phone_alex',  actorId: 'u_maya',   actorName: 'Maya Chen',  action: 'claim_submitted', detail: 'Claim submitted', createdAt: hoursAgo(10) },
      { id: 'aud_6',  reportId: 'rpt_phone_found',     claimId: 'clm_phone_competing', actorId: 'u_sam', actorName: 'Sam Patel',  action: 'claim_submitted', detail: 'Claim submitted', createdAt: hoursAgo(8) },
      { id: 'aud_7',  reportId: 'rpt_charger_approved',actorId: 'u_sam',    actorName: 'Sam Patel',  action: 'created',  detail: 'Report created',                          createdAt: daysAgo(4) },
      { id: 'aud_8',  reportId: 'rpt_charger_approved',claimId: 'clm_charger_approved', actorId: 'u_maya', actorName: 'Maya Chen',  action: 'claim_submitted', detail: 'Claim submitted', createdAt: hoursAgo(30) },
      { id: 'aud_9',  reportId: 'rpt_charger_approved',claimId: 'clm_charger_approved', actorId: 'u_riley', actorName: 'Riley Park', action: 'claim_approved', detail: 'Claim approved by administrator', createdAt: hoursAgo(28) },
      { id: 'aud_10', reportId: 'rpt_textbook_returned',actorId: 'u_sam',   actorName: 'Sam Patel',  action: 'created',  detail: 'Report created',                          createdAt: daysAgo(14) },
      { id: 'aud_11', reportId: 'rpt_textbook_returned',claimId: 'clm_textbook_returned', actorId: 'u_maya', actorName: 'Maya Chen', action: 'claim_submitted', detail: 'Claim submitted', createdAt: daysAgo(11) },
      { id: 'aud_12', reportId: 'rpt_textbook_returned',claimId: 'clm_textbook_returned', actorId: 'u_riley', actorName: 'Riley Park', action: 'claim_approved', detail: 'Claim approved', createdAt: daysAgo(10) },
      { id: 'aud_13', reportId: 'rpt_textbook_returned',actorId: 'u_riley',  actorName: 'Riley Park', action: 'returned', detail: 'Returned to Maya Chen (default receiver)', createdAt: daysAgo(10) },
      { id: 'aud_14', reportId: 'rpt_scarf_found',    claimId: 'clm_wallet_rejected', actorId: 'u_maya', actorName: 'Maya Chen', action: 'claim_submitted', detail: 'Claim submitted', createdAt: daysAgo(8) },
      { id: 'aud_15', reportId: 'rpt_scarf_found',    claimId: 'clm_wallet_rejected', actorId: 'u_riley', actorName: 'Riley Park', action: 'claim_rejected', detail: 'Claim rejected', createdAt: daysAgo(7) },
      { id: 'aud_16', reportId: 'rpt_umbrella_closed', actorId: 'u_maya',   actorName: 'Maya Chen',  action: 'created',  detail: 'Report created',                          createdAt: daysAgo(30) },
      { id: 'aud_17', reportId: 'rpt_umbrella_closed', actorId: 'u_riley', actorName: 'Riley Park', action: 'closed',   detail: 'Report closed by administrator',          createdAt: daysAgo(25) },
      { id: 'aud_18', reportId: 'rpt_backpack_found', actorId: 'u_sam', actorName: 'Sam Patel', action: 'created', detail: 'Report created (Active Member claim-flow demo)',          createdAt: daysAgo(3) }
    ];
  }

  // ---------- Initial state ----------
  function makeSeed() {
    const users = seedUsers();
    const registrations = seedRegistrations(users);
    // Mirror the runtime registerAccount() pattern for seeded registrations so
    // that admin approve/reject flips a real user record's accountState.
    registrations.forEach((reg) => {
      const id = 'u_' + reg.id.replace(/^reg_/, '');
      if (!users[id]) {
        users[id] = {
          id, email: reg.email, password: reg.password, name: reg.name,
          role: 'member', accountState: 'pending',
          registeredAt: reg.requestedAt, lastActiveAt: null
        };
      }
    });
    return {
      users,
      registrations,
      reports: seedReports(),
      claims: seedClaims(),
      threads: seedThreads(),
      audit: seedAudit(),
      session: null,
      meta: { seededAt: now(), version: SCHEMA_VERSION }
    };
  }

  // ---------- Persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const fresh = makeSeed();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh;
      }
      const parsed = JSON.parse(raw);
      if (!parsed.meta || parsed.meta.version !== SCHEMA_VERSION) {
        const fresh = makeSeed();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        return fresh;
      }
      return parsed;
    } catch (e) {
      // Storage unavailable — use ephemeral in-memory state.
      return makeSeed();
    }
  }

  function save(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* ignore quota errors in prototype */ }
  }

  // ---------- Public API ----------
  const state = load();

  function getState() { return state; }

  // Session
  function getSession() { return state.session; }
  function getCurrentUser() {
    if (!state.session) return null;
    return state.users[state.session.userId] || null;
  }
  function login(email, password) {
    const user = Object.values(state.users).find(
      (u) => u.email.toLowerCase() === String(email).toLowerCase().trim() && u.password === password
    );
    if (!user) return { ok: false, reason: 'invalid_credentials' };
    if (user.accountState === 'pending')     return { ok: false, reason: 'pending',     user };
    if (user.accountState === 'rejected')    return { ok: false, reason: 'rejected',    user };
    if (user.accountState === 'deactivated') return { ok: false, reason: 'deactivated', user };
    user.lastActiveAt = now();
    state.session = { userId: user.id, since: now() };
    save(state);
    return { ok: true, user };
  }
  function logout() {
    state.session = null;
    save(state);
  }

  // Users
  function getUser(id) { return state.users[id] || null; }
  function listUsers() { return Object.values(state.users); }

  // Registrations
  function listRegistrations() {
    return state.registrations.slice().sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1));
  }
  function approveRegistration(regId, adminId) {
    const reg = state.registrations.find((r) => r.id === regId);
    if (!reg || reg.decision) return null;
    reg.decision = 'approved';
    reg.reviewedAt = now();
    reg.reviewedBy = adminId;
    // Promote to active user.
    const newUser = {
      id: 'u_' + reg.id.replace(/^reg_/, ''),
      email: reg.email, password: reg.password, name: reg.name,
      role: 'member', accountState: 'active',
      registeredAt: reg.requestedAt, lastActiveAt: now()
    };
    state.users[newUser.id] = newUser;
    state.registrations = state.registrations.filter((r) => r.id !== regId);
    addAudit({
      actorId: adminId, action: 'account_approved',
      detail: 'Approved registration for ' + reg.email
    });
    save(state);
    return newUser;
  }
  function rejectRegistration(regId, adminId, reason) {
    const reg = state.registrations.find((r) => r.id === regId);
    if (!reg || reg.decision) return null;
    reg.decision = 'rejected';
    reg.reviewedAt = now();
    reg.reviewedBy = adminId;
    reg.rejectionReason = reason;
    // Find the pending user created at register-time and flip to rejected
    // so the login attempt surfaces the correct blocked state.
    const pendingId = 'u_' + reg.id.replace(/^reg_/, '');
    if (state.users[pendingId] && state.users[pendingId].accountState === 'pending') {
      state.users[pendingId].accountState = 'rejected';
      state.users[pendingId].rejectedReason = reason;
    }
    addAudit({
      actorId: adminId, action: 'account_rejected',
      detail: 'Rejected registration for ' + reg.email + (reason ? ' — reason: ' + reason : '')
    });
    save(state);
    return reg;
  }
  function registerAccount({ name, email, password, selfRole }) {
    // Reject duplicates within users.
    if (Object.values(state.users).some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, reason: 'duplicate' };
    }
    const reg = {
      id: 'reg_' + Math.random().toString(36).slice(2, 9),
      name, email, password, selfRole,
      requestedAt: now(),
      reviewedAt: null, reviewedBy: null, decision: null, rejectionReason: null
    };
    state.registrations.push(reg);
    // Also seed a "pending" user record so the login can show the right state.
    const pendingUserId = 'u_' + reg.id.replace(/^reg_/, '');
    state.users[pendingUserId] = {
      id: pendingUserId, email, password, name,
      role: 'member', accountState: 'pending',
      registeredAt: reg.requestedAt, lastActiveAt: null
    };
    save(state);
    return { ok: true, reg, userId: pendingUserId };
  }

  // Reports
  function listReports() { return Object.values(state.reports); }
  function getReport(id) { return state.reports[id] || null; }
  function listReportsForUser(userId) {
    return listReports().filter((r) => r.reporterId === userId);
  }
  function createReport(input, actorId) {
    const id = 'rpt_' + Math.random().toString(36).slice(2, 9);
    const r = {
      id, type: input.type, name: input.name.trim(),
      category: input.category, description: input.description.trim(),
      date: input.date, campusArea: input.campusArea,
      exactPlace: (input.exactPlace || '').trim(),
      identifyingDetails: (input.identifyingDetails || '').trim(),
      imageDataUrl: input.imageDataUrl || null,
      reporterId: actorId, status: 'open',
      createdAt: now(), updatedAt: now(),
      closedAt: null, returnedAt: null, returnedBy: null,
      receiver: null, substituteReceiver: null
    };
    state.reports[id] = r;
    addAudit({ reportId: id, actorId, action: 'created', detail: 'Report created' });
    return r;
  }
  function updateReport(id, patch, actorId) {
    const r = state.reports[id];
    if (!r) return null;
    const allowed = ['name', 'category', 'description', 'date', 'campusArea', 'exactPlace', 'identifyingDetails'];
    allowed.forEach((k) => { if (k in patch) r[k] = patch[k]; });
    r.updatedAt = now();
    addAudit({ reportId: id, actorId, action: 'edited', detail: 'Report edited' });
    return r;
  }
  function withdrawReport(id, actorId) {
    const r = state.reports[id];
    if (!r) return null;
    r.status = 'closed';
    r.closedAt = now();
    r.updatedAt = now();
    addAudit({ reportId: id, actorId, action: 'withdrawn', detail: 'Report withdrawn by reporter' });
    return r;
  }
  function deleteReport(id, actorId) {
    const r = state.reports[id];
    if (!r) return null;
    delete state.reports[id];
    addAudit({ reportId: id, actorId, action: 'deleted', detail: 'Report deleted' });
    return r;
  }
  function closeReport(id, actorId) {
    const r = state.reports[id];
    if (!r) return null;
    r.status = 'closed';
    r.closedAt = now();
    r.updatedAt = now();
    addAudit({ reportId: id, actorId, action: 'closed', detail: 'Report closed by administrator' });
    return r;
  }
  function confirmReturned(reportId, adminId, receiverPayload) {
    const r = state.reports[reportId];
    if (!r) return null;
    r.status = 'returned';
    r.returnedAt = now();
    r.returnedBy = adminId;
    r.updatedAt = now();
    r.receiver = { type: receiverPayload.type, name: receiverPayload.name };
    r.substituteReceiver = receiverPayload.substitute || null;
    const detail = receiverPayload.type === 'substitute'
      ? 'Returned to substitute receiver: ' + receiverPayload.name + ' (' + (receiverPayload.substitute.relationship) + ')'
      : 'Returned to ' + receiverPayload.name + ' (default receiver)';
    addAudit({ reportId, actorId: adminId, action: 'returned', detail });
    return r;
  }

  // Claims
  function listClaims() { return Object.values(state.claims); }
  function getClaim(id) { return state.claims[id] || null; }
  function listClaimsForUser(userId) {
    return listClaims().filter((c) => c.claimantId === userId);
  }
  function listClaimsForReport(reportId) {
    return listClaims().filter((c) => c.reportId === reportId);
  }
  function listPendingClaimsForReport(reportId) {
    return listClaimsForReport(reportId).filter((c) => c.status === 'pending');
  }
  function submitClaim(input, claimantId) {
    const claimant = state.users[claimantId];
    if (!claimant || claimant.role !== 'member' || claimant.accountState !== 'active') return null;
    const r = state.reports[input.reportId];
    if (!r) return null;
    // Eligibility (PRD FR-15; EXPERIENCE.md §700):
    // - Item is a Found item.
    // - Item status is Open or ClaimRequested.
    // - Claimant is not the reporter.
    // - Claimant has no Pending claim on this item already.
    if (r.type !== 'found') return null;
    if (r.status !== 'open' && r.status !== 'claimRequested') return null;
    if (r.reporterId === claimantId) return null;
    const existingPending = listClaimsForReport(r.id).find(
      (c) => c.claimantId === claimantId && c.status === 'pending'
    );
    if (existingPending) return null;

    const id = 'clm_' + Math.random().toString(36).slice(2, 9);
    const claim = {
      id, reportId: input.reportId, claimantId,
      reason: input.reason.trim(),
      identifyingDetails: input.identifyingDetails.trim(),
      dateLost: input.dateLost,
      status: 'pending', createdAt: now(),
      reviewedAt: null, reviewedBy: null, decisionReason: null, autoRejected: false
    };
    state.claims[id] = claim;
    // Transition report to claimRequested if it was open.
    if (r.status === 'open') {
      r.status = 'claimRequested';
      r.updatedAt = now();
    }
    addAudit({
      reportId: input.reportId, claimId: id, actorId: claimantId,
      action: 'claim_submitted', detail: 'Claim submitted'
    });
    return claim;
  }
  function approveClaim(claimId, adminId) {
    const claim = state.claims[claimId];
    if (!claim) return null;
    const competitors = listPendingClaimsForReport(claim.reportId).filter((c) => c.id !== claimId);
    claim.status = 'approved';
    claim.reviewedAt = now();
    claim.reviewedBy = adminId;
    const r = state.reports[claim.reportId];
    if (r) {
      r.status = 'claimApproved';
      r.updatedAt = now();
    }
    addAudit({
      reportId: claim.reportId, claimId, actorId: adminId,
      action: 'claim_approved', detail: 'Claim approved by administrator'
    });
    competitors.forEach((c) => {
      c.status = 'rejected';
      c.reviewedAt = now();
      c.reviewedBy = adminId;
      c.autoRejected = true;
      c.decisionReason = 'Another claim was approved for this item.';
      addAudit({
        reportId: c.reportId, claimId: c.id, actorId: adminId,
        action: 'claim_auto_rejected',
        detail: 'Another claim was approved for this item.'
      });
    });
    return { claim, autoRejected: competitors };
  }
  function rejectClaim(claimId, adminId, reason) {
    const claim = state.claims[claimId];
    if (!claim) return null;
    claim.status = 'rejected';
    claim.reviewedAt = now();
    claim.reviewedBy = adminId;
    claim.decisionReason = reason;
    // If no other pending claims remain on the report, return to Open.
    const stillPending = listPendingClaimsForReport(claim.reportId);
    const r = state.reports[claim.reportId];
    if (r && stillPending.length === 0 && r.status === 'claimRequested') {
      r.status = 'open';
      r.updatedAt = now();
    }
    addAudit({
      reportId: claim.reportId, claimId, actorId: adminId,
      action: 'claim_rejected', detail: 'Claim rejected by administrator'
    });
    return claim;
  }

  // Threads
  function getThread(claimId) { return state.threads[claimId] || []; }
  // Read-only lifecycle (PRD FR-26; EXPERIENCE.md §13.5; Pass-3 decision).
  // Thread is locked as soon as the claim is Approved (no need to wait for
  // the physical return), when the claim is Rejected, or when the report
  // is closed/returned. UI must mirror this rule.
  function isThreadReadOnly(claimId) {
    const claim = state.claims[claimId];
    if (!claim) return true;
    if (claim.status === 'approved') return true;
    if (claim.status === 'rejected') return true;
    const r = state.reports[claim.reportId];
    if (r && (r.status === 'returned' || r.status === 'closed')) return true;
    return false;
  }
  function getThreadLockReason(claimId) {
    const claim = state.claims[claimId];
    if (!claim) return 'not_found';
    // Report-level reasons take priority so the message stays accurate as
    // the item moves through the lifecycle (Returned supersedes Approved;
    // Closed supersedes Approved/Rejected).
    const r = state.reports[claim.reportId];
    if (r && r.status === 'returned') return 'returned';
    if (r && r.status === 'closed') return 'closed';
    if (claim.status === 'approved') return 'approved';
    if (claim.status === 'rejected') return 'rejected';
    return null;
  }
  function postMessage(claimId, authorId, body) {
    const trimmed = String(body || '').trim();
    if (!trimmed) return null;
    // Enforce read-only lifecycle at the state layer — bypass-resistant.
    if (isThreadReadOnly(claimId)) return null;
    const author = state.users[authorId];
    const message = {
      id: 'msg_' + Math.random().toString(36).slice(2, 9),
      authorId, authorName: author ? author.name : 'Unknown',
      body: trimmed, createdAt: now()
    };
    if (!state.threads[claimId]) state.threads[claimId] = [];
    state.threads[claimId].push(message);
    addAudit({
      reportId: null, claimId, actorId: authorId,
      action: 'message_posted', detail: 'Message posted in thread'
    });
    return message;
  }

  // Audit
  function addAudit({ reportId, claimId, actorId, action, detail }) {
    const actor = state.users[actorId];
    state.audit.push({
      id: 'aud_' + Math.random().toString(36).slice(2, 9),
      reportId: reportId || null,
      claimId: claimId || null,
      actorId: actorId || null,
      actorName: actor ? actor.name : 'System',
      action, detail: detail || '',
      createdAt: now()
    });
    // Keep audit bounded for prototype performance.
    if (state.audit.length > 500) state.audit = state.audit.slice(-500);
    save(state);
  }
  function listAudit({ reportId, limit } = {}) {
    let rows = state.audit.slice();
    if (reportId) rows = rows.filter((a) => a.reportId === reportId);
    rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    if (limit) rows = rows.slice(0, limit);
    return rows;
  }

  // Reset
  function reset() {
    state.session = null;
    const fresh = makeSeed();
    state.users = fresh.users;
    state.registrations = fresh.registrations;
    state.reports = fresh.reports;
    state.claims = fresh.claims;
    state.threads = fresh.threads;
    state.audit = fresh.audit;
    state.meta = fresh.meta;
    save(state);
    return state;
  }

  // ---------- Convenience: derived data ----------
  function getDashboardStats(userId) {
    const reports = listReportsForUser(userId);
    const claims = listClaimsForUser(userId);
    return {
      openReports: reports.filter((r) => r.status === 'open').length,
      pendingClaims: claims.filter((c) => c.status === 'pending').length,
      approvedClaims: claims.filter((c) => c.status === 'approved').length,
      returnedItems: reports.filter((r) => r.status === 'returned').length
    };
  }
  function getAdminStats() {
    return {
      pendingRegistrations: state.registrations.filter((r) => !r.decision).length,
      pendingClaims: listClaims().filter((c) => c.status === 'pending').length,
      awaitingReturn: listReports().filter((r) => r.status === 'claimApproved').length
    };
  }

  // Expose globally.
  window.FB = window.FB || {};
  window.FB.state = {
    // raw
    getState,
    // session
    getSession, getCurrentUser, login, logout,
    // users
    getUser, listUsers,
    // registrations
    listRegistrations, approveRegistration, rejectRegistration, registerAccount,
    // reports
    listReports, getReport, listReportsForUser,
    createReport, updateReport, withdrawReport, deleteReport, closeReport, confirmReturned,
    // claims
    listClaims, getClaim, listClaimsForUser, listClaimsForReport, listPendingClaimsForReport,
    submitClaim, approveClaim, rejectClaim,
    // threads
    getThread, postMessage, isThreadReadOnly, getThreadLockReason,
    // audit
    listAudit, addAudit,
    // derived
    getDashboardStats, getAdminStats,
    // meta
    reset, categories: CATEGORIES, campusAreas: CAMPUS_AREAS,
    selfRoles: SELF_ROLES, relationships: RELATIONSHIPS
  };
})();
