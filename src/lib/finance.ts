// ---------------------------------------------------------------------------
// Finance: the partners' books.
//
// Pure functions only (no database, no "server-only"), so the admin Finance
// tab can recompute everything instantly in the browser from one board load.
//
// The model, in one paragraph: every student fee lands in the collector's
// account. Any partner may pay a business expense out of their own pocket.
// Profit = fee income − expenses, split by each partner's share. A partner's
// balance is what they actually took out of the business minus what their
// share entitles them to; a positive balance is money they owe the others,
// a negative one is money owed to them. Balances always sum to zero.
// ---------------------------------------------------------------------------

export type FinancePartner = {
  id: number;
  name: string;
  share_pct: number;
  receives_fees: boolean;
  sort_order: number;
};

export type Recurrence = "none" | "monthly" | "yearly";

export type FinanceExpense = {
  id: number;
  spent_on: string; // YYYY-MM-DD
  title: string;
  category: string;
  amount: number; // PKR
  currency: "PKR" | "USD";
  foreign_amount: number | null;
  paid_by: number | null;
  recurrence: Recurrence;
  note: string | null;
};

export type FinanceTransfer = {
  id: number;
  from_partner: number;
  to_partner: number;
  amount: number;
  sent_on: string;
  note: string | null;
};

/** Fee money received in one month (by payment date) for one intake. */
export type IncomeRow = { ym: string; intake: string; amount: number; receipts: number };

/** Fee money falling due in one month (by due date, after discounts). */
export type ExpectedRow = { ym: string; amount: number };

export type FinanceBoard = {
  partners: FinancePartner[];
  expenses: FinanceExpense[];
  transfers: FinanceTransfer[];
  income: IncomeRow[];
  expected: ExpectedRow[];
  usdRate: number;
  today: string; // YYYY-MM-DD, Asia/Karachi
};

export const EMPTY_FINANCE_BOARD: FinanceBoard = {
  partners: [],
  expenses: [],
  transfers: [],
  income: [],
  expected: [],
  usdRate: 280,
  today: new Date().toISOString().slice(0, 10),
};

export const EXPENSE_CATEGORIES = [
  "AI tools",
  "API credits",
  "Domain & hosting",
  "Software",
  "Marketing",
  "Equipment",
  "Other",
] as const;

/** One-tap presets for the purchases that come up again and again. */
export const QUICK_EXPENSES: {
  title: string;
  category: string;
  currency: "PKR" | "USD";
  recurrence: Recurrence;
}[] = [
  { title: "Claude Code (Max)", category: "AI tools", currency: "USD", recurrence: "monthly" },
  { title: "Claude Pro", category: "AI tools", currency: "USD", recurrence: "monthly" },
  { title: "ChatGPT Plus", category: "AI tools", currency: "USD", recurrence: "monthly" },
  { title: "Anthropic API credits", category: "API credits", currency: "USD", recurrence: "none" },
  { title: "OpenAI API credits", category: "API credits", currency: "USD", recurrence: "none" },
  { title: "Domain renewal", category: "Domain & hosting", currency: "USD", recurrence: "yearly" },
  { title: "Hosting (Vercel)", category: "Domain & hosting", currency: "USD", recurrence: "monthly" },
  { title: "Facebook ads", category: "Marketing", currency: "PKR", recurrence: "none" },
];

// ---- Dates ----------------------------------------------------------------

/** "2026-10" → "Oct 2026". */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    month: "short",
    year: "numeric",
  });
}

function nextYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Add months to a YYYY-MM-DD date, clamping to the month's last day (31 Jan + 1 → 28/29 Feb). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

// ---- Monthly summary ------------------------------------------------------

export type MonthSummary = {
  ym: string;
  income: number;
  expected: number;
  expenses: number;
  profit: number;
  /** Profit from the first month up to and including this one. */
  running: number;
  byIntake: { intake: string; amount: number; receipts: number }[];
  byCategory: { category: string; amount: number }[];
};

/**
 * One row per calendar month, oldest first, from the first month with any
 * money up to the current month — empty months included, so the running
 * total never jumps over a gap.
 */
export function buildMonths(board: FinanceBoard): MonthSummary[] {
  const yms = [
    ...board.income.map((r) => r.ym),
    ...board.expenses.map((e) => e.spent_on.slice(0, 7)),
  ];
  if (yms.length === 0) return [];
  const first = yms.reduce((a, b) => (a < b ? a : b));
  const lastData = yms.reduce((a, b) => (a > b ? a : b));
  const thisMonth = board.today.slice(0, 7);
  const last = lastData > thisMonth ? lastData : thisMonth;

  const months: MonthSummary[] = [];
  let running = 0;
  for (let ym = first; ym <= last; ym = nextYm(ym)) {
    const inc = board.income.filter((r) => r.ym === ym);
    const exp = board.expenses.filter((e) => e.spent_on.startsWith(ym));
    const income = inc.reduce((s, r) => s + r.amount, 0);
    const expenses = exp.reduce((s, e) => s + e.amount, 0);
    const cats = new Map<string, number>();
    for (const e of exp) cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount);
    running += income - expenses;
    months.push({
      ym,
      income,
      expected: board.expected.find((r) => r.ym === ym)?.amount ?? 0,
      expenses,
      profit: income - expenses,
      running,
      byIntake: inc
        .map(({ intake, amount, receipts }) => ({ intake, amount, receipts }))
        .sort((a, b) => b.amount - a.amount),
      byCategory: [...cats].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    });
  }
  return months;
}

