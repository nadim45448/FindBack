---
id: 021-web-admin
stage: 3
stage_name: test
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
created: 2026-10-30T17:05:00Z
completed: 2026-10-30T17:05:00Z
verification_command: "npx vitest run src/domain/administration/ src/application/administration/ src/infrastructure/listings/prisma-administrator-queue-reader.test.ts src/ui/admin-surfaces.test.tsx src/app/admin/admin-routes.test.ts src/ui/app-shell.test.tsx"
---

# Bolt 021 — Stage 3: Test Report

## Overview

The verification of the `021-web-admin` bolt: the administrator dashboard, the
four operational queues, the absence of any in-app notification stream, and the
two contextual audit views.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The four queues, their filters, their tiles | `src/domain/administration/` | 007, 008 | FR-33, FR-34, FR-35, FR-50 |
| The audit row's view model | `src/domain/administration/audit-view.ts` | 010 | FR-31, FR-32 |
| The forbidden notification markers | `src/domain/administration/` | 009 | FR-30 |
| The dashboard and queue queries | `src/application/administration/` | 007, 008 | FR-33, FR-34, FR-35, FR-50 |
| The contextual audit query | `src/application/administration/` | 010 | FR-31, FR-32 |
| The queue reader's SQL | `src/infrastructure/listings/prisma-administrator-queue-reader.ts` | 008 | FR-34, FR-35, FR-50 |
| The context reader | `src/infrastructure/administration/prisma-administration-context-reader.ts` | 010 | FR-31 |
| The dashboard surface | `src/ui/admin-dashboard-surface.tsx` | 007 | FR-33 |
| The queue surface | `src/ui/admin-queue-surface.tsx` | 008 | FR-34, FR-35, FR-50 |
| The audit trail surface | `src/ui/admin-audit-trail-surface.tsx` | 010 | FR-31, FR-32 |
| The access screen and the topbar | `src/ui/admin-access-screen.tsx`, `src/ui/admin-topbar.tsx` | 007, 009 | FR-30, FR-33 |
| The seven administrator routes | `src/app/admin/` | 007, 008, 010 | FR-31, FR-32 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stage 1 (design) was skipped by owner direction, so there is no
technical-design artifact for this bolt. The design decisions it would have
carried are stated in the code's own doc comments and in the governing
standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own suites**.

## One real defect was found and fixed by the suites

### Every queue query emitted invalid SQL

**All four of the queue reader's `WHERE` fragments were bare predicates with
no `WHERE` keyword.** The row query for Pending Registrations emitted

```sql
SELECT … FROM "accounts" a a."status" = $1 ORDER BY … LIMIT $2
```

— which is not a statement PostgreSQL can parse. The count query had the same
defect in the same place, so **every one of the four queues would have failed at
the database** the first time an administrator opened it. Nothing about the
error state would have shown it: the page would have rendered its calm
"something went wrong" panel, and the dashboard's four counts would have
rendered as an error rather than as a number.

**The fix puts the keyword in the fragment**, at the head of each of the four
predicates, so that *one* fragment serves both the row query and the count
query:

```ts
const where = Prisma.sql`WHERE a.${Prisma.raw(quoteName('status'))} = ${status}`;
```

This is the arrangement the module's doc comment already described — *"each
filter fragment carries its own `WHERE` keyword, so the same fragment can be
interpolated into the row query and into the count query — the two are one
predicate, not two that must be kept in step."* The code had not honoured its
own comment, in the same way bolt `020`'s event-8 gate did not honour its.

**The suite that found it is the SQL-capture suite**, which asserts the emitted
statement rather than running it. That is the whole reason the reader uses raw
SQL: **the statement is assertable.** A reader written with the Prisma query
builder would have produced a *valid* statement with the same wrong predicate,
and the defect would have survived — because "the SQL parses" and "the filter
is in the SQL" are different claims, and only the second one is the property
the stories make load-bearing.

## The dashboard and the queue cannot disagree, because they share one filter

**The count and the rows are drawn from the same predicate, through the same
adapter.** The domain holds one filter object per queue:

```ts
OPERATIONAL_QUEUE_FILTERS['pending-claims'] = {
  kind: 'ClaimStatus', reportType: 'Found', status: 'Pending',
};
```

The dashboard's tile count and the queue's rows are two calls into the **same**
reader with the **same** filter, so "the count matches the number of rows the
queue returns under its own filter" is structural rather than a convention two
call sites have to keep in step.

