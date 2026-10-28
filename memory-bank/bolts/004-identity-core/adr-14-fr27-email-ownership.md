---
bolt: 004-identity-core
created: 2026-10-27T12:45:00Z
status: accepted
superseded_by: null
---

# ADR-14: The account module triggers the FR-27 email and owns its content, and the notification transport is a shared port

## Context

Two authored artifacts disagree about where the FR-27 account-approved email
belongs.

**The unit brief assigns the trigger to this unit.** Unit
`001-identity-and-access` lists FR-27 among its assigned requirements, and
says so directly:

> FR-27 is placed here rather than in the notifications unit because approval
> is an account-lifecycle action.
> — `memory-bank/intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md` § Notes

and its key operations table gives:

> | `approveAccount` | Administrator approval | accountId, actingAdministratorId | `Active` account + FR-27 email trigger |

The same brief states the rule that makes the trigger inseparable from the
decision:

> 1. **No email at registration or rejection.** Only approval sends one
>    (FR-1, FR-27).

and the story `002-administrator-review-of-registrations` makes it an
acceptance criterion:

> - [ ] **Given** a `Pending` account, **When** the administrator approves it,
>   **Then** the account becomes `Active` and the approval email (FR-27) is
>   sent to the account's email address

**The standards' module map assigns FR-27 elsewhere.**

> ```
> ├── accounts/     Account lifecycle, session, password reset   FR-1..FR-5, FR-51, FR-52
> …
> └── notifications/ Eight workflow emails + reset message        FR-27..FR-30, FR-46
> ```
> — `memory-bank/standards/system-architecture.md` § Module map

`notifications/` owns **FR-27..FR-30 and FR-46** — which includes FR-27.

**The UX spine splits the two halves of the question.** It places FR-27's
copy in the *account lifecycle* sections and the notification mechanics in the
notification sections:

> | FR-27 (Account Approved Email) | §16.2, §4.4 |

§16.2 is the login journey; §4.4 is auto-rejection copy. Meanwhile the
notification section states the division of labour for the Lost-side events:

> > Authority: PRD FR-46, FR-30. **UX owns the rendering and copy semantics of
> > these events; architecture owns the transport.**

And the spine's own summary of the eight events says:

> The PRD lists exactly **eight** notification events. **Events 1–3 cover
> registration and Found-side Claim flow (covered in §16 and §12)**. Events 4–8
> cover the Lost-side Recovery Response flow

So event 1 — FR-27 — is documented alongside the **account** and **Claim**
flows, in the sections that describe those flows. It is not in the Lost-side
table.

### The concrete shape of the disagreement

The two artifacts are not describing the same thing. They are describing two
different responsibilities that both have to exist:

| Responsibility | Who the artifacts disagree assigns it to |
|---|---|
| **Deciding to send** the approval email, and ensuring approval sends one and rejection sends none | The unit brief: the `accounts` module |
| **Rendering the email's content** — subject, body, what it must not contain | The module map: the `notifications` module |
| **Transporting** it — the SMTP call | The module map: the `notifications` module ("architecture owns the transport") |

The Stage 2 design resolved this by saying the `accounts` module "fires the
email" and that "the approval email's *content* is Unit 007's". That placed
the **content** with a *frontend unit* and the **transport** nowhere in
particular, which is not right either: Unit 007's brief says its scope is
"All business rules — Units 001 through 006" and explicitly excludes "Any
change to the UX spines", and the `notifications/` module in the standards
already exists for exactly this.

### The forces in play

