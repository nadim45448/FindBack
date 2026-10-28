---
unit: 001-identity-and-access
bolt: 004-identity-core
stage: model
status: complete
updated: 2026-10-27T13:35:00Z
---

# Static Model - Identity and Access

Bounded Context

**Identity and Access** decides *who may act in FindBack and in what capacity*.
It owns the account lifecycle from registration through deactivation, the
session that carries that identity, and the `ActorContext` every other unit
consumes. This is the **root unit** — it depends on nothing and every other
unit depends on it.

**The code module is named `accounts/`, not `identity/`** (ADR-13). The unit is
`001-identity-and-access`; the module is `src/domain/accounts/`. The
standards' module map names `accounts/` for "Account lifecycle, session,
password reset" — exactly this unit's scope — and two standards and three
prior bolts use that name. The unit name and the module name are different
things and are allowed to differ.

This bolt covers the **core** half: registration, administrator review,
login, logout, and the restricted state of a `Pending` account. It produces
`Account`, `Session`, and `ActorContext`.

**This bolt does not cover** password recovery (FR-51, stories 008/009),
member profile editing (FR-52, story 010), or deactivation (FR-5, story
004) — those sit in bolt `005-identity-security`, because deactivation's
defining property is session revocation and belongs with the security work.
This bolt's `Session` aggregate is therefore designed so that revocation is
already a first-class operation, even though the deactivation *use case* is
not built here.