**The count query and the row query share the predicate fragment itself.**
The suite asserts that the second statement is a `COUNT(*)` over the same
`WHERE` — a count drawn from a different predicate would be a count of a
different set, and the two would disagree silently.

## The tile set is a closed four

**`OPERATIONAL_QUEUES` is a four-element tuple, and `buildDashboardTiles`
iterates it.** A fifth tile is therefore not a rendering decision but a change
to the domain's tuple — and the domain suite asserts the tuple has exactly four
members, that its labels are the four the story names, and that no label
contains the word "audit".

**Audit is not a queue, and that is enforced in four independent places:**

| Where | What it forbids |
|---|---|
| The domain | `OPERATIONAL_QUEUES` has four members, and none is an audit queue |
| The routes | The `/admin/audit` directory **does not exist** — a route that does not exist cannot be served |
| The nav | `ADMIN_NAV_ITEMS` carries the four queues and no audit entry |
| The surfaces | No tile, no topbar link, and no `href` containing `audit` |

**The absence of the route is proven by reading the filesystem**, because a
route that does not exist cannot be refused by a handler — there is no handler
to refuse it. The route-tree test asserts the exact set of seven administrator
routes and the exact set of two audit routes, and asserts that
`src/app/admin/audit` does not exist.

## FR-30 is verified as an absence, in three independent ways

FR-30 is a **negative** requirement: *"a negative requirement that passes
silently if nobody checks for it."* The bolt therefore checks it three ways,
because one way could be defeated by a future edit:

| Check | How it works | What it would catch |
|---|---|---|
| **The rendered DOM** | Every administrator surface's markup is grepped for the domain's `NOTIFICATION_SURFACE_MARKERS` | A bell, a badge, or a feed built as markup |
| **The source tree** | Every `.tsx`/`.css` file's **class names and attribute values** are scanned for the same markers | A notification surface built as a styled component |
| **The polling loop** | Every source file is scanned for `setInterval` | A queue that polled — the in-app stream FR-30 forbids |

**The check is on markup, not on props.** A notification bell built from an
icon and an `aria-label` would pass a prop check and fail the DOM check.

**The source scan is narrowed to class names and attribute values, never on
prose.** A comment that says *"there is no notification bell"* is
documentation of the absence, not an instance of it — and a check that failed
on documentation would be a check that stopped being run. The first draft of
this scan was too crude: it flagged the domain's own `notifications/` module
and the documentation comments, and it was narrowed until it asserted the
property that actually matters.

**The nine channels are exactly nine, and every one is email.** The domain
declares `SUPPORTED_NOTIFICATION_CHANNELS` and the route test asserts the set
has nine members, that every one starts with `email:`, and that there is no
in-app channel. Eight are the FR-46 business events; the ninth is the FR-51
authentication email, which is **not** a ninth FR-46 event.

**The member surfaces are covered by the source scan, not by the DOM scan.**
FR-30 forbids an in-app notification stream *anywhere in the product*, and a
bell in a member surface would break it just as surely as one in an
administrator surface — so the scan covers the whole `src/` tree, not only the
administrator surfaces.

## The Found side and the Lost side never mix

**The report's type is in the predicate, not applied afterwards.** The queue
reader asserts it in the SQL:

| Queue | The type in the predicate |
|---|---|
| Pending Claims | `r."type" = 'Found'` |
| Items Awaiting Return | `r."type" = 'Found'` |
| Items in Verification | `r."type" = 'Lost'` |

The suite asserts the type appears as a **bound parameter** in the statement —
so the type is a predicate, not text spliced into SQL — and that the
awaiting-return queue's statement contains `Found` and **not** `Lost`, and the
verification queue's contains `Lost` and **not** `Found`.

**The domain's filters carry the same rule independently**, and the domain
suite asserts the split: two queues on the Found side, one on the Lost side.

**A Lost report cannot appear in the Found-side awaiting-return queue, and a
Found report cannot appear in the Lost-side verification queue.** This is the
FR-34/FR-35/FR-50 separation the unit brief requires, and it holds at the
database rather than at the screen.

## The queues sort oldest first, and the count is over the same set

**§15.2–§15.5 say the queues sort oldest first by default,** and the ordering
is the operational intent: an administrator works through the queue in the
order the work arrived. The suite asserts `ORDER BY` and `ASC` in **every**
queue's statement.

