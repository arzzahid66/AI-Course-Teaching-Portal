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
import { Card, Modal, Msg, btn, fieldClass, fmtDay, useAction, useAmountInputType, useRs } from "../ui";

/**
 * Finance, kept to three questions: how much came in, how much went out, and
 * what each tutor gets. Everything else (category, who paid, repeats) sits
 * behind "More options" in the expense form.
 */
export default function FinanceTab({ board }: { board: FinanceBoard }) {
  const rs = useRs();
  const months = useMemo(() => buildMonths(board), [board]);
  const books = useMemo(() => computeBooks(board), [board]);
  const subs = useMemo(() => subscriptions(board), [board]);
  const [editing, setEditing] = useState<FinanceExpense | "new" | null>(null);

  return (
    <>
      <Card>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Big label="Fees received" value={rs(books.income)} tone="text-emerald-600" />
          <Big label="Spent" value={rs(books.expenses)} tone="text-rose-600" />
          <Big label="Profit" value={rs(books.profit)} tone={books.profit < 0 ? "text-rose-600" : "text-slate-900"} />
        </div>
        <p className="text-xs text-slate-400 text-center mt-2">
          Fees come in automatically from the Fees tab (all intakes). You only add what you spend.
        </p>
        <button onClick={() => setEditing("new")} className={`w-full mt-4 ${btn.primary}`}>
          + Add expense
        </button>
      </Card>

      <Renewals subs={subs.filter((s) => s.daysLeft <= RENEWAL_WARN_DAYS)} />

      <MonthTable months={months} expenses={board.expenses} onEdit={setEditing} />

      <ExpenseList board={board} subs={subs} onEdit={setEditing} />

      <TutorShares board={board} books={books} />

      {editing && (
        <ExpenseModal board={board} expense={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function Big({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg sm:text-2xl font-bold tabular-nums leading-tight ${tone}`}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month by month
// ---------------------------------------------------------------------------

function MonthTable({
  months,
  expenses,
  onEdit,
}: {
  months: ReturnType<typeof buildMonths>;
  expenses: FinanceExpense[];
  onEdit: (e: FinanceExpense) => void;
}) {
  const rs = useRs();
  if (months.length === 0) return null;
  const total = months.reduce(
    (t, m) => ({ income: t.income + m.income, expenses: t.expenses + m.expenses }),
    { income: 0, expenses: 0 }
  );
  return (
    <Card>
      <h2 className="font-bold mb-2">Every month</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 border-b">
            <th className="py-2 text-left font-medium">Month</th>
            <th className="py-2 text-right font-medium">Fees</th>
            <th className="py-2 text-right font-medium">Spent</th>
            <th className="py-2 text-right font-medium">Profit</th>
          </tr>
        </thead>
        <tbody>
          {[...months].reverse().map((m) => {
            const spent = expenses.filter((e) => e.spent_on.startsWith(m.ym));
            return (
              <Fragment key={m.ym}>
                <tr className={spent.length ? "" : "border-b"}>
                  <td className="pt-2 pb-1 font-medium">{monthLabel(m.ym)}</td>
                  <td className="pt-2 pb-1 text-right tabular-nums text-emerald-700">{rs(m.income)}</td>
                  <td className="pt-2 pb-1 text-right tabular-nums text-rose-600">{rs(m.expenses)}</td>
                  <td className={`pt-2 pb-1 text-right tabular-nums font-semibold ${m.profit < 0 ? "text-rose-600" : ""}`}>
                    {rs(m.profit)}
                  </td>
                </tr>
                {/* What the month's "Spent" is made of: every purchase, tap one to edit it. */}
                {spent.length > 0 && (
                  <tr className="border-b">
                    <td colSpan={4} className="pb-2">
                      <div className="flex flex-wrap gap-1.5">
                        {spent.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => onEdit(e)}
                            className="text-xs rounded-full bg-rose-50 text-slate-700 ring-1 ring-rose-100 px-2 py-0.5 hover:bg-rose-100"
                            title={`${fmtDay(e.spent_on)} · tap to edit`}
                          >
                            {e.title} <b className="tabular-nums text-rose-700">{rs(e.amount)}</b>
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td className="pt-2">Total</td>
            <td className="pt-2 text-right tabular-nums text-emerald-700">{rs(total.income)}</td>
            <td className="pt-2 text-right tabular-nums text-rose-600">{rs(total.expenses)}</td>
            <td className="pt-2 text-right tabular-nums">{rs(total.income - total.expenses)}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

function Renewals({ subs }: { subs: Subscription[] }) {
  const rs = useRs();
  const { pending, error, run } = useAction();
  if (subs.length === 0) return null;
  return (
    <Card className="!ring-amber-200 bg-amber-50/60">
      <h2 className="font-bold mb-2">⏰ Renewing soon</h2>
      <ul className="space-y-2">
        {subs.map((s) => (
          <li key={s.latest.id} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              <b>{s.latest.title}</b> · {rs(s.latest.amount)} ·{" "}
              <span className={s.daysLeft < 0 ? "text-rose-600" : "text-amber-700"}>
                {s.daysLeft < 0 ? `was due ${fmtDay(s.nextDate)}` : s.daysLeft === 0 ? "today" : `${fmtDay(s.nextDate)}`}
              </span>
            </span>
            <span className="flex gap-1.5">
              <button
                disabled={pending}
                onClick={() => run(() => renewSubscription(s.latest.id))}
                className="text-xs rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 font-semibold disabled:opacity-50"
              >
                I paid it
              </button>
              <button disabled={pending} onClick={() => run(() => stopSubscription(s.latest.id))} className={btn.small}>
                I cancelled it
              </button>
            </span>
          </li>
        ))}
      </ul>
      <Msg error={error} />
    </Card>
  );
}

function ExpenseList({
  board,
  subs,
  onEdit,
}: {
  board: FinanceBoard;
  subs: Subscription[];
  onEdit: (e: FinanceExpense) => void;
}) {
  const rs = useRs();
  const { pending, error, run } = useAction();
  if (board.expenses.length === 0) return null;
  const monthly = subs.reduce((s, x) => s + x.monthlyCost, 0);
  return (
    <Card>
      <h2 className="font-bold">Expenses</h2>
      {monthly > 0 && (
        <p className="text-xs text-slate-500">Your subscriptions cost about {rs(monthly)} a month.</p>
      )}
      <ul className="divide-y mt-2">
        {board.expenses.map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-2">
            <button onClick={() => onEdit(e)} className="min-w-0 flex-1 text-left">
              <p className="font-medium truncate">
                {e.title}
                {e.recurrence !== "none" && (
                  <span className="ml-1.5 text-[10px] rounded-full bg-slate-100 text-slate-500 px-1.5 py-0.5 align-middle">
                    {e.recurrence === "monthly" ? "every month" : "every year"}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-400">
                {fmtDay(e.spent_on)}
                {e.paid_by && board.partners.length > 1 && ` · paid by ${board.partners.find((p) => p.id === e.paid_by)?.name}`}
              </p>
            </button>
            <span className="font-semibold tabular-nums">{rs(e.amount)}</span>
            <button
              disabled={pending}
              onClick={() => confirm(`Delete "${e.title}"?`) && run(() => deleteExpense(e.id))}
              className="text-slate-300 hover:text-rose-600 px-1 text-lg leading-none"
              aria-label={`Delete ${e.title}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <Msg error={error} />
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
  const [category, setCategory] = useState(expense?.category ?? "Other");
  const [currency, setCurrency] = useState<"PKR" | "USD">(expense?.currency ?? "PKR");
  const [recurrence, setRecurrence] = useState<Recurrence>(expense?.recurrence ?? "none");
  const [value, setValue] = useState(
    expense ? String(expense.currency === "USD" ? expense.foreign_amount ?? "" : expense.amount) : ""
  );
  // An old dollar expense keeps the rate it was bought at, so editing it never re-prices it.
  const [rate, setRate] = useState(
    expense?.currency === "USD" && expense.foreign_amount
      ? String(Math.round((expense.amount / expense.foreign_amount) * 100) / 100)
      : String(board.usdRate)
  );
  const [more, setMore] = useState(false);
  const pkrEstimate = Math.round((Number(value) || 0) * (Number(rate) || 0));

  function pickPreset(p: (typeof QUICK_EXPENSES)[number]) {
    setTitle(p.title);
    setCategory(p.category);
    setCurrency(p.currency);
    setRecurrence(p.recurrence);
  }

  return (
    <Modal title={expense ? "Edit expense" : "Add expense"} onClose={onClose}>
      <form
        action={(fd) => run(() => saveExpense(expense?.id ?? null, fd), { onDone: onClose })}
        className="space-y-3"
      >
        {!expense && (
          <div className="flex flex-wrap gap-1.5">
            {QUICK_EXPENSES.map((p) => (
              <button
                key={p.title}
                type="button"
                onClick={() => pickPreset(p)}
                className={`text-xs rounded-full px-2.5 py-1 ring-1 ${
                  title === p.title ? "bg-brand-600 text-white ring-brand-600" : "ring-slate-200 text-slate-600"
                }`}
              >
                {p.title}
              </button>
            ))}
          </div>
        )}

        <label className="block text-sm font-medium">
          What did you buy?
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Claude Code"
            required
            className={fieldClass()}
          />
        </label>

        <div className="block text-sm font-medium">
          How much?
          <div className="flex gap-2 mt-1">
            <div className="flex rounded-xl bg-slate-100 p-1 text-sm shrink-0">
              {(["PKR", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={`rounded-lg px-3 font-semibold ${currency === c ? "bg-white shadow-sm text-brand-700" : "text-slate-500"}`}
                >
                  {c === "PKR" ? "Rs" : "$"}
                </button>
              ))}
            </div>
            <input
              name={currency === "USD" ? "foreign_amount" : "amount"}
              type={amountType}
              step="0.01"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={currency === "USD" ? "20" : "5000"}
              required
              className={fieldClass()}
            />
          </div>
          <input type="hidden" name="currency" value={currency} />
          {currency === "USD" && (
            <p className="text-xs text-slate-500 font-normal mt-1">
              {pkrEstimate > 0 ? `≈ ${rs(pkrEstimate)} ` : ""}at Rs{" "}
              <input
                name="usd_rate"
                type="number"
                step="0.01"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-16 rounded border border-slate-200 px-1 py-0.5 text-xs"
                aria-label="Dollar rate in rupees"
              />{" "}
              per $1
            </p>
          )}
        </div>

        <label className="block text-sm font-medium">
          Date
          <input name="spent_on" type="date" defaultValue={expense?.spent_on ?? board.today} required className={fieldClass()} />
        </label>

        <button type="button" onClick={() => setMore(!more)} className="text-xs text-brand-700">
          {more ? "▾ Fewer options" : "▸ More options (repeats, who paid, category)"}
        </button>
        {/* Always in the form (just hidden), so their values are saved either way. */}
        <div className={more ? "space-y-2" : "hidden"}>
          <label className="block text-xs text-slate-500">
            Does it repeat?
            <select
              name="recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as Recurrence)}
              className={fieldClass()}
            >
              <option value="none">No, one time</option>
              <option value="monthly">Yes, every month (remind me)</option>
              <option value="yearly">Yes, every year (remind me)</option>
            </select>
          </label>
          {board.partners.length > 0 && (
            <label className="block text-xs text-slate-500">
              Who paid?
              <select name="paid_by" defaultValue={expense?.paid_by ?? collector?.id} className={fieldClass()}>
                {board.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-xs text-slate-500">
            Category
            <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass()}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <input name="note" defaultValue={expense?.note ?? ""} placeholder="Note (optional)" className={fieldClass()} />
        </div>

        <button disabled={pending} className={`w-full ${btn.primary}`}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Msg error={error} />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tutors' share
// ---------------------------------------------------------------------------

function TutorShares({ board, books }: { board: FinanceBoard; books: ReturnType<typeof computeBooks> }) {
  const rs = useRs();
  const [edit, setEdit] = useState(false);
  const { pending, error, run } = useAction();

  if (board.partners.length === 0) return <TutorSetup />;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold">Each tutor&apos;s share</h2>
        <button onClick={() => setEdit(true)} className="text-xs text-brand-700">
          Edit tutors
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Profit {rs(books.profit)} split by share. Fees go to {books.collector?.name}.
      </p>
      <ul className="divide-y">
        {books.positions.map((p) => (
          <li key={p.partner.id} className="flex justify-between py-2">
            <span>
              {p.partner.name} <span className="text-xs text-slate-400">{Math.round(p.share * 100)}%</span>
            </span>
            <span className="font-semibold tabular-nums">{rs(p.entitled)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 rounded-xl bg-slate-50 p-3">
        {books.settlements.length === 0 ? (
          <p className="text-sm text-emerald-700 font-medium">✓ Everyone has their share. Nothing to pay.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-2">
              To give everyone their share{books.expenses > 0 ? " (and pay back whoever bought a tool)" : ""}:
            </p>
            <ul className="space-y-2">
              {books.settlements.map((s) => (
                <li key={`${s.from.id}-${s.to.id}`} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm">
                    <b>{s.from.name}</b> pays <b>{s.to.name}</b>{" "}
                    <b className="tabular-nums">{rs(s.amount)}</b>
                  </span>
                  <button
                    disabled={pending}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("from_partner", String(s.from.id));
                      fd.set("to_partner", String(s.to.id));
                      fd.set("amount", String(s.amount));
                      fd.set("sent_on", board.today);
                      fd.set("note", "Share paid");
                      run(() => saveTransfer(fd));
                    }}
                    className="text-xs rounded-lg bg-emerald-600 text-white px-2.5 py-1.5 font-semibold disabled:opacity-50"
                  >
                    ✓ Paid
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <Msg error={error} />
      </div>

      {board.transfers.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="text-xs text-slate-500 cursor-pointer">Already paid ({board.transfers.length})</summary>
          <ul className="divide-y mt-1">
            {board.transfers.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-xs">
                  {fmtDay(t.sent_on)} · {board.partners.find((p) => p.id === t.from_partner)?.name} →{" "}
                  {board.partners.find((p) => p.id === t.to_partner)?.name}
                </span>
                <span className="flex items-center gap-1">
                  <span className="tabular-nums font-medium">{rs(t.amount)}</span>
                  <button
                    disabled={pending}
                    onClick={() => confirm("Undo this payment?") && run(() => deleteTransfer(t.id))}
                    className="text-slate-300 hover:text-rose-600 px-1 text-lg leading-none"
                    aria-label="Undo payment"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {edit && <TutorsModal partners={board.partners} onClose={() => setEdit(false)} />}
    </Card>
  );
}

function TutorSetup() {
  const [names, setNames] = useState(["", "", ""]);
  const [collector, setCollector] = useState(0);
  const { pending, error, run } = useAction();
  const filled = names.filter((n) => n.trim());
  return (
    <Card>
      <h2 className="font-bold">Each tutor&apos;s share</h2>
      <p className="text-sm text-slate-500 mb-3">Write the tutors&apos; names. The profit is split equally.</p>
      <form action={(fd) => run(() => setupPartners(fd))} className="space-y-2">
        {names.map((n, i) => (
          <input
            key={i}
            name="name"
            value={n}
            onChange={(e) => setNames(names.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={`Tutor ${i + 1}`}
            className={fieldClass()}
          />
        ))}
        {filled.length > 0 && (
          <label className="block text-sm">
            Student fees come to:
            <select
              name="collector"
              value={collector}
              onChange={(e) => setCollector(Number(e.target.value))}
              className={fieldClass()}
            >
              {/* The index counts only filled names, the same way the server reads them. */}
              {filled.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button disabled={pending || filled.length === 0} className={`w-full ${btn.primary}`}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Msg error={error} />
      </form>
    </Card>
  );
}

function TutorsModal({ partners, onClose }: { partners: FinancePartner[]; onClose: () => void }) {
  const total = partners.reduce((s, p) => s + p.share_pct, 0);
  return (
    <Modal title="Tutors" onClose={onClose}>
      {Math.abs(total - 100) > 0.05 && (
        <p className="text-xs rounded-lg bg-amber-50 text-amber-800 px-2 py-1.5 mb-3">
          Shares add up to {Math.round(total * 100) / 100}%. Make them add up to 100%.
        </p>
      )}
      <div className="space-y-3">
        {partners.map((p) => (
          <TutorRow key={p.id} partner={p} />
        ))}
        <TutorRow partner={null} />
      </div>
    </Modal>
  );
}

function TutorRow({ partner }: { partner: FinancePartner | null }) {
  const { pending, error, ok, run } = useAction();
  return (
    <form
      action={(fd) => run(() => savePartner(partner?.id ?? null, fd), { success: "Saved." })}
      className={`rounded-xl p-3 space-y-2 ${partner ? "bg-slate-50" : "border border-dashed border-slate-300"}`}
    >
      <div className="grid grid-cols-[1fr_5.5rem] gap-2">
        <input name="name" defaultValue={partner?.name ?? ""} placeholder="New tutor's name" required className={fieldClass()} />
        <div className="relative">
          <input
            name="share_pct"
            type="number"
            step="0.01"
            min={0}
            max={100}
            defaultValue={partner?.share_pct ?? 0}
            className={`${fieldClass()} pr-6`}
            aria-label="Share in percent"
          />
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">%</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" name="receives_fees" defaultChecked={partner?.receives_fees ?? false} />
          Fees come to this tutor
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
