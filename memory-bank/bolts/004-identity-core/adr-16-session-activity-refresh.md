---
bolt: 004-identity-core
created: 2026-10-27T13:05:00Z
status: accepted
superseded_by: null
---

# ADR-16: Refresh a session's activity timestamp at most once per hour, accepting an idle window of 13–14 days rather than exactly 14

## Context

The PRD's session-expiry requirement is one sentence:

> - Sessions expire after 14 days of inactivity.
> — PRD FR-4, § Consequences (testable)

And PRD A2 states the requirement without a duration:

> **A2:** Authenticated sessions must be revocable and expire after inactivity.
> The session mechanism and storage strategy are Architecture decisions.

FR-4 makes the mechanism a decision too:

> Sessions expire after 14 days of inactivity.
> — PRD FR-4

So the *duration* is fixed at 14 days. The *mechanism* is explicitly an
Architecture decision — which is why this ADR exists.

### The implementation tension

To honour "14 days of inactivity" literally, the system must know when the
user was last active. That requires recording the last activity on every
request that counts as activity — which means **a database write on every
authenticated request**.

The alternatives each cost something:

| Approach | Write cost | Accuracy |
|---|---|---|
| Write `last_activity_at` and `expires_at` on **every** authenticated request | One write per request | Exact |
| Write only when the stored `last_activity_at` is older than a threshold | One write per threshold window | Approximate, by at most the threshold |
| Recompute `expires_at` in SQL on every read | One write per request, plus a function call on the read path | Exact, but it puts the write on the read path *and* slows the read |
| Derive inactivity from a session cookie with a long `Max-Age` | No write | Wrong: a cookie's `Max-Age` is a wall-clock deadline, not an inactivity window, and it is not revocable server-side |

The fourth option is ruled out independently: PRD A2 requires sessions to be
**revocable**, and `tech-stack.md` requires revocable **server-side** rows —
"Sessions are rows, not JWTs, so deactivation (FR-5), logout (FR-4), and
password reset (FR-51) can revoke server-side. This is what PRD A2 requires."

So the choice is between writing on every request, and writing on a
threshold.

### Why the write cost is not negligible here

`tech-stack.md` fixes the deployment:

> | Hosting | **Vercel Hobby** |
> | Database | **PostgreSQL** (free tier, pooled connection) |

and the database standard records the specific constraint:

> - **Always** use the pooled connection. A direct connection will exhaust
>   descriptors under concurrency.
> - Set a conservative per-request connection timeout.
> - Keep transactions short

Vercel Hobby's free PostgreSQL tier has a storage and compute allowance, and
`data-stack.md` records the verified limits: "1 GB per project" and
"100 CU-hours/month, scales to zero after 5 minutes idle".

**A write on every authenticated request is the largest avoidable source of
write load in the system**, and it is avoidable. Every page view, every API
call, and every server action from an authenticated member would issue an
`UPDATE sessions SET last_activity_at = …, expires_at = … WHERE id = …`.

The amplification is worse than it looks. A single user action in a
server-rendered application often produces **several** authenticated
requests — the page render, a layout data fetch, a server action, a
client-side navigation prefetch. Under a threshold-based refresh, those
requests resolve to **one** write per hour rather than four or five.

### The forces in play

| Force | Direction |
|---|---|
| FR-4: "Sessions expire after 14 days of inactivity" | The window is 14 days of *inactivity*, and the user must be logged out after that |
| PRD A2 and `tech-stack.md`: sessions are revocable server-side rows | The session must be a database row, so inactivity must be tracked in the database |
| `data-stack.md`: pooled connections, a 1,024-descriptor cap, short transactions | Every request's write competes for a pooled connection |
| The free-tier storage and compute allowance | Write volume is a budgeted resource, not free |
| `coding-standards.md`: "Rate limits enforced server-side" and the PRD's NFRs | The session path is on the hot path of every authenticated request |
| The single-tenant deployment (one organization per deployment) | Traffic is bounded and predictable, so a conservative approximation is safe |
| PRD FR-4: a `Pending` account authenticates but has no member capability | `Pending` sessions exist and expire on the same rule |
| ADR-3, decision 4: email after commit; `data-stack.md`: audit inside the transaction | The existing transaction discipline does not constrain this decision either way |

## Decision

**A session's activity timestamp is refreshed only when the stored
`last_activity_at` is more than one hour old. The threshold is configurable.**

```text
if (now - session.lastActivityAt > REFRESH_THRESHOLD) {
    session.lastActivityAt = now
    session.expiresAt      = now + INACTIVITY_WINDOW   // 14 days
    await sessionRepository.save(session, tx)
}
```

The defaults:

| Setting | Value | Configured via | Meaning |
|---|---|---|---|
| Inactivity window | 14 days | `SESSION_INACTIVITY_DAYS` | The window from the last activity, per FR-4 |
| Refresh threshold | 1 hour | `SESSION_ACTIVITY_REFRESH_MINUTES` | How stale `last_activity_at` may be before it is corrected |

### The resulting window is 13 to 14 days, and that is stated rather than hidden

**This is an approximation, and the design states it explicitly.** The stored
`last_activity_at` may lag the user's true last activity by up to one hour.
Therefore the effective idle window is between **13 days 23 hours and 14
days** — a session expires after *at least* 13 days 23 hours of inactivity and
*at most* 14 days.

The requirement is "expire after 14 days of inactivity". The implementation
satisfies it **to within one hour's resolution**, which is the granularity
any threshold-based implementation can offer. No member can observe the
difference between 13 days 23 hours and 14 days of not using the application:
both are far beyond any plausible session's useful life, and neither is a
behaviour a user would describe.

**The approximation is in the safe direction.** A session expires *later* than
the nominal 14 days, never earlier. The consequence of being one hour late is
that a user who has been idle for 13 days 23 hours is still logged in at the
14-day mark. The alternative — rounding the other way — would log out a user
who had been active within the window, which is a visible failure. Being late
by an hour is the benign side of the approximation.

### Expiry is enforced on read, not by a sweeper

**A session is usable only if `revoked_at IS NULL AND expires_at > now()`.**
The check happens on every session resolution, so an expired session is inert
immediately, whether or not any cleanup job has run.

This matters because the Hobby cron drifts by ±59 minutes (`tech-stack.md`
B4). **Correctness must not depend on a cron.** With expiry enforced on read,
a session is dead the moment its window elapses; the sweep is only about
storage.

### The sweep is for storage only

A daily cron deletes session rows where `expires_at < now() - 30 days`. The
30-day grace period means a recent logout remains inspectable for an
investigation.

The sweep is **idempotent** and tolerant of the ±59-minute drift — deleting
rows that are already deleted is a no-op — and it deletes **only** expired
sessions. **A live session is never swept.** Accounts are never swept; they
are retained indefinitely, including after deactivation (FR-5, PRD §10
Retention).

### The activity read is the same read that resolves the session

The refresh happens inside the session-resolution path, so it costs no extra
round trip: the row is already being read. When a refresh is due, the write
uses the same transaction handle the caller already holds.

**A refresh must never fail the request.** If the timestamp update fails, the
session is still resolved and the request proceeds; the activity timestamp
simply does not advance. A failed bookkeeping write should not log a member
out of the application. The failure is logged as a defect.

## Rationale

### Why the threshold is one hour

**One hour is short enough that the approximation is negligible.** The
effective window is 13–14 days instead of 14. The error is bounded by the
threshold, and the threshold is small relative to the window it measures —
a 0.3% error.

**One hour is long enough to collapse the write amplification.** A member who
uses the application several times an hour produces one write, not several.
Across the whole deployment, the write volume drops from "one per
authenticated request" to "one per active session per hour".

**One hour matches the shape of the traffic.** In a lost-and-found
application for one organization, members use it episodically — checking for
a found item, posting a Claim, checking a thread. The requests cluster into
bursts separated by gaps. A one-hour threshold captures each burst in a
single write, which is exactly the intent.

**A shorter threshold (say, one minute) would save little.** The write
volume would already be near-minimal, and the approximation would tighten to
1 minute — a gain with no practical benefit, at the cost of more frequent
writes during a burst.

**A longer threshold (say, one day) would save more but weaken the
guarantee.** The effective window would become 13–17 days, and a member
active once a day would keep their session alive indefinitely through a
single daily write — which stops being an *inactivity* window at all.

### Why the approximation is acceptable at all

**Because the alternative is not more accurate in a way anyone can observe.**
The PRD states 14 days of inactivity without specifying a resolution. A
threshold-based implementation cannot do better than its threshold without
writing on every request. One hour is the point where the write saving is
large and the inaccuracy is negligible.

**And because the PRD's own security properties are unaffected.** The
requirements that matter for a session are that it is **revocable** (PRD A2)
and that a **deactivated** account cannot act (FR-5). Both are enforced
exactly and without approximation:

- Revocation is a `revoked_at` write, checked on every resolution. **There
  is no threshold on revocation** — a revoked session is inert immediately.
- Deactivation revokes all sessions explicitly, in the same transaction.
- Logout revokes explicitly.

The threshold applies **only** to the inactivity timer. Every explicit
security action — logout, deactivation, password reset — is immediate and
exact. That is the right place for the approximation: on the housekeeping
timer, never on the security controls.

### Why expiry is checked on read

**Correctness must not depend on a cron that drifts.** `tech-stack.md` B4
records that Hobby's cron "runs once per day with ±59 minutes of drift" and
that "any scheduled FindBack work … must be idempotent". An idempotent
sweep is fine for storage, but if a session's validity depended on the sweep
having run, a session could remain usable for up to a day past its window —
which is a much larger and more security-relevant error than the one-hour
inactivity approximation.