**The pending-registrations queue orders by the account's `createdAt`** — the
registration timestamp — and the pending-claims queue by the Claim's
`submitted_at`. The suite asserts the accounts table's camelCase physical
columns are **quoted**: PostgreSQL lower-cases an unquoted identifier, so
`a.displayName` would be folded to `a.displayname`, which is not the column.

**The accounts table's physical columns are camelCase** — `displayName`,
`selfDeclaredRole`, `createdAt` — because the table was renamed but its
columns were not. The reader carries its own complete `PHYSICAL_ACCOUNT` map
rather than relying on the shared `physical-columns.ts` map, which names only
the three columns the visibility readers need.

## The queues are the ARIA grid, with one row in the tab order

**Roving `tabindex` means exactly one row is in the tab order.** The suite
asserts that precisely one row carries `tabindex="0"` and that the other rows
carry `tabindex="-1"`.

**The arrow keys move the focus, not just the state.** The suite asserts
`document.activeElement` after each key — a roving `tabindex` whose state moved
but whose focus did not would leave a screen reader's cursor and the visual
focus disagreeing.

| Key | Behaviour |
|---|---|
| `ArrowDown` | Focus moves to the next row |
| `ArrowUp` | Focus moves to the previous row |
| `Home` | Focus jumps to the first row |
| `End` | Focus jumps to the last row |

**The focus is clamped rather than wrapped.** The suite asserts that `ArrowUp`
on the first row leaves the focus on the first row and `ArrowDown` on the last
leaves it on the last — wrapping would send the administrator to the top of the
queue by accident.

**A sortable heading is a button carrying `aria-sort`.** The suite asserts the
header cell's `aria-sort` is `ascending` and that the button is named
`Sort by Registered`.

## The audit trail is a table, the disclosure is collapsed, and the trail is append-only

**The trail is a `<table>` with `<th scope="col">`** — five columns, Timestamp,
Actor, Action, Target, Details — and the suite asserts the table's presence and
the column count.

**The disclosure is collapsed by default** and carries `aria-expanded="false"`
and an `aria-controls` pointing at the hidden region by its id. The suite
asserts that clicking it flips `aria-expanded` to `"true"` and reveals the
details.

**A row with no additional fields renders no disclosure at all** — the story's
edge case, *"Event has no additional fields → `Show details` is not rendered
for that row."* The suite asserts the button's absence rather than its
disabled state.

**`Load older` is offered only when there is more to load.** The suite asserts
its absence at `hasMore={false}` and its presence at `hasMore={true}`, and the
domain's `offersLoadOlder` asserts the same rule from the data — 25 events
with more to load offers it; 25 with none does not; 0 with more to load does
not either.

**The trail is append-only and no mutating control exists.** The suite
collects every button's label and asserts none is `edit`, `delete`, or
`remove`.

**The row's accessible name follows §20.3's template** — `{Action verb}
{actor display name} {target} at {timestamp}` — and the domain suite asserts
the built name exactly.

## The audit views are contextual, and the wrong side gets nothing

**Two routes exist, and each belongs to one side.** The route-tree test asserts
the audit directories exist under exactly `admin/items/[id]/audit` and
`admin/lost/[id]/audit` — and under no other parent.

**A report of the wrong side produces no trail read at all.** The audit page
reads the report **first**, checks its type against the route's side, and
returns before the trail is read. So `/admin/items/:id/audit` for a **Lost**
report does not read a trail, does not render a trail, and does not leak
whether that Lost report has events.

**A non-administrator is refused before any read.** The application suite
asserts the contextual audit query refuses a non-administrator and **never
calls the reader** — the refusal is upstream of the query, so no count, no row,
and no existence signal escapes.

**There is no `listAll`.** The contextual audit query exposes **no global
listing method at all**, so there is no code path by which a global audit read
could be issued. The suite asserts the method's absence structurally.

## The authorisation is upstream of every query

**The application layer refuses a non-administrator before any reader runs.**
The suite asserts the refusal *and* that the reader was never called — so the
absence of a leak is not a matter of what the reader would have returned, but
of the reader never being asked.

**The access screen delivers no dashboard content.** A count is a leak:
*"there are 3 pending claims"* tells a non-administrator about work they may
not see. The suite asserts the screen carries no queue name, no count, and
exactly one link.

**The restricted state announces calmly.** The suite asserts
`role="status"` is present and `role="alert"` is **not** — the member did
nothing wrong, so an assertive announcement would interrupt them with a tone
the situation does not warrant.

## The error state offers both actions §5.14 names