**The boundary with Unit 006 (audit).** Unit 006 owns the trail's mechanics.
This unit **writes** to it: every lifecycle action records an audit event
inside the caller's transaction, using the append-only write path bolt
`001-audit-core` built. The audit catalog is frozen — this bolt consumes
FR-31 events 11, 12, and 13, and introduces **no new event number**.

Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| **Account** | `id`, `email`, `passwordHash`, `displayName`, `selfDeclaredRole`, `status` (`Pending`/`Active`/`Rejected`/`Deactivated`), `isAdministrator`, `rejectionReason`, `createdAt`, `activatedAt`, `deactivatedAt` | Email is unique within the organization and normalized (trimmed, lower-cased). The password hash is the only password representation — the plaintext never exists past the request boundary. `isAdministrator` is a **flag on an Active account**, not a separate role type (PRD §3). A `Pending` account with the flag set is still restricted (story 006 edge case). The `rejectionReason` is stored for audit and is **never** returned to the member. Status is changed only through the aggregate's decision methods. Accounts are retained indefinitely, including after deactivation (FR-5). |
| **Session** | `id`, `accountId`, `tokenHash`, `createdAt`, `lastActivityAt`, `expiresAt`, `revokedAt`, `revocationReason` | A **database row, not a JWT** (PRD A2) — logout, deactivation, and password reset must all be able to revoke server-side. The token is stored only as a hash; the plaintext lives in the cookie and is never persisted. Expiry is 14 days of inactivity (FR-4). Revocation is terminal and irreversible. A revoked or expired token yields an unauthenticated request, never an error. |
| **PasswordResetToken** | `id`, `accountId`, `tokenHash`, `createdAt`, `expiresAt`, `usedAt` | Single-use, time-limited, hashed. The entity is **modelled here** so the `Account` aggregate's shape is complete and bolt `005` has a seam, but **no use case in this bolt creates one** — FR-51 is out of scope for bolt `004`. |

Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **AccountStatus** | `Pending` \| `Active` \| `Rejected` \| `Deactivated` | The four PRD states, verbatim. The single source of truth for "may this account act?" — never re-derived by a downstream unit. `Active` is the only status with member capability. |
| **EmailAddress** | `value` | Normalized to trimmed lower-case before the uniqueness check (story 001 edge case). A duplicate differing only in case is a duplicate. Length-bounded. Validated at the route boundary; types are not validation (coding standards § Security coding rules). Never written to an operational log. |
| **PasswordHash** | `value` | The Argon2id encoded hash, including its own parameters and salt. Constructed **only** by the hasher. Never logged, never audited, never returned by a repository read path. Equality is not meaningful — the hash is compared by verifying a candidate password against it. |
| **SelfDeclaredRole** | `Student` \| `Employee` \| `Visitor` \| `Other` | The four PRD options, single-select. **Stored as entered and grants no capability** — it is a self-description, not an authorization input (story 001 edge case). The `Other` option may carry free text alongside it. |
| **DisplayName** | `value` | Unicode-tolerant, length-bounded. Accepted as entered (story 001 edge case). |
| **RejectionReason** | `value` | Free text, minimum 5 characters (FR-3). Stored verbatim for the audit trail, even where user-facing copy would be softened. **Never** reaches a user-facing response, in any form, for any status. A rejection with a blank reason is still a rejection (story 002 edge case) — the reason is optional at the boundary even though the PRD's minimum-5 rule applies when one is given. |
| **SessionToken** | `plaintext` | The secret handed to the cookie. Held in memory only long enough to hash and to set the cookie. Never persisted, never logged, never audited. |
| **SessionTokenHash** | `value` | What is stored. Compared in constant time (coding standards § Security coding rules). |
| **ActorContext** | `actorId`, `status`, `isAdministrator`, `displayName` | The identity every downstream unit consumes. Carries the **status** so a downstream unit never re-derives it from a database read (story 006 criterion 5). `isAdministrator` is only ever true for an `Active` account. An anonymous actor is represented separately and never by an `ActorContext` with a null id. |
| **GenericInactiveMessage** | `value` | The one message every non-authenticating login failure returns. Byte-for-byte identical for `Rejected`, `Deactivated`, unknown-email, and wrong-password (FR-4, story 007). A single value object, so the anti-enumeration property is a compile-time fact rather than a convention. |
| **InactivityWindow** | `days` | 14 days (FR-4). The window from `lastActivityAt` to `expiresAt`. **Refreshed at most once per hour** (ADR-16), so the effective idle window is 13–14 days — the approximation is in the safe direction, and every *explicit* revocation stays exact and immediate. |

Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|-------------|
| **Account** | its own `status`, `email`, `passwordHash`, `displayName`, `selfDeclaredRole`, `rejectionReason`, `isAdministrator`; references its `Session`s and `PasswordResetToken`s | 1. A **new** Account is always `Pending`, always `isAdministrator = false`, and never carries a `rejectionReason`. 2. `approve()` is legal **only** from `Pending`, and sets `Active` + `activatedAt`. 3. `reject()` is legal **only** from `Pending`, and sets `Rejected` + `rejectionReason`. 4. `reject()` and `approve()` are mutually exclusive — the first one wins, and the second is refused (story 002 criterion 4). 5. No method moves an account out of `Active` — deactivation is out of this bolt's scope, and adding it here would be an unfinished transition. 6. `rejectionReason` is set **only** by `reject()`. 7. `isAdministrator` cannot be set on a non-`Active` account. |
| **Session** | its own `tokenHash`, `createdAt`, `lastActivityAt`, `expiresAt`, `revokedAt`, `revocationReason`; references its `Account` | 1. A new Session belongs to an `Active` **or** `Pending` account — a `Pending` account authenticates (FR-4) but gains no member capability (FR-2). It never belongs to a `Rejected` or `Deactivated` account: those do not authenticate at all. 2. `revoke()` is terminal and idempotent. 3. `revokedAt` and `expiresAt` are mutually exclusive in practice — a revoked session is not also expired — and `isUsable()` is false if either is set. 4. The token is hashed at construction; the plaintext is not retained. |

Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `AccountRegistered` | `Account.register()` | `accountId`, `displayName`, `email`, `selfDeclaredRole`, `occurredAt` — **see Conflict 1 below: the audit record for this event has no frozen catalog number** |
| `RegistrationApproved` | `Account.approve()` | `accountId`, `actingAdministratorId`, `occurredAt` — audit event **11** (`registration.approved`) |
| `RegistrationRejected` | `Account.reject()` | `accountId`, `actingAdministratorId`, `rejectionReason`, `occurredAt` — audit event **12** (`registration.rejected`) |
| `AccountDeactivated` | (bolt `005`) | `accountId`, `actingAdministratorId`, `occurredAt` — audit event **13** (`account.deactivated`); **modelled for completeness, not built here** |
| `SessionCreated` | `Session.issue()` | `sessionId`, `accountId`, `expiresAt`, `occurredAt` |
| `SessionRevoked` | `Session.revoke()` | `sessionId`, `accountId`, `reason`, `occurredAt` |
| `LoginRefused` | `AuthenticationService.authenticate()` | `accountId` (may be null — an unknown email has no account), `reason` (`inactive` \| `invalid-credentials`), `occurredAt` — **the `reason` is internal only and is never rendered** |
| `PasswordChanged` | (bolt `005`) | `accountId`, `occurredAt` — FR-51; **out of this bolt's scope** |

Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **PasswordHasher** | `hash(plaintext) → PasswordHash`, `verify(plaintext, PasswordHash) → boolean` | Nothing — pure. The algorithm and work factors live in `infrastructure/accounts` (system architecture § Security and privacy). Work factors are **configured, not hardcoded** (coding standards). The implementation is Node's built-in Argon2id, with the parameters embedded in the stored hash (ADR-12). |
| **AuthenticationService** | `authenticate(email, plaintext) → AuthenticatedActor \| GenericInactiveMessage` | `AccountRepository`, `PasswordHasher`. Enforces the anti-enumeration rule. |
| **SessionService** | `issue(accountId) → Session`, `resolve(token) → ActorContext \| null`, `revoke(sessionId)` | `SessionRepository`, `AccountRepository`. |
| **AccountRegistrationService** | `register(displayName, email, plaintext, role) → Account` | `AccountRepository`, `PasswordHasher`. Enforces email uniqueness and the password policy. |
| **RegistrationReviewService** | `approve(accountId, actingAdministratorId)`, `reject(accountId, reason, actingAdministratorId)` | `AccountRepository`, `AuditWriter`, `EmailSender`. Enforces "only approval sends email" and "email after commit". |
| **ActorContextResolver** | `resolve(sessionToken) → ActorContext \| null` | `SessionRepository`, `AccountRepository`. **The single place** a request's actor is determined. |
| **RegistrationQueueQuery** | `listPending() → PendingRegistration[]` | `AccountRepository`. Ordered by submission time (FR-3). Read-only. |

Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **AccountRepository** | `Account` | `findById(id)`, `findByEmail(email)`, `existsByEmail(email)`, `save(account, tx)` — `save` is the only write, and it takes the caller's transaction handle. |
| **SessionRepository** | `Session` | `findByTokenHash(hash)`, `findById(id)`, `listActiveByAccount(accountId)`, `save(session, tx)`, `revoke(sessionId, reason, tx)` |
| **PasswordResetTokenRepository** | `PasswordResetToken` | `findByTokenHash(hash)`, `save(token, tx)`, `markUsed(id, tx)` — **modelled for bolt `005`; no use case in this bolt** |
| **EmailSender** | — | `send(message) → void` — **called after the transaction commits**. A failure is logged and **never** rolls back or blocks the action (PRD §10, story 002 criterion 6). A **shared** port in `application/ports/`, because the transport will also serve the `notifications` module (ADR-14). |
| **AuditWriter** | — | **Already exists** (bolt `001-audit-core`). `record(draft, tx)` — the transaction handle is a required parameter. This bolt consumes it; it does not re-implement it. |

