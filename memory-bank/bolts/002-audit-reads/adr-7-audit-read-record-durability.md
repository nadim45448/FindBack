---
bolt: 002-audit-reads
created: 2026-10-26T12:32:12Z
status: accepted
superseded_by: null
---

# ADR-7: Record the audit-trail read in its own transaction, and treat a failed read record as a logged observability gap rather than a failed read

## Context

PRD §10 requires that a trail read is itself logged, separately from the trail:

> Audit-trail reads are themselves logged (administrator ID, query, timestamp) —
> separate from the audit trail itself, so the access pattern is reviewable.

That read record must be **durable**, not just a log line. `tech-stack.md`
blocker B3 records why:

> PRD §10 requires that application logs carry request ID, actor ID, action, and
> target ID, and that **audit-trail reads are themselves logged**. A 1-hour
> window cannot satisfy "reviewable". Resolution: **the audit trail itself is
> the durable record in PostgreSQL** (FR-31/FR-32, append-only); platform
> runtime logs are diagnostic only and are not the compliance artifact.

Vercel Hobby retains runtime logs for **1 hour**. The read record therefore
goes to the `audit_read_logs` table, which ADR-6 already made append-only with
a trigger that permits **no** deletion at all — not even through the FR-10 flag.

Story `005-audit-visibility-and-read-logging` makes the durability explicit:

> Given audit trail storage, When a read must be reviewable later, Then it is
> stored in the database rather than only in runtime logs

So there are two separate questions, and this ADR settles both.

### Question 1 — where does the read record sit relative to the trail query?

The read record is a write, so it needs a transaction. The trail query is a
read. Three placements are possible:

- **In the query's transaction.** A read has no transaction to join, and
  making one would put a read inside a write's consistency boundary for no
  reason.
- **Before the query.** Then a query that subsequently fails would leave a
  record of an access that did not return anything — a record of an access
  that did not happen.
- **After the query, in its own transaction.** The record describes a read that
  actually happened and returned rows.

The third is the only one where the record's existence is evidence of a
completed read.

### Question 2 — what happens when the read record cannot be written?

This is the genuine trade-off, and it is the reason this ADR exists.

PRD §10's Reliability clause establishes the precedent for a *failed secondary
action*:

> Email send failures are logged; the triggering action is not blocked.

`image-handling.md` §5 establishes a different precedent for a *failed cleanup*:

> Blob delete fails on FR-10 hard delete | Record the orphan in a retry queue;
> do not silently leak. Retries are idempotent by pathname

The read-record write is closer to the email case than to the Blob case: it is
a *secondary record of an action that has already succeeded*, not a cleanup of a
resource that would otherwise leak. But the "do not silently leak" instinct
behind the retry queue applies too — a read record that fails to write is an
**observability gap**, and gaps should not accumulate unnoticed.

Three answers are defensible:

1. **Log only.** Catch the failure, log it, return the trail. The gap is
   visible in the logs but never repaired.
2. **Retry inline.** Catch the failure, retry the write a bounded number of
   times, then log. Repairs transient failures without a queue.
3. **Queue for retry.** Catch the failure, write the intended record to a
   durable queue, and let a later process retry it.

The three answers differ on what the system promises. "Every read is recorded"
is a stronger promise than "every read is recorded, unless the database was
unavailable at that moment". A read record that is *eventually* recorded is
still recorded, so option 3 satisfies the story's promise in the long run but
introduces a delay during which the record does not exist.

### The forces in play

| Force | Direction |
|---|---|
| PRD §10: reads are logged so the access pattern is *reviewable* | The record must be durable and complete, not best-effort |
| PRD §10: "Email send failures are logged; the triggering action is not blocked" | A failed secondary record must not fail the primary action |
| `tech-stack.md` B4: Hobby cron runs **once per day**, ±59 min drift | A queue drained by cron gives a worst case of ~24 h of lag; a queue drained by a request gives no lag |
| `tech-stack.md` B4: any scheduled work must be **idempotent** | A retry mechanism must be idempotent by construction |
| $0 ceiling (`tech-stack.md`) | No queue service, no Redis, no external worker |
| Story `005`: "reads are **never deduplicated**" | A retry must not produce two records for one read |
| `audit_read_logs` trigger: **no** deletion permitted, not even via the FR-10 flag | A queued record cannot be "retried" by rewriting a row — it can only be appended |
| ADR-6: the trail and the read log are separate artifacts | A read record must never become a trail event |
| `coding-standards.md`: "No floating promises — every async call is awaited or explicitly voided with a logged catch" | A background retry must be explicitly voided with a logged catch |
| FR-32: the trail is administrator-only | The read log records *who investigated what*; it is itself sensitive |
| 99% uptime target, no formal SLA (PRD §10) | An outage window is the main source of read-record loss |

