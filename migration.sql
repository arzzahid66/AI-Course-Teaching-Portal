-- ClassGate database schema (full / fresh install)
-- Run this in the Neon SQL editor (or `psql`) once, against a NEW database.
-- If you already ran an earlier version, run migration_v2.sql instead.

-- ---------------------------------------------------------------------------
-- students  (now log in with email + password; token kept for backward-compat)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  whatsapp      text,
  gender        text,
  token          text UNIQUE,
  email          text UNIQUE,
  password_hash  text,
  password_plain text,
  status         text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- sessions (one live class at a time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           serial PRIMARY KEY,
  title        text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  meet_link    text NOT NULL,
  code         text NOT NULL,
  is_open      boolean NOT NULL DEFAULT true,
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- attendance (one row per student per session)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
  id            serial PRIMARY KEY,
  student_id    int NOT NULL REFERENCES students(id),
  session_id    int NOT NULL REFERENCES sessions(id),
  status        text NOT NULL,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id)
);

-- ---------------------------------------------------------------------------
-- ledger (penalties add to balance, payments reduce it)
-- balance = SUM(penalty.amount) - SUM(payment.amount)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ledger (
  id         serial PRIMARY KEY,
  student_id int NOT NULL REFERENCES students(id),
  type       text NOT NULL CHECK (type IN ('penalty', 'payment')),
  amount     numeric NOT NULL,
  reason     text,
  session_id int,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- topics (standalone curriculum roadmap: upcoming vs covered)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  description text,
  planned_at  timestamptz,
  is_covered  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- assignments (class-wide tasks; students submit proof over WhatsApp)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  description text,
  due_at      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- assignment_status (per-student completion; admin toggles 'done')
-- A missing row means 'pending'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignment_status (
  id            serial PRIMARY KEY,
  assignment_id int NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    int NOT NULL REFERENCES students(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

-- ---------------------------------------------------------------------------
-- questions (students ask the tutor; tutor replies + marks resolved)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id          serial PRIMARY KEY,
  student_id  int NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject     text,
  body        text NOT NULL,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  answer      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_questions_student ON questions(student_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_ledger_student ON ledger(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_open ON sessions(is_open);
CREATE INDEX IF NOT EXISTS idx_topics_covered ON topics(is_covered);
CREATE INDEX IF NOT EXISTS idx_astatus_assignment ON assignment_status(assignment_id);
CREATE INDEX IF NOT EXISTS idx_astatus_student ON assignment_status(student_id);
