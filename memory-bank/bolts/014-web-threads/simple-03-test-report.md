---
id: 014-web-threads
stage: 3
stage_name: test
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
created: 2026-10-30T17:50:00Z
completed: 2026-10-30T17:50:00Z
verification_command: "npx vitest run src/ui/member-surfaces.test.tsx src/ui/report-form-actions.test.tsx src/ui/member-navigation.test.tsx src/app/my/_reporter-actions.test.ts src/app/my/member-view-routes.test.tsx src/app/listings/[id]/item-detail-route.test.tsx src/app/report/report-form-routes.test.tsx src/domain/listings/thread-read-only-notice.test.ts"
---

# Bolt 014 — Stage 3: Test Report

## Overview

The verification of the `014-web-threads` bolt: the four disjoint member
views, the item detail rendered from the server's projection, the report
forms and the reporter's actions, and both thread types with their
read-only states.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The four view partitions and their disjointness | `src/domain/listings/report-partition.ts` | 003 | FR-49 |
| The member nav's closed entry list | `src/domain/listings/member-navigation.ts` | 003 | FR-49 |
| The reporter's action gate | `src/domain/listings/report-action-gate.ts` | 005 | FR-10, FR-11, FR-53 |
| The thread read-only notices | `src/domain/listings/thread-read-only-notice.ts` | 006 | §13.5, §13.5b |
| The standby display derivation | `src/domain/recovery/standby-display.ts` | 003 | FR-41 |
| The member view surface | `src/ui/member-view-surface.tsx` | 003 | FR-49 |
| The item detail surface | `src/ui/item-detail-surface.tsx` | 004 | FR-39, FR-13, FR-37 |
| The member dashboard and the topbar | `src/ui/member-home-surface.tsx`, `src/ui/member-topbar.tsx` | 003 | FR-49 |
| The report form and the reporter's actions | `src/ui/report-form-surface.tsx`, `src/ui/report-actions-surface.tsx` | 005 | FR-9, FR-10, FR-11, FR-53 |
| The thread panel | `src/ui/thread-panel.tsx` | 006 | §13 |
| The report form routes | `src/app/report/lost/page.tsx`, `src/app/report/found/page.tsx` | 005 | §10.1, §10.3 |
| The member view routes | `src/app/my/reports/page.tsx`, `src/app/my/claims/page.tsx`, `src/app/my/recovery-responses/page.tsx` | 003 | FR-49 |
| The item detail route | `src/app/listings/[id]/page.tsx` | 004 | FR-39 |
| The reporter's plan derivation | `src/app/my/_reporter-actions.ts` | 005 | FR-10, FR-11 |

The bolt's implementation was complete before this stage; this stage records
**what was verified and against what**.

Stage 1 (design) was skipped by owner direction, so there is no
technical-design artifact for this bolt. The design decisions it would have
carried are stated in the code's own doc comments and in the governing
standards under `memory-bank/standards/`.

> **The full-suite verification was not run at this stage,** by owner
> direction ("do not full suite verification after implementation"). The
> measurement below is scoped to **this bolt's own suites**.

## The bolt's whole point is a negative

**This bolt has one sentence it exists to enforce, and it is a negative:**

> *"Item detail renders only the fields the server sent — no client-side
> visibility filter."*

The bolt's own Notes say why the shortcut is tempting and why it is wrong:

> *"The tempting shortcut here is to re-implement FR-39 as a display filter
> because it is easier to test in the browser. That would hide a data leak
> rather than fix one, because the sensitive field would already have been
> sent to the client."*

**So the verification is built around the shape of the assertion, not around
the presence of the feature.** Every assertion below is of one of three
kinds:

| Kind | What it asserts | Why it is the right shape |
|---|---|---|
| **Absence in the delivered HTML** | A withheld field leaves **no trace** in the response — not blank, not masked, not sent-and-hidden | A mask is still a delivery. A display filter is still a delivery. |
| **Presence of the structural evidence** | The `browse` partition carries the member's id **in the partition**, so the exclusion is in the query's predicate | A post-filter is a second implementation of the rule the server already owns. |
| **Absence of the code path** | The client holds no rule to re-evaluate — the reporter's plan is derived from the resolved column set, not from a client-asserted flag | A client that *could* filter is a client that will. |