| Force | Direction |
|---|---|
| The unit brief: "FR-27 is placed here rather than in the notifications unit because approval is an account-lifecycle action" | The **trigger** belongs to `accounts/` |
| The module map: `notifications/` owns FR-27..FR-30, FR-46 | The **email** belongs to `notifications/` |
| The unit brief's rule 1: "No email at registration or rejection. Only approval sends one" | The send decision is inseparable from the approval decision |
| The story: approval's acceptance criterion includes "the approval email (FR-27) is sent" | The approval is not complete without the email |
| Story `002`: "Email is sent **after** the transaction commits, so a send failure cannot roll back or block the decision" | The trigger is **after** the commit, in the same use case |
| PRD §10: "Email send failures are logged; the triggering action is not blocked" | A failure must not fail the approval |
| UX §13.7: "UX owns the rendering and copy semantics of these events; architecture owns the transport" | Content and transport are separable concerns |
| UX §13.7: "Events 1–3 cover registration and Found-side Claim flow (covered in §16 and §12)" | FR-27's copy is documented with the account flow, not with the Lost-side table |
| `tech-stack.md`: "Email — SMTP relay on a free tier; provider = Architecture (PRD A6)" | The provider is undecided; the seam must not depend on it |
| ADR-3, decision 4: "Email sent after commit, never inside the transaction" | The transport call is outside the transaction |
| `coding-standards.md`: "`application → domain + ports`" and "`infrastructure → domain + application ports`" | A module that sends email needs a **port**, not another module's internals |
| The $0 ceiling | No email service may be introduced that costs money |
| The `notifications/` module is **not yet built** — no bolt exists for it | The dependency cannot be "wait for `notifications/` to exist" |

## Decision

**The `accounts` module owns the FR-27 email end to end: it decides to send,
it owns the content, and it calls the transport. The `notifications` module,
when it is built, owns the other seven workflow emails (FR-28, FR-29, and
FR-46 events 4–8) and the FR-51 reset message.**

The disagreement in the artifacts is resolved by reading them as answering
**different questions**:

- The **unit brief** answers *"which account-lifecycle action triggers an
  email, and under what conditions?"* — `approveAccount`. That is
  `accounts/`.
- The **module map** answers *"where does email content and transport live?"*
  — `notifications/`.

Where they overlap for FR-27 specifically, the **more specific** assignment
wins. FR-27's trigger is the account approval; it is the only one of the eight
workflow emails whose trigger is an **account lifecycle transition** rather
than a report, Claim, or Recovery Response transition. The map assigns
FR-27..FR-30 to `notifications/` as a **range**, and FR-27 is the one member
of that range whose trigger lives in another module.

### The mechanism: a shared transport port, not a module-to-module call

The `accounts` module does **not** import from `notifications/`. Two modules
that both send email share a **port**, in the same way ADR-9 had the firing
modules call the audit module's factory rather than each other.

```text
src/application/accounts/ports/email-sender.ts   ← the port
        ▲                              ▲
        │ implements                   │ implements
src/infrastructure/accounts/      src/infrastructure/notifications/
  smtp-email-sender.ts              smtp-email-sender.ts
```

**The port is the transport.** It carries an `OutboundEmail` — a recipient, a
subject, and a body — and does one thing: send it. The SMTP client, the
provider's credentials, the retry behaviour, and the failure logging live in
the **implementation**, behind the port, and are shared by every module that
sends email.

**The port lives in a shared location, not inside `accounts/`.** A port owned
by one module and implemented by another is a dependency in the wrong
direction. The port is placed where both modules can depend on it without
either depending on the other — `src/application/ports/`, which already exists
and already holds `audit`'s ports (`AuditEventRepository`,
`OperationalLogger`, `TransactionFactory`, and others).

This is a **deviation from the standards' module map**, and it is deliberate:
the map does not currently have a `notifications/` module on disk, and it does
not have a shared-ports location in its `src/domain/` listing (which shows
only the `domain/` layer). The `application/ports/` directory **does** exist
and is the project's established home for cross-module ports.

### The content ownership

The **FR-27 email's content is owned by the `accounts` module**, because:

1. **The UX spine documents it with the account flow.** §13.7 says events 1–3
   are "covered in §16 and §12" — the registration and Claim-flow sections —
   and the FR-27 matrix row points at §16.2 and §4.4. The Lost-side email
   table covers only events 4–8.
2. **The content is account-specific.** The email links to the login page and
   tells the recipient their account was approved. It names no report, no
   Claim, and no Recovery Response. It is an account-lifecycle message wearing
   an email's clothes.
3. **The content's constraints are account constraints.** FR-27 requires a link
   to the application login page and **no auto-login token**; FR-1 requires
   that no email be sent at registration or rejection; and the rejection
   reason must never reach the user. These are rules about the account
   lifecycle, and they are enforced where the lifecycle lives.

