---
bolt: 003-audit-lost-side-events
created: 2026-10-27T06:05:52Z
status: accepted
accepted: 2026-10-27
superseded_by: null
---

# ADR-9: Keep the FR-48 event catalog in the audit module, and let the firing modules call it

## Context

FR-48 defines sixteen Lost-side audit events, 15–30, covering the Recovery
Response workflow. The story that owns them — `002-lost-side-audit-events` —
sits in **unit 006 (audit-and-observability)**, and the standard that governs
the modules assigns FR-48 to **two** of them.

`system-architecture.md` § Module map reads:

```text
├── recovery/     Lost-side Recovery Response lifecycle        FR-40..FR-48
├── returns/      Returned confirmation, receiver substitution FR-23..FR-25
├── audit/        Append-only trail and audit-read logging      FR-31, FR-32, FR-48
```

The overlap is not accidental, and neither reading is wrong on its own. FR-48
governs *audit events*, and the trail is the audit module's artifact. But FR-48
also describes *transitions* — a response being selected, a determination being
recorded, a report returning — and those transitions belong to the workflow
modules that perform them.

### The problem this creates: three modules fire into one catalog

Tracing which unit fires which event makes the overlap concrete. The
unit-ownership map in this bolt's domain model is:

| Event | Fired by | Unit |
|---|---|---|
| 15, 16, 17, 18, 19, 20, 28, 29 | `submitRecoveryResponse`, `postResponseMessage`, `selectForVerification`, `recordMatchConfirmed`, `recordNotAMatch`, `withdrawResponse` | 004-lost-side-recovery |
| 21, 22, 24, 25, 26, 30 | `confirmReturned`, `closeReport` | 005-returns-and-handover |
| **23, 27** | **`withdrawReport`** | **002-reporting-and-listings** |

**Event 23 is the surprise.** FR-11 (withdraw own report) is assigned to unit
002, not unit 004. Unit 002's brief lists `withdrawReport` as one of its key
operations and FR-11 among its assigned requirements; unit 004's brief lists
FR-11 nowhere, because unit 004 owns the Recovery Response lifecycle, not the
report lifecycle. So the reporter's Lost-side withdrawal is fired from the
**reporting** module — and that withdrawal also resolves every child Recovery
Response to `Resolved — Report Closed`, which means unit 002 also fires
**event 27**.

**Event 27 therefore has two firing units** — unit 002 (withdrawal) and unit
005 (administrator close). The catalog that defines it must exist in exactly
one place, or the two paths can drift.

### The forces in play

| Force | Direction |
|---|---|
| `system-architecture.md`: "audit/ … FR-31, FR-32, FR-48" | The trail's own module owns FR-48 |
| `system-architecture.md`: "recovery/ … FR-40..FR-48" | The workflow module owns FR-48 |
| `system-architecture.md`: "claims and recovery share only the returns and audit modules, and communicate through domain events, never by mutating each other's entities" | The `audit` module is one of the two modules every other module talks to |
| FR-31: the event catalog is **frozen** — "FR-31 events 1–14 and FR-48 events 15–30 together form the complete numbered workflow/lifecycle audit-event catalog" | One definition; two would drift |
| Story `002`: "FR-48 spans two units … Coverage must be verifiable **across** the boundary, not per unit" | The boundary is real and must be handled deliberately |
| Story `002`: "Deciding which event fires — that belongs to the acting unit" | The firing module decides *when*; something else decides *what* |
| Unit 006's brief: the audit context "records whatever event is emitted, and refuses to record anything it was not given" | The audit module validates, it does not decide |
| FR-43: the administrator does **not** independently determine the match | The determination's maker must be the owner — a rule only the catalog can enforce |
| ADR-6: append-only enforced at three layers, with the trigger as the backstop | The enforcement machinery lives in the audit module's schema |
| `coding-standards.md`: "domain → nothing; application → domain + ports" | The audit module must not import from `recovery/` |

### Three candidate placements

1. **The catalog lives in `audit/`; the firing modules call it.**
2. **The catalog lives in `recovery/` (unit 004); `audit/` treats 15–30 as
   generic numbered events.**
3. **Each firing module owns the events it fires; `audit/` knows only that
   1–30 are valid numbers.**

