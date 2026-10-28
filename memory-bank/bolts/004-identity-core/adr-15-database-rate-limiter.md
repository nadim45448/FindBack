---
bolt: 004-identity-core
created: 2026-10-27T12:55:00Z
status: accepted
superseded_by: null
---

# ADR-15: Enforce rate limits with a database-backed fixed-window counter, not a Vercel rate-limiting product

## Context

The PRD requires rate limiting in two places, and both requirements are
behavioural rather than vendor-specific.

PRD §10, Security:

> - **Rate limiting explicitly covers:** registration, login, Claim submission,
>   Recovery Response submission, and workflow message posting (per-Claim
>   thread and per-Recovery-Response thread).

PRD FR-51 adds:

> - Password-reset requests must be rate-limited.

The unit brief records the same set and names a **vendor**:

> | Vercel rate limiting | Inbound | Registration, login, password reset are rate-limited (PRD §10) |

and, in Constraints:

> - Rate limits: registration, login, password reset

So the question is not *whether* to rate-limit — that is settled by the PRD
and by the brief — but **where the counters live**.

### The constraint that decides most of it

`memory-bank/standards/tech-stack.md` carries the budget as a hard fact:

> | **budget** | **$0 hard ceiling** |

and the standard's own note on what that ceiling means:

> - A quota condition may never cause a purchase, a plan upgrade, or an
>   automatic scale-out.

Vercel's rate-limiting product is an **add-on** on top of a plan. Whether it
is available at no cost on the Hobby tier, and what its limits are, is a
property of Vercel's pricing that this repository does not record and that
the project should not depend on. A requirement whose enforcement depends on
a paid add-on is not a requirement the $0 ceiling can safely carry.

### The constraint that decides the rest of it

`tech-stack.md` fixes the hosting:

> | Hosting | **Vercel Hobby** |

and the runtime:

> | Runtime | Node.js (Fluid Compute) |

Vercel's serverless functions are **horizontally scaled and short-lived**. An
in-memory counter is therefore per-instance: it resets on every cold start, it
does not count across concurrent instances, and a burst spread across
instances is not throttled at all. Any limiter that must actually limit
something on this platform has to keep its state somewhere shared.

The project already has exactly one shared state store: **PostgreSQL**, on a
free tier, pooled, already used by every module.

### What is already in the repository

- `data-stack.md` establishes the concurrency rules, the transaction discipline,
  and the principle that multi-row operations run inside one transaction.
- The `audit` module already demonstrates the pattern this decision needs: a
  **read-only port** in `application/ports/` (`QuotaUsageProvider`,
  `QuotaLimitProvider`) implemented in `infrastructure/`, with the domain and
  application layers depending on the port rather than on the mechanism.
- ADR-6 established the `SET LOCAL` transaction-scoped flag pattern for
  scoped state in PostgreSQL.
- `tech-stack.md` B4 records the Hobby cron's ±59-minute drift and the
  requirement that any scheduled work be idempotent.

### The forces in play

| Force | Direction |
|---|---|
| PRD §10: rate limiting **explicitly covers** registration, login, Claim submission, RR submission, and thread posting | The behaviour is mandatory; the mechanism is not specified |
| PRD FR-51: password-reset requests must be rate-limited | Same |
| `tech-stack.md`: budget "**$0 hard ceiling**" | No paid add-on may be required to satisfy a PRD requirement |
| `tech-stack.md`: "Vercel Hobby" and "Node.js (Fluid Compute)" | The runtime is horizontally scaled and ephemeral; an in-memory counter would not limit anything |
| The unit brief names "Vercel rate limiting" | The brief's *intent* is that registration, login, and password reset are limited — the product is a suggestion, and the brief itself cites PRD §10 for the requirement |
| The project already has PostgreSQL on a free tier | A shared, durable counter store exists at no additional cost |
| `data-stack.md`: multi-row operations run in one transaction | The counter's increment and the decision must be atomic |
| ADR-6's `SET LOCAL` pattern | Scoped PostgreSQL state is an established technique here |
| `tech-stack.md` B4: cron drifts ±59 minutes and must be idempotent | Any cleanup sweep must tolerate drift and be idempotent |
| The PRD's anti-enumeration rules (FR-4, FR-51) | A throttle must not become an account-existence oracle |
| The PRD's NFRs: reads ≤ 500 ms p95, writes ≤ 1 s p95 | The limiter is on the request path and must be cheap |
| Single-tenant, one organization per deployment | The abuse surface is bounded, so the limits can be conservative |

