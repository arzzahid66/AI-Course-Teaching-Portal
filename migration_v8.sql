-- v8: push subscriptions for Web Push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student', -- 'student' | 'admin'
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_student_id_idx ON push_subscriptions(student_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_role_idx ON push_subscriptions(role);
