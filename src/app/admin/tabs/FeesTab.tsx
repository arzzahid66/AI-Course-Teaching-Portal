"use client";

import { useState } from "react";
import {
  deletePayment,
  deletePaymentAccount,
  deletePaymentRow,
  recordPayment,
  savePaymentAccount,
  saveTutorWhatsapp,
  sendFeeReminders,
  setFeePlan,
  setUnlockUntil,
  updateInvoice,
  updatePaymentRow,
  type FeeBoard,
  type FeePlan,
  type FeeBoardRow,
  type FeePaymentRow,
} from "@/actions/fees";
import type { InvoiceView, PaymentAccount } from "@/lib/course";
import type { BatchRow } from "@/lib/course";
import {
  Card,
  EmailStudentButton,
  EmptyRow,
  FeeBadge,
  Modal,
  Msg,
  StatCard,
  btn,
  downloadCsv,
  fieldClass,
  fmt,
  fmtDay,
  useAction,
  useAmountInputType,
  usePrivacy,
  useRs,
} from "../ui";

/**
 * Read a student's current plan back from their months: every month waived =
 * free, no discount anywhere = full, anything else = partial (the monthly
 * amount shown is the one most of their months charge).
 */
function currentPlan(r: FeeBoardRow): { plan: FeePlan; monthly: number } {
  const nets = r.invoices.map((i) => Math.max(0, i.amount - i.discount));
  if (nets.length > 0 && nets.every((n) => n === 0)) return { plan: "free", monthly: 0 };
  if (r.invoices.every((i) => i.discount === 0)) return { plan: "full", monthly: nets[0] ?? 0 };
  const counts = new Map<number, number>();
  for (const n of nets) counts.set(n, (counts.get(n) ?? 0) + 1);
  const monthly = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { plan: "partial", monthly };
}

