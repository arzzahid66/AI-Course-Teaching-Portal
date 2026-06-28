-- ClassGate migration v3 — Student Questions (Q&A)
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
-- It only adds a new table and never touches your existing rows.
--
-- Students post a question/problem from their portal ("Ask" tab); the tutor
-- sees every question in the admin "Questions" tab with the student's name and
-- email, and can reply + mark it resolved.

CREATE TABLE IF NOT EXISTS questions (
  id          serial PRIMARY KEY,
  student_id  int NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject     text,                       -- optional short topic, e.g. "Fees" / "Lesson 5"
  body        text NOT NULL,              -- the actual question / problem
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  answer      text,                       -- tutor's reply (shown back to the student)
  created_at  timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_questions_student ON questions(student_id);
CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
CREATE INDEX IF NOT EXISTS idx_questions_created ON questions(created_at DESC);
