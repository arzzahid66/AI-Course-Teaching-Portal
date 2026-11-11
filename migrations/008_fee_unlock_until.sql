-- ---------------------------------------------------------------------------
-- 008 — Fee extension: let the tutor keep a student's portal open past the
-- normal grace period ("I'll pay next month, please unlock my portal").
--
--   * fee_invoices.unlock_until — when set, this month does not lock the
--     account until after that date, even with nothing paid. The amount still
--     shows as remaining everywhere. NULL = the normal rule
--     (due date / join date + the intake's grace_days).
--
-- Additive and idempotent. Safe to run against a live database, and twice.
--
--   node --env-file=.env scripts/apply-migration.mjs migrations/008_fee_unlock_until.sql
-- ---------------------------------------------------------------------------

ALTER TABLE fee_invoices ADD COLUMN IF NOT EXISTS unlock_until date;
