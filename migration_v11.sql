-- ClassGate migration v11 — MCQ Quizzes (modules students attempt)
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
-- It only adds new tables + indexes and never touches your existing rows.
--
-- The tutor creates quiz "modules" (e.g. "AI Basics") in the admin "Quiz" tab.
-- Each quiz has its own questions + options, a total time limit, a pass mark %
-- and an attempt limit. A student picks a published quiz and attempts it — a
-- countdown starts on Start, and an attempt is consumed the moment they start.
-- A question may have several correct options; it scores only when the student
-- picks EXACTLY the correct set. Two attempts per quiz; if both fail the student
-- is blocked and can request a re-attempt, which the tutor approves for 2 more.
--
-- IMPORTANT: quiz_options.is_correct is the answer key — it is never sent to the
-- browser. Scoring happens entirely server-side (see src/actions/quiz.ts).


CREATE TABLE IF NOT EXISTS quizzes (
  id             serial PRIMARY KEY,
  title          text NOT NULL,                      -- e.g. "AI Basics"
  description    text,                                -- optional short note
  time_limit_sec int  NOT NULL DEFAULT 600,           -- total quiz timer (seconds)
  pass_percent   int  NOT NULL DEFAULT 50,            -- admin-set pass mark
  max_attempts   int  NOT NULL DEFAULT 2,             -- base attempts per student
  is_published   boolean NOT NULL DEFAULT false,      -- hidden from students until true
  sort_order     int  NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id         serial PRIMARY KEY,
  quiz_id    int  NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  body       text NOT NULL,
  sort_order int  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_options (
  id          serial PRIMARY KEY,
  question_id int  NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  body        text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false,         -- answer key — NEVER sent to students
  sort_order  int  NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id           serial PRIMARY KEY,
  quiz_id      int  NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id   int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'in_progress'
                 CHECK (status IN ('in_progress', 'submitted')),
  score        int,                                   -- fully-correct questions (snapshot)
  total        int,                                   -- question count at attempt time (snapshot)
  percent      int,                                   -- round(score / total * 100)
  passed       boolean,
  started_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,                  -- started_at + time_limit_sec
  submitted_at timestamptz
);

CREATE TABLE IF NOT EXISTS quiz_reattempt_requests (
  id             serial PRIMARY KEY,
  quiz_id        int  NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id     int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  grant_attempts int  NOT NULL DEFAULT 2,             -- extra attempts an approval grants
  feedback       text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  reviewed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz   ON quiz_questions(quiz_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_quiz_options_question ON quiz_options(question_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student ON quiz_attempts(student_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_reattempt_status ON quiz_reattempt_requests(status);
CREATE INDEX IF NOT EXISTS idx_quiz_reattempt_pair   ON quiz_reattempt_requests(student_id, quiz_id);
