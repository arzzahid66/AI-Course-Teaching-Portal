-- ClassGate migration v12 — Quiz: random subset per attempt
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
-- It only adds two columns (both backwards-compatible) and touches no data.
--
-- questions_per_attempt: how many questions to SHOW a student per attempt,
--   drawn at random from the quiz's full question pool. 0 = show them all.
-- quiz_attempts.question_ids: the exact question ids served for that attempt,
--   in the order shown — so scoring uses only the questions the student saw and
--   a resumed attempt shows the same set.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS questions_per_attempt int NOT NULL DEFAULT 0;

ALTER TABLE quiz_attempts
  ADD COLUMN IF NOT EXISTS question_ids int[];
