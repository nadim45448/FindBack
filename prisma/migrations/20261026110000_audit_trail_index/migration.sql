-- The trail view's index.
--
-- The Stage 2 design specified `(parent_id, occurred_at DESC, id DESC)`, but the
-- trail query filters on BOTH `parentType` and `parentId`. An index whose
-- leading column is `parentId` still matched, yet the planner could not use it
-- to supply the `occurredAt DESC, id DESC` ordering, because `parentType` was
-- an unconstrained filter in front of it. The plan was a bitmap index scan
-- followed by a Sort node.
--
-- Leading with `parentType` makes every column of the index constrained by the
-- query, so the ordering comes from the index and the plan is an index-only
-- scan with no sort. This was found by the Stage 5 performance test, which
-- asserts the plan shape at the PRD's scale.
--
-- The original `(parent_id, occurred_at DESC, id DESC)` index is kept: it
-- serves the `parentId`-only lookup used to resolve a parent whose type is
-- not yet known, and it costs only the write overhead of one more index.

CREATE INDEX "idx_audit_events_trail"
  ON "AuditEvent" USING btree ("parentType", "parentId", "occurredAt" DESC, id DESC);
