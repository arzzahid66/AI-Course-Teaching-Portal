-- ClassGate migration v2 — Student Portal
-- Run this ONCE in the Neon SQL editor against your EXISTING database
-- (the one that already has students). It only adds new columns/tables and
-- never touches your existing rows.

-- 1) Student login credentials -------------------------------------------------
ALTER TABLE students ADD COLUMN IF NOT EXISTS email         text;
ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash text;

-- Make email unique (allows multiple NULLs). Safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'students_email_key'
  ) THEN
    ALTER TABLE students ADD CONSTRAINT students_email_key UNIQUE (email);
  END IF;
END$$;

-- 2) Curriculum roadmap --------------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  description text,
  planned_at  timestamptz,
  is_covered  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3) Assignments ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS assignments (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  description text,
  due_at      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assignment_status (
  id            serial PRIMARY KEY,
  assignment_id int NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id    int NOT NULL REFERENCES students(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

-- 4) Indexes -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_topics_covered ON topics(is_covered);
CREATE INDEX IF NOT EXISTS idx_astatus_assignment ON assignment_status(assignment_id);
CREATE INDEX IF NOT EXISTS idx_astatus_student ON assignment_status(student_id);
