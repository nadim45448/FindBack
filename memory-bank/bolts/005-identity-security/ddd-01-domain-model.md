---
unit: 001-identity-and-access
bolt: 005-identity-security
stage: model
status: complete
updated: 2026-10-28T07:30:00Z
---

# Static Model - Identity and Access (Security)

Bounded Context

**Identity and Access** decides *who may act in FindBack and in what capacity*.
This bolt is the **security half** of that context: the three operations whose
defining property is *not disclosing what the system knows*.

- **Deactivation** (FR-5) — a member stops acting, and every record they
  touched survives untouched.
- **Password recovery** (FR-51) — a member who cannot sign in can regain
  access, and the request that asked for it reveals nothing about whether the
  account exists.
- **Member Profile** (FR-52) — a member can correct the two identifying fields
  they own, and nothing else.

The code module is `accounts/` (ADR-13), the same module bolt `004` built.
This bolt **extends** it rather than creating a second one: the `Account`
aggregate, the `Session` aggregate, and the `ActorContext` all already exist
and are consumed unchanged. The `PasswordResetToken` entity and the
`PasswordResetTokenRepository` were **modelled in bolt `004` expressly to
leave this seam open** (`ddd-01-domain-model.md`: "modelled here so the
`Account` aggregate's shape is complete and bolt `005` has a seam"). This
bolt fills that seam.

**The boundary with Unit 006 (audit).** Unit 006 owns the trail's mechanics.
This unit **writes** to it, inside the caller's transaction, using the
append-only write path bolt `001-audit-core` built. This bolt consumes:

- **FR-31 event 13** (`account.deactivated`) — a **numbered** event, already in
  the frozen catalog.
- **`member_profile.edited`** — a **non-numbered** record, already in the
  frozen catalog's non-numbered set (FR-52 names it explicitly).

It introduces **no new event number and no new catalog type**. The password
reset flow records **no audit event at all** — see "The reset flow is not
audited" below, which is a deliberate reading of a requirement that says so
in the negative.

**The boundary with Unit 007 (web surfaces).** Every screen this bolt's
capabilities appear on is Unit 007's. The `/forgot`, `/forgot-sent`, and
`/my/profile` routes belong to the web bolt. This bolt builds the
**capabilities and the API contracts behind them**; it does not build the
pages.

Domain Entities

| Entity | Properties | Business Rules |
|--------|------------|----------------|
| **Account** (existing, **extended**) | `id`, `email`, `passwordHash`, `displayName`, `selfDeclaredRole`, `status` (`Pending`/`Active`/`Rejected`/`Deactivated`), `isAdministrator`, `rejectionReason`, `createdAt`, `activatedAt`, `deactivatedAt` | Carried unchanged from bolt `004` **except for two new decision methods**. `deactivateAccount(account, actingAdministratorId, at)` is legal **only** from `Active`, sets `status = 'Deactivated'` and `deactivatedAt`, and **clears `isAdministrator`** — a deactivated account must not keep an administrator flag, because `isAdministrator()` in bolt `004` already refuses the flag on a non-`Active` account, and a stale flag on the row is a trap for the next reader. `updateProfile(account, changes, at)` changes **only** `displayName` and `selfDeclaredRole`; it **never** touches `status`, `email`, `isAdministrator`, `passwordHash`, `rejectionReason`, `activatedAt`, or `deactivatedAt`, and it is legal **only** on an `Active` account. There is no `setStatus`; the two new methods are the only way in. The account row is retained indefinitely after deactivation (FR-5) — deactivation is **not** deletion. |
| **Session** (existing, **unchanged**) | `id`, `accountId`, `tokenHash`, `createdAt`, `lastActivityAt`, `expiresAt`, `revokedAt`, `revocationReason` | **Not modified by this bolt.** Its `revoke()` is already terminal and idempotent (bolt `004`), which is exactly what deactivation needs. The one thing this bolt adds is a **new revocation reason**, `'account_deactivated'`, so an administrator reading the trail can tell a deactivation revocation from a logout. The revocation itself happens in the **same transaction** as the status change, so there is no window in which a deactivated account holds a live session. |
| **PasswordResetToken** (modelled in bolt `004`, **built here**) | `id`, `accountId`, `tokenHash`, `createdAt`, `expiresAt`, `usedAt` | Single-use, time-limited, stored **hashed only** — the plaintext token exists in the reset link, in the member's browser, and in the outbound email, and **nowhere else**. `usedAt` makes it single-use; `expiresAt` makes it time-limited. A token belongs to **one** account and to **one** request. Issuing a new token **does not** invalidate an outstanding one — two concurrent reset requests both stay valid, and the **first use wins** (story 009's edge case). The entity's shape is unchanged from bolt `004`'s model; only the behaviour around it is new here. |
| **ProfileChange** (new) | `displayName`, `selfDeclaredRole` | The **complete** edit surface, as a value, so the aggregate's method takes one parameter and the boundary of what may change is visible in one type. It is a **closed** set: there is no field for email, status, the administrator flag, the password hash, or a deletion. A change that carries anything else does not compile — which is how "exactly two editable fields" (FR-52, the bolt's third success criterion) becomes structural rather than a convention. |

Value Objects