## Decision

**Rate limiting is implemented as a database-backed fixed-window counter behind
a `RateLimiter` port. No Vercel rate-limiting product is used.**

```text
src/application/ports/rate-limiter.ts              ← the shared port
src/infrastructure/accounts/database-rate-limiter.ts  ← the implementation
```

The port:

```ts
interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}
```

`consume` increments the counter for the current fixed window and returns
`{ allowed, remaining, retryAfterSeconds }`.

**The counter table:**

```text
rate_limit_counters
  id           uuid PK
  bucket_key   text NOT NULL     -- e.g. 'login:email:jane@example.org'
  window_start timestamptz NOT NULL
  count        int NOT NULL
  UNIQUE (bucket_key, window_start)
```

The unique constraint on `(bucket_key, window_start)` is what makes the
increment atomic: `INSERT … ON CONFLICT DO UPDATE SET count = count + 1` is a
single statement, so concurrent requests for the same bucket cannot lose a
count. The rate-limited request's own increment and its decision are the same
statement — there is no read-then-write race.

### Two independent buckets on login, one on registration

**Login is limited by both IP and normalized email.** A request is allowed
only if **both** buckets are under their limits.

This is not belt-and-braces; each bucket closes a hole the other leaves open:

| Bucket alone | What it fails to stop |
|---|---|
| IP only | One attacker exhausts the IP limit and **locks out every member behind the same campus NAT**. The limit is on the wrong dimension. |
| Email only | An attacker enumerates accounts by observing **which addresses get throttled**. The limit becomes an account-existence oracle. |

Together they close both: the IP bucket bounds the cost of a distributed
attack, and the email bucket bounds the cost of a targeted one.

**The email bucket's refusal returns the same generic message as a wrong
password.** A throttled account must be indistinguishable from a failed one,
or the throttle itself discloses which addresses exist. This is the same
`GenericInactiveMessage` value object the login path already uses.

**Registration is limited by IP only.** An email-keyed registration limiter
would add a second account-existence channel — and FR-1 already discloses
existence through its 409 duplicate-email response, which is a requirement, so
the limiter's marginal leak would be small but its marginal value would be
smaller still. One IP bucket bounds account creation without adding an
oracle.

### The limits

Configured, not hardcoded, with the chosen values as defaults:

| Bucket | Limit | Window | Reasoning |
|---|---|---|---|
| `register:ip:<ip>` | 5 | 1 hour | Account creation is the most valuable thing an attacker can do here. IP-scoped so a shared campus IP cannot lock everyone out of registering. |
| `login:ip:<ip>` | 20 | 15 minutes | A campus has many members behind one address, so the IP limit must be loose enough for a shared address to work. |
| `login:email:<email>` | 10 | 15 minutes | One account's failures are individually meaningful; 10 failures in 15 minutes is well beyond a legitimate typo pattern. |

The email bucket uses the **normalized** email, so `Jane@example.org` and
`jane@example.org` share one bucket — otherwise an attacker could multiply
the limit by varying case.

### The rejected request still increments

A refused request increments the counter. A caller that is being throttled
must not be able to probe for the limit — if refusals did not count, an
attacker could send unlimited attempts past a limit that only counted
successes. This means the counter measures **attempts**, which is the thing
that costs the server.

