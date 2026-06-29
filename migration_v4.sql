-- ClassGate migration v4 — admin-visible student passwords
-- Run this ONCE in the Neon SQL editor against your EXISTING database.
--
-- Stores the plaintext password ALONGSIDE the existing scrypt hash so the admin
-- can view a student's login password in the dashboard.
--
-- SECURITY NOTE: this means anyone with database access can read every student's
-- password. Only acceptable because these are low-stakes class-portal logins set
-- by the tutor. The login check still uses the secure hash; password_plain is
-- only for the admin "show password" feature. Passwords set BEFORE this column
-- existed will be NULL (not viewable) until reset to a new one.

ALTER TABLE students ADD COLUMN IF NOT EXISTS password_plain text;