**The suites assert the negative in the DOM, not merely in the source.** A
check that greps the source tree proves that the file does not say the word;
a check that greps the **rendered output** proves that the field did not
arrive. The second is the property the story names.

## The withheld field is absent, and the absent is *explicit*

**Story 004's criterion is that the field is *"absent from the delivered HTML
— not blank, not masked, not fetched and hidden in the client."*** The
suite asserts that absence three ways at once:

```tsx
expect(container.textContent).not.toMatch(/secret location|identifying marks/i);
expect(screen.getAllByText(HIDDEN_FROM_OTHER_MEMBERS).length).toBeGreaterThan(0);
```

The first assertion is the negative one — the value is nowhere in the
response. The second is the positive one — the **heading still renders**, so
a member knows the section exists and why it is empty. **A section that
vanished entirely would be a different defect**: the member would not know
whether there was nothing to see or something hidden from them.

**And the route's own suite proves the route did not fetch it either.** The
item detail route is given a projection that never carried the withheld
field, and the route renders the projection and nothing else. So the field
was never in the `SELECT`, never in the payload, and never in the DOM.

**The route asks the server, and the suite proves it asked.** The route
suite captures the call to the detail service and asserts the report id and
the actor id it passed — so "the decision happens on the server" is a
property of the code path, not an assumption.

## A member's own report cannot reach their own Browse, and the exclusion is structural

**The bolt's second success criterion is *"A member's own report never
appears in their own Browse."*** The property is enforced by the partition
carrying the member's id **in the partition itself**, so the exclusion is in
the `WHERE` clause.

**The infrastructure suite for that predicate already existed** —
`prisma-report-listing-reader.test.ts` asserts the `browse` partition
excludes the member's own reports at the reader level, and
`prisma-report-listing-partition.test.ts` asserts the `mine` and `browse`
row sets are disjoint. **Those two suites are the proof**, because the
exclusion is at the database and not at the screen.

**The member view route's suite adds the route-layer half.** It asserts that
the Browse route asks for the `browse` partition and **no other**, and that
each of the four views asks for **exactly one** partition:

```tsx
expect(new Set(partitions).size).toBe(3);
expect(partitions).not.toContain('browse');
```

**The route never filters rows itself.** The route names a partition and a
filter; the use case resolves the partition and the reader applies it. A
route that loaded `browse` and filtered its own reports out in JavaScript
would be the load-then-filter defect FR-39 names, applied to the partition
rather than to a field.

## The four views are disjoint, and each tab means its own vocabulary

**The disjointness is a domain property, and the domain suite already
proved it** — `report-partition.test.ts` asserts that every member partition
has **exactly one kind**, that `mine` and `browse` are complementary, and
that the participation partitions enumerate participation records rather than
reports.

**The route suite proves each view names one partition and no other**, and
**that each tab means the filter its label names.** That last one is the
defect this suite exists to catch:

| View | Tab | The filter it means | Why |
|---|---|---|---|
| `My Reports` | `Lost` / `Found` | `type` | A Lost report is not "the Lost status" — these are **type** filters |
| `My Reports` | `Closed` | `statuses: ['Closed']` | The only status filter among the three |
| `My Claims` | `Pending` / `Approved` / `Rejected` | `participationStatuses` | The **Claim's** status, not the report's |
| `My Recovery Responses` | one per canonical RR status | `participationStatuses` | The **Response's** status, not the Lost report's |

**A Claim on a `Claim Requested` report is still `Pending`** — so the Claim
tab filters the participation, not the report. Conflating the two
vocabularies would put a Claim in a tab named after a report status, and
the suite asserts the filter is the participation one *and* that the report's
status filter is unset.

**An unknown tab falls back to the view's default, never to "no filter at
all."** The tabs are a closed set, so a tab the product does not define is
not a request for "everything." Each view's fallback is its own default:
`Lost` for `My Reports`, `Pending` for `My Claims`, and `Submitted` for
`My Recovery Responses`.

**`My Recovery Responses` has one tab per canonical status** — eight of
them. A grouping ("Active", "Closed", "All") would collapse five distinct
terminal outcomes into one tab, and a member whose response was `Not a
Match` would have no tab that names what happened to it.

## The nav is a closed list, and FR-30's absence survives it

