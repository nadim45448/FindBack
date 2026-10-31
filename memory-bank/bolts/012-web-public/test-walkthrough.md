---
stage: test
bolt: 012-web-public
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
created: 2026-10-29T18:45:00Z
completed: 2026-10-29T18:45:00Z
verification_command: "npm run verify"
---

# Bolt 012 — Stage 3: Test Report

## Overview

The verification of the `012-web-public` bolt: the design foundations, the theme
control, and the ten public and authentication surfaces.

| Concern | Module | Story | Requirement |
|---|---|---|---|
| The token layer | `src/ui/tokens.ts`, `src/app/globals.css` | 001 | FR-30 |
| The app shell and topbar | `src/ui/app-shell.tsx`, `src/ui/topbar.tsx` | 001, 002 | FR-30 |
| The theme control | `src/ui/theme-toggle.tsx`, `src/ui/theme-script.tsx` | 001 | FR-30 |
| The copy authority | `src/ui/copy.ts` | 002 | FR-1, FR-2, FR-4 |
| The form validation | `src/ui/form-validation.ts` | 002 | FR-2 |
| The auth forms | `src/ui/login-form.tsx`, `src/ui/register-form.tsx` | 002 | FR-2, FR-4 |
| The forgot-password form | `src/ui/forgot-password-form.tsx` | 002 | FR-1, FR-27 |
| The listings and restricted surfaces | `src/ui/listings-surface.tsx`, `src/ui/restricted-surface.tsx` | 002 | FR-27 |

**The bolt's implementation was complete before this stage.** Stage 1 (Plan)
and Stage 2 (Implement) were run by owner direction; this stage records **what
was verified and against what**.

## Verification Command

```bash
npm run verify
```

which is:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
```

### Result

| Step | Command | Result |
|---|---|---|
| Typecheck | `tsc --noEmit` | ✅ clean, no errors |
| Lint | `eslint .` | ✅ clean, no errors |
| Test | `vitest run` | ✅ **116 files, 2,030 tests, all passing** |
| Build | `next build` | ✅ clean, all routes registered |

The build registers every route the bolt added — `/`, `/listings`, `/login`,
`/register`, `/pending`, `/pending-registered`, `/forgot`, `/forgot-sent` —
and **no `/rejected` route and no `/deactivated` route exist**, which is the
route-level half of story 002's seventh criterion.

### Coverage

| Scope | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| All files | 93.19 | 88.14 | 94.35 | **93.25** |
| `src/ui` | 94.73 | 85.07 | 92.10 | **94.83** |

The global 80% line-coverage floor is met with margin.

The bolt's own modules, at the close of this stage:

| Module | % Stmts | % Branch | % Funcs | % Lines |
|---|---|---|---|---|
| `tokens.ts` | 100 | 100 | 100 | 100 |
| `app-shell.tsx` | 100 | 100 | 100 | 100 |
| `topbar.tsx` | 100 | 75 | 100 | 100 |
| `copy.ts` | 100 | 100 | 100 | 100 |
| `restricted-surface.tsx` | 100 | 100 | 100 | 100 |
| `forgot-password-form.tsx` | 100 | 90 | 100 | 100 |
| `login-form.tsx` | 100 | 88.88 | 100 | 100 |
| `register-form.tsx` | 96.49 | 87.5 | 90.9 | 96.49 |
| `form-validation.ts` | 95.83 | 94.87 | 100 | 95.83 |
| `form-parts.tsx` | 96.15 | 91.83 | 100 | 96.15 |

## Summary

- **Tests**: 2,030/2,030 passed (116 files)
- **Coverage**: 93.25% lines (93.19% statements, 88.14% branches, 94.35% functions)
- **Bolt's own suites**: 234 tests across 9 files, all passing

## Test Files

- [x] `src/ui/tokens.test.ts` — the token layer's 28 tests: every CSS custom property compared against the typed constants, the theme vocabulary, the theme resolution rules, the layout rules, and the reduced-motion rules
- [x] `src/ui/theme-toggle.test.tsx` — the theme control's 23 tests: the trigger's accessible name, the menu's keyboard contract, the persistence under `findback.theme`, the System theme following the OS, and the no-flash script
- [x] `src/ui/app-shell.test.tsx` — the shell's 24 tests: the skip link's position, the `<main>` landmark's focusability, the topbar variants, and the sign-out request
- [x] `src/ui/copy.test.ts` — the copy layer's 60 tests: every user-facing string compared against `EXPERIENCE.md`
- [x] `src/ui/form-validation.test.ts` — the validation layer's 27 tests: the client/server-agreement property, the password policy, and the three forms' rules
- [x] `src/ui/form-parts.test.tsx` — the form parts' 20 tests: the error summary, the field, the select, and the validate-after-submit pattern
- [x] `src/ui/auth-forms.test.tsx` — the auth forms' 23 tests: the login and register outcomes, the neutral inactive message, and the no-auto-login rule
- [x] `src/ui/forgot-password-form.test.tsx` — the forgot-password form's 14 tests: the neutral confirmation, the anti-enumeration contract, and the error branches
- [x] `src/ui/surfaces.test.tsx` — the surfaces' 15 tests: the listings row routing, the summary-fields-only rendering, the pagination, and the restricted surface

**One support module was added:** `src/test/dom.ts`, which installs a
`matchMedia` stub, a router stub, and a DOM reset for the component suites.
It lives under `src/test/` rather than in the application because the gaps it
fills — a browser API jsdom does not implement, and a Next.js router that
needs a mounted app — are **test-environment gaps, not product defects**.

## Acceptance Criteria Validation

### Story 001 — design foundations and theme

1 - ✅ **Colours, type, spacing, radius, elevation, and component dimensions resolve to the tokens and to no hard-coded values**: `tokens.test.ts` reads `globals.css` from disk and compares **every** CSS custom property against the typed constants. The two copies of the tokens cannot drift without a test failing. The layout and elevation groups cover the shape, touch-target, grid, and shadow tokens.

2 - ✅ **Light theme: brand `#7C2907`, background `#FAF7F2`, surface `#FFFFFF`, on-background `#1F1B16`**: asserted directly against `brand.primary`, `light.background`, `light.surface`, and `light.onBackground`.

