# Maintenance Log

Records automated changes applied to memory-bank artifacts (status syncs,
validation fixes, migrations) so the workflow state has an audit trail of its own.

---

## 2026-10-30T19:30:00Z — Bolt `010-reporting-images` closed and audited

**Triggered by**: owner direction — *"is there any other bolt implementation left?"*, then *"Audit, tick, and close the gaps (Recommended)"*.

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/010-reporting-images/bolt.md` | `complete` (closed 2026-10-29, before the audit) | `complete` | The audit stage recorded; the success criteria were already ticked |
| `memory-bank/bolts/010-reporting-images/ddd-03-test-report.md` | — | addendum appended | The audit's findings, the gaps, and the new tests |
| `.../units/002-reporting-and-listings/stories/013-attach-image-to-report.md` | `draft` / `implemented: false` / `assigned_bolt: null` | `done` / `implemented: true` / `assigned_bolt: 010-reporting-images` | **All 25 criteria ticked**, each with its backing test named beside it |
| `.../units/002-reporting-and-listings/construction-log.md` | — | updated | The bolt's three execution-history entries; the bolt-structure row; the execution summary's counts (5 of 5 bolts complete, 0 remaining) |

### What the audit was

The Stage 5 test report had verified the bolt's **seven success criteria**
against the tests that existed at the time. It had not verified that each of
story `013`'s **25 acceptance criteria** had a named test behind it — and
those are different questions. A criterion whose behaviour is implemented but
**never asserted** is not protected: it reads as done, it ticks as done, and
the next refactor can remove it with no test failing.

So each criterion was checked against the code for a *named test that would
fail if the behaviour regressed*.

### Three criteria were implemented but unbacked

Each was closed with a real test, not by re-reading the code and declaring it
satisfied.

- **The byte count comes from the stream, not from `Content-Length`** — the
  parser checks the real byte length after reading, but no test lied about
  the declared size, so the second check could have been deleted with nothing
  failing. Now: `parse-report-request.test.ts` → *"counts the bytes it
  actually read, not the size the part claims"*.
- **A non-`Active` member's upload is refused** — the gate is correct and
  sits *before* the body is read, but the only `Pending` case sent a JSON
  body, so no upload was ever attempted. Now: `reports-route.test.ts` →
  *"refuses a Pending actor's upload with a 403"* and *"stores nothing when it
  refuses a Pending actor's upload"*.
- **The check does not rely on the CDN or middleware** — the ordering was
  asserted in the service, but nothing asserted that the *route* has no blob
  read of its own, so a second unchecked read could have been added to the
  route. Now: `image-route.test.ts` → *"never reads the blob itself"*.

### Three requirements of the governing standard had no implementation at all

- **The 40 MP pixel cap.** `image-handling.md` §1 requires a *pixel* cap
  decoded from the header; the store validated the byte length and the magic
  bytes but never decoded the header, so a 5 MB decompression bomb passed
  validation. The header is now decoded (JPEG SOF, PNG IHDR, WebP VP8X) and
  the count rejected before any full image data is decoded.
- **The administrator's image-replacement route.** FR-53's replacement was
  implemented and tested in the service and **unreachable in production**,
  because the route read JSON only and a `multipart/form-data` body was a
  400. The multipart reader was extracted into `readMultipartForm` and
  `readImagePart` so the edit path reuses the create path's 5 MB ceiling and
  type rules — and the edit path's one distinction, that a **missing image
  part is a valid text-only edit**, is stated in the parser itself.
- **The entity-scoped blob prefix.** `reports/{reportId}/` could not be
  reached while the id was database-generated, because the upload precedes
  the row write. The id is now **minted in the application layer**
  (`crypto.randomUUID()`) before the upload and threaded through the
  repository port, which writes it as given — so the id stays
  **server-derived** and a member can never assert one.

### And one requirement had no surface at all

The 70% and 90% warnings, and the administrator's view of the budget.
`classifyQuota` was called by no service. The budget now has **its own page**
at `/admin/storage` — a page and **not a fifth dashboard tile**, because
§15.1 freezes the dashboard at four tiles and the story's criteria name the
absences as load-bearing.

The page's warning bands are **imported from the write path's constants**
rather than restated, and the suite asserts them **against those constants,
not against the literals `70` and `90`** — so a change to the write path's
bands fails the administrator's suite rather than silently leaving the
warning in one place and the refusal in another. A failed read shows **no
number**: the page renders a calm error state and never renders *"0 bytes
used"*, because zero is a fact about the budget and a failed read is not a
fact.

**Verification at close time**, scoped to the bolt's own suites by owner
direction — **the full suite was not run**: typecheck exit 0 · **39/39**
across the three storage-usage suites · **54/54** across the three route and
parser suites · **43/43** across the re-run quota and notification suites.

**Three pre-existing failures are unrelated to this bolt** and were confirmed
so by stashing `src/` and re-running: the `description_withheld` and
`image_withheld` column expectations, and the `report-listing-filter`
"narrows nothing" test. Stashing produced **four** failures against
**three** with these changes — the three are pre-existing.

---

## 2026-10-30T18:30:00Z — Bolt `022-web-audit-accessibility` closed

**Triggered by**: `/aidlc` — owner direction to implement the bolt directly
("start next bolt implementation only"). **This is the project's final bolt.**

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/022-web-audit-accessibility/bolt.md` | `planned` | `complete` | Stages 2 and 3 complete (stage 1 skipped by owner direction), all 8 success criteria ticked |
| `memory-bank/bolts/022-web-audit-accessibility/simple-03-test-report.md` | — | created | The Stage 3 artifact |
| `memory-bank/standards/accessibility-review.md` | — | created | The pointer standard — the 24-row checklist, the suite behind each row, and the two rows no gate can enforce |
| `.../units/007-web-surfaces/stories/011-accessibility-and-secure-image-delivery.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | All 27 criteria ticked; the reason is written beside each one that is review-only, vacuous, or an Operations measurement |
| `.../units/007-web-surfaces/unit-brief.md` | story 011 `Planned` | story 011 `Implemented` | **The unit's eleventh and last story is now delivered** |
| `.../units/007-web-surfaces/construction-log.md` | — | updated | Execution History entries for the bolt's start and its two stage completions; the "Outstanding After This Bolt" table narrowed to what is genuinely still open |

**Verification at close time**, scoped to the bolt's own thirteen suites by
owner direction — **the full suite was not run**: typecheck exit 0 · **203/203
tests across 13 files** · the bolt's own modules at **95.23% statements /
90.47% branches / 93.93% functions / 95.83% lines** against the project's 80%
floor. Lint reports one **pre-existing** error in
`src/infrastructure/listings/prisma-lost-report-closeout-adapters.test.ts` —
an untracked file belonging to bolt `019`, deliberately left alone rather than
silently absorbed into this diff.

**Two real defects were found by the suites and fixed in the production
code.** The first is the one that mattered: **the browser's validation bubble
blocked the error summary on three of the five forms.** The report, claim, and
recovery-response forms carried `required` but no `noValidate`, so the
browser's own validation intercepted the submit event, the submit handler
never ran, and the `role="alert"` summary, the first-invalid-field focus, and
the scroll to the first error **never happened**. The story's headline
criterion was unreachable, and the story's edge case — *"Screen reader user
submits an invalid form → the summary is announced and focus lands on the
first invalid field"* — was false. The fix adds `noValidate` to all three
forms and **keeps the `required` attributes**, because `noValidate` silences
the browser's bubble and not the semantics: an assistive technology still
announces the field as required. The surface gate now **fails the build** on
a form with `required` fields and no `noValidate`, so the defect cannot
return on the next form. The second: **the image and candidate-image file
fields had nowhere to render an error** — a helper under `…-describedby` and
no error element — so a refused upload had nowhere to land and
`aria-describedby` would have kept announcing the helper. The error now
replaces the helper under the same id.

**The dark theme had shipped the light theme's semantic soft fills.**
`DESIGN.md` calls the semantic palette "theme-independent" and states that
body text on a soft fill renders in `colors.{theme}.on-background` — true in
the light theme and **false in the dark theme**, where `on-background` is
light ink on the same light pastel. The pair measured **1.04:1**: light ink on
near-white, more than four times worse than the 4.5:1 floor. The dark theme
now has its own soft-fill pair, and the contrast contract checks **both
themes** — because a contrast rule that only ever ran against the light theme
is how the failure shipped in the first place.

**The story's last criterion is now a machine gate rather than a
convention.** *"Given a new surface is added, it is checked against every
criterion in this story before it is considered complete"* stands behind
**two suites** and **one written standard**:

| Gate | What it checks | Where it lives |
|---|---|---|
| **The design-system gate** | The properties of the *tokens* — contrast in both themes, the 44×44 floor, reduced motion, the focus ring | `src/ui/a11y-contract.test.ts` — reads the **stylesheet** |
| **The surface gate** | The properties of *each surface* — the badge, the `aria-describedby` association, the live regions, the table semantics, the disclosures, the dialog, the native validation | `src/ui/surface-review.test.ts` — reads the **`.tsx` sources** |

**Neither gate replaces a human reading a screen. They replace the
*forgetting*.** A criterion that can be checked mechanically is checked
mechanically; the ones that cannot are named as such — the **logical tab
order** (a tab order can be reachable and still be illogical; only a reviewer
can judge "logical") and the **focus trap for a *new* modal** (a per-modal
property cannot be inherited by a modal that does not exist yet). The
standard's 24 rows each name the criterion, the rule, and the suite that
enforces it, and the two review-only rows are named rather than hidden.

**The surface gate reads the source rather than rendering it, and the
trade-off is stated rather than hidden: a surface written in a way the gate
cannot see would pass.** The mitigation is that **each rule has exactly one
way to satisfy it** — one shared badge component, one `noValidate`, one
`<th scope="col">` — so a surface that satisfies the rules is a surface that
meets the contract. The gate parses **whole opening tags**, not lines, because
an element's attributes can span several lines and a line-based rule would
report a false failure. That was a real defect in the gate's first draft,
caught by the gate's own tests.

**The p95 criterion is asserted by its preconditions, not measured, and the
standard says so.** PRD §10's *"≤ 2 seconds at p95 on a 4G connection"* is a
property of a deployment on a member's phone; a unit test could only measure
this machine on this network. **A timing test that cannot fail for the reason
it names is a test that lies.** So `src/app/initial-html-budget.test.ts`
asserts what this codebase controls — every route server-rendered (the
precondition ADR-1's claim rests on), the client bundle limited to the
interactive surfaces, no third-party script, one stylesheet, and the theme
script **inlined** rather than fetched — and the **actual p95 remains an
Operations measurement** against the deployed application on a 4G profile.
The suite makes the number plausible; it does not claim it.

**Nine hand-written badges became one component**, so the icon, the
`aria-label`, and the text cannot disagree — and the badge rule fails the
build on a surface that writes its own. **The menu keyboard contract was one
key, not four**: the topbar's disclosure menu now opens with Enter, Space,
and ArrowDown, navigates with the arrow keys with modular wrapping, jumps
with Home/End, and closes on Escape **with focus restored to the trigger**.
The theme popover gained the `aria-controls` its `aria-expanded` had been
pointing at nothing.

**The two image deliveries are separate, deliberately.** The report image and
the candidate image have different entities and different viewers; a shared,
parameterised authorisation is one whose two branches can drift apart, and
the FR-39 matrix has exactly the shape where a drifted branch leaks a private
image. The suites assert the ordering separately for each: the requester is
resolved, the matrix is applied, and **only then** is the blob read called —
and the blob read is **never** called for a refused viewer.

**Items carried forward** (none blocks the close): the **p95 is an
Operations measurement**, not a unit-test one; the **logical tab order** is
review-only; a **new modal needs its own focus-trap test**; the surface gate
reads source rather than DOM; the **prototype's manual acceptance** remains
deferred and is never claimed as passed; and the **blast radius was not
measured**, because the full suite was not run.

**The unit is complete.** All eleven of Unit 007's stories are now delivered,
across four bolts — `012-web-public`, `014-web-threads`, `021-web-admin`, and
`022-web-audit-accessibility` — and `022` is the last bolt of the project.

---

## 2026-10-30T17:50:00Z — Bolt `014-web-threads` closed

**Triggered by**: `/aidlc` — owner direction to implement the bolt directly
("start next bolt implementation only")

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/014-web-threads/bolt.md` | `planned` | `complete` | Stages 2 and 3 complete (stage 1 skipped by owner direction), all 6 success criteria ticked |
| `memory-bank/bolts/014-web-threads/simple-03-test-report.md` | — | created | The Stage 3 artifact |
| `.../units/007-web-surfaces/stories/003-member-view-shell-and-navigation.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 18 of 20 criteria ticked; the two left unticked (the `Admin ▾` five-entry menu, the Browse filter-pill and sort richer view) name surfaces other bolts build, and the reasons are written beside them |
| `.../stories/004-item-detail-by-relationship.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 18 of 19 criteria ticked; the administrator's audit-trail entry point belongs to story `010`, which `021-web-admin` delivered |
| `.../stories/005-report-forms-and-member-actions.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 18 of 23 criteria ticked; the five left unticked (the image drag-drop picker, the `Report submitted.` toast, the scroll-to-first-error behaviour, the modal focus trap and focus return, the dirty-form `Discard your changes?` prompt) are recorded with the reason beside each |
| `.../stories/006-claim-and-recovery-threads.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 29 of 31 criteria ticked; the `Claim submitted.` toast and the auto-rejection banner are recorded with the reason beside each |
| `.../units/007-web-surfaces/unit-brief.md` | `stories-defined` | `in-progress` | Four more of its eleven stories are now implemented; its remaining bolt `022-web-audit-accessibility` is still planned |
| `.../units/007-web-surfaces/construction-log.md` | — | updated | Execution History entries for the bolt's start and its two stage completions; the "Outstanding After This Bolt" table narrowed to what is genuinely still open |