| Value Object | Properties | Constraints |
|--------------|------------|-------------|
| **ResetTokenPlaintext** (new) | `value` | The secret carried in the reset link. Held in memory only long enough to hash it and to build the email. **Never persisted, never logged, never audited, never returned by a repository read path.** It is the reset flow's counterpart to bolt `004`'s `SessionToken`. |
| **ResetTokenHash** (new) | `value` | What is stored. A SHA-256 digest, computed the same way the session token hash is computed (`cookie-session-store.ts`), so the two token types share one mechanism and one comparison rule. Compared in **constant time** (coding standards § Security coding rules). |
| **ResetTokenLifetime** (new) | `durationMs` | How long a reset token stays valid. The PRD deliberately leaves the duration to Architecture ("Reset-token expiry duration" is listed under FR-51's architecture-owned implementation details), so the **value is configuration, not a constant** — the same discipline ADR-15's rate limits got, and the same one bolt `004` applied to the Argon2id work factors. The model fixes only the *shape*: a positive duration, applied at issue time to produce `expiresAt`. |
| **NeutralResetConfirmation** (new) | `value` | The **one** confirmation every reset request returns. Byte-for-byte identical for a registered address, an unregistered address, and a registered address in any of the four lifecycle states. The copy is frozen by `EXPERIENCE.md` §9.3a: *"If an account exists for that email address, password reset instructions have been sent."* This value object is the reset flow's counterpart to bolt `004`'s `GenericInactiveMessage`: **one message, one place, so there is no third shape to accidentally make differ.** |
| **ProfileEditResult** (new) | `account`, `changedFields`, `previousValues` | What a successful profile edit returns to the caller: the updated account, **which fields changed**, and **what they were before**. The two maps are what the audit record carries (FR-52 requires "changed fields, and previous values"), so the use case never has to reconstruct them from the request. A **no-op edit** — a save that changes nothing — returns **empty maps**, and writes **no audit record** (see "Profile edits that change nothing"). |
| **DisplayName**, **SelfDeclaredRole**, **EmailAddress**, **PasswordHash**, **AccountStatus**, **GenericInactiveMessage**, **ActorContext** (existing) | unchanged | Bolt `004`'s value objects are **consumed unchanged**. `DisplayName` and `SelfDeclaredRole` are reused directly for the profile edit. `GenericInactiveMessage` is reused for the **deactivated-account login refusal** (FR-5), which is the same message a `Rejected` account gets. |

Aggregates

| Aggregate Root | Members | Invariants |
|----------------|---------|-------------|
| **Account** (existing, **extended**) | its own `status`, `email`, `passwordHash`, `displayName`, `selfDeclaredRole`, `rejectionReason`, `isAdministrator`; references its `Session`s and `PasswordResetToken`s | Carried from bolt `004`: a new account is always `Pending` and never an administrator; `approve()` and `reject()` are legal only from `Pending` and are mutually exclusive; `rejectionReason` is set only by `reject()`. **Added by this bolt:** 8. `deactivate()` is legal **only** from `Active` and is **idempotent** — a second call on an already-`Deactivated` account is a **no-op that returns the account unchanged**, and writes **no duplicate audit record** (story 004's edge case). 9. `deactivate()` sets `deactivatedAt` and clears `isAdministrator`. 10. `updateProfile()` is legal **only** on an `Active` account — a `Pending`, `Rejected`, or `Deactivated` member has **no profile editor** (story 010 criterion 6, `EXPERIENCE.md` §9.4a). 11. `updateProfile()` changes **only** the two fields in `ProfileChange`. 12. A profile edit **never** changes the lifecycle status, the administrator flag, the email, or the password hash — FR-52's four forbidden edits, enforced by the shape of `ProfileChange` rather than by four separate `if` statements. |
| **PasswordResetToken** (new root) | its own `tokenHash`, `accountId`, `createdAt`, `expiresAt`, `usedAt` | 1. A token is **issued** with a hash, an account, an issue time, and an expiry; the plaintext is **not** part of the entity. 2. A token is **usable** only while `usedAt IS NULL` **and** `expiresAt > now`. 3. **Use is terminal** — once used, the token stays used; a second use is refused and **cannot alter the password**. 4. **Expiry is enforced on read**, not by a sweeper — the same rule ADR-16 sets for sessions: a token is dead the moment its window elapses, whether or not a cleanup job has run. 5. A token **does not carry a lifecycle effect** — using it changes the password hash and **nothing else** on the account. The status is whatever it was before, because FR-51 says so four times. |

Domain Events

| Event | Trigger | Payload |
|-------|---------|---------|
| `AccountDeactivated` | `Account.deactivate()` — **only** when the account was `Active` before the call | `accountId`, `actingAdministratorId`, `occurredAt` — audit event **13** (`account.deactivated`), a **numbered** FR-31 event |
| `MemberProfileEdited` | `Account.updateProfile()` — **only** when at least one field actually changed | `accountId`, `actorId`, `changedFields`, `previousValues`, `occurredAt` — the **non-numbered** `member_profile.edited` record; FR-52 names it explicitly, and it consumes **no** FR-31 or FR-48 event number |
| `SessionRevokedForDeactivation` | the deactivation use case, **per session**, inside the deactivation transaction | `sessionId`, `accountId`, `reason = 'account_deactivated'`, `occurredAt` — **not an audit event**; the session revocation is a state change, not a catalogued action. The trail learns of the deactivation from event 13 alone. |

**The reset flow emits no domain events.** No audit record, no notification
event, no lifecycle event. See "The reset flow is not audited" below.

Domain Services

| Service | Operations | Dependencies |
|---------|------------|--------------|
| **AccountDeactivationService** | `deactivate(accountId, actingAdministratorId, transaction) → DeactivationOutcome` | `AccountRepository`, `SessionRepository`, `AuditWriter`, `TransactionHandle`. Loads the account, refuses a non-`Active` target (or returns an idempotent no-op for an already-`Deactivated` one), changes the status, **revokes every usable session in the same transaction**, writes audit event 13, and returns. **Never** touches a report, a Claim, a Recovery Response, a message, or a historical audit row — it has no repository that could. |
| **PasswordResetRequestService** | `request(email, sourceIp, transaction) → NeutralResetConfirmation` | `AccountRepository`, `PasswordResetTokenRepository`, `PasswordHasher` (only for the timing equalizer), `RateLimiter`, `TransactionHandle`. Enforces the anti-enumeration rule. **The response is the same object in every case**, and the request consumes **the same amount of work** whether or not the account exists. |
| **PasswordResetCompletionService** | `complete(tokenPlaintext, newPassword, transaction) → PasswordResetOutcome` | `PasswordResetTokenRepository`, `AccountRepository`, `PasswordHasher`, `TransactionHandle`. Verifies the token, hashes the new password with the **same Argon2id work factors** used at registration (ADR-12), replaces the hash, marks the token used — **all in one transaction**. **Never** changes the account's status. |
| **MemberProfileService** | `view(accountId) → ProfileView`, `update(accountId, changes, actorId, transaction) → ProfileEditResult` | `AccountRepository`, `AuditWriter`, `TransactionHandle`. Enforces the closed edit surface and the `Active`-only rule, and writes the non-numbered audit record. |
| **PasswordHasher** (existing, reused) | `hash(plaintext) → PasswordHash`, `verify(plaintext, PasswordHash) → boolean` | Nothing — pure. ADR-12's Node built-in Argon2id, work factors configured and embedded in the stored hash. **The reset flow hashes the new password through this same port**, so a reset password is indistinguishable from a registration password — there is no second hashing path to drift. |

Repository Interfaces

| Repository | Entity | Methods |
|------------|--------|---------|
| **AccountRepository** (existing, **unchanged**) | `Account` | `findById(id)`, `findByEmail(email)`, `existsByEmail(email)`, `save(account, tx)`, `listPending(limit)`. **No new method is needed**: deactivation is a `save`, and a profile edit is a `save`. The repository does not learn what a "deactivation" is. |
| **SessionRepository** (existing, **unchanged**) | `Session` | `findByTokenHash(hash)`, `findById(id)`, `listActiveByAccount(accountId, now)`, `save(session, tx)`, `revoke(sessionId, reason, tx, now)`. **`listActiveByAccount` and `revoke` are exactly what deactivation needs, and both already exist** — bolt `004` built them with deactivation in mind. No repository change is required by this bolt. |
| **PasswordResetTokenRepository** (new, **built here** — modelled in bolt `004`) | `PasswordResetToken` | `findByTokenHash(hash) → PasswordResetToken \| null`, `save(token, tx)`, `markUsed(id, tx, now)`. The `tokenHash` lookup is the **only** way to find a token — there is no `findById` on the request path, so a caller cannot address a token without presenting its secret. `markUsed` is separate from `save` so that "used" is an explicit, single-purpose write. |
| **EmailSender** (existing, shared port) | — | `send(message) → void` — **called after the transaction commits** (ADR-3, decision 4). A failure is logged and **never** rolls back or blocks the action (PRD §10). This bolt uses it for **one** message: the FR-51 password-reset email. It is an **authentication/security message** — it is **not** one of the eight FR-46 workflow emails, and **not** a ninth (FR-51 says so explicitly). |
| **RateLimiter** (existing, shared port) | — | `consume(bucketKey, limit, windowSeconds) → RateLimitDecision`. ADR-15's database-backed fixed-window counter. This bolt adds **two** buckets: `reset:ip:<ip>` and `reset:email:<normalized-email>` — the PRD requires "Password-reset requests must be rate-limited", and the unit brief's Technical Context names password reset among the rate-limited endpoints. The **email bucket's key is the normalized address**, hashed before it reaches the counter table — see "The rate-limit key is a hash" below. |
| **AuditWriter** (existing) | — | `record(draft, tx)` / `recordNonNumbered(draft, tx)`. The transaction handle is a **required** parameter. This bolt writes **two** record types: numbered event 13, and non-numbered `member_profile.edited`. |

Ubiquitous Language

| Term | Definition |
|------|------------|
| **Deactivation** | Turning an `Active` account off without deleting it. The account stops acting; every record it touched survives, unaltered. **Not** deletion, and **not** reactivation (which does not exist). |
| **Preserved history** | The reports, Claims, Recovery Responses, messages, and audit entries a deactivated member created. They are **never** rewritten, anonymised, or back-filled to hide the actor — the trail keeps naming the deactivated member. |
| **Generic inactive message** | The one message a refused sign-in returns, whether the account is unknown, `Rejected`, or `Deactivated`. Bolt `004`'s `GenericInactiveMessage`, reused unchanged. |
| **Neutral reset confirmation** | The one response a reset request returns, whether or not the account exists and whatever its status. FR-51's anti-enumeration rule, as a value. |
| **Eligible account** | Any existing FindBack account that uses local password authentication, **regardless of lifecycle state** — `Pending`, `Active`, `Rejected`, or `Deactivated`. FR-51's exact definition. An eligible account receives a reset email; a reset never changes its status. |
| **Reset request** | The act of asking for reset instructions. It is **not** a reset: it issues a token and sends an email, and it changes nothing else. |
| **Reset completion** | The act of setting a new password with a valid token. It replaces the password hash, marks the token used, and changes **nothing else** — in particular, not the lifecycle status. |
| **Reset token** | A single-use, time-limited secret that authorises one password change. Stored only as a hash. |
| **Used token** | A token whose `usedAt` is set. It is refused, permanently. |
| **Expired token** | A token past its `expiresAt`. It is refused. Expiry is checked on read. |
| **Profile edit** | A member changing **exactly** their display name and/or self-declared role. The email, the status, the administrator flag, and the password are **not** editable here. |
| **Changed fields / previous values** | The two maps a profile-edit audit record carries: what changed, and what it was before. FR-52 names both. |
| **Edit surface** | The complete set of fields an operation may change. The profile's edit surface is **two fields**, and it is closed — there is no third. |
| **Non-numbered audit record** | An audit record the PRD requires but does not give a workflow-event number. `member_profile.edited` is one. It does **not** renumber or modify events 1–30. |
| **Anti-enumeration** | The property that a response — its **body**, its **timing**, and its **resulting screen state** — does not reveal whether an account exists. FR-51 requires all three, not just the body. |

The three invariants this bolt exists to hold

1. **Deactivation revokes, it does not erase.** The status change and the
   revocation of every session commit **together**. A deactivated member's
   history is intact, and the trail still names them.
2. **The reset request reveals nothing.** Body, timing, and screen state are
   identical for every address and every lifecycle state. The work done is
   identical too — an account that exists costs no more than one that does
   not.
3. **The profile edit surface is exactly two fields.** Not two fields plus a
   validation that blocks the others. Two.

The anti-enumeration rule, as a type

FR-51 is the strictest requirement in the PRD: the response must not disclose
whether the email is registered, whether the account exists, or the account's
status — and this must hold in the **body**, the **timing**, and the
**subsequent screen state**.

The body is handled by `NeutralResetConfirmation` — one value, one place, the
same object for every case. The screen state is the same consequence: the
caller always routes to `/forgot-sent` (`EXPERIENCE.md` §9.3a).

**Timing is the hard part, and it is handled in the model rather than in a
comment.** Three things must cost the same whether or not the account exists:

1. **The account lookup.** A hit returns a row; a miss returns `null`. The
   miss path must then do **the same work** the hit path does.
2. **The token creation.** A hit creates a token row, a hash, and an email.
   A miss does none of that — so the miss path must perform **an equivalent
   amount of work** before responding.
3. **The email send.** A hit sends; a miss does not. A miss path that returns
   immediately is measurably faster than a hit path that sends an email.

The model resolves this with a **fixed work floor**, stated as a rule on the
service:

> **The reset request performs the same *kinds* of work on every path, and
> the paths are separated by a **constant delay** derived from the
> configuration — never from the account's existence.**

Concretely, the model requires three things and leaves the mechanism to
Stage 2:

- A **hash computation** on every path — so the miss path costs an Argon2id
   verification, exactly as bolt `004`'s login does for an unknown email
   (`authenticate.ts`'s `DUMMY_HASH`). This is the established pattern in
   this codebase and the model follows it rather than inventing a second one.
- A **constant-work floor** on the miss path, so the miss path performs the
  same number of database round trips as the hit path. The mechanism — a
  dummy write, or a deliberately bounded delay — is a Stage 2 decision, and
  Stage 2 must pick one and measure it.
- The **delay is a configuration value**, like the Argon2id work factors and
  the rate limits — not a literal.

**Stage 2 must measure this.** A model that says "the timing must not vary"
without saying how is a wish. The property is only true if it is measured
against the real implementation, and Stage 5 must test it the way bolt `004`
tested the login's timing: two requests, one to a registered address and one
to an unregistered address, compared against a tolerance. **A timing test
without a tolerance is a flaky test** — the acceptance suite must state the
tolerance it accepts.

The reset flow is not audited

**FR-51 requires no audit record for a reset request, and the PRD's audit
catalog names no such event.** This bolt therefore writes **no** audit record
for either half of the reset flow — not for the request, and not for the
completion.

This is a deliberate reading, not an oversight, and it is the reading that
keeps the anti-enumeration rule intact:

- A reset request is **anonymous**. The visitor is not signed in, and there is
  no account id to name as the actor. An audit record for it would have to
  carry *something* to identify the requester.
- Story 008 criterion 6 says: "Given a reset request, **When** it is
  processed, **Then** no audit or log record contains the reset token or the
  submitted address **in a way that would disclose account existence**." The
  record is permitted, but only if it cannot disclose existence. A record
  naming the submitted address for a **registered** account and a different
  record for an unregistered one would disclose existence. A record that is
  **identical in both cases** and holds no address could exist — but it would
  record nothing useful.
- The **token** is never in any record. It is a credential (FR-37), and the
  sanitizer denies credentials by default.

So the model writes **no audit record for the reset flow**, and **no
operational log line carries the submitted address or the token**. The
rate-limit counter is the only trace a reset request leaves, and it is keyed
by a **hash** of the address (below), so the counter table cannot answer
"which addresses were requested" either.

The **password change itself** is worth one sentence: the account's
`passwordHash` changes and **no other field changes**. There is no "password
changed" audit event in the frozen catalog, and this bolt does not invent one.
The requirement that the record contain "no password, hash, or token value"
(story 009 criterion 6) is satisfied trivially, because **there is no record**.

Where the restriction is enforced — once

Bolt `004` established the rule that a downstream unit asks the
`ActorContext` rather than re-deriving the status. This bolt obeys it and
extends it in exactly one place:

- **Profile editing** requires `Active`. The check lives in
  `Account.updateProfile()`, which throws for a non-`Active` account — so
  every path that edits a profile is covered by one check, and the route
  boundary does not need a second one.
- **Deactivation** requires an **administrator** acting on an `Active`
  account. The administrator check belongs to the route boundary (the actor's
  `isAdministrator` is a request-scoped fact, not a domain invariant), and the
  target's status check belongs to the aggregate.
- **Password reset** requires **no session at all** — the flow is available
  to anonymous and signed-out visitors (FR-51). There is no actor, so there
  is no capability check, and none should be invented.

The anti-enumeration rule, as a type — one more property

Bolt `004` made the **login** refusal indistinguishable by giving it one
message and two outcomes. This bolt must do the same for the **reset request**
— but the reset request has a property the login does not: **it has a
side effect** on the hit path (a token row and an email).

The model therefore draws the boundary in **one** place, at the **service**,
not at the route and not in the repository:

- The **service** decides whether to issue a token and send an email. It
  decides it **without** branching the *response*.
- The **response** is built once, after the branch, from the single
  `NeutralResetConfirmation` value.
- The **repository** and the **email port** are told to do their work; they
  never shape the response.

A route that assembled its own response would be the place a future
developer could leak. The model makes that route impossible by having exactly
one place that builds the answer.

The rate-limit key is a hash

The PRD requires the reset request to be rate-limited, and the unit brief
names password reset among the rate-limited endpoints. ADR-15's limiter
stores a **bucket key** in a plaintext column.

Bolt `004`'s login route uses `login:email:${emailBucket}` — the **plaintext
address** — as the key. That is acceptable there because the counter table is
an operational table, not a disclosure surface to the caller.

Here it is different, and the model says why: **the reset flow's defining
requirement is that nothing observable reveals account existence.** A counter
table containing `reset:email:jane@example.org` does not reach the caller —
it is never read through an endpoint — so it is not itself a disclosure. But
the same table is reachable by anyone with database access, and a readable
list of "which addresses were reset" is exactly the enumeration the PRD
forbids, one layer down. The model's rule is therefore:

> **The email-scoped reset bucket's key is a hash of the normalized address,
> never the address itself.** The IP bucket's key is the IP address, because
> an IP is not an account attribute and reveals nothing about whether an
> account exists.

The hash is a **one-way digest with a per-deployment secret**, so the counter
table cannot be reversed into a list of addresses even by someone with read
access to it. The secret lives with the other deployment secrets, and a
missing secret must fail loudly at startup rather than fall back to an
unkeyed digest — a fallback would silently downgrade the property.

Stage 2 must decide the digest's shape. It must not be a bare
`createHash('sha256')` of the address: an unsalted digest of an email
address is trivially reversible by dictionary attack, because the address
space is small and well known. A **keyed** digest (HMAC) is the minimum.

Conflicts and open questions

Conflict 1 — the story forbids a `Deactivated` account from logging in, and
the model must not create a second "inactive" concept

**Story `004`** criterion 5 says a `Deactivated` member's login attempt
returns "the generic inactive-account message and no session". Bolt `004`
already built exactly that path for `Rejected` accounts: the same
`GenericInactiveMessage`, the same 401, no session row.

The model therefore adds **no new message and no new branch**. `Rejected` and
`Deactivated` share the existing message by construction, because they share
the existing value object. This satisfies the unit brief's rule 2 — "Rejected
and Deactivated share one generic login message" — without a second
implementation, and it is the reason the model reuses `GenericInactiveMessage`
rather than introducing a deactivation-specific copy.

**This bolt does not change the login path.** The change it needs is already
in place: bolt `004`'s `Authenticate` consults `canAuthenticate()`, which is
false for `Deactivated`, and `SessionService.resolve()` returns `null` for an
account that does not authenticate (both fixed in bolt `004`'s Stage 5). A
`Deactivated` account therefore already cannot log in and already cannot keep
a live session. **Stage 4 must verify this behaviour still holds after the
deactivation path is added**, and must add the missing test if it does not.

Conflict 2 — deactivating an administrator

**Story `004`**'s edge case says "Administrator deactivates another
administrator → **Refused by policy**; escalation path is out of scope". The
PRD does not say this anywhere: FR-5 says only "An administrator can
deactivate an Active account."

The model must choose, and the choice has to be recorded rather than
silently made:

**The model does not refuse it**, and the reasoning is this. A deactivation
that is refused *by the target's privilege* creates a trap: the last
remaining administrator can be deactivated by nobody, and there is no
escalation path (the story says so itself). More importantly, the PRD's
governing rule for administrators is "Any administrator may manage verification
… Another administrator may take over at any time" — there is **no
self-preservation rule** anywhere in the PRD, and inventing one would widen
the scope beyond the frozen PRD.

So the model's rule is:

> **Any administrator may deactivate any `Active` account, including another
> administrator.** The target's own administrator flag confers no protection.

What the model **does** enforce is the PRD's own constraint that survives
deactivation: a deactivated account **cannot act as an administrator**
(bolt `004`'s `isAdministrator()` already refuses the flag on a non-`Active`
account, and `deactivate()` clears the stored flag so the row does not carry
a stale privilege).

**This is a story-versus-PRD conflict and the owner's call.** The
recommendation is to amend story `004`'s edge case to match FR-5, because
the PRD is authoritative and the PRD does not contain the refusal. If the
owner instead wants the refusal, it is a one-line guard in the service — but
it needs a stated escalation path, which the story says is out of scope, so
the model would then have to carry an unanswered question.

> ✅ **RESOLVED 2026-10-28 — the owner chose the PRD reading.** Any
> administrator may deactivate any `Active` account, **including another
> administrator**; the target's own administrator flag confers no protection.
> The stored flag is cleared on deactivation, so no stale privilege remains,
> and the PRD's own rule still holds — a deactivated account cannot act as an
> administrator.
>
> **Story `004`'s edge case has been amended** to match FR-5, with the
> amendment and its reasoning recorded in the story file. The trap the
> refusal would have created is the reason: the last remaining administrator
> could never be deactivated by anyone, and the PRD states no escalation path.
> The PRD's governing rule — "Another administrator may take over at any time"
> — remains the mitigation.
>
> **Stage 2 carries this forward as a design constraint:** there is no
> privilege check on the target, only the requirement that the target be
> `Active`. Stage 4 must test that an administrator deactivating another
> administrator succeeds, and that the deactivated account's flag is cleared.

Conflict 3 — the reset email's content is UX-governed, and the UX spine does
not define it

`coding-standards.md` requires user-facing wording to match
`EXPERIENCE.md`, and editing frozen UX requires explicit approval.
`EXPERIENCE.md` §9.3a defines the **confirmation screen's** copy and the
**email's classification** (an authentication/security message, separate from
the eight FR-46 events), and it delegates the **email body** to UX ownership
generally (§ "UX owns the user-facing email copy direction").

**There is no frozen copy for the reset email's body or subject.** The model
therefore specifies the reset email's **structure** — a subject, a body with a
single-use link carrying the token, and a statement of the token's lifetime —
and leaves the **wording** to Stage 2, which must either find the frozen copy
or raise a UX edit for the owner's approval.

This is not a licence to invent copy: the FR-27 email in bolt `004` was built
from named parts for the same reason. Stage 2 must assemble the reset email
from named parts, so a copy change is a visible edit in one place.

> ✅ **RESOLVED 2026-10-28 — the owner chose "raise a UX edit for approval".**
> Stage 2 specifies the reset email's **structure** and assembles it from
> **named parts**, and raises an `EXPERIENCE.md` edit for the reset email's
> **subject and body** for the owner's approval. The wording is therefore
> **pending UX** until that edit is approved and recorded in the frozen
> spine — it is not to be invented in the implementation.
>
> This is the same pattern bolt `004` used for the FR-27 approval email: the
> structure is decided here, the copy is owned by UX, and the two are kept in
> one place so a copy change is a visible single edit.

Open item 1 — the reset token's lifetime and the reset email's copy need owner
input

Two values are **not** derivable from the repository and are not the
model's to pick:

1. **The reset token's lifetime.** FR-51 lists "Reset-token expiry duration"
   under architecture-owned implementation details, so it is legitimately
   Architecture's to choose — but it is a **product-visible** duration (the
   email states it), and the value should be one the owner accepts. Stage 2
   must choose a default and expose it as configuration, and Stage 3 should
   record it as an ADR if the choice is a genuine trade-off (a short lifetime
   is more secure but harder to use; a long one widens the window a stolen
   link is usable in).
2. **The reset email's wording.** Frozen UX does not define it (Conflict 3).

> ✅ **BOTH RESOLVED 2026-10-28 by the owner.**
>
> 1. **The reset token's lifetime is 1 hour**, exposed as configuration with
>    that value as the default (`RESET_TOKEN_TTL_SECONDS`, default `3600`).
>    The lifetime is **product-visible** — the email states it — so the
>    configured value, not a hardcoded constant, is what the email renders.
>    A malformed value falls back to the default rather than failing the
>    request, matching the convention ADR-15's rate limits already use.
>    **Stage 2 makes it configuration; Stage 3 records it as an ADR** if the
>    choice presents as a genuine trade-off, which it does — a short lifetime
>    limits the window a stolen link is usable in but is harsh on a member who
>    does not check email promptly, and a long one inverts that.
> 2. **The reset email's wording is raised as a UX edit** for approval rather
>    than drafted in this bolt. See Conflict 3's resolution above. The email
>    is assembled from **named parts** so the eventual copy is a single
>    visible edit in one place.

Open item 2 — the "first use wins" rule under concurrent resets

Story `009`'s edge case says: "Two resets requested concurrently → Both tokens
valid until used; the first use wins."

The model supports it, and the mechanism is **the database**, not the
application: `PasswordResetToken.tokenHash` carries a **unique index**, and
`markUsed` is a conditional write (`UPDATE … WHERE used_at IS NULL AND
expires_at > now()`) inside the transaction. Two concurrent completions of
*different* tokens are both legal, and the **second** one wins the password —
because they are two independent tokens, and "first use wins" applies to a
**replay of the same token**, which the conditional write refuses.

That is the only reading that keeps FR-51's own rules intact: a reset "never
changes the lifecycle status", and the story's rule that a **replayed** token
is refused. Two *different* tokens each authorise one password change; the
same token twice authorises only one. **Stage 4 must implement the
conditional write**, not a read-then-write, or the replay protection is a
race.

Defect 1 (fixed) — bolt `004`'s `rejectAccount()` set `deactivatedAt`

**This bolt found a real defect while reading the aggregate it extends, and
fixed it immediately after the Stage 1 checkpoint.**

`rejectAccount()` in `src/domain/accounts/account.ts` **used to** set:

```text
status: 'Rejected',
rejectionReason: reason,
activatedAt: null,
deactivatedAt: at,      ← the defect
```

A **rejected** account was stamped with a `deactivatedAt` timestamp, even
though it was never deactivated. The column's meaning was therefore broken: it
recorded "the moment this account last left the `Pending` state", not "the
moment this account was deactivated".

**Why it was still a defect, and not a harmless quirk.** Nothing read the
column for a decision — it was written by the repository and mapped back, and
that was all — so **no behaviour was wrong at the time**. But this bolt is
the one that gives the column its meaning: `deactivate()` sets
`deactivatedAt` as a core part of the deactivation invariant, and the model
above states plainly that the field is the record of a deactivation. The next
reader — or the next unit — would reasonably read "this account was
deactivated at T", and the row would say so for an account that was only
rejected. The defect was **latent, and this bolt is the one that made it
reachable**.

**The fix, applied.** `rejectAccount()` no longer takes a timestamp and no
longer touches `deactivatedAt`; the column stays `null` on the rejection path,
exactly as it is on a newly registered account. The parameter was removed
rather than left unused, so the function's signature no longer implies it
records a moment. The call site in `review-registration.ts` and the seven test
call sites were updated, and a test now locks the behaviour: *"leaves
`deactivatedAt` null — a rejection is not a deactivation"*.

**Verified:** typecheck exit 0, lint exit 0, and the full suite **605/605
across 47 files** (604 before, plus the one new test). The `Account` table
was empty, so **no data migration was needed** — had it held rejected rows,
they would have carried a bogus `deactivatedAt` that the fix does not clean
up retrospectively.

**The model's invariant and the code now agree:** `deactivatedAt` is set by
`deactivate()` and by nothing else.

What this bolt deliberately does not model

- **The `/forgot`, `/forgot-sent`, and `/my/profile` screens.** They are Unit
  007's. This bolt builds the capability and the API behind them. The
  confirmation copy is a value object here because the API must return it, not
  because the page lives here.
- **The password-reset email's transport.** Bolt `004` built the SMTP sender
  and ADR-14 fixed the shared `EmailSender` port. This bolt uses it.
- **Reactivation.** FR-5 does not define it, story `004` puts it out of
  scope, and no transition in this model moves an account out of
  `Deactivated`. A `Deactivated` account is terminal — except that FR-51 lets
  it change its **password**, which is not a lifecycle change.
- **Account deletion.** Out of scope in the PRD and in story `004`. The
  account row is retained indefinitely.
- **Email changes.** FR-52 forbids them; the PRD does not introduce
  email-change. There is no edit path and no value object for one.
- **Self-deactivation and self-deletion.** Out of scope (story `010`).
- **The administrator's account-management view.** FR-52 says administrators
  can view member profile fields through the existing administrator
  account-management view (FR-3 / FR-5). That view is Unit 007's; the model
  provides the read.
- **Revoking other sessions on a password reset.** Story `009` says explicitly
  that this is "a separate decision not present in the PRD" and lists it as
  out of scope. **A reset does not revoke other sessions.** The model records
  this so no one "fixes" it later by assumption.
- **Two-factor authentication, security questions, SMS recovery, cross-account
  password-reuse detection, administrator-initiated resets.** FR-51 lists all
  five as out of scope.
- **The FR-51 rate-limit *values*.** The model requires that reset requests
  are rate-limited and that the limits are configurable (ADR-15's
  configuration rule). The numbers are a Stage 2 decision, exposed as
  configuration with defaults.

Story coverage

| Story | What the model gives it | What Stage 4 must build |
|-------|-------------------------|------------------------|
| `004-deactivate-an-account` | `Account.deactivate()` — `Active` only, idempotent, sets `deactivatedAt`, clears the administrator flag; `AccountDeactivationService`; `Session.revoke()` (existing, unchanged) with the reason `'account_deactivated'`; audit event **13**; the reuse of `GenericInactiveMessage` for the login refusal; `AccountRepository` and `SessionRepository` (both existing, **unchanged**) | The deactivation route; the same-transaction revocation; the idempotent no-op path; the refusal for a non-administrator actor; the tests that a `Deactivated` account cannot log in and cannot keep a live session, and that its reports/claims/responses/messages/audit history are untouched |
| `008-reset-request-never-discloses-account` | `NeutralResetConfirmation` (one value for every case); `PasswordResetRequestService`; the anti-enumeration rule as three properties (body, timing, screen state); the fixed-work-floor rule and the constant-delay configuration; `PasswordResetToken` (single-use, hashed, time-limited); `PasswordResetTokenRepository`; `ResetTokenPlaintext` / `ResetTokenHash` / `ResetTokenLifetime`; the hashed rate-limit key; the two `reset:` buckets; the "no audit record, no address in a log" rule | The request route; the timing equalizer and its measurement; the rate-limit buckets and their configured values; the token issue and the email send (after commit); the tests that the body is byte-for-byte identical, that the timing is within a stated tolerance, and that no record or log holds the address or the token |
| `009-reset-password` | `PasswordResetCompletionService`; the `Account` aggregate's `passwordHash` replacement with **no other field changed**; `PasswordResetToken`'s terminal use, on-read expiry enforcement, and conditional `markUsed` (replay refused); the Argon2id work factors reused from ADR-12; the "a reset never changes the lifecycle status" rule; the "no other sessions are revoked" rule | The completion route; the token verification; the single-transaction hash-replace + mark-used; the tests that a used token is refused, an expired token is refused, the old password no longer authenticates, and the status is unchanged for `Pending`, `Rejected`, and `Deactivated` |
| `010-update-member-profile` | `ProfileChange` — the closed two-field edit surface; `Account.updateProfile()` — `Active` only; `ProfileEditResult` (changed fields, previous values); `MemberProfileService`; the non-numbered `member_profile.edited` record; `ProfileView` (display name, email, role, status) | The profile read and the profile write routes; the non-numbered audit record with the two maps; the tests that the email and the status cannot be changed, that a non-`Active` member has no editor, and that the audit record holds no password, hash, or token |

Traceability

| Requirement | Where the model satisfies it |
|-------------|----------------------------|
| FR-5 Deactivation | `Account.deactivate()` — `Active` only, idempotent, clears the administrator flag; `AccountDeactivationService`; same-transaction session revocation with the reason `'account_deactivated'`; audit event **13**; the reuse of `GenericInactiveMessage`; the account row retained indefinitely; history untouched because the service has no repository that could touch it |
| FR-31 Audit Trail Scope | **Event 13** (`account.deactivated`) consumed from the frozen catalog; **no new number introduced**; the reset flow writes **no** record |
| FR-32 Audit Trail Visibility | The trail is administrator-only; this bolt writes to it and never reads it for a member. The profile record is administrator-visible; the member sees only the outcome of their own edit |
| FR-37 Sensitive Fields | The reset token, the reset-token hash, the password, and the password hash are **never** logged, audited, or returned by a repository read path. The reset email's token is the only place the plaintext exists |
| FR-51 Forgot Password / Password Recovery | `NeutralResetConfirmation`; the anti-enumeration property on body, timing, and screen state; `PasswordResetToken` (single-use, time-limited, hashed); `PasswordResetRequestService`; `PasswordResetCompletionService`; the four-status lifecycle-preservation rule; the rate-limit buckets; the authentication/security email classification (not one of the eight FR-46 events) |
| FR-52 Member Profile | `ProfileChange` — exactly two editable fields, closed; `Account.updateProfile()` — `Active` only, never touches the email, the status, the administrator flag, or the password hash; `ProfileEditResult`; the non-numbered `member_profile.edited` record with changed fields and previous values |
| FR-27 Account Approved Email (boundary) | The reset email is **not** an FR-27 email and **not** one of the eight FR-46 events. ADR-14's rule — an email's owner is the module that owns its trigger — still holds: the reset trigger lives in `accounts/`, so `accounts/` owns the reset email's content too |
| PRD §10 (rate limits; email after commit; no secret in a log) | The two `reset:` buckets; `EmailSender` called after the transaction commits, with a failure logged and never blocking; no address or token in any log line; the hashed bucket key |
| PRD A2 (server-side revocation) | `Session` remains a database row; deactivation revokes server-side; a reset may **not** revoke other sessions, because the PRD does not ask for it |
| ADR-12 (Argon2id, Node 24) | The reset's new password is hashed through the **same** `PasswordHasher` port, with the same work factors, embedded in the stored hash |
| ADR-15 (database rate limiter, configured limits) | The two `reset:` buckets use the existing `RateLimiter` port; the limits are **configuration**, not constants; the email bucket's key is a keyed hash of the normalized address |
| ADR-16 (session activity refresh) | Unchanged by this bolt. The deferred-failure branch of the refresh is **untested** (bolt `004`'s Open item 3) and is **not** this bolt's scope — it is recorded here so it is not lost |
| Bolt `004`'s seam | `PasswordResetToken` and `PasswordResetTokenRepository` were modelled in bolt `004` expressly for this bolt. Their **shape** is unchanged; only the behaviour around them is new |