3 - ✅ **Dark theme: background `#161310`, surface `#211C18`, on-background `#F5EFE5`, focus-ring `#FB923C`**: asserted against the dark constants, together with all fourteen dark surface tokens.

4 - ✅ **A status badge pairs the matching status token with a text label and an icon**: the "status colours" group asserts that **every** status across the report, claim, and account vocabularies carries a foreground, a soft fill, and an icon — all six-digit hex. The text label is rendered by the badge and asserted in the surfaces suite.

5 - ✅ **A 12-column grid at ≥ 1024 px, content capped at 1024 px, forms capped at 640 px**: the "layout rules" group asserts the three grid declarations, the two breakpoints at 640 px and 1024 px, and both caps.

6 - ✅ **The 8-column tablet grid between 640 px and 1023 px and the 4-column mobile grid below 640 px**: asserted through the same three grid declarations and the two breakpoint media queries.

7 - ✅ **First visit with no stored preference resolves from `prefers-color-scheme` with no flash**: the no-flash script is executed in a test and asserted to set the attribute before React hydrates; the theme-toggle suite asserts that the stored value is ignored when it is `System`.

8 - ✅ **The toggle is a 44 × 44 icon button in the topbar, outside the Account menu**: `app-shell.test.tsx` asserts the toggle is in the topbar; `tokens.test.ts` asserts the 44 px touch target and the `min-height`/`min-width` declarations that give it.

9 - ✅ **The menu opens with exactly three `role="menuitemradio"` items and `aria-checked="true"` on the active one**: asserted in the theme-toggle suite, together with the exact item labels.

10 - ✅ **The accessible name is `Theme: <System|Light|Dark>. Click to change.` and updates**: asserted for all three states, and asserted again after a selection.

11 - ✅ **Arrow Up, Arrow Down, Home, End, Enter, and Escape move, select, or close; Escape returns focus to the trigger**: the theme-toggle suite covers ArrowDown, ArrowUp, the wrap-around, Home, End, and Escape-with-focus-return.

12 - ✅ **The selection is read from `localStorage` key `findback.theme` and overrides the OS preference**: asserted in both directions — an explicit `Light` survives an OS flip to dark, and the stored key is the frozen `findback.theme`.

13 - ✅ **`System` re-resolves when the OS theme changes with no user action**: the suite changes the media query's answer and asserts the resolved theme changed with no interaction.

14 - ✅ **Reduced motion disables toast, modal, dropdown, card hover lift, and the drag-active border change**: the "reduced-motion rules" group asserts the `prefers-reduced-motion: reduce` block, the blanket transition and animation cancellation, and the named `.card:hover` cancellation.

15 - ✅ **A status change renders instantly and the drag-active state is an instant swap**: the blanket rule above covers this — every transition and animation is cancelled to `0.01ms`, so a status change is instant by construction.

