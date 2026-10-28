---
bolt: 004-identity-core
created: 2026-10-27T12:25:00Z
status: accepted
superseded_by: null
---

# ADR-12: Use Node's built-in Argon2id for password hashing, require Node ≥ 24, and add no native crypto dependency

## Context

The PRD requires password hashing with "a modern adaptive hashing function" and
leaves "the specific algorithm and work factors" as an Architecture decision
(PRD §10). The unit brief narrows the algorithm:

> Adaptive password hashing (Argon2id); work factors set here
> — `memory-bank/intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md`

The unit brief also requires that the work factors be **configured, not
hardcoded**. No work factor value is specified anywhere in the repository, so
Stage 1 carried it as an open item and Stage 2 had to settle it.

What the repository does *not* specify is **how** Argon2id is obtained. There
are three realistic routes, and the choice between them is not obvious:

1. **Node's built-in `crypto.argon2`** — available from Node 24.
2. **`@node-rs/argon2`** — a Rust-backed native addon on npm.
3. **`argon2`** — the reference C implementation, native, with known build
   friction on serverless platforms.

### What the repository establishes about the runtime

`construction-protocol.md` § Local verification environment records the
prerequisites confirmed available on this host:

| Requirement | Status | Notes |
|---|---|---|
| Node.js | ✅ v24.19.0 | |
| npm | ✅ 11.17.0 | Registry reachable — `npm ping` returned PONG |

Node 24.19.0 is the **Krypton** LTS line. `package.json` declares
`"engines": { "node": ">=20" }`.

### The probe

The availability of `crypto.argon2` was **verified, not assumed**. A
read-only capability probe against the installed runtime confirmed:

- `crypto.argon2Sync` and `crypto.argon2` exist.
- The signature is `argon2Sync(algorithm, parameters)` with `algorithm` a
  string, and the parameter object requires `message`, `nonce`, `parallelism`,
  `tagLength`, `memory`, and `passes`. The familiar `memoryCost` / `timeCost`
  / `salt` names from other libraries are **not** accepted — `salt` must be
  called `nonce`, and `memoryCost` must be `memory`.
- A 32-byte tag is produced.
- Hashing is **deterministic** for the same nonce and parameters.
- A different password produces a different result.

> **Correction, recorded in Stage 4.** This ADR originally stated that the
> parameter object requires **both** `iterations` and `passes`, and it quoted
> a cost table measured with `iterations = 3, passes = 1`. That was wrong in
> a way that mattered. **Node's `Argon2Parameters` has no `iterations` field
> at all** — the iteration count is `passes`, and it is the only field that
> reaches the algorithm. An `iterations` key is accepted silently and
> **ignored**, so the original probe measured a **1-pass** hash while
> labelling it 3-pass. The cost table below was re-measured with the
> correct parameter.
>
> The lesson is recorded in the implementation's comment: a wrong parameter
> name in a hashing library is not a type error, it is a **silently weaker
> hash**. The types caught it in Stage 4 only because `@types/node` was
> raised to the Node 24 line, which the `engines.node` floor required
> anyway.

A second probe measured the wall-clock cost of candidate work factors on this
host, with the corrected parameter:

| Parameters | Cost per hash |
|---|---|
| `memory = 19456` (19 MiB), `passes = 2`, `parallelism = 1` | ≈ 33 ms |
| **`memory = 65536` (64 MiB), `passes = 3`, `parallelism = 1`** | **≈ 160 ms** |
| `memory = 65536`, `passes = 3`, `parallelism = 4` | ≈ 91 ms |
| `memory = 131072` (128 MiB), `passes = 3`, `parallelism = 1` | ≈ 331 ms |
| `memory = 65536`, `passes = 1`, `parallelism = 1` | ≈ 80 ms |

**The corrected numbers change the reasoning, and the decision survives
them.** 160 ms is still comfortably inside the PRD's 1 s write NFR — a login
costs about a sixth of the budget — so 64 MiB / 3 passes remains the right
choice on the OWASP-recommended strength. But the `parallelism = 4` option
is now **less attractive than it looked**: it is 69 ms faster, not 13 ms,
because at 3 passes the 4-lane form's advantage shrinks as the work
divides. The memory argument is unchanged and is now the decisive one:
a 4-lane hash needs roughly 4× the memory per concurrent request, and on a
serverless runtime memory is the scarcer resource. `parallelism = 1` stands.

