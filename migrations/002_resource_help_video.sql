-- ---------------------------------------------------------------------------
-- 002 — "How to use this tool" video on each shared resource.
--
-- The tutor pastes a YouTube link; the student's Tools tab offers it as a
-- player right on the tool card, so someone who has never used Claude Code can
-- watch first instead of burning their booked slot working it out.
--
-- Additive and idempotent. Safe to run against a live database, and safe to
-- run twice.
--
--   node --env-file=.env scripts/apply-migration.mjs migrations/002_resource_help_video.sql
-- ---------------------------------------------------------------------------

ALTER TABLE shared_resources
  ADD COLUMN IF NOT EXISTS help_video_url text;
