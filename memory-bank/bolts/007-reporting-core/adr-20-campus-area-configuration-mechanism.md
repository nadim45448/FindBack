---
bolt: 007-reporting-core
created: 2026-10-28T21:20:00Z
status: accepted
superseded_by: null
---

# ADR-20: Configure the campus-area list as a seeded database table, and store the report's campus area without a foreign key

## Context

FR-8 makes the campus area a **fixed per-deployment enum**: a report is filed
against one of a deployment's configured areas, and PRD assumption A4 makes the
list per-deployment rather than global. The PRD does not say how that list is
configured, and it records the question as **OQ-1**, owned by **Architecture**.
The inception log says of OQ-1: *"Blocks the deployment-configuration story
only"* — the open question was never on the critical path for report
creation itself.

The domain needs only a **set of valid values** to validate a submission
against. Story 003 makes the rule explicit: *"only values from the
deployment's configured campus-area list are accepted, and the value stored is
the enum value rather than the exact-place free text."* Story 003 also puts
the configuration mechanism **out of scope**: *"Campus-area configuration
mechanism (OQ-1, owned by Architecture)."*

Three facts create the tension this ADR resolves:

1 - **`system-context.md` § External systems** already names the two
   candidate mechanisms: *"Campus-area configuration | Inbound at deploy
   time | Fixed enum values for FR-8 location field | **Deploy-time config or
   seed** (Architecture, OQ-1)."* So the mechanism was narrowed to two
   options before any bolt existed, and it was left to Architecture.

2 - **`data-stack.md` § Schema outline** lists **`CampusArea` — the fixed
   per-deployment enum (FR-8, OQ-1)** among the tables the schema is
   authored against. The standard's outline names a *table*.

3 - **`AuditEvent` and `Account` carry no `@@map`**, so their physical names
   are `"AuditEvent"` and `"Account"` — not the snake_case plural the naming
   convention names. Bolt `006` wrote raw `SELECT`s against `audit_events`
   and `accounts` and could not be integration-tested without the rename.
   Bolt `007` is the bolt that must create the tables the readers target,
   and it must therefore map the tables — including the ones this bolt does
   not otherwise own.

A fourth fact is about the report row itself. The report stores a campus-area
value, and the obvious schema for a column that references a lookup table is
a **foreign key**. But story 003 carries an edge case that a foreign key
cannot express:

> *"A campus area deactivated after a report was filed | The stored report
> keeps its value; the enum change affects new submissions only."*

A deactivated area must not rewrite, invalidate, or block existing reports.
That is a **validation** rule, not a **referential** one.

## Decision

**The campus-area list is a `campus_areas` table, seeded per deployment. The
`reports.campus_area` column is plain `text` with NO foreign key to it.**

Concretely:

1 - A `campus_areas` table with `value` (primary key), `label`, `active`, and
   `created_at`. The migration seeds **no** rows — the list's contents are the
   deployment's decision, and a migration that invented areas would be
   inventing product content. Each deployment seeds its own set at deploy
   time.

2 - `reports.campus_area` is a `text` column. **No foreign key.** The
   membership rule — "this value must be in the deployment's *active* set" —
   is enforced by `ReportFieldValidator`, which is handed the active set.

3 - `active = false` **deactivates the value for new submissions only**. An
   existing report keeps its stored value and remains valid, readable, and
   searchable.

4 - The stored value is the **enum value**, never the display label and never
   the exact-place free text. A deployment may rename "Library" to "Main
   Library" without rewriting a single report.

5 - `CampusAreaReader` is a **port** in the application layer. The domain
   never learns where the set comes from, so this decision can be revisited
   without touching the domain.

## Rationale

**Why a table rather than a configuration file.**

The decisive argument is referential proximity: **the reports already refer to
the list**. A report row stores a campus-area value; the set of valid values
belongs in the same database that holds the references, so the rule could be
expressed as a database constraint rather than only as application code. A
configuration file cannot be referenced by a foreign key, so the rule would be
enforced in exactly one place — the validator — with no second line of
defence.

Three supporting reasons:

- **A mid-deployment change must not require a restart.** OQ-1 asks how the
  list is configured per deployment. A file read at startup turns a list
  change into a deployment event.
- **`data-stack.md` already names it.** The standard's schema outline lists
  `CampusArea` as a table, and the outline is the shape the domain model is
  authored against. A config file would have required an amendment to an
  approved standard.
- **The seed option was pre-sanctioned.** `system-context.md` names
  "deploy-time config **or seed**" as the two Architecture options. This ADR
  picks the seed half of an already-bounded choice, and it is what
  `data-stack.md`'s outline assumes.

**Why no foreign key on `reports.campus_area`.**

This is the counter-intuitive half, and it is the part a schema reviewer
would otherwise "fix" by adding the constraint.

- **A foreign key cannot express the deactivation rule.** `active = false`
  leaves the row in place, so the FK would still be satisfied — but the rule
  is that a deactivated area must not affect existing reports, and the FK
  says nothing about it. Enforcing "the report's area must be active" through
  the FK would require a trigger or a soft-delete, both of which are
  *stronger* than the requirement: the requirement says an existing report
  keeps its value, not that the reference must be revoked.
- **A rename would become a migration.** With an FK, changing a stored value
  means updating every referencing report row. The PRD's rule is that a
  deployment may relabel an area; under the FK that becomes a data migration
  touching every report that used it.
