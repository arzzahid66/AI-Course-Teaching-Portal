-- ClassGate migration v9 — Library (recorded lectures + slides / materials)
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
-- It only adds a new table + index and never touches your existing data.
--
-- One universal "Library" section. Each row is a single item the tutor adds
-- from the admin "Library" tab and every student sees (read-only) on their
-- "Library" tab. An item can carry a recorded-lecture link (YouTube) and/or a
-- slides / materials link (Google Drive) — either or both.

CREATE TABLE IF NOT EXISTS resources (
  id          serial PRIMARY KEY,
  sort_order  int  NOT NULL DEFAULT 0,   -- controls display order (newest/topic order)
  title       text NOT NULL,             -- e.g. "Week 2 — How the Internet Works"
  description text,                       -- optional short note shown under the title
  video_url   text,                       -- recorded lecture link (YouTube), optional
  slides_url  text,                       -- slides / materials link (Google Drive), optional
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_order ON resources(sort_order, id);
