-- ---------------------------------------------------------------------------
-- 004 — Library: general videos every student can watch.
--
-- Unlike weekend_videos, a library video belongs to no weekend, level or
-- intake: the tutor adds it once and every signed-in student sees it. It is
-- not counted in the progress score. `category` is a free-text heading the
-- portal groups by (e.g. "Career", "Tools"); empty means "General".
--
-- Additive and idempotent. Safe to run against a live database, and twice.
--
--   node --env-file=.env scripts/apply-migration.mjs migrations/004_library_videos.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS library_videos (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  url         text NOT NULL,
  description text,
  category    text,
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_library_videos ON library_videos(category, sort_order, id);