## Decision

**The read record is written after the trail query succeeds, in its own
short transaction. A failure to write it is caught, logged as an operational
error, and retried inline a bounded number of times. The read still succeeds.
There is no durable queue and no background worker.**

Specifically:

1. **Order.** Authorize → query → record. Authorization is first and is not a
   query filter. The record is written only after the query has returned.

2. **Its own transaction.** The read record is a write, so it gets its own
   transaction, opened and committed immediately. It is never part of the
   trail query's transaction, and it is never part of any state-changing
   transaction — the trail read is not a state change.

3. **A failure does not fail the read.** The catch returns the trail to the
   administrator. The administrator asked to see the trail and can see it. The
   bookkeeping loss is an observability gap, not a correctness failure for the
   request.

4. **Bounded inline retry.** On a failure the write is retried up to **2
   additional attempts** (3 total), with no delay between attempts beyond the
   await itself. The retry is **idempotent**: the record's `id` is generated
   **once**, before the first attempt, and every attempt writes that same
   `id`. Because `audit_read_logs.id` is the primary key, a duplicate insert
   is refused by the database rather than creating a second row — so a retry
   can never produce two records for one read. This satisfies story `005`'s
   "reads are never deduplicated" rule (which is about *not* collapsing two
   genuine reads) without violating the "exactly one record per read" rule.

5. **Retry only on transient failures.** An attempt is retried only when the
   failure is a transient database condition — a transaction write conflict or
   deadlock (`P2034`), or a connection-level failure. A validation failure, a
   constraint violation, or the append-only trigger refusing the write is
   **not** retried: it would fail identically every time, and retrying it
   wastes the request's time and hides the real defect.

6. **The failure is always logged.** Every failed attempt, retryable or not,
   produces an operational log line with `outcome: "error"`, the action
   `audit.read_record_failed`, and the request id. The log line is diagnostic;
   the table row is the compliance artifact.

7. **No queue, no worker, no cron.** The read record's write path adds no
   background process and no scheduled job. This is a direct consequence of
   `tech-stack.md` B4: Hobby cron fires **once per day with ±59 minutes of
   drift**, so a cron-drained queue would leave a read unrecorded for up to a
   day — during which the access pattern is *not* reviewable, which is the
   thing PRD §10 requires.

8. **The retry lives in the application layer, behind the repository port.**
   The infrastructure adapter performs one insert attempt; the application
   service performs the retry loop. The port therefore gains no retry
   parameter and no knowledge of failure classification — the retry policy
   stays in the application layer where the decision lives.

### Failure classification

| Failure | Retryable | Rationale |
|---|---|---|
| `P2034` — transaction write conflict or deadlock | **Yes** | The same statement can succeed on a second attempt; PostgreSQL itself asks for a retry |
| Connection-level failure (pool exhausted, socket closed, timeout) | **Yes** | Transient infrastructure condition; a new pooled connection is likely to succeed |
| Append-only trigger refusal (`23001`) | No | The write is structurally forbidden; it will fail identically on every attempt |
| CHECK constraint violation | No | The data is invalid; a retry writes the same invalid data |
| Any other unexpected error | No | Unclassified; treat as a defect and log it rather than retrying blindly |

**Unclassified errors are not retried.** The classification is a closed,
explicit list. A failure that is not on it is a defect, and a defect should
surface as a defect.

### The retry is bounded and the bound is visible

Three attempts total is a deliberately small bound. The purpose of the retry
is to survive a **transient** condition — a deadlock or a momentary
connection loss — not to paper over a sustained outage. During a sustained
outage the database is unavailable for the trail query too, so the read itself
fails before the record write is ever attempted. The window in which a read
succeeds and its record cannot be written is therefore narrow: the database
must be reachable for the `SELECT` and then unreachable for the `INSERT`, or
the `INSERT` must fail for a reason the classifier did not anticipate.

**That narrow window is the accepted loss.** It is recorded here rather than
hidden, because it is the one place where the system's promise — "every
administrator trail read is recorded" — can be broken. The mitigation is that
the failure is **loud**: it is logged with `outcome: "error"` and the request
id, so an operator reviewing the logs sees every gap as it happens.