### Cleanup is a sweep, not a hot-path concern

Counter rows accumulate: one row per bucket per window. A daily cron deletes
rows whose `window_start` is older than **24 hours**.

The sweep is **idempotent** and tolerates the Hobby cron's ±59-minute drift
(`tech-stack.md` B4), because deleting rows that are already gone is a no-op.
It is a storage cleanup, not a correctness mechanism: **a stale row never
affects a decision**, because each window's counter is keyed by its own
`window_start` and a decision only ever reads the current window's row.

The same daily sweep removes expired and revoked session rows, for the same
reason and with the same idempotence.

### Where the limiter sits

**In the route handler, before the use case runs** — not inside the domain,
and not inside the use case.

- Not in the domain: `domain/` must be importable with no database, and a
  rate limit is a policy about *traffic*, not about the account lifecycle.
- Not inside the use case: the use case is the thing being protected. A
  limiter inside it would be reached only after the expensive work had
  already begun — for login, after the Argon2id verification, which is the
  most expensive thing in the request.

This is the same position ADR-8 took for the audit read: **enforce before
the expensive operation, not filter after it.**

### The unit brief's integration row is corrected

The brief's row:

> | Vercel rate limiting | Inbound | Registration, login, password reset are rate-limited (PRD §10) |

records a **product**, where the row's "Purpose" column records a
**requirement**. The requirement is right and is what the project must
satisfy; the product is an implementation suggestion that this ADR declines.

**A standards correction is required** — see *Follow-up required* below.

## Rationale

### Why not the Vercel product

**The $0 ceiling is the deciding factor, and it is a hard ceiling.**
`tech-stack.md` states it without qualification, and the standard's own
governing note is that a quota condition may never cause a purchase. If the
limiter's enforcement requires a paid add-on, then the PRD requirement
"rate limiting explicitly covers registration, login…" is satisfied only for
customers who pay — which is not the same requirement.

**The brief itself points at the PRD, not at the product.** The brief's row
cites "(PRD §10)" as the authority for the requirement. The PRD does not name
Vercel. The brief names it as a *means*; the ADR declines that means and
keeps the requirement.

**It would add a failure mode the PRD does not have.** If the limiter is a
hosted service, then the service being unreachable is a new way for
registration and login to fail — and the PRD's reliability requirement is 99%
uptime during business hours. A limiter that is a single Postgres table
alongside every other table has no independent availability.

**And it would not be free to reason about.** A hosted limiter's limits,
burst behaviour, and pricing are the vendor's. The project's own limits,
derived from the PRD's anti-enumeration requirements and the campus-NAT
constraint, would be expressed in a config the project does not control.

### Why not an in-memory counter

An in-memory counter is per-instance on Vercel's Fluid Compute. It resets on
every cold start — and serverless functions cold-start constantly. It does
not count across concurrent instances, so a burst spread across ten instances
gives each instance its own fresh allowance. It would provide **no meaningful
limit at all** while appearing to.

This is the reason the decision is not "the simplest thing that could work".
The simplest thing — a `Map` in module scope — is not merely weaker; on this
platform it is non-functional.

### Why PostgreSQL specifically

It is already there, on a free tier, pooled, and it is where the data being
protected lives. The counter is a **row in the same database** as the
accounts and sessions it protects, so a transaction that creates an account
and a counter increment commit together — no cross-store consistency problem
and no second service to reason about.

The cost is one row read-and-update per rate-limited request. That is an
indexed single-row operation on a unique index, well inside the PRD's write
NFR of ≤ 1 s at p95, and far cheaper than the Argon2id verification it
protects.

### Why a fixed window rather than a sliding window or a token bucket

**A sliding window** would be more precise — no burst at a window boundary —
but it needs either a row per attempt or a query that scans the window. The
precision is not worth it: the PRD requires that attempts be *limited*, not
that the limit be perfectly smooth.