**§5.14: *"Calm headline, sentence body, 'Try again' as primary, 'Go back' as
secondary. No stack traces."*** The dashboard, the queue, and the audit trail
each render both actions, and the suite asserts the secondary is a real **link**
— it leaves the page rather than repeating the read that just failed.

**This was a gap found during the closeout.** The surfaces rendered `Try again`
only, and `GO_BACK` was declared in `admin-copy.ts` but used by nothing. The
audit trail's error state had no actions at all. The gap was closed before the
bolt was closed rather than recorded as an owner item, because the copy was
already declared and §5.14's rule was explicit.

**The copy is not hardcoded.** The surfaces now render `TRY_AGAIN` and
`GO_BACK` from `admin-copy.ts`, the single place the administrator surfaces'
copy lives — so the test that asserts the string and the surface that renders
it cannot drift apart.

**No stack trace is rendered.** The suite asserts the error state contains no
`<pre>` and no stack-trace text.

## The loading state renders bars, not zeros

**A zero is a fact about the queue — "there is no work" — and a skeleton that
rendered `0` would be indistinguishable from a real zero.** The dashboard's
skeleton renders bars, and the suite asserts the loading state contains no
`0` at all and does carry the skeleton's bar element.

**The queue's skeleton is a table's shape**, so the layout does not jump when
the rows arrive.

## The topbar carries the four queues and no audit link

**The administrator topbar renders the four queue links**, each to its own
route, and the suite asserts every href.

**It carries no audit link** — the suite asserts no `href` contains `audit`
and that the text contains no "Audit". §17.1: audit is reached from the
report's context only, and a topbar audit entry would be a global audit entry
point by another name.

**It carries no notification control**, and the theme toggle it does carry is
chrome rather than a notification.

## Verification

### Command

```
npx vitest run \
  src/domain/administration/ \
  src/application/administration/ \
  src/infrastructure/listings/prisma-administrator-queue-reader.test.ts \
  src/ui/admin-surfaces.test.tsx \
  src/app/admin/admin-routes.test.ts \
  src/ui/app-shell.test.tsx
```

### Result

| Suite | Files | Tests | Result |
|---|---|---|---|
| Domain — `administration-domain.test.ts` | 1 | 25 | ✅ pass |
| Domain — `notification-absence.test.ts` | 1 | 16 | ✅ pass |
| Application — `administration-queries.test.ts` | 1 | 15 | ✅ pass |
| Infrastructure — `prisma-administrator-queue-reader.test.ts` | 1 | 11 | ✅ pass |
| UI — `admin-surfaces.test.tsx` | 1 | 45 | ✅ pass |
| Transport — `admin-routes.test.ts` | 1 | 9 | ✅ pass |
| UI — `app-shell.test.tsx` | 1 | 26 | ✅ pass |
| **Total** | **7** | **147** | ✅ **147 pass, 0 fail** |

### Coverage of the bolt's own modules

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `domain/administration/` | 92.50% | 100% | 84.21% | 94.87% |
| `application/administration/` | 87.87% | 100% | 71.42% | 87.87% |
| `ui/admin-copy.ts` | 100% | 100% | 100% | 100% |
| `ui/admin-access-screen.tsx` | 100% | 100% | 100% | 100% |
| `ui/admin-dashboard-surface.tsx` | 100% | 100% | 100% | 100% |
| `ui/admin-queue-surface.tsx` | 100% | 95.65% | 100% | 100% |
| `ui/admin-audit-trail-surface.tsx` | 90.47% | 76.47% | 85.71% | 90.00% |
| `ui/admin-topbar.tsx` | 100% | 50% | 100% | 100% |
| `ui/app-shell.tsx` | 100% | 100% | 100% | 100% |

**The route layer is excluded from coverage by `vitest.config.ts`**
(`src/app/**`) and is verified by its own suites — the route-tree suite and the
application suites — the same arrangement every earlier bolt used.

### The gaps that were closed rather than left

**Every gap was closed with a real test, or by fixing the code — never by
weakening an assertion.**

1. **The four queue queries' missing `WHERE` keyword.** Fixed in the
   production code, and the SQL-capture suite now pins the predicate's
   presence in every queue's statement.
2. **The audit trail's error state had no actions at all.** §5.14 names both
   `Try again` and `Go back`; the trail had neither. Both were added, and the
   suite asserts them.
3. **The dashboard and queue error states had no `Go back`.** Added, and the
   suite asserts the secondary is a real link.
