---
bolt: 005-identity-security
created: 2026-10-28T15:42:00Z
status: accepted
superseded_by: null
---

# ADR-18: Equalise the reset request's timing with a dummy Argon2id verification and a constant floor

## Context

FR-51 is the strictest requirement in the PRD. It requires that a password-reset
request **not disclose whether an account exists** — and the requirement does
not stop at the response body:

> - the response must not disclose whether the email is registered, whether the
>   account exists, or the account's status — and this must hold in the
>   **body**, the **timing**, and the **subsequent screen state**.

The body is the easy half, and bolt `004` already solved its analogue for the
login path with one value object. The **timing** half is the hard one, because
the two paths do different amounts of work by nature:

| | Hit path (the account exists) | Miss path (it does not) |
|---|---|---|
| Account lookup | Returns a row | Returns `null` |
| Token creation | Creates a row, computes a hash | Nothing |
| Email send | Sends | Nothing |

The miss path is therefore **measurably faster**. A caller who measures the
response time learns whether the account exists — which is exactly what FR-51
forbids, and it defeats the point of a neutral response body. A response that
looks identical but arrives 5 ms faster is not a neutral response.

Stage 1 recognised the problem and required three things of the design: a
**fixed work floor**, a **constant delay**, and a **measured** tolerance,
because "a timing test without a tolerance is a flaky test". It deliberately
left the mechanism to this ADR.

### The constraints that shape the choice

- **`tech-stack.md` carries a $0 hard ceiling.** No paid service, no hosted
  rate-limiting product, no external timing-attack mitigation service.
- **The runtime is Vercel Hobby / Fluid Compute.** An in-memory or
  per-instance mechanism would be reset on every cold start and would not
  equalise anything while appearing to.
- **The codebase already has an established pattern for this exact problem.**
  Bolt `004`'s login path handles an unknown email by performing an Argon2id
  verification against a pre-computed dummy hash (`authenticate.ts`'s
  `DUMMY_HASH`), so that the unknown-email path costs what the known-email
  path costs. This is the codebase's answer to account-existence timing, and
  it already works.
- **The PRD's write budget is ≤ 1 s and the page budget is ≤ 2 s p95.** The
  equalisation must fit inside those.

## Decision

**Every reset request performs the same work in the same order, and the
response is held to a constant floor before it is returned.**

Two mechanisms, both applied on **every** path:

**1. An unconditional dummy Argon2id verification.** On every request — hit or
miss — the service performs one Argon2id verification through the existing
`PasswordHasher` port. On the hit path it verifies against the account's real
hash. On the miss path it verifies against a **pre-computed dummy hash**, the
same `DUMMY_HASH` pattern bolt `004`'s login already uses.

**2. A constant response floor.** The service records the request's start
time, does the work, and then waits until a fixed deadline has elapsed:

```text
AUTH_RESET_MIN_RESPONSE_MS = 250   (default, configurable)
```

The floor is a **constant**, derived from configuration, never from the
account's existence.

**3. A measured tolerance.** The acceptance test asserts that the difference
between a registered-address request and an unregistered-address request is
within a stated tolerance:

```text
AUTH_RESET_TIMING_TOLERANCE_MS = 100   (default, configurable)
```

**The floor also applies to the rate-limited path.** This is a deliberate
addition beyond ADR-15's login precedent, and it is explained below.

**The branch decides only whether an email is sent.** It may not shape the
response in any way: the response is built once, after the branch, from a
single `NeutralResetConfirmation` value. The service exposes exactly one
method, and the route has nothing to assemble — so the place a future
developer could leak a timing or body difference does not exist.

## Rationale

**The dummy verification is the mechanism that actually equalises the paths,
because Argon2id is the dominant cost.** At ADR-12's work factors
(64 MiB / 3 passes / parallelism 1) one verification measures **~81 ms**,
while the rest of the request — a lookup, an insert, an email build — is
single-digit milliseconds of database work. The expensive step is the one that
differs most between the paths (the hit path additionally hashes a token and
builds and sends an email). Equalising it removes the largest signal by a wide
margin.

