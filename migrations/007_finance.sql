-- ---------------------------------------------------------------------------
-- 007 — Finance: partners, business expenses and partner settlements.
--
-- The course is run by several tutors (partners) who split the profit, while
-- every student fee lands in ONE partner's account. This adds what the Admin
-- → Finance tab needs to keep that straight:
--
--   * finance_partners   — the tutors, their profit share (%) and which one
--                          receives the student fees (receives_fees).
--   * finance_expenses   — money spent on the business (Claude Code, API keys,
--                          domain, hosting...). Amount is always stored in PKR;
--                          a USD purchase also keeps its original dollar figure.
--                          recurrence marks a subscription so the app can warn
--                          before the next renewal.
--   * finance_transfers  — one partner paying another to settle up.
--
-- Fee income itself is NOT copied anywhere: it is read live from `payments`,
-- so the Finance tab can never disagree with the Fees tab.
--
-- Additive and idempotent. Safe to run against a live database, and twice.
--
--   node --env-file=.env scripts/apply-migration.mjs migrations/007_finance.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_partners (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  share_pct     numeric(5,2) NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
  receives_fees boolean NOT NULL DEFAULT false,
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- At most one partner collects the student fees.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_partners_collector
  ON finance_partners (receives_fees) WHERE receives_fees;

CREATE TABLE IF NOT EXISTS finance_expenses (
  id             serial PRIMARY KEY,
  spent_on       date NOT NULL,
  title          text NOT NULL,
  category       text NOT NULL DEFAULT 'Other',
  amount         int  NOT NULL CHECK (amount > 0),          -- PKR
  currency       text NOT NULL DEFAULT 'PKR' CHECK (currency IN ('PKR', 'USD')),
  foreign_amount numeric(12,2),                             -- the USD figure, when currency = 'USD'
  paid_by        int REFERENCES finance_partners(id) ON DELETE RESTRICT,
  recurrence     text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'monthly', 'yearly')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_spent_on ON finance_expenses (spent_on DESC, id DESC);

CREATE TABLE IF NOT EXISTS finance_transfers (
  id           serial PRIMARY KEY,
  from_partner int  NOT NULL REFERENCES finance_partners(id) ON DELETE RESTRICT,
  to_partner   int  NOT NULL REFERENCES finance_partners(id) ON DELETE RESTRICT,
  amount       int  NOT NULL CHECK (amount > 0),
  sent_on      date NOT NULL,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (from_partner <> to_partner)
);

CREATE INDEX IF NOT EXISTS idx_finance_transfers_sent_on ON finance_transfers (sent_on DESC, id DESC);