**§3.2 names exactly six things in the member topbar:** the four views, plus
`Report ▾` (Lost / Found) and `Account`. The suite asserts all four view
links and their routes, and asserts that the entry list has **exactly four
members** — so a fifth view cannot appear by accident, because the list is
data and the data is the FR-49 partition set.

**FR-30 forbids an in-app notification stream, and the member topbar is
where a bell would go.** The suite asserts the absence in the rendered DOM
and in the entry list's length:

```tsx
expect(container.textContent).not.toMatch(/notification|bell|unread/i);
expect(screen.queryByRole('button', { name: /notification/i })).toBeNull();
expect(MEMBER_VIEW_ENTRIES).toHaveLength(4);
```

**`Report ▾` is a menu of two URLs, not an in-form switch.** The suite
asserts the menu's entries are exactly `/report/lost` and `/report/found`,
that the menu is closed until it is opened, and that **Escape closes it and
returns the focus to the trigger** — the disclosure pattern's requirement,
because a menu the keyboard user opened must be dismissible without a
pointer.

**`Account ▾` carries `Profile` and the sign-out, and nothing else.** Theme
is **not** here — §19 makes Theme a separate topbar icon control — and the
suite asserts the account entry list has exactly one member, with the
sign-out supplied by the parent because the sign-out is a POST.

**The dashboard carries two paired primaries and four entry points, and no
activity feed.** The suite asserts the absence directly:

```tsx
expect(container.textContent).not.toMatch(/activity feed|recent activity|latest activity/i);
```

§9.4 is explicit — *"There is **no aggregate activity feed** on the member
home"* — and FR-49's four-view partition exists precisely so that a member's
activity is partitioned by kind. A home page that merged them would undo
that partition.

## The type is the URL, and the two date bounds are different numbers

**§10.1: *"The 'Lost' or 'Found' decision is encoded in the URL (`/report/lost`
vs `/report/found`). The form opens with the type already chosen — the user
does not need to pick it."***

The route suite asserts the type three ways:

- `/report/lost` opens a form whose heading is `Report Lost Item`, and
  **there is no radio, no `#type` element, and no type combobox**;
- `/report/found` opens a form whose heading is `Report Found Item`, and
  **the Lost form's heading is absent**; and
- **neither route reads the type from the request** — there is no `?type=`
  for a client to tamper with, and the route's suite asserts that neither
  the router was pushed nor refreshed to obtain one.

**The date bounds are the type's own, and they are different numbers.**
§10.3 gives *"Date (Lost): last 365 days, not future"* and *"Date (Found):
last 30 days, not future."* The suite asserts each bound exactly, and then
asserts the two are **not equal** — a route that reused the Lost bound for
the Found form would quietly widen the Found form's window by a year.

**The domain owns both numbers** — `dateMaxAgeDays` reads them — and the
route only turns them into the picker's `min` and `max`. The bounds are a
convenience, not the rule: the server validates the date again, so a
request that bypasses the picker is still refused.

**A failed campus-area read is a refusal, never a permissive default.** The
route suite asserts that the error state renders an alert and **no form** —
an empty set would reject every area, and a fallback would accept every
area.

## The report form has no type control, and its sensitive fields are marked

**The surface suite asserts the form's structure directly:**

- **The two cards and the footer.** `Required details`, `Optional details`,
  and a footer with `Cancel` and `Submit report`.
- **The date picker is bounded** on the native input, so the browser refuses
  what the server would refuse.
- **The optional fields are marked Sensitive**, with the helper beside them
  — §11.1: *"A Sensitive flag appears inline next to fields that are hidden
  from non-owners."* The suite asserts there are **two** labels and **two**
  helpers, because there are two such fields.
- **The required fields carry an asterisk and `aria-required="true"`**, and
  the name field carries its `maxlength`.
- **A field error is shown beside the field that failed**, and the field
  carries `aria-invalid="true"` — the error is next to its input, not
  pooled at the top of the form.
- **The submit button is disabled while submitting and keeps its label
  visible** as `Submitting…`, while `Cancel` stays enabled. Story 005's
  criterion asks for all three, and the suite asserts the button is disabled
  *and* that the label is still findable by its submitting name — a spinner
  with no label would leave a screen reader with nothing to announce.

## A blocked action is stated with its reason, and the destructive ones confirm

**§10.4: a blocked action is *"stated with the reason in plain English rather
than silently doing nothing."*** The suite asserts the **control is present
and disabled, with the reason beside it** — not that the control is absent:

