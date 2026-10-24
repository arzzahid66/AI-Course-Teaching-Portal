"use client";

import { Fragment, useMemo, useState } from "react";
import {
  setupPartners,
  savePartner,
  deletePartner,
  saveExpense,
  deleteExpense,
  renewSubscription,
  stopSubscription,
  saveTransfer,
  deleteTransfer,
} from "@/actions/finance";
import {
  buildMonths,
  computeBooks,
  subscriptions,
  monthLabel,
  EXPENSE_CATEGORIES,
  QUICK_EXPENSES,
  RENEWAL_WARN_DAYS,
  type FinanceBoard,
  type FinanceExpense,
  type FinancePartner,
  type Recurrence,
  type Subscription,
} from "@/lib/finance";
import {
  Card,
  EmptyRow,
  MiniBar,
  Modal,
  Msg,
  StatCard,
  btn,
  downloadCsv,
  fieldClass,
  fmtDay,
  useAction,
  useAmountInputType,
  usePrivacy,
  useRs,
} from "../ui";

const RECURRENCE_LABEL: Record<Recurrence, string> = { none: "One-time", monthly: "Monthly", yearly: "Yearly" };

export default function FinanceTab({ board }: { board: FinanceBoard }) {
  const rs = useRs();
  const months = useMemo(() => buildMonths(board), [board]);
  const books = useMemo(() => computeBooks(board), [board]);
  const subs = useMemo(() => subscriptions(board), [board]);
  const thisMonth = months.find((m) => m.ym === board.today.slice(0, 7));
  const margin = books.income > 0 ? Math.round((books.profit / books.income) * 100) : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Fees collected" value={rs(books.income)} hint="All intakes, all time" tone="emerald" />
        <StatCard
          label="Expenses"
          value={rs(books.expenses)}
          hint={`${board.expenses.length} purchase${board.expenses.length === 1 ? "" : "s"}`}
          tone="rose"
        />
        <StatCard
          label="Net profit"
          value={rs(books.profit)}
          hint={margin == null ? "No income yet" : `${margin}% margin`}
          tone={books.profit >= 0 ? "brand" : "rose"}
        />
        <StatCard
          label={`This month · ${monthLabel(board.today.slice(0, 7))}`}
          value={rs(thisMonth?.profit ?? 0)}
          hint={`${rs(thisMonth?.income ?? 0)} in · ${rs(thisMonth?.expenses ?? 0)} out`}
          tone="amber"
        />
      </div>

      <RenewalsCard subs={subs.filter((s) => s.daysLeft <= RENEWAL_WARN_DAYS)} partners={board.partners} />

      {board.partners.length === 0 ? <PartnerSetup /> : <PartnersCard board={board} books={books} />}

      <MonthsCard months={months} board={board} books={books} />

      <ExpensesCard board={board} subs={subs} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Renewal reminders
// ---------------------------------------------------------------------------

function RenewalsCard({ subs, partners }: { subs: Subscription[]; partners: FinancePartner[] }) {
  const rs = useRs();
  const { pending, error, run } = useAction();
  if (subs.length === 0) return null;
  return (
    <Card className="ring-amber-200 bg-amber-50/60">
      <h2 className="font-bold mb-1">⏰ Renewals coming up</h2>
      <p className="text-xs text-slate-500 mb-3">
        Paid it? Log the payment in one tap. Cancelled it? Tap Stopped and the reminders end.
      </p>
      <ul className="divide-y divide-amber-100">
        {subs.map((s) => (
          <li key={s.latest.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{s.latest.title}</p>
              <p className="text-xs text-slate-500">
                {RECURRENCE_LABEL[s.latest.recurrence]} · {fmtDay(s.nextDate)} ·{" "}
                <span className={s.daysLeft < 0 ? "text-rose-600 font-semibold" : "text-amber-700 font-semibold"}>
                  {s.daysLeft < 0
                    ? `${-s.daysLeft} day${s.daysLeft === -1 ? "" : "s"} overdue`
                    : s.daysLeft === 0
                      ? "today"
                      : `in ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"}`}
                </span>
                {" · "}
                {s.latest.currency === "USD" && s.latest.foreign_amount ? `$${s.latest.foreign_amount} ≈ ` : ""}
                {rs(s.latest.amount)}
                {s.latest.paid_by && ` · ${partnerName(partners, s.latest.paid_by)}`}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                disabled={pending}
                onClick={() => run(() => renewSubscription(s.latest.id))}
                className="text-xs rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 font-semibold disabled:opacity-50"
              >
                ✓ Log payment
              </button>
              <button disabled={pending} onClick={() => run(() => stopSubscription(s.latest.id))} className={btn.small}>
                Stopped
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Msg error={error} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Partners & settlement
// ---------------------------------------------------------------------------

function partnerName(partners: FinancePartner[], id: number | null) {
  return partners.find((p) => p.id === id)?.name ?? "—";
}

function PartnerSetup() {
  const [names, setNames] = useState(["", "", ""]);
  const [collector, setCollector] = useState(0);
  const { pending, error, run } = useAction();
  return (
    <Card>
      <h2 className="font-bold">Set up partners</h2>
      <p className="text-sm text-slate-500 mb-3">
        Add the tutors who share the profit. Shares start equal (you can change them later). Pick whose account
        the student fees go to.
      </p>
      <form
        action={(fd) => run(() => setupPartners(fd))}
        className="space-y-2"
      >
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              name="name"
              value={n}
              onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={`Partner ${i + 1} name`}
              className={fieldClass()}
            />
            <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
              <input type="radio" name="collector" value={i} checked={collector === i} onChange={() => setCollector(i)} />
              Gets fees
            </label>
          </div>
        ))}
        <div className="flex gap-2">
          <button type="button" onClick={() => setNames([...names, ""])} className={btn.small}>
            + Add partner
          </button>
        </div>
        <button disabled={pending || !names.some((n) => n.trim())} className={`w-full ${btn.primary}`}>
          {pending ? "Saving…" : "Save partners"}
        </button>
        <Msg error={error} />
      </form>
    </Card>
  );
}

function PartnersCard({ board, books }: { board: FinanceBoard; books: ReturnType<typeof computeBooks> }) {
  const rs = useRs();
  const privacy = usePrivacy();
  const [editing, setEditing] = useState(false);
  const [transfer, setTransfer] = useState<{ from?: number; to?: number; amount?: number } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const { pending, error, run } = useAction();
  const shareOff = Math.abs(books.shareTotal - 100) > 0.05;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <h2 className="font-bold">Partners &amp; settlement</h2>
        <div className="flex gap-1.5">
          <button onClick={() => setTransfer({})} className={btn.small}>
            + Record transfer
          </button>
          <button onClick={() => setEditing(true)} className={btn.small}>
            Edit partners
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Fees land with <b>{books.collector?.name ?? "—"}</b>. Expenses come off the top, the profit is split by
        share, and whoever paid for a tool from their own pocket gets it back first.
      </p>
      {shareOff && (
        <p className="text-xs rounded-lg bg-amber-50 text-amber-800 px-2 py-1.5 mb-3">
          Shares add up to {books.shareTotal}%, not 100%. They are scaled to fit for now. Fix them in Edit partners.
        </p>
      )}

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="py-2 px-1">Partner</th>
              <th className="py-2 px-1 text-right">Share</th>
              <th className="py-2 px-1 text-right" title="Their share of the profit">
                Should get
              </th>
              <th className="py-2 px-1 text-right" title="Fees received − expenses paid ± transfers">
                Has got
              </th>
              <th className="py-2 px-1 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {books.positions.map((pos) => (
              <tr key={pos.partner.id} className="border-b last:border-0">
                <td className="py-2 px-1">
                  <p className="font-semibold">
                    {pos.partner.name}
                    {pos.partner.id === books.collector?.id && (
                      <span className="ml-1 text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5 align-middle">
                        gets fees
                      </span>
                    )}
                  </p>
                  {pos.expensesPaid > 0 && (
                    <p className="text-xs text-slate-400">Paid {rs(pos.expensesPaid)} of expenses</p>
                  )}
                </td>
                <td className="py-2 px-1 text-right tabular-nums">{Math.round(pos.share * 1000) / 10}%</td>
                <td className="py-2 px-1 text-right tabular-nums">{rs(pos.entitled)}</td>
                <td className="py-2 px-1 text-right tabular-nums">{rs(pos.takenOut)}</td>
                <td
                  className={`py-2 px-1 text-right tabular-nums font-semibold ${
                    Math.abs(pos.balance) < 1 ? "text-slate-400" : pos.balance > 0 ? "text-rose-600" : "text-emerald-600"
                  }`}
                >
                  {Math.abs(pos.balance) < 1 ? "Settled" : `${pos.balance > 0 ? "owes " : "gets "}${rs(Math.abs(pos.balance))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <h3 className="font-semibold text-sm mb-1">To settle up</h3>
        {books.settlements.length === 0 ? (
          <p className="text-sm text-emerald-600">Everyone is square. ✓</p>
        ) : (
          <ul className="space-y-1.5">
            {books.settlements.map((s) => (
              <li
                key={`${s.from.id}-${s.to.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm"
              >
                <span>
                  <b>{s.from.name}</b> → <b>{s.to.name}</b>{" "}
                  <span className="font-semibold tabular-nums">{rs(s.amount)}</span>
                </span>
                <button
                  disabled={pending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("from_partner", String(s.from.id));
                    fd.set("to_partner", String(s.to.id));
                    fd.set("amount", String(s.amount));
                    fd.set("sent_on", board.today);
                    fd.set("note", "Settlement");
                    run(() => saveTransfer(fd));
                  }}
                  className={btn.small}
                >
                  ✓ Mark as sent
                </button>
              </li>
            ))}
          </ul>
        )}
        <Msg error={error} />
      </div>

      {board.transfers.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-brand-700 underline">
            {showHistory ? "Hide" : "Show"} transfer history ({board.transfers.length})
          </button>
          {showHistory && (
            <ul className="divide-y text-sm mt-2">
              {board.transfers.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span>
                    {fmtDay(t.sent_on)} · {partnerName(board.partners, t.from_partner)} →{" "}
                    {partnerName(board.partners, t.to_partner)}
                    {t.note && <span className="text-slate-400"> · {t.note}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="tabular-nums font-semibold">{rs(t.amount)}</span>
                    <button
                      disabled={pending}
                      onClick={() => confirm("Delete this transfer?") && run(() => deleteTransfer(t.id))}
                      className={btn.smallDanger}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {privacy && <p className="text-xs text-slate-400 mt-3">Amounts hidden — privacy mode is on.</p>}

      {editing && <PartnersModal partners={board.partners} onClose={() => setEditing(false)} />}
      {transfer && (
        <TransferModal board={board} initial={transfer} onClose={() => setTransfer(null)} />
      )}
    </Card>
  );
}

function PartnersModal({ partners, onClose }: { partners: FinancePartner[]; onClose: () => void }) {
  const total = partners.reduce((s, p) => s + p.share_pct, 0);
  return (
    <Modal title="Partners" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">
        Shares should add up to 100% (now {Math.round(total * 100) / 100}%). Exactly one partner gets the fees.
      </p>
      <div className="space-y-3">
        {partners.map((p) => (
          <PartnerRow key={p.id} partner={p} />
        ))}
        <PartnerRow partner={null} />
      </div>
    </Modal>
  );
}

function PartnerRow({ partner }: { partner: FinancePartner | null }) {
  const { pending, error, ok, run } = useAction();
  return (
    <form
      action={(fd) => run(() => savePartner(partner?.id ?? null, fd), { success: "Saved." })}
      className={`rounded-xl p-3 ${partner ? "bg-slate-50" : "border border-dashed border-slate-300"}`}
    >
      {!partner && <p className="text-xs font-semibold text-slate-500 mb-2">Add a partner</p>}
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <input name="name" defaultValue={partner?.name ?? ""} placeholder="Name" required className={fieldClass()} />
        <div className="relative">
          <input
            name="share_pct"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={partner?.share_pct ?? 0}
            className={`${fieldClass()} pr-6`}
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 mt-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" name="receives_fees" defaultChecked={partner?.receives_fees ?? false} />
          Student fees go to this account
        </label>
        <div className="flex gap-1.5">
          {partner && (
            <button
              type="button"
              disabled={pending}
              onClick={() => confirm(`Remove ${partner.name}?`) && run(() => deletePartner(partner.id))}
              className={btn.smallDanger}
            >
              Remove
            </button>
          )}
          <button disabled={pending} className={btn.small}>
            {partner ? "Save" : "Add"}
          </button>
        </div>
      </div>
      <Msg error={error} ok={ok} />
    </form>
  );
}

function TransferModal({
  board,
  initial,
  onClose,
}: {
  board: FinanceBoard;
  initial: { from?: number; to?: number; amount?: number };
  onClose: () => void;
}) {
  const amountType = useAmountInputType();
  const { pending, error, run } = useAction();
  return (
    <Modal title="Record a transfer" onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">Money one partner sent another (a payout, or paying back a tool).</p>
      <form action={(fd) => run(() => saveTransfer(fd), { onDone: onClose })} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            From
            <select name="from_partner" defaultValue={initial.from ?? board.partners[0]?.id} className={fieldClass()}>
              {board.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            To
            <select name="to_partner" defaultValue={initial.to ?? board.partners[1]?.id} className={fieldClass()}>
              {board.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="amount" type={amountType} min={1} placeholder="Amount (Rs)" defaultValue={initial.amount} required className={fieldClass()} />
          <input name="sent_on" type="date" defaultValue={board.today} required className={fieldClass()} />
        </div>
        <input name="note" placeholder="Note (optional)" className={fieldClass()} />
        <button disabled={pending} className={`w-full ${btn.primary}`}>
          {pending ? "Saving…" : "Save transfer"}
        </button>
        <Msg error={error} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Month by month
// ---------------------------------------------------------------------------

function MonthsCard({
  months,
  board,
  books,
}: {
  months: ReturnType<typeof buildMonths>;
  board: FinanceBoard;
  books: ReturnType<typeof computeBooks>;
}) {
  const rs = useRs();
  const privacy = usePrivacy();
  const [open, setOpen] = useState<string | null>(board.today.slice(0, 7));
  const newestFirst = [...months].reverse();
  const totalExpected = months.reduce((s, m) => s + m.expected, 0);

  function exportCsv() {
    downloadCsv("finance-monthly.csv", [
      ["Month", "Fees collected", "Fees due", "Expenses", "Profit", "Running total", ...board.partners.map((p) => `${p.name} share`)],
      ...months.map((m) => [
        monthLabel(m.ym),
        m.income,
        m.expected,
        m.expenses,
        m.profit,
        m.running,
        ...books.positions.map((pos) => Math.round(pos.share * m.profit)),
      ]),
    ]);
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h2 className="font-bold">Month by month</h2>
        {months.length > 0 && !privacy && (
          <button onClick={exportCsv} className={btn.small}>
            ⬇ CSV
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Fees count in the month they were paid. &ldquo;Due&rdquo; is what fell due that month. Tap a month for the
        breakdown.
      </p>
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b">
              <th className="py-2 px-1">Month</th>
              <th className="py-2 px-1 text-right">Collected</th>
              <th className="py-2 px-1 text-right">Expenses</th>
              <th className="py-2 px-1 text-right">Profit</th>
              <th className="py-2 px-1 text-right">Total so far</th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.length === 0 && <EmptyRow colSpan={5}>No fees or expenses recorded yet.</EmptyRow>}
            {newestFirst.map((m) => {
              const isOpen = open === m.ym;
              const collectedPct = privacy || m.expected <= 0 ? 0 : (m.income / m.expected) * 100;
              return (
                <Fragment key={m.ym}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : m.ym)}
                    className={`border-b cursor-pointer hover:bg-slate-50 ${isOpen ? "bg-slate-50" : ""}`}
                  >
                    <td className="py-2 px-1 font-semibold whitespace-nowrap">
                      <span className="text-slate-400 mr-1">{isOpen ? "▾" : "▸"}</span>
                      {monthLabel(m.ym)}
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums text-emerald-700">
                      {rs(m.income)}
                      {m.expected > 0 && <p className="text-[11px] text-slate-400">of {rs(m.expected)} due</p>}
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums text-rose-600">{rs(m.expenses)}</td>
                    <td className={`py-2 px-1 text-right tabular-nums font-semibold ${m.profit < 0 ? "text-rose-600" : ""}`}>
                      {rs(m.profit)}
                    </td>
                    <td className="py-2 px-1 text-right tabular-nums text-slate-500">{rs(m.running)}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b bg-slate-50">
                      <td colSpan={5} className="px-3 pb-3 pt-1">
                        {m.expected > 0 && (
                          <div className="mb-3">
                            <MiniBar pct={collectedPct} tone="bg-emerald-500" />
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              {privacy ? "" : `${Math.round(collectedPct)}% of this month's due fees collected`}
                            </p>
                          </div>
                        )}
                        <div className="grid sm:grid-cols-3 gap-3 text-xs">
                          <Breakdown
                            title="Fees by intake"
                            rows={m.byIntake.map((r) => [`${r.intake} (${r.receipts})`, r.amount])}
                            empty="No fees received"
                          />
                          <Breakdown
                            title="Expenses by category"
                            rows={m.byCategory.map((r) => [r.category, r.amount])}
                            empty="Nothing spent"
                          />
                          <Breakdown
                            title="Profit share"
                            rows={books.positions.map((pos) => [pos.partner.name, Math.round(pos.share * m.profit)])}
                            empty="Add partners to see shares"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          {months.length > 0 && (
            <tfoot>
              <tr className="text-sm font-bold border-t-2">
                <td className="py-2 px-1">Total</td>
                <td className="py-2 px-1 text-right tabular-nums text-emerald-700">
                  {rs(books.income)}
                  {totalExpected > 0 && <p className="text-[11px] font-normal text-slate-400">of {rs(totalExpected)} due</p>}
                </td>
                <td className="py-2 px-1 text-right tabular-nums text-rose-600">{rs(books.expenses)}</td>
                <td className="py-2 px-1 text-right tabular-nums">{rs(books.profit)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </Card>
  );
}

function Breakdown({ title, rows, empty }: { title: string; rows: [string, number][]; empty: string }) {
  const rs = useRs();
  return (
    <div>
      <p className="font-semibold text-slate-600 mb-1">{title}</p>
      {rows.length === 0 ? (
        <p className="text-slate-400">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map(([label, amount]) => (
            <li key={label} className="flex justify-between gap-2">
              <span className="truncate text-slate-600">{label}</span>
              <span className="tabular-nums font-medium">{rs(amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

function ExpensesCard({ board, subs }: { board: FinanceBoard; subs: Subscription[] }) {
  const rs = useRs();
  const privacy = usePrivacy();
  const [editing, setEditing] = useState<FinanceExpense | "new" | null>(null);
  const [month, setMonth] = useState("all");
  const [category, setCategory] = useState("all");
  const { pending, error, run } = useAction();

  const expenseMonths = [...new Set(board.expenses.map((e) => e.spent_on.slice(0, 7)))];
  const shown = board.expenses.filter(
    (e) => (month === "all" || e.spent_on.startsWith(month)) && (category === "all" || e.category === category)
  );
  const shownTotal = shown.reduce((s, e) => s + e.amount, 0);
  const monthlyBurn = subs.reduce((s, x) => s + x.monthlyCost, 0);

  function exportCsv() {
    downloadCsv("expenses.csv", [
      ["Date", "Item", "Category", "PKR", "USD", "Paid by", "Repeats", "Note"],
      ...shown.map((e) => [
        e.spent_on,
        e.title,
        e.category,
        e.amount,
        e.foreign_amount,
        partnerName(board.partners, e.paid_by),
        RECURRENCE_LABEL[e.recurrence],
        e.note,
      ]),
    ]);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-bold">Expenses &amp; tools</h2>
        <div className="flex gap-1.5">
          {shown.length > 0 && !privacy && (
            <button onClick={exportCsv} className={btn.small}>
              ⬇ CSV
            </button>
          )}
          <button onClick={() => setEditing("new")} className="text-xs rounded-lg bg-brand-600 text-white px-2.5 py-1.5 font-semibold">
            + Add expense
          </button>
        </div>
      </div>

      {subs.length > 0 && (
        <div className="rounded-xl bg-slate-50 p-3 mb-3">
          <p className="text-xs text-slate-500 mb-1.5">
            Active subscriptions cost about <b className="text-slate-700">{rs(monthlyBurn)}/month</b>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {subs.map((s) => (
              <span key={s.latest.id} className="text-xs rounded-full bg-white ring-1 ring-slate-200 px-2 py-0.5">
                {s.latest.title} · next {fmtDay(s.nextDate).replace(/^\w+ /, "")}
              </span>
            ))}
          </div>
        </div>
      )}

      {board.expenses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="all">All months</option>
            {expenseMonths.map((ym) => (
              <option key={ym} value={ym}>
                {monthLabel(ym)}
              </option>
            ))}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="all">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="ml-auto text-sm text-slate-500 tabular-nums">
            {shown.length} · <b className="text-slate-700">{rs(shownTotal)}</b>
          </span>
        </div>
      )}

      <ul className="divide-y">
        {board.expenses.length === 0 && (
          <li className="py-6 text-center text-slate-400 text-sm">
            No expenses yet. Add Claude Code, API credits, your domain…
          </li>
        )}
        {board.expenses.length > 0 && shown.length === 0 && (
          <li className="py-6 text-center text-slate-400 text-sm">Nothing matches these filters.</li>
        )}
        {shown.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 py-2">
            <button onClick={() => setEditing(e)} className="min-w-0 text-left">
              <p className="font-semibold truncate">
                {e.title}
                {e.recurrence !== "none" && (
                  <span className="ml-1 text-[10px] rounded-full bg-brand-50 text-brand-700 px-1.5 py-0.5 align-middle">
                    {RECURRENCE_LABEL[e.recurrence]}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {fmtDay(e.spent_on)} · {e.category}
                {e.paid_by && ` · paid by ${partnerName(board.partners, e.paid_by)}`}
                {e.note && ` · ${e.note}`}
              </p>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right">
                <p className="font-semibold tabular-nums">{rs(e.amount)}</p>
                {e.currency === "USD" && e.foreign_amount != null && !privacy && (
                  <p className="text-[11px] text-slate-400 tabular-nums">${e.foreign_amount}</p>
                )}
              </div>
              <button
                disabled={pending}
                onClick={() => confirm(`Delete "${e.title}"?`) && run(() => deleteExpense(e.id))}
                className={btn.smallDanger}
                aria-label={`Delete ${e.title}`}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
      <Msg error={error} />

      {editing && (
        <ExpenseModal
          board={board}
          expense={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

function ExpenseModal({
  board,
  expense,
  onClose,
}: {
  board: FinanceBoard;
  expense: FinanceExpense | null;
  onClose: () => void;
}) {
  const rs = useRs();
  const amountType = useAmountInputType();
  const { pending, error, run } = useAction();
  const collector = board.partners.find((p) => p.receives_fees) ?? board.partners[0];

  const [title, setTitle] = useState(expense?.title ?? "");
  const [category, setCategory] = useState(expense?.category ?? EXPENSE_CATEGORIES[0]);
  const [currency, setCurrency] = useState<"PKR" | "USD">(expense?.currency ?? "USD");
  const [recurrence, setRecurrence] = useState<Recurrence>(expense?.recurrence ?? "none");
  const [usd, setUsd] = useState(expense?.foreign_amount != null ? String(expense.foreign_amount) : "");
  const [rate, setRate] = useState(
    expense?.currency === "USD" && expense.foreign_amount
      ? String(Math.round((expense.amount / expense.foreign_amount) * 100) / 100)
      : String(board.usdRate)
  );
  // In dollar mode this is an optional override: what the bank actually charged.
  // Editing a dollar expense starts it blank: the rate above is derived from
  // the saved figures, so the estimate already reproduces the saved amount.
  const [pkr, setPkr] = useState(expense?.currency === "PKR" ? String(expense.amount) : "");
  const estimate = Math.round((Number(usd) || 0) * (Number(rate) || 0));

  // Titles typed before, so the same tool is always spelled the same way
  // (the renewal reminders group payments by title).
  const knownTitles = [...new Set(board.expenses.map((e) => e.title))];

  function pickPreset(p: (typeof QUICK_EXPENSES)[number]) {
    setTitle(p.title);
    setCategory(p.category);
    setCurrency(p.currency);
    setRecurrence(p.recurrence);
  }

  return (
    <Modal title={expense ? "Edit expense" : "Add expense"} onClose={onClose}>
      {!expense && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_EXPENSES.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => pickPreset(p)}
              className={`text-xs rounded-full px-2.5 py-1 ring-1 transition ${
                title === p.title ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
      <form
        action={(fd) => {
          // A PKR override equal to the estimate is not an override; let the server re-derive it.
          if (currency === "USD" && Number(pkr) === estimate) fd.set("amount", "");
          run(() => saveExpense(expense?.id ?? null, fd), { onDone: onClose });
        }}
        className="space-y-2"
      >
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What did you buy? e.g. Claude Code"
          list="finance-titles"
          required
          className={fieldClass()}
        />
        <datalist id="finance-titles">
          {knownTitles.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>

        <div className="grid grid-cols-2 gap-2">
          <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass()}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input name="spent_on" type="date" defaultValue={expense?.spent_on ?? board.today} required className={fieldClass()} />
        </div>

        <input type="hidden" name="currency" value={currency} />
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
          {(["USD", "PKR"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={`flex-1 rounded-lg py-1.5 font-semibold ${currency === c ? "bg-white shadow-sm text-brand-700" : "text-slate-500"}`}
            >
              {c === "USD" ? "$ Dollars" : "Rs Rupees"}
            </button>
          ))}
        </div>

        {currency === "USD" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Amount ($)
                <input
                  name="foreign_amount"
                  type={amountType}
                  step="0.01"
                  min={0}
                  value={usd}
                  onChange={(e) => setUsd(e.target.value)}
                  placeholder="20"
                  required
                  className={fieldClass()}
                />
              </label>
              <label className="text-xs text-slate-500">
                1 USD = (PKR)
                <input
                  name="usd_rate"
                  type="number"
                  step="0.01"
                  min={0}
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  className={fieldClass()}
                />
              </label>
            </div>
            <label className="text-xs text-slate-500 block">
              Charged in PKR (optional — your bank statement figure, with card fees)
              <input
                name="amount"
                type={amountType}
                min={0}
                value={pkr}
                onChange={(e) => setPkr(e.target.value)}
                placeholder={estimate > 0 ? `≈ ${estimate}` : ""}
                className={fieldClass()}
              />
            </label>
            {estimate > 0 && !pkr && <p className="text-xs text-slate-500">Will be saved as {rs(estimate)}.</p>}
          </>
        ) : (
          <input
            name="amount"
            type={amountType}
            min={1}
            value={pkr}
            onChange={(e) => setPkr(e.target.value)}
            placeholder="Amount (Rs)"
            required
            className={fieldClass()}
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-500">
            Paid by
            <select name="paid_by" defaultValue={expense?.paid_by ?? collector?.id ?? ""} className={fieldClass()}>
              {board.partners.length === 0 && <option value="">—</option>}
              {board.partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Repeats
            <select
              name="recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className={fieldClass()}
            >
              <option value="none">One-time</option>
              <option value="monthly">Every month</option>
              <option value="yearly">Every year</option>
            </select>
          </label>
        </div>
        {recurrence !== "none" && (
          <p className="text-xs text-slate-500">
            You will get a reminder {RENEWAL_WARN_DAYS} days before it renews, with a one-tap &ldquo;Log payment&rdquo;.
          </p>
        )}
        <input name="note" defaultValue={expense?.note ?? ""} placeholder="Note (optional) — e.g. which card, which account" className={fieldClass()} />

        <button disabled={pending} className={`w-full ${btn.primary}`}>
          {pending ? "Saving…" : expense ? "Save changes" : "Add expense"}
        </button>
        <Msg error={error} />
      </form>
    </Modal>
  );
}
