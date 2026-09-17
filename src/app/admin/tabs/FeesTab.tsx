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
  updateInvoice,
  type FeeBoard,
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
  rs,
  useAction,
} from "../ui";

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
  const reminders = useAction();
  const [paying, setPaying] = useState<FeeBoardRow | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<{ row: FeeBoardRow; invoice: InvoiceView } | null>(null);
  const [viewingReceipts, setViewingReceipts] = useState<FeeBoardRow | null>(null);
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
            <button onClick={exportGrid} className={btn.small}>
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
                    <span className="block mt-1">
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
                            title={`Due ${fmtDay(i.due_date)} · blocked after ${fmtDay(i.grace_until)}`}
                          >
                            <FeeBadge status={i.status} />
                            <span className="block text-[11px] text-slate-400 tabular-nums">
                              {i.remaining > 0 ? `${rs(i.remaining)} left` : `${rs(i.paid)} · undo`}
                            </span>
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
                    {r.remaining > 0 ? (
                      <button
                        onClick={() => setPaying(r)}
                        className="text-xs rounded-lg bg-emerald-600 text-white px-2 py-1"
                      >
                        Record payment
                      </button>
                    ) : (
                      <button onClick={() => setViewingReceipts(r)} className={btn.small}>
                        Receipts
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <EmptyRow colSpan={months.length + 3}>No students enrolled in this intake.</EmptyRow>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Tap a month to change its due date, amount or discount — or to undo a payment recorded by mistake.
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">Payment history</h2>
          <button onClick={exportPayments} disabled={board.payments.length === 0} className={btn.small}>
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
      {editingInvoice && (
        <InvoiceModal
          name={editingInvoice.row.name}
          invoice={editingInvoice.invoice}
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

function PaymentItem({ p }: { p: FeeBoard["payments"][number] }) {
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
  const pay = useAction();
  const unpaid = row.invoices.filter((i) => i.remaining > 0);
  const [target, setTarget] = useState<string>(unpaid.length === 1 ? String(unpaid[0].month_no) : "auto");
  const suggested =
    target === "auto" ? row.remaining : row.invoices.find((i) => String(i.month_no) === target)?.remaining ?? 0;
  const [amount, setAmount] = useState<string>(String(suggested));
  const [receipt, setReceipt] = useState<string | null>(null);

  return (
    <Modal title={`Record payment — ${row.name}`} onClose={onClose}>
      {receipt ? (
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
                type="number"
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

function InvoiceModal({
  name,
  invoice,
  payments,
  onClose,
}: {
  name: string;
  invoice: InvoiceView;
  payments: FeePaymentRow[];
  onClose: () => void;
}) {
  const save = useAction();
  return (
    <Modal title={`${name} — Month ${invoice.month_no}`} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        Paid {rs(invoice.paid)} of {rs(invoice.amount - invoice.discount)} · <FeeBadge status={invoice.status} />
      </p>

      {payments.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-3 mb-4">
          <h3 className="font-semibold text-sm mb-1">Payments for this month</h3>
          <p className="text-xs text-slate-400 mb-2">
            Recorded by mistake? Undo it — the month goes back to unpaid.
          </p>
          <ul className="divide-y text-sm">
            {payments.map((p) => (
              <PaymentRowItem key={p.id} p={p} studentName={name} />
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
            <input name="amount" type="number" min={0} defaultValue={invoice.amount} className={fieldClass()} />
          </label>
          <label>
            <span className="block text-xs font-medium text-slate-500 mb-1">Discount</span>
            <input name="discount" type="number" min={0} defaultValue={invoice.discount} className={fieldClass()} />
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

function PaymentRowItem({ p, studentName }: { p: FeePaymentRow; studentName: string }) {
  const del = useAction();
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
          </p>
        </div>
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
      </div>
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
  return (
    <Modal title={`${row.name} — payments`} onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        {rs(row.paid)} paid of {rs(row.total)}. Undo anything recorded by mistake.
      </p>
      {payments.length === 0 ? (
        <p className="text-slate-400 text-sm">Nothing recorded yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {payments.map((p) => (
            <PaymentRowItem key={p.id} p={p} studentName={row.name} />
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
