---
bolt: 004-identity-core
created: 2026-10-27T12:35:00Z
status: accepted
superseded_by: null
---

# ADR-13: Name the module `accounts/`, conforming to the standards' module map, rather than `identity/`

## Context

The Stage 2 technical design for bolt `004-identity-core` proposed a module
named `identity/`:

```text
src/domain/identity/
src/application/identity/
src/infrastructure/identity/
```

The project's standards name a different directory:

> ```text
> src/domain/
> ├── accounts/     Account lifecycle, session, password reset   FR-1..FR-5, FR-51, FR-52
> ├── listings/     Report CRUD, search, visibility projection   FR-6..FR-14, FR-37..FR-39, FR-49, FR-53
> ├── claims/       Found-side Claim lifecycle                    FR-15..FR-18, FR-26, FR-28, FR-29
> ├── recovery/     Lost-side Recovery Response lifecycle        FR-40..FR-48
> ├── returns/      Returned confirmation, receiver substitution FR-23..FR-25
> ├── audit/        Append-only trail and audit-read logging      FR-31, FR-32, FR-48
> ├── moderation/   Close, remove content, administrator queues   FR-21, FR-33..FR-36, FR-50
> └── notifications/ Eight workflow emails + reset message        FR-27..FR-30, FR-46
> ```
> — `memory-bank/standards/system-architecture.md` § Module map

`coding-standards.md` § File and folder organization independently lists
`accounts/` in the same position:

```text
│   ├── claims/
│   ├── recovery/
│   ├── accounts/
```

So **two** independent standards name `accounts/`, and the design proposed
`identity/`. The design's stated rationale was:

> The module is named `identity` because the unit's concern is identity, not
> just the `Account` row — `Session` and `ActorContext` are first-class
> outputs.

That rationale is not wrong about the *scope*. The standards' own description
of `accounts/` is "**Account lifecycle, session, password reset**" — which is
exactly what this bolt builds. The scope argument cuts the other way: the
module holds the account lifecycle *and* the session *and* (in bolt `005`) the
password reset. That is `accounts/` by the standards' own description.

### The precedent is the strongest evidence

Three bolts have already been constructed, and **all three conform to the
standards' module map exactly**:

| Bolt | Module | Standards' map entry |
|---|---|---|
| `001-audit-core` | `src/domain/audit/` + `src/application/audit/` + `src/infrastructure/audit/` | `audit/` — "Append-only trail and audit-read logging" |
| `002-audit-reads` | same `audit/` module | (as above) |
| `003-audit-lost-side-events` | `src/domain/audit/` for the FR-48 catalog; firing modules elsewhere | `audit/` — "FR-31, FR-32, FR-48" |

Bolt `001-audit-core`'s technical design states the conformance rule
explicitly:

> | Module | `src/domain/audit/` + `src/application/audit/` + `src/infrastructure/audit/` | **Matches the module map in `system-architecture.md`**; `audit` owns FR-31, FR-32, FR-48. |

ADR-9 then took the map's **overlapping** assignments — FR-48 is listed under
both `recovery/` and `audit/` — and resolved them without renaming anything.
The map's structure was treated as authoritative even where it was
ambiguous.

### The forces in play

| Force | Direction |
|---|---|
| `system-architecture.md` § Module map names `accounts/` | The directory is `accounts/` |
| `coding-standards.md` § File and folder organization independently names `accounts/` | The directory is `accounts/` |
| The map's own description of `accounts/` is "Account lifecycle, session, password reset" | That is exactly this bolt's scope, and this bolt's |
| Three constructed bolts all conform to the map | The map is followed in practice, not merely in theory |
| ADR-9 resolved the map's ambiguity **without** renaming a module | Ambiguity is not a licence to diverge |
| `system-architecture.md` § "Decisions carried into Construction" lists "Aggregate boundaries and which entity owns each invariant" as an open item for the first DDD bolt | The module's *boundaries* are open to decision; its *name* is not |
| `coding-standards.md` naming conventions: "Files — kebab-case" | The directory name is a fixed vocabulary term |
| A module's name is read by every future agent | A diverging name makes the codebase's layout differ from the document that describes it |

