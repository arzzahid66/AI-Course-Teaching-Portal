"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/course";
import {
  addMonths,
  EXPENSE_CATEGORIES,
  type FinanceBoard,
  type FinanceExpense,
  type FinancePartner,
  type FinanceTransfer,
  type Recurrence,
} from "@/lib/finance";

const USD_RATE_KEY = "finance_usd_rate";
const DEFAULT_USD_RATE = 280;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Tables
//
// The Finance tables create themselves the first time the tab is used, so
// nobody has to remember to run migrations/007_finance.sql (that file holds
// the same statements, for reference and for a manual run). Every statement
// is IF NOT EXISTS: running it again changes nothing.
// ---------------------------------------------------------------------------

let tablesReady: Promise<void> | null = null;

function ensureTables(): Promise<void> {
  tablesReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS finance_partners (
        id            serial PRIMARY KEY,
        name          text NOT NULL,
        share_pct     numeric(5,2) NOT NULL DEFAULT 0 CHECK (share_pct >= 0 AND share_pct <= 100),
        receives_fees boolean NOT NULL DEFAULT false,
        sort_order    int NOT NULL DEFAULT 0,
        created_at    timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_partners_collector
        ON finance_partners (receives_fees) WHERE receives_fees
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS finance_expenses (
        id             serial PRIMARY KEY,
        spent_on       date NOT NULL,
        title          text NOT NULL,
        category       text NOT NULL DEFAULT 'Other',
        amount         int  NOT NULL CHECK (amount > 0),
        currency       text NOT NULL DEFAULT 'PKR' CHECK (currency IN ('PKR', 'USD')),
        foreign_amount numeric(12,2),
        paid_by        int REFERENCES finance_partners(id) ON DELETE RESTRICT,
        recurrence     text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'monthly', 'yearly')),
        note           text,
        created_at     timestamptz NOT NULL DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_finance_expenses_spent_on ON finance_expenses (spent_on DESC, id DESC)`;
    await sql`
      CREATE TABLE IF NOT EXISTS finance_transfers (
        id           serial PRIMARY KEY,
        from_partner int  NOT NULL REFERENCES finance_partners(id) ON DELETE RESTRICT,
        to_partner   int  NOT NULL REFERENCES finance_partners(id) ON DELETE RESTRICT,
        amount       int  NOT NULL CHECK (amount > 0),
        sent_on      date NOT NULL,
        note         text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        CHECK (from_partner <> to_partner)
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_finance_transfers_sent_on ON finance_transfers (sent_on DESC, id DESC)`;
  })().catch((e) => {
    tablesReady = null; // try again on the next request
    throw e;
  });
  return tablesReady;
}

/**
 * Run a Finance change. Any failure comes back as a readable message on the
 * form instead of the production "Server Components render" crash screen.
 */
async function guarded(fn: () => Promise<string | void>): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await ensureTables();
    const error = await fn();
    if (error) return { error };
  } catch (e) {
    console.error("[finance]", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (/foreign key|violates/i.test(msg)) {
      return { error: "This tutor already has expenses or payments recorded, so they can't be removed. Set their share to 0% instead." };
    }
    return { error: "Could not save. Please try again." };
  }
  revalidatePath("/admin");
  return {};
}

/** Everything the Finance tab shows, across all intakes. Fee income is read live from `payments`. */
export async function getFinanceBoard(): Promise<FinanceBoard> {
  await assertAdmin();
  await ensureTables();
  const [partners, expenses, transfers, income, expected, rate, today] = await Promise.all([
    sql`SELECT id, name, share_pct, receives_fees, sort_order FROM finance_partners ORDER BY sort_order, id`,
    sql`
      SELECT id, to_char(spent_on, 'YYYY-MM-DD') AS spent_on, title, category, amount, currency,
        foreign_amount, paid_by, recurrence, note
      FROM finance_expenses ORDER BY spent_on DESC, id DESC
    `,
    sql`
      SELECT id, from_partner, to_partner, amount, to_char(sent_on, 'YYYY-MM-DD') AS sent_on, note
      FROM finance_transfers ORDER BY sent_on DESC, id DESC
    `,
    sql`
      SELECT to_char(p.paid_at AT TIME ZONE 'Asia/Karachi', 'YYYY-MM') AS ym, b.name AS intake,
        SUM(p.amount)::int AS amount, COUNT(DISTINCT p.receipt_no)::int AS receipts
      FROM payments p
      JOIN fee_invoices i ON i.id = p.invoice_id
      JOIN enrollments e ON e.id = i.enrollment_id
      JOIN batches b ON b.id = e.batch_id
      GROUP BY 1, 2
    `,
    sql`
      SELECT to_char(i.due_date, 'YYYY-MM') AS ym, SUM(GREATEST(0, i.amount - i.discount))::int AS amount
      FROM fee_invoices i JOIN enrollments e ON e.id = i.enrollment_id
      WHERE e.status <> 'dropped'
      GROUP BY 1
    `,
    getSetting(USD_RATE_KEY),
    sql`SELECT to_char((now() AT TIME ZONE 'Asia/Karachi')::date, 'YYYY-MM-DD') AS today`,
  ]);
  const usdRate = Number(rate);
  return {
    partners: (partners as FinancePartner[]).map((p) => ({ ...p, share_pct: Number(p.share_pct) })),
    expenses: (expenses as FinanceExpense[]).map((e) => ({
      ...e,
      foreign_amount: e.foreign_amount == null ? null : Number(e.foreign_amount),
    })),
    transfers: transfers as FinanceTransfer[],
    income: (income as FinanceBoard["income"]).map((r) => ({ ...r, amount: Number(r.amount) })),
    expected: (expected as FinanceBoard["expected"]).map((r) => ({ ...r, amount: Number(r.amount) })),
    usdRate: usdRate > 0 ? usdRate : DEFAULT_USD_RATE,
    today: (today as { today: string }[])[0].today,
  };
}

// ---- Partners -------------------------------------------------------------

/** First-time setup: create every partner at once with equal shares. The chosen one collects the fees. */
export async function setupPartners(formData: FormData): Promise<{ error?: string }> {
  return guarded(async () => {
    const names = formData
      .getAll("name")
      .map((n) => String(n).trim())
      .filter(Boolean);
    if (names.length === 0) return "Write at least one tutor's name.";
    const existing = (await sql`SELECT COUNT(*)::int AS n FROM finance_partners`) as { n: number }[];
    if (existing[0].n > 0) return "Tutors are already added. Use Edit instead.";
    const collector = Math.min(Number(formData.get("collector") ?? 0) || 0, names.length - 1);
    const share = Math.round((100 / names.length) * 100) / 100;
    for (const [i, name] of names.entries()) {
      await sql`
        INSERT INTO finance_partners (name, share_pct, receives_fees, sort_order)
        VALUES (${name}, ${share}, ${i === collector}, ${i})
      `;
    }
  });
}

export async function savePartner(id: number | null, formData: FormData): Promise<{ error?: string }> {
  return guarded(async () => {
    const name = String(formData.get("name") ?? "").trim();
    const share = Number(formData.get("share_pct"));
    const receivesFees = formData.get("receives_fees") === "on";
    if (!name) return "Name is required.";
    if (!Number.isFinite(share) || share < 0 || share > 100) return "Share must be between 0 and 100%.";

    // Only one tutor collects the fees: hand the flag over before setting it.
    if (receivesFees) {
      await sql`UPDATE finance_partners SET receives_fees = false WHERE receives_fees AND id IS DISTINCT FROM ${id}::int`;
    }
    if (id) {
      await sql`
        UPDATE finance_partners SET name = ${name}, share_pct = ${share}, receives_fees = ${receivesFees}
        WHERE id = ${id}
      `;
    } else {
      await sql`
        INSERT INTO finance_partners (name, share_pct, receives_fees, sort_order)
        VALUES (${name}, ${share}, ${receivesFees}, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM finance_partners))
      `;
    }
  });
}

export async function deletePartner(id: number): Promise<{ error?: string }> {
  return guarded(async () => {
    await sql`DELETE FROM finance_partners WHERE id = ${id}`;
  });
}

// ---- Expenses -------------------------------------------------------------

export async function saveExpense(id: number | null, formData: FormData): Promise<{ error?: string }> {
  return guarded(async () => {
    const text = (k: string) => String(formData.get(k) ?? "").trim();
    const title = text("title");
    const spentOn = text("spent_on");
    const category = (EXPENSE_CATEGORIES as readonly string[]).includes(text("category")) ? text("category") : "Other";
    const currency = text("currency") === "USD" ? "USD" : "PKR";
    const recurrence: Recurrence = (["monthly", "yearly"] as const).find((r) => r === text("recurrence")) ?? "none";
    const paidBy = Number(text("paid_by")) || null;
    const note = text("note") || null;
    if (!title) return "What did you buy? Write its name.";
    if (!YMD.test(spentOn)) return "Pick the date you paid.";

    let amount: number;
    let foreign: number | null = null;
    if (currency === "USD") {
      foreign = Number(text("foreign_amount"));
      const rate = Number(text("usd_rate")) || Number(await getSetting(USD_RATE_KEY)) || DEFAULT_USD_RATE;
      if (!(foreign > 0)) return "Enter the amount in dollars.";
      // The PKR field wins when filled: it is what the bank actually charged.
      amount = Math.round(Number(text("amount")) || foreign * rate);
      if (text("usd_rate")) await setSetting(USD_RATE_KEY, String(rate));
    } else {
      amount = Math.round(Number(text("amount")));
    }
    if (!(amount > 0)) return "Enter the amount.";

    if (id) {
      await sql`
        UPDATE finance_expenses SET spent_on = ${spentOn}, title = ${title}, category = ${category},
          amount = ${amount}, currency = ${currency}, foreign_amount = ${foreign}, paid_by = ${paidBy},
          recurrence = ${recurrence}, note = ${note}
        WHERE id = ${id}
      `;
    } else {
      await sql`
        INSERT INTO finance_expenses (spent_on, title, category, amount, currency, foreign_amount, paid_by, recurrence, note)
        VALUES (${spentOn}, ${title}, ${category}, ${amount}, ${currency}, ${foreign}, ${paidBy}, ${recurrence}, ${note})
      `;
    }
  });
}

export async function deleteExpense(id: number): Promise<{ error?: string }> {
  return guarded(async () => {
    await sql`DELETE FROM finance_expenses WHERE id = ${id}`;
  });
}

/**
 * Log the next payment of a subscription: a copy of its latest payment dated
 * on the renewal day. A dollar plan is re-priced at the saved dollar rate.
 */
export async function renewSubscription(expenseId: number): Promise<{ error?: string }> {
  return guarded(async () => {
    const rows = (await sql`
      SELECT id, to_char(spent_on, 'YYYY-MM-DD') AS spent_on, title, category, amount, currency,
        foreign_amount, paid_by, recurrence, note
      FROM finance_expenses WHERE id = ${expenseId}
    `) as FinanceExpense[];
    const e = rows[0];
    if (!e || e.recurrence === "none") return "That subscription was not found.";
    const next = addMonths(e.spent_on, e.recurrence === "yearly" ? 12 : 1);
    const rate = Number(await getSetting(USD_RATE_KEY)) || DEFAULT_USD_RATE;
    const amount = e.currency === "USD" && e.foreign_amount ? Math.round(Number(e.foreign_amount) * rate) : e.amount;
    await sql`
      INSERT INTO finance_expenses (spent_on, title, category, amount, currency, foreign_amount, paid_by, recurrence, note)
      VALUES (${next}, ${e.title}, ${e.category}, ${amount}, ${e.currency}, ${e.foreign_amount}, ${e.paid_by},
        ${e.recurrence}, ${e.note})
    `;
  });
}

/** Cancelled a subscription: its latest payment stops repeating, so the reminders stop. */
export async function stopSubscription(expenseId: number): Promise<{ error?: string }> {
  return guarded(async () => {
    await sql`UPDATE finance_expenses SET recurrence = 'none' WHERE id = ${expenseId}`;
  });
}

// ---- Transfers between partners -------------------------------------------

export async function saveTransfer(formData: FormData): Promise<{ error?: string }> {
  return guarded(async () => {
    const from = Number(formData.get("from_partner"));
    const to = Number(formData.get("to_partner"));
    const amount = Math.round(Number(formData.get("amount")));
    const sentOn = String(formData.get("sent_on") ?? "");
    const note = String(formData.get("note") ?? "").trim() || null;
    if (!from || !to) return "Pick who paid and who received.";
    if (from === to) return "A tutor cannot pay themselves.";
    if (!(amount > 0)) return "Enter the amount sent.";
    if (!YMD.test(sentOn)) return "Pick the date.";
    await sql`
      INSERT INTO finance_transfers (from_partner, to_partner, amount, sent_on, note)
      VALUES (${from}, ${to}, ${amount}, ${sentOn}, ${note})
    `;
  });
}

export async function deleteTransfer(id: number): Promise<{ error?: string }> {
  return guarded(async () => {
    await sql`DELETE FROM finance_transfers WHERE id = ${id}`;
  });
}