- **The membership rule is a validation rule.** The validator is handed the
  active set and checks it. That check happens in the **one place that can
  see the whole active set** — which the database cannot, because "the
  deployment's active set" is a query against the same table.
- **`ON DELETE` semantics would be a lie.** A FK would force a decision
  between `RESTRICT`, `CASCADE`, and `SET NULL` — and all three are wrong,
  because the report must keep its value regardless of what happens to the
  area. `RESTRICT` (the chosen path) is the only one that does not damage a
  report, and it is precisely the *absence* of the constraint that guarantees
  it: there is nothing to restrict.

**Why the seed is empty by default.** The migration seeds no rows because the
areas are the **deployment's** content. A migration carrying area names would
either invent content the PRD does not name, or hard-code one deployment's
campus into every other deployment's database. The seed is a deployment step.

### Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| **Config file read at startup** | No schema change; simple; no seed step | The rule is enforced in one place only (no FK possible); a list change is a restart; the list lives outside the database that holds the references; contradicts `data-stack.md`'s outline | The referential-proximity argument: the reports already refer to the list |
| **A database `enum` type** | The database enforces membership natively | The list is **per-deployment** and a PostgreSQL enum is schema-level — adding or removing an area is a migration of the type, and `ALTER TYPE ... ADD VALUE` cannot run inside the same transaction that uses the new value | The list's lifetime is the deployment's, not the schema's. This is also the same objection that made `Account.status` a text column with a CHECK |
| **A FK from `reports.campus_area` to `campus_areas`** | Referential integrity is enforced by the database | Cannot express "a deactivated area does not rewrite existing reports"; a label rename becomes a data migration; forces a wrong `ON DELETE` decision | The membership rule is a validation rule, and the deactivation semantics are the requirement |
| **Storing the campus-area label instead of the value** | A rename would be free | The stored value would not be stable, so FR-14's location filter would break on a rename | The PRD says the *enum value* is stored |
| **A hard-coded constant in the domain** | Compile-time safety; no configuration | Hard-codes one deployment's campus into the domain; the domain becomes per-deployment | The list is external data (FR-8, A4) and its lifetime is the deployment's |

## Consequences

### Positive

- The membership rule has a **second line of defence**: the validator checks
  it against the active set, and the set itself lives in the database.
- A deployment can add, remove, deactivate, or relabel an area **without a
  code change and without touching existing reports**.
- The domain stays **deployment-agnostic**. `CampusAreaReader` is a port, so
  the domain does not know whether the set came from a table, a file, or an
  environment variable — which is what makes this decision reversible at the
  infrastructure layer if it must be.
- `data-stack.md`'s schema outline is satisfied as written, with no amendment
  to an approved standard.
- The `@@map` renames bolt `006` left open are discharged in the same
  migration, so bolt `006`'s readers become integration-testable.

### Negative

- A table and a seed step exist where a file would have sufficed — more
  moving parts for the same requirement.
- The active set must be **read** on every submission, so validation does a
  query it would not otherwise do. It is a small indexed read of a
  single-column table, and the result is cached for the request.
- The rule is **not** enforced by the database on `reports.campus_area`, so
  the validator is the only enforcement point for the *value*. The other
  report-level rules (the length bounds, the enum sets, the future date)
  are all CHECK-constrained at the database level, so this one is the
  exception, and the exception is deliberate.

### Risks

- **A campus-area value could be inserted directly into `reports` bypassing
  the validator**, landing a row with an invalid area. Mitigation: the
  write path is the only path (the repository takes a transaction handle and
  is not called outside the creation use case), and the domain's `Report`
  cannot be constructed without passing the validator — the same
  "the validator is the only path to a Report" property the domain model
  establishes. A database-level CHECK against the *active* set is not
  possible, because a CHECK cannot reference another table; a trigger could
  do it, and is rejected as heavier machinery for a rule whose only writer
  already validates it.
- **A deployment forgets to seed.** The symptom is that every submission is
  refused with a campus-area validation error. Mitigation: the failure is
  **loud and safe** — it refuses rather than accepts, so no invalid report
  can be stored. The `CampusAreaUnavailableError` case (a read failure) is a
  `503`, never a permissive default, because a permissive default would
  store a report with an unvalidated campus area.
- **A later bolt re-proposes the configuration file.** This ADR exists to
  stop that, and the "Read when" guidance in the decision index points at
  any change to the campus-area mechanism.

## Related

- **Stories**: 001-create-lost-item-report, 002-create-found-item-report,
  003-validate-report-field-set
- **Requirements**: FR-8, FR-14 (the location filter), OQ-1, A4
- **Standards**: `data-stack.md` § Schema outline (names `CampusArea` as a
  table); `system-context.md` § External systems (names "deploy-time config
  or seed"); `coding-standards.md` § Naming conventions (the `@@map`
  requirement that discharges bolt `006`'s obligation)
- **Previous ADRs**: ADR-3 (PostgreSQL/Prisma/transactions — the schema
  context this decision sits in); ADR-9 (the event catalog — the module
  boundary this decision does not cross)
- **Open item**: OQ-1 was owned by Architecture and was **ratified by the
  owner on 2026-10-28**. This ADR is the authority for the campus-area
  configuration mechanism, and OQ-1 is closed.