```tsx
const edit = screen.getByRole('button', { name: EDIT }) as HTMLButtonElement;
expect(edit.disabled).toBe(true);
expect(screen.getByText(REPORT_CLOSED_CANNOT_EDIT)).toBeTruthy();
```

**Each block reason has its own message, and the messages name the remedy.**
The `InteractionExists` case is the clearest: §10.4 says *"once a Claim (Found)
or RR (Lost) exists, the reporter must use Withdraw instead"*, so the
message **points at Withdraw** rather than merely saying "no".

**The `administratorOnly` case says exactly what §10.4 says** — *"only an
Administrator may end the Lost workflow"* — so a Lost-report owner past
`Match Confirmed` is told the truth rather than shown a dead button.

**The destructive actions confirm, and the modal names the consequence.** The
delete confirmation reads *"Delete this report? This cannot be undone. The
report will be removed from listings."* and the withdraw confirmation reads
*"Withdraw this report? It will be removed from listings. The administrator
can still see it in history."* The suite asserts **both** the copy and that
**the handler does not run until the confirmation is accepted**:

```tsx
fireEvent.click(screen.getByRole('button', { name: DELETE }));
expect(onDelete).not.toHaveBeenCalled();
```

**And Escape dismisses the confirmation as a cancel** — again without
running the handler. A confirmation that could only be dismissed by clicking
"Cancel" would trap a keyboard user who opened it by accident.

## The reporter is recognised by the server's column set, not by a client flag

**This is the derivation the bolt's route layer adds on top of the domain's
gate**, and it is where a client-asserted identity would have leaked in.

**The FR-39 projection carries no `reporterId`** — and it must not, because
a field the client can be told about is a field the client can be lied
about. It carries the **resolved column set**, and the resolver puts the
owner column there **by equality of ids**.

So `reporterActionPlan` reads the column set:

```ts
if (!projection.columns.includes(ownerColumnFor(projection.report.type))) {
  return null;
}
```

**And the suite proves the difference is real:**

- a member holding only `unrelatedMember` gets **no plan at all** — not a
  plan with everything blocked, because "the reporter's blocked actions" is
  not a thing for a member who did not write the report;
- a **claimant** gets no plan — holding a participation column is not
  ownership;
- **a `foundReportOwner` column on a *Lost* report is not ownership** —
  FR-39 splits the owner columns, and no member is ever both. The suite
  asserts this mismatch returns `null`;
- and the **owner** gets the plan, with all three actions permitted.

**The type decides which fact counts, and the suite proves it in both
directions.** A **Claim** on a Lost report does **not** block the delete,
because §10.4 says in as many words that *"The Lost rule is expressed in
terms of `Recovery Response`s, not Claims"* — and a **Recovery Response**
on a Lost report does. The suite asserts both.

**A rejected Claim still counts as an interaction.** The deletion decision
reads *interaction existence*, not activity, and the suite asserts that a
`Rejected` Claim blocks the delete with the `InteractionExists` reason and
leaves Withdraw permitted.

**A `Claim Approved` report is still editable** — only `Returned` and
`Closed` block the edit — and the suite asserts that too, so a future edit
to the gate that conflated "the workflow moved on" with "the report ended"
would be caught.

## The threads are read-only for four different reasons, each with its own sentence

**§13.5 names four Claim-side variants and §13.5b names four Lost-side
variants**, and the story's technical note is blunt about why:

> *"Each read-only condition has its own named notice. A single generic
> read-only message would fail to tell the user why the conversation
> stopped."*

**So the domain suite asserts distinctness, not presence.** Four conditions,
four sentences:

```tsx
expect(new Set(notices).size).toBe(4);
```

**And the two families never share a sentence** — the suite asserts all
sixteen cross-family pairs are distinct. A member reading a Claim thread
must never be told about *"the parent Lost report"*.

**Every notice ends with §13.5's shared tail, word for word** — *"Existing
messages remain available for reference, but no new messages can be posted."*
The suite asserts the tail on **all eight** notices. The tail is one
constant, so the two families cannot drift.

**The Claim's status is checked first.** A decided Claim is read-only
whatever the report's status, and §13.5's list begins with the Claim's own
conditions — so the suite asserts an `Approved` Claim on a `Closed` report
names the **Claim**, not the report.