**A token bucket** would allow a controlled burst, which is a nicer shape for
legitimate traffic. But it needs a continuously-refilling bucket, and with a
fixed-window store that means computing the refill from `window_start` on
every request — more arithmetic for a benefit this product does not need.

**A fixed window** is one row, one atomic statement, one decision. Its known
weakness — up to 2× the limit across a window boundary — is acceptable
because the limits are set with generous headroom relative to legitimate
traffic, and because the purpose is to bound abuse cost rather than to
enforce a precise quota.

### Why the counter increment is in the same statement as the decision

If the limiter read the counter, decided, and then incremented in separate
statements, two concurrent requests could both read `count = 19` against a
limit of 20 and both be allowed — allowing 21 through. The single
`INSERT … ON CONFLICT DO UPDATE SET count = count + 1 … RETURNING count`
statement makes the read-modify-write atomic, so the count cannot be lost.
The unique constraint is what gives the statement something to conflict on.

This follows `data-stack.md`'s general rule — "Every multi-row lifecycle
transition runs in one transaction" — applied to the one-row case that most
needs it.

### Why the refusal is indistinguishable on login

FR-4 requires that a refused login be indistinguishable from a wrong password,
and FR-51 requires the same for a reset request. A throttle that returned a
distinct "too many attempts" response would disclose that the account
**exists** — turning the limiter into the account-existence oracle the PRD
specifically forbids.

This is why the email bucket's refusal returns the same
`GenericInactiveMessage` as every other refusal. The *response* is generic;
the *log* distinguishes the cases for diagnosis, through the same
internal-only `LoginRefused.reason` mechanism the login path already uses.

### Why registration is IP-scoped only

FR-1 already requires the registration endpoint to disclose existence through
its duplicate-email response — a 409. That is a product requirement and it
stays.

An **email-keyed** registration limiter would add a second channel that
discloses something about an address — and it would do so *before* the 409
could, which means an attacker could probe for existence without ever
submitting a registration. The marginal leak is small; the marginal protection
is smaller, because IP-scoped limiting already bounds how many accounts an
attacker can create from one address.