## Rationale

### Why the record is written after the query, in its own transaction

**Why not in the query's transaction.** A read has no transaction to join.
Opening one would mean the trail read acquired a transaction handle it does
not need, and it would place a read inside a write's consistency boundary. It
would also mean a long-running trail query holds a transaction open, which
`data-stack.md` warns against: "Keep transactions short — especially the
audit-write transactions, which must not…". The read record's transaction is
short — one insert — and the trail query runs outside any transaction.

**Why not before the query.** The record would then describe a read that had
not yet returned. If the query failed, the database would hold a record of an
administrator's access to a trail that was never shown to them. That is
worse than a missing record: it is a record that is not true.

**Why after.** The record is then evidence of a completed read. The ordering
is the claim the record makes, and the ordering makes it true.

### Why a failure does not fail the read

The administrator's request is "show me the trail". That request has been
served. The read record is the **bookkeeping** for that request — PRD §10's
observability requirement, not the administrator's goal.

PRD §10 draws exactly this line for email: "Email send failures are logged;
the triggering action is not blocked." The email case and the read-record case
have the same shape: a primary action has succeeded, and a secondary
recording of it has failed. Blocking the administrator's read because the
bookkeeping failed would make a **database observability problem** into an
**administrator-facing outage** — a strictly worse outcome for the same
underlying fault.

`coding-standards.md` already requires the shape this takes: "every async call
is awaited or explicitly voided with a **logged catch**. PRD §10 requires that a
failed background action is recorded." The read-record write is a failed
background action, and the standard says to log it, not to propagate it.

### Why a bounded inline retry rather than log-only

Log-only is simpler, and it is what a naive implementation does. But it
discards a retryable failure — a deadlock or a momentary connection loss is
**exactly** the case where a second attempt would succeed, and the cost of the
second attempt is one round trip on an error path.

The bound is small on purpose. A retry that ran for seconds would add latency
to a request that is supposed to succeed despite the failure. Three attempts
with no artificial delay is enough to clear a transient condition and short
enough that the administrator does not notice.

### Why the retry is idempotent by construction

This is the part that makes the retry safe, and it is why the `id` is
generated once rather than per attempt.

Story `005` says "Administrator reads the same trail twice | Two read records;
reads are never deduplicated". That rule is about not **collapsing** two
genuine reads into one. The retry must not create the opposite failure — one
read producing two records — because a duplicated read record would
misrepresent the access pattern, which is the very thing PRD §10 requires the
record to be accurate about.

**The mechanism is the primary key.** `audit_read_logs.id` is a uuid primary
key, and the record's `id` is generated once, before the first attempt. Every
attempt writes that same id. If the first attempt actually committed but the
client did not see the response — the classic ambiguous-commit case — the
second attempt is refused by the primary key. The retry is therefore safe in
the one case where safety is hardest, and it needs no comparison of contents
and no delete-before-insert.

This works because the table is append-only: the retry is an **insert**, and
the duplicate is rejected by the key rather than by a delete-then-insert. ADR-6
made the table's trigger refuse all deletions, and that refusal is what makes
the idempotent retry possible without a mutation path.

### Why a bounded retry and not a durable queue

`image-handling.md` §5's Blob orphan queue is the precedent the technical
design flagged, so it deserves a direct answer.

**The two cases are not the same.** A Blob orphan is a **leaked resource** — a
stored object that still occupies quota, costs money against a 1 GB free tier,
and is never reclaimed unless something remembers to reclaim it. A read record
is a **missing observation** — nothing leaks, no quota is consumed, and the
cost of the gap is that one access is not visible in the table.

**The queue would be drained by cron, and Hobby cron is once a day.** B4:
"Any scheduled FindBack work… must tolerate a ±1-hour fire window and must be
**idempotent**. No workflow may depend on cron precision." A cron-drained queue
would leave a read record absent for up to ~24 hours. During that window the
access pattern is **not reviewable** — which is the property PRD §10 requires.
Option 3 therefore does not actually satisfy the requirement it appears to
satisfy; it satisfies it eventually, at a latency the requirement does not
permit.

**A queue also costs a table, a worker, and a second failure mode.** The
worker would need to be scheduled, idempotent, and monitored, and its own
failures would need recording. Under the $0 ceiling there is no queue service
to lean on — the queue would be another PostgreSQL table plus a cron route,
which is more moving parts than the problem justifies.

**A request-triggered drain would have the same latency problem**, and would
add a write to every request that happens to touch the queue.