## Decision

**The module is named `accounts/`, exactly as the standards specify.**

```text
src/domain/accounts/
src/application/accounts/
src/infrastructure/accounts/
```

The Stage 2 design's `identity/` naming is **withdrawn**.

### The scope argument is answered, not dismissed

The design's concern — that this module produces `Session` and `ActorContext`,
not only an `Account` — is a real concern, and it is worth being precise about
why it does not justify a new directory name.

The standards already describe the module this way. `accounts/` is "Account
lifecycle, **session**, password reset" — the session is already named as part
of it. `ActorContext` is the *resolved actor* of an account's session; it is
not a separate bounded context, and it does not carry state of its own. It is
a projection derived from an `Account` and a `Session`, both of which live in
`accounts/`.

So the design's scope is not wider than the standards' `accounts/` entry — it
is the same scope, described with different nouns.

### What this decision does not change

Everything else in the Stage 2 design stands:

- The **entities** are unchanged: `Account`, `Session`, `PasswordResetToken`.
- The **value objects** are unchanged: `AccountStatus`, `EmailAddress`,
  `PasswordHash`, `SelfDeclaredRole`, `DisplayName`, `RejectionReason`,
  `SessionToken`, `SessionTokenHash`, `ActorContext`,
  `GenericInactiveMessage`, `InactivityWindow`.
- The **layer split** is unchanged: `domain/accounts/` (pure),
  `application/accounts/` (use cases + ports),
  `infrastructure/accounts/` (Prisma, Node crypto, SMTP, cookies).
- The **ports** are unchanged, and keep their names: `AccountRepository`,
  `SessionRepository`, `PasswordResetTokenRepository`, `PasswordHasher`,
  `EmailSender`, `RateLimiter`, `CSRFTokenValidator`.
- The **file names** inside the module are unchanged, and still follow
  `coding-standards.md`'s kebab-case convention:
  `account.ts`, `account-status.ts`, `session.ts`, `actor-context.ts`,
  `email-address.ts`, `password-policy.ts`, `password-hash.ts`,
  `self-declared-role.ts`, `rejection-reason.ts`,
  `generic-inactive-message.ts`, `registration-error.ts`.
- The **dependencies** are unchanged: `domain/accounts/` imports nothing.

### The distinction that is preserved

The unit is called `001-identity-and-access`; the module is called
`accounts/`. **These are different things and they are allowed to differ.**

- The **unit** is an inception-time grouping of stories and requirements.
  Its name describes the *problem area*.
- The **module** is a code-level boundary described by the standards' module
  map, whose vocabulary is fixed: `accounts`, `listings`, `claims`,
  `recovery`, `returns`, `audit`, `moderation`, `notifications`.

The standards already exhibit this difference — unit `006-audit-and-observability`
maps to the `audit/` module, and unit `003-found-side-claims` maps to
`claims/` plus `returns/`, while the standards' map also names a
`notifications/` module that no unit is named after. A unit name and a module
name are not required to match, and matching them is not a goal.

### The `notifications/` boundary is unaffected

This decision concerns **this** module's directory. The FR-27 email's module
ownership is a **separate question**, resolved in ADR-14, and the two are
independent: naming this module `accounts/` does not decide where the FR-27
email's content is rendered.

## Rationale

### Why conform rather than diverge

**The map is the project-level description of the codebase's layout, and two
standards state the same name.** When a design proposes a different name, it
is proposing to amend a project standard — and the design is the wrong place
to do that unilaterally. Amending `system-architecture.md` would be a visible,
owner-approved change to a standard; silently choosing a different directory
in one bolt's technical design is an invisible one.