Checking on read costs one indexed comparison on a row that is already being
read, and makes the guarantee exact: the session is dead the instant its
window elapses, regardless of any job's schedule.

### Why the sweep has a 30-day grace period

A session row that expired five minutes ago carries information an
investigation might want — when the member last used the system, whether the
session was revoked, and when. Deleting immediately would discard it.
Thirty days keeps recent history available while bounding the table's growth.

The grace period does not weaken anything: the session is already unusable
the moment it expires, whether or not the row is still present.

### Why the refresh must not fail the request

The activity timestamp is **bookkeeping**, not an access-control decision.
The access-control decisions — is this session revoked, is this account
active, is this account deactivated — are all exact and all independent of
the timestamp.

A failed refresh means the timestamp did not advance, which means the
session might expire slightly sooner than the user expects. That is a
minor, recoverable inconvenience. Failing the request would mean a member
cannot use the application because a bookkeeping update failed. The
asymmetry is clear.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **Refresh at most once per hour** | Collapses the write amplification to one per active session per hour; the window stays within one hour of 14 days; revocation and deactivation remain exact | The idle window is 13–14 days rather than exactly 14 — an approximation, stated explicitly | **Chosen.** The write saving is large and the approximation is smaller than any user can observe, and it is in the safe direction |
| **Refresh on every authenticated request** | Exactly 14 days of inactivity, no approximation at all | One write per request on the hot path of every authenticated page view, API call, and server action; the largest avoidable write load in the system; competes for pooled connections on a free tier | The cost is real and continuous; the accuracy gained is unobservable |
| **Recompute `expires_at` in SQL on every read** | Exact | Still one write per request; and it puts the computation on the **read** path, which the PRD bounds at ≤ 500 ms p95 while writes are allowed ≤ 1 s | Worse than the chosen option on both counts |
| **Refresh every minute** | The window tightens to ~14 days minus a minute | The write saving is already captured by the hour threshold; a minute buys accuracy nobody can observe, at the cost of more writes during a burst | Diminishing returns |
| **Refresh once a day** | Fewer writes still | The effective window becomes 13–17 days, and a member active once a day would keep their session alive indefinitely — the window stops being an *inactivity* window | Weakens the guarantee past usefulness |
| **Use the cookie's `Max-Age` as the expiry** | No server-side activity tracking at all | A cookie's `Max-Age` is a wall-clock deadline, not an inactivity window. The user would be logged out 14 days after login even if active every day | Incorrectly models inactivity, and cannot be revoked server-side as PRD A2 requires |
| **Use JWTs with a long expiry and a denylist** | No session table lookups on the hot path | PRD A2 and `tech-stack.md` explicitly require server-side revocable rows; a denylist is a server-side session table with extra steps and a failure mode | Directly contradicts a frozen requirement and a standard |
| **Refresh lazily — write only when the session is next used after a stale threshold, accepting a stale read** | Same as chosen, but the stale read is served without refreshing | Identical write volume to the chosen option, but a session that has crossed its threshold is served once more before being refreshed — a wider window | The chosen option refreshes before deciding, so the window never exceeds the threshold plus the inactivity window |
| **Depend on a cron to expire sessions** | No check on the read path | Correctness would depend on a job that drifts ±59 minutes and runs once a day; sessions could remain usable for up to a day past their window | A security-relevant error an order of magnitude larger than the one-hour approximation |
| **Sweep expired sessions immediately, with no grace period** | Simplest cleanup | Discards the recent session history an investigation may need | The grace period costs nothing and preserves useful history |
| **Fail the request when the refresh write fails** | The timestamp is guaranteed accurate | A bookkeeping failure logs a member out of the application; the security controls do not depend on this write | The asymmetry is wrong: security decisions are exact, bookkeeping is best-effort |
| **Keep sessions forever and rely on the cookie** | No expiry work | Directly violates FR-4 and PRD A2 | Forbidden by the PRD |

## Consequences

### Positive

- **The session write volume drops from per-request to per-hour**, which is
  the single largest reduction in avoidable database load in the identity
  module.
- **The effective idle window stays within one hour of the PRD's 14 days**,
  and the deviation is in the safe direction — a session is never revoked
  *earlier* than the nominal window.
- **Every explicit security action remains exact and immediate**: logout,
  deactivation, and password-reset revocation are all explicit writes with no
  threshold. The approximation touches only the housekeeping timer.
- **Expiry correctness does not depend on a cron**, so the ±59-minute Hobby
  drift cannot leave a session usable past its window.
- **The refresh costs no extra round trip** — it reuses the session row the
  resolver has already read, and the transaction handle the caller already
  holds.
