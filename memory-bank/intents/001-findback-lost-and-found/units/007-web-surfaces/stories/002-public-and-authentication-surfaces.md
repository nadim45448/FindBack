---
id: 002-public-and-authentication-surfaces
unit: 007-web-surfaces
intent: 001-findback-lost-and-found
status: draft
priority: must
created: 2026-10-23T12:51:00Z
assigned_bolt: null
implemented: false
traces_to: []
realizes_fr: [FR-1, FR-2, FR-4, FR-51, FR-27]
---

# Story: 002-public-and-authentication-surfaces

User Story

**As an** anonymous visitor or a prospective member
**I want** ten clear public and authentication surfaces
**So that** I can understand FindBack, register, sign in, recover a password, and understand my account's state without ever being misled

Acceptance Criteria

- [ ] **Given** a visitor on `/`, **When** the landing page renders, **Then** it shows the brand mark, a one-paragraph value proposition, `Sign in` and `Register` CTAs, and below the fold a `Browse the listings` link to `/listings`
- [ ] **Given** a visitor on `/listings`, **When** a summary row is activated, **Then** the browser routes to `/login?return=/listings/:id` with the message `Sign in to see item details.`, and no anonymous detail page exists
- [ ] **Given** an anonymous visitor, **When** the topbar renders on any public or auth-flow page, **Then** it shows `Browse Lost & Found` as a plain text link plus `Sign in` and `Register` rendered as `primary` buttons that read as buttons at rest, and `Logout` is absent
- [ ] **Given** a visitor on `/login`, **When** the form renders, **Then** it exposes `Email` and `Password` fields and a `Forgot your password?` action beneath the password field
- [ ] **Given** a visitor submits `/login` with credentials that do not match, **When** the response renders, **Then** the message is `Email and password don't match. Try again.` and the form remains usable
- [ ] **Given** a `Rejected` account, **When** it attempts to sign in, **Then** the single message is `We couldn't sign you in. Your account is not active. If you think this is a mistake, contact your administrator.` and the rejection reason is never exposed
- [ ] **Given** a `Deactivated` account, **When** it attempts to sign in, **Then** the identical neutral message renders, and the surface does not distinguish `Rejected` from `Deactivated`
- [ ] **Given** any account state, **When** a sign-in attempt is made, **Then** no `/rejected` route and no `/deactivated` route exists and neither state reaches the member surface or `/pending`
- [ ] **Given** a visitor on `/register`, **When** the form renders, **Then** it exposes name, email, password, confirm password, and self-declared role with the documented validation limits and a client hint of at least 8 characters, at least 1 letter, and at least 1 number
- [ ] **Given** a visitor submits `/register` successfully, **When** the response renders, **Then** the browser lands on `/pending-registered` with the copy `Your account is pending administrator approval. You'll get an email when you're approved.` and no automatic login occurs
- [ ] **Given** a visitor's registration is rejected by the server, **When** the form re-renders, **Then** the errors appear only after the submit attempt, the error summary carries `role="alert"`, the first invalid field receives focus, and the errors use the `EXPERIENCE.md` §4.9 validation tone
- [ ] **Given** a `Pending` account, **When** it signs in, **Then** it lands on `/pending` with the banner `Your account is pending administrator approval.` and the secondary line `You can sign out below — your registration is saved.`
- [ ] **Given** a `Pending` account on `/pending`, **When** the surface renders, **Then** the header is brand mark plus `Pending` status pill plus `Log out` only, the single action is `Log out`, and all other nav items are hidden
- [ ] **Given** a `Pending` account that deep-links to a member surface, **When** the surface renders, **Then** it shows `Your account is pending administrator approval. This part of FindBack will be available once your account is approved.` with a `Back to your account` link and does not redirect-loop
- [ ] **Given** a `Pending` account, **When** `/pending-registered` and `/pending` are compared, **Then** they remain distinct surfaces and are never merged
- [ ] **Given** a visitor on `/forgot`, **When** the form renders, **Then** it exposes a single `Email` field, a `Send reset instructions` primary button, and a `Back to sign in` secondary link
- [ ] **Given** any email address submitted at `/forgot`, **When** the response renders, **Then** `/forgot-sent` shows the heading `Check your email` and the body `If an account exists for that email address, password reset instructions have been sent.` with a `Back to sign in` link
- [ ] **Given** an unregistered, `Pending`, `Active`, `Rejected`, and `Deactivated` email submitted at `/forgot`, **When** the responses are compared, **Then** the response content, status, and observable timing do not differ, so the surface reveals no account existence
- [ ] **Given** a successful password reset, **When** the account state is read, **Then** a `Pending` account remains `Pending`, a `Rejected` account remains `Rejected`, and a `Deactivated` account remains `Deactivated`
- [ ] **Given** the ten public and auth surfaces, **When** each is rendered, **Then** every user-facing string is taken verbatim from `EXPERIENCE.md` and no string is reworded or invented
- [ ] **Given** a validation error on any of the ten surfaces, **When** it renders, **Then** no error, icon, red border, or `aria-invalid` state is present before the first submit attempt, and a field's error state clears the moment its value becomes valid

