---
id: 005-identity-security
unit: 001-identity-and-access
intent: 001-findback-lost-and-found
type: ddd-construction-bolt
status: complete
stories:
  - 004-deactivate-an-account
  - 008-reset-request-never-discloses-account
  - 009-reset-password
  - 010-update-member-profile
created: 2026-10-23T13:07:00Z
started: 2026-10-28T07:30:00Z
completed: 2026-10-28T17:05:00Z
current_stage: complete
stages_completed:
  - name: model
    completed: 2026-10-28T07:30:00Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-28T15:20:00Z
    artifact: ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-28T15:45:00Z
    artifact: adr-17-reset-token-lifetime.md, adr-18-reset-timing-equalisation.md, adr-19-keyed-rate-limit-bucket-key.md
  - name: implement
    completed: 2026-10-28T16:05:00Z
    artifact: source
  - name: test
    completed: 2026-10-28T17:05:00Z
    artifact: ddd-03-test-report.md

requires_bolts:
  - 001-audit-core
  - 004-identity-core
enables_bolts: []
requires_units: []
blocks: false

complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

# Bolt: 005-identity-security

## Overview

Account management where the risk is disclosure rather than correctness.

## Objective

Deliver deactivation with session revocation, anti-enumeration password reset,
and the tightly-bounded member profile editor.

## Stories Included

- **004-deactivate-an-account**: revoke every session, preserve all history (Must)
- **008-reset-request-never-discloses-account**: neutral response in body, timing, and screen state (Must)
- **009-reset-password**: single-use token, never changes lifecycle status (Must)
- **010-update-member-profile**: exactly display name and self-declared role (Must)

## Bolt Type

**Type**: ddd-construction-bolt
**Definition**: `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`

## Stages

- [x] **1. model**: ✅ 2026-10-28 → `ddd-01-domain-model.md`
- [x] **2. design**: ✅ 2026-10-28 → `ddd-02-technical-design.md`
- [x] **3. adr**: ✅ 2026-10-28 → `adr-17-reset-token-lifetime.md`, `adr-18-reset-timing-equalisation.md`, `adr-19-keyed-rate-limit-bucket-key.md`
- [x] **4. implement**: ✅ 2026-10-28 → source
- [x] **5. test**: ✅ 2026-10-28 → `ddd-03-test-report.md`

> Stage list corrected 2026-10-28 to the 5 stages defined by
> `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`,
> matching bolts `001-audit-core` through `004-identity-core`. The original
> 4-item list omitted the optional ADR Analysis stage.