Ubiquitous Language

| Term | Definition |
|------|------------|
| **Account** | A registered user. The identity record. Retained indefinitely, including after deactivation. |
| **Member** | A user who has completed registration and is **Active**. The only status with member capability. |
| **Pending User** | A registered, unapproved user. Can authenticate and sees a banner; has **no** member capability. |
| **Rejected User** | A registered user whose registration was declined. Cannot log in. The reason is preserved in the trail and never exposed. |
| **Deactivated User** | A previously Active user turned off by an administrator. Cannot log in. All history preserved. |
| **Administrator** | An **Active** Member with the `administrator` flag set. Not a separate role type. The flag alone grants nothing on a non-Active account. |
| **ActorContext** | The resolved identity of the request's actor, carrying the account status so downstream units enforce the same restriction without re-deriving it. |
| **Session** | A revocable database row carrying one authenticated browser's identity. Not a JWT. |
| **Generic inactive message** | The one message every refused login returns. Identical for `Rejected`, `Deactivated`, unknown email, and wrong password. |
| **Registration** | The act of creating a `Pending` Account. No email is sent. |
| **Approval** | An administrator's decision to make a `Pending` Account `Active`. **The only account transition that sends email.** |
| **Rejection** | An administrator's decision to make a `Pending` Account `Rejected`, with a reason recorded for audit and never exposed. No email is sent. |
| **Deactivation** | An administrator's decision to turn off an `Active` Account. Bolt `005`'s scope. |
| **Self-declared role** | A member's own description of their relationship to the organization. Stored as entered. **Grants no capability.** |