**The narrowed window makes log-only-plus-retry sufficient.** As set out
above, the read-record write is only attempted after the trail query
succeeded, so the database was reachable moments earlier. The realistic
failures are a deadlock or a momentary connection loss — both of which the
inline retry covers — or an unanticipated error, which is logged. A sustained
outage fails the *read* itself, which is a visible, correct failure.

### Why the retry lives in the application layer

The retry is a **policy**: how many attempts, which failures are transient,
what happens when they are exhausted. Policy belongs in the application layer
(`application → domain + ports`), and the port is the seam.

Putting the retry in the Prisma adapter would mean every caller of
`AuditReadLogRepository.append` inherits the policy, including callers with a
different one. Putting it in the adapter also pushes failure classification —
which is a decision about the database's behaviour — into infrastructure,
where the application cannot see it.

The application service owns the classification table, performs the attempts,
and logs the failure. The adapter performs one insert and surfaces the error.
This keeps `AuditReadLogRepository`'s shape unchanged: `append(read, transaction)`.

### Why unclassified errors are not retried

A retry policy that retries everything is a retry policy that retries defects.
An append-only trigger refusal is a **permanent** condition — it will refuse
every attempt identically, and retrying it three times turns a clear error
into a slower clear error. The classification list is closed and explicit so
that a new failure mode is a deliberate addition to the list, not an accident
of a catch-all.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| Write the read record **before** the query | The record exists even if the query later fails | Records an access that did not happen; a record that is not true is worse than a missing one | The record's purpose is to evidence a completed read |
| Write the read record **in the query's transaction** | One transaction, one commit | A read has no transaction to join; it would put a read inside a write's boundary and hold a transaction open across a potentially long query; contradicts `data-stack.md`'s short-transaction rule | No transaction to join, and the coupling buys nothing |
| **Log only** — no retry | Simplest; no retry classification to maintain | Discards a deadlock or a momentary connection loss that a second attempt would clear; every transient fault becomes a permanent observability gap | The retry is one round trip on an error path and removes the most common cause of a permanent gap |
| **Unbounded retry** | Maximises the chance of recording | A sustained failure would hang the request; the administrator waits for bookkeeping they cannot influence; an unbounded loop is a denial-of-service vector | The bound is three attempts — enough for a transient condition, short enough to be invisible |
| **Retry every failure** | No classification table to maintain | Retries permanent conditions (trigger refusal, CHECK violation) identically every time; hides the real defect behind repeated attempts | The classification list is closed and explicit; unclassified errors are defects |
| **Durable queue + cron worker** | Eventually records every read; survives a process crash; mirrors `image-handling.md`'s Blob orphan pattern | Hobby cron fires **once per day, ±59 min drift**, so the access pattern is unreviewable for up to ~24 h — the requirement is not met in the interim; needs a table, a worker, a schedule, and a second failure mode; costs more under the $0 ceiling | The latency defeats the requirement it is meant to satisfy, and the cases are not alike: a Blob orphan leaks quota, a read record leaks nothing |
| **Durable queue drained by the next request** | No cron; low latency | Still leaves a gap until some later request drains it; adds a write to unrelated requests; two failure modes instead of one | The same objection at lower cost — still no better than the inline retry |
| **Fail the read when the record cannot be written** | Strongest possible guarantee: no read is ever unrecorded | A database observability fault becomes an administrator-facing outage; the administrator loses access to the trail they are entitled to see because bookkeeping failed; contradicts PRD §10's email precedent | Strictly worse for the same underlying fault |
| **Record the read in the trail (`audit_events`)** | One artifact; no separate table | Recurses — reading the record of who read the record would recurse without adding accountability (story `005`); breaks PRD §10's "separate from the audit trail itself" | Excluded by the requirement, not by preference |
| **Record refused reads in `audit_read_logs` too** | Every access attempt is visible | Makes the read log a place where non-administrator activity accumulates; the read log records administrator reads of the trail, and a member's failed attempt is not that | The domain model settles it: a refused read goes to the operational log only |

## Consequences

### Positive

- The read record is **evidence of a completed read**, because it is written
  after the query returns.
- A transient failure (deadlock, momentary connection loss) is **repaired**
  rather than lost, at the cost of one extra round trip on an error path.
- The retry is **idempotent by construction** — one generated id, a primary-key
  rejection for a duplicate — so it cannot produce two records for one read,
  and it needs no delete-before-insert.