> **Stage 1 (Domain Model) is complete.** The artifact is
> `ddd-01-domain-model.md`. It extends bolt `004`'s `accounts/` module rather
> than creating a second one, and fills the `PasswordResetToken` seam bolt
> `004` left open on purpose.
>
> **Two conflicts and two open items are raised for the owner:**
>
> 1. **Conflict 1 — no conflict.** Story `004` criterion 5's "generic
>    inactive-account message" for a `Deactivated` login reuses bolt `004`'s
>    existing `GenericInactiveMessage`, so `Rejected` and `Deactivated` share
>    one message by construction. The model adds no second "inactive"
>    concept, and the login path itself needs no change.
> 2. **Conflict 2 — deactivating an administrator.** Story `004`'s edge case
>    says it is "Refused by policy"; **the PRD does not say this anywhere**
>    — FR-5 says only "An administrator can deactivate an Active account."
>    The model **does not refuse it**, because a refusal creates a trap (the
>    last administrator cannot be deactivated by anyone) and the PRD has no
>    self-preservation rule. **The owner's call** — the recommendation is to
>    amend the story to match FR-5.
> 3. **Conflict 3 — the reset email's copy is not frozen.** `EXPERIENCE.md`
>    §9.3a defines the confirmation screen's copy and classifies the email,
>    but **defines no body or subject for the reset email itself**, and
>    `coding-standards.md` requires user-facing wording to match the frozen
>    spine. Stage 2 must either find the frozen copy or raise a UX edit for
>    approval, and must assemble the email from named parts either way.
> 4. **Open item 1** — the reset token's lifetime and the reset email's
>    wording need owner input. The lifetime is legitimately Architecture's
>    (FR-51 lists it under architecture-owned details) but is
>    product-visible, so Stage 2 must propose a default and expose it as
>    configuration.
> 5. **Open item 2 — the "first use wins" rule under concurrent resets.** The
>    model supports it, and the mechanism is the **database**, not the
>    application: a conditional `markUsed` write and a unique index on
>    `tokenHash`. Stage 4 must implement the conditional write, not a
>    read-then-write, or the replay protection is a race.
>
> **✅ The owner resolved all three raised items on 2026-10-28**, and the
> resolutions are recorded in `ddd-01-domain-model.md` beside the conflicts
> they settle:
>
> 1. **Conflict 2 — the PRD reading is confirmed.** Any administrator may
>    deactivate any `Active` account, **including another administrator**;
>    the target's own flag confers no protection, and it is cleared on
>    deactivation so no stale privilege remains. **Story `004`'s edge case
>    has been amended** to match FR-5, with the reasoning recorded in the
>    story file. The refusal reading would have trapped the last remaining
>    administrator, and the PRD states no escalation path.
> 2. **Open item 1 — the reset token's lifetime is 1 hour**, exposed as
>    configuration (`RESET_TOKEN_TTL_SECONDS`, default `3600`), with a
>    malformed value falling back to the default rather than failing the
>    request. The lifetime is product-visible, so the email renders the
>    **configured** value, not a constant. Stage 3 records it as an ADR.
> 3. **Conflict 3 — the reset email's copy is raised as a UX edit** for the
>    owner's approval rather than drafted in this bolt. The email is
>    assembled from **named parts** so the eventual copy is a single visible
>    edit in one place — the same pattern bolt `004` used for the FR-27
>    approval email.
>
> **The Stage 1 checkpoint is closed** and the bolt advanced to **Stage 2
> (Technical Design)**.
>
> **Two properties the model states and Stage 2 must make concrete:** the
> reset request's **timing** must not vary with account existence — which
> needs a fixed work floor, a constant delay, and a **measured** tolerance,
> because a timing test without a tolerance is a flaky test — and the
> email-scoped rate-limit bucket's key must be a **keyed hash** of the
> normalized address, never the address itself.
>
> **The reset flow writes no audit record.** FR-51 names no event for it, the
> request is anonymous, and a record that held the address would disclose
> existence. Story `008` criterion 6 is satisfied because **there is no
> record** — and no log line carries the address or the token either.
>
> **One real defect was found in bolt `004`'s code while reading the aggregate
> this bolt extends — and it is now fixed.** `rejectAccount()` in
> `src/domain/accounts/account.ts` set `deactivatedAt: at`, so a **rejected**
> account was stamped with a deactivation timestamp it never earned. No
> behaviour was wrong at the time — nothing read the column for a decision —
> but this bolt is the one that gives the column its meaning, so the defect
> was **latent and about to become reachable**.
>
> **Fixed.** `rejectAccount()` no longer takes a timestamp and no longer
> touches `deactivatedAt`; the column stays `null` on the rejection path, and
> the parameter was removed rather than left unused. The call site in
> `review-registration.ts` and the seven test call sites were updated, and a
> test now locks the behaviour ("leaves deactivatedAt null — a rejection is
> not a deactivation"). **Verified:** typecheck exit 0, lint exit 0, and the
> full suite **605/605 across 47 files** (604 before, plus the one new
> test). The `Account` table was empty, so **no data migration was needed**.

## Stage 2 - Technical Design

> **Stage 2 (Technical Design) is complete.** The artifact is
> `ddd-02-technical-design.md`. It is **documentation only** — no source code
> was written or changed, so there was nothing to run.
>
> **The schema delta for the entire bolt is one index.** The
> `PasswordResetToken` table, its unique index on `tokenHash`, the
> `accounts.deactivated_at` and `accounts.is_administrator` columns, and the
> `sessions.revocation_reason` column **all already exist** — bolt `004` added
> the table expressly to leave this bolt a seam. The only migration is a
> composite index for the daily token sweep.
>
> **The "first use wins" rule is a database guarantee, not an application
> check.** The conditional write `UPDATE … WHERE used_at IS NULL AND expires_at
> > now()` **is** the check — one statement, evaluated atomically, with no
> window between "is it still unused?" and "mark it used". Stage 4 must not
> implement it as a read-then-write. The three refusals it produces — unknown,
> used, expired — collapse into **one** internal reason and **one** response
> body, because the caller must not be able to probe the token space.
>
> **The timing equalisation has a measured tolerance.** The design chooses
> **both** mechanisms Stage 1 left open: an **unconditional dummy Argon2id
> verification** on every path (the same `DUMMY_HASH` pattern bolt `004`'s
> login uses for an unknown email), and a **constant floor** of 250 ms
> (`AUTH_RESET_MIN_RESPONSE_MS`). The tolerance the acceptance test asserts
> is **100 ms** (`AUTH_RESET_TIMING_TOLERANCE_MS`) — wide enough not to be
> flaky, narrow enough that a real existence oracle would fail it by orders
> of magnitude. **The floor also applies to the rate-limited path**, which is
> a deliberate addition beyond ADR-15's login precedent: the reset path's
> accepted response (202) and refused response (429) differ in body, so their
> timing must not differ either.
>
> **Two keyed digests, with two separate secrets, for two different reasons.**
> The reset token's digest keys off `AUTH_RESET_TOKEN_HASH_SECRET`; the
> rate-limit bucket's email key keys off `AUTH_RESET_BUCKET_HASH_SECRET`. The
> second **must** be keyed — an unsalted SHA-256 of an email address is
> trivially reversible by dictionary attack, because the address space is
> small and well known, and the counter table would become a list of "which
> addresses were reset", which is the enumeration FR-51 forbids one layer
> down. **Neither secret is derived from `SESSION_SECRET`**, and a missing one
> **fails loudly at startup** rather than falling back to an unkeyed digest,
> because that fallback would silently downgrade the property.
>
> **The reset email's structure is designed; its wording is not.** The email
> is assembled from **named parts** (subject, greeting, intro, action line,
> lifetime statement, security note, sign-off) and the wording is marked
> `PENDING UX EDIT`. The **lifetime statement renders the configured value**,
> not a constant — a member who reads the email must be told the truth about
> the window they have. The specific `EXPERIENCE.md` edit being requested is
> written out in full in the design.
>
> **The profile edit surface is structural, not a validation rule.**
> `ProfileChange` carries exactly two optional fields, so there is **no code
> path** by which an email, a status, or an administrator flag could reach the
> aggregate. FR-52's four forbidden edits are refused by the **shape of the
> type**, not by four `if` statements a future edit could forget.
>
> **Two additions this design makes beyond the model, each for a stated
> reason.** First, the **rate-limited** reset request also pays the timing
> floor, for the reason given above. Second, the reset route **redacts the
> `token` query parameter from request logs** — a URL carrying a token is
> exactly what ends up in an access log.
>
> **No open questions block implementation.** Stage 1's three items were
> resolved by the owner and this design is built to them. The one item raised
> is the **UX edit for the reset email's copy**, which does **not** block
> Stage 4 — it is exactly how bolt `004` shipped the FR-27 email's structure
> while its copy was settled — but it should be approved before the email
> reaches a real member.
>
> **Stage 3 (ADR Analysis) is next** and is optional. The design nominates
> three candidates for the owner to choose from: the 1-hour token lifetime,
> the timing-equalisation mechanism, and the keyed rate-limit bucket key.

## Stage 3 - ADR Analysis

> **Stage 3 (ADR Analysis) is complete.** Three ADRs were created, and the
> decision index was updated to `total_decisions: 19`. The artifact-only step
> produced documentation only — no source code was written or changed, so
> there was nothing to run.
>
> **The owner selected all three candidates** the Stage 2 design nominated.
>
> **ADR-17 — the reset token's lifetime is 1 hour, exposed as configuration.**
> The value was already the owner's decision; the ADR records the *reasoning*
> so a future change is deliberate. The trade-off is recorded on both sides: a
> short lifetime limits a captured link but expires for a member who steps
> away, and a long one is comfortable but keeps a captured link live for a
> day. The fallback convention (**a malformed value falls back to the
> default** rather than failing the request) is recorded, and so is the rule
> that **the email renders the configured value** — the number in the message
> is always the number the server enforces.
>
> **ADR-18 — equalise the reset request's timing with a dummy Argon2id
> verification plus a constant floor.** This is the ADR that makes FR-51's
> *timing* half of anti-enumeration a **measured** property rather than a
> wish. Two mechanisms, both on every path: the **dummy verification** (which
> reuses bolt `004`'s existing `DUMMY_HASH` pattern rather than inventing a
> second one) and the **250 ms floor**, asserted against a **100 ms
> tolerance**. The ADR records the rejected alternatives — a constant-time
> comparison, a delay alone, a queue, and a delay derived from account
> existence — and why each fails. It also records the **deliberate departure
> from ADR-15's login precedent**: the floor applies to the **rate-limited**
> path too, because the reset path's accepted (202) and refused (429) bodies
> differ, so their timing must not.
>
> **ADR-19 — key the reset rate-limit bucket's email address with an HMAC,
> while the login bucket keeps the plaintext address.** This is the one place
> the design departs from bolt `004`'s precedent, and the ADR exists so the
> difference reads as deliberate rather than as an inconsistency. The
> reasoning is the part worth keeping: the counter table is reachable by
> anyone with database read access, and a plaintext key there is a list of
> "which addresses were reset" — the enumeration FR-51 forbids, one layer
> down. The ADR records that an **unsalted SHA-256 is forbidden** (the email
> address space is small and well known, so it is trivially reversible by
> dictionary attack — it looks protective and is not), that a **missing
> secret fails loudly at startup** rather than falling back to an unkeyed
> digest, and that the secret is **separate** from `SESSION_SECRET` and from
> the reset token's own hashing secret so the two rotate independently.
>
> **The decision index now records 19 decisions**, and each new entry carries
> a **"Read when"** line so a future agent finds the relevant ADR by the
> scenario it governs.

## Stage 4 - Implement

> **Stage 4 (Implement) is complete.** The bolt's four stories are
> implemented across the domain, application, and infrastructure layers, with
> four new route handlers. **Verified:** typecheck exit 0, lint exit 0, the
> full suite **790/790 across 54 files** (605 before, plus 185 new), the
> production build **succeeds**, and a **live `npm run dev` smoke test**
> exercised every new endpoint against the running server.
>
> **The schema delta really was one index.** `PasswordResetToken`,
> `accounts.deactivated_at`, `accounts.is_administrator`, and
> `sessions.revocation_reason` all already existed — bolt `004` added them
> expressly to leave this bolt a seam. The only migration is
> `20261028160000_reset_token_sweep_index`, the composite index for the
> daily token sweep.
>
> **The "first use wins" rule is a conditional write, as the design
> required.** `PrismaPasswordResetTokenRepository.markUsed()` issues one
> statement — `UPDATE … SET "usedAt" = $now WHERE "id" = $id AND "usedAt"
> IS NULL AND "expiresAt" > $now RETURNING "id"` — and the write *is* the
> check. There is no read-then-write window, so two concurrent resets
> carrying the same token cannot both succeed.
>
> **The anti-enumeration property is closed by three independent mechanisms,
> and all three are asserted rather than assumed:**
>
> 1. **Body** — one frozen confirmation string
>    (`NEUTRAL_RESET_CONFIRMATION`) built by one factory. The test compares
>    the **raw response text** across all four account states *and* the
>    unregistered case, and asserts a single distinct body.
> 2. **Timing** — an unconditional dummy Argon2id verification on every
>    path (reusing bolt `004`'s `DUMMY_HASH` pattern) plus a constant
>    250 ms floor. The test **measures** both paths and asserts they are
>    within a 100 ms tolerance. The floor also applies to the
>    **rate-limited** path, so a 429 cannot be told from a 202 by its
>    timing.
> 3. **The counter table** — the email bucket's key is a **keyed HMAC** of
>    the normalized address (ADR-19), so the table cannot answer "which
>    addresses were reset". The live smoke test confirmed this directly:
>    the `reset:email:` rows held 64-hex digests, never an address.
>
> **FR-52's closed edit surface is structural.** `ProfileChange` carries
> exactly two optional fields — `displayName` and `selfDeclaredRole` — so
> there is no code path by which an email, a status, or an administrator
> flag could reach the aggregate. The live smoke test sent all three
> forbidden fields in one request body and the row was unchanged on every
> one.
>
> **Two production seams were added, and only two.** `buildIdentityStack()`
> now accepts an `IdentityStackOverrides` argument exposing the reset
> token's generator and the email sender. These exist because the reset
> token's plaintext exists **only** in the email — a test that must complete
> a reset it requested needs to know the token, and there is no other way to
> learn it. Everything else — the repositories, the hasher, the rate limiter,
> the CSRF validator — is the real implementation against the live database.
>
> **Two new secrets are REQUIRED, and a missing one fails at startup.** The
> fallback for a missing bucket-key secret would be a plaintext address in
> the counter table, and a deployment that appears protected but is not is
> worse than one that fails to start. `readResetTokenHashSecret()` and
> `readResetBucketHashSecret()` both throw, and the stack builds them
> eagerly — so a deployment missing either fails at the first request
> rather than at the first reset request. `.env.example` documents both as
> **commented placeholders**; the real values belong in the deployment's
> secret store.
>
> **The reset flow writes no audit record.** FR-51 names no event for it, the
> request is anonymous, and a record holding the address would disclose
> existence. Story `008` criterion 6 is satisfied because there is **no
> record** — and the log lines carry the **keyed digest** rather than the
> address, confirmed live.
>
> **The deactivation is atomic and idempotent.** The status change and every
> session revocation commit **together** (ADR-3), with the audit row inside
> the same transaction (ADR-6). A second deactivation writes nothing and
> records nothing — the live smoke test produced **exactly one** audit row
> (event 13, actor role `administrator`) after two calls.
>
> **Two additions beyond the design, both for a stated reason.** First, the
> `AccountDeactivationService` has **no repository** for a report, a Claim, a
> Recovery Response, a message, or an audit row — so "deactivation preserves
> everything" (FR-5) is enforced **structurally** rather than by remembering
> not to. Second, the `MemberProfileService` returns the **changed fields and
> their previous values** in the audit payload, so the record never has to
> reconstruct them from the request.
>
> **The live smoke test covered every new endpoint.** The four routes were
> exercised against `npm run dev` with a real session and a real CSRF token:
> the four refusal paths (403/403/401/403), the profile GET and POST, the
> reset request for a registered and an unregistered address (identical
> bodies, timings within 20 ms of each other), the reset completion (200,
> then 400 on reuse — single-use proven), the new password working and the
> old one failing, the deactivation (200, idempotent on the second call,
> both sessions revoked with `account_deactivated`, exactly one audit row),
> and the deactivated account's full lockout (no sign-in, the old session
> resolving to `actor: null`).
>
> **One thing to note, outside this bolt's scope.** The `login:email:` rate-
> limit bucket still holds a **plaintext address**, which is bolt `004`'s
> existing code and the very thing ADR-19 forbids on the reset path. It is
> not a regression — it is the pre-existing behaviour — but the same
> reasoning applies to it, and it is raised here for the owner to schedule.
>
> **The one open item is unchanged and does not block Stage 5**: the
> **UX edit for the reset email's copy**. The structure is built and the
> wording is a single visible edit in one place
> (`PASSWORD_RESET_SUBJECT` and the named parts in
> `password-reset-email.ts`), marked `[PENDING UX EDIT]`.
>
> **Stage 5 (Test) is next** — `ddd-03-test-report.md`.

## Stage 5 - Test

> **Stage 5 (Test) is complete.** The artifact is `ddd-03-test-report.md`.
> **Verified:** typecheck exit 0, lint exit 0, the full suite **815/815 across
> 56 files**, coverage **93.72% lines** / 90.20% branches / 97.26% functions,
> the production build **succeeds**, and a **live `npm run dev` smoke test**
> measured the reset link's shape against the running server.
>
> **The stage found a high-severity defect in the Stage 2 design — and it
> found it by measurement, not by reading.** The design required the route to
> "redact the `token` query parameter from request logs". Two live requests
> established that **no application code can do this**:
>
> 1. A request to `/reset-password?token=…` was observed in the server's
>    request log carrying the **full token**.
> 2. A proxy that rewrote the request's URL — stripping the query entirely —
>    did **not** remove the token from the log.
>
> The reason is structural: **the access log records the original request
> URL — the one on the wire — and it is written before any application code
> runs.** No proxy, no rewrite, and no route handler can change what is
> already written.
>
> **The fix is that the token now travels in the URL's fragment.** A fragment
> is never sent to the server, so it never enters the request line and
> therefore never reaches an access log. The page's own JavaScript reads it
> in the browser and **posts it in the request body**, which is also not in
> the request line. Measured live: **0** occurrences in the request log,
> **0** in the served HTML.
>
> **This reverses the design's own reasoning, and the reversal is the point.**
> The design had rejected the fragment because *"a fragment is never sent to
> the server, so the server could not read it to look up the token."* That was
> correct about the fragment and wrong about the consequence: **the server
> does not need to read the token from the fragment.** The page reads it and
> posts it. The design's other constraint — *"the reset form must not be a
> GET"* — pointed at exactly this solution.
>
> **`ddd-02-technical-design.md` has been corrected** — the link's shape, the
> Stage 4 checklist's obligation 5, and the three traceability rows that
> cited it now describe the fragment, the measurement that forced the change,
> and the proxy's **bounded** role.
>
> **The proxy remains, as a second line of defence** for a legacy or
> hand-built `?token=…` link. It moves the token into a request header and
> serves the request from a redacted URL, so the token never reaches the
> route handler or the page's markup. **It cannot un-write the access-log
> line**, and `src/proxy.ts`'s own documentation now says so plainly rather
> than overclaiming.
>
> **Two more gaps were closed.** The **rate-limited** reset path's timing
> floor was implemented but **not asserted** — ADR-18 requires the floor on
> every path, because the accepted response (202) and the refused one (429)
> differ in body, so their timing must not differ either. It is now asserted:
> the test exhausts the email bucket and measures the 429 within
> `[250, 350]` ms. And the reset flow's **zero-audit-record** property was
> structurally true but **unasserted** — a future developer adding an audit
> call would have broken FR-51 with the suite still green. The test now
> counts the audit rows before and after a full request-and-completion flow
> and asserts equality.
>
> **The ten Stage 4 obligations were audited against the real code**, and
> nine are satisfied as written. The tenth is the redaction mechanism above,
> which was impossible and has been corrected. One **wording deviation** was
> found and recorded: the design names `Account.deactivate()` and
> `Account.updateProfile()` as **methods**, while the implementation exposes
> free functions `deactivateAccount` and `updateAccountProfile` — matching
> bolt `004`'s convention (`approveAccount`, `rejectAccount`). The behaviour
> is identical; it is recorded so a reader comparing the two does not read it
> as an unexplained divergence.
>
> **Every acceptance criterion is met**, across all four stories, with a
> named test in the 50-test acceptance suite. The FR-52 criteria are
> asserted **structurally**: the suite sends `email`, `status`, and
> `isAdministrator` in one profile request body and the row is unchanged on
> all three — not because a validation rule enumerated them, but because
> `ProfileChange` has two optional fields and no others.
>
> **Five items remain open for the owner**, none of which blocks the bolt:
> the **`/reset-password` page is Unit 007's**, and it must now be built
> against the **fragment** contract; the reset email's **copy** is still
> `PENDING UX EDIT`; the **`login:email:` bucket still holds a plaintext
> address** (bolt `004`'s pre-existing behaviour, the very thing ADR-19
> forbids on the reset path); the **Vercel runtime must be Node 24**
> (ADR-12); and the **module map's FR-27 row** and the unit brief's
> "Vercel rate limiting" row are both out of date.
>
> **The bolt is complete.** `005-identity-security` is done, and the next
> step is the owner's.

## Dependencies

### Requires
- **001-audit-core** (required): deactivation, reset, and profile edits are audited
- **004-identity-core** (required): needs accounts, sessions, and login

### Enables
- 020-web-profile

## Success Criteria

- [x] Deactivation revokes all sessions in the same transaction as the status change
- [x] Reports, Claims, Recovery Responses, messages, and audit history survive deactivation
- [x] A deactivated member's audit entries are never rewritten to hide the actor
- [x] Reset responses are indistinguishable across registered, unregistered, and all four account statuses
- [x] Reset response timing does not vary with account existence
- [x] A reset never approves, activates, reactivates, or undoes a rejection
- [x] A used or expired token is refused
- [x] The profile editor exposes exactly two editable fields; email and status are read-only

## Notes

Profile edit is in this bolt rather than with the frontend because it produces an
audit record, and the FR-52 edit surface is a domain constraint rather than a UI
affordance. The UI merely renders it.