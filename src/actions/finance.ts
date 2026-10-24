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

/** Everything the Finance tab shows, across all intakes. Fee income is read live from `payments`. */
export async function getFinanceBoard(): Promise<FinanceBoard> {
  await assertAdmin();
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

function done() {
  revalidatePath("/admin");
  return {};
}

/** Postgres refuses to delete a row other rows still point at (ON DELETE RESTRICT). */
function isInUse(e: unknown) {
  return e instanceof Error && /foreign key|violates/i.test(e.message);
}

// ---- Partners -------------------------------------------------------------

/** First-time setup: create every partner at once with equal shares. The first collects the fees. */
export async function setupPartners(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const names = formData
    .getAll("name")
    .map((n) => String(n).trim())
    .filter(Boolean);
  if (names.length === 0) return { error: "Add at least one partner's name." };
  const existing = (await sql`SELECT COUNT(*)::int AS n FROM finance_partners`) as { n: number }[];
  if (existing[0].n > 0) return { error: "Partners are already set up. Edit them instead." };
  const collector = Number(formData.get("collector") ?? 0);
  const share = Math.round((100 / names.length) * 100) / 100;
  for (const [i, name] of names.entries()) {
    await sql`
      INSERT INTO finance_partners (name, share_pct, receives_fees, sort_order)
      VALUES (${name}, ${share}, ${i === collector}, ${i})
    `;
  }
  return done();
}

export async function savePartner(id: number | null, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const share = Number(formData.get("share_pct"));
  const receivesFees = formData.get("receives_fees") === "on";
  if (!name) return { error: "Name is required." };
  if (!Number.isFinite(share) || share < 0 || share > 100) return { error: "Share must be between 0 and 100%." };

  // Only one partner collects the fees: hand the flag over before setting it.
  if (receivesFees) await sql`UPDATE finance_partners SET receives_fees = false WHERE receives_fees AND id IS DISTINCT FROM ${id}::int`;
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
  return done();
}

export async function deletePartner(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM finance_partners WHERE id = ${id}`;
  } catch (e) {
    if (isInUse(e)) return { error: "This partner has expenses or transfers recorded. Set their share to 0% instead." };
    throw e;
  }
  return done();
}

// ---- Expenses -------------------------------------------------------------

export async function saveExpense(id: number | null, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const title = text("title");
  const spentOn = text("spent_on");
  const category = (EXPENSE_CATEGORIES as readonly string[]).includes(text("category")) ? text("category") : "Other";
  const currency = text("currency") === "USD" ? "USD" : "PKR";
  const recurrence: Recurrence = (["monthly", "yearly"] as const).find((r) => r === text("recurrence")) ?? "none";
  const paidBy = Number(text("paid_by")) || null;
  const note = text("note") || null;
  if (!title) return { error: "What did you buy? Add a title." };
  if (!YMD.test(spentOn)) return { error: "Pick the date you paid." };

  let amount: number;
  let foreign: number | null = null;
  if (currency === "USD") {
    foreign = Number(text("foreign_amount"));
    const rate = Number(text("usd_rate"));
    if (!(foreign > 0)) return { error: "Enter the amount in dollars." };
    if (!(rate > 0)) return { error: "Enter today's dollar rate (PKR per 1 USD)." };
    // The PKR field wins when filled: it is what the bank actually charged.
    amount = Math.round(Number(text("amount")) || foreign * rate);
    await setSetting(USD_RATE_KEY, String(rate));
  } else {
    amount = Math.round(Number(text("amount")));
  }
  if (!(amount > 0)) return { error: "Enter the amount in rupees." };

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
  return done();
}

export async function deleteExpense(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM finance_expenses WHERE id = ${id}`;
  return done();
}

/**
 * Log the next payment of a subscription: a copy of its latest payment dated
 * on the renewal day. A dollar plan is re-priced at the saved dollar rate.
 */
export async function renewSubscription(expenseId: number): Promise<{ error?: string }> {
  await assertAdmin();
  const rows = (await sql`
    SELECT id, to_char(spent_on, 'YYYY-MM-DD') AS spent_on, title, category, amount, currency,
      foreign_amount, paid_by, recurrence, note
    FROM finance_expenses WHERE id = ${expenseId}
  `) as FinanceExpense[];
  const e = rows[0];
  if (!e || e.recurrence === "none") return { error: "That subscription was not found." };
  const next = addMonths(e.spent_on, e.recurrence === "yearly" ? 12 : 1);
  const rate = Number(await getSetting(USD_RATE_KEY)) || DEFAULT_USD_RATE;
  const amount = e.currency === "USD" && e.foreign_amount ? Math.round(Number(e.foreign_amount) * rate) : e.amount;
  await sql`
    INSERT INTO finance_expenses (spent_on, title, category, amount, currency, foreign_amount, paid_by, recurrence, note)
    VALUES (${next}, ${e.title}, ${e.category}, ${amount}, ${e.currency}, ${e.foreign_amount}, ${e.paid_by},
      ${e.recurrence}, ${e.note})
  `;
  return done();
}

/** Cancelled a subscription: its latest payment stops repeating, so the reminders stop. */
export async function stopSubscription(expenseId: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`UPDATE finance_expenses SET recurrence = 'none' WHERE id = ${expenseId}`;
  return done();
}

// ---- Transfers between partners -------------------------------------------

export async function saveTransfer(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const from = Number(formData.get("from_partner"));
  const to = Number(formData.get("to_partner"));
  const amount = Math.round(Number(formData.get("amount")));
  const sentOn = String(formData.get("sent_on") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!from || !to) return { error: "Pick who paid and who received." };
  if (from === to) return { error: "A partner cannot pay themselves." };
  if (!(amount > 0)) return { error: "Enter the amount sent." };
  if (!YMD.test(sentOn)) return { error: "Pick the date." };
  await sql`
    INSERT INTO finance_transfers (from_partner, to_partner, amount, sent_on, note)
    VALUES (${from}, ${to}, ${amount}, ${sentOn}, ${note})
  `;
  return done();
}

export async function deleteTransfer(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM finance_transfers WHERE id = ${id}`;
  return done();
}