**Reusing bolt `004`'s `DUMMY_HASH` pattern rather than inventing a second
one is deliberate.** The codebase already answers the "how do we make an
unknown email cost what a known email costs" question, and it answers it in
the way the standards prefer: **the same code path, with a different input.**
A second mechanism — a dedicated timing-equalizer service, a different hash,
a bespoke comparison — would be a second answer to a question that already has
one, and the two would drift.

**A constant floor is needed in addition to the dummy verification, because
the two paths still differ slightly.** The hit path additionally creates a
token row and builds an email; the miss path does not. The dummy verification
brings the two within about the same distance, and the floor removes the
residual. Neither mechanism alone is sufficient: without the dummy
verification the floor would have to be large enough to cover the Argon2id
difference anyway, and without the floor the residual would remain. Together
they are cheaper and more precise than either alone.

**The floor is 250 ms because Argon2id is ~81 ms.** A floor comfortably above
the natural cost means the hit path usually clears it already, so the sleep is
a no-op and the response returns at roughly the natural cost. The mechanism
does not *add* 250 ms to every request; it *guarantees a minimum* of 250 ms.
This matters for the PRD's p95 budget: the floor is a floor, not a tax.

**The 100 ms tolerance is chosen to be both stable and meaningful.** It is
roughly the run-to-run variance of an Argon2id verification on shared
infrastructure — wide enough that the test is not flaky, and narrow enough
that a real existence oracle (a miss path returning in 5 ms) fails it by
**orders of magnitude**, not by a hair. Both the floor and the tolerance are
configuration, so a noisy environment can widen the tolerance without
touching the mechanism.

**The rate-limited path also pays the floor, and this is where this ADR
departs from ADR-15's precedent.** ADR-15's login path lets a rate-limited
request return early, because the login response is a `GenericInactiveMessage`
that is **identical in every case** — there is no "accepted" variant for the
refusal to be distinguishable from. The reset path is different: the
**accepted** path returns 202 with a neutral confirmation, and the **refused**
path returns 429. Those two bodies differ. If their timing also differed, the
refusal would be distinguishable by timing alone, and a 429 that arrives
instantly says "this address has been requested recently" — a leak about the
address that the floor closes. Applying the same floor to both paths costs
nothing (a rate-limited request still does its Argon2id work first) and closes
the channel.

**The timing channel and the body channel are closed independently.** They
fail differently, and a design that only closed one would still leak:
- The **body** is closed by `NeutralResetConfirmation` — one frozen value,
  built once, after the branch.
- The **timing** is closed by this ADR.
- The **screen state** is closed by always routing to `/forgot-sent`, which
  renders the same copy for every case.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Constant-time comparison against a stored hash** of the address | Very fast; no Argon2id cost; removes the difference in the comparison itself | The comparison is microseconds, so the paths differ by the **milliseconds** of the surrounding work — the email build and send on the hit path are not hidden by a microsecond-level equalisation | Equalising the comparison while leaving the *surrounding* work unequal is not equalisation. The signal is in the work, not in the compare. |