Technical Notes

- The ten surfaces are Landing, Login, Register, Register errors, Register confirmation, Pending, Rejected, Deactivated, Forgot password, Forgot-password sent. `Rejected` and `Deactivated` are login-screen error states, not routes.
- Copy authority: landing and listings §9.1; pending §9.2 and §16.3; rejected/deactivated §9.3 and §16.4; forgot password §9.3a; register and login §16.1 and §16.2; topbar pattern §5.2; error classes §4.9; restricted-permission copy §4.8.
- `Rejected` and `Deactivated` must not be distinguishable at the surface. The reason for rejection is never surfaced to the user, and no email is sent to a `Rejected` user that would expose it.
- Anti-account-enumeration on `/forgot` is a correctness requirement, not a nice-to-have. UX does not branch on account state at this surface; architecture owns reset-token format, expiry, and transport.
- The password-reset email is an authentication message under FR-51 and is not one of the eight FR-46 business events. There is no in-app notification and no in-product password-reset status surface beyond `/forgot-sent`.
- Validation is validate-after-submit with an `role="alert"` summary, per the Pass-3 validation report. Error text replaces helper text under the same `id` so the `aria-describedby` association survives.
- Register and Login forms validate on the client for affordance and on the server for authority. The server is authoritative.
- Topbar `Sign in` and `Register` are `primary` buttons, explicitly exempted from the one-primary-per-view rule because they live in the topbar region and serve anonymous visitors.

Dependencies

Requires
- 001-design-foundations-and-theme

Enables
- 003-member-view-shell-and-navigation
- 007-administrator-dashboard

Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Anonymous visitor clicks a listing row | Routes to `/login?return=/listings/:id`; no anonymous detail page is served |
| `Rejected` and `Deactivated` users attempt sign-in | Byte-identical neutral message; no internal distinction surfaces |
| `Pending` user presses the browser Back button onto a member URL | Non-blocking restricted message; no redirect loop between destination and `/pending` |
| Unregistered email submitted at `/forgot` | Identical `/forgot-sent` response as a registered email |
| Registration succeeds | Redirect to `/pending-registered`; no session is created |
| Form reloaded before first submit | No error state, no `aria-invalid`, no announcement |
| User fixes a field after a failed submit | That field's error state clears immediately on input |
| Session expires mid-flow on a protected action | Message `You've been signed out.` then route to `/login` with the return destination preserved |

Out of Scope

- Account state transitions — Unit 001
- The password-reset token mechanics and the reset completion screen — Unit 001
- Member surfaces behind authentication — stories 003 through 006
- Administrator queues — story 008
- Any in-app notification for any of these events — story 009
