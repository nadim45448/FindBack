---
unit: 001-identity-and-access
bolt: 005-identity-security
stage: design
status: complete
updated: 2026-10-28T17:05:00Z
---

# Technical Design - Identity and Access (Security)

This is the technical design for bolt `005-identity-security`. It transforms
Stage 1's static model into an implementable architecture for the three
operations whose defining property is *not disclosing what the system knows*:
deactivation, password recovery, and the member profile.

The three owner decisions Stage 1 raised were settled on 2026-10-28 and are
**constraints this design is built to**, not questions it re-opens:

1. **Deactivating an administrator is permitted.** Any administrator may
   deactivate any `Active` account, including another administrator. The
   target's own flag confers no protection, and it is cleared on deactivation.
2. **The reset token's lifetime is 1 hour**, exposed as configuration
   (`AUTH_RESET_TOKEN_TTL_SECONDS`, default `3600`). The email renders the
   *configured* value, not a constant.
3. **The reset email's copy is pending a UX edit.** This design specifies the
   email's **structure** and assembles it from **named parts**. It does not
   invent wording.

## Architecture Pattern

**Hexagonal (ports and adapters), layered within the project's fixed module
map.** This is not a new decision — it is the pattern the standards already
mandate and the four completed bolts already implement. `coding-standards.md`
§ File and folder organization fixes the dependency direction:

```text
domain  →  nothing
application → domain + ports
infrastructure → domain + application ports
app / ui → application
```

Three properties of the pattern do the work this bolt needs, and each is
load-bearing rather than incidental:

**The domain holds the rules; the application holds the orchestration.** The
`Account` aggregate owns the deactivation rule, the `Active`-only profile rule,
and the token's single-use rule. `src/domain/` stays pure — no I/O, no
framework imports — so the invariants are testable with no database and no
React, exactly as the standard requires.

**Ports invert the dependencies, which is what makes the anti-enumeration
rule enforceable.** `EmailSender`, `RateLimiter`, `PasswordHasher`, and
`TransactionHandle` are interfaces in `src/application/ports/`, implemented in
`src/infrastructure/`. The reset flow's timing equalizer needs to *invoke* an
Argon2id verification on a path where no account exists; it does that through
the same `PasswordHasher` port the login uses, so the miss path costs what the
hit path costs without duplicating the hashing implementation.

**Transactions are a port, not an implementation detail.** ADR-3 requires every
multi-row lifecycle transition to commit atomically, with the audit row written
**inside the same transaction**. `TransactionHandle` is therefore a required
parameter of every mutating use case — not an ambient context — so it cannot be
forgotten. The deactivation transaction carries three writes (status, session
revocations, audit row) and they land together or not at all.

### Why not a different pattern

**A monolithic service** (one `IdentityService` class) would put the
anti-enumeration boundary in the wrong place. Stage 1 was explicit that the
*service* — not the route, not the repository — decides whether to issue a
token, while the *response* is built once after the branch. A single service
would make "one place builds the answer" a property of a class rather than of
the type system, and the route would be free to assemble its own response.

**Event sourcing** would be a poor fit for the $0 ceiling and the existing
schema. FR-51 and FR-5 need transactional state changes with an audit trail
written beside them, not a projection pipeline. The PRD's 14-day session
window, ADR-6's append-only trigger, and ADR-15's fixed-window counters all
assume a relational store of current state.

**CQRS** would add a read model this bolt does not need. Every operation here
is a write plus a single-object read.

## Layer Structure

The module is `accounts/` (ADR-13 — the unit is `identity-and-access`, the
module is `accounts/`; they are allowed to differ). This bolt **extends** the
module bolt `004` built rather than creating a second one.

```text
src/domain/accounts/            (pure — no I/O, no framework imports)
├── account.ts                  EXISTING — + deactivate(), updateProfile()
├── account-status.ts           EXISTING — unchanged
├── password-policy.ts          EXISTING — reused by the reset completion
├── generic-inactive-message.ts EXISTING — reused for the deactivated login
├── session.ts                  EXISTING — + 'account_deactivated' reason
├── actor-context.ts            EXISTING — unchanged
├── display-name.ts             EXISTING — reused by the profile edit
├── email-address.ts            EXISTING — reused for normalization
├── self-declared-role.ts       EXISTING — reused by the profile edit
├── password-reset-token.ts     NEW — the aggregate root
├── reset-token.ts              NEW — plaintext / hash / lifetime value objects
├── profile-change.ts           NEW — the closed two-field edit surface
├── profile-edit-result.ts      NEW — changed fields + previous values
├── neutral-reset-confirmation.ts NEW — the one response for every case
└── errors.ts                   EXISTING — + the errors this bolt needs

src/application/accounts/       (use cases — orchestration, no framework)
├── account-deactivation-service.ts   NEW
├── password-reset-request-service.ts NEW
├── password-reset-completion-service.ts NEW
├── member-profile-service.ts         NEW
├── password-reset-email.ts            NEW — the named-parts email builder
└── account-approved-email.ts          EXISTING — unchanged (the pattern to mirror)

src/application/ports/          (interfaces the outside world implements)
├── email-sender.ts             EXISTING — ADR-14's shared port
├── rate-limiter.ts             EXISTING — ADR-15's shared port
├── password-hasher.ts          EXISTING — ADR-12's shared port
├── transaction-handle.ts       EXISTING — ADR-3's transaction port
└── password-reset-token-repository.ts NEW — the seam bolt 004 left open

src/infrastructure/accounts/    (implementations)
├── prisma-password-reset-token-repository.ts NEW
├── reset-token-config.ts           NEW — TTL, timing floor, rate limits
├── reset-token-hasher.ts            NEW — the keyed digest
└── identity-stack.ts                EXISTING — wires the new pieces in

src/app/                        (route handlers — thin, no business rules)
├── (public)/forgot-password/    NEW — the request route
├── (public)/reset-password/     NEW — the completion route
├── (admin)/accounts/[id]/deactivate/ NEW — the deactivation route
└── (member)/my/profile/         NEW — the profile read + write routes
```

**The dependency rule holds.** `domain/` imports nothing. `application/`
imports `domain/` and `ports/`. `infrastructure/` implements `ports/`.
`app/` calls `application/`. The ESLint boundary rule enforces it.

**`domain/` must remain importable with no Node runtime.** This is why the
HMAC digest, the Argon2id hashing, and the database access all sit in
`infrastructure/`, and why `domain/` receives already-hashed values. It is
also why ADR-12 raised the Node floor to 24: `crypto.argon2` is the only
Argon2id available, and it is a Node API.

### What is new and what is reused

Stage 1 established that most of the machinery already exists. The design
below adds as little new surface as the requirement allows, because every new
branch is a new place for the anti-enumeration or the atomicity rule to leak.

| Piece | Status | Why |
|-------|--------|-----|
| `Account.deactivate()`, `Account.updateProfile()` | NEW methods on the EXISTING aggregate | Two new decision methods; no `setStatus` escape hatch |
| `Session.revoke(reason)` | EXISTING — only a new reason value | `'account_deactivated'` is the new literal |
| `GenericInactiveMessage` | EXISTING, reused unchanged | The deactivated login shares the rejected login's message by construction |
| `PasswordHasher` | EXISTING, reused unchanged | ADR-12; the reset hashes through the same port, so a reset password is indistinguishable from a registration password |
| `SessionRepository.listActiveByAccount`, `.revoke` | EXISTING, unchanged | Bolt `004` built them with deactivation in mind |
| `AccountRepository` | EXISTING, unchanged | Deactivation is a `save`; the repository does not learn what a deactivation is |
| `EmailSender` | EXISTING, reused unchanged | ADR-14's shared port; the reset message is an authentication/security email, not one of the eight FR-46 events |
| `RateLimiter` | EXISTING, reused unchanged | ADR-15's database-backed fixed-window counter; two new buckets |
| `AuditWriter` | EXISTING, reused unchanged | Event 13 (numbered) and `member_profile.edited` (non-numbered) |
| `PasswordResetTokenRepository` | NEW (modelled in bolt `004`) | The seam bolt `004` left open expressly |
| `PasswordResetToken` aggregate | NEW (table already exists) | The table was added in bolt `004` so the schema is coherent; it stays empty until this bolt writes to it |
| `ProfileChange`, `ProfileEditResult`, `NeutralResetConfirmation` | NEW value objects | Stage 1's three new types |
| `PasswordResetTokenRepository` conditional write | NEW behaviour | The "first use wins" rule is a database guarantee, not an application check |

### The PRISM module

The password-reset request and completion are a **module inside `accounts/`**,
not a new top-level module. ADR-14's rule — *an email's owner is the module
that owns its trigger* — puts the reset message's content here, because the
reset trigger is an account-lifecycle event. The module map's `accounts/`
entry names "Account lifecycle, session, password reset" as one unit, so
splitting the reset out would contradict the map. The PRISM boundaries
*within* the module are the aggregate, its value objects, and its two services.

