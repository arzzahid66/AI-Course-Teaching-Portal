-- ---------------------------------------------------------------------------
-- 005 — weekly content is more than videos.
--
-- A weekend's items used to be videos only (topic / hands_on / extra), so
-- slides and code were added as "extra" videos and showed a play button. Three
-- non-video kinds are added:
--
--   slides  - a deck (Google Slides, PDF, PPT…)
--   code    - a repo, gist or code file
--   doc     - notes, an article, any other link
--
-- Non-video kinds have no "watched" tick and never count towards the
-- progress score (only topic + hands_on do, as before).
--
-- The CHECK is only widened, so every existing row still satisfies it.
-- Additive and idempotent. Safe to run against a live database, and twice.
--
--   node --env-file=.env scripts/apply-migration.mjs migrations/005_weekend_content_kinds.sql
-- ---------------------------------------------------------------------------

ALTER TABLE weekend_videos DROP CONSTRAINT IF EXISTS weekend_videos_kind_check;

ALTER TABLE weekend_videos ADD CONSTRAINT weekend_videos_kind_check
  CHECK (kind IN ('topic', 'hands_on', 'extra', 'slides', 'code', 'doc'));