The `passes = 1` row is recorded for a specific reason: it is what the
**original, incorrect** probe measured. It is kept in the table so the
correction is legible rather than a silent rewrite.

### The forces in play

| Force | Direction |
|---|---|
| The unit brief names **Argon2id** | The algorithm is not open |
| The unit brief requires the work factors be **configured, not hardcoded** | The values must be environment-driven, with defaults |
| PRD §10: write endpoints respond ≤ 1 s at p95 | The login path's dominant cost is one hash verification; it must fit well inside 1 s |
| `tech-stack.md`: "**Vercel Hobby**", budget "**$0 hard ceiling**" | No paid service, and no operational cost from a native build pipeline |
| `tech-stack.md`: "**npm** (user-decided)" | npm is the package manager; adding a dependency is a real decision |
| `tech-stack.md` § Infrastructure: "**Runtime: Node.js (Fluid Compute)**" | The runtime is Node, so a Node-native API is directly usable |
| The deployment target is a **serverless** platform | A native addon must be built or fetched for the target platform on every deploy; a pure-Node API needs nothing |
| Vercel's default Node runtime is **22.x**, with 24 available as a project setting | Choosing the built-in API raises the floor the deployment must meet |
| `coding-standards.md`: "`domain/` must be importable and testable with no database, no network, and no React" | The hashing implementation must not be in `domain/` — it belongs in `infrastructure/` |
| `coding-standards.md`: "**No floating promises**" and "`no-explicit-any` is an error" | A native addon has a callback-style API in some versions; the async built-in API avoids an awkward wrapper |
| Supply-chain surface | Every dependency is code that can be compromised. A built-in API is code already in the runtime, audited with the runtime |

## Decision

**Password hashing uses Node's built-in `crypto.argon2` with the `argon2id`
algorithm. The `engines.node` floor is raised from `>=20` to `>=24`. No
`argon2` or `@node-rs/argon2` dependency is added.**

The work factors are **configuration**, not constants, with the chosen values
as defaults:

| Parameter | Value | Configured via | Meaning |
|---|---|---|---|
| `memory` | 65536 | `AUTH_ARGON2_MEMORY_KIB` | 64 MiB of memory per hash |
| `iterations` | 3 | `AUTH_ARGON2_ITERATIONS` | 3 passes over memory |
| `parallelism` | 1 | `AUTH_ARGON2_PARALLELISM` | 1 lane |
| `tagLength` | 32 | — (fixed) | 256-bit output |
| `algorithm` | `argon2id` | — (fixed) | The unit brief names it |

**The parameters are written into the stored hash**, alongside the salt, so
the hash is self-describing. A password hashed under one set of parameters
still verifies after the configured values are raised — the verification reads
the parameters **from the stored hash**, not from the current configuration.
This is what makes the hashing genuinely *adaptive*: raising the work factors
is a configuration change with no data migration and no invalidation of
existing credentials.

**The implementation lives in `infrastructure/`, never in `domain/`.** The
domain owns a `PasswordHasher` port with two operations — `hash(plaintext)`
and `verify(plaintext, hash)` — and `domain/` has no `node:crypto` import at
all. This keeps the standard's requirement that `domain/` be importable and
testable with no Node runtime.

**Verification compares in constant time.** `verify()` re-derives the hash
using the stored hash's own parameters and compares with
`crypto.timingSafeEqual`.

### The deployment prerequisite, stated plainly

**`crypto.argon2` requires Node ≥ 24.** On Node 22 the function is
`undefined` at runtime and **every password hash fails**.

This has two parts, and they belong to different owners:

1. **A code change** — `package.json`'s `engines.node` is raised from `>=20`
   to `>=24`. Stage 4 performs this.
2. **A deployment setting** — the Vercel project's Node runtime must be set to
   **24**. This is a project setting the owner changes on Vercel; it is not a
   repository change and cannot be made from here.