**PRISM's four facets and where each lives:**

| Facet | Home | Rule |
|-------|------|------|
| **Model** | `domain/accounts/password-reset-token.ts`, `reset-token.ts` | The entity, the invariants, the value objects. Pure. |
| **Operations** | `domain/accounts/account.ts` (`deactivate`, `updateProfile`) | The state transitions. Pure. |
| **Events** | The existing `AuditWriter` | Event 13 and `member_profile.edited`. **The reset flow emits none** — see below. |
| **Interfaces** | `application/ports/password-reset-token-repository.ts` | The data-access contract. |

**PRISM's two invariants, and why the reset flow breaks the usual pattern.**
The "one invariant per transaction" rule holds, and so does "an interface per
external dependency". But PRISM's "interface per module" and "one transaction
per use case" need care here:

- The reset **request** touches the account lookup, the token insert, and the
  rate-limit counter. The counter is a **separate concern with its own
  transaction** (it is a fact about a key, not about an account, and ADR-15's
  limiter owns its own atomicity via `INSERT … ON CONFLICT`). The token insert
  is in the request's transaction.
- The reset **completion** touches the token's conditional write and the
  account's password hash. **One transaction, two writes, commit together** —
  this is the invariant that makes the replay refusal atomic.

**PRISM's "no interfaces for simple cases" rule applies to the deactivation
route.** It needs no new interface: the use case is one call.

## API Design

All routes are **Server Actions or route handlers under `src/app/`**, thin per
the standard: parse input, call the use case, map the result to a response.
**No business rules in `app/`.**

**None of these routes are built by this bolt.** The `/forgot`,
`/forgot-sent`, and `/my/profile` **screens** are Unit 007's. This bolt builds
the capabilities and the API contracts behind them. The routes below are
specified so Unit 007 has a contract to build against, and so this bolt's
story acceptance criteria can be tested at the route boundary.

### 1. Password reset request

```text
POST /api/auth/forgot-password
```

This is the endpoint the `/forgot` screen posts to. It is **not** the
confirmation screen — that is `/forgot-sent`, Unit 007's, and it renders the
frozen copy from `EXPERIENCE.md` §9.3a.

**Request**

| Field | Type | Rules |
|-------|------|-------|
| `email` | string | Required. Normalized via `EmailAddress` (trim + lower-case). Length-bounded. |
| `csrfToken` | string | Required. Verified by `CSRFTokenValidator` (PRD §10 — CSRF on every state-changing request). |

**Response — 202 Accepted, for every request, ever**

```json
{ "message": "<the frozen §9.3a confirmation, verbatim>" }
```

The body is **byte-for-byte identical** for a registered address, an
unregistered address, and a registered address in any of the four lifecycle
states. The status code is **202** in all cases — not 200, not 204, not a 404
for the unknown address. A 404 would be the disclosure FR-51 forbids.

**Errors**

| Condition | Status | Body |
|-----------|--------|------|
| Missing/invalid CSRF token | 403 | The standard CSRF error copy |
| Malformed email (not an address at all) | 400 | Field-attributed validation copy |
| Rate limit exceeded (IP **or** email bucket) | 429 | The standard rate-limit copy — **the same in both cases**, and the same shape as a successful request's neighbour |

**The rate-limit refusal must not disclose.** ADR-15's rule — the email
bucket's refusal returns the same generic message as every other refusal —
applies here with an addition this bolt adds: **the 429 response body and
status are the same whether the email bucket or the IP bucket refused**, and
the rate limiter's email bucket key is a **hash**, not the address (below). A
429 is itself not an existence oracle: exceeding a limit for an address that
does not exist is possible and must look identical.

> **Note on the malformed-email case.** A syntactically invalid address is
> rejected with 400, because it cannot be an account and the request is
> malformed. This is **not** an existence disclosure — the request never
> reached the account lookup. The boundary is precise: validation rejects
> *malformed input*; the service handles *well-formed input* and returns the
> identical neutral response for every account state.

### 2. Password reset completion

```text
POST /api/auth/reset-password
```

**Request**

| Field | Type | Rules |
|-------|------|-------|
| `token` | string | Required. The plaintext from the reset link. Never logged. |
| `newPassword` | string | Required. Evaluated against the existing `evaluatePasswordPolicy`. |
| `csrfToken` | string | Required. |

**Response — 200 on success**

```json
{ "status": "password-reset-complete" }
```

The response **never** contains a session. A reset does not sign the member
in — the member signs in with their new password. Story 009's criterion 1
says "the member can log in with the new password", not "the member is
signed in".

**Errors — every refusal is deliberately uniform**

| Condition | Status | Body |
|-----------|--------|------|
| Token absent, malformed, unknown, **used**, or **expired** | 400 | The **same** body for all five: `"This reset link is not valid. Request a new one."` |
| New password fails policy | 400 | Field-attributed copy naming the specific policy failure |
| Missing/invalid CSRF token | 403 | The standard CSRF error copy |

**The five token failures share one response on purpose.** A caller must not
be able to distinguish "this token never existed" from "this token was already
used" from "this token expired" — each distinction is a probe into whether a
given address has an account. The distinction is made **inside** the service,
which refuses with one internal reason; the route renders one message.

### 3. Account deactivation

```text
POST /api/admin/accounts/{accountId}/deactivate
```

**Request**

| Field | Type | Rules |
|-------|------|-------|
| `accountId` | UUID | The target account. |
| `csrfToken` | string | Required. |

The **acting administrator is derived from the session**, never from the
request body. This is the standard's rule that roles are server-derived and
never client-asserted (the same rule ADR-11 states for determination-makers).

**Response — 200**

```json
{ "status": "deactivated", "accountId": "<uuid>" }
```