---

## The lifecycle, as a state machine

```text
                    register()
                       │
                       ▼
                  ┌─────────┐
                  │ Pending │────── approve() ──────► ┌────────┐
                  └─────────┘                          │ Active │
                       │                               └────────┘
                       │ reject(reason)                     │
                       ▼                                   │ deactivate()  [bolt 005]
                  ┌──────────┐                             ▼
                  │ Rejected │                       ┌──────────────┐
                  └──────────┘                       │ Deactivated  │
                                                    └──────────────┘
```

Three facts the diagram fixes:

1. **`Pending` is the only state both `approve()` and `reject()` may act on.**
   A second decision is refused — story 002 criterion 4, and the story's edge
   case "two administrators decide the same account concurrently: exactly one
   decision commits; the other receives a conflict".
2. **`Rejected` and `Deactivated` are terminal.** The PRD's glossary defines
   them as unable to log in, and no transition leaves either. There is no
   "reinstate" path — it is out of scope (story 007).
3. **`Active` has no outgoing edge in this bolt.** `deactivate()` belongs to
   bolt `005`. Modelling a transition this bolt does not implement would leave
   a half-built path in the aggregate.

## Authorization model

Derived, never client-asserted (`system-architecture.md` § Authorization model):

```text
no session cookie  ──►  Anonymous       (public summary listings only)
session, Active    ──►  Active Member  (full member capability)
session, Pending   ──►  Pending User   (banner + logout only; FR-2)
no session issued  ──►  Refused login  (generic inactive message)
```

`Rejected` and `Deactivated` **never** produce a session, so they never
produce an `ActorContext` either. That is why the generic message is the only
thing they ever see.

The `administrator` flag is orthogonal to the status. It is honoured **only**
on an `Active` account — an administrator flag on a `Pending` account grants
nothing (story 006 edge case), and the flag never survives deactivation in any
useful way because a deactivated account cannot log in at all.

## Where the restriction is enforced — once

Story 006's technical note is explicit: *"The restriction is enforced once, at
the `ActorContext` boundary, not re-implemented per unit."* This bolt
therefore makes the restriction a **property of the resolved actor**, not a
check each downstream unit writes:

```text
ActorContext.status === 'Active'   → member capability
ActorContext.status === 'Pending'  → no member capability
```

Downstream units ask the `ActorContext`; they do not re-read the account and
they do not each write their own `if (status !== 'Active')` guard. The
`Account` entity exposes **no** "is this allowed" method, because that would
invite a downstream unit to ask the wrong question — the question is never
"what is this account's status" but "what may this actor do".

