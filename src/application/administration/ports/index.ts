/**
 * The administrator module's ports.
 *
 * These are the module's own capabilities — the four operational queues and
 * the contextual audit read — and they live under
 * `application/administration/ports/` rather than the shared
 * `application/ports/`, on the same rule ADR-9 applied to the audit event
 * catalogue.
 *
 * The audit trail's own ports — the event repository, the read log — stay
 * where they are, in `application/ports/`, because Unit 006 owns them and
 * this module reads them rather than redefining them.
 */

export * from './queue-reader';