Option 3 is what the unit-ownership map alone would suggest, and it is the one
that has to be argued against carefully, because it is the most natural
reading of "deciding which event fires belongs to the acting unit".

## Decision

**The FR-48 catalog lives in the `audit` module. The firing modules call it
through a typed factory. The firing modules own the transitions; the `audit`
module owns the catalog.**

Concretely:

1. **The catalog is one definition.** The sixteen FR-48 entries — their event
   numbers, their event types, their required field sets, and the mapping from
   type to number — are defined once, in `src/domain/audit/`, and extended from
   the existing `event-catalog.ts` that bolt 001 built for events 1–14. The
   `event_number` CHECK constraint (`IS NULL OR BETWEEN 1 AND 30`) already
   admits them, so no migration is required.

2. **A typed factory builds the events.** `src/domain/audit/lost-side-event-factory.ts`
   exposes one method per business action — thirteen methods for sixteen events,
   because three of them write more than one event. The factory owns the
   event number and type, the required-field set, the refusal when a required
   field is missing, the determination-pair rule, the system-actor rule, and the
   batch-completeness rule.

3. **The firing module supplies the business values.** It decides *whether* the
   transition happened — it is the module that performs it — and passes the
   facts: the report id, the response ids, the status before and after, the
   reason, the human who caused a system transition. The audit module never
   evaluates whether a Recovery Response transition is legal; that is FR-41's
   business rule and it belongs to `recovery/`.

4. **The dependency stays one-way: `recovery → audit`, `returns → audit`,
   `listings → audit`.** The audit module imports nothing from them. This is
   why the catalog's field sets are expressed as values passed in by the caller
   rather than as a rule the audit module evaluates against a Recovery Response
   it cannot see.

5. **The catalogue is the only way to build a Lost-side event.** A firing
   module cannot invent an event number, cannot omit a required field, and
   cannot write a determination without both halves of the pair. The story's
   no-gap criterion is therefore enforced by the *shape of the API*, not by each
   firing module remembering the rules.

## Rationale

### Why not option 3 — each firing module owns the events it fires

This is the natural reading, and it deserves a direct answer.

**It creates two definitions of event 27.** Unit 002 fires event 27 from the
withdrawal path; unit 005 fires it from the close path. If each owned its own,
the two copies would drift — and the drift would be invisible until an
investigation compared them. The two copies would differ in their event type
string, their required-field set, or their metadata keys, and the trail would
show two slightly different events that a reader would have to reconcile by
hand. That is precisely the failure the audit trail exists to prevent.

**It duplicates the enforcement machinery, and the second copy is the weaker
one.** The catalog-aware sanitizer, the event-number CHECK constraint, the
append-only trigger, the assertion that a numbered type has a number and a
non-numbered type does not — all of it lives in the `audit` module. A second
writer needs all of it. The second copy is a second chance to be weaker, and
nothing would test the second copy as thoroughly as the first.

**It puts the catalog in a module that is not about the trail.** The `audit`
module's entire job is the trail. If FR-48's catalog lived in `recovery/`, the
`audit` module would not know what event 27 means — it would only know that
"27" is a valid number. The trail's own module would be unable to answer a
question about its own contents, and the read path's event-type filter (UX
§17.3) would offer a list of types it could not validate.

### Why not option 2 — the catalog lives in `recovery/`

The same objection, inverted. `recovery/` would hold the definition, and
`audit/` — whose job is the trail — would not know what the events mean. And
unlike option 3, this does not even solve the duplication problem: unit 002
would still have to reach into `recovery/` for events 23 and 27, so the
dependency would be `listings → recovery`, which the module map explicitly
forbids: "claims and recovery share only the returns and audit modules, and
communicate through domain events, never by mutating each other's entities."
Unit 002's withdrawal is not a Recovery Response operation; making it depend
on the recovery module to describe what happened to its responses inverts the
dependency that the standard draws.

### Why the audit module is the right single home

`system-architecture.md` names `audit` as one of the two modules that every
other module talks to. That is precisely the property a shared catalog needs:
it must be reachable from every firing module, and it must not depend on any of
them. The `audit` module is the only module in the map with that shape.