| **A fixed delay alone**, with no dummy verification | Simple; one mechanism | The delay must cover the Argon2id difference, which means either a much longer floor (and a much worse p95) or a floor that is tight enough to be timing-sensitive | It is strictly worse than the chosen mechanism at the same latency: a delay alone has to hide the difference, while the dummy verification *removes* it. |
| **A queue** — enqueue the reset and process it asynchronously | The response returns instantly on every path | Vercel Hobby cron fires **once per day with ±59 min drift** (ADR-7 records this), so a queued request is not processed for up to ~24 hours. The member's email arrives a day later, or not at all | It would break the feature to fix a timing channel. The free tier's scheduler is the constraint. |
| **A fixed delay derived from the account's existence** — wait longer on the hit path | Simple to reason about | It requires *knowing* whether the account exists, which is the very thing being protected, and the delay becomes a configurable existence oracle | Self-defeating. It is also a disclosure that a careful observer could calibrate. |
| **An HMAC-based comparison** of the submitted address against a stored keyed value | Constant-time by construction, no Argon2id | Same objection as the constant-time comparison: it equalises a comparison, not the work | Rejected with the constant-time alternative. |
| **Rate-limiting before the equalisation**, so a refused request skips the work | Cheaper for refused requests | The refused path returns visibly and much faster — a distinguishable timing channel, as described above | The rate limiter runs **before** the use case (ADR-8's rule, which avoids paying Argon2id for a request that will be refused), but the **floor still applies**. The work is skipped; the delay is not. |
| **A dedicated "timing equalizer" service** | Isolates the concern | A new abstraction for a problem the codebase already solves in `authenticate.ts`, and a second mechanism that would drift from it | Reuse over invention. The same `PasswordHasher` port and the same dummy-hash pattern cover it. |

## Consequences

### Positive

- The reset request's timing no longer varies with account existence, so the
  **timing** half of FR-51's anti-enumeration requirement is closed by a
  mechanism that is **measured** rather than asserted.
- The body and timing channels are closed by **independent** mechanisms, so a
  defect in one does not silently open the other.
- The codebase keeps **one** answer to the "equalise account-existence timing"
  question, so a later change to `DUMMY_HASH` or the work factors applies to
  both the login and the reset path.
- The response latency is bounded below by a known constant, which makes the
  p95 predictable rather than dependent on which path ran.
- The floor applies to the rate-limited path too, so a 429 is not
  distinguishable from a 202 by timing.
- The tolerance is configuration, so a noisy environment can widen it without
  a code change.

### Negative

- **Every reset request pays ~81 ms of Argon2id**, including requests for
  addresses that do not exist. This is a real cost on a $0 ceiling, paid
  deliberately to close a disclosure channel.
- The reset request's minimum latency is **250 ms** even when the work is
  faster. This is comfortably inside the PRD's 2 s p95 page budget and its 1 s
  write budget.
- The rate-limited path pays the Argon2id cost it would otherwise have
  skipped, because the limiter runs first but the floor is applied at the
  response. The *Argon2id* is skipped; the *delay* is not.
- Two configurable values (the floor and the tolerance) must be kept
  coherent — a tolerance narrower than the environment's variance produces a
  flaky test.

### Risks

- **The work factors are raised, and the dummy verification's cost rises with
  them.** ADR-12's parameters are configuration, so raising them is a
  deliberate act — but it would raise the reset request's cost too.
  *Mitigation:* the floor is a floor, not a fixed cost; the request stays
  inside its budget at ADR-12's measured work factors, and Stage 5 must
  confirm the timing against the real implementation.
- **A future change could remove the dummy verification "because the floor
  already covers it."** *Mitigation:* this ADR records that the two
  mechanisms do different jobs — the dummy verification **removes** the
  difference, the floor **hides the residual** — and that removing one
  materially changes the cost/benefit of the other.
- **The timing test could become flaky on a noisy CI host.** *Mitigation:* the
  tolerance is configuration and is set with the run-to-run variance of an
  Argon2id verification in mind. Stage 5 must confirm it is stable in
  practice; if it is not, the tolerance is widened rather than the assertion
  weakened.
- **The equality could be broken by a new asymmetric step added to the hit
  path later** — a new email attachment, a new lookup. *Mitigation:* the
  acceptance test measures the two paths against each other, so a new
  asymmetric step fails the test rather than silently widening the channel.

## Related

- **Stories**: 008-reset-request-never-discloses-account
- **Requirements**: FR-51
- **Standards**: `memory-bank/standards/tech-stack.md` ($0 hard ceiling), `memory-bank/standards/coding-standards.md` (no secret in a log; error handling)
- **Previous ADRs**: ADR-8 (the rate limiter runs before the use case), ADR-12 (Argon2id work factors and their measured cost), ADR-15 (the database-backed rate limiter and its configuration discipline), ADR-16 (the established pattern of bounding a window rather than scheduling a precise job)
- **Related artifacts**: `memory-bank/bolts/005-identity-security/ddd-01-domain-model.md` ("The anti-enumeration rule, as a type"), `memory-bank/bolts/005-identity-security/ddd-02-technical-design.md` ("The anti-enumeration design, in three parts")