16 - ✅ **The logo swaps to the theme-matching variant and the focus ring stays visible in both themes**: asserted — `fb-logo-color` is the brand primary in light and `dark.onBackground` in dark, and `focus-ring` is asserted in both blocks.

17 - ✅ **The skip link is the first focusable element and moves focus to `<main id="main" tabindex="-1">`**: the shell suite asserts the skip link's href, that it is the first focusable element in document order, and that the `<main>` carries both `id="main"` and `tabindex="-1"`.

18 - ✅ **Every interactive element is at least 44 × 44 px**: asserted through the `--touch-target` token and the `min-height`/`min-width` declarations that resolve against it.

### Story 002 — public and authentication surfaces

1 - ✅ **The landing page shows the brand mark, a one-paragraph value proposition, the `Sign in` and `Register` CTAs, and a below-the-fold `Browse the listings` link to `/listings`**: the copy suite asserts the value proposition is **one paragraph** and covers both sides of the exchange, and the landing surface's links are covered by the shell suite's topbar assertions.

2 - ✅ **A summary row routes to `/login?return=/listings/:id` with `Sign in to see item details.`, and no anonymous detail page exists**: asserted in the surfaces suite, and the build's route table carries **no `/listings/:id` route**.

3 - ✅ **The anonymous topbar shows `Browse Lost & Found` as a plain text link plus `Sign in` and `Register` as `primary` buttons, and `Logout` is absent**: asserted in the shell suite — the link's href is `/listings`, and neither a `Log out` button nor link exists.

4 - ✅ **`/login` exposes `Email` and `Password` and a `Forgot your password?` action beneath the password field**: asserted in the auth-forms suite, including the link's href.

5 - ✅ **Wrong credentials produce `Email and password don't match. Try again.` and the form stays usable**: asserted, including that the submit button is not left disabled.

6 - ✅ **A `Rejected` account gets the neutral message and the reason is never exposed**: asserted in the auth-forms suite.

7 - ✅ **A `Deactivated` account gets the **identical** neutral message and the surface does not distinguish the two**: asserted — the same message constant is used for both, and a further assertion checks that no text mentioning "rejected" or "deactivated" appears on the screen.

8 - ✅ **No `/rejected` route and no `/deactivated` route exists, and neither state reaches the member surface or `/pending`**: the build's route table carries neither route, and the auth-forms suite asserts that a `Pending` sign-in is the only state that reaches `/pending`.

9 - ✅ **`/register` exposes name, email, password, confirm password, and self-declared role with the documented limits and the client hint**: asserted — the four roles are enumerated, the `Other` field appears only when `Other` is chosen, and the hint is asserted verbatim.

10 - ✅ **A successful registration lands on `/pending-registered` with the copy and no automatic login**: asserted — the route is `/pending-registered`, and the suite explicitly asserts the router was **not** sent to `/home` or `/pending`.

11 - ✅ **Rejected registration: errors appear only after the submit, the summary carries `role="alert"`, the first invalid field is focused, and the tone is §4.9's**: asserted in the form-parts suite — the summary's role, its focusability, its links to the fields, and the fact that nothing is shown before the first submit.

12 - ✅ **A `Pending` sign-in lands on `/pending` with the banner and the secondary line**: asserted in the auth-forms suite, and the banner's copy is asserted against `EXPERIENCE.md` in the copy suite.

13 - ✅ **The `/pending` header is brand mark plus `Pending` pill plus `Log out` only, and all other nav items are hidden**: asserted in the shell suite — the `Browse`, `Sign in`, and `Register` items are all absent, and the theme toggle remains because it is chrome rather than a nav item.

14 - ✅ **A `Pending` deep-link shows the restricted message with a `Back to your account` link and does not redirect-loop**: asserted in the surfaces suite — the message is present, the link's href is `/pending`, and the router's `push`, `replace`, and `refresh` were **all** never called.

15 - ✅ **`/pending-registered` and `/pending` remain distinct surfaces and are never merged**: asserted — they are separate routes in the build's table, and the auth-forms suite asserts a registration never routes to `/pending`.

16 - ✅ **`/forgot` exposes a single `Email` field, a `Send reset instructions` primary button, and a `Back to sign in` secondary link**: asserted in the new forgot-password suite — **one** input, the button's type and label, and the link's href.

17 - ✅ **Any email at `/forgot` lands on `/forgot-sent` with the heading and body**: the route and the neutral copy are asserted — the heading and the body are among the strings compared against `EXPERIENCE.md`, and the route is asserted in the forgot-password suite.

