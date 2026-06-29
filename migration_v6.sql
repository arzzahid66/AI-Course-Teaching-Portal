-- ClassGate migration v6 — Login activity logs (user tracking)
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
-- It only adds a new table + indexes and never touches your existing data.
--
-- Every successful login (student or admin) inserts one row here. The tutor
-- sees a read-only "Logs" tab in the admin panel showing who logged in, their
-- name + email, the role, the time, and the device / IP it came from.

-- ---------------------------------------------------------------------------
-- login_logs: one row per successful login
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_logs (
  id         serial PRIMARY KEY,
  student_id int REFERENCES students(id) ON DELETE SET NULL, -- null for admin logins
  role       text NOT NULL DEFAULT 'student',                -- 'student' | 'admin'
  name       text,                                           -- snapshot of the name at login time
  email      text,                                           -- email used to log in
  ip         text,                                           -- best-effort client IP
  user_agent text,                                           -- raw browser user-agent
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_student ON login_logs(student_id);
