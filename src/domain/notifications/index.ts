/**
 * Notifications — domain layer.
 *
 * **The module the standards' map names for FR-27..FR-30 and FR-46.** The
 * module map in `system-architecture.md` reserves `notifications/` for the
 * eight workflow emails plus the reset message.
 *
 * **This module owns the Lost-side half; the Found-side emails stay with
 * the modules that trigger them.** ADR-14 records the general rule: *an
 * email's owner is the module that owns its trigger*. The account approval
 * email is triggered by an account lifecycle transition, so `accounts/` owns
 * it. The Lost-side emails are triggered by the Recovery Response lifecycle
 * and by the report's terminal transitions, so they are owned here — but the
 * *content* of events 4 and 6 already lives with the workflows that
 * trigger them, in `application/listings/`, and this module owns the
 * **catalogue and the gates**: which events exist, who each is addressed
 * to, and under what conditions each may fire.
 *
 * **The catalogue is closed.** FR-30 forbids unsupported channels and
 * events. A sixth Lost-side event could not be named here, and the event-8
 * gate — `Completed — Report Returned` **and** report `Returned` — is
 * stated as data, so a caller's gate and this table cannot disagree.
 *
 * Pure domain logic: no I/O, no framework imports, no Prisma, no React.
 */

export * from './lost-side-notifications';