18 - ⚠️ **An unregistered, `Pending`, `Active`, `Rejected`, and `Deactivated` email produce the same content, status, and observable timing**: **the surface half is proven; the timing half is not.** The form has no branch on the account state — the suite renders it twice, once with an address that exists and once with one that does not, and asserts the same route, the same request body shape, and the same outcome both times. The **server's** status and timing parity is owned by bolt 005's reset flow and is verified there, not here; a browser-level timing assertion would be measuring the test runner, not the product.

19 - ➖ **A successful password reset leaves the account's lifecycle state unchanged**: **out of this bolt's scope.** The story's own "Out of Scope" section names *"the password-reset token mechanics and the reset completion screen"* as Unit 001's work, and the reset itself is owned by bolt 005 (`005-identity-security`), which this bolt requires. This bolt owns the *surface* that initiates a reset and the neutral confirmation it produces — both proven. The lifecycle-preservation guarantee is recorded as an owner item below rather than claimed here.

20 - ⚠️ **Every user-facing string is taken verbatim from `EXPERIENCE.md` and no string is reworded or invented**: **33 of the 36 strings are proven verbatim; three are proven by the rule they serve.** The copy suite reads `EXPERIENCE.md` from disk and compares each string against it. Three strings are **not fixed word-for-word by the spines** — the landing paragraph, the registration-confirmation heading, and the reset-password heading — so those are asserted against the rule each serves (one paragraph covering both sides of the exchange; the heading says "registration" and not "approved"; the heading names both "password" and "reset"). This is recorded in full below, because a criterion stated as "verbatim" is not fully met until the spines say which three strings they mean.

21 - ✅ **No error, icon, red border, or `aria-invalid` before the first submit, and a field's error clears the moment its value becomes valid**: asserted in the form-parts suite and in the three form suites. **This criterion caught a real defect — see below.**

## Issues Found

### A stale-state bug that broke criterion 21 in all three forms

**The criterion says a field's error state clears *"the moment its value becomes
valid"*. It did not.**

All three forms re-validated their field from **component state** inside the
change handler:

```typescript
onChange={(value) => {
  setEmail(value);
  revalidate('email');   // ← reads the *previous* email
}}
```

`setEmail` has been called, but React has not re-rendered — so `email` still
held the value the visitor had just replaced. The re-validation therefore
checked the **old** value, concluded the field was still invalid, and left
the error in place. The visitor could correct the field and watch the error
sit there until the next submit.

**The fix is to validate the value that was just typed.** The next value is
now passed into the re-validation and substituted over the current values:

```typescript
function revalidate(field: 'email' | 'password', nextEmail: string, nextPassword: string): void {
  const next = validateLogin({ email: nextEmail, password: nextPassword });
  …
}
```

The register form does the same with `{ ...currentValues(), [field]: value }`,
because it has six fields and only one of them changes at a time.

**This defect was invisible to the suites that existed before this stage**,
because they asserted that the error was *shown* — never that it *cleared*.
The three new regression tests are the ones that would have caught it:

- `auth-forms.test.tsx` → *"clears a field's error the moment its value becomes valid"* (login)
- `auth-forms.test.tsx` → *"clears a field's error the moment its value becomes valid"* (register)
- `forgot-password-form.test.tsx` → *"clears the error the moment the value becomes valid"*

**The lesson is worth recording:** a validation suite that only checks the
failure path proves the form can complain, not that it can forgive.

### The forgot-password form had no tests at all

`src/ui/forgot-password-form.tsx` had **0% coverage** — it was the only
surface of the ten with no suite, and it owns three of story 002's criteria
(16, 17, and 18). The new suite brings it to **100% statements and 100%
lines**, and it is the suite that exposed the stale-state bug above.

### Two snapshot caches could serve a stale value

Writing the theme-toggle suite exposed two stale-cache hazards in
`src/ui/theme-toggle.tsx`:

- **The OS preference was cached in a module-level variable.** The cache was
  removed entirely: the OS answer is a **boolean primitive**, so it is
  identity-stable by value and needs no cache to satisfy
  `useSyncExternalStore`'s `Object.is` comparison. Reading it fresh also
  means it can never be stale.
- **The stored theme was cached without a validity check.** The cache is now
  **keyed on the raw storage value**, so a change in `localStorage` — from
  another tab, or from the toggle itself — invalidates it. Both invalidation
  sites (`onStorage` and `notifyThemeChanged`) now clear the raw key.

Neither was a *reported* defect; both were latent, and both are now
structurally impossible rather than merely untested.

### Two copies of the session cookie's name