A status change from `Pending` to `Active` needs no data migration: the
restriction is evaluated from the status carried on the context, which is
re-read per request and **never cached across requests** (story 006 edge
case). The `ActorContext` is therefore a per-request value, not a session
attribute — a stale cached context after deactivation is impossible by
construction.

## The anti-enumeration rule, as a type

FR-4, story 003 criterion 5, and story 007 criterion 3 all require that a
refused login be indistinguishable from the wrong password and from an unknown
email. Three separate requirements, one property.

The model enforces it by making the refusal a **single value object**:

```text
GenericInactiveMessage.value
  = "We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator."
```

`AuthenticationService.authenticate()` has exactly two outcomes: an
`AuthenticatedActor` (with an `ActorContext`) or a `GenericInactiveMessage`.
There is no third shape for "wrong password" versus "unknown email" versus
"rejected" versus "deactivated" — so there is nothing to accidentally make
differ. The copy is taken verbatim from `EXPERIENCE.md` §9.3.

This is the reason the `LoginRefused` event's `reason` field is internal-only:
the operational log needs to distinguish the cases for diagnosis, while the
**response** may not. The log records the fact; the response records nothing
that distinguishes them.

## Conflicts and open questions

### Conflict 1 — FR-2 requires a registration audit event, and the frozen catalog has no number for it

**Raised for owner confirmation before Stage 2.**

FR-2's testable consequences state:

> "The audit trail records the registration event with the user's name, email,
> and self-declared role and timestamp."

But FR-31's **authoritative** catalog enumerates the numbered events and has
**no registration-submitted event**. Events 11, 12, and 13 cover
*approved*, *rejected*, and *deactivated* — a `Pending` account's own creation
is not among them. FR-31 also states the numbering rule that makes this
binding:

> "FR-31 events 1–14 and FR-48 events 15–30 together form the **complete**
> numbered workflow/lifecycle audit-event catalog."

And FR-31's additional-records rule allows non-numbered records **only** for
the two it names explicitly:

> "Additional audit records explicitly required by other requirements are also
> part of the append-only administrator-visible audit history but do **not**
> receive additional numbered workflow-event identifiers. In particular:
> FR-52 Member Profile edits … FR-53 Administrator report edits …"

So there are three possible readings, and they differ in what gets written:

**Reading A — a non-numbered record, like FR-52/FR-53.** The registration
writes an unnumbered record carrying the name, email, and role. This satisfies
FR-2's requirement that the trail record the event, and it does not disturb
the frozen numbered catalog. The cost: it adds a **third** non-numbered
record type beyond the two FR-31 names, and the PRD's own wording for the
non-numbered rule says "explicitly required by other requirements" — FR-2
*does* explicitly require it, which is the strongest argument for this
reading.

**Reading B — no audit record for registration.** The numbered catalog is
authoritative and exhaustive, FR-2's sentence is an oversight, and the trail
records only the administrator's decision (event 11 or 12). The cost: FR-2's
requirement goes unmet, and the account has no history of its own creation.

**Reading C — a numbered event.** This would require a new number, which
FR-31 forbids in the strongest terms ("the complete numbered catalog",
"does not receive additional numbered workflow-event identifiers"). **Reading C
is rejected** — it contradicts a frozen requirement and is not presented as a
live option.

**The model is built on Reading A**, and states why:

- FR-2 *explicitly requires* the record. The non-numbered rule's own words
  are "additional audit records explicitly required by other requirements" —
  FR-2 is such a requirement, and it is the only FR that requires a
  registration record.
- It disturbs nothing. Events 1–30 are unchanged; no number moves; the PRD's
  PRD-parity test (bolt `001-audit-core`) still passes.
- The trail is the right home for it: FR-32 makes the trail administrator-only,
  and the account's name, email, and role are exactly the fields an
  administrator reviewing a registration needs.

