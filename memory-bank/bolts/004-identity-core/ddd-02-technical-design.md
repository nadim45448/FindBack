---
unit: 001-identity-and-access
bolt: 004-identity-core
stage: design
status: complete
created: 2026-10-27T11:40:00Z
updated: 2026-10-27T18:30:00Z
intent: 001-findback-lost-and-found
stories:
  - 001-self-registration
  - 002-administrator-review-of-registrations
  - 003-login-with-active-account
  - 005-logout-revokes-session
  - 006-pending-member-restricted-access
  - 007-owner-rejects-registration
---

# Technical Design - Identity and Access

> **Stage 2 output.** Documentation only — no application source code was
> read, written, or modified to produce this artifact, per the DDD bolt type's
> Stage 2 constraint. The one exception is a set of **read-only capability
> probes** against the Node runtime and the npm registry, needed to settle two
> decisions that cannot be resolved from the repository: whether Argon2id is
> available without a native dependency, and what the Argon2id work factors
> cost in wall-clock time. Those probes are recorded in full below and are
> reproducible.
>
> Transforms `ddd-01-domain-model.md` into a technical design. Product
> behaviour remains as the frozen PRD defines it.

## Architecture Pattern

**Hexagonal (ports and adapters) inside the layered modular monolith already
fixed by `system-architecture.md`, reusing the transaction and audit-write
discipline bolt `001-audit-core` established.**

| Element | Choice | Rationale |
|---|---|---|
| Module | `src/domain/accounts/` + `src/application/accounts/` + `src/infrastructure/accounts/` | **Conforms to the module map in `system-architecture.md`**, which names `accounts/` for "Account lifecycle, session, password reset" — exactly this bolt's scope, and bolt `005`'s too. `coding-standards.md` § File and folder organization independently names `domain/accounts/`. The name was `identity/` in the first draft of this design; **ADR-13 withdraws that**, because two standards and three prior bolts say `accounts/`. |
| Port shape | `AccountRepository`, `SessionRepository` — domain-owned interfaces in `application/accounts/ports/` | The domain defines what it needs; infrastructure implements it. Same direction as bolt 001's `AuditEventRepository`. |
| Transaction model | Every state-changing use case runs inside a caller-supplied transaction, and the audit write takes that same handle | ADR-3's decision 3: "an audit entry for a transition that did not happen is a defect". The `accounts` module therefore **reuses** `TransactionHandle` and `TransactionFactory` from bolt 001 rather than inventing a parallel mechanism. |
| Cross-context writes | The `accounts` module calls `AuditWriter.record(...)` inside its own transaction | The trail completes the caller's transaction; it must never commit independently. This is bolt 001's established contract, not a new one. |
| Actor resolution | One port, `ActorContextResolver`, consulted by every request | Story 006: the restriction is enforced **once**, at the `ActorContext` boundary. A single resolver is what makes "once" true. |
| Read model | No separate read model. Account reads are single-row lookups by id or by email | The account surface is small and bounded; FR-14's search is over reports, not accounts. A CQRS read model here would be cost without benefit. |
| Logging | The existing `OperationalLogger` port, fed by `RequestContext` | `RequestContext` is a closed shape with **no field capable of holding a password, hash, token, or email**. That is the mechanism that keeps credentials out of logs, and it already exists. |

**Why not JWTs.** The PRD's A2 and `tech-stack.md` require server-side
revocation. A JWT cannot be revoked without a denylist, and a denylist is a
server-side session table with extra steps. A database row is the mechanism the
PRD names.

**Why not an external identity provider.** Explicitly out of scope (PRD §2.2,
§6.2). It would also breach the $0 ceiling and the "no external IdP" line in
`tech-stack.md` § Authentication.

**Why not an ORM entity as the domain entity.** The `Account` domain entity
and the `accounts` table row are different things: the domain entity has
behaviour (`approve()`, `reject()`) and the row does not. Prisma models the
row; the domain owns the entity. The row is mapped to the entity at the
repository boundary.

## Layer Structure

```text
┌──────────────────────────────────────────────────────────┐
│      Presentation                                          │
│  src/app/(public)/register/page.tsx                       │
│  src/app/(public)/login/page.tsx                          │
│  src/app/(public)/pending/page.tsx                        │
│  src/app/(public)/pending-registered/page.tsx             │
│  src/app/api/auth/register/route.ts                       │
│  src/app/api/auth/login/route.ts                          │
│  src/app/api/auth/logout/route.ts                         │
│  src/app/api/admin/registrations/[id]/decision/route.ts   │
├──────────────────────────────────────────────────────────┤
│      Application                                           │
│  application/accounts/                                    │
│    register-account.ts          (use case)                │
│    review-registration.ts       (use case: approve/reject)│
│    authenticate.ts              (use case: login)         │
│    logout.ts                    (use case)                │
│    resolve-actor.ts             (use case: ActorContext)  │
│    list-pending-registrations.ts(use case: FR-3 queue)    │
│    ports/account-repository.ts                           │
│    ports/session-repository.ts                           │
│    ports/password-hasher.ts                             │
│    ports/csrf-token-validator.ts                        │
├──────────────────────────────────────────────────────────┤
│      Shared ports (cross-module)                        │
│  application/ports/                                      │
│    email-sender.ts            (ADR-14 — shared with the  │
│                               │  notifications module)   │
│    rate-limiter.ts            (ADR-15 — shared by every  │
│                               │  rate-limited route)     │
├──────────────────────────────────────────────────────────┤
│      Domain                                                │
│  domain/accounts/                                         │
│    account.ts                (aggregate root + invariants)│
│    account-status.ts         (AccountStatus)              │
│    session.ts                (aggregate root + invariants)│
│    actor-context.ts          (ActorContext + capability)  │
│    email-address.ts          (value object + normalization)│
│    password-policy.ts        (FR-1 rules)                 │
│    password-hash.ts          (value object)               │
│    self-declared-role.ts     (value object)               │
│    rejection-reason.ts       (value object)               │
│    generic-inactive-message.ts (value object)              │
│    registration-error.ts     (typed domain errors)        │
├──────────────────────────────────────────────────────────┤
│      Infrastructure                                       │
│  infrastructure/accounts/                                 │
│    prisma-account-repository.ts                           │
│    prisma-session-repository.ts                           │
│    node-argon2-password-hasher.ts                         │
│    smtp-email-sender.ts       (ADR-14 — implements the    │
│                               │  shared EmailSender port) │
│    database-rate-limiter.ts     (ADR-15 — implements the  │
│                               │  shared RateLimiter port) │
│    cookie-session-store.ts       (__Host- cookie handling) │
│    csrf-token-store.ts                                    │
│    email-normalizer.ts                                    │
│  infrastructure/db/  (existing — Prisma client, tx factory)│
└──────────────────────────────────────────────────────────┘
```

**Why `email-sender.ts` and `rate-limiter.ts` sit in `application/ports/` and
not in `application/accounts/ports/`.** Both are **shared** mechanisms: the
FR-27 email's transport will also serve the `notifications` module (ADR-14),
and the rate limiter will serve every rate-limited route in the system
(ADR-15). A port owned by one module and consumed by another is a dependency
in the wrong direction, and `coding-standards.md`'s dependency rule forbids
`accounts → notifications`. The shared location already exists and already
holds the project's cross-cutting ports — `AuditEventRepository`,
`AuditReadLogRepository`, `OperationalLogger`, `TransactionFactory`,
`TransactionHandle`.

The `accounts`-specific ports stay in `application/accounts/ports/`, because
only this module consumes them.

