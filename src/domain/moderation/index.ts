/**
 * Moderation — domain layer.
 *
 * **The module the standards' map names for FR-33..FR-36.** The module map
 * in `system-architecture.md` reserves `moderation/` for "Close, remove
 * content, administrator queues", sitting after `audit/`. Bolt `020` is the
 * bolt that creates it.
 *
 * **Content removal lives here, and not in `listings/`.** The removal is a
 * moderation act with its own record and its own rule — the report's
 * lifecycle and its listing projection are `listings/`'s business, and the
 * administrator's decision to withhold a member's content is neither.
 *
 * **The removal preserves rather than deletes.** The audit trail is
 * append-only (ADR-6), so a record naming removed content must be able to
 * point at content that still exists. The removal is a row; the content is
 * marked withheld, not deleted.
 *
 * Pure domain logic: no I/O, no framework imports, no Prisma, no React.
 */

export * from './content-removal';