The trade is therefore clear: one bucket, no additional oracle.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **Database-backed fixed-window counter behind a port** | No cost; shared state that works on serverless; one atomic statement; uses the store already in place; limits are the project's own and can be derived from the PRD's anti-enumeration rules | One indexed write per rate-limited request; a table to sweep; the fixed window permits up to 2× the limit across a boundary | **Chosen.** It satisfies the requirement, works on the platform, and breaches no constraint |
| **Vercel's hosted rate-limiting product** | No code to write; possibly well-tuned; matches the unit brief's integration row | Likely a **paid add-on**, against a hard $0 ceiling; a hosted dependency for a requirement the PRD states in behavioural terms; its limits and pricing are not under the project's control; a new failure mode on the login and registration paths | Breaches the $0 ceiling, and the requirement does not need a vendor |
| **An in-memory counter (a `Map` in module scope)** | Trivial; no database cost; fastest | **Non-functional on this platform.** Per-instance, resets on every cold start, does not count across concurrent instances. Serverless functions cold-start constantly | Not merely weaker than the chosen option — it would not limit anything, while appearing to |
| **An in-memory counter with a shared Redis/KV store** | Fast; shared; supports sliding windows and token buckets | A **new service**. Vercel KV and Upstash have free tiers with quotas that are themselves the thing to monitor; the project's quota-monitor would need a new resource; a second datastore for one counter table is disproportionate at this scale | A new service for a single-table problem, on a project whose $0 ceiling is a hard rule |
| **Use PostgreSQL advisory locks to serialize per-bucket access** | Stronger consistency | Advisory locks are session-scoped, hold a connection for their duration, and interact badly with a pooled serverless connection — exactly the failure mode `data-stack.md` warns about | The unique-constraint upsert already gives atomicity without holding a connection open |
| **A sliding-window log (one row per attempt, queried by count)** | Perfectly precise; no boundary burst | One row per attempt, growing fast; the count query scans the window; a sweep becomes a hot path rather than a cleanup | Precision the PRD does not require, at a real cost |
| **A token bucket** | Allows a controlled legitimate burst; smooths traffic | Needs continuous refill arithmetic on every request; needs either a continuously-updated row or a computed refill — more machinery than a fixed window | The burst-shaping benefit does not matter for a single-tenant product with generous limits |
| **Limit only by IP** | One bucket; simplest | Lets one attacker lock out a whole campus behind a NAT, and lets a targeted attacker try one account forever | Two holes that a second bucket closes cheaply |
| **Limit only by email** | Bounds per-account attacks | Becomes an account-existence oracle; and a distributed attack against one account from many IPs is unbounded | The most dangerous of the single-bucket options |
| **Enforce the limit inside the use case** | One place to call it | The expensive work has already happened — for login, after the ~81 ms Argon2id verification. The limiter's purpose is to avoid that cost | ADR-8's rule: enforce **before** the expensive operation |
| **Enforce the limit in the domain layer** | Pure; testable | `domain/` must be importable with no database; a rate limit is a traffic policy, not a lifecycle rule | Violates `coding-standards.md` § Dependency rule |
| **Do nothing beyond the PRD's letter and rely on Vercel's platform-level protection** | Zero code | The PRD says "explicitly covers" — a named list of five operations. Platform-level protection is not a per-operation limit and is not under the project's control | The requirement is explicit and enumerates what it covers |
| **Apply the email bucket to registration as well** | Uniform treatment | Adds a second account-existence channel before the 409 can fire | The IP bucket already bounds creation; the marginal leak exceeds the marginal protection |

## Consequences

### Positive

- **The PRD's rate-limiting requirement is met with no paid service**, so the
  $0 ceiling is not breached by a security requirement.
- **The limiter actually limits on this platform.** A shared store is the only
  kind that works under serverless horizontal scaling.
- **The increment and the decision are atomic**, so concurrent requests
  cannot collectively exceed the limit.
- **Both login holes are closed** — the campus-NAT lockout and the
  account-enumeration oracle — by the two-bucket rule.
- **The limiter runs before the expensive operation**, so a throttled login
  costs an indexed upsert rather than an Argon2id verification.
- **The limits are the project's own**, derived from the PRD's
  anti-enumeration rules and from the single-tenant deployment's traffic
  shape, and they are configuration.
- **The counter store is the database already in place**, so there is no new
  service, no new credential, and no new availability dependency.
- **Cleanup is idempotent and drift-tolerant**, matching `tech-stack.md` B4.

### Negative

- **One indexed write per rate-limited request.** The login and registration
  paths each pay a round trip before their real work.
- **A new table to create, index, and sweep**, and a sweep job to maintain.
- **The fixed window permits up to 2× the limit across a window boundary.**
  The limits are set with headroom for legitimate traffic, so this is
  theoretical rather than practical.
- **A developer-facing deviation from the unit brief**, which names a Vercel
  product. The brief's row must be corrected.
- **The limiter is not free of a race between the counter and the work it
  protects** — a request may pass the limiter and then find the account
  locked. That is inherent to any pre-check limiter and is the correct
  trade-off.

### Risks