export default function FeesTab({
  batch,
  board,
  accounts,
  whatsapp,
}: {
  batch: BatchRow;
  board: FeeBoard;
  accounts: PaymentAccount[];
  whatsapp: string;
}) {
  const rs = useRs();
  const privacy = usePrivacy();
  const reminders = useAction();
  const [paying, setPaying] = useState<FeeBoardRow | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<{ row: FeeBoardRow; invoice: InvoiceView } | null>(null);
  const [viewingReceipts, setViewingReceipts] = useState<FeeBoardRow | null>(null);
  const [planFor, setPlanFor] = useState<FeeBoardRow | null>(null);
  const [query, setQuery] = useState("");

  const months = Array.from({ length: Math.max(batch.months, ...board.rows.map((r) => r.invoices.length)) }, (_, i) => i + 1);
  const totals = board.rows.reduce(
    (t, r) => ({ total: t.total + r.total, paid: t.paid + r.paid, remaining: t.remaining + r.remaining }),
    { total: 0, paid: 0, remaining: 0 }
  );
  const overdue = board.rows.filter((r) => r.invoices.some((i) => i.status === "overdue")).length;
  const q = query.trim().toLowerCase();
  const rows = q ? board.rows.filter((r) => r.name.toLowerCase().includes(q)) : board.rows;

  function exportGrid() {
    downloadCsv(`fees-${batch.name.replace(/\W+/g, "-")}.csv`, [
      ["Student", "WhatsApp", ...months.flatMap((m) => [`Month ${m} due`, `Month ${m} paid`, `Month ${m} status`]), "Total", "Paid", "Remaining"],
      ...board.rows.map((r) => [
        r.name,
        r.whatsapp,
        ...months.flatMap((m) => {
          const i = r.invoices.find((x) => x.month_no === m);
          return i ? [i.due_date, i.paid, i.status] : ["", "", ""];
        }),
        r.total,
        r.paid,
        r.remaining,
      ]),
    ]);
  }

  function exportPayments() {
    downloadCsv(`payments-${batch.name.replace(/\W+/g, "-")}.csv`, [
      ["Receipt", "Student", "Months", "Amount", "Method", "Transaction ID", "Paid at", "Note"],
      ...board.payments.map((p) => [
        p.receipt_no,
        p.name,
        p.months.join(" + "),
        p.amount,
        p.method,
        p.reference,
        new Date(p.paid_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" }),
        p.note,
      ]),
    ]);
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Expected" value={rs(totals.total)} hint={`${board.rows.length} students`} />
        <StatCard label="Collected" value={rs(totals.paid)} tone="emerald" />
        <StatCard label="Remaining" value={rs(totals.remaining)} tone={totals.remaining ? "amber" : "slate"} />
        <StatCard label="Blocked" value={String(overdue)} hint="unpaid after grace" tone={overdue ? "rose" : "slate"} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">Fees — {batch.name}</h2>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={exportGrid}
              disabled={privacy}
              title={privacy ? "Turn off privacy mode to export" : undefined}
              className={btn.small}
            >
              Export grid CSV
            </button>
            <button
              onClick={() =>
                reminders.run(() => sendFeeReminders(batch.id), {
                  success: (res) => `Reminder sent to ${res?.sent ?? 0} student(s) with notifications on.`,
                })
              }
              disabled={reminders.pending}
              className={btn.small}
            >
              Send reminder to due students
            </button>
          </div>
        </div>
        <Msg error={reminders.error} ok={reminders.ok} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search student…"
          className={`${fieldClass()} mb-3`}
        />
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 px-2">Student</th>
                {months.map((m) => (
                  <th key={m} className="py-2 px-2">
                    Month {m}
                  </th>
                ))}
                <th className="py-2 px-2 text-right">Left</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.enrollment_id} className={`border-b last:border-0 ${r.enrollment_status === "dropped" ? "opacity-50" : ""}`}>
                  <td className="py-2 px-2 font-medium">
                    {r.name}
                    {r.enrollment_status !== "active" && (
                      <span className="text-xs text-slate-400 font-normal"> · {r.enrollment_status}</span>
                    )}
                    <span className="flex flex-wrap gap-1 mt-1">
                      <PlanChip row={r} onClick={() => setPlanFor(r)} />
                      <EmailStudentButton studentId={r.student_id} name={r.name} defaultSubject="About your fees" />
                    </span>
                  </td>
                  {months.map((m) => {
                    const i = r.invoices.find((x) => x.month_no === m);
                    return (
                      <td key={m} className="py-2 px-2">
                        {i ? (
                          <button
                            onClick={() => setEditingInvoice({ row: r, invoice: i })}
                            className="text-left"
                            title={
                              i.paid > 0
                                ? `Due ${fmtDay(i.due_date)} · part paid, so never blocked`
                                : i.extended
                                  ? `Due ${fmtDay(i.due_date)} · extra time given: portal open till ${fmtDay(i.grace_until)}`
                                  : `Due ${fmtDay(i.due_date)} · blocked after ${fmtDay(i.grace_until)} if nothing is paid`
                            }
                          >
                            <FeeBadge status={i.status} />
                            <span className="block text-[11px] text-slate-400 tabular-nums">
                              {i.remaining > 0 ? `${rs(i.remaining)} left` : `${rs(i.paid)} · undo`}
                            </span>
                            {i.extended && i.remaining > 0 && (
                              <span className="block text-[11px] text-amber-700">open till {fmtDay(i.grace_until)}</span>
                            )}
                          </button>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className={`py-2 px-2 text-right font-semibold tabular-nums ${r.remaining ? "text-rose-600" : "text-slate-400"}`}>
                    {r.remaining ? rs(r.remaining) : "—"}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span className="inline-flex flex-col items-end gap-1">
                      {r.remaining > 0 && (
                        <button
                          onClick={() => setPaying(r)}
                          className="text-xs rounded-lg bg-emerald-600 text-white px-2 py-1 whitespace-nowrap"
                        >
                          Record payment
                        </button>
                      )}
                      {r.paid > 0 && (
                        <button onClick={() => setViewingReceipts(r)} className={`${btn.small} whitespace-nowrap`}>
                          Receipts
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <EmptyRow colSpan={months.length + 3}>No students enrolled in this intake.</EmptyRow>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Tap a student&apos;s plan to make them full fee, partial (reduced) or free. Tap a month to change its due
          date, amount or discount. Open <b>Receipts</b> to move a payment to another month, fix its amount, or undo it.
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">Payment history</h2>
          <button
            onClick={exportPayments}
            disabled={privacy || board.payments.length === 0}
            title={privacy ? "Turn off privacy mode to export" : undefined}
            className={btn.small}
          >
            Export CSV
          </button>
        </div>
        <ul className="divide-y text-sm">
          {board.payments.map((p) => (
            <PaymentItem key={p.receipt_no} p={p} />
          ))}
          {board.payments.length === 0 && <li className="py-6 text-center text-slate-400">No payments recorded yet.</li>}
        </ul>
      </Card>

      <PaymentAccountsCard accounts={accounts} whatsapp={whatsapp} />

      {paying && <RecordPaymentModal row={paying} onClose={() => setPaying(null)} />}
      {planFor && <FeePlanModal row={planFor} monthlyFee={batch.monthly_fee} onClose={() => setPlanFor(null)} />}
      {editingInvoice && (
        <InvoiceModal
          name={editingInvoice.row.name}
          invoice={editingInvoice.invoice}
          invoices={editingInvoice.row.invoices}
          payments={board.paymentRows.filter((p) => p.invoice_id === editingInvoice.invoice.id)}
          onClose={() => setEditingInvoice(null)}
        />
      )}
      {viewingReceipts && (
        <ReceiptsModal
          row={viewingReceipts}
          payments={board.paymentRows.filter((p) => p.enrollment_id === viewingReceipts.enrollment_id)}
          onClose={() => setViewingReceipts(null)}
        />
      )}
    </>
  );
}

function PlanChip({ row, onClick }: { row: FeeBoardRow; onClick: () => void }) {
  const rs = useRs();
  const { plan, monthly } = currentPlan(row);
  const style =
    plan === "free"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : plan === "partial"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-slate-200 text-slate-600";
  const label = plan === "free" ? "Free" : plan === "partial" ? `Partial · ${rs(monthly)}/mo` : "Full fee";
  return (
    <button
      onClick={onClick}
      title="Change fee plan"
      className={`text-xs font-normal rounded-lg border px-2 py-0.5 ${style}`}
    >
      {label} ▾
    </button>
  );
}

function FeePlanModal({
  row,
  monthlyFee,
  onClose,
}: {
  row: FeeBoardRow;
  monthlyFee: number;
  onClose: () => void;
}) {
  const rs = useRs();
  const amountType = useAmountInputType();
  const save = useAction();
  const current = currentPlan(row);
  const [plan, setPlan] = useState<FeePlan>(current.plan);
  // A sensible starting amount for a new partial plan: half the normal fee.
  const [monthly, setMonthly] = useState(
    String(current.plan === "partial" ? current.monthly : Math.round(monthlyFee / 2))
  );
  const m = Math.max(0, Math.round(Number(monthly) || 0));
  const total = row.invoices.reduce(
    (s, i) => s + (plan === "free" ? 0 : plan === "partial" ? Math.min(m, i.amount) : i.amount),
    0
  );

  const options: [FeePlan, string, string][] = [
    ["full", "Full fee", `${rs(monthlyFee)} a month, the normal fee.`],
    ["partial", "Partial (reduced fee)", "The student pays a lower amount every month."],
    ["free", "Free", "Every month waived. Never locked for fees."],
  ];

  return (
    <Modal title={`Fee plan — ${row.name}`} onClose={onClose}>
      <form action={(fd) => save.run(() => setFeePlan(row.enrollment_id, fd), { onDone: onClose })} className="space-y-3">
        <div className="space-y-2">
          {options.map(([value, label, hint]) => (
            <label
              key={value}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${
                plan === value ? "border-brand-500 bg-brand-50" : "border-slate-200"
              }`}
            >
              <input
                type="radio"
                name="plan"
                value={value}
                checked={plan === value}
                onChange={() => setPlan(value)}
                className="mt-1 h-4 w-4 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        {plan === "partial" && (
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Student pays per month (Rs)</span>
            <input
              name="monthly"
              type={amountType}
              min={1}
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              className={fieldClass()}
            />
          </label>
        )}

        <p className="text-sm text-slate-600 rounded-xl bg-slate-50 px-3 py-2">
          New total <b className="tabular-nums">{rs(total)}</b> · already paid{" "}
          <b className="tabular-nums">{rs(row.paid)}</b> · left{" "}
          <b className="tabular-nums">{rs(Math.max(0, total - row.paid))}</b>
        </p>
        <p className="text-xs text-slate-400">
          Receipts are kept. If a month already has more paid than the new amount, the extra moves to the next unpaid
          month automatically. To change just one month, tap that month in the grid instead.
        </p>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="notify_email" type="checkbox" className="h-4 w-4 accent-brand-600" />
          Email the student about their new plan
        </label>
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save plan
        </button>
        <Msg error={save.error} />
      </form>
    </Modal>
  );
}

function PaymentItem({ p }: { p: FeeBoard["payments"][number] }) {
  const rs = useRs();
  const del = useAction();
  return (
    <li className="py-2 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="font-medium">
          {p.name} · <span className="tabular-nums">{rs(p.amount)}</span>
          <span className="text-slate-400 font-normal"> · Month {p.months.join(" + ")}</span>
        </p>
        <p className="text-xs text-slate-500">
          <span className="font-mono">{p.receipt_no}</span> · {p.method}
          {p.reference ? ` · ${p.reference}` : ""} · {fmt(p.paid_at)}
          {p.note ? ` · ${p.note}` : ""}
        </p>
        <Msg error={del.error} />
      </div>
      <button
        onClick={() => {
          if (!confirm(`Delete receipt ${p.receipt_no} (${rs(p.amount)})? Those months become unpaid again.`)) return;
          del.run(() => deletePayment(p.receipt_no));
        }}
        disabled={del.pending}
        className={btn.smallDanger}
      >
        Delete
      </button>
    </li>
  );
}

function RecordPaymentModal({ row, onClose }: { row: FeeBoardRow; onClose: () => void }) {
  const rs = useRs();
  const amountType = useAmountInputType();
  const pay = useAction();
  const unpaid = row.invoices.filter((i) => i.remaining > 0);
  const [target, setTarget] = useState<string>(unpaid.length === 1 ? String(unpaid[0].month_no) : "auto");
  const suggested =
    target === "auto" ? row.remaining : row.invoices.find((i) => String(i.month_no) === target)?.remaining ?? 0;
  const [amount, setAmount] = useState<string>(String(suggested));
  const [receipt, setReceipt] = useState<string | null>(null);
  const [mode, setMode] = useState<"pay" | "time">("pay");

  return (
    <Modal title={`${mode === "pay" ? "Record payment" : "Give more time"} — ${row.name}`} onClose={onClose}>
      {!receipt && (
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 mb-3 text-sm">
          {(
            [
              ["pay", "Paid now"],
              ["time", "Will pay later"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg py-1.5 font-medium ${mode === m ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {mode === "time" && !receipt ? (
        <GiveTimeForm invoices={unpaid} onDone={onClose} />
      ) : receipt ? (
        <div className="text-center py-4">
          <p className="text-emerald-700 font-semibold">Payment recorded</p>
          <p className="font-mono text-lg mt-1">{receipt}</p>
          <button onClick={onClose} className={`mt-4 ${btn.dark}`}>
            Done
          </button>
        </div>
      ) : (
        <form
          action={(fd) =>
            pay.run(() => recordPayment(fd), {
              onDone: (res) => setReceipt(res && "receiptNo" in res ? (res.receiptNo ?? "") : ""),
            })
          }
          className="space-y-2"
        >
          <input type="hidden" name="enrollment_id" value={row.enrollment_id} />
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">What is this for?</span>
            <select
              name="target"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                const v =
                  e.target.value === "auto"
                    ? row.remaining
                    : row.invoices.find((i) => String(i.month_no) === e.target.value)?.remaining ?? 0;
                setAmount(String(v));
              }}
              className={fieldClass()}
            >
              <option value="auto">All remaining months ({rs(row.remaining)})</option>
              {unpaid.map((i) => (
                <option key={i.id} value={i.month_no}>
                  Month {i.month_no} — {rs(i.remaining)} left
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Amount (Rs)</span>
              <input
                name="amount"
                type={amountType}
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={fieldClass()}
              />
            </label>
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Paid on</span>
              <input
                name="paid_on"
                type="date"
                defaultValue={new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date())}
                className={fieldClass()}
              />
            </label>
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Method</span>
              <select name="method" defaultValue="EasyPaisa" className={fieldClass()}>
                <option>EasyPaisa</option>
                <option>JazzCash</option>
                <option>Bank</option>
                <option>Cash</option>
              </select>
            </label>
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Transaction ID</span>
              <input name="reference" placeholder="optional" className={fieldClass()} />
            </label>
          </div>
          <input name="note" placeholder="Note (optional)" className={fieldClass()} />
          <button type="submit" disabled={pay.pending} className={`w-full ${btn.green}`}>
            Record {amount ? rs(Number(amount) || 0) : "payment"}
          </button>
          <Msg error={pay.error} />
        </form>
      )}
    </Modal>
  );
}

/**
 * "I'll pay next month": keep the portal unlocked until a chosen date. The
 * amount keeps showing as remaining; if nothing is paid by then, it locks again.
 */
function GiveTimeForm({ invoices, onDone }: { invoices: InvoiceView[]; onDone: () => void }) {
  const rs = useRs();
  const save = useAction();
  const clear = useAction();
  // Start on the month that is locking them (or the oldest with nothing paid).
  const first =
    invoices.find((i) => i.blocks) ?? invoices.find((i) => i.paid === 0) ?? invoices[0];
  const [invoiceId, setInvoiceId] = useState<number | undefined>(first?.id);
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!inv) return <p className="text-sm text-slate-400">Nothing left to pay.</p>;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  // Default: a month from today (or the date already given).
  const in30 = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(
    new Date(Date.now() + 30 * 86_400_000)
  );
  const suggested = inv.extended && inv.grace_until >= today ? inv.grace_until : in30;

  return (
    <form
      key={inv.id}
      action={(fd) => save.run(() => setUnlockUntil(inv.id, fd), { onDone })}
      className="space-y-2"
    >
      {invoices.length > 1 && (
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Which month?</span>
          <select value={inv.id} onChange={(e) => setInvoiceId(Number(e.target.value))} className={fieldClass()}>
            {invoices.map((i) => (
              <option key={i.id} value={i.id}>
                Month {i.month_no} — {rs(i.remaining)} left{i.extended ? ` · open till ${fmtDay(i.grace_until)}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">Keep portal open until</span>
        <input name="until" type="date" min={today} defaultValue={suggested} className={fieldClass()} />
      </label>
      <input name="note" placeholder="Note (optional), e.g. will pay with next month" className={fieldClass()} />
      <p className="text-xs text-slate-500 rounded-xl bg-amber-50 px-3 py-2">
        Month {inv.month_no} still shows <b className="tabular-nums">{rs(inv.remaining)}</b> left — for you and for the
        student. The portal stays unlocked until this date; if nothing is paid by then, it locks again.
      </p>
      <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
        Unlock portal till this date
      </button>
      {inv.extended && (
        <button
          type="button"
          onClick={() => {
            const fd = new FormData();
            fd.set("until", "");
            clear.run(() => setUnlockUntil(inv.id, fd), { onDone });
          }}
          disabled={clear.pending}
          className={`w-full ${btn.small}`}
        >
          Remove extra time (normal grace period)
        </button>
      )}
      <Msg error={save.error || clear.error} />
    </form>
  );
}

function InvoiceModal({
  name,
  invoice,
  invoices,
  payments,
  onClose,
}: {
  name: string;
  invoice: InvoiceView;
  invoices: InvoiceView[];
  payments: FeePaymentRow[];
  onClose: () => void;
}) {
  const rs = useRs();
  const amountType = useAmountInputType();
  const save = useAction();
  return (
    <Modal title={`${name} — Month ${invoice.month_no}`} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        Paid {rs(invoice.paid)} of {rs(invoice.amount - invoice.discount)} · <FeeBadge status={invoice.status} />
      </p>

      {invoice.remaining > 0 && (
        <details className="rounded-xl border border-slate-200 p-3 mb-4" open={invoice.extended}>
          <summary className="font-semibold text-sm cursor-pointer">
            Will pay later? Keep the portal open
            {invoice.extended && (
              <span className="font-normal text-amber-700"> · open till {fmtDay(invoice.grace_until)}</span>
            )}
          </summary>
          <div className="mt-2">
            <GiveTimeForm invoices={[invoice]} onDone={onClose} />
          </div>
        </details>
      )}

      {payments.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-3 mb-4">
          <h3 className="font-semibold text-sm mb-1">Payments for this month</h3>
          <p className="text-xs text-slate-400 mb-2">
            Wrong month or amount? Edit it. Recorded by mistake? Undo it.
          </p>
          <ul className="divide-y text-sm">
            {payments.map((p) => (
              <PaymentRowItem key={p.id} p={p} studentName={name} invoices={invoices} />
            ))}
          </ul>
        </div>
      )}
      <form action={(fd) => save.run(() => updateInvoice(invoice.id, fd), { onDone: onClose })} className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <label>
            <span className="block text-xs font-medium text-slate-500 mb-1">Due date</span>
            <input name="due_date" type="date" defaultValue={invoice.due_date} className={fieldClass()} />
          </label>
          <label>
            <span className="block text-xs font-medium text-slate-500 mb-1">Amount</span>
            <input name="amount" type={amountType} min={0} defaultValue={invoice.amount} className={fieldClass()} />
          </label>
          <label>
            <span className="block text-xs font-medium text-slate-500 mb-1">Discount</span>
            <input name="discount" type={amountType} min={0} defaultValue={invoice.discount} className={fieldClass()} />
          </label>
        </div>
        <input name="note" defaultValue={invoice.note ?? ""} placeholder="Note, e.g. sibling discount" className={fieldClass()} />
        <p className="text-xs text-slate-400">A discount equal to the amount waives the month.</p>
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save
        </button>
        <Msg error={save.error} />
      </form>
    </Modal>
  );
}

function PaymentRowItem({
  p,
  studentName,
  invoices,
}: {
  p: FeePaymentRow;
  studentName: string;
  invoices: InvoiceView[];
}) {
  const rs = useRs();
  const amountType = useAmountInputType();
  const del = useAction();
  const save = useAction();
  const [editing, setEditing] = useState(false);
  const paidOn = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date(p.paid_at));
  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium tabular-nums">
            {rs(p.amount)} <span className="text-slate-400 font-normal">· Month {p.month_no}</span>
          </p>
          <p className="text-xs text-slate-500">
            <span className="font-mono">{p.receipt_no}</span> · {p.method}
            {p.reference ? ` · ${p.reference}` : ""} · {fmt(p.paid_at)}
            {p.note ? ` · ${p.note}` : ""}
          </p>
        </div>
        <span className="flex gap-1 shrink-0">
          <button onClick={() => setEditing((v) => !v)} className={btn.small}>
            {editing ? "Close" : "Edit"}
          </button>
          <button
            onClick={() => {
              if (!confirm(`Undo ${rs(p.amount)} for Month ${p.month_no} (${studentName})? The month goes back to unpaid.`))
                return;
              del.run(() => deletePaymentRow(p.id));
            }}
            disabled={del.pending}
            className={btn.smallDanger}
          >
            Undo
          </button>
        </span>
      </div>
      {editing && (
        <form
          action={(fd) => save.run(() => updatePaymentRow(p.id, fd), { onDone: () => setEditing(false) })}
          className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Pays for</span>
              <select name="month_no" defaultValue={p.month_no} className={fieldClass()}>
                {invoices.map((i) => {
                  const room = i.remaining + (i.id === p.invoice_id ? p.amount : 0);
                  return (
                    <option key={i.id} value={i.month_no}>
                      Month {i.month_no} — {room > 0 ? `${rs(room)} room` : "full"}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Amount (Rs)</span>
              <input name="amount" type={amountType} min={1} defaultValue={p.amount} className={fieldClass()} />
            </label>
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Paid on</span>
              <input name="paid_on" type="date" defaultValue={paidOn} className={fieldClass()} />
            </label>
            <label>
              <span className="block text-xs font-medium text-slate-500 mb-1">Method</span>
              <select name="method" defaultValue={p.method} className={fieldClass()}>
                {Array.from(new Set(["EasyPaisa", "JazzCash", "Bank", "Cash", p.method])).map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>
          <input name="reference" defaultValue={p.reference ?? ""} placeholder="Transaction ID (optional)" className={fieldClass()} />
          <input name="note" defaultValue={p.note ?? ""} placeholder="Note (optional)" className={fieldClass()} />
          <p className="text-xs text-slate-400">
            Method, transaction ID, date and note apply to the whole receipt {p.receipt_no}.
          </p>
          <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
            Save changes
          </button>
          <Msg error={save.error} />
        </form>
      )}
      <Msg error={del.error} />
    </li>
  );
}

function ReceiptsModal({
  row,
  payments,
  onClose,
}: {
  row: FeeBoardRow;
  payments: FeePaymentRow[];
  onClose: () => void;
}) {
  const rs = useRs();
  return (
    <Modal title={`${row.name} — payments`} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        {rs(row.paid)} paid of {rs(row.total)}. Edit a payment to move it to another month or fix its amount.
      </p>
      {payments.length === 0 ? (
        <p className="text-slate-400 text-sm">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {payments.map((p) => (
            <PaymentRowItem key={p.id} p={p} studentName={row.name} invoices={row.invoices} />
          ))}
        </ul>
      )}
    </Modal>
  );
}

function PaymentAccountsCard({ accounts, whatsapp }: { accounts: PaymentAccount[]; whatsapp: string }) {
  const wa = useAction();
  const [editing, setEditing] = useState<PaymentAccount | "new" | null>(null);
  return (
    <Card>
      <h2 className="font-bold mb-1">Payment accounts</h2>
      <p className="text-slate-500 text-sm mb-3">
        Every student sees the active accounts in their Fees tab. Changes show straight away.
      </p>
      <ul className="divide-y text-sm mb-3">
        {accounts.map((a) => (
          <li key={a.id} className="py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {a.method}{" "}
                <span className={`text-xs rounded-full px-2 py-0.5 ${a.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                  {a.is_active ? "shown" : "hidden"}
                </span>
              </p>
              <p className="text-xs text-slate-500 truncate">
                {[a.account_title, a.account_number, a.bank_name, a.iban].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button onClick={() => setEditing(a)} className={btn.small}>
              Edit
            </button>
          </li>
        ))}
        {accounts.length === 0 && <li className="py-4 text-center text-slate-400">No accounts yet.</li>}
      </ul>
      <button onClick={() => setEditing("new")} className={btn.small}>
        + Add account
      </button>

      <form
        action={(fd) => wa.run(() => saveTutorWhatsapp(fd), { success: "WhatsApp number saved." })}
        className="flex gap-2 mt-4 items-end"
      >
        <label className="flex-1">
          <span className="block text-xs font-medium text-slate-500 mb-1">WhatsApp for payment screenshots</span>
          <input name="whatsapp" defaultValue={whatsapp} placeholder="03001234567" className={fieldClass()} />
        </label>
        <button type="submit" disabled={wa.pending} className={btn.dark}>
          Save
        </button>
      </form>
      <Msg error={wa.error} ok={wa.ok} />

      {editing && <AccountModal account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function AccountModal({ account, onClose }: { account: PaymentAccount | null; onClose: () => void }) {
  const save = useAction();
  const del = useAction();
  return (
    <Modal title={account ? `Edit ${account.method}` : "Add payment account"} onClose={onClose}>
      <form
        action={(fd) => save.run(() => savePaymentAccount(account?.id ?? null, fd), { onDone: onClose })}
        className="space-y-2"
      >
        <div className="grid grid-cols-2 gap-2">
          <input name="method" list="methods" defaultValue={account?.method ?? ""} placeholder="Method (EasyPaisa…)" className={fieldClass()} />
          <datalist id="methods">
            <option value="EasyPaisa" />
            <option value="JazzCash" />
            <option value="Bank" />
          </datalist>
          <input name="account_title" defaultValue={account?.account_title ?? ""} placeholder="Account title" className={fieldClass()} />
          <input name="account_number" defaultValue={account?.account_number ?? ""} placeholder="Account / mobile number" className={fieldClass()} />
          <input name="bank_name" defaultValue={account?.bank_name ?? ""} placeholder="Bank name (for bank)" className={fieldClass()} />
        </div>
        <input name="iban" defaultValue={account?.iban ?? ""} placeholder="IBAN (optional)" className={fieldClass()} />
        <textarea
          name="instructions"
          rows={2}
          defaultValue={account?.instructions ?? ""}
          placeholder="Note for students, e.g. write your name in the transfer note"
          className={fieldClass()}
        />
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={account?.is_active ?? true} /> Show to students
          </label>
          <label className="flex items-center gap-2 text-sm">
            Order
            <input name="sort_order" type="number" defaultValue={account?.sort_order ?? 0} className="w-16 rounded-lg border border-slate-300 px-2 py-1" />
          </label>
        </div>
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save account
        </button>
        <Msg error={save.error} />
      </form>
      {account && (
        <button
          onClick={() => {
            if (!confirm(`Delete the ${account.method} account?`)) return;
            del.run(() => deletePaymentAccount(account.id), { onDone: onClose });
          }}
          className="mt-4 text-sm text-rose-600 underline"
        >
          Delete account
        </button>
      )}
    </Modal>
  );
}