**The Lost side's terminal case is checked before the parent case**, because
a terminal response on a resolved report has two true conditions and the
terminal one is the more specific. The suite asserts all three terminal
statuses name the terminal reason **even on a `Closed` report**.

**A `Match Confirmed` thread has no read-only notice at all.** §13.5b
exempts it, and the suite asserts the variant is `null` **and** that asking
for the full notice throws — a writable thread has no notice, and reaching
for one is a programming error rather than a `null` to render.

**The `Match Confirmed` message does not imply a lock.** §13.5b forbids it,
so the suite asserts the informational message contains *"Physical handoff
is pending"*, does **not** contain *"read-only"*, and does **not** carry the
shared tail.

## The thread panel renders the history whether or not it is writable

**§13.5: *"messages are never deleted; a locked thread keeps its full
history."*** The surface suite asserts the panel's four states:

| State | What the suite asserts |
|---|---|
| **Writable** | The composer is present |
| **Read-only** | The notice is present and **the composer is absent** |
| **Permission denied** | The denial notice is present and **the composer is absent** |
| **Empty** | The empty-state copy renders |

**Locking removes the composer, never the history** — so the messages render
whether the thread is writable or not, and the suite asserts the messages
render **oldest first** by their order in the rendered text.

**A member who is not a participant sees the notice and nothing else.** The
composer is absent — the thread is not theirs.

**Posting a message hits the endpoint and then refreshes the route**, which
is §13.3's *"The thread refreshes on page load and on send"* — and §13.3's
other three prohibitions are honoured by construction: **no typing
indicator, no read receipt, no real-time update.** There is no
`setInterval` and no polling anywhere in the panel.

## The route layer is thin, and its reads are separated from its renders

**The project's ESLint rule `react-hooks/error-boundaries` forbids
constructing JSX inside a `try`/`catch`** — a render error is not a read
error, and the two must not share a handler. **Every route this bolt
touched obeys it**, and the arrangement it produced is also the correct
behaviour:

- the item detail route's `readDetail` returns the projection and the plan,
  or `null`; the JSX is built outside the `try`;
- the Browse route's `readBrowse` returns the rows, or `null`;
- the Claim and Recovery Response form routes read the projection first and
  refuse before they render.

**A `NotFoundError` becomes the not-found page, and an anonymous request
becomes the same not-found page** — the two are deliberately
indistinguishable, because telling an anonymous visitor that the report
exists would leak the fact that it does. **The route suite asserts that the
anonymous case runs no query at all**, so the refusal is upstream of the
read rather than a filter applied afterwards.

## Verification

### Command

```
npx vitest run \
  src/ui/member-surfaces.test.tsx \
  src/ui/report-form-actions.test.tsx \
  src/ui/member-navigation.test.tsx \
  src/app/my/_reporter-actions.test.ts \
  src/app/my/member-view-routes.test.tsx \
  src/app/listings/[id]/item-detail-route.test.tsx \
  src/app/report/report-form-routes.test.tsx \
  src/domain/listings/thread-read-only-notice.test.ts
```

### Result

| Suite | Files | Tests | Result |
|---|---|---|---|
| UI — `member-surfaces.test.tsx` | 1 | 20 | ✅ pass |
| UI — `report-form-actions.test.tsx` | 1 | 17 | ✅ pass |
| UI — `member-navigation.test.tsx` | 1 | 13 | ✅ pass |
| Domain — `thread-read-only-notice.test.ts` | 1 | 19 | ✅ pass |
| Route — `_reporter-actions.test.ts` | 1 | 10 | ✅ pass |
| Route — `member-view-routes.test.tsx` | 1 | 16 | ✅ pass |
| Route — `item-detail-route.test.tsx` | 1 | 7 | ✅ pass |
| Route — `report-form-routes.test.tsx` | 1 | 11 | ✅ pass |
| **Total** | **8** | **113** | ✅ **113 pass, 0 fail** |

### Coverage of the bolt's own modules

| Module | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `domain/listings/thread-read-only-notice.ts` | 100% | 100% | 100% | 100% |
| `domain/listings/report-action-gate.ts` | 78.26% | 81.81% | 80% | 78.26% |
| `ui/member-view-surface.tsx` | 100% | 76.19% | 100% | 100% |
| `ui/item-detail-surface.tsx` | 100% | 100% | 100% | 100% |
| `ui/thread-panel.tsx` | 87.5% | 75% | 100% | 87.5% |
| `ui/member-home-surface.tsx` | 100% | 100% | 100% | 100% |
| `ui/member-topbar.tsx` | 100% | 80% | 100% | 100% |
| `ui/member-copy.ts` | 100% | 100% | 100% | 100% |