| Risk | Mitigation |
|---|---|
| The counter table grows without bound | The daily sweep deletes rows older than 24 hours. A stale row never affects a decision — each window's counter is keyed by its own `window_start` |
| The sweep misses a window because of the ±59-minute cron drift | The sweep is a cleanup, not a correctness mechanism, and is idempotent. Drift only delays the deletion, never changes a decision |
| The write round trip pushes login past a latency budget | One indexed upsert on a unique index, measured well inside the 1 s write NFR. The same sweep can also batch the increments if measurement ever shows a problem |
| A legitimate member behind a campus NAT is throttled | The IP limit is set at 20 per 15 minutes, well above a shared address's legitimate login volume; the email bucket at 10 per 15 minutes catches a targeted attack instead |
| An attacker uses the throttle as an existence oracle | The email bucket's refusal returns the same `GenericInactiveMessage` as every other refusal. The *response* is generic; only the internal log distinguishes the cases |
| The limits are too tight after real traffic data arrives | The limits are configuration, not constants, and can be adjusted without a deploy |
| The unit brief still names a Vercel product and a future agent follows it | This ADR is indexed in the decision index with a "Read when" line naming rate-limiting questions. **The brief must also be corrected** — listed below |

## Follow-up required

Two authored artifacts name a Vercel rate-limiting product and must be
corrected. Both are the owner's call; this bolt does not perform them.

| File | What changes |
|---|---|
| `memory-bank/intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md` (§ Technical Context → Integration Points) | The row "Vercel rate limiting" becomes "Rate limiting (database-backed) | Inbound | Registration, login, password reset are rate-limited (PRD §10)" |
| `memory-bank/standards/system-architecture.md` (§ Security and privacy → Rate limits) | The row stays behaviourally identical — "Registration, login, Claim submit, RR submit, thread posting, password reset" — and gains a pointer to ADR-15 for the mechanism |

The `Constraints` bullet in the same unit brief — "Rate limits: registration,
login, password reset" — is already correct and needs no change.

## Related

- **Stories**: `001-self-registration` (registration is rate-limited),
  `003-login-with-active-account` (login is rate-limited, and its
  anti-enumeration criterion 5 constrains the throttle's response), and in
  other units `008-claim-notification-emails` and the Lost-side bolts for the
  remaining PRD-covered operations. The FR-51 reset limit belongs to bolt
  `005-identity-security`
- **Standards**:
  `memory-bank/standards/tech-stack.md` (budget: $0 hard ceiling; Hosting:
  Vercel Hobby; Runtime: Node.js Fluid Compute; § Known Free-Tier Limits and
  Their Workarounds — B4 on cron drift and idempotence),
  `memory-bank/standards/system-architecture.md` (§ Security and privacy —
  Rate limits; § Security and privacy — "Email | Failures logged, never block
  the triggering action"; § Data model and persistence),
  `memory-bank/standards/data-stack.md` (§ Concurrency rules — one transaction
  for multi-row operations; § Connection handling — pooled connections and
  descriptor limits),
  `memory-bank/standards/coding-standards.md` (§ Dependency rule — why the
  port lives outside `domain/`),
  `memory-bank/intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md`
  (§ Technical Context → Integration Points — the row this ADR qualifies)
- **Previous ADRs**: ADR-6 (the `SET LOCAL` transaction-scoped state pattern),
  ADR-7 (a durable record written in its own transaction rather than only to
  stdout — the same "the state must survive the request" principle), ADR-8
  (enforce before the expensive operation, not filter after it), ADR-12 (the
  ~81 ms Argon2id cost the limiter protects), ADR-14 (the shared-port pattern
  this decision follows for email, applied here to rate limiting)
- **Artifacts**:
  `memory-bank/bolts/004-identity-core/ddd-01-domain-model.md`
  (§ Domain Services — `AuthenticationService`; § What this bolt deliberately
  does not model — rate limiting),
  `memory-bank/bolts/004-identity-core/ddd-02-technical-design.md`
  (§ The rate-limiter decision; § Data Persistence; § NFR Implementation)
- **Requirements**: PRD §10 (Security — rate limiting explicitly covers
  registration, login, Claim submission, Recovery Response submission, and
  workflow message posting; NFRs for read and write latency), FR-1
  (registration), FR-3 (administrator review), FR-4 (login and its
  anti-enumeration rule), FR-51 (password-reset requests must be
  rate-limited)
