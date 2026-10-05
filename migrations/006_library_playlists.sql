-- ---------------------------------------------------------------------------
-- 006 — Library playlists.
--
-- A playlist is a topic guide ("GitHub complete guide", "LangChain") whose
-- videos play in order. Students first see only the playlist's title card and
-- open it to see the videos. A library video with no playlist stays a general
-- video, shown on its own as before.
--
--   * library_playlists.is_published lets the tutor build a playlist privately
--     and show it once it is complete. A hidden playlist's videos are hidden
--     from students too (they do not leak into the general list).
--   * Deleting a playlist never deletes videos: they fall back to general
--     (ON DELETE SET NULL).
--   * library_videos.category (from 004) is no longer used by the app. Every
--     existing category is turned into a playlist of the same name and its
--     videos are moved in, so nothing a tutor already grouped is lost. The
--     column itself is kept, untouched.
--
-- Additive and idempotent. Safe to run against a live database, and twice.
--
--   node --env-file=.env scripts/apply-migration.mjs migrations/006_library_playlists.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS library_playlists (
  id           serial PRIMARY KEY,
  title        text NOT NULL,
  description  text,
  sort_order   int  NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- One playlist per name (case-insensitive), so a re-run never duplicates one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_playlists_title ON library_playlists (lower(title));

ALTER TABLE library_videos
  ADD COLUMN IF NOT EXISTS playlist_id int REFERENCES library_playlists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_library_videos_playlist ON library_videos (playlist_id, sort_order, id);

-- Existing categories become playlists...
INSERT INTO library_playlists (title)
SELECT DISTINCT btrim(category)
FROM library_videos
WHERE COALESCE(btrim(category), '') <> ''
ON CONFLICT (lower(title)) DO NOTHING;

-- ...and their videos move in (only ones not already in a playlist).
UPDATE library_videos v
SET playlist_id = p.id
FROM library_playlists p
WHERE v.playlist_id IS NULL
  AND COALESCE(btrim(v.category), '') <> ''
  AND lower(p.title) = lower(btrim(v.category));