**But Reading A carries one open sub-question that Stage 2 must settle: the
email address.** FR-2 says the record carries "the user's name, email, and
self-declared role". FR-37 lists "Reporter's email address" as a Sensitive
Field — but that is the **reporter's** email on a *report*, not the account
owner's own registered email. An account's registered email is visible on the
administrator's registration queue (FR-3: "Each entry shows name, email,
self-declared role, and registration timestamp") and on the account-management
surface, so it is administrator-visible by design. The model therefore treats
the registered email as **administrator-visible but never loggable**, and
carries it on the trail record only — never on an operational log line, which
has no field capable of holding it (`RequestContext` is a closed shape).

The **exact record type name** and its field set are Stage 2 decisions, because
they are catalog decisions. The model fixes the *shape*: one unnumbered,
append-only, administrator-only record per registration, carrying the display
name, the registered email, the self-declared role, and the timestamp.

**Owner confirmation is requested before Stage 2 designs this record.** If
Reading B is preferred, the change is small and contained: the registration
use case stops writing the record, and nothing else in this bolt changes.

### Conflict 2 — the story's rejection-reason minimum and the story's own edge case

**Raised for owner confirmation before Stage 2.**

FR-3 says a rejection "requires a short reason (free text, **minimum 5
characters**)". Story 002's edge-case table says "Rejection reason left blank
→ **Rejected without a reason string**". These cannot both hold: a reason
that is required cannot be blank.

The model resolves it by reading the two as **different rules at different
layers**, which is the only reading that leaves both intact:

- The **route boundary** enforces the PRD's minimum: a rejection submitted
  with a reason of fewer than 5 characters is a validation error and the
  decision does not commit (FR-3's "requires").
- The **aggregate** does not require a reason to exist. `reject()` accepts a
  missing reason, because a decision must always be recordable — an
  administrator must never be unable to reject an account because the reason
  box was empty (story 002's edge case, and story 007's identical edge case
  "Administrator rejects with no reason → Rejected; reason field empty").

So the PRD's minimum is enforced on **input**, and the domain tolerates its
absence. This is not a contradiction in the implementation: a request that
reaches the domain with a sub-minimum reason is refused earlier, and the
domain's tolerance is a safety net for a path the boundary already closed.

**Stage 2 must confirm this reading**, because the alternative — enforcing the
minimum in the domain — would make the story's edge case untestable.

### Open item 3 — the Argon2id work factors are unconfigured

The PRD requires "adaptive password hashing" and the unit brief names
Argon2id, but no work factor is specified anywhere. The unit brief says the
work factors are **configured, not hardcoded**. Stage 2 must choose a value
and a configuration surface, and Stage 3 should record it as an ADR if the
choice is a genuine trade-off (a higher factor is slower to verify, which is
visible on the login path, against a stronger resistance to offline
cracking). No number is chosen in this stage — Stage 1 models the
`PasswordHash` value object, which is indifferent to the algorithm.

### Open item 4 — the session inactivity window and the sliding-expiry rule

FR-4 says "Sessions expire after 14 days of inactivity". The model treats
`expiresAt` as a stored timestamp recomputed from `lastActivityAt` on each
request. That is the straightforward reading, but it means every request
writes a row — and on Vercel Hobby that is a database write on the hot path
of every authenticated request. Stage 2 must decide whether `lastActivityAt`
is updated on **every** request, or only when it crosses a threshold (for
example, once per hour), and that decision changes the write volume
materially. The model fixes the *semantics* — 14 days from the last activity
— and leaves the update granularity to Stage 2.

## What this bolt deliberately does not model

- **Password reset (FR-51).** `PasswordResetToken` and the
  `PasswordResetTokenRepository` appear above so the aggregate's shape is
  complete, but no use case in this bolt creates a token. FR-51's
  anti-enumeration requirement (body, timing, *and* screen state) is bolt
  `005`'s problem, and it is a hard one: it needs the response to take the
  same shape and the same time whether or not the account exists.
- **Deactivation (FR-5).** Event 13 is modelled; the use case is not built.
  The `Session` aggregate's `revoke()` is built, because deactivation's whole
  point is revoking every session (bolt `005` will call it).
- **The administrator registration queue's UI.** The `RegistrationQueueQuery`
  service is modelled because FR-3's ordering requirement (submission time)
  is a data contract, but the queue screen is Unit 007's.
- **Rate limiting.** The PRD requires it on registration and login (coding
  standards § Security coding rules). It is a cross-cutting concern with its
  own storage needs on a free-tier database, and it is not modelled here
  because the mechanism is a Stage 2 decision, not a domain fact. **It must
  not be forgotten** — Stage 2 must place it.
- **CSRF tokens.** Required on every state-changing request. A
  cross-cutting transport concern, not a domain concept.

## Story coverage

| Story | What the model gives it | What Stage 4 must build |
|-------|-------------------------|------------------------|
| `001-self-registration` | `Account.register()`, `AccountRegistrationService`, `EmailAddress`, `PasswordHash`, `SelfDeclaredRole`, the audit record (Conflict 1) | The route, the unique index, the password policy, the confirmation screen |
| `002-administrator-review-of-registrations` | `Account.approve()` / `Account.reject()`, `RegistrationReviewService`, `AuditWriter` (events 11, 12), `EmailSender` after commit, `RegistrationQueueQuery` | The queue, the approve/reject actions, the email content (Unit 007 renders it) |
| `003-login-with-active-account` | `AuthenticationService`, `GenericInactiveMessage`, `ActorContextResolver`, `Session`, `SessionService`, `PasswordHasher` | The login route, the `__Host-` cookie, the rate limit, the session-expiry sweep |
| `005-logout-revokes-session` | `Session.revoke()` (terminal, idempotent), `SessionService.revoke()` | The logout route, the cookie clearing, the audit event for the logout |
| `006-pending-member-restricted-access` | `ActorContext` carries `status`; the restriction is one property, not six checks | The 403 refusals at the route boundary; the `Pending` landing surface |
| `007-owner-rejects-registration` | `RejectionReason` — stored for audit, never returned; `GenericInactiveMessage` for the login; no email on rejection | The refusal path proving the reason never reaches a response |

## Traceability

| Requirement | Where the model satisfies it |
|-------------|----------------------------|
| FR-1 Self-Registration | `Account.register()` → `Pending`; `AccountRegistrationService`; `EmailAddress` uniqueness; `SelfDeclaredRole` options; the password policy; the audit record (Conflict 1) |
| FR-2 Pending State and Restricted Access | `AccountStatus`; `ActorContext.status`; the single enforcement point; the registration audit record (Conflict 1) |
| FR-3 Administrator Review of Pending Registrations | `Account.approve()` / `Account.reject()`; `RegistrationQueueQuery` ordered by submission time; `RejectionReason`; no email on rejection |
| FR-4 Login and Logout | `AuthenticationService`; `Session` as a revocable row; `InactivityWindow` = 14 days; `GenericInactiveMessage`; `Session.revoke()` |
| FR-27 Account Approved Email | `EmailSender`, called **only** from `RegistrationReviewService.approve()`, **after** the transaction commits; a failure never rolls back the approval |
| FR-31 Audit Trail Scope | Audit events **11** (`registration.approved`) and **12** (`registration.rejected`) consumed from the frozen catalog; **no new number** introduced (Conflict 1) |
| FR-32 Audit Trail Visibility | The trail is administrator-only; this bolt writes to it and never reads it for a member |
| FR-37 Sensitive Fields | The registered email is administrator-visible on the trail and the queue, and **never** on an operational log |
| FR-39 Visibility Matrix | This bolt owns no member-facing entity; the `ActorContext` is the identity every FR-39 projection is built from |
| PRD A2 (server-side revocation) | `Session` is a database row, not a JWT; `SessionTokenHash` is stored, `SessionToken` is not |
| PRD §10 (email after commit; no secret in a log) | `EmailSender` is called after commit; `RequestContext` has no field capable of holding a password, hash, or token |