### The four contract points, stated explicitly

| Point | Value |
|---|---|
| **Trigger** | The `approveAccount` use case, **after** the transaction commits |
| **Recipient** | The account's registered email address |
| **Content** | Owned by the `accounts` module: a subject and body stating that the account was approved, with a link to the application login page and **no auto-login token** |
| **Transport** | Through the shared `EmailSender` port; the SMTP implementation is shared with `notifications/` |

### The ordering rule, and why it is not optional

The email is sent **after the commit, never inside the transaction**. This is
ADR-3's decision 4 and PRD §10's "Email send failures are logged; the
triggering action is not blocked".

The consequence is worth stating because it is the whole reason the trigger
lives with the decision rather than being dispatched to a queue: **if the
transaction rolls back, no email is sent**, and **if the send fails, the
approval still stands**. The send is a post-commit step of the same use case,
guarded by a `try/catch` that logs the failure. There is no outbox table and
no retry queue — neither is required by the PRD, and both would be new
infrastructure for a single-deployment, single-tenant product.

### What this decision does not change

- The `accounts` module still **decides** to send only on approval. Rejection
  and registration send nothing.
- The email is still sent **after** the commit.
- A send failure is still **logged without sensitive values** and never
  blocks or rolls back the approval.
- The `EmailSender` port's shape is unchanged from the Stage 2 design:
  `send(message: OutboundEmail): Promise<void>`.

### What happens to the `notifications/` module

The `notifications/` module, when built, owns **FR-28** (new claim), **FR-29**
(claim decision), **FR-46 events 4–8** (the five Lost-side events), and the
**FR-51** reset message. Its email content is documented in the UX spine's
§12 and §13.7 tables — the Found-side and Lost-side event tables, which
specify subject lines and what each email must not contain.

It will use the **same** shared `EmailSender` port and the **same** SMTP
implementation. That is the point of putting the port in a shared location:
when `notifications/` arrives, it does not need the `accounts` module's
cooperation, and the `accounts` module does not need to change.

## Rationale

### Why the `accounts` module, not `notifications/`

The trigger is the deciding factor. FR-27 is **not** a generic notification
with an account-related payload — it is the email half of the account
approval. The PRD's FR-1 states the rule as a property of the *transition*:

> **No email is sent on registration, on rejection, or on any other account
> transition except approval.** Email is sent only after approval via FR-27.

A module that owns "which transitions send email" must own the transition. If
`notifications/` owned the FR-27 send, then the rule "only approval sends
one" would be split across two modules, and the `accounts` module would have
to *not* send in the two cases where it must not — a rule enforced by
omission, in a different module, rather than by the code that makes the
decision.

The unit brief says exactly this, and says it for a reason:

> FR-27 is placed here rather than in the notifications unit because approval
> is an account-lifecycle action.

That is the more specific artifact on this question, and it agrees with the
PRD's own framing of the rule.

**The map's range assignment remains intact for the other seven emails.**
FR-28, FR-29, FR-46 events 4–8, and FR-51 all have triggers in the Claim,
Recovery Response, and report workflows, so `notifications/` owns them without
strain. FR-27 is the single exception, and the exception is principled
rather than arbitrary.

### Why a shared port rather than a module-to-module call

`coding-standards.md` § Dependency rule is a hard constraint:

> ```text
> domain  →  nothing
> application → domain + ports
> infrastructure → domain + application ports
> app / ui → application
> ```

If `accounts/` called `notifications/` directly, the dependency would be
`accounts → notifications` — one module's application layer reaching into
another module's application layer. The established pattern in this codebase
is the opposite: the audit module exposes a **factory** that firing modules
call (ADR-9), and the cross-cutting concerns (logging, transactions, quotas)
expose **ports** that every module implements or consumes through
`application/ports/`.

A shared port is that pattern applied to email. `accounts/` depends on
`EmailSender`; so does `notifications/`; neither depends on the other.

### Why the content follows the trigger