For an **already-`Deactivated`** target, the response is **200 with the same
body** — the idempotent no-op (story 004's edge case). It is **not** a 409:
a second deactivation is not an error, it is the same request arriving twice.

**Errors**

| Condition | Status | Body |
|-----------|--------|------|
| Actor is not an administrator | 403 | The standard permission-denied copy |
| Target account does not exist | 404 | The standard not-found copy |
| Target is `Pending`, `Rejected`, or `Deactivated` | 200 (idempotent no-op) | The same body as success |
| Missing/invalid CSRF token | 403 | The standard CSRF error copy |

**There is no "refuse to deactivate an administrator" branch.** Per the owner's
decision and PRD FR-5, the target's administrator flag confers no protection.
The only precondition on the target is that it is `Active`.

> **The one subtle case: deactivating yourself.** The PRD does not forbid it,
> and it is not a "target is an administrator" case. An administrator
> deactivating their own account succeeds and their sessions are revoked,
> including the one making the request. The response is still delivered
> because the transaction committed before the revocation took effect on the
> next request. **This is not an open question** — it follows from the PRD
> having no self-preservation rule and from the owner's decision. Stage 4
> must test it, because it is the case most likely to be got wrong.

### 4. Member profile

```text
GET  /api/me/profile
POST /api/me/profile
```

**GET response — 200**

```json
{
  "displayName": "…",
  "email": "…",
  "selfDeclaredRole": "…",
  "status": "Active"
}
```

The email is **read-only**: it is returned, and the POST cannot change it.

**POST request**

| Field | Type | Rules |
|-------|------|-------|
| `displayName` | string | Optional. Validated by the existing `DisplayName` value object. Empty is rejected (story 010's edge case). |
| `selfDeclaredRole` | string | Optional. Validated by the existing `SelfDeclaredRole`. Length-bounded free text permitted (story 010's edge case). |
| `csrfToken` | string | Required. |

**There is no `email` field, no `status` field, and no `isAdministrator`
field in the POST body.** The request type is `ProfileChange`, whose shape is
**exactly two optional fields**. A client that sends `email` in the body
sends a field the server ignores — the read-only property is structural
(story 010's criterion 4), not a validation rule that could be forgotten.

**Errors**

| Condition | Status | Body |
|-----------|--------|------|
| No session | 401 | The standard unauthenticated copy |
| Account is `Pending`, `Rejected`, or `Deactivated` | 403 | The standard "no editor" copy (story 010's criterion 6) |
| `displayName` empty or invalid | 400 | Field-attributed validation copy |
| Missing/invalid CSRF token | 403 | The standard CSRF error copy |

**A no-op edit returns 200 and writes no audit record.** The member saved
without changing anything; there is nothing to record.

## Data Persistence

### Schema delta

The `PasswordResetToken` table **already exists** — bolt `004` added it so the
schema would be coherent and this bolt would have a seam. **It stays empty
until this bolt writes to it.** The migration below is therefore a **data
migration, not a schema migration**, except for one index.

```text
model PasswordResetToken {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  accountId String @db.Uuid
  tokenHash String
  createdAt DateTime  @default(now()) @db.Timestamptz(6)
  expiresAt DateTime  @db.Timestamptz(6)
  usedAt    DateTime? @db.Timestamptz(6)

  @@unique([tokenHash], map: "idx_password_reset_tokens_token_hash")   ← EXISTS
  @@index([accountId], map: "idx_password_reset_tokens_account")       ← EXISTS
  @@index([expiresAt], map: "idx_password_reset_tokens_expires_at")    ← EXISTS
}
```

| Change | Kind | Detail |
|--------|------|--------|
| `idx_password_reset_tokens_token_hash` | **Already exists** | The unique index on `tokenHash` is what makes the token lookup safe and what backs the "first use wins" rule's uniqueness. **No migration needed.** |
| `accounts.deactivated_at` | **Already exists** | `deactivatedAt DateTime?` is on the `Account` model. Bolt `004` fixed its meaning by removing the erroneous set on `rejectAccount()` (Stage 1's Defect 1). **No migration needed.** |
| `accounts.is_administrator` | **Already exists** | `isAdministrator Boolean @default(false)`. The deactivation path sets it to `false`. **No migration needed.** |
| `sessions.revocation_reason` | **Already exists** | `revocationReason String?`. The new literal `'account_deactivated'` is a **value**, not a schema change. **No migration needed.** |
| **New**: `password_reset_tokens` cleanup index | **Schema migration** | See "Token cleanup" below. |

**The schema delta for the entire bolt is one index.** That is the point of
Stage 1's "extend rather than duplicate" decision.

### The token lookup is by hash only

`PasswordResetTokenRepository` exposes `findByTokenHash(hash)` and **no
`findById` on the request path**. A caller cannot address a token without
presenting its secret. This is the Stage 1 decision, and it is a real
security property: a token id is guessable-enumerable, a token hash is not.

### The conditional write — the "first use wins" rule

**This is the most important persistence design decision in the bolt, and it
must not be implemented as a read-then-write.**

```sql
-- markUsed(tokenId, now) → number of rows updated
UPDATE password_reset_tokens
   SET used_at = $now
 WHERE id = $tokenId
   AND used_at IS NULL
   AND expires_at > $now
```

**The write is the check.** One statement, evaluated atomically by PostgreSQL.
There is no window between "is it still unused?" and "mark it used" in which a
second concurrent request could slip through. A read-then-write implementation
would have that window, and the window is exactly the race the story's edge
case describes.

**The result distinguishes the outcomes without leaking them to the caller:**

| `rows updated` | Meaning | Internal reason |
|----------------|---------|------------------|
| `1` | The token was valid and is now used | `ok` |
| `0` | The token was already used, **or** expired, **or** unknown | `invalidToken` |

All three refusals collapse into **one** internal reason and **one** response
body, because the caller must not be able to tell them apart.

**The two different-token case, stated precisely.** Story 009's edge case says
"Two resets requested concurrently → Both tokens valid until used; the first
use wins". The design implements exactly that:

- Two concurrent reset **requests** create two independent tokens. Both are
  valid until used. **Both remain valid** — issuing a new token does not
  invalidate an outstanding one (Stage 1's invariant).
- The **first use** of *either* token wins *for that token*: the first
  completion to run its conditional write succeeds, and a replay of that same
  token is refused.
- A **different** token is a **different authorisation**. If two different
  valid tokens are both used, each authorises one password change, and the
  **later** one wins the password — because the later write replaced the
  earlier hash. This is not a contradiction: "first use wins" is a rule about
  **replaying one token**, not about two tokens competing for one password.

**The unique index's role.** `idx_password_reset_tokens_token_hash` guarantees
no two tokens share a hash, so a collision is impossible and the lookup
resolves to at most one row. It is the **backstop** to the conditional write,
not the conditional write itself.

### Token cleanup

Reset tokens accumulate: one row per reset request, and the unit brief says
they are "Purged after expiry or use".

**A token is dead the moment its window elapses — expiry is enforced on
read, not by a sweeper.** This is the same rule ADR-16 sets for sessions: a
token is refused whether or not a cleanup job has run. The sweeper is for
**storage only**.

| Property | Value |
|----------|-------|
| Trigger | The existing daily sweep (Vercel Hobby cron fires once per day with ±59 min drift) |
| Deletes | Tokens where `expires_at < now() - INTERVAL '30 days'` **OR** `used_at < now() - INTERVAL '30 days'` |
| Idempotent | Yes — a second run deletes nothing new |
| Interaction | **None.** No token has a foreign key pointing at it. |
| Correctness impact | **None.** Expiry is enforced on read, so a token is refused the moment it expires regardless of the sweep. |

**A 30-day grace period** matches the session sweep's treatment and keeps a
recently-expired token around long enough for an incident to be investigated.
The delay is harmless because correctness never depends on the sweep.

**The one index the migration adds:**

```sql
CREATE INDEX idx_password_reset_tokens_expires_at_used_at
  ON password_reset_tokens (expires_at, used_at);
```

The existing `idx_password_reset_tokens_expires_at` covers `expires_at` alone.
The sweep's predicate filters on **both** `expires_at` and `used_at`, and a
composite index lets it satisfy both branches from one index. The table is
small (the unit brief: "Password reset tokens | SQL | Small"), so this is a
tidiness gain rather than a performance necessity — but the sweep runs daily
forever, and the index makes it a single index scan.

### Transaction boundaries

**ADR-3's rule: every multi-row lifecycle transition runs in one transaction,
and the audit row is written inside that same transaction.** An audit entry for
a transition that did not happen is a defect.

| Use case | Writes | One transaction? | Audit row |
|---------|--------|-----------------|-----------|
| `deactivate` | account status + `is_administrator` + **all** session revocations + audit event 13 | **Yes** — one transaction | Event **13** (`account.deactivated`), **numbered** |
| `requestPasswordReset` | token insert (+ the rate-limit counter, **separately**) | Token insert in one transaction; the counter owns its own | **None** — see below |
| `completePasswordReset` | token's conditional `markUsed` + account's `passwordHash` | **Yes** — one transaction | **None** — see below |
| `updateProfile` | account save + non-numbered audit record | **Yes** — one transaction | `member_profile.edited`, **non-numbered** |

**The deactivation transaction is the one that must not tear.** The status
change and every session revocation commit together, so there is never a
window in which a deactivated account holds a live session.

### The reset flow writes no audit record

FR-51 requires no audit record for a reset request, and the PRD's audit
catalog names no such event. This bolt therefore writes **no** audit record
for **either** half of the reset flow.

This is a deliberate reading, and it is the reading that keeps anti-enumeration
intact:

- A reset request is **anonymous**. The visitor is not signed in, so there is
  no account id to name as the actor.
- Story 008 criterion 6 permits a record only if it cannot disclose existence.
  A record naming the address for a registered account and a different record
  for an unregistered one **would** disclose existence. A record identical in
  both cases and holding no address would exist but record nothing useful.
- The **token** is never in any record. It is a credential (FR-37), and the
  sanitizer denies credentials by default.

**The rate-limit counter is the only trace a reset request leaves**, and its
email bucket's key is a hash (below), so the counter table cannot answer "which
addresses were reset" either.

**No operational log line carries the submitted address or the token.** The
log records the *fact* of the action — `action: "password_reset.requested"`,
`outcome: "success"` — and never its content. This is the standard's rule
(log the fact, never the content) and the construction phase guardrail that
never hardcode or log secrets.

## Security Design

| Concern | Approach |
|---------|----------|
| **Authentication** | Sessions are **database rows**, not JWTs (PRD A2). The `__Host-fb` cookie carries a session token; the server resolves it to an `ActorContext`. The reset flow needs **no session at all** — it is available to anonymous and signed-out visitors (FR-51). There is no actor, so there is no capability check, and none is invented. |
| **Authorization** | **Deactivation**: the *actor* must be an administrator, checked at the route boundary (the administrator flag is a request-scoped fact, not a domain invariant). The *target* has exactly one precondition — it is `Active` — and **no privilege check**, per the owner's decision. **Profile**: the account must be `Active` (checked inside `Account.updateProfile()`, so every path is covered by one check). **Reset**: no actor, no check. |
| **CSRF** | Required on **every** state-changing request (PRD §10), via the existing `HmacCsrfTokenValidator` and the `x-csrf-token` header. The reset routes are state-changing and therefore carry one — including the reset **request**, which is unauthenticated but still cross-site-forgeable. |
| **Session revocation** | Server-side, by row update. Deactivation revokes **every** usable session for the target in the same transaction, with the reason `'account_deactivated'`. A **password reset does NOT revoke other sessions** — story 009 says explicitly that this is "a separate decision not present in the PRD", and the model records it so nobody "fixes" it by assumption. |
| **Data encryption** | Passwords are Argon2id hashes (ADR-12) with the work factors embedded in the stored hash. The reset token is stored **only** as a digest. The plaintext token exists in the reset link, the member's browser, and the outbound email — and **nowhere else**. |
| **Secret handling** | No secret is hardcoded. The reset-token HMAC key and the rate-limit bucket HMAC key come from the environment, and a **missing key fails loudly at startup** — a fallback to an unkeyed digest would silently downgrade the property. |
| **Constant-time comparison** | Token hashes are compared with `timingSafeEqual` (the coding standard's rule), matching `cookie-session-store.ts`. |
| **Input validation** | Every input is validated at the route boundary — "types are not validation". The password policy is evaluated by the existing `evaluatePasswordPolicy`. |
| **Parameterized queries** | All queries are parameterized. The conditional `markUsed` is a parameterized `UPDATE … WHERE`. |
| **Rate limiting** | Two buckets on the reset request: `reset:ip:<ip>` and `reset:email:<keyed-hash>`. **Both must pass.** Limits are configuration with chosen defaults (ADR-15). |
| **No secret in a log** | The reset token, the token hash, the password, and the password hash are **never** logged, audited, or returned by a repository read path. The operational log records the fact of the action only. The token also never reaches the **access log**, because it travels in the URL's fragment and the fragment is never sent to the server. *(Corrected in Stage 5.)* |

### The two keyed digests, and why they are different

This bolt introduces **two** keyed digests with **different keys and different
purposes**. Conflating them would be a security mistake.

| # | Digest | Input | Key | Purpose | Failure mode if the key is missing |
|---|--------|-------|-----|---------|-----------------------------------|
| 1 | **Reset token hash** | The reset token's **random plaintext** | `AUTH_RESET_TOKEN_HASH_SECRET` | Lets the server find the token row by presenting the token | **Fail loudly at startup** — without it no token can be hashed or looked up |
| 2 | **Rate-limit bucket key** | The **normalized email address** | `AUTH_RESET_BUCKET_HASH_SECRET` | Stops the counter table from becoming a list of "which addresses were reset" | **Fail loudly at startup** — without it the bucket key would have to fall back to plaintext, which is exactly the disclosure being prevented |

**Why digest 1 is a keyed digest and not a bare SHA-256.** Stage 1 required
this and the reasoning is worth preserving: a reset token is **random**, so a
bare SHA-256 of it is not vulnerable to the dictionary attack that applies to
an email address. A keyed digest is nevertheless specified for digest 1
because it costs nothing (the same `crypto.createHmac` call the CSRF store
already makes) and it removes the "is the token high-entropy enough?" question
from the codebase entirely. It also keeps the two digests uniform, so there is
one hashing convention rather than two.

**Why digest 2 MUST be keyed, and a bare SHA-256 is forbidden.** The email
address space is small and well known. `createHash('sha256')('jane@example.org')`
is trivially reversible by dictionary attack — anyone with read access to the
counter table could enumerate the plausible address space and recover every
address that was ever reset. That is exactly the enumeration FR-51 forbids,
one layer down. **An HMAC with a per-deployment secret** makes the digest
irreversible without the secret, so the counter table cannot be reversed into
a list of addresses even by someone with database read access.

**The key is not derived from another secret.** Each key is its own
environment variable. Deriving one from `SESSION_SECRET` would couple the
reset flow's security to the session secret's rotation schedule for no gain.

**The IP bucket's key is the IP address**, because an IP is not an account
attribute and reveals nothing about whether an account exists.

### The reset token's plaintext generation

```text
randomBytes(32) → base64url → the token carried in the link
```

**256 bits of entropy** from Node's CSPRNG, URL-safe encoded so it survives a
URL without escaping. `base64url` (not standard base64) because standard
base64's `+` and `/` need encoding in a URL, and the token's transmission must
not introduce escaping differences.

**The token is 43 characters** (32 bytes → 43 base64url characters). The
length is worth recording because it is a testable property.

**The token is hashed before it is stored, and the plaintext is discarded
immediately after the email is built.** The order matters:

```text
1. generate plaintext token
2. hash it (HMAC, keyed)          → what goes in the database
3. build the reset URL with the PLAINTEXT
4. build the email with the URL
5. send the email (after commit)
6. the plaintext goes out of scope
```

**The plaintext is never persisted, never logged, never audited, and never
returned by a repository read path.** It exists in memory between steps 1 and
6.

### The reset link's shape

```text
{APP_BASE_URL}/reset-password#token={plaintext}
```

> **⚠️ CORRECTED IN STAGE 5 — this section originally specified
> `{APP_BASE_URL}/reset-password?token={plaintext}`, and the redaction
> mechanism it required was proven impossible by measurement.** The reasoning
> is recorded in full under "Why the token travels in the fragment" below.
> The corrected design is what shipped.

**The token travels in the URL's fragment**, because the member clicks a link
in an email and the fragment is the only part of a URL that never reaches a
server's request line.

The consequences are addressed in the design:

- The token **never appears in a log line**, because the fragment is never
  sent to the server and therefore never enters the request line — which is
  what an access log records. This is a property of the **URL's shape**, not
  of a redaction step, and it holds before any application code runs.
- The page it lands on must **not** be a cached page, and the reset form must
  not be a GET. The form **posts** the token in the request body, which is
  also not in the request line.
- The token is read from the fragment **in the browser**, by the page's own
  JavaScript, and posted in the body. The server never reads it from the URL.

#### Why the token travels in the fragment

**The originally specified mechanism was impossible, and it was found by
measurement rather than by reading.** The design as first written put the
token in the query string and required the request log to "redact the `token`
query parameter". Two live requests established that no application code can
do this:

1. A request to `/reset-password?token=…` was observed in the server's
   request log carrying the **full token**.
2. A proxy that rewrote the request's URL — stripping the query entirely — did
   **not** remove the token from the log.

The reason is structural: **the access log records the original request URL
— the one on the wire — and it is written before any application code runs.**
No proxy, no rewrite, and no route handler can change what is already
written. Next.js's own dev logger shows the same rule: it prints
`request.url`, the original, from
`node_modules/next/dist/server/dev/log-requests.js:62`.

**The design's original reasoning rejected the fragment, and that rejection
was the error.** It said: *"The token is **not** put in a fragment (`#`) —
fragments are never sent to the server, so the server could not read it to
look up the token. It must reach the server."* That reasoning was correct
about the fragment and wrong about the consequence.

**The server does not need to read the token from the fragment.** It does not
need to read it *at all* in the URL. The page's own JavaScript reads the
fragment in the browser and **posts the token in the request body**, and the
body is not in the request line either. The design's own other constraint —
*"the reset form must not be a GET"* — pointed at exactly this solution, and
the reasoning simply stopped one step short of it.

**The measured result, on the running dev server:**

| Link shape | Token in the request log | Token in the served HTML |
|------------|------------------------|--------------------------|
| **Fragment** (what the email produces) | **0** | **0** |
| Query string (a legacy or hand-built link) | 1 | 1 |

#### The proxy's role, and its bound

`src/proxy.ts` (Next 16's name for the file convention that used to be
`middleware`) remains, as a **second line of defence** for the case the
fragment does not cover: **a legacy or hand-built link** carrying
`?token=…`. It moves the token into a request header and serves the request
from a redacted URL, so the token never reaches the **route handler** or the
**page's markup**.

**It cannot remove the token from the access log**, and this is stated in the
proxy's own documentation rather than glossed: the log line is written before
the proxy runs. The proxy is worth keeping, and it is worth keeping honest
about what it does.

`APP_BASE_URL` already exists and already builds the FR-27 email's login
link. The reset email reuses it, so the two emails cannot disagree about the
deployment's origin.

**Unit 007 builds the `/reset-password` page against this contract.** The
page reads `window.location.hash`, and the token is posted in the request
body. The page in this bolt (`src/app/reset-password/`) is a **placeholder**
that proves the fragment is readable in the browser; Unit 007 replaces it
with the real form and must keep the fragment contract.

### The email's structure — copy pending UX

**Per the owner's decision, the wording is not written here.** This design
specifies the **structure** and assembles it from **named parts**, mirroring
how bolt `004` built the FR-27 email, so the eventual copy is a single visible
edit in one place.

```text
src/application/accounts/password-reset-email.ts

export const PASSWORD_RESET_SUBJECT = '<PENDING UX — see the UX edit below>';

export interface PasswordResetEmailParts {
  readonly displayName: string;   // the member's name, for the greeting
  readonly resetUrl: string;      // the absolute URL with the token
  readonly lifetimeHours: number; // the CONFIGURED lifetime, rendered
}

export function buildPasswordResetEmail(
  to: string,
  parts: PasswordResetEmailParts,
): OutboundEmail
```

**The named parts, and what each one must say:**

| Part | Must state | Source |
|------|-----------|--------|
| `subject` | That this is a FindBack password reset | **Pending UX** |
| `greeting` | The member's display name, or a neutral fallback | `displayName` |
| `intro` | That a password reset was requested for this account | **Pending UX** |
| `action line` | The single-use link to set a new password | `resetUrl` |
| `lifetime statement` | **The configured token lifetime**, in the configured unit | `lifetimeHours` — from config, not a constant |
| `security note` | That the link is single-use and time-limited, and that the member may ignore the email if they did not ask | **Pending UX** |
| `sign-off` | The sender | **Pending UX** |

**The lifetime statement renders the configured value.** If
`AUTH_RESET_TOKEN_TTL_SECONDS` is `1800`, the email says 30 minutes; if it is
`86400`, it says 24 hours. The value is rendered in a **human-readable
duration**, derived from the configured seconds, so the email never contradicts
the server's actual behaviour. **This is why the lifetime is configuration
rather than a constant** — the email states it, and a member who reads the
email must be told the truth.

> **Why the email states the lifetime at all.** A single-use, time-limited link
> whose window is unstated leaves the member unable to judge urgency. FR-51
> requires the email to carry the reset instructions, and the owner's decision
> made the lifetime product-visible. The email therefore states the real,
> configured duration.

**The email carries no auto-login token and no session** — it carries the
reset token, which authorises exactly one password change and nothing else.
This mirrors FR-27's rule (a link carrying a credential must not confer
access) with one deliberate difference: a reset token **must** be in the link,
because it is the authorisation. The mitigation is the token's own properties —
single-use, time-limited, 256-bit random, stored hashed, and revocable by
issuing a new one.

**The HTML body escapes every interpolated value**, exactly as
`account-approved-email.ts` does. The display name is user input and is
rendered by the recipient's mail client.

### The UX edit being requested

The frozen `EXPERIENCE.md` defines §9.3a's confirmation screen and classifies
the reset email, but **defines no subject and no body for the reset email
itself**. Because `coding-standards.md` requires user-facing wording to match
the frozen spine, this bolt raises an edit:

> **Requested addition to `EXPERIENCE.md` — a new subsection beside §9.3a,
> covering the password-reset email.** It must specify:
>
> 1. the email's **subject line**;
> 2. the **body**, covering the greeting, the instruction, the single-use
>    action link, the **lifetime statement** (the email states the configured
>    duration, in a human-readable form), the single-use/time-limited note,
>    the "if you did not request this" note, and the sign-off;
> 3. that the email is an **authentication/security message** — explicitly
>    **not** one of the eight FR-46 workflow emails, and not a ninth;
> 4. that the body carries **no auto-login token** and **no session**, only
>    the single-use reset token.
>
> **Until that edit is approved and recorded in the frozen spine, the wording
> in `password-reset-email.ts` is a placeholder and is marked
> `PENDING UX EDIT`.** Stage 4 must not invent final copy; it assembles the
> named parts and leaves the wording pending.

### The anti-enumeration design, in three parts

FR-51 requires the response not to disclose account existence in the **body**,
the **timing**, and the **screen state**. All three are designed here.

**1. Body — one value, built once.**

`NeutralResetConfirmation` is a single frozen string from `EXPERIENCE.md`
§9.3a. It is a **value object**, not a constant, so a caller cannot construct
a "neutral" message with different copy. The service builds the response
**after** the branch, from this one value.

**The structure that makes it structural rather than conventional:**

```text
PasswordResetRequestService.request(email, sourceIp)
  │
  ├─ work that happens on EVERY path (unconditional)
  │    1. normalize + validate the address
  │    2. consume the rate-limit buckets
  │    3. look up the account
  │    4. hash the address (the keyed bucket key)   ← unconditional
  │    5. perform a DUMMY Argon2id verification     ← unconditional, the work floor
  │
  ├─ the ONLY branch, and it shapes NO part of the response:
  │    if (account exists) { create token; persist; build email; }
  │
  └─ build the response ONCE, from NeutralResetConfirmation
```

The branch decides **whether to send an email**. It cannot decide what the
response says, because the response is built from a single value after the
branch closes. A route that assembled its own response would be the place a
future developer could leak — so the service exposes exactly one method, and
the route has nothing to assemble.

**2. Timing — a constant work floor and a constant delay.**

The hit path does more work than the miss path (it creates a token row and
sends an email). Stage 1 required a **fixed work floor** and a **constant
delay**, and left the mechanism to Stage 2. The design picks **both**:

**The work floor.** On **every** path, the service performs a **dummy
Argon2id verification** — the same `PasswordHasher.verify()` call against a
pre-computed dummy hash that bolt `004`'s login uses for an unknown email
(`authenticate.ts`'s `DUMMY_HASH`). This is the established pattern in this
codebase and the design follows it rather than inventing a second one. It is
the expensive step (~81 ms at ADR-12's work factors), so equalising it removes
the largest timing signal.

**The constant delay.** After the branch closes, the service waits until a
**fixed deadline** has passed, derived from the configuration — never from the
account's existence. The delay is a **configuration value**, like the Argon2id
work factors and the rate limits.

```text
RESET_MIN_RESPONSE_MS = 250   (default; configurable)
```

The mechanism is: record the start time, do the work, then sleep until
`start + RESET_MIN_RESPONSE_MS` has elapsed. On the hit path the Argon2id
verification plus the email build usually exceeds 250 ms already, so the sleep
is a no-op and the response returns at roughly the natural cost. On the miss
path the dummy verification brings the cost to nearly the same place. The
result is that the **floor** is what equalises, and the delay covers the
residual.

**The delay is measured, not assumed.** The **timing tolerance** is
**RESET_TIMING_TOLERANCE_MS = 100** (configurable). The acceptance test
asserts that the difference between a registered-address request and an
unregistered-address request is **within 100 ms**, measured across repeated
samples (see "Measured, not asserted" below).

**Why 250 ms and 100 ms.** Argon2id at ADR-12's work factors measures ~81 ms.
A floor of 250 ms is comfortably above it, so the hit path's natural cost
already clears the floor and the delay rarely adds anything. The 100 ms
tolerance is roughly the run-to-run variance of an Argon2id verification on
shared infrastructure — wide enough not to be flaky, narrow enough that a real
existence oracle (a miss path that returned in 5 ms) would fail it by orders
of magnitude. **The tolerance is a configuration value, so it can be tuned per
environment without a code change.**

> **The tolerance is a real measurement, not a wish.** A timing test without a
> tolerance is a flaky test; a timing test with a tolerance that is wider than
> the signal is a useless test. The numbers above are chosen so the test is
> both stable and meaningful, and Stage 5 must confirm them against the real
> implementation — the values recorded in Stage 1 as "must be measured" are
> measured here.

**3. Screen state.** The route always routes to `/forgot-sent`, which renders
the same frozen copy for every case. Unit 007 builds the page; this bolt
specifies the contract.

### The rate-limit buckets and their limits

Two buckets, and **both must pass** — ADR-15's login precedent, for the same
reason: IP-only lets one attacker lock out a campus behind a NAT, and
email-only turns the throttle into an account-existence oracle.

| Bucket | Key | Default limit | Window | Why |
|--------|-----|---------------|--------|-----|
| `reset:ip:<ip>` | The IP address | **5** | 1 hour | A campus has many members behind one address, so this is moderately loose. An attacker enumerating from one IP is stopped. |
| `reset:email:<keyed-hash>` | HMAC of the normalized address | **3** | 1 hour | Tighter than the IP bucket: three resets for one address in an hour is not a legitimate pattern. |

**These are the defaults this design chooses**, following ADR-15's rule that
limits are configuration with chosen defaults. Stage 1 recorded that "the
FR-51 rate-limit *values*" are a Stage 2 decision; these are them, and they
are configurable:

```text
AUTH_RATE_RESET_IP_LIMIT              = 5    (default)
AUTH_RATE_RESET_IP_WINDOW_SECONDS     = 3600 (default)
AUTH_RATE_RESET_EMAIL_LIMIT           = 3    (default)
AUTH_RATE_RESET_EMAIL_WINDOW_SECONDS  = 3600 (default)
```

**An invalid value falls back to the default** rather than failing the
request — the same convention ADR-15's rate limits and the Argon2id parameters
already use, and the same convention the owner approved for the reset token's
lifetime.

**The rate limiter runs in the route handler, before the use case** — ADR-8's
rule. It avoids paying the ~81 ms Argon2id cost for a request that will be
refused. **But the refusal must still equalise timing**: a rate-limited
request returns faster than a normal one, and that difference is itself a
signal (it says "this address has been requested recently", which leaks that
*something* happened for it). The design therefore applies **the same
`RESET_MIN_RESPONSE_MS` floor to the rate-limited path**. A rate-limited
request and an accepted request take the same time; only their bodies differ.

> **This is a deliberate addition beyond ADR-15's login precedent.** ADR-15's
> login path lets a rate-limited request return early, because the login
> response is a `GenericInactiveMessage` that is identical in every case
> *including* the rate-limited one — there is no "accepted" variant to compare
> against. The reset path is different: the **accepted** path is a 202 with a
> neutral confirmation, and the **refused** path is a 429. Those two bodies
> differ. If the timing also differed, the refusal would be distinguishable by
> timing alone. Applying the same floor to both paths closes it.

### The deactivation transaction, in full

```text
AccountDeactivationService.deactivate(accountId, actingAdministratorId, tx)
  │
  1. account ← AccountRepository.findById(accountId)
  │     └─ null → NotFoundError (404)
  │
  2. if (account.status === 'Deactivated') → return the account UNCHANGED
  │     └─ idempotent no-op: no write, NO audit record
  │
  3. account.deactivate(actingAdministratorId, now)     ← domain, Active-only
  │     └─ throws IllegalTransitionError unless status === 'Active'
  │        (so Pending and Rejected are refused by the aggregate, not by the route)
  │
  4. sessions ← SessionRepository.listActiveByAccount(accountId, now)
  │
  5. for each session: SessionRepository.revoke(session.id, 'account_deactivated', tx, now)
  │
  6. AccountRepository.save(account, tx)
  │
  7. AuditWriter.record(event 13, tx)      ← SAME transaction
  │
  8. COMMIT — all four writes land together
```

**Step 2's idempotency matters for the audit trail.** A second deactivation
writes **no** duplicate audit record (story 004's edge case). The trail stays
a record of what happened, once.

**Step 3's placement matters.** The `Active`-only rule lives in the aggregate,
so every caller is covered by one check. The route does not repeat it.

**Step 7's placement is ADR-3 and ADR-6's rule.** The audit row is written
inside the same transaction as the state change, and the `audit_events` table's
append-only trigger means it cannot be edited or deleted afterwards. There is
no outbox and no post-commit audit write.

**The service never touches a report, a Claim, a Recovery Response, a
message, or a historical audit row** — it has no repository that could. That
is how "deactivation preserves everything" (FR-5, unit rule 6) is enforced
structurally rather than by remembering not to.

### The profile edit, in full

```text
MemberProfileService.update(accountId, changes, actorId, tx)
  │
  1. account ← AccountRepository.findById(accountId)
  │     └─ null → NotFoundError
  │
  2. previousValues ← { displayName, selfDeclaredRole } from the account
  │
  3. account.updateProfile(changes, now)     ← domain, Active-only, two fields only
  │     └─ throws for a non-Active account
  │
  4. changedFields ← diff(previousValues, account)
  │     └─ if EMPTY → return the account UNCHANGED; NO audit record
  │
  5. AccountRepository.save(account, tx)
  │
  6. AuditWriter.recordNonNumbered('member_profile.edited', {
  │      accountId, actorId, changedFields, previousValues, occurredAt }, tx)
  │
  7. COMMIT
```

**Step 4's no-op rule** keeps the trail a record of what happened. A member who
opens the editor and saves without changing anything has changed nothing, and
there is nothing to record.

**The `changedFields` and `previousValues` maps are what FR-52 requires the
record to carry** — "the changed fields, and the previous values". The use
case computes them, so the audit record never has to reconstruct them from the
request.

**The `ProfileChange` type is the enforcement of "exactly two fields".** It
has two optional fields and no others, so there is no code path by which an
email, a status, or an administrator flag could reach the aggregate. The
forbidden edits are refused by **the shape of the type**, not by four
separate `if` statements that a future edit could forget.

**This is a non-numbered record.** It introduces no new FR-31 or FR-48 event
number, and it does not renumber events 1–30.

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| **≤ 2 s p95 initial HTML** (PRD §10) | The reset **request** is server-rendered (a page, not an API-first flow). Its p95 is dominated by one Argon2id verification (~81 ms) plus the ≤ 250 ms floor, so it sits far inside the budget. The reset **completion** likewise pays one Argon2id hash (~81 ms) plus the transaction. The floor is the design's dominant term and is bounded by `RESET_MIN_RESPONSE_MS`. |
| **≤ 1 s write** (PRD §10) | Deactivation: one transaction, three write groups, no external call inside it. Profile edit: one transaction, two writes. Reset completion: one transaction, two writes, one Argon2id hash. The reset **request** is the exception — it sends an email **after** the commit, so the email's latency is not inside the write. |
| **Anti-enumeration timing** (FR-51) | The `RESET_MIN_RESPONSE_MS` floor plus the unconditional dummy Argon2id verification, measured against a `RESET_TIMING_TOLERANCE_MS` tolerance. Both are configuration. |
| **Scalability** | The free tier's limits are the binding constraint, and this bolt adds no new class of load. The reset request adds one Argon2id verification per request — the same cost as a login — which is **more** expensive than the alternative would be, and that is the point. The rate limiter's counters are swept daily (ADR-15). Token rows are swept daily with a 30-day grace. |
| **Reliability** | The deactivation transaction is atomic (ADR-3). The reset completion's conditional write is atomic. The email is sent **after** the commit, so a slow or failing SMTP relay cannot roll back a token issue — and PRD §10's rule that a failed email must never block the action is satisfied by construction. |
| **$0 hard ceiling** | No new service. PostgreSQL, Vercel Blob (not used here), and the existing SMTP relay only. No paid add-on. |
| **Observability** | The operational log records the **fact** of each action and never its content — `action: "password_reset.requested"`, `action: "account.deactivated"`, `action: "profile.edited"`, with `requestId`, `actorId`, `actorRole`, `outcome`, and `ts`. The reset request's `targetId` is the **keyed hash**, not the address, so the log cannot answer "which addresses were reset" either. |

### The email-after-commit rule

**PRD §10: a failed email must never block the action.** The design satisfies
this by ordering, not by error handling:

```text
1. transaction: create the token, COMMIT
2. build the email
3. send the email
4. if the send fails → log it; do NOT retry aggressively; do NOT fail the request
```

The request **already returned 202** — or returns 202 regardless, because the
response is built from the neutral confirmation either way. **A failed email
send is invisible to the caller**, which is exactly right for the
anti-enumeration rule: a caller must not be able to learn that the account
exists *because the email failed*.

**A send failure is logged** with the fact and the error class, never the
address or the token. There is **no outbox table** — ADR-14 established that
pattern for FR-27, and it applies here: the PRD asks that a failure not block
the action, not for delivery guarantees, and an outbox would decouple the
trigger from the decision.

**A member who never receives the email can request another.** The tokens are
independent and issuing a new one does not invalidate an outstanding one, so
a lost email is recoverable by simply asking again. This is a property of
Stage 1's design and it is why there is no delivery guarantee.

## Error Handling

**Domain errors are typed and expected** — they are business outcomes, not
failures. `coding-standards.md` names the vocabulary: `NotFoundError`,
`PermissionDeniedError`, `IllegalTransitionError`, `TerminalStateError`,
`QuotaExceededError`.

| Error Type | Code | Response | Where it is raised |
|------------|------|----------|--------------------|
| `NotFoundError` | 404 | The standard not-found copy | The target account does not exist (deactivation, profile) |
| `PermissionDeniedError` | 403 | The standard permission-denied copy | The deactivation actor is not an administrator; a non-`Active` member's profile write |
| `IllegalTransitionError` | 409 | The standard transition copy | `deactivate()` on a non-`Active` account; `updateProfile()` on a non-`Active` account |
| `ValidationError` | 400 | Field-attributed copy | The email format, the password policy, an empty display name |
| **Rate limit exceeded** | 429 | The standard rate-limit copy | The route's limiter, **before** the use case |
| **`InvalidResetTokenError`** (new) | 400 | **One** body for all five token failures | The completion service — unknown, used, expired, malformed, absent |
| `ConflictError` | 409 | The standard conflict copy | A unique-constraint violation on a concurrent write |
| `QuotaExceededError` | 503 | The standard quota copy | ADR-4's free-tier refusal |
| **Anything else** | 500 | A generic error page, **no stack trace** | A genuine defect — logged as one |

**The distinction between an expected error and a defect is load-bearing.**
Anything thrown that is not one of the typed domain errors is a **defect**,
and it is logged as one. The response never surfaces raw text to a member, and
never produces a stack trace.

**Three deliberate collapses**, each of which is an anti-enumeration decision
rather than a simplification:

1. **The five token failures share one error and one body.** Unknown, used,
   expired, malformed, and absent are distinguished *internally* — the service
   knows which — but they render identically. A caller must not be able to
   probe the token space.
2. **The already-`Deactivated` target is a 200, not a 409.** A second
   deactivation is the same request arriving twice, not a conflict. (A
   `Pending` or `Rejected` target *is* a 409 — it is a genuinely illegal
   transition, not a repeat.)
3. **The rate-limit refusal's body does not say which bucket refused.**

**The reset completion's errors never reveal the account.** `InvalidResetTokenError`
carries no account id, no email, and no token in its message. The log line for
a refused reset records the fact and the reason class, and the token is
redacted.

### The input-validation boundary

Every input is validated at the route boundary — "types are not validation".
The boundary and the domain are **different kinds** of check, and neither
substitutes for the other:

| Check | Where | Why there |
|-------|-------|-----------|
| The email is syntactically an address | Route | A malformed address is a malformed **request**. It never reaches the account lookup, so rejecting it discloses nothing. |
| The password meets the policy | Route (calling `evaluatePasswordPolicy`) | The route must name the **specific** failure in its field-attributed copy. The policy itself is a domain fact. |
| The display name is valid | Route (calling `DisplayName`) | Same — the route attributes the failure to a field. |
| The token is unused and unexpired | Service | It needs the **conditional write** to be atomic, which only the service can do. |
| The account is `Active` | **Domain** | It is an invariant on the entity, and every path must be covered by one check. |
| The actor is an administrator | Route | The administrator flag is a **request-scoped fact**, not an invariant on the target. |

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|-------------|
| **PostgreSQL** | Accounts, sessions, reset tokens, rate-limit counters, audit rows | Prisma over a pooled connection. The conditional `markUsed` is a parameterized raw `UPDATE` inside an interactive transaction. |
| **SMTP relay** | The FR-51 password-reset email | The existing `EmailSender` port, implemented by `smtp-email-sender.ts`. Called **after** the commit; a failure is logged and never blocks. **Not click-testable locally** — see below. |
| **Vercel (hosting)** | The runtime and the daily sweep cron | The daily sweep removes expired tokens and stale counters. Its ±59 min drift is harmless: correctness never depends on it. |

**No new external dependency is introduced.** The reset flow uses the database,
the existing SMTP sender, and the existing rate limiter. There is no new
service, no new SDK, and no paid add-on.

**The two paths that cannot be manually tested locally** (construction
protocol, decision CP-4): the outbound email is verified by automated test
only, and the report must say so plainly rather than implying it was
click-tested.

## Configuration

All new configuration follows the convention ADR-15 and the Argon2id parameters
already use: **configured, not hardcoded, with a chosen default, and an
invalid value falls back to the default rather than failing the request.**

```text
# --- Password reset (ADR-15, ADR-12 conventions) ------------------------
# The reset token's lifetime, in seconds. Default 3600 (1 hour).
# Product-visible: the email states this value. A malformed value falls
# back to the default.
AUTH_RESET_TOKEN_TTL_SECONDS="3600"

# The minimum response time for a reset request, in milliseconds. Default 250.
# The anti-enumeration floor. Applied on EVERY path, including the
# rate-limited one.
AUTH_RESET_MIN_RESPONSE_MS="250"

# The timing tolerance the acceptance test asserts, in milliseconds. Default 100.
AUTH_RESET_TIMING_TOLERANCE_MS="100"

# Rate limits for the reset request. Both buckets must pass.
AUTH_RATE_RESET_IP_LIMIT="5"
AUTH_RATE_RESET_IP_WINDOW_SECONDS="3600"
AUTH_RATE_RESET_EMAIL_LIMIT="3"
AUTH_RATE_RESET_EMAIL_WINDOW_SECONDS="3600"

# --- Secrets (required; startup fails loudly if missing) ----------------
# Keys the reset token's digest. Separate from SESSION_SECRET.
AUTH_RESET_TOKEN_HASH_SECRET="..."

# Keys the rate-limit bucket's email digest. Separate from
# AUTH_RESET_TOKEN_HASH_SECRET and from SESSION_SECRET.
AUTH_RESET_BUCKET_HASH_SECRET="..."
```

**Two secrets, and both are required.** A missing secret **fails loudly at
startup** — it does not fall back to an unkeyed digest, because an unkeyed
fallback would silently downgrade exactly the property the key exists to
provide. This is the same discipline as ADR-12's "the failure is loud rather
than silent".

**The two secrets are distinct**, and neither is derived from `SESSION_SECRET`.
Deriving one from another couples their rotation schedules for no security
gain, and the reset flow should survive a session-secret rotation without
invalidating outstanding reset tokens.

**`RESET_MIN_RESPONSE_MS` and the tolerance are separate values.** The floor
is the mechanism; the tolerance is the measurement. They are related but not
equal — the tolerance must be wider than the run-to-run variance of the floor,
and keeping them separate lets the tolerance be tuned for a noisy environment
without changing the mechanism.

## Traceability

### Story 004 — deactivation

| Criterion | Design element |
|-----------|----------------|
| 1. `Active` → `Deactivated`, every open session revoked | `Account.deactivate()` (domain) + `AccountDeactivationService` steps 3–8; the revocation and the status change are **one transaction** |
| 2. Reports, Claims, Responses, messages intact | The service has **no repository** that could reach them; `AccountRepository` and `SessionRepository` are its only data dependencies |
| 3. An audit event with the acting administrator and timestamp | Audit **event 13** (`account.deactivated`), written inside the deactivation transaction (ADR-3, ADR-6) |
| 4. A deactivated member's session is unauthenticated | The session rows are revoked with the reason `'account_deactivated'`; `SessionService.resolve()` returns `null` for an account that does not authenticate — **existing behaviour, to be verified by Stage 4, not rewritten** |
| 5. The generic inactive message and no session on login | `GenericInactiveMessage` **reused unchanged**; the `Deactivated` account already fails `canAuthenticate()` and already creates no session. **Stage 4 must verify this still holds after the deactivation path is added** |
| 6. A non-administrator actor is refused | The route derives the actor from the session and checks the administrator flag → `PermissionDeniedError` (403) |
| Edge: administrator deactivates another administrator | **Permitted.** No privilege check on the target; the only precondition is `Active`. The target's flag is cleared. **Stage 4 must test this succeeds** |
| Edge: in-flight request during deactivation | The request completes under the prior actor context; the **next** request is unauthenticated (the revocation is a committed state change, not a mid-flight interruption) |
| Edge: already-`Deactivated` | The idempotent no-op: 200, no write, **no duplicate audit record** |

### Story 008 — reset request

| Criterion | Design element |
|-----------|-----------------|
| 1. Neutral confirmation, does not reveal existence | `NeutralResetConfirmation` — one frozen value, built **after** the branch, from one place |
| 2. Byte-for-byte identical for an unregistered email | The same value object; the branch shapes **no** part of the response. A test asserts byte equality |
| 3. Timing does not vary with existence | The unconditional dummy Argon2id verification + the `RESET_MIN_RESPONSE_MS` floor, **measured** against the `RESET_TIMING_TOLERANCE_MS` tolerance. The floor applies to the **rate-limited** path too |
| 4. The same confirmation in all four statuses; no state change | `Eligible account` is any existing account regardless of status. The request writes **only** a token row — no status column is touched |
| 5. Rate-limited beyond the configured limit | The two `reset:` buckets, both required to pass; the limits are configuration with chosen defaults |
| 6. No audit or log record contains the token or the address in a way that discloses existence | **No audit record is written at all.** The operational log records the fact only, and its `targetId` is the **keyed hash**. The counter table's email key is a keyed digest. The token never enters a log — it travels in the URL's **fragment**, which is never sent to the server and therefore never reaches an access log. *(Corrected in Stage 5.)* |
| Edge: `Deactivated` account | Neutral confirmation; no reactivation. The token's use changes only the password hash — FR-51's rule that a reset never changes lifecycle state |
| Edge: `Pending` account | Neutral confirmation; no approval implied. Same rule |
| Edge: an attacker enumerating addresses | No distinguishing signal in body, timing, or status code |

### Story 009 — reset password

| Criterion | Design element |
|-----------|-----------------|
| 1. A valid unexpired token replaces the hash; the member can log in with the new password | `PasswordResetCompletionService` — the conditional `markUsed` and the hash replacement are **one transaction**; the hash goes through the same `PasswordHasher` port (ADR-12), so the new password authenticates |
| 2. The previous password no longer authenticates | The hash is replaced, so the old plaintext fails `verify()` against the new hash |
| 3. A used token is refused | The conditional write's `used_at IS NULL` predicate — **the write is the check**, atomic against a concurrent replay |
| 4. An expired token is refused | The conditional write's `expires_at > $now` predicate. Expiry is enforced on read, not by a sweeper |
| 5. The lifecycle status is unchanged | The completion writes **only** `passwordHash`. The status column is not in the statement. A test asserts the status is unchanged for `Pending`, `Rejected`, and `Deactivated` |
| 6. The audited record holds no password, hash, or token | **There is no record.** The reset flow writes no audit record at all |
| Edge: a token replayed after a successful reset | Refused by the conditional write; the second use cannot alter the password |
| Edge: two concurrent resets | Two independent tokens, both valid until used. The first use of each wins; a replay is refused. A **different** token is a different authorisation, so two different tokens used in sequence leave the **later** password in place |
| Edge: the new password fails the policy | Rejected by `evaluatePasswordPolicy` **before** the transaction; the existing password remains valid because nothing was written |

### Story 010 — member profile

| Criterion | Design element |
|-----------|-----------------|
| 1. Display name, email, role, and status are shown | The GET route returns `ProfileView` — all four fields. The email is returned **read-only** |
| 2. A change persists and is reflected wherever the name appears | `Account.updateProfile()` + `AccountRepository.save()` in one transaction. The name is read from the `Account` everywhere, so there is no second copy to update |
| 3. An append-only non-numbered record with the actor and timestamp | `AuditWriter.recordNonNumbered('member_profile.edited', { accountId, actorId, changedFields, previousValues, occurredAt }, tx)` — **no new event number** |
| 4. The email is read-only and the change is refused | The `ProfileChange` type has **no `email` field**, so there is no path by which one can reach the aggregate. The structural refusal, not a validation rule |
| 5. Status, administrator flag, and lifecycle edits are refused | The same structural reason: `ProfileChange` has exactly two fields |
| 6. A non-`Active` member has no editor | `Account.updateProfile()` throws for a non-`Active` account — **one check, every path**. The GET route returns 403 for the same reason |
| Edge: the display name is cleared | Rejected by the `DisplayName` value object |
| Edge: a long free-text role | Accepted within the length bound (the existing `SelfDeclaredRole`) |
| Edge: a profile edit while deactivated | Refused — `updateProfile()` throws for a non-`Active` account |

### Requirement traceability

| Requirement | Design element |
|-------------|----------------|
| FR-5 Deactivation | `Account.deactivate()`; `AccountDeactivationService`; the same-transaction session revocation with the reason `'account_deactivated'`; audit event **13**; `GenericInactiveMessage` reused; the account row retained indefinitely; history untouched because the service has no repository that could touch it |
| FR-31 Audit Trail Scope | Event **13** consumed from the frozen catalog; **no new number**; the reset flow writes **no** record |
| FR-32 Audit Trail Visibility | The trail is administrator-only; this bolt writes to it and never reads it for a member |
| FR-37 Sensitive Fields | The reset token, its hash, the password, and the password hash are never logged, audited, or returned by a repository read path. The token travels in the URL's **fragment**, so it never reaches the request line and therefore never reaches an access log. *(Corrected in Stage 5.)* |
| FR-51 Password Recovery | `NeutralResetConfirmation`; the anti-enumeration property on body, timing, and screen state; the keyed token digest; `PasswordResetToken`; the two services; the four-status lifecycle-preservation rule; the two rate-limit buckets with a hashed email key; the authentication/security email classification |
| FR-52 Member Profile | `ProfileChange` — exactly two editable fields, closed; `Account.updateProfile()` — `Active` only; `ProfileEditResult`; the non-numbered `member_profile.edited` record |
| FR-27 Account Approved Email (boundary) | The reset email is **not** an FR-27 email and **not** one of the eight FR-46 events. ADR-14's rule holds: the reset trigger lives in `accounts/`, so `accounts/` owns the reset email's content too |
| PRD §10 (rate limits; email after commit; no secret in a log; CSRF) | The two `reset:` buckets; the email sent after the commit with a logged failure; no address or token in any log; CSRF on every state-changing route |
| PRD §10 (the ≤ 2 s p95 and ≤ 1 s write) | The `RESET_MIN_RESPONSE_MS` floor is the dominant term and is bounded; the email is outside the write |
| PRD A2 (server-side revocation) | `Session` remains a database row; deactivation revokes server-side. A reset does **not** revoke other sessions, because the PRD does not ask for it |
| ADR-12 (Argon2id, Node ≥ 24) | The reset hashes through the same `PasswordHasher` port, with the work factors embedded in the stored hash |
| ADR-14 (email ownership) | The reset email's trigger lives in `accounts/`, so `accounts/` owns its content; the transport is the shared `EmailSender` port |
| ADR-15 (database rate limiter, configured limits) | The two `reset:` buckets use the existing `RateLimiter` port; the limits are configuration with chosen defaults; the email bucket's key is a keyed hash |
| ADR-16 (session activity refresh) | Unchanged by this bolt. The deferred-failure branch of the refresh is **untested** (bolt `004`'s Open item 3) and is **not** this bolt's scope — recorded so it is not lost |

## What Stage 4 must build, explicitly

The design's obligations, carried forward as an implementation checklist:

1. **The conditional `markUsed` write** — `UPDATE … WHERE used_at IS NULL AND expires_at > now()`. **Not** a read-then-write. The write is the check.
2. **Verify the existing `Deactivated` login path still holds** after the deactivation path is added, and **add the missing test** if it does not. The path is **not** rewritten.
3. **Test that an administrator deactivating another administrator succeeds**, and that the deactivated account's flag is cleared.
4. **The unconditional dummy Argon2id verification** on the miss path, and the `RESET_MIN_RESPONSE_MS` floor applied on **every** path — including the rate-limited one.
5. **The token travels in the URL's fragment**, so it never reaches the
   request line and therefore never reaches an access log. The page reads it
   in the browser and **posts it in the request body**. *(Corrected in Stage 5
   — this obligation originally read "The route redacts the `token` query
   parameter from request logs", which was proven impossible by measurement.
   See "The reset link's shape" above.)*
6. **The two HMAC keys are separate, from the environment, and a missing key fails loudly at startup.**
7. **The email is assembled from named parts**, with the wording marked `PENDING UX EDIT` — **not** invented.
8. **The `ProfileChange` type carries exactly two fields** — no `email`, no `status`, no `isAdministrator`.
9. **The audit rows are written inside the transactions**, and the reset flow writes **no** audit row.
10. **The `Account.deactivate()` call clears `isAdministrator`** and sets `deactivatedAt`; the second deactivation is a no-op with **no** duplicate audit row.

## Open questions for the owner

**None.** Stage 1's three raised items were resolved on 2026-10-28 and this
design is built to them. The one item this design raises is not a decision that
blocks implementation:

> **The UX edit for the reset email's subject and body** — a requested
> addition to `EXPERIENCE.md`, specified in full under "The UX edit being
> requested" above. **It does not block Stage 4**: the email is assembled from
> named parts with the wording marked `PENDING UX EDIT`, which is exactly how
> bolt `004` shipped the FR-27 email's structure while its copy was settled.
> The edit should be approved before the email reaches a real member, but
> implementing the named parts does not wait on it.

**One value this design chose, and the owner may adjust it:** the reset
token's lifetime of 1 hour was the owner's decision and is implemented as the
**default** of `AUTH_RESET_TOKEN_TTL_SECONDS`. The design's own defaults for
the rate limits (5/hour per IP, 3/hour per email) and the timing floor (250 ms)
with its tolerance (100 ms) are **this design's choices**, made following
ADR-15's rule that the limits are configuration with chosen defaults. They
are changeable by configuration without a code change, and Stage 5 must
confirm the timing numbers against the real implementation.

## Stage 3 candidates

Stage 3 (ADR Analysis) is optional and asks whether any decision here is
ADR-worthy. Three are:

1. **The reset token's 1-hour lifetime.** A genuine trade-off — a short
   lifetime limits the window a stolen link is usable in but is harsh on a
   member who does not check email promptly, and a long one inverts that. The
   owner has already decided the value; the ADR would record the **reasoning**
   and the fact that it is configuration, so a future change is a deliberate
   act rather than an accident.
2. **The timing equalisation mechanism** — the unconditional dummy Argon2id
   verification plus a constant floor, rather than, say, a constant-time
   comparison against a stored hash or a queue. This is a real architectural
   choice with a cost (every reset request pays ~81 ms of Argon2id) and a
   benefit (the codebase has one established pattern rather than two).
3. **The rate-limit bucket key being a keyed digest** rather than the
   plaintext address — which differs from bolt `004`'s login path, where the
   key **is** the plaintext address. The departure is deliberate and is the
   one place this bolt's design differs from the existing precedent, so it
   deserves a recorded reason.

Stage 3 presents these to the owner, who chooses which to record.