**Verification at close time**, scoped to the bolt's own eight suites by owner
direction — **the full suite was not run**: typecheck exit 0 · lint exit 0 ·
production build exit 0 registering every bolt-014 route · **113/113 tests
across 8 files**.

**The bolt's whole point is a negative, and the verification was shaped to
match.** The tempting shortcut was to re-implement FR-39 as a display filter,
because it is easier to test in a browser — but that would **hide a data leak
rather than fix one**: the sensitive field would already have been in the
payload, in the DOM, and in the network tab. So the projection carries **no
`reporterId`** — a field the client can be told about is a field the client can
be lied about — and it carries the **resolved column set** instead, with the
resolver putting the owner column there **by equality of ids**. The reporter is
recognised from the server's own resolution, never from anything the client
asserts. The suite proves the distinction is real rather than decorative by
asserting that a **mismatched owner column** — `foundReportOwner` on a *Lost*
report — yields no action plan at all.

**A withheld field is asserted absent from the delivered HTML** — not blank,
not masked, not sent-and-hidden — while the withheld **heading** still renders,
so a member knows the section exists and why it is empty. And the decision is
proven to happen where it belongs: the route suite captures the call to the
detail service and asserts the report id and actor id it received, and asserts
that an **anonymous request runs no query at all**.

**The member's own report is excluded from their own Browse in the query's
predicate**, because the `browse` partition carries the member's id in the
partition itself. There is no post-filter that could be forgotten, and no
client-side filter that would hide a leak rather than fix one.

**The four views' tab vocabularies are distinct, and the routes assert them.**
`My Reports`'s `Lost` and `Found` tabs are **type** filters; `My Claims`'s
`Pending` tab is a **participation status** filter. Conflating the two is the
defect the suite exists to catch, so the route suite asserts that a Claim
filter leaves the report's `statuses` at `null`. An unknown tab falls back to
the view's default, never to "no filter at all" — the tabs are a closed set.

**The delete gate is type-asymmetric, and that asymmetry is the interlock.** A
Found report's hard delete is gated on **Claim** existence and a Lost report's
on **Recovery Response** existence; the domain reads *interaction existence*,
not activity, so a `Rejected` Claim still blocks the delete while a Claim on a
Lost report does not. Expressing the Lost rule in terms of Claims would be a
defect, and the suite asserts the asymmetry directly.

**`Match Confirmed` is writable, and that is deliberate.** It is the mirror of
the per-Claim rule, and getting it wrong would freeze the conversation exactly
when the physical handoff still needs arranging. The suite proves `Match
Confirmed` yields **no notice at all**, and that the message it may carry does
not imply the thread is locked.

**Each thread's read-only reason is its own named notice.** Four Claim-side
variants and four Lost-side variants, each ending with the shared tail
`Existing messages remain available for reference, but no new messages can be
posted.`, and the suite proves **all sixteen cross-family pairs** are unequal —
a single generic read-only message would fail to tell the user why the
conversation stopped.

**Items carried forward** (none blocks the close): the **blast radius was not
measured**, because the full suite was not run; `report-action-gate.ts` sits at
78% because of unreachable `never` branches; the client form panels sit at
20–32%; the `Admin ▾` navigation layer belongs to `021-web-admin`; the
anonymous and `Pending` topbars belong to `012-web-public`; the Browse
filter-pill bar and sort headers belong to `009-reporting-search`; the
`Item not found` copy is inline rather than in `member-copy.ts`; and the
`Report submitted.` and `Claim submitted.` toasts, the dirty-form
`Discard your changes?` prompt, the image drag-drop picker, and the
auto-rejection banner are all recorded as outstanding against the stories that
name them.

---

## 2026-10-30T17:10:00Z — Bolt `021-web-admin` closed

