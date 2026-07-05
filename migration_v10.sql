-- ClassGate migration v10 — Leave requests (student appeals for an absence)
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
-- It only adds a new table + indexes and never touches your existing rows.
--
-- A student can appeal for leave from the NEXT scheduled class ("Leave" tab).
-- We snapshot the target lesson (title + time) and the exact submission time so
-- the record stays meaningful even if the session is later edited or deleted.
-- The tutor sees every request in the admin "Leave" tab and can approve, reject
-- or leave feedback — the student sees the decision + feedback back on their tab.

CREATE TABLE IF NOT EXISTS leave_requests (
  id           serial PRIMARY KEY,
  student_id   int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id   int  REFERENCES sessions(id) ON DELETE SET NULL, -- the next class, if any
  lesson_title text,                        -- snapshot of the class title at submit time
  lesson_at    timestamptz,                 -- snapshot of the class time at submit time
  reason       text NOT NULL,               -- why the student needs leave
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  feedback     text,                         -- tutor's note (shown back to the student)
  created_at   timestamptz NOT NULL DEFAULT now(), -- exact submission date + time
  reviewed_at  timestamptz                   -- when the tutor approved / rejected it
);

CREATE INDEX IF NOT EXISTS idx_leave_student ON leave_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_leave_status  ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_created ON leave_requests(created_at DESC);
