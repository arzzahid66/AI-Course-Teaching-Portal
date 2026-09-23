-- ---------------------------------------------------------------------------
-- 003 — more than one student on a tool at once, and no forced duration cap.
--
-- Until now a tool had exactly one holder: an EXCLUDE constraint refused any
-- second approved booking whose window overlapped. The Claude Code Pro plan
-- can actually carry a few people at the same time, so a tool now has a
-- `capacity`, and each approved booking takes one numbered `seat` inside it.
--
-- The two halves of the rule live in different places, deliberately:
--
--   * the DATABASE guarantees no two approved bookings ever share a seat in
--     overlapping windows (the constraint below). This is what makes two
--     tutors clicking Approve at the same instant safe - both may read the
--     same free seat, but only one INSERT survives.
--   * the APP guarantees a seat number never exceeds the tool's capacity
--     (findFreeSeat only ever offers 1..capacity).
--
-- So capacity cannot be exceeded through the portal. It CAN be exceeded by
-- hand-written SQL that names a seat above the capacity - a CHECK constraint
-- cannot see another table's column, and a trigger was not worth it here.
--
--   capacity = 3  ->  seats 1, 2, 3, each independently non-overlapping
--   capacity = 1  ->  exactly the old behaviour
--
-- `max_minutes = 0` now means "no cap" (see validateWindow).
--
-- Additive and idempotent. Safe to run against a live database, and twice.
--
--   node --env-file=.env scripts/apply-migration.mjs migrations/003_resource_capacity.sql
-- ---------------------------------------------------------------------------

ALTER TABLE shared_resources
  ADD COLUMN IF NOT EXISTS capacity int NOT NULL DEFAULT 1;

ALTER TABLE resource_requests
  ADD COLUMN IF NOT EXISTS seat int NOT NULL DEFAULT 1;

-- Existing approved bookings all sat on the single implicit seat, which is
-- seat 1 — the DEFAULT above already put them there, so nothing to backfill.

-- Swap the one-holder rule for the per-seat rule. Dropping first is safe: the
-- new constraint is strictly weaker, so every row that satisfied the old one
-- still satisfies this one, and the ADD would fail (leaving the transaction to
-- roll back) if that were ever untrue.
ALTER TABLE resource_requests DROP CONSTRAINT IF EXISTS resource_no_overlap;

DO $$ BEGIN
  ALTER TABLE resource_requests ADD CONSTRAINT resource_no_overlap
    EXCLUDE USING gist (
      resource_id WITH =,
      seat        WITH =,
      tstzrange(start_at, end_at) WITH &&
    )
    WHERE (status = 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The two tools this was built for: Claude Code Pro carries three students at
-- once with no duration cap; the OpenAI key stays one at a time.
UPDATE shared_resources
   SET capacity = 3, max_minutes = 0
 WHERE lower(name) = 'claude code pro';