**Triggered by**: `/aidlc` — owner direction to implement the bolt directly
("start next bolt implementation")

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/021-web-admin/bolt.md` | `planned` | `complete` | Stages 2 and 3 complete (stage 1 skipped by owner direction), 6 of its 7 success criteria ticked — the seventh is recorded as outstanding, not met |
| `memory-bank/bolts/021-web-admin/simple-03-test-report.md` | — | created | The Stage 3 artifact |
| `.../units/007-web-surfaces/stories/007-administrator-dashboard.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 16 acceptance criteria ticked, `assigned_bolt` set |
| `.../stories/008-administrator-queues.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 22 acceptance criteria ticked |
| `.../stories/009-no-other-notifications.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 16 of its 17 criteria ticked; the one left unticked is a **governance rule, not a code behaviour**, and the reason is written beside it |
| `.../stories/010-contextual-audit-views.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 21 of its 23 criteria ticked; the two left unticked (the filters, the `Load older` append) name surfaces this bolt does not build, and the reasons are written beside them |
| `.../units/007-web-surfaces/unit-brief.md` | `stories-defined` | `in-progress` | Four of its eleven stories are now implemented; its remaining bolt `022-web-audit-accessibility` is still planned |
| `.../units/007-web-surfaces/construction-log.md` | — | created | The unit's construction log |

**Verification at close time**, scoped to the bolt's own seven suites by owner
direction — **the full suite was not run**: typecheck exit 0 · lint exit 0 ·
production build exit 0 registering all seven `/admin` routes · **147/147 tests
across 7 files**.

**The four queues are data, not code, and that is what makes the dashboard
and the queue agree.** The domain holds **one filter object per queue**;
`buildDashboardTiles` iterates the same closed four-element tuple; and the
queue reader turns that one filter into a SQL predicate. So "the count matches
the number of rows the queue returns under its own filter" is structural, and
**a fifth tile has nowhere to go** — the tile set is a closed four, not a
rendering decision.

**The filter is a predicate in the SQL, not a post-filter.** A reader that
loaded a broad set and filtered it in JavaScript would be the load-then-filter
defect FR-39 names, applied to a queue. The report's **type** is in the
predicate too, so a Lost report cannot appear in the Found-side
awaiting-return queue and a Found report cannot appear in the Lost-side
verification queue. The suite asserts the type as a **bound parameter**, and
asserts that the awaiting-return statement contains `Found` and **not**
`Lost`.

**One real defect was found by the suites and fixed in the production code.**
All four of the queue reader's `WHERE` fragments were bare predicates with no
`WHERE` keyword, so **every one of the four queues would have failed at the
database** the first time an administrator opened it — and the failure would
have presented as the calm "something went wrong" panel rather than as an
error anyone could name. The fix puts the keyword in the fragment, so **one
fragment serves both the row query and the count query** — which is the
arrangement the module's own doc comment already described, and the code had
not honoured it. **The SQL-capture suite is what found it**: the reader uses
raw SQL precisely so the emitted statement is assertable, because "the SQL
parses" and "the filter is in the SQL" are different claims.

**Audit is contextual, not a queue, and that is enforced in four independent
places.** The domain's tuple has four members and no audit queue; the
`/admin/audit` directory **does not exist**, so a route that does not exist
cannot be served; the nav carries the four queues and no audit entry; and the
contextual audit query exposes **no `listAll`**, so there is no code path by
which a global audit read could be issued. **A report of the wrong side
produces no trail read at all** — the audit page reads the report first and
checks its type against the route's side, so a Found route for a Lost report
does not read a trail, does not render one, and does not leak whether that
report has events.

**FR-30 is verified as an absence in three independent ways**, because one way
could be defeated by a future edit: the **rendered DOM** of every
administrator surface is grepped for the domain's forbidden markers; the
**source tree**'s class names and attribute values are scanned for the same
markers; and the whole tree is scanned for `setInterval`, so nothing polls.
**The source scan is narrowed to class names and attribute values, never on
prose** — a comment that says *"there is no notification bell"* is
documentation of the absence, not an instance of it, and a check that failed on
documentation would be a check that stopped being run. The **nine channels
are exactly nine and every one is an email**; the FR-51 authentication email
is held **outside** the eight FR-46 business events, because "FR-46 has nine
events" would be a false statement about a frozen PRD.

**A module that made an absence checkable had no suite of its own.**
`notification-absence.ts` — the nine closed channels, the forbidden markers,
the permitted confirmation scope (`OwnAction` only), and the member status
history's three-entry cap — was covered only incidentally. It now has a
**16-test suite** of its own. **One assertion in it was wrong on the first
run** and the *test* was corrected, not the code: the status history's cap is
applied to the head of a newest-first list, so the three most recent survive.

**Two gaps were closed during the closeout rather than left.** The dashboard
and queue error states rendered `Try again` only, and the audit trail's error
state rendered **no actions at all**, while §5.14 names *"'Try again' as
primary, 'Go back' as secondary"*; `GO_BACK` was declared in `admin-copy.ts`
and used by nothing. Both surfaces now render the **declared constants** — so
the copy cannot drift from the test that asserts it — and the suite asserts
both actions.

**The queues are the ARIA grid, and the focus is clamped rather than
wrapped.** §5.7 and §20.1 require `role="grid"`/`row`/`gridcell`, a roving
`tabindex` with exactly one row at `0`, and arrow-key navigation. The suite
asserts `document.activeElement` after each key, because a roving `tabindex`
whose state moved but whose focus did not would leave a screen reader's cursor
and the visual focus disagreeing. **Wrapping would send the administrator to
the top of the queue by accident**, so the focus is clamped and the suite says
so.

**The accounts table's physical columns are camelCase** — `displayName`,
`selfDeclaredRole`, `createdAt` — because the table was renamed and its
columns were not. PostgreSQL lower-cases an unquoted identifier, so
`a.displayName` would be folded to `a.displayname`, which is not the column;
the reader carries its own complete `PHYSICAL_ACCOUNT` map and quotes the
identifiers.

**Items carried forward** (none blocks the close): the **administrator report
edit surface** and its exactly eight permitted fields — the bolt's success
criterion 7 — belong to bolt `022`, and the criterion is recorded as
**outstanding rather than met**; the registration queue's `Reject` danger
action and its reason modal belong to Unit 001's registration review surface;
the audit trail's **three filters** and the `Load older` **append behaviour**
are not this bolt's; the **member surfaces** are covered by the source scan
rather than by a DOM render, because the member dashboard is not built yet;
the `CHECK` constraints are invisible to Prisma and are protected by a test
rather than by the migration tooling; and **the full suite has not been run
against this bolt** — advisable before the next bolt that touches the
`accounts`, `claims`, or `reports` tables.

---

## 2026-10-30T12:55:00Z — Bolt `023-claim-threads-notifications` closed

**Triggered by**: `/aidlc` — owner direction to implement the bolt directly
("now start the next bolt implementation only")

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/023-claim-threads-notifications/bolt.md` | `planned` | `complete` | Stages 3 and 4 complete (stages 1 and 2 skipped by owner direction), all 8 success criteria ticked |
| `memory-bank/bolts/023-claim-threads-notifications/ddd-03-test-report.md` | — | created | The Stage 5 artifact |
| `.../units/003-found-side-claims/stories/007-per-claim-message-thread.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 14 acceptance criteria ticked, `assigned_bolt` set |
| `.../stories/008-claim-notification-emails.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 13 acceptance criteria ticked |
| `.../stories/005-close-report.md` | — | amended | Its "no email is sent to any responder or claimant" criterion contradicted story 008 and the PRD; amended in place with the reason recorded |
| `.../units/003-found-side-claims/unit-brief.md` | `stories-defined` | `complete` | All 3 of its bolts (013, 016, 023) are complete and all 8 of its stories are `implemented` |

**Verification at close time**, scoped to the bolt's own four suites by owner
direction — **the full suite was not run**: typecheck exit 0 · lint exit 0 ·
**160/160 tests across 4 files** · the bolt's own nine modules at **100%
statements / 100% branches / 100% functions / 100% lines**. Two gaps were
closed during the stage rather than left: the domain's `isClaimThreadWritable`
predicate and its defensive `never`-guard were untested, and the two Prisma
adapters' transaction guards had three branches each rather than one.

**The schema was dictated, not invented.** The `thread_messages` table had
**never existed** — but `prisma-thread-visibility-reader.ts` has been
querying it since bolt `008` and `physical-columns.ts` already named its
columns. The migration was written to match the reader that was already in
the codebase, so the reader and the table cannot disagree. The polymorphic
`(parent_type, parent_id)` pair alone is **not** enough — a `parent_id` is
only meaningful together with its kind — so the table carries a `claim_id`
foreign key and three `CHECK` constraints say the pair must agree. The
database suite proves all four constraints live.

**Two real defects were found by the new suites and fixed in the production
code**, not accommodated in the tests:

1. **The existence oracle.** The thread service threw `NotFoundError` for a
   Claim that did not exist, *before* checking participation — so a stranger
   could ask whether a Claim was real and read the answer off the status
   code. A missing Claim is now refused with the access-denied message in
   **both** the read and the post path: a Claim that does not exist has no
   participants, so every reader of it is refused the same way.
2. **The whitelist gap.** `reportLocksThreads` asked "is this one of the
   *locking* statuses?", so a status the vocabulary does not own was waved
   through as **writable**. The rule is now a whitelist of the statuses that
   **permit** posting (`Open`, `Claim Requested`, `Claim Approved`), and
   everything else locks — the safe direction for a corrupted row or a future
   vocabulary change.

**A story conflict was resolved by authority, not by preference.** Story 005
said no email is sent to any responder or claimant on any closure; story 008
said the auto-rejected claimant receives the FR-29 email carrying "report
closed by administrator". `requirements.md` states "Where this file and the
PRD differ, **the PRD wins**", and the PRD is explicit on both sides (FR-29
names the reason; FR-29 requires the rejected claimant to receive it). **Story
005's blanket "no email" was the error**, and its criterion was amended.

**The audit catalog was not changed.** Event 10
(`report.found_closed_by_administrator`) and event 14
(`thread.claim_message_posted`) already existed in the frozen catalog; the
payload builders carry exactly what the sanitizer permits, and the sanitizer
denies by default.

**Items carried forward** (none blocks the close): the `CHECK` constraints are
invisible to Prisma and are protected by a test rather than by the migration
tooling; **the `thread_messages` table now exists**, so any pre-existing suite
that exercised `prisma-thread-visibility-reader.ts` against a table it did not
create should be re-run — the reader's behaviour cannot have changed, but its
**availability** has; the blanket-delete race in the pre-existing
infrastructure suites is still latent; the database's time zone must be set to
UTC explicitly by the deployment; **the two thread routes and the close route
have no route-level suite** — the services behind them are covered, but the
routes' own parsing, CSRF refusal, and status-code mapping are exercised only
by their types; and **the full suite has not been run against this bolt** —
advisable before the next bolt that touches the `claims` table, the `reports`
table, or the Found report machine.

---

## 2026-10-30T06:30:00Z — Bolt `016-claim-decisions` closed

**Triggered by**: `/aidlc` — owner direction to implement the bolt directly
("start next bolt implementation. do not need other stage. do not full suite
verification after implementation. complete the development within short time")

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/016-claim-decisions/bolt.md` | `planned` | `complete` | Stages 3 and 4 complete (stages 1 and 2 skipped by owner direction), all 7 success criteria ticked |
| `memory-bank/bolts/016-claim-decisions/ddd-03-test-report.md` | — | created | The Stage 5 artifact |
| `.../units/003-found-side-claims/stories/002-administrator-claim-review.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 7 acceptance criteria ticked, `assigned_bolt` set |
| `.../stories/003-approve-a-claim.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 11 acceptance criteria ticked |
| `.../stories/004-reject-a-claim.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 10 acceptance criteria ticked |
| `.../stories/005-auto-status-transitions.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 11 acceptance criteria ticked |
| `.../stories/006-auto-reject-competing-claims.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | 12 acceptance criteria ticked |

**Verification at close time**, scoped to the bolt's own five suites by owner
direction — **the full suite was not run**: typecheck exit 0 · lint exit 0 ·
**168/168 tests across 5 files** · the bolt's own modules at **100% statements
/ 98.03% branches / 100% functions / 100% lines**. The two uncovered branches
are the transition table's `Unchanged` outcome, **proved unreachable** from
this bolt's two callers (the `Unchanged` outcome exists for `ClaimSubmitted`,
which bolt 013 uses).