The second part is the risk. If the deployment is left on Node 22, the failure
is total and immediate rather than partial: registration and login both break.
The failure is loud — `crypto.argon2Sync` is not a function — so it would
surface in the first smoke test rather than silently degrading.

**The alternative, should the Vercel runtime not be movable to Node 24**, is
`@node-rs/argon2`, which works on Node 22 at the cost of a native build on
every deploy. A third option, `crypto.scrypt`, is built in but is **not
Argon2id**, and the unit brief names Argon2id.

## Rationale

### Why the built-in API rather than a dependency

The built-in implementation is **the same algorithm**. Argon2id is Argon2id
whether it arrives through a Rust addon or through Node's own binding; the
hash is equally strong, equally slow to attack, and equally verifiable. The
choice is not between a strong and a weak hash — it is between two ways of
obtaining the same hash.

Given that, the differences are entirely about operational cost:

- **No build step on deploy.** A native addon must be compiled or fetched for
  the target platform on every deployment. Vercel caches these, but the first
  build and any runtime change pays for it.
- **No supply-chain surface.** The unit brief's Argon2id requirement, the PRD's
  adaptive-hashing requirement, and `tech-stack.md`'s $0 ceiling all point the
  same way: the fewer moving parts a security-critical path has, the better.
- **The runtime is Node.** `tech-stack.md` fixes "Runtime: Node.js (Fluid
  Compute)". A Node-native API is directly available; a native addon is
  fighting the platform for no benefit.
- **The async API is native.** `crypto.argon2` is promise-based, which
  satisfies `coding-standards.md`'s "no floating promises" rule without a
  callback wrapper.

### Why the Node ≥ 24 floor is an acceptable cost

The floor is a real constraint, but it is a **constraint on the environment,
not a weakening of the security posture**:

- The repository's own verified prerequisite is Node 24.19.0 — the floor
  matches the version the project already tests against.
- Node 24 is an **LTS** line (Krypton), not a current release.
- Vercel offers Node 24 as a selectable project runtime; it is a settings
  change, not a migration.
- The floor is **declared** in `engines.node`, so a mismatch surfaces as an
  install-time warning rather than a runtime mystery.

Against that, the alternative — pinning a native dependency forever to avoid
one settings toggle — trades a permanent operational cost for a one-time
project setting.

### Why 64 MiB / 3 passes / parallelism 1

The PRD's write NFR is ≤ 1 s at p95. At ~160 ms, a password verification uses
about 16% of that budget, leaving ample headroom for the database round trips
around it. Registration hashes once, off the interactive path.

64 MiB / 3 passes is the **OWASP-recommended second option**; the
recommended *first* option is 19 MiB / 2 passes. The gap between them is
~33 ms and ~160 ms respectively, and both fit the NFR comfortably, so the
stronger option is preferred at no meaningful latency cost. It materially
raises the cost of an offline cracking attempt against a stolen hash table.

**`parallelism = 1` over `4`, despite `4` measuring 69 ms faster.** A 4-way
parallel hash consumes roughly **4× the memory per concurrent request**
(256 MiB rather than 64 MiB). Vercel's Fluid Compute has a constrained memory
budget per invocation, and the deployed system handles concurrent logins.
Trading 69 ms — under 7% of the write NFR — for a 4× reduction in peak memory
per hash is the better trade for a serverless runtime. This is the same
reasoning the $0 ceiling uses elsewhere: the free tier's scarcer resource is
memory, not milliseconds.

**`tagLength = 32`** is the standard Argon2id output length and gives a
256-bit tag. **The algorithm is fixed, not configured**, because the unit
brief names Argon2id — configuring it would allow a future value to weaken
the choice silently.

### Why the parameters live inside the hash

Storing the parameters in a separate database column would make a parameter
change a **data migration**: every existing row would have to be rewritten,
and a migration that failed halfway would leave accounts with a hash whose
parameters no longer match the column. Encoding them in the hash makes the
change a configuration change, makes verification self-describing, and means
**old and new hashes coexist safely** — which is the whole point of an
*adaptive* hashing function. The unit brief requires the work factors to be
configured, not hardcoded; this satisfies that requirement in the strongest
available form, because the configuration is read at hash time and the
per-hash parameters are what verification actually trusts.