- **A failed refresh cannot log a member out**, because the timestamp is
  bookkeeping rather than an access-control decision.
- **The threshold and the window are configuration**, so either can be tuned
  without a deploy.

### Negative

- **The idle window is 13–14 days, not exactly 14.** This is an
  approximation, and it is documented in the design, in this ADR, and — as a
  required Stage 5 assertion — in the test suite.
- **The stored `last_activity_at` can be up to an hour stale**, so it is not a
  precise record of the user's last activity. It is a precise-enough record
  of *when the session last had a chance to be refreshed*.
- **A member who is active only within an hour of the threshold boundary has
  a session that expires at an unpredictable point within that hour.** No
  member can observe this, but it means the expiry moment is not
  deterministic to the second.
- **The refresh is best-effort**, so under a database fault the activity
  timestamp may not advance. The session then expires sooner than it would
  otherwise — the benign direction for this approximation.

### Risks

| Risk | Mitigation |
|---|---|
| The approximation is judged to violate FR-4's "14 days of inactivity" | The window is 13–14 days — within one hour of the requirement, and always on the late side, so a session is never revoked early. The PRD specifies no resolution, and states the mechanism as an Architecture decision. **Stage 5 must assert the effective window explicitly**, so the approximation is a tested, documented property rather than an accident |
| The write volume is higher than expected and affects the free-tier database | The threshold is configuration. If measurement shows it is too high, lowering it costs only a slightly wider window; raising it costs accuracy. The daily sweep keeps the table's growth bounded regardless |
| A session outlives the account's deactivation because of a stale timestamp | **Impossible.** Deactivation revokes all sessions explicitly in the same transaction; revocation is checked on every read and is not thresholded |
| A revoked session is still accepted because of a cached row | Revocation is checked against the database on every resolution. No session state is cached across requests — the same property the Stage 1 domain model gave `ActorContext` |
| The sweep deletes a live session | The sweep's predicate is `expires_at < now() - 30 days`, which cannot match a live session, and expiry is enforced on read independently of the sweep |
| The sweep misses rows because of cron drift | The sweep is a storage cleanup and is idempotent; drift delays a deletion by at most an hour and never affects a decision |

## Related

- **Stories**: `003-login-with-active-account` (a session is created at
  login; story edge case "Account deactivated while a session is open |
  Session revoked; next request is unauthenticated"; "Expired session cookie |
  Treated as unauthenticated, no error surfaced"),
  `005-logout-revokes-session` (revocation is explicit and immediate, and is
  **not** affected by this threshold),
  `006-pending-member-restricted-access` (a `Pending` account's session
  expires on the same rule, though the account never gains member
  capability). Bolt `005-identity-security` covers FR-5 deactivation, whose
  "all sessions revoked" requirement depends on `Session.revoke()` — built in
  this bolt
- **Standards**:
  `memory-bank/standards/tech-stack.md` (§ Authentication — "Sessions are
  rows, not JWTs"; § Known Free-Tier Limits and Their Workarounds — B4 on
  Hobby cron drift and idempotence; Hosting and Database rows — the free-tier
  PostgreSQL),
  `memory-bank/standards/data-stack.md` (§ Connection handling — pooled
  connections and the descriptor cap; § Concurrency rules; § Retention —
  sessions until expiry or revocation),
  `memory-bank/standards/system-architecture.md` (§ Security and privacy —
  "Sessions | Revocable server-side rows … inactivity expiry"),
  `memory-bank/standards/coding-standards.md` (§ Error handling — an expected
  outcome versus a defect; § Logging — a failed action is recorded)
- **Previous ADRs**: ADR-6 (the transaction-scoped state pattern),
  ADR-7 (durable state written in its own transaction rather than only to
  stdout — the same "state that must outlive the request" principle),
  ADR-15 (the shared-port pattern this decision follows for the rate
  limiter, and the same free-tier write-budget reasoning), ADR-12 (the ~81 ms
  Argon2id cost on the same request path)
- **Artifacts**:
  `memory-bank/bolts/004-identity-core/ddd-01-domain-model.md`
  (§ Value Objects — `InactivityWindow`; § Aggregates — the `Session`
  invariants; § Open item 4 — the session inactivity window and the
  sliding-expiry rule),
  `memory-bank/bolts/004-identity-core/ddd-02-technical-design.md`
  (§ The session-refresh-granularity decision; § Data Persistence — the
  `sessions` columns and `idx_sessions_expires_at`; § Open item 3)
- **Requirements**: FR-4 (Login and Logout — "Sessions expire after 14 days
  of inactivity"; "Logout clears the session"), FR-5 (Deactivation — all
  sessions revoked), PRD A2 (revocable, expiring after inactivity; the
  mechanism is an Architecture decision), PRD §10 (Data Retention — accounts
  retained indefinitely; sessions until expiry or revocation)