- The administrator's read **never fails because bookkeeping failed**.
- No background worker, no cron route, no queue table, no new dependency —
  the $0 ceiling is untouched.
- The failure is **loud**: every failed attempt is logged with the request id
  and `outcome: "error"`, so a gap is visible in the logs as it happens.
- The retry policy and the failure classification are **in the application
  layer**, where they are testable without a database and reviewable by a
  human.

### Negative

- The promise is **"every read is recorded"**, not "every read is recorded
  unconditionally". A failure in the narrow window between a successful query
  and a failed record write — after the retries are exhausted — leaves an
  unrecorded read. This is recorded rather than hidden, because it is the one
  place the promise can break.
- There is **no automatic repair** of that gap. An operator sees it in the
  logs; nothing backfills it. A queue would repair it eventually, at the cost
  of the latency described above.
- The failure classification is a **closed list** that must be maintained. A
  new transient failure mode is not retried until someone adds it.
- Three attempts add **latency to a failing request** — the administrator
  waits for the retries before the trail is returned. The bound is small, but
  it is not zero.
- The application service gains a **responsibility it did not have**: the
  retry loop, the classification, and the logging. It is the first place in
  the codebase where a write is retried.

### Risks

| Risk | Mitigation |
|---|---|
| A read record is permanently lost in the query-succeeds-write-fails window | The failure is logged with `outcome: "error"` and the request id, so every gap is visible. The window is narrow: the database was reachable moments earlier, and the classifier covers the two realistic transient causes. |
| A retry produces a duplicate record, misrepresenting the access pattern | The `id` is generated once before the first attempt and the primary key rejects the duplicate. Asserted in the test stage: a simulated ambiguous commit followed by a retry produces exactly one row. |
| The classification list drifts from reality | The list is short, explicit, and lives in one place in the application layer. It is covered by unit tests that assert each class retries and each non-class does not. |
| An append-only trigger refusal is retried as if transient | The trigger's `23001` is explicitly classified as non-retryable. The append-only guarantee is not weakened by the retry path — the retry is an insert, never a mutation. |
| A future developer adds a queued retry "to be safe" | This ADR is indexed in `decision-index.md`, and B4's cron constraint is recorded alongside it. A durable queue reintroduces the ~24 h unreviewable window that this decision exists to avoid. |
| A sustained database outage makes the *read* fail as well | That is the correct behaviour and the visible one. The read's failure is reported to the administrator with the neutral server-error copy from `EXPERIENCE.md` §4.9. |

## Related

- **Stories**: `005-audit-visibility-and-read-logging` — the durability
  criterion, the "never deduplicated" rule, and the "distinct record type"
  criterion
- **Standards**: `memory-bank/standards/tech-stack.md` (B3 — runtime logs live
  for 1 hour, so the read record must be durable; B4 — Hobby cron runs once per
  day with ±59 min drift, which is why there is no queue; the $0 ceiling),
  `memory-bank/standards/coding-standards.md` (§ Logging — audit-trail reads are
  logged separately and written to the database; the no-floating-promises rule
  that makes the logged catch mandatory),
  `memory-bank/standards/data-stack.md` (short transactions; raw SQL where
  Prisma's abstraction would be wrong),
  `memory-bank/standards/image-handling.md` (§5 — the Blob orphan retry queue,
  the precedent considered and found not to apply),
  `memory-bank/standards/system-architecture.md` (§ API design — RFC 9457
  problem details; § Authorization model — roles are derived, never
  client-asserted)
- **Previous ADRs**: ADR-6 (append-only enforcement — the read log's trigger
  permits no deletion at all, which is what makes the idempotent insert-retry
  possible without a mutation path), ADR-3 (PostgreSQL with Prisma, pooled
  connections), ADR-4 (free-tier constraint as architecture)
- **Artifacts**: `memory-bank/bolts/002-audit-reads/ddd-01-domain-model.md`
  (§ On where the read record is written; the `AuditTrailRead` and
  `AuditTrailReadRefused` domain events),
  `memory-bank/bolts/002-audit-reads/ddd-02-technical-design.md`
  (§ Decisions 1, 2, 3; § Open item 1, which named this as the ADR candidate)
- **Requirements**: PRD §10 (Observability — "Audit-trail reads are themselves
  logged… so the access pattern is reviewable"; Reliability — "Email send
  failures are logged; the triggering action is not blocked"), FR-32
  (administrator-only visibility), FR-31 (append-only trail), FR-10 (the single
  permitted deletion path, which does not apply to the read log)