**Every prior bolt conformed.** Three bolts, three modules, all matching the
map exactly, with bolt `001-audit-core` citing the map as its explicit
rationale. A fourth bolt that diverged would be the first, and it would
establish a precedent that the map is advisory — which it is not.

**ADR-9 is the precedent against the "the map is ambiguous, so I may choose"
argument.** That ADR confronted a real ambiguity in the map — FR-48 assigned
to two modules — and resolved it by keeping the catalog in the `audit/` module
where the map put it, and letting the firing modules call it. It did **not**
rename a module. The map's structure survived contact with a genuine
conflict.

**The scope argument does not survive the map's own description.** `accounts/`
is "Account lifecycle, session, password reset". This bolt builds the account
lifecycle and the session; bolt `005-identity-security` builds the password
reset. The map's entry describes *both* bolts. `identity/` would describe
neither as accurately as `accounts/` does, because `identity` is not a term
the standards use anywhere.

### Why the divergence would have cost something concrete

The cost is not abstract. Consider the next agent to work on this codebase.
It reads `system-architecture.md` § Module map and expects `src/domain/accounts/`
to hold FR-1..FR-5, FR-51, and FR-52. It finds `src/domain/identity/`. It now
has to decide whether the map is stale, whether this bolt amended it, or
whether there are two modules. Every future import decision, every
cross-module dependency check, and every "which module owns FR-52" question
picks up that ambiguity.

The `accounts/` → `identity/` rename also has a **downstream cost**: unit
`005-identity-security` will build the password reset in the same module, and
the standards place FR-51 under `accounts/`. A module named `identity` would
have to be updated in a standards file to host FR-51's module — a second
divergence, in the same bolt family, for the same reason.

### Why this is a decision worth recording at all

It is a small decision — a directory name — and the honest answer is that a
decision this small usually does not need an ADR. It is recorded because
**the design had already diverged from two standards**, and because the
divergence was made deliberately with a stated rationale. Recording the
reversal, and the reasoning that reversed it, prevents the next agent from
re-deriving the same proposal and re-litigating it. It also keeps the
decision-index's promise: the index exists so that agents can "scan the 'Read
when' fields before implementing", and a module's directory name is exactly
the kind of thing an agent must not have to guess.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **Name the module `accounts/`** | Matches two standards exactly; matches three prior bolts; the map's own description of `accounts/` is this bolt's scope; no standard amendment needed | The name describes the `Account` entity more than it describes `ActorContext` — though the map already lists "session" as part of `accounts/` | **Chosen.** Conformance to the project layout, established by three bolts, outweighs a naming preference |
| **Name the module `identity/`** | Describes the unit's concern — identity, not just a row; `Session` and `ActorContext` are first-class outputs | Diverges from two standards and three prior bolts; `identity` appears nowhere in the standards' vocabulary; leaves FR-51's module unnamed for bolt `005`; makes the codebase's layout differ from the document describing it | The scope it captures is already captured by the map's `accounts/` entry, which names the session too |
| **Name the module `identity/` and amend `system-architecture.md` to match** | The codebase and the standard agree; the scope is named precisely | Amending an approved project standard to rename a directory is a larger change than the problem warrants, and it would need the owner's approval as a standards change rather than a bolt decision | The problem is a preference, not a defect in the standard. Amending the standard to satisfy a preference inverts the relationship between the standards and the code |
| **Split into two modules — `accounts/` and `sessions/`** | Each name is precise; `Session` gets its own boundary | The standards place the session inside `accounts/`; a session with no account is meaningless, so the split has no independent boundary; it fragments one aggregate's lifecycle across two directories and makes the module map wrong in a different way | The session is not a separate bounded context. Splitting adds a boundary the domain does not have |
| **Name the module `identity/` but keep the standards' description in a comment** | The code says what it means | A comment does not make a directory discoverable; the map still names a directory that does not exist | A comment does not solve a discovery problem |
| **Defer the name to Stage 4** | Stage 4 could pick whichever reads better | The name appears in Stage 2's layer structure, its import paths, and its file layout — deferring it means Stage 2 specifies paths it will not implement | The design's paths are the contract Stage 4 implements |