There is also a coherence argument that the module map does not make explicit.
The trail is **one sequence** under one parent. An administrator reading a
Lost report's trail must not have to know that some of its rows were defined
in one module and some in another, by different authors, at different times.
A single catalog is what makes the trail a single artifact rather than a
convention.

### Why the factory, rather than the firing modules calling the catalog directly

The catalog could be exposed as a data structure the firing modules read
directly — `catalog.numberFor('recovery_response.submitted')` — and the
firing modules would assemble the drafts themselves. That is rejected, for one
reason: **the guarantees would become conventions.**

Every rule the PRD attaches to a specific event — the determination pair on 18
and 19, the system-actor rule on 26–30, the batch completeness on 26 and 27 —
would then be enforced at each call site, by three different authors, in three
different modules. A firing module that forgot the determination pair would
produce an event missing half of the PRD's mechanism for keeping
owner-determines honest, and **nothing would fail**. The event would be
well-formed as a row and wrong as a record.

The factory makes the guarantee structural. The rules live in one place, and
the API cannot be used in a way that bypasses them. That is the same
reasoning ADR-6 used for the append-only trigger: enforcement that lives in
the *shape* of the interface survives a bug, where enforcement that lives in
each caller does not.

### Why the audit module still does not decide *when* an event fires

The factory is a validator and a builder, not a rule engine. It does not know
whether a Recovery Response may be withdrawn, whether the Lost report is
`Verification Pending`, or whether a determination is permitted at all. Those
are FR-41 and FR-43's rules, and they belong to `recovery/`.

This is the hexagonal boundary drawn in the right place, and it is what keeps
the one-way dependency honest. The audit module validates the **shape** of a
record; the firing module decides whether the **transition** happened. A
factory that evaluated business rules would need to import `recovery/`, and the
one-way dependency would become two-way.

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|---|---|---|---|
| **Each firing module owns the events it fires** (option 3) | Natural reading of "deciding which event fires belongs to the acting unit"; each module keeps its own vocabulary | **Two definitions of event 27** (unit 002 and unit 005 both fire it); duplicates the enforcement machinery, and the second copy is the weaker one; puts the catalog in modules that are not about the trail; the `audit` module could not validate the event types it stores | Drift is invisible until an investigation compares two copies, and the audit trail exists to prevent exactly that |
| **The catalog lives in `recovery/`** (option 2) | Sits next to the transitions it describes | The trail's own module would not know what the events mean; unit 002 would have to depend on `recovery/`, which the module map forbids; the `audit` module's read-path filter could not validate its own type list | Inverts the dependency the standard draws, and leaves the trail's module unable to answer questions about its own contents |
| **A shared `events` package imported by all three firing modules and by `audit/`** | One definition; no factory; the catalog is data everyone can read | A shared package becomes a dumping ground; the field-set rules would be read, not enforced; a new shared package is a new architectural element the standards do not have; enforcement still ends up at each call site | The factory is the same single-definition property with the rules *enforced* rather than merely *published* |
| **Put the catalog in `audit/` but let firing modules assemble drafts and call a plain `AuditWriter.record`** | Simple; the catalog is still single | The per-event rules (determination pair, system actor, batch completeness) become call-site conventions; the story's no-gap criterion and FR-43's honesty mechanism depend on them, and conventions do not fail loudly | The guarantees that matter most are the ones that must be structural |
| **Each module keeps its own event type strings, with a shared mapping table of type → number** | One number mapping | Two different type strings for the same event; the read-path filter's type list becomes ambiguous; the mapping table is still a second place to update | Solves the numbering but not the vocabulary, and the vocabulary is what a reader and the filter see |
| **Let the `audit` module own the *transitions* as well as the catalog** | One module owns all of FR-48 | The `audit` module would have to import `recovery/` and evaluate FR-41's status machine; it would duplicate the two-separate-state-machines rule that `system-architecture.md` calls "the single largest correctness risk in the system" | Collapses the boundary the standard drew, and puts two state machines in one module |

## Consequences

### Positive

- **One definition of every FR-48 event.** Event 27 has one event type, one
  required-field set, and one metadata shape, even though two units fire it.
- **The per-event rules are structural.** A firing module cannot write an
  event 18 without both halves of the determination pair, cannot write a
  system-actor event with no human named, and cannot write an empty batch.
- **The `audit` module can validate its own contents.** The read path's
  event-type filter offers a list the module can check against.