**The row lock was proven against the live database, not asserted.** A
temporary probe opened two real transactions: the first took the lock and
paused; the second blocked on `SELECT … FOR UPDATE` and, after the first
committed, read `Claim Approved` — the first's committed move. That is the
fact the whole design rests on, and it is a fact about the database rather
than about a mock. The database's isolation level was confirmed as `read
committed`, under which `SELECT … FOR UPDATE` re-reads the row after the
lock is acquired. The probe was deleted once it had done its job.

**One defect the Stage 5 suite caught — in the test, not the code.** The first
serialisation test **allowed both approvals to land**, because its helper
wrote the Claim unconditionally and made only the report's move conditional
on the observed status. The real service refuses the second administrator
because `decideFoundReportTransition({currentStatus: 'Claim Approved',
cause: 'ClaimApproved'})` returns `Refused`. The helper was rewritten to
consult the transition table exactly as the service does. **No production
code was changed.**

**Three tests failed for the same underlying reason — a read or a cleanup at
the wrong moment.** The unknown-status test read the Claim *after* its
`finally` had reset the row, and the competing-claim test read *after* the
`finally` had deleted the row; both reads were moved inside the `try`.

**One test could not restore its constraint, and left the table unprotected.**
`claims_pending_fields_check` forbids exactly the row the competing-claim
test needed to write, so re-adding the constraint failed on that row — and
three later tests failed because the table was left without it. The row is
now cleared **before** the constraint is restored, and every `DROP CONSTRAINT`
is `IF EXISTS`. The `claims` table's eleven constraints were verified present
after every run.

**The audit catalog was not changed.** Events 3, 4, and 5 already existed with
exact field lists; the payload builders carry exactly what the payload
sanitizer permits, and nothing more.

**Items carried forward** (none blocks the close): the `CHECK` constraints are
invisible to Prisma and are protected by a test rather than by the migration
tooling; this bolt's own database suite drops and restores four constraints at
runtime, and every drop must be paired with a restore that cannot fail on the
row it was testing; the blanket-delete race in the pre-existing infrastructure
suites is still latent; two branches in `claim-decision-service.ts` are
unreachable by proof; the database's time zone must be set to UTC explicitly by
the deployment; and **the full suite has not been run against this bolt** —
advisable before the next bolt that touches the `claims` table or the Found
report machine.

---

## 2026-10-29T19:30:00Z — Bolt `013-claim-submit` closed

**Triggered by**: `/specsmd-master-agent` — owner approval of the Stage 5 checkpoint

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/013-claim-submit/bolt.md` | `planned` | `complete` | All 4 stages complete (model and design skipped by owner direction), all 7 success criteria ticked |
| `memory-bank/bolts/013-claim-submit/ddd-03-test-report.md` | — | created | The Stage 5 artifact |
| `.../units/003-found-side-claims/stories/001-submit-a-claim.md` | `draft` / `implemented: false` | `complete` / `implemented: true` | The story's 13 acceptance criteria ticked, `assigned_bolt` set |

The unit brief for `003-found-side-claims` stays `stories-defined`: its other
two bolts (016-claim-decisions, 023-claim-threads-notifications) remain open.

**Verification re-run at close time** against the working tree, not read from
the test report: typecheck exit 0 · lint exit 0 · **2,166/2,166 tests across
123 files** · production build exit 0 with the new `ƒ /api/claims` route
registered. Global coverage 93.19% statements / 87.79% branches / 94.25%
functions / 93.25% lines; the bolt's own modules at 100% on every metric
except `prisma-claim-repository.ts` (95.23% branches).

**Two real defects the Stage 5 suite caught**, both fixed before the close:

1. **A decided Claim could not be read back.** The repository coerced an
   absent `reason` to `''` and rebuilt it through `createClaimReason('')`, whose
   constructor refuses a string under 20 characters — so reading a Claim
   written by a lifecycle path (a withdrawal's auto-rejection) **threw**.
   `PersistedClaim` now declares `reason` and `identifyingDetails` nullable,
   and the absence is carried through as an explicit `null`. The submission
   path's guarantee is unchanged: `ValidatedClaim` keeps them non-nullable,
   and the `claims_pending_fields_check` constraint requires all three on a
   `Pending` Claim. The audit event now builds from the **validated** Claim
   plus the minted id, because the event describes what was *submitted*.
2. **The submission gate failed open.** It was written as a list of
   refusals, so any report status it did not name — including
   `Verification Pending` and a `null` status — was permitted. It is now a
   **whitelist**: only `Open` and `Claim Requested` accept a claim.

**One regression this bolt's own migration caused**, and the constraint was
kept rather than weakened. The `claims_pending_fields_check` constraint
requires a `Pending` Claim to carry the three submission fields and
`submitted_at`; bolts 008 and 009 wrote bare `Pending` Claims, which were
legal when written and illegal under the new constraint. **12 failures across
three pre-existing suites** were the symptom. The three stale fixtures were
updated to supply the fields, and the constraint was kept — because the
constraint is what makes "a `Pending` Claim carries all three fields" a fact
about the *database* rather than about one call site.

**Items carried forward** (none blocks the close): the `CHECK` constraints are
invisible to Prisma and are protected by a test rather than by the migration
tooling; the blanket-delete race in the pre-existing infrastructure suites is
still latent; `prisma-claim-repository.ts` has one unreachable defensive
branch; the claim-visibility projection's *read* side is exercised by bolt
016's and bolt 014's suites rather than by this one; and the database's time
zone must be set to UTC explicitly by the deployment, since the `date_lost`
bound is evaluated against `CURRENT_DATE`.

---
## 2026-10-23T11:28:55Z — BMAD → SpecsMD AI-DLC migration

**Triggered by**: `/specsmd-master-agent` analyze-context, then migration assessment

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/project.yaml` | created | SpecsMD project config absent; SpecsMD routes uninitialized projects to `project-init` |
| `memory-bank/migration-assessment.md` | created | BMAD→SpecsMD stage map required before any new work |
| `memory-bank/preserved-artifacts.md` | created | Index of reused BMAD work with reuse decisions and UX finalization assessment |
| `memory-bank/intents/001-findback-lost-and-found/requirements.md` | created | SpecsMD-native requirements **index** over the frozen PRD; PRD stays normative |
| `memory-bank/intents/001-findback-lost-and-found/system-context.md` | created | Derived from frozen PRD §1/§2.2/§3; no new product facts |
| `memory-bank/intents/001-findback-lost-and-found/inception-log.md` | created | Inception progress + migration decision log |
| `memory-bank/standards/ux-guide.md` | created | Reuses DESIGN.md + EXPERIENCE.md by pointer instead of duplicating them |

**Artifacts deliberately not modified:** anything under `_bmad-output/` — the frozen
Brief, the frozen PRD, all UX spines, all validation reports, the memlogs, and the
prototype. Git history preserved; the working tree was clean before and after apart
from these new files.

**Blocked pending user input:** `standards/tech-stack.md` (and everything depending
on it: data-stack, coding-standards, system-architecture, unit decomposition). No
technology choice exists anywhere in the repository, and PRD §9 reserves these
decisions for Architecture.

---

## 2026-10-23T12:05:00Z — Project standards authored from owner-approved stack

**Triggered by**: owner supplied constraints at the project-init checkpoint
(npm · Vercel Hobby · Vercel Blob Private · $0 hard ceiling · keep TypeScript,
Next.js App Router, PostgreSQL, Prisma)

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/standards/tech-stack.md` | created | Owner-approved stack with verified free-tier limits and the adaptations they force |
| `memory-bank/standards/image-handling.md` | created | Owner asked for secure image validation, authorization, private access, quota monitoring, and failure handling |
| `memory-bank/standards/data-stack.md` | created | PostgreSQL + Prisma; transaction rules for FR-17 and FR-45 |
| `memory-bank/standards/coding-standards.md` | created | Formatting, linting, naming, structure, testing posture, error handling, logging |
| `memory-bank/standards/system-architecture.md` | created (**draft**) | Architecture structure; awaits owner review |
| `memory-bank/standards/decision-index.md` | created | ADR-1..ADR-4 record the stack, image, persistence, and quota decisions |
| `memory-bank/intents/.../inception-log.md` | updated | Checkpoint 0 complete; decision log and metrics updated |

**Verified against vendor docs (2026-10-23):** Vercel Hobby included usage, Blob
limits (1 GB storage / 10K simple ops / 2K advanced ops / 10 GB transfer), private
storage delivery model and cache guidance, cron daily-only limit, runtime log
1-hour retention, Functions file-descriptor and duration limits, Neon free tier.

**Flagged to owner, not silently resolved:**
1. Vercel Hobby is licensed for **personal, non-commercial use**. FindBack is
   production-intended. This is a licensing constraint on the hosting choice.
2. Blob free tier is **1 GB**, so the PRD's unbounded-image model needs enforced
   quotas. No product change was made; the quota is an operational guard.
3. Hobby runtime logs persist **1 hour**, so the durable audit-read record must be
   written to the database rather than stdout.
4. Hobby cron runs **once per day with ±59 min drift**; scheduled work must be
   idempotent and must not gate any workflow.
5. Vercel Hobby **pauses** a project on limit breach rather than billing — desired
   for a $0 ceiling, pending owner confirmation.

**Artifacts still unmodified:** everything under `_bmad-output/`, including the
frozen Brief, frozen PRD, UX spines, and the prototype.

---

## 2026-10-23T12:58:00Z — Stories authored for all seven units

**Triggered by**: owner approved the unit decomposition and selected option A
(write 004/005 directly, delegate 006/007)

| Artifact | Action | Reason |
|---|---|---|
| `units/001-identity-and-access/stories/*.md` (10) | created | Root unit — `ActorContext`, account lifecycle |
| `units/002-reporting-and-listings/stories/*.md` (13) | created | FR-39 visibility projection is this unit's core |
| `units/003-found-side-claims/stories/*.md` (8) | created | Found-side state machine |
| `units/004-lost-side-recovery/stories/*.md` (8) | created | Lost-side 8-status machine, written directly |
| `units/005-returns-and-handover/stories/*.md` (7) | created | The single Confirm Returned implementation |
| `units/006-audit-and-observability/stories/*.md` (6) | created | Written directly after the delegated attempt failed |
| `units/007-web-surfaces/stories/*.md` (11) | created | Frontend realization of the frozen UX spines |
| `memory-bank/story-index.md` | created | Single-file global index, per `memory-bank.yaml` `story-index.mode` |
| `units/*/unit-brief.md` | Story Summary appended | Required by the `story-create` skill |
| `inception-log.md` | updated | Stories complete; Bolt Plan is next |

**Verification performed (programmatic):** 63 story files; 53 of 53 FRs traced;
zero ownership violations; zero malformed frontmatter; every story traces to at
least one FR either as owner or as realizer.

**Defects found and corrected during this stage:**

1. **Unit 007 claimed 9 FRs it does not own.** The delegated writer put a
   *representative* FR into `traces_to` on frontend stories, which broke the
   no-double-ownership rule established at decomposition. Seven frontend stories
   now carry `traces_to: []` with a new `realizes_fr:` key, so ownership stays
   with the domain unit while the link to what the story implements is preserved.
2. **Unit 006 produced no files.** The delegated worker reported research complete
   but wrote nothing; its directory was empty. The six stories were written
   directly instead.
3. **Three delegated workers for Units 004/005 timed out twice** at 15 minutes
   without producing output. Unit 004 and 005 were then written directly.

**Judgment call recorded for owner review:** `realizes_fr` is a new frontmatter
key introduced in Unit 007. It is not in the SpecsMD story template. It exists
because a frontend unit legitimately implements requirements owned by a backend
unit, and forcing those into `traces_to` would have created duplicate ownership.
If the owner prefers, these can be folded back into `traces_to` with a convention
that only the five genuinely-owned FRs appear there.

**Not claimed:** manual prototype acceptance. It remains deferred and is never
asserted as passed by this workflow.

---

## 2026-10-23T13:18:00Z — Bolt plan authored

**Triggered by**: owner approved the stories stage and selected option A

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/bolts/001-audit-core/bolt.md` | created | Audit substrate first — every unit writes through it |
| `002-audit-reads/`, `003-audit-lost-side-events/` | created | Trail read path; FR-48 event catalog |
| `004-identity-core/`, `005-identity-security/` | created | Account lifecycle; security and profile |
| `006-reporting-visibility/` | created | FR-39 projection before any read path exists |
| `007-reporting-core/`, `008-reporting-lifecycle/`, `009-reporting-search/`, `010-reporting-images/` | created | Report aggregate, lifecycle, search, images |
| `011-lost-status-model/` | created | 8-status machine before anything transitions it |
| `012-web-public/`, `014-web-threads/`, `021-web-admin/`, `022-web-audit-accessibility/` | created | Four frontend bolts |
| `013-claim-submit/`, `016-claim-decisions/`, `023-claim-threads-notifications/` | created | Found-side workflow |
| `015-lost-response-submit/`, `017-lost-lifecycle-determination/`, `018-lost-threads/` | created | Lost-side workflow |
| `019-returns-closeout/`, `020-returns-moderation/` | created | The single Confirm Returned implementation |
| `inception-log.md` | updated | Bolt plan section, waves, ordering rationale |

**Verification performed (programmatic):** 23 bolts; 63 of 63 stories assigned to
exactly one bolt; every bolt's stories belong to its own unit; bolt type matches
the unit's `default_bolt_type`; all required frontmatter present; dependency
references resolve; `enables` links are reciprocal with `requires`; no cycles;
11 execution waves computed.

**Defects found and corrected:**

1. **Two Unit 003 stories had no bolt.** `007-per-claim-message-thread` and
   `008-claim-notification-emails` were omitted. Both derive from claim status,
   so they were placed in a new bolt 023 requiring 016-claim-decisions rather than
   being forced into an existing one.
2. **Two invented bolt IDs.** `020-web-profile` and `013-web-member` were referenced
   as `enables` targets but never created. Removed.
3. **Two broken dependency links.** Bolt 003 enabled 018 without 018 requiring it;
   bolt 018 enabled 021 without 021 requiring it. Both repaired.

**Judgment calls recorded for owner review:**

1. **Bolt 001 is the audit substrate, not identity.** The build starts with a unit
   that depends on nothing, because retrofitting audit after six other units are
   written would mean every state change in the system was built without it.
2. **Bolt 006 (visibility) precedes report creation (bolt 007).** The projection is
   a pure function of actor and report, so it can be built and verified against
   fixtures, and every later read path inherits it.
3. **Bolt 011 (Lost status model) precedes response submission (bolt 015).** The
   8-status machine constrains the four bolts that transition it rather than each
   inventing its own transitions.
4. **Four single-story bolts** (002, 010, 011 paired, 022). Each isolates either a
   privacy boundary, a performance budget, or a cross-cutting property that cannot
   be verified in isolation from its neighbours.

**Not claimed:** no bolt has started. Every story remains `status: draft`, and no
bolt has been executed, tested, or verified.

---

## 2026-10-23T12:35:00Z — Unit decomposition authored

**Triggered by**: owner approved the architecture standard and selected option A
(proceed to unit decomposition)

| Artifact | Action | Reason |
|---|---|---|
| `memory-bank/standards/system-architecture.md` | status → approved | Owner review passed |
| `memory-bank/intents/.../units.md` | created | 7 units; FR→unit mapping; dependency graph |
| `.../units/001-identity-and-access/unit-brief.md` | created | 8 FRs — root unit, produces `ActorContext` |
| `.../units/002-reporting-and-listings/unit-brief.md` | created | 16 FRs — owns the FR-39 visibility projection |
| `.../units/003-found-side-claims/unit-brief.md` | created | 8 FRs — Found-side state machine |
| `.../units/004-lost-side-recovery/unit-brief.md` | created | 7 FRs — Lost-side state machine, deliberately separate |
| `.../units/005-returns-and-handover/unit-brief.md` | created | 7 FRs — the single Confirm Returned implementation |
| `.../units/006-audit-and-observability/unit-brief.md` | created | 2 FRs — depends on nothing; all units write to it |
| `.../units/007-web-surfaces/unit-brief.md` | created | 5 owned FRs; realizes all remaining user-facing FRs |
| `.../inception-log.md` | updated | Checkpoint 0 complete; unit breakdown recorded |

**Verification performed:** FR coverage checked programmatically — 53 of 53 FRs
assigned, no gaps, no duplicates, and the per-unit summary lists were corrected to
match the mapping table (four discrepancies found and fixed: FR-5 duplicated in
Unit 1, FR-50 misplaced between Units 4 and 7, FR-45 and FR-50 missing from the
Unit 5 and Unit 7 summaries, and dependency lines referencing non-existent units
`007`/`008`).

**Judgment calls recorded for owner review:**
1. **FR-45 split across Units 4 and 5** — Unit 4 owns the verification *determination*;
   Unit 5 owns the *return*. Confirm Returned must have exactly one implementation.
2. **Unit 7 owns only 5 FRs** but realizes every user-facing FR. Requirements are
   owned by their domain unit; the frontend renders them. No FR has two owners.
3. **Units are not independently deployable.** They are one modular monolith, a
   deliberate consequence of the $0 Vercel Hobby constraint. They remain
   independently buildable and testable.
4. **Unit 6 is built early** even though it depends on nothing, because every other
   unit writes through it — retrofitting audit afterwards would mean every state
   change in the system was built without it.

---

## 2026-10-28T14:45:00Z — Bolt `004-identity-core` closed

**Triggered by**: `/specsmd-master-agent` — owner approval of the Stage 5 checkpoint

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| `memory-bank/bolts/004-identity-core/bolt.md` | `in-progress` | `complete` | All 5 stages complete, all 7 success criteria ticked, all 6 stories `implemented` |
| `.../units/001-identity-and-access/unit-brief.md` | `ready` | `in-progress` | Unit has a bolt in progress (`005-identity-security`) |
| `.../units/006-audit-and-observability/unit-brief.md` | `ready` | `complete` | All 3 of its bolts (001, 002, 003) are complete and all 6 of its stories are `implemented` — a pre-existing inconsistency surfaced by this close |

**Verification re-run at close time** against the working tree, not read from the
test report: typecheck exit 0 · lint exit 0 · **605/605 tests across 47 files** ·
production build exit 0 with all six identity routes registered.

**The suite is 605 rather than the report's 604** because of the `rejectAccount()`
defect fixed during bolt `005`'s Stage 1 (`deactivatedAt` was set on a
*rejected* account). The fix landed before this bolt closed, so the closed bolt
contains no known defect.

**Items carried forward** (none blocks the close): the story 003 criterion 2 /
PRD FR-4 conflict remains the owner's to amend; ADR-16's deferred-failure refresh
branch is untested and belongs to bolt `005`; the Vercel runtime must be set to
Node 24 (ADR-12) and cannot be set from the repository. Two owner follow-ups
remain owed in `system-architecture.md` (FR-27 module map, per ADR-14) and the
unit brief's Integration Points row (per ADR-15).

---
## 2026-10-28T08:49:36.396Z - Status Sync

**Triggered by**: status-integrity script

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/001-append-only-audit-writes.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/003-non-numbered-audit-records.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/004-append-only-enforcement.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/006-operational-logging-and-quota.md | implemented | complete, implemented: true | Bolt 001-audit-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/005-audit-visibility-and-read-logging.md | implemented | complete, implemented: true | Bolt 002-audit-reads is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/006-audit-and-observability/stories/002-lost-side-audit-events.md | implemented | complete, implemented: true | Bolt 003-audit-lost-side-events is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/001-self-registration.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/002-administrator-review-of-registrations.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/003-login-with-active-account.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/005-logout-revokes-session.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/006-pending-member-restricted-access.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/007-owner-rejects-registration.md | implemented | complete, implemented: true | Bolt 004-identity-core is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/002-reporting-and-listings/unit-brief.md | ready | stories-defined | Unit has 5 bolts (0/5 complete) |
| intents/001-findback-lost-and-found/units/003-found-side-claims/unit-brief.md | ready | stories-defined | Unit has 3 bolts (0/3 complete) |
| intents/001-findback-lost-and-found/units/004-lost-side-recovery/unit-brief.md | ready | stories-defined | Unit has 4 bolts (0/4 complete) |
| intents/001-findback-lost-and-found/units/005-returns-and-handover/unit-brief.md | ready | stories-defined | Unit has 2 bolts (0/2 complete) |
| intents/001-findback-lost-and-found/units/007-web-surfaces/unit-brief.md | ready | stories-defined | Unit has 4 bolts (0/4 complete) |
| intents/001-findback-lost-and-found/requirements.md | inception-complete | construction | Intent has 7 units (1/7 complete) |

---
## 2026-10-28T17:35:00Z - Status Sync

**Triggered by**: analyze-context integrity check

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/004-deactivate-an-account.md | draft | complete, implemented: true | Bolt 005-identity-security is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/008-reset-request-never-discloses-account.md | draft | complete, implemented: true | Bolt 005-identity-security is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/009-reset-password.md | draft | complete, implemented: true | Bolt 005-identity-security is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/stories/010-update-member-profile.md | draft | complete, implemented: true | Bolt 005-identity-security is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/001-identity-and-access/unit-brief.md | in-progress | complete | Unit has 2 bolts (2/2 complete) |

**Not changed, deliberately.** `intents/001-findback-lost-and-found/requirements.md`
remains `construction`: the intent has 7 units and 2 are complete, so the
cascade is unchanged. The unit briefs' **Story Summary checklists** were also
left as they are — they are inception-era artifacts that still read `- [ ] …
Planned` for unit `006-audit-and-observability`, which has been complete since
2026-10-27. The checklists are unmaintained across every completed unit, and
updating only unit `001`'s would establish an inconsistency of its own.

---

## 2026-10-29T07:35:09.011Z - Status Sync

**Triggered by**: status-integrity script

| Artifact | Old Status | New Status | Reason |
|----------|------------|------------|--------|
| intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/004-edit-own-report.md | draft (not implemented) | complete, implemented: true | Bolt 008-reporting-lifecycle is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/005-delete-own-report.md | draft (not implemented) | complete, implemented: true | Bolt 008-reporting-lifecycle is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/006-withdraw-own-report.md | draft (not implemented) | complete, implemented: true | Bolt 008-reporting-lifecycle is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/002-reporting-and-listings/stories/012-administrator-edit-report.md | draft (not implemented) | complete, implemented: true | Bolt 008-reporting-lifecycle is complete but story is not marked complete |
| intents/001-findback-lost-and-found/units/002-reporting-and-listings/unit-brief.md | in-progress | stories-defined | Unit has 5 bolts (3/5 complete) |

---

## 2026-10-30T13:35:00Z - Bolt 009-reporting-search closed

**Triggered by**: bolt closeout

Bolt `009-reporting-search` is complete. Its four stories — `007-public-summary-listing`,
`008-authenticated-detail-view`, `009-search-and-filter`, and
`011-member-facing-view-partition` — are marked `status: complete`,
`implemented: true`, `assigned_bolt: 009-reporting-search`, with their
acceptance criteria ticked. The bolt's own note
(`memory-bank/bolts/009-reporting-search/bolt.md`) records `status: complete`,
`stages_completed: [implement, test]`, stages 1 and 2 skipped by owner
direction, and all six success criteria met. The Stage 5 artifact is
`memory-bank/bolts/009-reporting-search/ddd-03-test-report.md`.

**Three production defects were found by this bolt's tests and fixed in place.**

1. **The keyword was a whole-word match, not FR-14's partial match.** The
   reader used `plainto_tsquery`, which requires whole-token matches, so a
   member searching for `walle` found nothing for `A blue wallet`. The
   requirement says *"case-insensitive, partial match"*, and the PRD is
   normative over the stories. The repair is a `pg_trgm` GIN index over `name`
   and `description`, with the predicate rewritten to `ILIKE '%…%'` on a bound,
   escaped pattern — the correct semantics *and* an index-backed plan. The
   naive repair (`ILIKE` without `pg_trgm`) has the right semantics and the
   wrong plan: a leading-wildcard `ILIKE` with no trigram index is a
   sequential scan, which FR-14 forbids outright. Migration
   `20261030140000_reporting_partial_keyword_match` enables the extension and
   creates `idx_reports_name_trgm` and `idx_reports_description_trgm`.
2. **The participation partitions did not exclude the member's own reports.**
   FR-49 requires the `claims` and `recovery_responses` views to hold
   participations on *other members'* reports, and `browse` to exclude the
   member's own. The domain had reasoned the exclusion was belt-and-braces; the
   query did not enforce it. The exclusion is now a `WHERE` predicate, not a
   filter applied after loading.
3. **The participation rows carried `threadId = null`**, so a member could not
   reach their thread from the list. A thread has no entity of its own — the id
   *is* the Claim's or Response's id, since `/api/claims/[id]/thread` addresses
   it that way — and the `thread_messages` table now exists (Bolt 23).

**Two brittle assertions were repaired, and proved real.** The
`idx_reports_search` plan assertions in the reader and performance suites
carried an `ORDER BY date` and a status filter, which gave the planner a
*better* index-backed plan than the search index and proved nothing about it.
Both were reduced to the keyword predicate alone. The repaired assertion was
proved load-bearing by dropping `idx_reports_search` and observing the plan
degrade to `Seq Scan on reports r` — with sequential scans disabled the query
then fails outright. The index was restored afterwards.

**Verification.** 183 tests across 11 suites pass; `tsc --noEmit` exits 0;
`eslint` exits 0 on every changed file; scoped coverage is 98.27% statements /
89.13% branches / 100% functions / 98.25% lines. The two uncovered lines are
defensive guards that are now unreachable.

**Performance, against 10,000 seeded reports.** Keyword search p95 **13.8 ms**
(median 11.6 ms, worst 16.4 ms) against FR-14's 500 ms budget; unfiltered public
listing 2.3 ms; browse partition 3.0 ms; category-filtered listing 2.4 ms. The
index-backed partial match cost nothing against the budget.

---

## 2026-10-30T08:00:00Z - Bolt 015-lost-response-submit closed

**Triggered by**: bolt closeout

Bolt `015-lost-response-submit` is complete. Its story `001-submit-a-recovery-response`
is marked `status: complete`, `implemented: true`,
`assigned_bolt: 015-lost-response-submit`, with all eight acceptance criteria
ticked. The bolt's own note (`memory-bank/bolts/015-lost-response-submit/bolt.md`)
records `status: complete`, `stages_completed: [implement, test]`, stages 1 and 2
skipped by owner direction, and all seven success criteria met. The Stage 5
artifact is `memory-bank/bolts/015-lost-response-submit/ddd-03-test-report.md`.

**The rule FR-40 actually states is "one *active* response per responder per
Lost report",** and the word *active* carries the design. A responder whose
response was `Not a Match` may respond again — the PRD allows a second attempt,
and the old response stays as history — so the constraint is not "one response
ever". That is exactly what the bolt's **partial unique index** expresses:

```sql
CREATE UNIQUE INDEX "uq_recovery_responses_one_live_per_report_per_responder"
    ON "recovery_responses" ("report_id", "responder_id")
    WHERE "status" IN ('Submitted', 'Selected for Verification', 'Match Confirmed');
```

**The constrained set is the domain's non-terminal set,** so the index and the
domain cannot disagree about which statuses are live. **`Match Confirmed` is
inside that set**, because FR-41 makes it non-terminal — the report stays
`Verification Pending` until an administrator confirms the hand-off, so the
responder holding it still holds the slot. **The constraint is the rule; the
application check is the explanation.** The service reads first and writes
second, so two racing requests could both pass its check; the index cannot race.

**The migration `20261030160000_recovery_response_submission_constraints` adds the
`campus_area` column FR-44 requires, four CHECK constraints on the submitted
fields, the partial unique index, and its supporting index.** The `campus_area`
column **deliberately carries no foreign key** — the campus-area set is
*injected* per-deployment (ADR-20), so a foreign key would make the schema
deployment-specific; membership is a *validation* rule, and on read the stored
text is passed through as `{ value }` without re-validating against the
deployment's list.

**Two production defects were found by this bolt's tests and fixed in place.**

1. **The read path could not read a lifecycle-written Response.** The row's
   fields were rebuilt through the *constructors*, which reject an empty
   string — so a Response written by a lifecycle path (a report's closure
   resolving its responses), whose columns are `NULL`, **could not be read back
   at all**: the read threw `ValidationError: Describe the identifying details
   you noticed.` The fix **separates the two shapes** — the *validated* shape is
   non-nullable (a submission always has its fields) and the *persisted* shape
   is nullable (a lifecycle-written row genuinely has none), with the read
   rebuilding through the constructors only when the column is present. This
   mirrors the Claim repository's existing `reason: ClaimReason | null` pattern,
   so the codebase now has one shape for the same idea on both sides.
2. **The route wrote its own timestamp.** It answered
   `submittedAt: new Date().toISOString()` — a *second* reading of the clock,
   taken after the row was written, which could differ from the persisted
   timestamp the client was told about. `SubmitRecoveryResponseResult` now
   carries a `submittedAt: Date`, and the service returns the validated
   Response's own timestamp — the value actually written to the row.

**The blast radius was measured, and it found a third defect — a real one.**
Bolt 015's migration touches only the `recovery_responses` table and never
mentions `claims`, yet the broader listings layer had **15 failures**. The
three causes were distinct. Two were **other bolts' drift**: bolt `016`'s
`claims_decision_fields_check` refused decided Claims written without
`decided_at` by four Claim-side suites, and bolt `014`'s `thread_messages`
table had made a suite's assertion that it *did not exist* false. Both were
repaired in the suites that carried them — a test that asserts a transient
state of the schema will fail the moment the next bolt lands. The third was
**this bolt's own code**: `PrismaReportInteractionResolver.rejectPendingClaims`
wrote a `Rejected` Claim without `decided_at`, so **every withdrawal of a Found
report with a Pending Claim would have failed against the current schema.** The
fix follows the pattern bolt `016`'s own decision repository established — the
`UPDATE` writes `decided_at` alongside the status — and the decider stays null,
because a withdrawal's auto-rejection was caused by a *member* and has no
administrator to name.

**One fixture was rewritten rather than a constraint weakened.** The
interactions suite wanted two live Responses on one report from the *same*
responder, which the partial unique index correctly refused, because both
statuses are live and one responder may hold one live response per report. The
suite was rewritten to give the second response to a **second responder**,
which is what two real members would be. The constraint was right and the
fixture was wrong.

**Verification.** 152 tests across 6 suites pass; `tsc --noEmit` exits 0;
`eslint` exits 0 on every changed file; scoped coverage is 93.61% statements /
83.14% branches / 92.85% functions / 93.61% lines against the project's 80%
floor. The route layer is excluded from coverage by `vitest.config.ts`
(`src/app/**`) and is verified by its own 30-test suite. The broader listings
layer — `src/infrastructure/listings`, `src/application/listings`,
`src/domain/listings` — is **1311 passing across 62 files**. The full suite was
not run, by owner direction.

---

---

## 2026-10-30T09:00:00Z - Bolt 017-lost-lifecycle-determination closed

**Triggered by**: bolt closeout

Bolt `017-lost-lifecycle-determination` is complete. Its three stories —
`003-owner-provisional-selection`, `004-owner-determination-admin-records`, and
`005-lost-report-lifecycle` — are marked `status: complete`, `implemented: true`,
`assigned_bolt: 017-lost-lifecycle-determination`. The bolt's own note
(`memory-bank/bolts/017-lost-lifecycle-determination/bolt.md`) records
`status: complete`, `stages_completed: [implement, test]`, stages 1 and 2 skipped
by owner direction, and all eight success criteria met. The Stage 5 artifact is
`memory-bank/bolts/017-lost-lifecycle-determination/ddd-03-test-report.md`.

**One story criterion was deliberately not implemented, and it is recorded as
such rather than quietly ticked.** Story `003` says that selecting a different
response "reverts the previous selection to `Submitted`". FR-43 permits a new
selection only after a `Not a Match`. The PRD wins over the story: the previous
selection keeps its `Not a Match` status and the report returns to `Open` so a
new candidate may be selected. The criterion is left unticked with the reason
written beside it, and the bolt's note repeats the decision.

**The atomic-selection rule was enforced at the data layer, because the
application check alone could not enforce it.** The migration
`20261030180000_recovery_response_selection_constraints` adds the partial unique
index `uq_recovery_responses_one_selected_per_report`, scoped to exactly the one
status `Selected for Verification`. The scope matters: a plain unique index on
`report_id` would forbid the siblings the PRD allows, and one scoped to the whole
live set would forbid the second `Submitted` response. The application's check is
the *explanation* of the rule; the index is the rule. The driver's `P2002` is
translated into `ConcurrentSelectionError`, so a race between two owners is a
business outcome and not a 500.

**The two actors are kept apart at every layer, and the separation is
structural rather than conventional.** The route resolves the *recorder* from the
session and reads the *maker* from the body, so a client can never assert its own
role; the service compares the maker against the report's owner read from the
database, so a forged maker is refused at the boundary that owns the truth; and
the event carries the two in two separate columns, `determinedByUserId` and
`recordedByAdministratorId`.

**`Match Confirmed` non-terminality was made structural rather than merely
asserted.** The report's status is written *only* on the `not_a_match` path, so a
future edit cannot accidentally move the report on a confirmed match. It is
proven three ways: the domain transition table (whose `MatchConfirmed` cause is
`Unchanged`, not `Moved`), the service's exact call sequence (which contains no
report write on the confirmed path), and the live-database adapter suite.

**The migration deliberately does not re-declare two things that already exist,
and says so in its own header.** Bolt `007` already created
`reports_status_check` with the full six-status vocabulary, so re-declaring it
would have failed with `42710`. And the `audit_events` table predates the
snake_case convention — bolt `001` created it with camelCase columns and bolt
`007` renamed only the *tables* — so `determined_by_user_id` and
`recorded_by_administrator_id` would have been duplicate columns. The migration
therefore creates only the two *indexes* against the camelCase columns.

**One fixture was rewritten rather than a constraint weakened.** The selection
suite wanted two live responses on one report from the *same* responder, which
bolt `015`'s partial unique index correctly refused, and a later fixture left a
second response holding the selection slot. Both were repaired by giving the
responses to distinct responders and by running the test on its own report. The
constraints were right and the fixtures were wrong.

**Verification.** 251 tests across 16 suites pass; `tsc --noEmit` exits 0;
eslint exits 0 on every changed file; scoped coverage is 97.4% statements /
89.1% branches / 97.4% functions against the project's 80% floor. The route
layer is excluded from coverage by `vitest.config.ts` (`src/app/**`) and is
verified by its own 25-test suite. The wider listings layer —
`src/infrastructure/listings`, `src/application/listings`, `src/domain/recovery` —
is **994 passing across 55 files**, 0 fail, against a database rebuilt from the
corrected migration. The full suite was not run, by owner direction.

**The closeout found three type errors that the green suites had hidden.**
Vitest transpiles without checking, so a suite can pass and still not compile:
`tsc --noEmit` is a separate gate, and it was the gate that found them. Two
were a duplicate `events` identifier in the two service suites' harnesses —
each harness declared both an `events` array for the generic audit writer and
an `events` object for the Lost-side event factory, and neither was read by any
assertion; the factory is now `lostEvents` and the array keeps `events`. The
third was a test reading `reportStatus` off an unnarrowed union, relying on a
short-circuit expression to narrow a value that a second call had already
replaced; the test now binds the decision once and narrows on `decision.kind`.
None was in the bolt's production code, and no assertion was weakened.

---

## 2026-10-30T09:15:00Z - Bolt 018-lost-threads closed

**Triggered by**: bolt closeout

Bolt `018-lost-threads` is complete. Its three stories —
`006-per-recovery-response-thread`, `007-responder-withdraws-response`, and
`008-recovery-response-audit-events` — are marked `status: complete`,
`implemented: true`, `assigned_bolt: 018-lost-threads`. The bolt's note
(`memory-bank/bolts/018-lost-threads/bolt.md`) records `status: complete`,
`stages_completed: [implement, test]`, stages 1 and 2 skipped by owner direction,
and all seven success criteria met. The Stage 5 artifact is
`memory-bank/bolts/018-lost-threads/ddd-03-test-report.md`.

**The bolt's real scope was three stories, not the two its plan named.** Story
`007` (the responder's withdrawal) had been marked `complete` under bolt `011`,
but bolt `011` delivered only the *domain's decision* — the use case, the
adapter, and the route did not exist, and FR-48's event 20 was never fired. This
bolt closed that gap; the story was reassigned here and the reason recorded
beside it rather than left to be discovered again.

**The isolation is structural in three independent places at once.** The
thread's subject carries **no field** for the responder's where-found, observed
identifying details, or date found, so participation cannot leak private
evidence. The participation rule is derived from **that one Response's**
participants only, so the decision function has no input that could name a
competing responder. And the reader filters on the `(parent_type, parent_id)`
pair, with the database's own CHECK constraint refusing a `recovery_response`
parent that names a Claim — so the server refuses what the interface would
merely hide.

**A missing Response is refused with the generic 403, never a 404.** The
Response's existence is a private fact about another member's assertion, and a
404 would answer the very question the isolation exists to keep private. This
is a deliberate departure from the Found-side Claim thread, which answers a
missing Claim with a 404; the two sides keep their own conventions.

**The withdrawal's narrowness is a fact, not a rule.** The write is a conditional
`UPDATE` matching only a response still `Submitted`, so a response selected
between the read and the write is not withdrawn, the write lands nothing, and
**no audit event is recorded for a withdrawal that did not happen**. The
withdrawal service holds no report port at all, so there is no code path that
could reach the report — the report's untouchedness is structural rather than
asserted.

**The two sides share no vocabulary.** The Lost side's writability whitelist is
the Lost side's own (`Open`, `Verification Pending`), the rate-limit bucket is
the Lost side's own (`recovery-response-thread:member:<id>`), and neither module
imports the other.

**No migration was needed.** The `thread_messages` table's constraints already
anticipated the `recovery_response` parent kind; the schema had been written for
this bolt, and it only had to write the rows the schema was waiting for.

**Verification.** 171 tests across 7 suites pass; `tsc --noEmit` exits 0;
eslint exits 0 on every changed file; scoped coverage is 100% statements /
96.92% branches / 100% functions / 100% lines against the project's 80% floor.
The route layer is excluded from coverage by `vitest.config.ts` (`src/app/**`)
and is verified by its own three route suites. The full suite was not run, by
owner direction.

**Two tests had to be rewritten rather than a rule weakened.** The domain test
that asserted a validation message's *shape* contradicted the next test that
asserted the opposite, so the assertion was changed to check that the *value* is
never in the message rather than the message's wording. And a `GET`-with-a-body
route test was meaningless as written — the runtime rejects a body on `GET`
before the handler runs — so it was replaced by one that takes the response id
from the path and not from the report id. No rule was weakened in either
rewrite.

## 2026-10-30T09:45:00Z - Bolt 019-returns-closeout closed

**What was delivered.** The single Confirm Returned implementation, shared by
both recovery directions: the domain's rules in `src/domain/returns/`, the
`ReturnConfirmationService` and its two ports in `src/application/listings/`,
the Prisma adapters in `src/infrastructure/listings/`, the
`return_confirmations` table and its migration, and the thin admin route at
`src/app/api/admin/reports/[id]/confirm-returned/`.

**The module the standards reserved and the codebase did not have.**
`memory-bank/standards/system-architecture.md` § Module map names `returns/` for
FR-23..FR-25, and that directory did not exist until this bolt. So the unit
brief's "there must be exactly **one** Confirm Returned implementation, not one
per side" is now **structural** rather than conventional: there is no
`found-returns/` and no `lost-returns/` for the two directions to drift apart
*into*, and the report's **type is an input** to the decision rather than a
branch point in the call graph. The suites drive both directions through the
*same* functions — a suite split into two near-identical halves would prove
that two implementations exist, which is exactly what the story forbids.

**The precondition table is keyed by report type and total over the two.** A
Found report requires `Claim Approved` (FR-23); a Lost report requires
`Verification Pending` (FR-45). A single list of acceptable statuses would let
a Found report be confirmed from the Lost side's precondition — a state that
cannot exist for it — so a type outside the table is refused rather than
defaulted. **The adapter imports the table from the domain** rather than
restating it, so the conditional `UPDATE`'s `WHERE` clause and the domain's
rule cannot disagree.

**The default receiver is derived, never chosen.** Found → the claimant on the
*approved* Claim; Lost → the Lost-report owner. The approved claimant is
resolved in the reader's **query**, so a report whose only Claim is `Pending`
reads as having no approved claimant — which is the truth. **A Found report
with no approved Claim cannot be confirmed at all, even with a substitute**,
because the authorization of a substitution is the default receiver's consent
and without the default receiver there is nobody whose consent could be
recorded. The client never names the receiver: the route's body has no field
through which one could be asserted, and the request handed to the use case
carries exactly the keys `actor`, `reportId`, and `substitute`.

**FR-25's guard is enforced three times over, and each would hold alone.** The
domain refuses a receiverless confirmation before anything is written, so an
API caller cannot bypass it. `default_receiver_account_id` is **`NOT NULL`**,
so the receiverless state is *unrepresentable* even for a path that bypassed
the domain entirely — which is what makes the guard structural rather than
procedural. And the `return_confirmations_receiver_present_check` constraint
requires the substitute's three fields to be present together or absent
together, so a partial handover record cannot be written either.

**The concurrency rule is a fact, not a rule.** The domain's read-and-refuse
check is advisory; the adapter's conditional `UPDATE` carries the precondition
in its `WHERE` clause, so the second of two concurrent administrators' writes
matches no rows, the write lands nothing, and the conflict is the outcome. The
unique index `uq_return_confirmations_report_id` is the second line of defence
against the same race. **A confirmation that did not happen gets no audit
event** — the event is written after the move, inside the same transaction, and
the trail is append-only, so an event for it would be a permanent falsehood.

**The report's move, the confirmation row, and the audit event are one act.**
The report is read *outside* the transaction, so a refusal costs no
transaction; the move and the event are written *inside* it, so they commit
together. A report that is `Returned` with no confirmation row would leave the
item marked recovered with nobody answerable for it — the exact state FR-25
exists to prevent.

**The event catalog was not extended.** Events 6, 7, 21, and 22 already
existed and are frozen; this bolt adds no event and no event number. The
four-way mapping — direction × receiver kind — lives in one function. **The
Found side has no event factory of its own**, so the event *builder* lives in
the domain and the Found-side events are written through the `AuditWriter`
directly. The relationship is a whitelist, and the database's CHECK constraint
holds the same five values — the constraint's definition is read out of
`pg_constraint` and compared against the domain's own, so a value added on one
side without the other is a failure rather than a quiet divergence.

**Verification.** 158 tests across 4 suites pass; `tsc --noEmit` exits 0;
eslint exits 0 on every changed file; scoped coverage is 100% statements /
100% branches / 100% functions / 100% lines against the project's 80% floor.
The route layer is excluded from coverage by `vitest.config.ts` (`src/app/**`)
and is verified by its own 23-test suite. The full suite was not run, by owner
direction.

**Three coverage gaps were closed with real tests.** The domain's two
unknown-report-type refusals were untested. And the service's own decision
guard is **structurally unreachable** through the real domain — an unreachable
guard is an untested guard — so the service suite mocks the domain's assertion
to return a decision the real domain cannot produce, and asserts that the
service refuses it and writes nothing. The mock is cleared in an `afterEach`
so it cannot leak into any other test.

**One owner item.** `src/domain/listings/report-relationship.ts` erases
`isReportType`'s value by re-exporting it with `export type`, so the Prisma
subject reader imports the value from `@/domain/listings/report-type` directly,
with a comment explaining why. The existing file's export shape was
deliberately left alone so its dependents keep working — but the barrel cannot
be the home of the value while it says `export type`, and a future edit should
fix it.

**The Lost-side closeout is a separate bolt.** Unit 005's rule 3 — that a Lost
`Returned` resolves every Recovery Response and locks every thread in the same
transaction — belongs to story `004` and bolt `020`. This bolt confirms the
transition and records the receiver; it does not resolve the Lost side's
responses, and the unit's rule 3 is recorded as not yet satisfied rather than
left implicit.


## 2026-10-30T16:30:00Z - Bolt 020-returns-moderation closed

**What was delivered.** Four terminal transitions, across the four layers: the
closeout's plan and the closure's route in `src/domain/recovery/`, the
removal's decision in `src/domain/moderation/`, the five Lost-side events and
their gates in `src/domain/notifications/`; the three use cases and their
ports in `src/application/listings/`, the dispatcher and the email builders in
`src/application/notifications/`; the Prisma adapters in
`src/infrastructure/listings/`; the `content_removals` table and its migration
`20261030220000_content_removals`; and the two thin admin routes at
`src/app/api/admin/reports/[id]/close-lost/` and `.../remove-content/`.

**The closeout is one transaction, and the atomicity is a fact rather than a
promise.** The report's move, the matched response's completion, every other
response's resolution, and both audit events are written inside one
transaction. The live-database suite proves the rollback the hard way: it
moves the matched response out from under the closeout, so the adapter's guard
fires *inside* the transaction — and the report is still `Verification
Pending` afterwards. **The batch's set is the statement's `RETURNING` set
(ADR-10)**, not a read followed by a write, so the set that was resolved and
the set that is reported are the same set by construction.

**Event 8 would never have fired — a real defect, found and fixed.** The
closeout's `notify()` read the matched response's status from the subject —
the object read *before* the write, which carries `Match Confirmed` — while
event 8's gate requires `Completed — Report Returned` **and** report
`Returned`. **The successful-recovery email was silently never sent.** The
module's own doc comment had already stated the intent ("the matched
response's status is read from what the write produced, not from what the plan
hoped for") and the code did not honour it. The fix threads the post-write
status out of `write()` and into the gate, and the suite now pins it. A
**second finding** was dead code with a contradicting comment: the close
service's `if (eventId === '')` fallback could never fire, and the comment
above it described the opposite behaviour. The branch was removed and the
result now returns the batch event's (event 27's) id unconditionally.

**The two closure routes are decided by the responses, never by the client.**
`Verification Pending` covers both the pre- and post-determination phases, so
the report's status cannot tell the routes apart — the matched response's
status can. The close-lost route passes **no route flag**, so a client cannot
choose whether its close is "ordinary" and cannot choose which audit event (24
or 25) its report receives. The request handed to the use case is asserted to
have exactly the keys `actor`, `reason`, and `reportId`.

**No closure email is possible, not merely absent.** The close service takes
**no `EmailSender` at all** — the suite asserts the constructor's arity — so a
future edit that wanted to add one would have to change the constructor before
it could. FR-30's "no closure email to responders or claimants" is enforced by
the shape of the code rather than by care.

**A removal withholds the content; it never deletes it.** The trail is
append-only with no correction path (ADR-6), so a removal that physically
deleted the content would leave the audit record naming something that no
longer exists, and the trail would be describing a fact it could no longer
verify. The removal is a **row** — `content_removals` — plus a marker on the
content's own row, and the live-database suite asserts the content survives
the mark (`image_ref` and the thread message's `body` are both still there).
The removal's row is inserted **before** the content is marked, so the unique
constraint on the target refuses a duplicate *before* the content is touched
and the duplicate's error rolls the transaction back with the content's mark.

**A removal is not a closure, and the routes keep them apart.** The
remove-content route carries no closure request — the request handed to the
use case is asserted to have exactly the keys `actor`, `reason`, `reportId`,
and `target` — and the report's status is never written by a removal, because
FR-36 says so explicitly. The live-database suite asserts the report is still
`Open` after a removal.

**The catalogue was not extended.** Events 4–8 and 24–27 and 30 already
existed and are frozen. The removal's trail event is
`content.removed_by_administrator`, which is **non-numbered** — a record
FR-36 requires that the frozen catalogue does not number. Events 4 and 6 are
**refused** by this bolt's dispatcher, because they belong to the Recovery
Response workflow's own senders (ADR-14).

**The refusals are checked in an order, and the order is asserted.** Both
routes refuse in a fixed order — actor, CSRF, body, use case — and the suites
assert the order by making the earlier check fail and observing that the later
one never runs. A caller who is not an administrator learns nothing about the
request's validity, not even whether their CSRF token was good.

**Verification.** 242 tests across 12 suites pass; `tsc --noEmit` exits 0;
eslint exits 0 on every changed file; scoped coverage is 100% statements /
100% branches / 100% functions / 100% lines against the project's 80% floor.
The route layer is excluded from coverage by `vitest.config.ts` (`src/app/**`)
and is verified by its own 46-test suite. The full suite was not run, by owner
direction.

**Every coverage gap was closed with a real test, or by removing dead code —
never by weakening an assertion.** The two structurally unreachable guards (the
close service's `prior === undefined` and its `StatusNotApplicable` arm) are
exercised by **mocking the domain's `decideLostClosure`** to return a decision
the real domain cannot produce; the mock is cleared in an `afterEach` so it
cannot leak into another test. The reader's unknown-status guard drops the
database's own CHECK constraint for one statement and restores it in a
`finally` — **restoring the row's status before re-adding the constraint**,
because the constraint cannot be re-added while a row violates it, and the
drop is made conditional so an interrupted run cannot leave the table
unprotected.

**Three owner items.** The **Items Awaiting Return queue** and the
**confirm-returned form** (story 004's last two criteria) belong to Unit 007
and bolt `021`. The **Found-side closure's auto-rejection of pending Claims**
and the **FR-29 claim-rejection email** (story 005) are the Found-side path
and belong to Unit 003; this bolt delivers the Lost-side closure. And the
member-facing readers do not yet consult the `*_withheld` columns, so the
removed content is marked but not yet filtered out at the surfaces that serve
it — that filtering belongs to bolts `021`/`022`, and this bolt delivers the
marker they will read.