// ---- Partner balances -----------------------------------------------------

export type PartnerPosition = {
  partner: FinancePartner;
  /** Normalized share, 0..1 (shares are rescaled if they do not add up to 100). */
  share: number;
  feesReceived: number;
  expensesPaid: number;
  sent: number;
  got: number;
  /** What this partner has taken out of the business so far. */
  takenOut: number;
  /** What their share of the profit entitles them to. */
  entitled: number;
  /** takenOut − entitled. Positive: owes the others. Negative: is owed. */
  balance: number;
};

export type Settlement = { from: FinancePartner; to: FinancePartner; amount: number };

export type Books = {
  income: number;
  expenses: number;
  profit: number;
  shareTotal: number;
  collector: FinancePartner | null;
  positions: PartnerPosition[];
  settlements: Settlement[];
};

export function computeBooks(board: FinanceBoard): Books {
  const { partners } = board;
  const income = board.income.reduce((s, r) => s + r.amount, 0);
  const expenses = board.expenses.reduce((s, e) => s + e.amount, 0);
  const profit = income - expenses;
  const collector = partners.find((p) => p.receives_fees) ?? partners[0] ?? null;
  const shareTotal = partners.reduce((s, p) => s + p.share_pct, 0);

  const positions: PartnerPosition[] = partners.map((p) => {
    const share = shareTotal > 0 ? p.share_pct / shareTotal : 1 / partners.length;
    const feesReceived = collector?.id === p.id ? income : 0;
    // An expense with nobody recorded as payer came out of the fee account.
    const expensesPaid = board.expenses
      .filter((e) => (e.paid_by ?? collector?.id) === p.id)
      .reduce((s, e) => s + e.amount, 0);
    const sent = board.transfers.filter((t) => t.from_partner === p.id).reduce((s, t) => s + t.amount, 0);
    const got = board.transfers.filter((t) => t.to_partner === p.id).reduce((s, t) => s + t.amount, 0);
    const takenOut = feesReceived - expensesPaid - sent + got;
    const entitled = Math.round(share * profit);
    return { partner: p, share, feesReceived, expensesPaid, sent, got, takenOut, entitled, balance: takenOut - entitled };
  });

  return { income, expenses, profit, shareTotal, collector, positions, settlements: settle(positions) };
}

/** Fewest simple payments that bring every balance to zero (largest debtor pays largest creditor first). */
function settle(positions: PartnerPosition[]): Settlement[] {
  const debtors = positions.filter((p) => p.balance >= 1).map((p) => ({ p: p.partner, left: p.balance }));
  const creditors = positions.filter((p) => p.balance <= -1).map((p) => ({ p: p.partner, left: -p.balance }));
  debtors.sort((a, b) => b.left - a.left);
  creditors.sort((a, b) => b.left - a.left);
  const out: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].left, creditors[j].left);
    if (amount >= 1) out.push({ from: debtors[i].p, to: creditors[j].p, amount: Math.round(amount) });
    debtors[i].left -= amount;
    creditors[j].left -= amount;
    if (debtors[i].left < 1) i++;
    if (creditors[j].left < 1) j++;
  }
  return out;
}

// ---- Subscriptions --------------------------------------------------------

export type Subscription = {
  /** The latest payment of this subscription; renewing copies it. */
  latest: FinanceExpense;
  nextDate: string;
  /** Negative when the renewal date has already passed without a logged payment. */
  daysLeft: number;
  /** Cost per month in PKR (a yearly plan counts 1/12). */
  monthlyCost: number;
};

/**
 * Active subscriptions: expenses marked monthly/yearly, grouped by title, each
 * judged by its most recent payment. Marking that latest payment "none" (the
 * Stop button) ends the subscription and its reminders.
 */
export function subscriptions(board: FinanceBoard): Subscription[] {
  const latest = new Map<string, FinanceExpense>();
  for (const e of board.expenses) {
    const key = e.title.trim().toLowerCase();
    const cur = latest.get(key);
    if (!cur || e.spent_on > cur.spent_on || (e.spent_on === cur.spent_on && e.id > cur.id)) latest.set(key, e);
  }
  return [...latest.values()]
    .filter((e) => e.recurrence !== "none")
    .map((e) => {
      const nextDate = addMonths(e.spent_on, e.recurrence === "yearly" ? 12 : 1);
      return {
        latest: e,
        nextDate,
        daysLeft: daysBetween(board.today, nextDate),
        monthlyCost: e.recurrence === "yearly" ? Math.round(e.amount / 12) : e.amount,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Renewals due within this many days get a reminder at the top of the tab. */
export const RENEWAL_WARN_DAYS = 7;