The UX spine's own summary places events 1–3 with the account and Claim
flows, not with the Lost-side table, and the FR-27 matrix row points at §16.2
(the login journey) and §4.4. The **content** of the FR-27 email is
account copy — it says an account was approved and links to the login page.

The more general principle: **an email's content belongs with the thing that
determines its facts.** The FR-27 email's facts are "this account was
approved", "this is its email address", "the link must not carry an
auto-login token", and "the rejection reason must never appear". All four
are account facts, and all four are known only to the account module. A
`notifications` module that owned the content would need those facts handed
to it — which is the signature of content that belongs at the source.

### Why no outbox table

An outbox pattern would make the email reliably retryable, and would move
the send out of the request path entirely. It was rejected because:

- **The PRD does not require delivery guarantees for FR-27.** It requires
  that a send failure not block the approval, and that the failure be logged.
  That is satisfied by a post-commit send with a logged catch.
- **FR-27's business requirement is the trigger, not the delivery.** FR-27
  says "Sent when an administrator approves a Pending registration" and lists
  what it must contain. The PRD's email-delivery success metric (SM-5, ≥ 95%
  within 5 minutes) is a product metric, not a transactional guarantee.
- **It is new infrastructure for a single-tenant deployment.** An outbox
  table, a retry worker, and a delivery-status model would be three new
  pieces of machinery, none of which the PRD asks for, on a product whose
  entire traffic is one organization's users.
- **It would decouple the trigger from the decision**, which is precisely the
  coupling FR-1's rule and the story's acceptance criterion require. "Approval
  sends exactly one email" is easier to guarantee when the send is a
  post-commit step of the approval use case than when it is a row in a queue
  that a worker might process twice.

### Why the shared port lives in `application/ports/`

Because `application/ports/` **already exists** and already holds the
project's cross-cutting ports — `AuditEventRepository`,
`AuditReadLogRepository`, `QuotaSnapshotRepository`, `QuotaUsageReader`,
`QuotaLimitProvider`, `OperationalLogger`, `TransactionFactory`,
`TransactionHandle`. Every one of them is consumed by more than one module,
or by infrastructure on behalf of a module. `EmailSender` joins that set
naturally: it is consumed by `accounts/` today and by `notifications/` when
that module is built.

This is a small, visible deviation from the standards' `src/domain/` module
listing, which shows only the `domain/` layer. The `application/` and
`infrastructure/` layers are not enumerated there at all.

**The flat `src/application/ports/` location is what the code already does.**
Bolt `001-audit-core`'s technical design proposed a per-module
`application/audit/ports/`, but the implementation placed the ports flat in
`src/application/ports/` — and all three constructed audit bolts kept them
there:

```text
src/application/ports/
  audit-event-repository.ts     audit-read-log-repository.ts
  operational-logger.ts         quota-limit-provider.ts
  quota-snapshot-repository.ts  quota-usage-reader.ts
  transaction-factory.ts        transaction-handle.ts
```