## Consequences

### Positive

- **The codebase's layout matches the standards exactly**, with no divergence
  introduced by this bolt.
- **The module map stays a reliable index.** An agent reading
  `system-architecture.md` § Module map finds the right directory for every
  FR, because every bolt has followed the map.
- **The design's paths and Stage 4's implementation are identical**, with no
  rename in between.
- **Bolt `005-identity-security` has an unambiguous home** for the password
  reset — FR-51, which the map places under `accounts/`.
- **The scope concern is answered in the standard's own terms**: the map
  already calls `accounts/` "Account lifecycle, session, password reset", so
  the three outputs the design named are the three the map names.
- **The unit name and the module name are allowed to differ**, which the
  project already does elsewhere — and which keeps the standards' module
  vocabulary intact.

### Negative

- **The directory name reads narrower than the unit's concern.** Someone
  looking for `ActorContext` may not look in `accounts/`. The mitigation is
  that the module's contents and the map's description both make it findable,
  and the file `actor-context.ts` is named for what it is.
- **A reader comparing the unit name (`001-identity-and-access`) with the
  module name (`accounts/`) may wonder whether they differ by accident.** This
  ADR is the answer, and the ADR is indexed in the decision index precisely so
  that the question has a documented resolution.

### Risks

| Risk | Mitigation |
|---|---|
| A future bolt proposes yet another name for a module the map already names | This ADR records the rule that the map is authoritative for directory names, so the proposal can be answered by reference rather than re-litigated |
| The map's `accounts/` description is later widened to include a concern this bolt did not anticipate | The map is a living document; a change to it is a standards change and will be visible in review. This ADR concerns the **name**, not the description's completeness |
| A future agent reads the unit name and creates an `identity/` directory alongside `accounts/` | The decision index's "Read when" line names module-directory questions explicitly, and this ADR is indexed there |

## Related

- **Stories**: all six in this bolt — `001-self-registration`,
  `002-administrator-review-of-registrations`,
  `003-login-with-active-account`, `005-logout-revokes-session`,
  `006-pending-member-restricted-access`,
  `007-owner-rejects-registration` — and the four in bolt
  `005-identity-security` (`004-deactivate-an-account`,
  `008-reset-request-never-discloses-account`, `009-reset-password`,
  `010-update-member-profile`), whose FR-51 content the map also places in
  `accounts/`
- **Standards**:
  `memory-bank/standards/system-architecture.md` (§ Module map — the
  authoritative directory vocabulary; § Architecture style — "Hexagonal inside
  each module"),
  `memory-bank/standards/coding-standards.md` (§ File and folder organization
  — `domain/accounts/`; § Dependency rule — the boundary rule this module
  must obey),
  `memory-bank/intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md`
  (the unit, whose name is `identity-and-access` and whose bolt's module is
  `accounts/`)
- **Previous ADRs**: ADR-9 (the audit catalog's home — the precedent for
  resolving a module-map overlap without renaming a module), ADR-3 (audit
  written inside the state-change transaction)
- **Artifacts**:
  `memory-bank/bolts/004-identity-core/ddd-01-domain-model.md`
  (§ Domain Entities; § Ubiquitous Language),
  `memory-bank/bolts/004-identity-core/ddd-02-technical-design.md`
  (§ Layer Structure — revised by this ADR; § Architecture Pattern),
  `memory-bank/bolts/001-audit-core/ddd-02-technical-design.md`
  (§ Architecture Pattern — the conformance precedent)
- **Requirements**: FR-1, FR-2, FR-3, FR-4, FR-27, FR-31, FR-32, FR-51, FR-52
  (the FRs the standards' map assigns to `accounts/`)