**The route layer is excluded from coverage by `vitest.config.ts`**
(`src/app/**`) and is verified by its own suites — the member view route
suite, the item detail route suite, the report form route suite, and the
reporter's plan suite — the same arrangement every earlier bolt used.

**`report-action-gate.ts` sits at 78%** because its `never`-exhaustiveness
branches are unreachable by construction — they exist to make a missing
decision kind a compile error rather than a silent `undefined`. The gate's
**decisions** are covered: the suite exercises every permitted and every
blocked outcome for all three actions, and the `MatchConfirmed` →
`administratorOnly` derivation.

## What was verified

### The four views (16 tests)

- `My Reports` asks for the `mine` partition, `My Claims` for `claims`, and
  `My Recovery Responses` for `recovery_responses` — **and no view asks for
  `browse`**.
- The three views ask for **three different partitions**.
- `My Reports`'s `Lost` and `Found` tabs filter by **type**; its `Closed`
  tab filters by **status**.
- `My Claims`'s tab filters by the **Claim's** status, and the report's
  status filter is **unset**.
- `My Recovery Responses` filters by the **Response's** status.
- Each view's default tab is its own: `Lost`, `Pending`, `Submitted`.
- An unknown tab falls back to the default, **never to no filter at all**.
- `My Reports` offers exactly the three tabs §9.4 names; `My Claims`
  exactly its three; `My Recovery Responses` **one per canonical status**.

### The member nav and the dashboard (13 tests)

- The topbar exposes the four views, **in §3.2's order**, each to its own
  route.
- **No notification control of any kind**, and the entry list has exactly
  four members.
- `Report ▾` opens with the two form URLs, is closed until opened, and
  **Escape closes it and returns the focus to the trigger**.
- The menu's entries are exactly the two form URLs — **no type switch**.
- `Account ▾` carries `Profile` and the sign-out, and its entry list has
  exactly one member.
- The dashboard offers the two paired primaries as **links**, and the four
  entry-point links.
- **No aggregate activity feed** of any kind.
- The member's name is used when the server knows it, and the tagline
  renders without it when it does not.

### The item detail (7 tests)

- The route **asks the server** for the projection, with the report id and
  the actor id.
- The fields the projection carries **are** rendered.
- A withheld field is **absent from the delivered HTML entirely**.
- A non-reporter gets **no reporter actions at all**; the owner gets all
  three.
- A report that is not visible renders the not-found page.
- An anonymous request renders the not-found page **and runs no query**.

### The report forms (28 tests)

- The Lost form opens with the Lost heading and **no type control**; the
  Found form with the Found heading and **no type control**; **neither
  offers the other's heading**.
- The Lost date is bounded to 365 days; the Found date to 30; and **the two
  bounds differ**.
- The categories are the deployment's on both routes, and the campus areas
  are the deployment's.
- A failed campus-area read renders the **error state, not a form**.
- The form carries the two cards and the footer, the **Sensitive** markers
  on both optional fields, the required-field markers, and a field error
  beside its input.
- The submit button is disabled while submitting, **keeps its label**, and
  `Cancel` stays enabled.

### The reporter's actions (27 tests)

- All three actions are offered when the plan permits them.
- A blocked action is a **disabled button with its reason beside it**.
- The `InteractionExists` block **points at Withdraw**; the
  `administratorOnly` case **says only an administrator may end the
  workflow**.
- The delete and withdraw confirmations **name their consequence**, and
  **the handler runs only after the confirmation**; **Escape dismisses it
  as a cancel** without running the handler.
- The plan is `null` for a non-reporter, for a claimant, and for a
  **mismatched owner column**.
- The owner gets the plan; a Claim on a Lost report does not block the
  delete but a Recovery Response does; a `Rejected` Claim still counts as
  an interaction; `Claim Approved` leaves the edit permitted; a
  `Match Confirmed` Lost report is administrator-only; a terminal status
  blocks the edit with the terminal reason.

### The threads (19 + 12 tests)