`src/app/listings/page.tsx` read the session cookie by the literal
`'__Host-fb'`, while the adapter that *writes* it uses the exported
`SESSION_COOKIE_NAME`. Two copies of one fact, in the codebase's own terms —
and a change to the cookie's name would have silently broken the listings
page's actor resolution. The page now imports the constant.

## Owner Items

1. **Three strings are not fixed word-for-word by `EXPERIENCE.md`.** The
   landing paragraph, the registration-confirmation heading
   (`Registration received`), and the reset-password heading
   (`Reset your password`) are asserted against the *rule* each serves rather
   than against the document, because the document does not write them. The
   criterion says *"every user-facing string is taken verbatim from
   `EXPERIENCE.md`"*, so the three strings need either a line in the spines or
   an explicit note that they are the spines' delegated wording. **This needs
   the spines' owner's decision, not a test's.**

2. **The `/forgot` timing parity is not proven here.** The form's
   anti-enumeration behaviour is proven — no branch on the account state, the
   same route and body for every well-formed address. The *server's* status
   and timing parity is bolt 005's responsibility. If the criterion is meant
   to hold end-to-end, the proof belongs in the reset-flow suite, against the
   server, not in a browser timing assertion.

3. **The password-reset lifecycle guarantee is not proven here.** That a
   successful reset leaves `Pending`, `Rejected`, and `Deactivated` accounts
   in their current state is bolt 005's and bolt 007's work. This bolt owns
   the surface that starts a reset and the neutral confirmation it produces.

4. **The theme popover's outside-click behaviour is not covered.** Story 001's
   edge case says *"Theme popover is open and the user clicks elsewhere →
   popover closes; focus is not trapped"*. The suite covers the keyboard
   contract and Escape, but not a pointer click outside the trigger. The
   behaviour is implemented; it is simply unproven.

5. **The status badge's text label is asserted on the badge, not on every
   badge.** The colour-and-icon half of the criterion is proven for every
   status in the vocabulary; the label half is proven where a badge is
   rendered. A badge-rendering suite for the member surfaces is bolt 013's
   work.

6. **Six existing suites still delete whole tables.** The blanket-delete race
   recorded in bolt 011's test report is still latent in
   `src/infrastructure/listings/`. This bolt's suites touch no database, so
   it did not fire here — but it will.

7. **The database's time zone must be set to UTC explicitly by the
   deployment.** Still outstanding from bolt 007.

## Notes

### The token layer has two copies on purpose, and a test makes the second honest

`src/ui/tokens.ts` holds the values as typed constants; `src/app/globals.css`
holds the same values as CSS custom properties. **A CSS variable cannot be
read from TypeScript, and a token cannot be read by the browser** — so the
values must be written down twice, and the suite is what keeps the second
copy honest.

`tokens.test.ts` reads the CSS file from disk and compares every property
against the typed constants. The helper locates a block by its **opening
brace** and matches the selector as a **whole block header**, because a bare
`indexOf(':root')` finds the *first* occurrence — the combined
`:root, [data-theme='light']` header, a block that carries no `--radius-sm` —
and every shape-token assertion would read `undefined` from the wrong block.

### The menu rows carry `data-theme-option`, not `data-theme`

The theme menu's rows are labelled "Light" and "Dark", and the tokens are
bound to `[data-theme='light']` and `[data-theme='dark']`. A row carrying
`data-theme` would therefore **re-theme itself**. The rows carry
`data-theme-option` instead, and the suite asserts that every row has
`data-theme-option` and **no** `data-theme`.

### The no-flash script is the only thing that can prevent a flash

The theme script is inlined into `<head>` and runs before the browser's first
paint. A React effect runs *after* paint — which is precisely the flash the
requirement forbids. The script's own test executes it and asserts it sets
the attribute, and that it cannot throw when storage is unavailable.

### The client validation is the domain's validation

`src/ui/form-validation.ts` calls the domain's own `evaluatePasswordPolicy`,
`isPlausibleEmailShape`, `normalizeEmail`, and `SELF_DECLARED_ROLES` rather
than re-implementing the rules. The suite proves the agreement directly: for
a spread of passwords, the client reports an error **exactly when** the
domain's policy says the password is unacceptable.

### The neutral message is the domain's constant, re-exported

`GENERIC_INACTIVE_MESSAGE` and `NEUTRAL_RESET_CONFIRMATION` live in
`src/domain/accounts/`; `src/ui/copy.ts` re-exports them rather than copying
the text. The copy suite then compares the *rendered* string against
`EXPERIENCE.md`, so the document and the screen cannot drift.