4. **The surfaces hardcoded `Try again` rather than using the declared
   `TRY_AGAIN`.** The constant existed in `admin-copy.ts` and was used by
   nothing, so the copy could drift from the test that asserted it. The
   surfaces now render the declared constants.
5. **The `actionVerbFor` helper returned the wrong verb.** It took the
   label's first word, so `report.created` returned `"Report"` and
   `claim.approved` returned `"Claim"`. The presentation now carries an
   explicit `verb`, and the suite asserts each of the seven verbs the story
   names.
6. **`notification-absence.ts` had no suite of its own.** The module that
   makes FR-30's absence *checkable* — the nine closed channels, the
   forbidden markers, the permitted confirmation scope, and the member
   status history — was covered only incidentally by the route test's
   channel assertion. It now has a **16-test suite** of its own.
7. **The test helper's type narrowing.** `candidate.values` was possibly
   `undefined` — caught by `tsc --noEmit`, which is a separate gate from the
   suites. Vitest transpiles without checking, so a suite can pass and still
   not compile.

## What was verified

### The domain (41 tests)

- The tile set is a closed four, with the four labels the story names.
- Each queue has its own route, and **no route contains `/audit`**.
- Each queue has a filter that names its own side.
- The Found side and the Lost side are kept apart: two Found, one Lost.
- Each queue has its own empty-state copy, and only Pending Registrations
  carries a note.
- The tile's label and the queue's heading are the same string.
- The audit catalog gives every one of the twenty event types a presentation
  with a label and an accent.
- The four non-numbered records are marked non-numbered, and the numbered
  workflow events are marked numbered.
- **An event type the catalog does not name throws** — an unknown type is a
  defect, not a blank row.
- The reporter's edit and the administrator's edit have distinct labels.
- Each action verb is derived from the presentation, not from the label's
  first word.
- The row's accessible name follows §20.3's template.
- The actor's role tag is `Member` or `Administrator`.
- A disclosure is offered only when the row has additional fields.
- `Load older` is offered only when there is more to load.

### FR-30's declared absence (16 tests)

- The channel list is exactly nine, and **every one is an email** — a channel
  that did not start with `email:` would be an in-product stream, and the
  product has none.
- The FR-46 business catalogue is **exactly eight**, and the FR-51
  authentication email is held **outside** it — "FR-46 has nine events" would
  be a false statement about a frozen PRD.
- No channel is declared twice.
- The forbidden markers name a bell, a badge, a centre, a drawer, an inbox,
  and the unread **attributes** (`data-notification`, `data-unread`) as well as
  the unread words.
- No marker is declared twice.
- The removed-aggregation list is a **subset** of the wider forbidden set — a
  narrower list that disagreed with the wider one would let a surface pass one
  scan and fail the other.
- The permitted confirmation scope is **`OwnAction`**, and is **not**
  `BackgroundEvent` — a background event has nowhere to be declared.
- The member status history is capped at **three entries**, the newest three
  surviving, and it carries **no audit verb** — the absence of a `verb` field
  is the structural statement that a member does not see the trail.

### The application layer (15 tests)

- The dashboard reads **all four filters**, through the same reader.
- The dashboard's result carries **no activity field and no digest field** —
  there is no `Recent activity` to render, because there is no such thing to
  read.
- The dashboard **refuses a non-administrator before the reader runs**.
- The queue returns only its own rows.
- The contextual audit query refuses a non-administrator.
- The contextual audit query refuses an invalid parent type.
- **The contextual audit query has no `listAll`** — asserted structurally.

### The infrastructure layer (11 tests)

- The account status is in the `WHERE` clause, as a **bound parameter**.
- The claim status and the report type are both in the `WHERE` clause.
- The awaiting-return predicate carries `Found` and **not** `Lost`.
- The verification predicate carries `Lost` and **not** `Found`.
- The approved Claim is joined in the awaiting-return query.
- Every queue orders oldest first.
- The count is drawn from the same predicate as the rows — a second statement
  carrying `COUNT(*)` and a `WHERE`.
- The page limit is applied.
- An unknown filter is **refused** rather than returning an empty queue — a
  silent empty queue would look like "there is no work" to the administrator.
- The accounts table's camelCase columns are quoted.
- One adapter serves all four queues.

### The surfaces (45 tests)

- The dashboard renders exactly four tiles, each a real link to its queue.
- Each tile's accessible name carries its queue name and count.
- `All caught up.` appears only on the empty tile — and on all four when all
  four counts are zero.