### Why the implementation is in `infrastructure/`

`coding-standards.md` requires `domain/` to be "importable and testable with
no database, no network, and no React". A `node:crypto` import in `domain/`
would make the module Node-runtime-dependent and would drag a ~80 ms cost into
every domain test that touched a password. The port/adapter split keeps the
hash algorithm a detail of the outside world, exactly as ADR-9 keeps the
audit catalog's *shape* in the audit module while the firing modules own their
business values.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **`@node-rs/argon2`** | Works on Node 22, so no runtime floor; Rust implementation is fast; widely used | A native addon that must be built or fetched for the target platform on every deploy; adds a supply-chain dependency to a security-critical path; the Rust addon must be kept in step with the Node version | Same algorithm at a strictly higher operational cost, and the Node 24 floor it would avoid is a one-time project setting rather than a permanent dependency. Kept as the **documented fallback** if the Vercel runtime cannot be moved to Node 24 |
| **`argon2`** (the reference C implementation) | The reference implementation; the most battle-tested | Known build friction on serverless platforms; node-gyp builds are a recurring source of deploy failures; older maintenance cadence than the Rust addon | Build friction on the deploy target is the wrong property to buy with |
| **`crypto.scrypt`** (built in) | No dependency; no version floor; available on Node 20 | **Not Argon2id.** The unit brief names Argon2id. scrypt is a memory-hard KDF and perfectly respectable — but the brief is the authority here, and substituting it silently would be a scope change | The brief names Argon2id; substituting a different algorithm is a product decision, not an implementation one |
| **Hash the password with a fast digest (SHA-256) plus a per-account salt** | Trivial; no work factor | Not adaptive. A fast digest is exactly what an offline attacker wants; the PRD requires an *adaptive* function and `coding-standards.md` forbids "no password, hash, or token" appearing in logs — a fast digest would also be a single point of failure for the entire credential store | Fails the PRD outright |
| **Use bcrypt** | Mature and widely deployed | Not Argon2id; bcrypt truncates at 72 bytes and its cost parameter is logarithmic rather than directly memory-tunable | The brief names Argon2id, and memory-hardness is the point of choosing it |
| **Keep the dependency but pin Node 22 forever** | No runtime change | A permanent dependency and permanent build pipeline, to avoid one settings toggle | Trades a one-time cost for a permanent one |
| **Store the parameters in database columns beside the hash** | Parameters are queryable and uniform across rows | A parameter change becomes a **data migration**; a partial migration leaves hashes whose parameters disagree with the column; the hash stops being self-describing | The encoded hash is strictly safer and is what "adaptive" means |
| **Make the work factors hardcoded constants** | Simple; no configuration surface | The unit brief explicitly requires them to be "configured, not hardcoded". Constants also mean raising them requires a code change and a deploy | The brief requires configuration |
| **Allow the algorithm to be configured** | Flexibility | A future configuration error could silently select a weaker algorithm | The brief names Argon2id; the algorithm is fixed and the work factors are the tunable part |

## Consequences

### Positive

- **No dependency is added to a security-critical path.** The hashing
  implementation is code already present in the runtime and audited with it.
- **No native build on deploy.** Nothing to compile, nothing to fetch for the
  target platform.
- **The hash is self-describing.** Parameters travel with the hash, so
  verification does not depend on the current configuration being unchanged.
- **The work factors can be raised in production at any time**, without a
  migration and without invalidating a single existing credential.
- **The measured cost fits the NFR with headroom** — ~81 ms against a 1 s
  write budget.
- **Peak memory per hash is bounded at 64 MiB**, rather than the ~256 MiB a
  4-lane hash would need on a memory-constrained serverless runtime.
- **The domain layer stays pure.** No `node:crypto` import in `domain/`;
  the module is testable with no Node runtime.
- **The implementation is exercised by the same runtime the project already
  tests on** — Node 24.19.0, recorded in `construction-protocol.md`.