- **The no-gap criterion becomes checkable across the unit boundary**, which
  is what story `002` asks for: "Coverage must be verifiable **across** the
  boundary, not per unit."
- **The one-way dependency is preserved**, so the `audit` module stays
  testable with no database and no knowledge of the workflow modules.
- **No new table, no new column, no migration** for the sixteen events.

### Negative

- **The `audit` module must know the shape of things it does not own.** The
  catalog describes a Recovery Response's id, a Lost report's lifecycle status,
  and a determination's verification timestamp. Those are facts about other
  aggregates, and the audit module holds them as *value shapes* it validates,
  not as entities it understands. A reader of the catalog must know where the
  values come from.
- **The firing modules must learn a new API.** Three modules will call a
  factory they did not previously depend on. That is a real cost, paid at the
  boundary rather than hidden in it.
- **The factory is a place where the PRD's rules can accumulate.** Sixteen
  events, four rules, and three firing modules. Over time the factory becomes
  the module that knows the most about other modules' transitions — a slow
  drift toward the collapse the last rejected alternative describes.
- **The split between "catalog" and "transition" is a judgement call**, and a
  reasonable person could place a given rule on the other side of it. The
  placement must therefore be *stated*, not merely followed.

### Risks

| Risk | Mitigation |
|---|---|
| The factory grows into a second copy of `recovery/` | The factory validates *shape* and never evaluates FR-41's status machine. A factory that needs to know "is this transition legal" is doing the firing module's job, and the boundary review should catch it. Asserted in Stage 5: the factory's rules are about the *record's* fields, not about whether a transition may occur. |
| A firing module bypasses the factory and calls `AuditWriter.record` directly | The insert-only port remains open, because bolt 001's `AuditWriter` is the general writer. This is a real escape hatch. Mitigation: the catalog's per-event rules are asserted by the *reader* as well as the writer — a stored event missing a required field is detectable on read, so a bypass produces a visibly malformed record rather than a silently wrong one. |
| A new FR-48 event is added to one module only | The event-number CHECK constraint bounds the range, and the catalog's exhaustiveness is asserted in the domain layer. A new number is refused; a new type without a number is refused. |
| Unit 002 and unit 005 disagree about event 27's field set | They cannot: there is one catalog and one factory. This is the risk the decision exists to remove. |
| The `determined_by` check rejects a legitimate determination | The owner id comes from the report's own server-side state, not from the request. A rejection means the report and the determination disagree, which is a defect worth failing on. |

## Related

- **Stories**: `002-lost-side-audit-events` — the cross-unit coverage
  criterion and the "deciding which event fires belongs to the acting unit"
  note
- **Standards**: `memory-bank/standards/system-architecture.md` (§ Module map —
  the FR-48 overlap this ADR resolves; § Architecture style — "Two recovery
  flows modelled separately"; § Authorization model — roles are derived, never
  client-asserted),
  `memory-bank/standards/coding-standards.md` (§ File and folder organization —
  the dependency rule; § Logging — the trail's sensitive-field exception),
  `memory-bank/standards/data-stack.md` (§ Concurrency rules — audit rows are
  written inside the same transaction as the state change; § Where raw SQL is
  required)
- **Previous ADRs**: ADR-6 (append-only enforcement — the machinery the audit
  module owns and the second copy would duplicate), ADR-8 (the administrator
  check runs before the query — the same "gate, not filter" shape the factory
  follows), ADR-3 (PostgreSQL with Prisma, pooled connections)
- **Artifacts**: `memory-bank/bolts/003-audit-lost-side-events/ddd-01-domain-model.md`
  (§ Which unit fires which event — the map this ADR is built on; § Domain
  Services — `LostSideEventCatalog` and the guards),
  `memory-bank/bolts/003-audit-lost-side-events/ddd-02-technical-design.md`
  (§ Decision 1; § Decision 2; § The cross-module contract)
- **Requirements**: FR-48 (the sixteen Lost-side events), FR-31 (the frozen
  catalog, append-only), FR-32 (administrator-only), FR-41 (the status machine
  the audit module must not evaluate), FR-43 (the determination's maker is the
  owner), FR-11 (reporter withdrawal, which unit 002 owns and from which event
  23 fires)