Dependency direction, per `coding-standards.md`: `domain → nothing`,
`application → domain + ports`, `infrastructure → domain + application ports`,
`app/ui → application`. The `domain/accounts/` module has no Prisma import, no
`node:crypto` import, and no framework import — it is testable with no
database, no network, and no Node runtime.

**The one Node import that does exist is in `infrastructure/`, not
`domain/`.** The password policy is pure; the *hashing* is infrastructure. The
`PasswordHasher` port lives in `application/accounts/ports/`, and the Argon2id
implementation lives in `infrastructure/accounts/`. This keeps `domain/` importable
and testable everywhere, which is the standard's actual requirement.

## API Design

This bolt is **backend-first**. It delivers the use cases, the ports, the
persistence, and the route handlers that the surfaces need. The **pages** that
render those surfaces are Unit 007's, per its brief ("All business rules —
Units 001 through 006") and its explicit surface list (§9.1, §9.3, §16.1–§16.3).

This split is stated precisely because it is the most likely place for scope
drift: this bolt owns the *rules* and the *endpoints*; Unit 007 owns the
*rendering*. The route handlers here are thin — parse, call the use case, map
the result to a response — per `coding-standards.md` ("No business rules in
`app/`").

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/api/auth/register` | POST | `{ displayName, email, password, selfDeclaredRole }` | 201 `{ status: 'Pending' }` → redirect to `/pending-registered`. 409 on duplicate email (FR-1's duplicate-email validation error). 422 on password-policy failure. 429 when rate-limited. |
| `/api/auth/login` | POST | `{ email, password }` | 200 `{ actorStatus }` + `Set-Cookie: __Host-…`. `actorStatus` ∈ `Active` \| `Pending`. **Every** refusal — wrong password, unknown email, `Rejected`, `Deactivated` — returns the **same** 401 body and the same copy (FR-4). |
| `/api/auth/logout` | POST | CSRF token + session cookie | 204, session revoked, cookie cleared. **Idempotent** — a second logout is also 204 (story 005 criterion 4). |
| `/api/admin/registrations` | GET | administrator session | 200 — pending registrations ordered by submission time (FR-3). 403 for a non-administrator. |
| `/api/admin/registrations/:id/decision` | POST | `{ decision: 'approve' \| 'reject', reason? }` + CSRF + administrator session | 200 `{ status }`. 409 when the account is no longer `Pending` (story 002 criterion 4). 403 for a non-administrator. |
| *(internal)* `ActorContextResolver.resolve(sessionToken)` | — | `SessionToken` | `ActorContext` \| `null` |
| *(internal)* `RegisterAccount.execute(command)` | — | `RegisterAccountCommand` | `Account` |
| *(internal)* `ReviewRegistration.execute(command)` | — | `ReviewRegistrationCommand` | `Account` |
| *(internal)* `Authenticate.execute(command)` | — | `AuthenticateCommand` | `AuthenticatedActor` \| `GenericInactiveMessage` |
| *(internal)* `Logout.execute(command)` | — | `LogoutCommand` | `void` — always succeeds |

### The refusal contract, stated exactly

FR-4, story 003 criterion 5, and story 007 criterion 3 all turn on the same
property, so it is specified here rather than left to implementation:

```text
Wrong password          ─┐
Unknown email           │
Rejected account        ├─►  401 { "error": "We couldn't sign you in. Your
Deactivated account     │          account is not active. If you think this is
                         │          a mistake, contact your administrator." }
                         ┘
```

One status code, one body, one copy, for all four cases. The **operational
log** distinguishes them via the internal `LoginRefused.reason`; the **HTTP
response** does not. A test asserts the four responses are byte-identical.

### The `Pending` route contract

FR-2 requires that a `Pending` actor's write attempts return **HTTP 403**.
The rule is enforced in the application layer by a single guard that reads
`ActorContext.status`:

```text
ActorContext.status === 'Active'   → the request proceeds
ActorContext.status === 'Pending'  → 403, no business operation runs
```

Downstream units call the same guard. It is one function in one place, and
the `ActorContext` carries the status so no unit re-reads the account to
decide.

**The guard's 403 body is a member-facing message** — `EXPERIENCE.md` §4.8:
"Your account is pending administrator approval. This part of FindBack will be
available once your account is approved." §4.8 also requires that this be a
**non-blocking** screen rather than a redirect loop, and that the pending
banner remain visible.

### Route ownership

| Route | This bolt | Unit 007 |
|---|---|---|
| `POST /api/auth/register` | ✅ handler + use case + rules | — |
| `/register` page | — | ✅ rendering |
| `POST /api/auth/login` | ✅ handler + use case + rules | — |
| `/login` page | — | ✅ rendering |
| `POST /api/auth/logout` | ✅ handler + use case | — |
| `/pending`, `/pending-registered` pages | — | ✅ rendering |
| `GET /api/admin/registrations` | ✅ handler + query use case | — |
| `POST /api/admin/registrations/:id/decision` | ✅ handler + use case | — |
| `/admin/registrations` page | — | ✅ rendering |

**The approval email is owned by this module end to end** — the trigger, the
content, and the transport. **ADR-14** resolves the conflict between the unit
brief (which places FR-27 in unit 001 because "approval is an account-lifecycle
action") and the standards' module map (which assigns FR-27..FR-30 to
`notifications/`).

The resolution: **an email's owner is the module that owns its trigger.** FR-27
is the only one of the eight workflow emails whose trigger is an account
lifecycle transition, so it belongs to `accounts/`. The other seven (FR-28,
FR-29, FR-46 events 4–8) and the FR-51 reset message keep their triggers in
the Claim, Recovery Response, and report workflows, so `notifications/` owns
them.

The **transport** is a shared port, not a module-to-module call:

```text
src/application/ports/email-sender.ts   ← the shared port
        ▲                              ▲
        │ implements                   │ implements
src/infrastructure/accounts/      src/infrastructure/notifications/
  smtp-email-sender.ts              smtp-email-sender.ts
```

The port lives in `application/ports/` alongside the existing cross-cutting
ports (`AuditEventRepository`, `OperationalLogger`, `TransactionFactory`),
because a port owned by one module and used by another is a dependency in the
wrong direction. `coding-standards.md`'s dependency rule forbids
`accounts → notifications`.

The subject line and the "link to the application login page, no auto-login
token" requirement (FR-27) are this bolt's contract. The email copy is
UX-governed: `coding-standards.md` requires user-facing wording to match
`EXPERIENCE.md`, and editing it re-opens frozen UX.

**The email is sent after the commit**, never inside the transaction
(ADR-3, decision 4). A send failure is logged and the approval stands
(PRD §10). There is no outbox table — ADR-14 explains why.

## Data Persistence

The `prisma/schema.prisma` scaffold currently holds only the three audit
tables. This bolt adds three identity tables.

| Table | Columns | Relationships |
|---|---|---|
| `accounts` | `id` (uuid PK), `email` (text, **not null**), `password_hash` (text, not null), `display_name` (text, not null), `self_declared_role` (text, not null), `self_declared_role_other` (text, null), `status` (text, not null), `is_administrator` (boolean, not null, default false), `rejection_reason` (text, null), `created_at` (timestamptz, not null), `activated_at` (timestamptz, null), `deactivated_at` (timestamptz, null) | Self-referencing nothing. Referenced by `sessions`, `audit_events.parent_id` (parentType `account`), and — in later units — reports and claims. |
| `sessions` | `id` (uuid PK), `account_id` (uuid, not null), `token_hash` (text, not null), `created_at` (timestamptz, not null), `last_activity_at` (timestamptz, not null), `expires_at` (timestamptz, not null), `revoked_at` (timestamptz, null), `revocation_reason` (text, null) | `account_id` → `accounts.id` **with `ON DELETE RESTRICT`**. |
| `password_reset_tokens` | `id` (uuid PK), `account_id` (uuid, not null), `token_hash` (text, not null), `created_at` (timestamptz, not null), `expires_at` (timestamptz, not null), `used_at` (timestamptz, null) | `account_id` → `accounts.id`. **Created by bolt `005`, not by this bolt** — the table is added now so the schema is coherent, and it stays empty until bolt 005. |
| `rate_limit_counters` | `id` (uuid PK), `bucket_key` (text, not null), `window_start` (timestamptz, not null), `count` (int, not null) | **No foreign keys** — a counter is a fact about a key, not about an account, and it must outlive any particular account. `UNIQUE (bucket_key, window_start)` makes the increment atomic (ADR-15). |

### Column decisions that carry weight

**`email` is stored normalized — trimmed and lower-cased — and carries a
unique index.** This is one decision that satisfies three separate
requirements at once: story 001's edge case ("duplicate email differing only in
case → treated as duplicate"), story 001's edge case ("email with
leading/trailing whitespace → trimmed before uniqueness check"), and story
003's edge case ("case-differing email at login → matches; email is normalized
on write"). A **functional unique index on `lower(btrim(email))`** makes the
database the final arbiter, so a race between two concurrent registrations
cannot create two accounts with the same address.

Normalization happens **in the domain**, at the `EmailAddress` value object's
construction, so the value that reaches the database is already normalized.
The functional index is the backstop, not the primary mechanism — the same
"structural first, database second" pattern bolt 001 used for `event_number`.

**`status` is a text column with a CHECK constraint, not a database enum.**
The four states are `Pending`, `Active`, `Rejected`, `Deactivated` — the PRD's
verbatim names. A CHECK constraint (`status IN ('Pending','Active','Rejected',
'Deactivated')`) keeps the database from accepting an invalid state without
requiring a migration to add one. This matches bolt 001's reasoning for
`event_type`: a status set that could change would read as a change to a
frozen vocabulary, and the PRD's lifecycle names are frozen.

**`password_hash` stores the full Argon2id encoding — algorithm, version,
parameters, salt, and tag — in one column.** The parameters live *inside* the
hash, not in separate columns. That is what makes the hash "adaptive": the
work factors travel with the hash, so raising them later does not invalidate
existing hashes, and a password hashed under old parameters still verifies.
Storing parameters separately would make a parameter change a data migration.

**`self_declared_role` and `self_declared_role_other` are separate columns.**
FR-1 names four options: Student, Employee, Visitor, Other. The `Other`
option needs free text (the story's edge case: "self-declared role contains
free text → stored as entered"). One column would have to encode "which of
four, and what text" in a single string, which is a parse. Two columns keep
the choice queryable.

**`is_administrator` is a boolean on the account, not a role table.** PRD §3:
"An Administrator is a Member with the `administrator` flag set." A separate
role table would contradict the glossary and make "administrator" a third
identity type rather than a flag.

**`rejection_reason` is nullable and separate from the audit trail's `reason`
column.** The account row holds the reason so the account record is
self-describing (and so bolt 005 and the account-management surface can show
it to administrators). The audit event 12 row holds the same string, because
the trail is the historical record and is append-only. **The two are written
in the same transaction**, so they cannot disagree. The reason is **never**
returned to the member.

**`sessions.token_hash` stores a SHA-256 hash of the session token, not the
token.** The token is 32 bytes of cryptographic randomness; the database stores
its hash. A database dump therefore does not yield usable session tokens.
Hashing is appropriate here (unlike a password) because the token is
high-entropy and not subject to guessing — and because verification must be
fast and constant-time.

**`expires_at` is a stored column, not a computed one.** FR-4's rule is 14
days from the last activity, and computing it in SQL on every read would put
a function call on the hot path. It is stored and refreshed by the design
decision below.

**No `updated_at` on `accounts`.** The account's lifecycle timestamps are
explicit and meaningful — `created_at`, `activated_at`, `deactivated_at` — and
a generic `updated_at` would be the one column whose value could change
without meaning. (Bolt 001 applied the same reasoning to `audit_events`.)

### Indexes

| Index | Columns | Serves |
|---|---|---|
| `idx_accounts_email_unique` | `UNIQUE (lower(btrim(email)))` | The uniqueness rule. The database's final arbiter against a concurrent-registration race. |
| `idx_accounts_status_created` | `(status, created_at)` | The FR-3 pending queue: `WHERE status = 'Pending' ORDER BY created_at ASC`. Covers both the filter and the ordering without a sort. |
| `idx_sessions_token_hash` | `UNIQUE (token_hash)` | Session resolution — the lookup on every authenticated request. |
| `idx_sessions_account_id` | `(account_id)` | "Revoke every session for this account" (bolt 005's deactivation), and "list this member's sessions". |
| `idx_sessions_expires_at` | `(expires_at)` | The expiry sweep — see the cron decision below. |
| `idx_password_reset_tokens_token_hash` | `UNIQUE (token_hash)` | Bolt 005's reset-token lookup. |

**The `idx_accounts_status_created` index is what makes the FR-3 queue cheap.**
FR-3 requires the queue "ordered by submission time". The index supplies both
the `status = 'Pending'` filter and the `created_at ASC` ordering, so the
queue is an index range scan rather than a filter-then-sort.

**`idx_sessions_token_hash` must be UNIQUE.** Two sessions sharing a token
would make "which session is this?" ambiguous and would break revocation. The
uniqueness constraint makes a collision impossible rather than unlikely.

### Referential integrity and retention

**`sessions.account_id` uses `ON DELETE RESTRICT`, not `CASCADE`.** An account
is never hard-deleted — `data-stack.md` § Retention says accounts are
"retained indefinitely, including after deactivation" — so the cascade would
never fire in practice. `RESTRICT` states the real rule: an account that
still has sessions cannot be deleted, because it never should be. `audit_events`
already has **no FK** to its actor, and the same reasoning applies: a
deactivated account's sessions are revoked, and its trail stays.

**The audit trail keeps its no-FK-to-actor rule.** `audit_events.parent_id`
for `parentType = 'account'` points at the account, but there is no FK, because
the trail must survive whatever happens to the account — and the account is
never deleted anyway, so the FK would buy nothing and cost a write-ordering
constraint on every insert.

### Migration plan

One migration, `add_identity_tables`, creating `accounts`, `sessions`, and
`password_reset_tokens` with their indexes and CHECK constraints. It does
**not** touch the audit tables — the audit schema is bolt 001's, already
migrated, and changing it here would be a cross-bolt edit.

**`audit_events.event_number` stays CHECK-constrained to 1–30, and the
`accounts` table's `status` gets its own CHECK.** The two constraints are
independent: one governs the workflow-event catalog, the other the account
lifecycle.

## Security Design

| Concern | Approach |
|---|---|
| **Password storage** | Argon2id, work factors from configuration (never hardcoded — the unit brief's explicit requirement). Implemented in `infrastructure/accounts/node-argon2-password-hasher.ts`. The hash carries its own parameters. See the work-factor decision below. |
| **Password verification** | `verify()` re-derives the hash using the **parameters embedded in the stored hash** and compares in constant time (`crypto.timingSafeEqual`). A stored hash from an older parameter set still verifies. |
| **Plaintext lifetime** | The plaintext exists only as a function argument: from the route handler's parsed body, through the policy check, into `hash()`. It is never stored, never logged, never audited, never returned. The `PasswordHash` type has no method that can produce a plaintext. |
| **Session token** | 32 bytes from `crypto.randomBytes`, base64url-encoded for the cookie. Stored as a SHA-256 hash. The plaintext is never persisted. |
| **Session cookie** | `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, **no `Domain` attribute**. The `__Host-` prefix requires **all three** of `Secure`, `Path=/`, and no `Domain` — the browser rejects the cookie outright if any is missing. **`Secure` is never dropped**, not even in local development. See the note below. |
| **Session expiry** | 14 days of inactivity (FR-4). Stored in `expires_at`. See the refresh-granularity decision below. |
| **Authorization** | Derived, never client-asserted (`system-architecture.md` § Authorization model). The `ActorContext` is built server-side from the session row and the account row. The administrator flag is read from the database, never from a request field or a header. |
| **The `Pending` restriction** | One guard, in the application layer, reading `ActorContext.status`. Not in the UI, not re-implemented per unit (story 006's technical note). |
| **Administrator-only surfaces** | The registration queue and the decision endpoint check `ActorContext.isAdministrator` **in the application layer, before the repository is reached**. The repository carries no role logic. |
| **CSRF** | A token on every state-changing request (registration, login, logout, the decision endpoint). The token is issued alongside the session and validated server-side. `SameSite=Lax` is a defence in depth, not the control — the PRD requires the token explicitly. |
| **Rate limiting** | Server-side, on registration, login, and password reset (PRD §10; this bolt covers registration and login; bolt 005 covers reset). See the rate-limiter decision below. |
| **Anti-enumeration** | The single `GenericInactiveMessage` value object. The four refusal cases produce byte-identical responses. A test asserts it. |
| **Rejection reason** | Stored verbatim for audit. **Never** returned in any response to the member, in any form, for any status. The `Account` entity's read projection has no field for it; only the administrator-facing account view can carry it. |
| **Sensitive values in logs** | Never. `RequestContext` is a closed type with no field capable of holding a password, hash, token, **or email address**. The operational logger accepts only that type, so the guarantee holds at the boundary. |
| **The registered email on the trail** | The trail may carry it (Conflict 1's resolution — it is administrator-visible by design, per FR-3's queue). It is **never** on an operational log line. This is the trail/log split bolt 001 established. |
| **Injection** | Parameterized queries only. The email uniqueness check is a database constraint, not a string-built query. |
| **Escape on render** | The rejection reason and the display name are rendered as text, never as HTML. Story 007's edge case ("rejection reason containing HTML or script → stored verbatim for audit; never rendered as HTML") is a render-layer rule owned by Unit 007, and it is recorded here so the data is stored safe for it. |
| **Account enumeration on the queue** | The pending queue is administrator-only, so listing pending registrations is permitted (FR-3). It is not a public surface and the `Pending` account's existence is not disclosed outside it. |

### The cookie's `Secure` flag is never dropped — a correction, with the evidence

**This section corrects an error in the first draft of this design.** The
original text proposed setting the session cookie **without** `Secure` when
`NODE_ENV !== 'production'`, so that it would work over plain HTTP in local
development.

**That would have broken local login completely**, and the reason is a
property of the `__Host-` prefix rather than of `Secure` alone. A
`__Host-`-prefixed cookie is accepted only if it has `Secure`, `Path=/`, and
no `Domain` attribute. A browser **rejects the cookie entirely** if any of
those is missing — it does not accept it with a weaker guarantee.

This was verified empirically, not inferred. A probe against the installed
Chromium (via Playwright) set each variant over plain HTTP and read the
resulting cookie jar:

| Variant | Result over `http://localhost` |
|---|---|
| `__Host-` **with** `Secure`, `Path=/`, no `Domain` | **ACCEPTED** — and transmitted back to the server |
| `__Host-` **without** `Secure` | **REJECTED** — no cookie stored at all |
| `__Host-` with `Secure` but missing `Path=/` | **REJECTED** — no cookie stored at all |

The third row matters as much as the second: the original proposal's fallback
was not merely insecure, it was **inert**.

**The resolution: `Secure` is always set, in every environment.** The
`__Host-` prefix's guarantee is what the standards ask for
(`tech-stack.md`: "`__Host-` cookie prefix to bind the cookie to the
deployment origin"), and dropping `Secure` to accommodate local HTTP would
have removed the very guarantee the prefix exists to provide.

**Local development over plain HTTP is still supported**, because browsers
treat `http://localhost` and `http://127.0.0.1` as *potentially
trustworthy* origins. The probe confirmed that a `__Host-` cookie set with
`Secure` over `http://localhost:3199` is stored **and sent back** on the next
request over the same scheme. So:

- **Local development:** `next dev` over `http://localhost:3000` — the cookie
  is set with `Secure` and works, because localhost is a trustworthy origin.
- **Production:** Vercel serves over HTTPS — the cookie is set with `Secure`
  and works.

There is therefore **no environment conditional at all**. The cookie's
attributes are identical in both environments, which is the better outcome:
one code path, one set of attributes, and no conditional that could leak
into a production build. The `Secure`-dropping branch is removed from the
design entirely.

**A test must assert this.** Stage 4 will assert that the `Set-Cookie` header
for the session carries `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`,
`Path=/`, and **no `Domain`** — in the test environment as well as in
production. A regression that drops `Secure` fails the suite rather than
silently breaking every local login.

### The work-factor decision
**Argon2id is available in the Node runtime with no dependency at all.** Node
24.19.0 (Krypton LTS) — the version in `construction-protocol.md`'s
prerequisites — exposes `crypto.argon2Sync`. This was verified by probe, not
assumed:

```js
const crypto = require('node:crypto');
const nonce = crypto.randomBytes(16);
const hash = crypto.argon2Sync('argon2id', {
  message: 'correct horse battery staple',
  nonce,
  parallelism: 1,
  tagLength: 32,
  memory: 65536,
  iterations: 3,
  passes: 1,
});
```

The probe confirmed: a 32-byte tag is produced; hashing is **deterministic**
for the same nonce and parameters; and a different password produces a
different result. The API requires `nonce` (not `salt`), `memory` (not
`memoryCost`), and `passes` — **not** `iterations`. See the correction note
in ADR-12: Node's `Argon2Parameters` has no `iterations` field, and an
`iterations` key is accepted silently and **ignored**, so a hash built with
one is *weaker than intended* rather than broken. Stage 4 found this in this
design's own first cost table, when raising `@types/node` to the Node 24
line surfaced the correct type.

**The chosen work factors are `memory = 65536` (64 MiB), `passes = 3`,
`parallelism = 1`, `tagLength = 32`.** Measured on this host, that costs
**~160 ms** per hash and ~91 ms with `parallelism = 4`. For comparison,
`memory = 19456, passes = 2` (the OWASP baseline) costs ~33 ms, and
`memory = 131072, passes = 3` costs ~331 ms.

Why 64 MiB / 3 passes, rather than the OWASP baseline:

- The **login path** verifies a password on every attempt. The PRD's write NFR
  is ≤ 1 s at p95; 160 ms leaves ample headroom inside it, and the hash is
  off the database's critical path.
- The **registration path** hashes once — a background cost, not a latency
  one.
- 64 MiB is the OWASP-recommended **second** option (the recommended *first*
  option is 19 MiB / 2 passes). 160 ms is a comfortable margin under the
  1 s write NFR, and the stronger parameters materially raise the cost of an
  offline cracking attempt against a stolen hash table.
- `parallelism = 1` is chosen over `parallelism = 4` despite the 91 ms
  measurement: a 4-way parallel hash consumes ~4× the memory per concurrent
  request on a serverless runtime with a constrained memory budget, and the
  saving is 69 ms. On Vercel Fluid Compute the memory ceiling is the scarcer
  resource than the milliseconds.

**The factors are configuration, not constants** — the unit brief requires
this explicitly. They live in environment variables with the chosen values as
the defaults, so they can be raised in production without a code change. The
values are also written **into the hash**, so raising them does not invalidate
existing passwords.

**A native dependency is deliberately avoided.** `argon2` and `@node-rs/argon2`
are both available on npm and would work, but each adds a compiled binary to
the deployment. Node's built-in implementation is the same algorithm, needs no
build step on Vercel, and removes a supply-chain dependency. The only cost is
that the API is Node-version-specific — which is why `engines.node` is
`>=20` in `package.json` today and **must be raised to `>=24`** by Stage 4,
because `crypto.argon2Sync` does not exist before Node 24. This is recorded as
a required Stage 4 change, not an optional one.

**This decision is an ADR candidate** — it is a genuine trade-off between a
dependency-free implementation and a version-floor requirement. It is
presented at Stage 3 rather than decided here.

### The session-refresh-granularity decision

FR-4 says "Sessions expire after 14 days of inactivity". The design stores
`expires_at` and refreshes it, but **not on every request**.

**The rule: `last_activity_at` and `expires_at` are refreshed only when the
stored `last_activity_at` is more than one hour old.** The window is
configurable.

The reasoning is the write volume. Updating two timestamp columns on **every**
authenticated request puts a database write on the hot path of every page
view, every API call, and every server action. On a free-tier PostgreSQL with
a pooled connection, that is the single largest avoidable source of write
load in the system, and it grows with the number of members.

The one-hour threshold makes the approximation harmless. The stored
`last_activity_at` may lag the true last activity by up to one hour, so the
effective idle window is between **13 and 14 days** rather than exactly 14.
The PRD's requirement is "expire after 14 days of inactivity" — a window that
ends between 13 and 14 days of inactivity satisfies "expire after inactivity"
with a one-hour resolution, and no user can observe the difference between
13 days 23 hours and 14 days of no use. The alternative — recomputing
`expires_at` in SQL on every read — moves the cost to the read path and still
needs a write to persist.

**The expiry is enforced on read, not by a sweeper.** A session is usable
only if `revoked_at IS NULL AND expires_at > now()`. No cron job is
required for correctness, because the check happens on every session
resolution.

**A cleanup sweep is still scheduled, but for storage, not for correctness.**
Expired and revoked session rows accumulate. A daily cron deletes rows where
`expires_at < now() - 30 days` (a 30-day grace period, so an investigation
into a recent logout is still possible). The sweep is **idempotent** and
tolerates ±59 minutes of drift (`tech-stack.md` B4 — Hobby's cron window), and
it deletes only expired sessions, never a live one. The `idx_sessions_expires_at`
index serves it.

### The rate-limiter decision

PRD §10 requires rate limiting on registration and login (and, in later bolts,
Claim submission, Recovery Response submission, thread posting, and password
reset). The unit brief names "Vercel rate limiting" as an integration point.

**Vercel's rate-limiting product is not used.** It is a paid add-on on some
plans and its availability on Hobby is not something this design will bet a
requirement on — and the $0 ceiling is hard. The PRD requires the *behaviour*;
it does not require a particular vendor.

**The limiter is a database-backed fixed-window counter, implemented in
`infrastructure/accounts/database-rate-limiter.ts` behind a `RateLimiter`
port.** The design:

```text
rate_limit_counters
  id           uuid PK
  bucket_key   text NOT NULL     -- e.g. 'login:ip:203.0.113.7'
  window_start timestamptz NOT NULL
  count        int NOT NULL
  UNIQUE (bucket_key, window_start)
```

The port exposes one operation:

```ts
interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}
```

`consume` increments the counter for the current fixed window and returns
`{ allowed, remaining, retryAfterSeconds }`. A rejected request still
increments the counter — a caller that is being throttled must not be able to
probe for the limit.

**Two independent buckets, because the two threats are different.** A login
limiter keyed only by IP lets one attacker lock out a whole campus behind a
NAT; a limiter keyed only by email lets an attacker enumerate accounts by
observing which addresses get throttled. So login has **two** buckets —
`login:ip:<ip>` and `login:email:<normalized-email>` — and a request is
allowed only if **both** are under their limits. The email bucket's refusal
returns the **same generic message** as a wrong password, so a throttled
account is indistinguishable from a failed one.

**Registration is keyed by IP only.** An email-keyed registration limiter
would be an account-existence oracle: the response for "this address is
already registered" is already a 409 by FR-1, so an email-keyed *limiter* on
registration adds nothing but a second channel for the same leak.

**The limits chosen for the first implementation** — configurable, not
constants:

| Bucket | Limit | Window |
|---|---|---|
| `register:ip:<ip>` | 5 | 1 hour |
| `login:ip:<ip>` | 20 | 15 minutes |
| `login:email:<email>` | 10 | 15 minutes |

Registration is tight because it is the account-creation endpoint, and it is
IP-scoped so a shared campus IP cannot lock everyone out of registering.
Login is looser on IP (a campus has many members behind one address) and
tighter on email (one account's failures are individually meaningful).

**The counter rows are cleaned up by the same daily sweep** as expired
sessions, deleting rows whose `window_start` is older than 24 hours. The sweep
is idempotent and drift-tolerant.

**The cost of this design is one extra table and one write per rate-limited
request.** That is acceptable under the $0 ceiling and it keeps the limiter
correct across Vercel's horizontally-scaled serverless functions — an
in-memory counter would reset on every cold start and be per-instance, so it
would not actually limit anything on a serverless runtime.

### The CSRF design

CSRF tokens are a transport concern, but the PRD requires them on every
state-changing request, so the design places them here.

**The token is derived from the session, not stored in a table.** The token is
an HMAC over the session's token hash and a per-request nonce, keyed by
`SESSION_SECRET` (already in `.env.example`). The server recomputes and
compares it in constant time. This means:

- There is no CSRF table, and no row to insert on every request.
- The token is bound to the session, so one session's token cannot be used
  with another's cookie.
- A token for an anonymous request (registration, login) is issued as a
  double-submit cookie — the standard pattern for a request that has no
  session yet.

**The `CSRFTokenValidator` port** exposes `validate(token, sessionToken?)`
and is called by the route handlers before any state-changing use case runs.
The check is in the **route handler**, not the use case, because CSRF protects
the transport, not the domain.

**This is the weakest point of the design and it is recorded as such.** An
HMAC over the session hash means a token is valid for the life of the
session, not for one request. A stronger design issues a per-request token.
The per-request variant needs a store — a table or a signed cookie — and the
signed-cookie variant is the same HMAC mechanism with a nonce the server
remembers. The chosen design is the one that needs no per-request state, and
it is the standard pattern for a server-rendered application of this size. The
requirement ("CSRF token on every state-changing request") is met: the token
is required, it is validated, and it is bound to the session.

### The registration audit record — Conflict 1's resolution

The owner confirmed Reading A at the Stage 1 checkpoint: FR-2's registration
record is an **unnumbered** audit record.

**The record's shape**, settled here:

| Field | Value | Why |
|---|---|---|
| `event_type` | `registration.submitted` | A distinct discriminator, in the same `dotted.verb` style as the two existing non-numbered types (`member_profile.edited`, `report.edited_by_administrator`). |
| `event_number` | `NULL` | It is not a numbered catalog event. The existing CHECK constraint (`event_number IS NULL OR event_number BETWEEN 1 AND 30`) already permits this. |
| `parent_type` | `account` | `AuditParentType` already includes `'account'`. |
| `parent_id` | the new account's id | The account **is** the parent, so the record appears in the account's contextual audit disclosure (`EXPERIENCE.md` §17.7). |
| `actor_id` | the registering account's own id | The member registers themselves. The actor is the account being created — the only actor available, since the actor *is* the thing being created. |
| `actor_role` | `member` | The account is not yet an administrator and not yet Active, but it **is** the registering member. |
| `metadata` | `{ displayName, email, selfDeclaredRole }` | FR-2's exact three fields, plus the role. |

**The name `registration.submitted` is distinct from `registration.approved`
(event 11) and `registration.rejected` (event 12)** — three separate
discriminators, so a query can find registrations, approvals, and rejections
independently.

### The PRD-parity test must be extended — this is a required Stage 4 change

`src/domain/audit/prd-parity.test.ts` currently asserts:

```ts
it('keeps the two non-numbered records out of the numbered range', () => {
  const nonNumbered = AUDIT_EVENT_CATALOG.filter((entry) => !Number.isInteger(entry.number));
  expect(nonNumbered.map((entry) => entry.type).sort()).toEqual([
    'member_profile.edited',
    'report.edited_by_administrator',
  ]);
});
```

That assertion hard-codes **two** non-numbered types. Adding
`registration.submitted` as a third **fails this test**.

This is a real consequence of the owner's Stage 1 decision, and it is
**deliberate and correct**: the test's comment says "The PRD names two records
that carry no numbered identifier", and after this bolt the PRD names **three**
— because FR-2 is a requirement that explicitly requires a registration record.
The PRD's rule is "Additional audit records **explicitly required by other
requirements** … do not receive additional numbered workflow-event identifiers.
In particular: FR-52 … FR-53 …". "In particular" is illustrative, not
exhaustive — FR-2 is a third such requirement.

**Stage 4 must update that assertion to three types** and extend the
PRD-parity check to assert that `registration.submitted` is present. The
numbered-events parity check is untouched: events 1–30 keep their numbers,
titles, and fields, and the PRD-parity guarantee is preserved for all of them.

**The catalog change is additive.** `NON_NUMBERED_EVENT_CATALOG` gains a third
entry; `NUMBERED_EVENT_CATALOG` is not touched. No number moves, no title
changes, no field set changes.

**A second consequence: the sanitizer.** The registration record's `metadata`
carries an email address. The catalog-aware sanitizer permits a field only
where the catalog entry names it, so `registration.submitted`'s catalog entry
must name `displayName`, `email`, and `selfDeclaredRole`. The entry is added
with those three fields named, and the sanitizer's existing deny-by-default
behaviour then permits exactly those three and nothing else.

**A third consequence: the account audit disclosure.** `EXPERIENCE.md` §17.7
lists the records shown in `/admin/accounts`: events 11, 12, 13, and the
FR-52 profile-edit records. It did not list a registration record — because
no registration record existed when it was written. **The spine has now been
updated** (owner-approved), so an administrator opening an account sees its
origin. The full set of spine edits is in *Open item 1* below.

### The `EXPERIENCE.md` §17.7 list — updated

This is a **frozen UX spine**, and `EXPERIENCE.md` §9.4a says the admin
account disclosure surfaces "the account-relevant audit records **already
defined by the PRD**". A registration record *is* defined by the PRD (FR-2),
so it belongs in that list. **The owner approved the edit, and it has been
made** — see *Open item 1* below for the six linked changes.

## NFR Implementation

| Requirement | Design Approach |
|---|---|
| **Page render ≤ 2 s p95** (PRD §10) | Server-rendered. The `accounts` module adds no client-side JavaScript to the landing or login pages. |
| **Write endpoints ≤ 1 s p95** | The login path's dominant cost is the Argon2id verification (~81 ms) plus one indexed session lookup and one indexed account lookup. Well inside 1 s. Registration adds one hash (~81 ms) plus one insert. |
| **Read endpoints ≤ 500 ms p95** | Session resolution is two indexed single-row lookups (`idx_sessions_token_hash`, `idx_accounts_email_unique` / PK). The pending queue is an index range scan with a capped page size. |
| **Sessions revocable and expire after inactivity** (PRD A2, FR-4) | Database rows. Revocation is a `revoked_at` write; expiry is enforced on read against the stored `expires_at`. Both are checked on **every** session resolution, so a revoked session is inert immediately. |
| **Email failure never blocks the action** (PRD §10) | The approval path commits the transaction, then sends. A send failure is logged and the approval stands (story 002 criterion 6). The transaction is never held open across a network call. |
| **No sensitive value in any log** (PRD §10, coding standards) | `RequestContext` is a closed type with no field for a password, hash, token, or email. The logger port accepts only that type. |
| **All administrator actions recorded** (PRD §10) | The approve and reject decisions write events 11 and 12 inside the same transaction as the state change. The registration writes the unnumbered record in the same transaction. |
| **Accounts retained indefinitely** (FR-5, PRD §10 Retention) | No deletion path for accounts exists in the repository interface — there is no `delete` method to call. The daily sweep deletes only expired *sessions*, never accounts. |
| **Audit written inside the state-change transaction** (ADR-3, decision 3) | The `TransactionHandle` from bolt 001 is reused. Every state-changing use case takes a handle and passes it to `AuditWriter.record`. |
| **Email after commit, never inside the transaction** (ADR-3, decision 4) | The email send is a post-commit step in the approval use case, outside the transaction callback. |
| **Rate limits enforced server-side** (PRD §10) | The `RateLimiter` port, called by the route handlers before the use case runs. Never enforced in the UI. |
| **CSRF on every state-changing request** (PRD §10) | The `CSRFTokenValidator` port, called by every state-changing route handler before the use case runs. |
| **No paid service** ($0 ceiling) | PostgreSQL (free tier), Node's built-in Argon2id (no dependency), a database-backed rate limiter (no vendor), SMTP relay (free tier). **No Vercel rate-limiting product, no external identity provider, no native hashing dependency.** |
| **99% uptime during business hours** | No new single point of failure. The limiter and the session store are the same PostgreSQL the rest of the system uses. |
| **WCAG 2.1 AA** (PRD §10) | Not this bolt's concern — it is a UI concern owned by Unit 007. The API returns a distinct 403 with a member-facing message so the surface can render it per `EXPERIENCE.md` §4.8. |
| **Session-expiry write amplification** | The one-hour refresh threshold, so an authenticated request writes at most once per hour per session rather than once per request. |

## Error Handling

| Error Type | Code | Response |
|---|---|---|
| `ValidationError` (existing, `src/lib/errors.ts`) | 422 | A field-level validation failure. `coding-standards.md` requires concrete, actionable copy — `EXPERIENCE.md` §4.9's example is "Add at least 10 characters to the description." The response names the offending field. |
| `DuplicateEmailError` | 409 | The email is already registered. FR-1 requires a "duplicate-email validation error" on the form. **Distinct from a rate-limit 429**, so the two are never conflated. |
| `PermissionDeniedError` (existing) | 403 | A non-administrator attempted a registration decision, or a `Pending` actor attempted a member action. The body carries the `EXPERIENCE.md` §4.8 pending message when the cause is the `Pending` restriction, and the §4.9 "You don't have access to this…" copy otherwise. |
| `IllegalTransitionError` (existing) | 409 | A registration decision on an account that is no longer `Pending` (story 002 criterion 4 — the concurrent-decision case). The copy is `EXPERIENCE.md` §4.9's "Concurrent action" line: "This item's claim was already decided by another administrator…" — adapted to the registration. |
| `NotFoundError` (existing) | 404 | No account with that id. |
| `QuotaExceededError` (existing) | 429 | The rate limiter refused the request. The response carries `Retry-After`. |
| `AuthenticationError` | 401 | **The single refusal.** The body is the `GenericInactiveMessage` copy, byte-identical across wrong-password, unknown-email, `Rejected`, and `Deactivated`. |
| `InvalidCsrfTokenError` | 403 | The CSRF token is missing or does not match. |
| `SessionExpiredError` | — | **Not thrown.** An expired or revoked session resolves to `null` and the request is simply unauthenticated. Story 003's edge case: "Expired session cookie → treated as unauthenticated, no error surfaced." |
| `PasswordHashVerificationError` | 500 | The stored hash is malformed and cannot be parsed. A genuine defect, logged as one — not a business outcome, and not a login failure to be hidden behind the generic message (the generic message is for *business* refusals; a corrupt hash is a defect that must be visible). |

**Every expected error is typed.** `coding-standards.md`: "Domain errors are
typed and expected — `NotFoundError`, `PermissionDeniedError`,
`IllegalTransitionError`, `TerminalStateError`, `QuotaExceededError`. These
are business outcomes, not failures." The two new domain errors —
`DuplicateEmailError` and `AuthenticationError` — follow that pattern. The
existing `ValidationError` in `src/lib/errors.ts` is reused rather than
reinvented.

**Expected errors never produce a stack trace in a response and never surface
raw text to a member.** The route handler maps a typed error to a status and
the copy from `EXPERIENCE.md` §4.9; anything else is a defect, logged with
its `requestId`, and answered with §4.9's server-error copy — "Something went
wrong on our side. Try again, or come back in a moment."

## External Dependencies

| Service | Purpose | Integration |
|---|---|---|
| **PostgreSQL** (Neon free tier, pooled) | Accounts, sessions, password reset tokens, rate-limit counters | Prisma with the existing driver adapter. The identity tables join the audit tables in one database, so a registration's account row and its audit record commit together in one transaction. |
| **Node's built-in Argon2id** (`node:crypto`) | Password hashing and verification | No npm dependency, no native build step. Requires Node ≥ 24 — `engines.node` must be raised from `>=20` in Stage 4. See **ADR-12**. |
| **SMTP relay** (free tier) | The FR-27 account-approved email | SMTP over TLS. Called **after** the transaction commits. Provider selection is PRD A6's open architecture decision; the shared `EmailSender` port keeps the choice out of the domain and application layers. Not available locally — verified by automated test only, per CP-4. |
| **Vercel (hosting)** | Runtime, cron | The daily maintenance cron (expired-session sweep, stale rate-limit counter cleanup) runs on Vercel Cron, which allows 100 jobs/day with ±59 minutes of drift (`tech-stack.md` B4). The sweep is idempotent. The Node runtime must be set to **24** — see **ADR-12**. |
| **No Vercel rate-limiting product** | — | The limiter is a database table. See the rate-limiter decision. |
| **No external identity provider** | — | Explicitly out of scope (PRD §2.2). |
| **No native hashing dependency** | — | `argon2` / `@node-rs/argon2` were considered and rejected; Node's built-in is the same algorithm with no build step. |

### The email port's contract

```ts
interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}
```

`OutboundEmail` carries `to`, `subject`, `textBody`, and `htmlBody` — **no**
account id, no role, no display name. The content is built by the owning
module and supplied by the caller; the port transports it. This keeps the email
body out of the domain layer and means a new email event never requires a
domain change.

**The port lives in `application/ports/email-sender.ts`**, not in
`application/accounts/ports/` — see **ADR-14**. The transport will also serve
the `notifications` module, so a port owned by `accounts` and consumed by
`notifications` would be a dependency in the wrong direction.

**The FR-27 email's content requirements**, which this bolt must satisfy:
sent to the account's registered email; contains a link to the application
login page; **contains no auto-login token**; and is the **only**
account-transition email (registration and rejection send none).

**The content is owned by this module** (ADR-14), and is UX-governed:
`coding-standards.md` requires user-facing wording to match `EXPERIENCE.md`,
and editing it re-opens frozen UX.

## Notes and Open Items

### Open item 1 — the `EXPERIENCE.md` §17.7 account-disclosure list — **RESOLVED, owner approved**

`EXPERIENCE.md` §17.7 enumerates the records shown in `/admin/accounts`:
events 11, 12, 13, and the FR-52 profile-edit records. It did not list a
registration record, because none existed when the spine was frozen.

With FR-2's registration record now in scope, an administrator opening an
account would see events 11/12/13 but **not** the account's origin — which is
exactly the record FR-2 requires the trail to hold. The design would have left
the record invisible on the surface that exists to show it.

`EXPERIENCE.md` is a frozen UX spine, and Unit 007's brief explicitly puts
"any change to the UX spines" out of scope. So this is the owner's call, not
this bolt's.

**The owner approved the change.** The spine has been updated, and the update
was made in **four linked places** — a single-bullet edit to §17.7 would have
left the spine internally inconsistent, because §17.5a is the section that
*defines* the non-numbered record types and it listed only two.

| Location | Change |
|---|---|
| §17 authority line | `Authority: PRD FR-31, FR-32, FR-48, FR-2, FR-52, FR-53`; the bullet now reads "FR-2, FR-52 and FR-53 add **non-numbered** audit record types (`Registration submitted`, `Member profile edited`, `Report edited by Administrator`)". |
| §17.5a heading and intro | `### 17.5a Non-numbered audit record types (PRD FR-2, FR-52, FR-53)`; the intro now names FR-2 as a third requirement that adds a non-numbered record type. |
| §17.5a record list | A new first bullet: **`Registration submitted` (FR-2)** — required by FR-2's own words; recorded once when a registration creates the `Pending` account; no numbered workflow-event ID; no email fires (FR-1); the actor is the registering member, who is the account being created; expanded fields are actor, account target, timestamp, display name, registered email, and self-declared role. |
| §17.7 "Records shown" | A new bullet: **FR-2 non-numbered `Registration submitted`** records (actor, target account, timestamp, display name, registered email, self-declared role). |
| §24.1 FR traceability matrix | The FR-2 row now also names the registration audit record and points at §17.5a and §17.7, so the matrix's coverage claim matches what the spine actually specifies. |
| §17.5a closing line | "The FR-2, FR-52 and FR-53 audit records above are additional non-numbered record types." |

**What the change does not do.** It introduces no member-facing surface, no
notification, and no new user action. It adds a record to an
administrator-only disclosure. It does **not** renumber anything — events 1–30
are untouched, and the spine's own sentence "No new audit events are
introduced. No event is renumbered." remains true.

**The "no new audit events" sentence needed no change, and that is worth
noting.** The new bullet is a *record*, not an *event*: FR-31's numbered
catalog is unchanged, and the spine's own §17.5a opening line already
distinguished the two.

### Open item 2 — the Argon2id implementation choice is an ADR candidate — **RESOLVED, ADR-12**

Node's built-in Argon2id versus a native npm dependency is a genuine
trade-off: no build step and no supply-chain dependency, against a Node
version floor that must be raised to ≥ 24. It changes what environments the
code runs in, and it is the kind of decision the ADR Analysis stage exists for.

**Recorded as ADR-12** — "Use Node's built-in `crypto.argon2` for password
hashing; require Node ≥ 24; add no native crypto dependency." The ADR fixes
the work factors as configuration (`memory=65536, passes=3, parallelism=1`,
embedded in the stored hash), the `engines.node` floor, and the
`@node-rs/argon2` fallback if the deployment runtime cannot move to Node 24.

### Open item 3 — the session-refresh threshold is a configurable choice, not a frozen one — **RESOLVED, ADR-16**

The one-hour threshold trades an exact 14-day idle window for a materially
smaller write load. The effective window is 13–14 days. The PRD requires "14
days of inactivity"; the design satisfies it with one-hour resolution.

**Recorded as ADR-16** — "Refresh a session's activity timestamp at most once
per hour, accepting an idle window of 13–14 days rather than exactly 14." The
ADR fixes the threshold (`SESSION_ACTIVITY_REFRESH_MINUTES`, default 60) and
the window (`SESSION_INACTIVITY_DAYS`, default 14), states the approximation
plainly, and confirms that every *explicit* security action — logout,
deactivation, password-reset revocation — stays exact and immediate, so the
approximation touches only the housekeeping timer.

**This is stated rather than hidden**, and Stage 5 should assert the effective
window explicitly so the approximation is a tested, documented property rather
than an accident.

### Open item 4 — `engines.node` must be raised to `>=24` — **confirmed by ADR-12**

`package.json` currently declares `"node": ">=20"`. Node's built-in Argon2id
requires Node 24. Vercel's current Node runtime is 22.x by default, with 24
available as a selectable runtime in `project settings` — **this is a
deployment prerequisite, not a code change, and the owner must set it on the
Vercel project.** If the deployment stays on Node 22, `crypto.argon2Sync` is
`undefined` at runtime and every password hash fails.

**This is a real deployment risk and is listed here for visibility.** The
alternatives, if the owner cannot set the Vercel runtime to Node 24: use
`@node-rs/argon2` (a native dependency that works on Node 22), or use
`crypto.scrypt` (Node's built-in, but scrypt is not Argon2id and the unit
brief names Argon2id). The recommendation is to set the Vercel runtime to
Node 24 and raise the `engines` floor to match — but the owner should decide
before Stage 4, because it changes the dependency shape.

### Open item 5 — the `Pending` 403 body is a UI concern Unit 007 must honour

The API returns 403 with the `EXPERIENCE.md` §4.8 message. §4.8 also requires
that the surface render it **non-blockingly**, keep the pending banner visible,
and not redirect-loop. This bolt owns the status code and the copy; Unit 007
owns the rendering. Recorded so the requirement is not lost at the unit
boundary.

### Open item 6 — the email provider remains PRD A6's open decision

`tech-stack.md` names "SMTP relay on a free tier; provider = Architecture
(PRD A6)". The `EmailSender` port isolates the choice. Stage 4 implements the
port against a generic SMTP client; the provider itself is configured by
environment variables and is not yet chosen. The FR-27 email cannot be
click-tested locally (CP-4) until a provider is configured.

### Design decisions summary

| # | Decision | Rationale |
|---|---|---|
| 1 | Reuse bolt 001's `TransactionHandle`, `TransactionFactory`, and `AuditWriter` | One transaction discipline across the codebase; "an audit entry for a transition that did not happen is a defect" applies identically to identity |
| 2 | The `Pending` restriction is one application-layer guard reading `ActorContext.status` | Story 006's explicit requirement: enforced once, at the boundary, not re-implemented per unit |
| 3 | The four login refusals share one `GenericInactiveMessage` and one response body | FR-4 and stories 003/007 all require indistinguishability; a test asserts byte-identity |
| 4 | Email is stored normalized; a functional unique index on `lower(btrim(email))` is the backstop | Satisfies three story edge cases at once, and the database is the final arbiter against a concurrent-registration race |
| 5 | Argon2id via Node's built-in `crypto.argon2` — no native dependency | Same algorithm, no build step, no supply-chain dependency; costs a Node ≥ 24 floor |
| 6 | Work factors `memory=65536, passes=3, parallelism=1`, configurable, embedded in the hash | ~160 ms measured, comfortably inside the 1 s write NFR; the OWASP second option; `parallelism=1` because serverless memory is scarcer than the 69 ms the 4-lane form saves |
| 7 | Session activity is refreshed at most once per hour, not per request | Avoids a database write on the hot path of every authenticated request; the idle window is 13–14 days instead of exactly 14 |
| 8 | Session expiry is enforced on read; a daily sweep only removes old rows for storage | Correctness does not depend on a cron job; the sweep is idempotent and drift-tolerant |
| 9 | Rate limiting is a database-backed fixed-window counter, not a Vercel product | $0 ceiling; and an in-memory counter would be per-instance and useless on serverless |
| 10 | Login has two rate-limit buckets (IP and email); registration has one (IP) | One bucket lets one attacker lock out a campus; the other lets an attacker enumerate accounts. Both together close both gaps |
| 11 | The registration audit record is a third **non-numbered** catalog type, `registration.submitted` | FR-2 explicitly requires the record and FR-31's rule gives non-numbered records no number. Events 1–30 are untouched |
| 12 | The PRD-parity test's "two non-numbered records" assertion must be updated to three | A direct, intended consequence of decision 11 — the test encodes the old count, and the PRD now names three such records |
| 13 | The registration record's `actor_id` is the new account's own id, `actor_role` = `member` | The registering member is the only actor available; the record is about the account being created |
| 14 | CSRF tokens are HMACs over the session token hash, keyed by `SESSION_SECRET` | No per-request store, no table, bound to the session; the weakest point of the design and recorded as such |
| 15 | `sessions.account_id` uses `ON DELETE RESTRICT` | Accounts are never deleted; the constraint states the real rule rather than implementing a cascade that never fires |
| 16 | The rejection reason is stored on the account row *and* in the audit event, in one transaction | The account is self-describing; the trail is the historical record; both are written together so they cannot disagree |
| 17 | The API is backend-first; pages belong to Unit 007 | Unit 007's brief owns the surfaces and the rendering; this bolt owns the rules and the endpoints |
| 18 | `status` is a CHECK-constrained text column, not a database enum | Keeps the frozen lifecycle vocabulary without a migration whenever a status is added |
| 19 | The frozen UX spine is updated in six linked places, not one | A single §17.7 bullet would have left §17.5a — the section that *defines* the non-numbered record types — saying there were two while §17.7 listed three |
| 20 | The session cookie's `Secure` flag is **never** dropped, in any environment | A `__Host-` cookie missing `Secure` is **rejected outright** by the browser — verified empirically against Chromium. The original "drop `Secure` for local dev" fallback would have made the cookie inert and broken every local login. `http://localhost` is a trustworthy origin, so `Secure` works locally with no conditional at all |
| 21 | The module is named `accounts/`, not `identity/` | **ADR-13.** Two standards and three prior bolts name `accounts/`; the map's own description — "Account lifecycle, session, password reset" — is exactly this bolt's scope. The unit is `001-identity-and-access` and the module is `accounts/`; the two are different things and are allowed to differ |
| 22 | The `accounts` module owns the FR-27 email end to end; `notifications` owns the other seven | **ADR-14.** An email's owner is the module that owns its trigger, and FR-27 is the only workflow email triggered by an account lifecycle transition. The transport is a shared `EmailSender` port in `application/ports/`, not a module-to-module call |
| 23 | Rate limiting uses a database-backed fixed-window counter, not a Vercel product | **ADR-15.** The $0 ceiling is hard and a hosted limiter is a paid add-on; an in-memory counter would be per-instance and therefore non-functional on serverless. The counter increment and the decision are one atomic statement, so concurrent requests cannot exceed the limit |
| 24 | The `EmailSender` and `RateLimiter` ports live in `application/ports/`, not `application/accounts/ports/` | **ADR-14, ADR-15.** Both are shared mechanisms — the transport will also serve the `notifications` module, and the limiter will serve every rate-limited route. A port owned by one module and consumed by another is a dependency in the wrong direction |
| 25 | A session's activity timestamp is refreshed at most once per hour | **ADR-16.** The idle window is 13–14 days rather than exactly 14 — stated, tested, and always on the late side. Every *explicit* security action stays exact and immediate; the approximation touches only the housekeeping timer |