### Negative

- **The deployment must run Node ≥ 24.** This is a hard prerequisite, and on
  Vercel it is a **project setting**, not a repository change. It cannot be
  made from this repository, and if it is missed the failure is total —
  every password hash fails.
- **The built-in API's parameter names differ from the common Argon2
  libraries.** `nonce` rather than `salt`, `memory` rather than `memoryCost`,
  and the iteration count is `passes`. The implementation must use the Node
  names exactly. **The dangerous part is that a wrong name is not an error:**
  passing an `iterations` key is accepted silently and ignored, so the
  resulting hash is *weaker than intended* rather than broken. Stage 4 found
  exactly this in the ADR's own first cost table, and the implementation
  translates the option to `passes` at the single call site so the mistake
  cannot recur.
- **The `engines.node` floor rises**, which could affect any other tooling
  that assumes Node 20.
- **There is no third-party fallback if the runtime constraint is a blocker.**
  The fallback would be to adopt `@node-rs/argon2` — which reintroduces
  everything this ADR set out to avoid.

### Risks

| Risk | Mitigation |
|---|---|
| **The Vercel project stays on Node 22 and every password hash fails** | The failure is **loud**, not silent — `crypto.argon2Sync` is not a function on Node 22, so the first smoke test fails immediately rather than degrading. The owner sets the runtime to Node 24 before deploying; `engines.node` is raised in Stage 4 so the requirement is declared in the repository. **This risk is open until the owner confirms the Vercel runtime.** |
| The Node 24 API changes in a future major version | The API is stable within the Node 24 LTS line, and `engines.node` declares the floor. A future major-version bump is caught by the typecheck and the test suite |
| `crypto.argon2Sync` is CPU-bound and blocks the event loop | The **async** `crypto.argon2` is used, not the synchronous variant. The synchronous form exists in the design only as the mechanism used by the cost probe |
| The configured work factors are set too high and push login past the NFR | The values are configuration, so they can be lowered without a deploy if a future runtime is slower. Stage 5 asserts the measured verification cost against the 1 s write NFR |
| The configured work factors are set too low and weaken the hashes | The defaults are the OWASP second option and are measured at ~160 ms; the configured floor is a deployment concern and is documented with these defaults |

## Related

- **Stories**: `001-self-registration` (password hashing on creation),
  `002-administrator-review-of-registrations` (no password operation),
  `003-login-with-active-account` (password verification on every attempt),
  `009-reset-password` (bolt `005-identity-security` — hashing a new password)
- **Standards**:
  `memory-bank/intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md`
  (Argon2id named; work factors configured, not hardcoded),
  `memory-bank/standards/coding-standards.md` (§ File and folder organization —
  `domain/` purity; § Security coding rules — no secret in a log),
  `memory-bank/standards/tech-stack.md` (§ Authentication — adaptive hashing;
  § Infrastructure — Node.js Fluid Compute; § Package Manager — npm; budget:
  $0 hard ceiling),
  `memory-bank/standards/system-architecture.md` (§ Security and privacy —
  "Adaptive hashing (Argon2id); work factors set in `infrastructure/auth`")
- **Previous ADRs**: ADR-3 (audit written inside the state-change transaction),
  ADR-9 (the audit catalog's home) — neither bears on this decision, but both
  establish the "the module owns its rules, the infrastructure owns the
  outside world" pattern this ADR follows
- **Artifacts**:
  `memory-bank/bolts/004-identity-core/ddd-01-domain-model.md`
  (§ Open item 3 — the Argon2id work factors are unconfigured),
  `memory-bank/bolts/004-identity-core/ddd-02-technical-design.md`
  (§ The work-factor decision; § Security Design; § Open item 4 —
  `engines.node` must be raised to `>=24`)
- **Requirements**: FR-1 (Self-Registration — password policy and hashing),
  FR-4 (Login and Logout — verification on every attempt), FR-51 (password
  reset, bolt `005`), PRD §10 (Security — "a modern adaptive hashing
  function"; NFR write endpoints ≤ 1 s at p95)