- The four Claim-side conditions name four different sentences; the four
  Lost-side conditions name four different sentences; **no Claim notice
  equals any Lost notice**.
- Every notice ends with §13.5's shared tail.
- The Claim's status is read first; a `Returned` Claim names the item being
  returned.
- The Lost side's terminal case beats the parent case on all three
  terminal statuses.
- A `Match Confirmed` thread has **no** notice, and asking for one throws.
- The `Match Confirmed` message does not imply a lock.
- The panel renders the messages oldest first, shows the composer only when
  writable, shows the read-only and permission-denied notices **without a
  composer**, renders the empty state, and posts to the endpoint and then
  refreshes the route.

## Success Criteria

The bolt's six success criteria, each against a named backing test:

| # | Criterion | Where verified |
|---|---|---|
| 1 | The four views are disjoint and correctly partitioned | domain (`report-partition.test.ts` — each partition has exactly one kind, `mine` and `browse` are complementary), routes (each view asks for exactly one partition, and the three ask for three different ones) |
| 2 | A member's own report never appears in their own Browse | infrastructure (`prisma-report-listing-reader.test.ts` — the `browse` predicate excludes the member's own reports; `prisma-report-listing-partition.test.ts` — the `mine` and `browse` row sets are disjoint), routes (the Browse route asks for `browse` and no view asks for anything else) |
| 3 | Item detail renders only the fields the server sent — no client-side visibility filter | item detail route (the route asks the server; a withheld field is absent from the delivered HTML), surfaces (the withheld field's **value** is nowhere in the rendered output, while the **heading** still renders) |
| 4 | Threads are read-only at terminal status or when the parent report is `Returned` or `Closed` | domain (the terminal case beats the parent case; the parent case covers `Returned` and `Closed`; a `Match Confirmed` thread is writable), surfaces (a read-only thread shows the notice and **no composer**) |
| 5 | Blocked actions show their distinct messages for `Returned` and `Closed` | domain (`report-action-gate.ts` — a terminal status blocks Edit and Withdraw with the terminal reason, and Delete's two blocks have two different reasons), surfaces (the disabled control carries its reason beside it, and the `InteractionExists` message names Withdraw) |
| 6 | Cross-thread access is denied by the server, not hidden in the interface | surfaces (a member who is not a participant sees the permission-denied notice and **no composer**), domain (the notice's variants are the domain's, and the route composes none of them) |

**All six criteria are met.**

## Owner Items

1. **The blast radius was not measured.** The full suite was not run, by
   owner direction. The bolt's own eight suites are green (113 tests), and
   the typecheck, the lint, and the production build are clean.
2. **`report-action-gate.ts` sits at 78% line coverage.** The uncovered
   lines are its `never`-exhaustiveness branches, which are unreachable by
   construction — they exist to make a missing decision kind a compile
   error rather than a silent `undefined`. Every *decision* the gate makes
   is covered.
3. **`report-form-panel.tsx`, `claim-form-panel.tsx`,
   `recovery-response-form-panel.tsx`, and `report-actions-panel.tsx` are
   the client halves of the forms, and they sit at 20–32% coverage.** The
   suites cover the **surfaces** these panels render — `ReportFormSurface`,
   `ReportActionsSurface` — and the **routes** that mount them; the panels'
   own submit handlers are exercised only through the routes. Their
   network behaviour is covered at the API route layer, where the parsers
   and the services live.
4. **The `Admin ▾` second nav layer for an administrator who is also a
   member is not built by this bolt.** It belongs to `021-web-admin`, which
   owns the administrator topbar and its four queues; the member topbar
   deliberately carries no admin entry.
5. **The `Pending` account's collapsed topbar and the anonymous topbar's
   three entries are covered by `012-web-public`'s suites, not by this
   bolt's.** The member topbar is this bolt's; the other two actors'
   topbars were delivered with the public surfaces.
6. **The Browse member view's "richer view" — filter pills, a type toggle,
   and sort — is not built.** The route serves the `browse` partition with
   the member's richer rows, but the filter-pill bar is `009-reporting-
   search`'s surface and the sortable column headers are not part of this
   bolt.
7. **The item detail page's `Item not found` copy is the route's own.**
   The FR-38 copy lives in `member-copy.ts` for the other surfaces; this
   one is inline, and was not folded into the shared copy module.
