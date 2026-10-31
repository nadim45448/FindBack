/**
 * Returns and Handover — domain layer.
 *
 * **The module the standards' map names for FR-23..FR-25.**
 * `system-architecture.md` § Module map reserves `returns/` for "Returned
 * confirmation, receiver substitution FR-23..FR-25", sitting between
 * `recovery/` and `audit/`. Bolt `019` is the bolt that creates it.
 *
 * **This module is the single implementation point for the Returned
 * transition.** Unit 005's brief is explicit: *"Both directions converge
 * here. There must be exactly **one** Confirm Returned implementation, not
 * one per side — otherwise the receiver and substitute rules drift apart."*
 *
 * **So the module is deliberately *one* and not two.** There is no
 * `found-returns/` and no `lost-returns/`. The direction is an *input* — the
 * report's type — and the direction selects between the two preconditions
 * and between the two event types. The rule, the guard, and the receiver
 * derivation are one body of code with two branches, not two bodies of code.
 *
 * **`claims` and `recovery` share no state machine, and this module shares
 * none with them either.** It reads the report's *type* and *status* and
 * derives a receiver; it does not import a transition table from either
 * side, and neither side imports one from here. The `Returned` status
 * belongs to the shared report vocabulary, but the *transition* into it
 * belongs only to this module.
 *
 * Pure domain logic: no I/O, no framework imports, no Prisma, no React.
 */

export * from './confirm-returned';
export * from './default-receiver';
export * from './returned-confirmation-events';
export * from './substitute-receiver';