- The dashboard renders no `Recent activity` and no audit tile or link.
- The dashboard renders no notification surface, in either the loaded or the
  loading state.
- The loading state renders a skeleton and **no zero**.
- The error state carries `Try again` **and** `Go back`, and no stack trace.
- The access screen carries §15.6's message and **no dashboard content**.
- The access screen announces with `role="status"`, not `role="alert"`.
- The queue renders the ARIA grid pattern with the right roles.
- Exactly one row is in the tab order.
- The arrow keys, Home, and End move the focus, and the focus is clamped.
- The row's action is a link that reaches the specific work item.
- Each queue's own empty state renders, with the note only where §15.2 names
  one.
- A sortable heading is a button carrying `aria-sort`.
- The queue's error state carries both actions, and the loading state renders a
  skeleton.
- The audit trail is a table with five `th scope="col"` columns.
- The trail shows the actor, the verb, the target, and the role tag.
- The disclosure is collapsed by default, expands on click, and is **absent**
  for a row with no details.
- `Load older` appears only when there is more to load.
- The trail renders its own empty state.
- **No control mutates an event.**
- The topbar carries the four queue links and **no audit link** and **no
  notification control**.
- **Every surface is checked for FR-30's forbidden markers.**

### The route tree (9 tests)

- The seven administrator routes exist, exactly.
- **No `/admin/audit` directory exists.**
- No administrator route names audit other than the two contextual ones.
- The audit directories exist under exactly the two contextual parents.
- The nav carries the four operational queues and no audit entry.
- No notification marker appears in any class name or attribute value across
  the whole application.
- No `setInterval` exists anywhere — nothing polls.
- The channel set is exactly nine, and every one is an email.

## Success Criteria

The bolt's seven success criteria, each against a named backing test:

| # | Criterion | Where verified |
|---|---|---|
| 1 | The dashboard shows entry points only and contains no `Recent activity` section | surfaces (no `Recent activity`, no activity field in the application result), routes (the nav carries no activity entry) |
| 2 | All four queues render and link to their work | surfaces (four links, four empty states), infrastructure (one adapter, four filters) |
| 3 | No `/admin/audit` route exists | routes (the directory does not exist; the audit routes are exactly the two contextual ones), domain (no route contains `/audit`) |
| 4 | No notification bell, notification centre, or background-event toast exists | routes (the source scan and the `setInterval` scan), surfaces (every surface's rendered DOM), domain (nine email channels) |
| 5 | The audit view is reachable only from a report context | routes (exactly two audit directories), application (no `listAll`), domain (no audit queue) |
| 6 | Owner-determines / administrator-records wording matches `EXPERIENCE.md` §4.7 exactly | domain (the forbidden phrasings are absent from `admin-copy.ts`; the audit surface renders the catalog's own labels) |
| 7 | Administrator report edit exposes exactly the eight permitted fields | **not delivered by this bolt** — the administrator edit surface is bolt `022`'s; the criterion is recorded as outstanding, not as met |

## Owner Items

1. **The administrator report edit surface (`/admin/items/:id/edit`,
   `/admin/lost/:id/edit`) is not built by this bolt.** Success criterion 7 is
   therefore **not met**, and the criterion is recorded as outstanding rather
   than ticked. That surface belongs to Unit 007's remaining work — bolt
   `022-web-audit-accessibility`, together with the accessibility sweep and
   the secure image delivery route.
2. **The registration queue's `Reject` action and its reason modal are not
   built.** The queue renders the `Approve` action, and the story's criterion
   also names a `Reject` danger action opening a reason modal requiring at
   least five characters. That action belongs to Unit 001's registration
   review surface, which is not this bolt's.
3. **The audit trail's filters are not built.** Story 010's criterion names an
   action-type filter, a date-range filter, and an actor filter. The trail
   renders the events, the disclosure, and the pagination; the three filters
   are not part of this bolt's surface.
4. **The `Load older` button appends nothing yet.** The trail renders the
   button and the rule that governs whether it appears, but the pagination
   itself is the domain's and Unit 006's read path — the button's behaviour
   on activation is not wired in this bolt.
5. **The blast radius was not measured.** The full suite was not run, by owner
   direction. The bolt's own six suites are green, and the typecheck, the
   lint, and the production build are clean.
6. **The member dashboard's absence of an activity feed is covered by the
   source scan, not by a DOM render.** The member dashboard is not built yet,
   so its activity-free property is asserted structurally over the source
   tree rather than by rendering it.