So the shared-port location this decision names is not a new invention — it
is the location the project actually uses. `EmailSender` joins a directory
that already exists and already holds the cross-cutting ports.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **`accounts` owns the FR-27 email end to end; `notifications` owns the other seven**; the transport is a shared port | The trigger, the content, and the facts all live together; "only approval sends one" is enforced where the decision is made; `notifications` will need no change when it is built; no module-to-module call | A small deviation from the module map's range assignment for FR-27, and a shared port outside the `accounts` module's own directory | **Chosen.** The map's range is honoured for seven of eight emails, and the exception is principled: FR-27's trigger is an account transition |
| **`notifications` owns all eight emails including FR-27; `accounts` signals the trigger** | Uniform with the module map's range; one place for all email content | The `accounts` module would have to signal "approval happened" and `notifications` would decide whether that means an email — splitting FR-1's rule ("only approval sends one") across two modules. The account module could not enforce "no email at registration or rejection" because it would not own the sending | The rule is about the **transition**, and the module that makes the transition must own what it triggers |
| **`accounts` owns the trigger and the transport; `notifications` owns the content** (the Stage 2 draft's shape) | Each half owned by the module that seems natural for it | Requires `accounts` to call `notifications` for content — a module-to-module application-layer dependency that `coding-standards.md`'s dependency rule forbids. Also places the content with a *frontend* unit, whose brief excludes business rules | The dependency rule is a hard constraint, and the frontend unit's brief excludes exactly this |
| **`accounts` owns the trigger and the content; the transport is a private implementation inside `accounts/`** | No shared port; `accounts` is self-contained | `notifications` would need to re-implement SMTP, duplicating credentials, error handling, and failure logging — and the two implementations would drift. The PRD's email events would then have two transports | Duplicated transport is worse than a shared port. The transport is a shared mechanism, not a shared rule |
| **Put the `EmailSender` port inside `src/application/accounts/ports/` and let `notifications` import it** | The port sits with the module that first needed it | `notifications` would depend on `accounts` — the same wrong-direction dependency, just at the port level rather than the module level | A port owned by one consumer and used by another is a dependency in the wrong direction |
| **Add an outbox table: write the email to a queue in the transaction, deliver after commit** | Reliable, retryable delivery; the send leaves the request path | New table, a worker, and a delivery-status model for a single-tenant deployment; decouples the trigger from the decision; the PRD requires only that a failure not block the action | More machinery than the requirement, and it weakens the coupling FR-1's rule depends on |
| **Send the email inside the transaction** | The send and the approval commit together | Directly contradicts PRD §10 and ADR-3's decision 4. A slow or failing SMTP server would hold a database transaction open and could roll back a legitimate approval | Forbidden by the PRD and by a previously accepted ADR |
| **Amend the module map so `accounts/` owns FR-27 too** | The standard and the code would agree exactly | A standards amendment to settle a question the unit brief already answers correctly, and which the specific artifact should decide | The unit brief is the more specific artifact and is correct; the map's range assignment still describes seven other emails accurately |
| **Let the `notifications` module decide, but have `accounts` assert "approval sends exactly one email" in a test** | No module boundary question; the guarantee is tested | The guarantee becomes a convention across a module boundary rather than a structural property — and the two modules are in different units, so the test would be a cross-unit integration assertion about a rule that one module already knows how to enforce | Conventions across boundaries do not fail loudly. This is the reasoning ADR-9 applied to the audit catalog |

## Consequences

### Positive

- **"Only approval sends one email" is enforced where the decision is made.**
  The `approveAccount` use case sends; `rejectAccount` and `register` do not.
  The rule is structural, not a convention across a boundary.
- **The FR-27 email's facts are known at the source** — the account's address,
  the fact of approval, and the "no auto-login token" and "never the rejection
  reason" constraints.
- **The `notifications` module will not need the `accounts` module.** It uses
  the same shared port and the same SMTP implementation. It does not need to
  exist for `accounts` to work, and `accounts` does not need to change when
  it arrives.
- **One transport, one set of credentials, one failure-logging path.**
- **The trigger stays after the commit**, so a send failure never rolls back
  or blocks the approval (PRD §10).
- **The `notifications` module's scope is now unambiguous**: FR-28, FR-29,
  FR-46 events 4–8, and the FR-51 reset message.

### Negative

- **FR-27 is now split from the range the module map assigns it to.** The map
  says `notifications/` owns FR-27..FR-30; this decision says it owns FR-28
  and FR-29 but not FR-27. A reader of the map alone will be misled about
  FR-27.
- **A shared port lives outside any single module's directory.** `application/ports/`
  is now the home of a cross-module port, which the standards' `src/domain/`
  listing does not show — because it does not show the `application/` layer
  at all.
- **The FR-27 email's content is written inside the `accounts` module**, so a
  change to that copy is a change to an identity-module file rather than to a
  notifications-module file. For a reader expecting all email copy in one
  place, this is a surprise — mitigated by the port's shape, which makes the
  copy a value passed to the port rather than a template buried in a module.
- **No delivery retry.** A transient SMTP failure loses that email, and only
  the log records it.

### Risks

| Risk | Mitigation |
|---|---|
| The module map still says `notifications/` owns FR-27, and a future agent follows it | This ADR is indexed in the decision index with a "Read when" line that names email-ownership questions explicitly. **The map should also be corrected** — listed as a required follow-up below |
| A future email event is added and nobody knows which module owns it | The rule is now stated: **an email's owner is the module that owns its trigger**, unless the trigger is a report/Claim/Recovery-Response transition, in which case it is `notifications/`. The rule is the durable part; FR-27 is the instance |
| The SMTP send blocks the approval's response | The send is after the commit and wrapped in a catch, so a slow SMTP server delays the response but never fails it. If SMTP latency becomes a problem, the send can be moved to a `void`-ed background call without changing the commit semantics |
| The FR-27 email's content is edited without the UX spine being consulted | `coding-standards.md` already requires that "Error copy must match `EXPERIENCE.md` §4.9 exactly. Editing user-facing wording while writing code re-opens frozen UX and requires explicit approval." The same rule applies to email copy, and the ADR records that FR-27's content is UX-governed |
| A future FR-51 reset email is built in `accounts` rather than `notifications` | The FR-51 reset message is an **authentication/security** email, not one of the eight workflow events. It belongs to `notifications/` per the map ("Eight workflow emails + reset message"). This ADR assigns it explicitly, so bolt `005-identity-security` has a stated answer rather than an open question |

## Follow-up required

**`memory-bank/standards/system-architecture.md` § Module map must be
corrected** so that `notifications/` no longer claims FR-27. This is a
standards change and therefore the owner's call; it is not performed by this
bolt. The proposed correction is:

> ```
> └── notifications/ Seven workflow emails + reset message        FR-28..FR-30, FR-46, FR-51
> ```

with a note that FR-27 is owned by `accounts/` because its trigger is the
account approval — the decision recorded in ADR-14.

Until that correction is made, **this ADR is the authority on the question**,
and it is indexed in the decision index with a "Read when" line that points
here.

## Related

- **Stories**: `002-administrator-review-of-registrations` (approval sends
  FR-27; rejection sends none), `001-self-registration` (registration sends
  none) — and, in other units, the emails this decision does *not* move:
  `008-claim-notification-emails` (FR-28, FR-29) in unit
  `003-found-side-claims`, and the Lost-side events in bolt
  `020-returns-moderation`
- **Standards**:
  `memory-bank/standards/system-architecture.md` (§ Module map — the
  assignment this ADR qualifies; § Security and privacy — "Email | Failures
  logged, never block the triggering action"),
  `memory-bank/standards/tech-stack.md` (§ Infrastructure — "Email | SMTP
  relay on a free tier; provider = Architecture (PRD A6)"),
  `memory-bank/standards/coding-standards.md` (§ Dependency rule — why a
  shared port rather than a module call; § Error handling — UX copy is
  frozen),
  `memory-bank/intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md`
  (§ Notes — "FR-27 is placed here rather than in the notifications unit
  because approval is an account-lifecycle action"; § Rules this unit must
  not break #1),
  `memory-bank/intents/001-findback-lost-and-found/units/007-web-surfaces/unit-brief.md`
  (§ Out of Scope — "All business rules — Units 001 through 006")
- **Previous ADRs**: ADR-3 (email after commit, never inside the transaction),
  ADR-9 (the shared-factory pattern this decision follows — the firing module
  calls a shared module rather than the modules calling each other),
  ADR-13 (the `accounts/` module name this ADR refers to)
- **Artifacts**:
  `memory-bank/bolts/004-identity-core/ddd-01-domain-model.md`
  (§ Domain Services — `RegistrationReviewService`; § Repository Interfaces
  — `EmailSender`),
  `memory-bank/bolts/004-identity-core/ddd-02-technical-design.md`
  (§ The email port's contract; § External Dependencies; § Route ownership),
  `memory-bank/bolts/001-audit-core/ddd-02-technical-design.md`
  (§ Layer Structure — the per-module `application/audit/ports/` proposal that
  the implementation flattened into `src/application/ports/`)
- **Requirements**: FR-1 (no email at registration or rejection), FR-3
  (approval sends; rejection does not), FR-27 (the account-approved email:
  recipient, login-page link, no auto-login token), FR-28, FR-29, FR-30, FR-46
  (the emails that stay in `notifications/`), FR-51 (the reset message), PRD
  §10 (email failure never blocks the action)
