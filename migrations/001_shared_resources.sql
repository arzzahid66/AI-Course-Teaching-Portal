-- ---------------------------------------------------------------------------
-- 001 — Shared tool bookings + login-code relay
--
-- Students who have paid in full book a turn on a shared tool (the Claude Code
-- Pro plan, the OpenAI API key). The tutor approves, and for Claude relays the
-- one-time sign-in code through the portal so no password is ever shared.
--
-- Additive and idempotent: safe against a live database, and safe to run twice.
--   node --env-file=.env scripts/apply-migration.mjs migrations/001_shared_resources.sql
-- ---------------------------------------------------------------------------

-- Needed by the EXCLUDE constraint below: it mixes an int (=) with a range (&&)
-- inside one GiST index, which core GiST cannot do on its own.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS shared_resources (
  id              serial PRIMARY KEY,
  name            text NOT NULL,
  blurb           text,                              -- shown to students on the card
  handover_note   text,                              -- how they will actually get access
  max_minutes     int  NOT NULL DEFAULT 300,         -- 300 = Claude's rolling 5-hour window
  cooldown_hours  int  NOT NULL DEFAULT 24,          -- wait after a slot before booking again
  book_ahead_days int  NOT NULL DEFAULT 14,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int  NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shared_resources_name ON shared_resources(lower(name));

CREATE TABLE IF NOT EXISTS resource_requests (
  id                 serial PRIMARY KEY,
  resource_id        int  NOT NULL REFERENCES shared_resources(id) ON DELETE CASCADE,
  student_id         int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reason             text NOT NULL,
  start_at           timestamptz NOT NULL,
  end_at             timestamptz NOT NULL,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  feedback           text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_at        timestamptz,
  revoke_notified_at timestamptz,                    -- set once the slot-end email has gone out
  CONSTRAINT resource_req_window CHECK (end_at > start_at)
);

-- The "only one student at a time" rule, enforced by Postgres instead of by
-- application code: two APPROVED bookings of the same tool can never overlap,
-- however many Approve clicks land at the same moment.
DO $$ BEGIN
  ALTER TABLE resource_requests ADD CONSTRAINT resource_no_overlap
    EXCLUDE USING gist (resource_id WITH =, tstzrange(start_at, end_at) WITH &&)
    WHERE (status = 'approved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One row per "I need a sign-in code" during a slot. A slot can legitimately
-- need several (the session drops, the student switches device). `code` is
-- NULL until the tutor sends it and NULL again once used or expired, so a live
-- code is never left sitting in the database.
CREATE TABLE IF NOT EXISTS resource_login_codes (
  id           serial PRIMARY KEY,
  request_id   int  NOT NULL REFERENCES resource_requests(id) ON DELETE CASCADE,
  asked_at     timestamptz NOT NULL DEFAULT now(),
  code         text,
  sent_at      timestamptz,
  expires_at   timestamptz,
  used_at      timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_resource_req_status  ON resource_requests(status);
CREATE INDEX IF NOT EXISTS idx_resource_req_student ON resource_requests(student_id, start_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_req_window  ON resource_requests(resource_id, start_at);
CREATE INDEX IF NOT EXISTS idx_login_codes_request  ON resource_login_codes(request_id, asked_at DESC);

-- Seed the two tools that exist today. The tutor edits these in Admin -> Tools.
INSERT INTO shared_resources (name, blurb, handover_note, max_minutes, cooldown_hours, sort_order)
VALUES
  ('Claude Code Pro',
   'Shared Claude Code Pro plan. Claude allows a rolling 5-hour usage window, so one booking is at most 5 hours.',
   'Slot ke doran is page se login code mangwayein — tutor turant bhej dega. Password kabhi share nahi hoga.',
   300, 24, 0),
  ('OpenAI API key',
   'Shared OpenAI API key for practice. Keep your spending small and stop as soon as your slot ends.',
   'Key WhatsApp par milegi. Slot khatam hote hi use karna band kar dein.',
   180, 24, 1)
ON CONFLICT DO NOTHING;
