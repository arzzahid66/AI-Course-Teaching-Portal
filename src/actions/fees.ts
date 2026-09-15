"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin } from "@/lib/auth";
import {
  getSetting,
  insertPayment,
  iso,
  loadInvoices,
  loadPaymentAccounts,
  type InvoiceView,
  type PaymentAccount,
} from "@/lib/course";
import { notifyStudent } from "@/lib/pushNotifications";

export type FeeBoardRow = {
  enrollment_id: number;
  student_id: number;
  name: string;
  whatsapp: string | null;
  enrollment_status: string;
  invoices: InvoiceView[];
  total: number;
  paid: number;
  remaining: number;
};

export type FeePayment = {
  receipt_no: string;
  student_id: number;
  enrollment_id: number;
  name: string;
  months: number[];
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  paid_at: string;
};

export type FeeBoard = { rows: FeeBoardRow[]; payments: FeePayment[] };

/** Student × month grid plus the payment history (one line per receipt) for an intake. */
export async function getFeeBoard(batchId: number): Promise<FeeBoard> {
  await assertAdmin();
  const [invoices, enrollments, paymentRows] = await Promise.all([
    loadInvoices({ batchId }),
    sql`
      SELECT e.id AS enrollment_id, e.student_id, s.name, s.whatsapp, e.status AS enrollment_status
      FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE e.batch_id = ${batchId}
      ORDER BY (e.status = 'dropped') ASC, s.name ASC
    ` as unknown as Promise<Omit<FeeBoardRow, "invoices" | "total" | "paid" | "remaining">[]>,
    sql`
      SELECT p.receipt_no, p.student_id, i.enrollment_id, s.name,
        array_agg(i.month_no ORDER BY i.month_no) AS months,
        SUM(p.amount) AS amount, MIN(p.method) AS method, MIN(p.reference) AS reference,
        MIN(p.note) AS note, MIN(p.paid_at) AS paid_at
      FROM payments p
      JOIN fee_invoices i ON i.id = p.invoice_id
      JOIN enrollments e ON e.id = i.enrollment_id
      JOIN students s ON s.id = p.student_id
      WHERE e.batch_id = ${batchId}
      GROUP BY p.receipt_no, p.student_id, i.enrollment_id, s.name
      ORDER BY MIN(p.paid_at) DESC
    ` as unknown as Promise<(Omit<FeePayment, "amount" | "paid_at"> & { amount: string; paid_at: Date })[]>,
  ]);

  const rows = enrollments.map((e) => {
    const mine = invoices.filter((i) => i.enrollment_id === e.enrollment_id);
    return {
      ...e,
      invoices: mine,
      total: mine.reduce((s, i) => s + Math.max(0, i.amount - i.discount), 0),
      paid: mine.reduce((s, i) => s + i.paid, 0),
      remaining: mine.reduce((s, i) => s + i.remaining, 0),
    };
  });
  const payments = paymentRows.map((p) => ({
    ...p,
    months: p.months.map(Number),
    amount: Number(p.amount),
    paid_at: iso(p.paid_at),
  }));
  return { rows, payments };
}

/** Record a payment: a single month, or "auto" to fill unpaid months oldest first. */
export async function recordPayment(formData: FormData): Promise<{ error?: string; receiptNo?: string }> {
  await assertAdmin();
  const enrollmentId = Number(formData.get("enrollment_id"));
  const amount = Math.round(Number(formData.get("amount")));
  const targetRaw = String(formData.get("target") ?? "auto");
  const method = String(formData.get("method") ?? "").trim() || "EasyPaisa";
  const reference = String(formData.get("reference") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const paidOn = String(formData.get("paid_on") ?? "").trim();

  if (!enrollmentId) return { error: "Pick a student." };
  if (!amount || Number.isNaN(amount) || amount <= 0) return { error: "Enter an amount above 0." };
  const target = targetRaw === "auto" ? "auto" : Number(targetRaw);
  if (target !== "auto" && (!target || Number.isNaN(target))) return { error: "Pick which month this pays." };

  const res = await insertPayment({
    enrollmentId,
    amount,
    target,
    method,
    reference: reference || null,
    note: note || null,
    paidAt: /^\d{4}-\d{2}-\d{2}$/.test(paidOn) ? paidOn : null,
  });
  if (res.error) return res;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return res;
}

/** Remove a whole receipt (all month rows it paid). */
export async function deletePayment(receiptNo: string): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM payments WHERE receipt_no = ${receiptNo}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

/** Edit one fee month: due date, amount, discount / waiver and note. */
export async function updateInvoice(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const amount = Math.round(Number(formData.get("amount")));
  const discount = Math.round(Number(formData.get("discount") || 0));
  const note = String(formData.get("note") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: "Pick a due date." };
  if (Number.isNaN(amount) || amount < 0) return { error: "Amount can't be negative." };
  if (Number.isNaN(discount) || discount < 0 || discount > amount) {
    return { error: "Discount must be between 0 and the amount." };
  }
  const paid = (await sql`
    SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = ${id}
  `) as { paid: string }[];
  if (Number(paid[0]?.paid ?? 0) > amount - discount) {
    return { error: "More than that has already been paid. Delete a receipt first." };
  }
  await sql`
    UPDATE fee_invoices
    SET due_date = ${dueDate}, amount = ${amount}, discount = ${discount}, note = ${note || null}
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

/** Push a reminder to every student in the intake with a month already due and unpaid. */
export async function sendFeeReminders(batchId: number): Promise<{ sent: number; error?: string }> {
  await assertAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const due = (await loadInvoices({ batchId })).filter((i) => i.remaining > 0 && i.due_date <= today);
  const byStudent = new Map<number, number>();
  for (const i of due) byStudent.set(i.student_id, (byStudent.get(i.student_id) ?? 0) + i.remaining);
  await Promise.all(
    [...byStudent].map(([studentId, remaining]) =>
      notifyStudent(studentId, {
        title: "Fee reminder",
        body: `Rs ${remaining.toLocaleString("en-PK")} is due. Open the Fees tab to see how to pay.`,
        url: "/portal",
      }).catch(() => {})
    )
  );
  return { sent: byStudent.size };
}

// ---------------------------------------------------------------------------
// Payment accounts + WhatsApp number (shown to every student in the Fees tab)
// ---------------------------------------------------------------------------
export async function getPaymentSettings(): Promise<{
  accounts: PaymentAccount[];
  whatsapp: string;
}> {
  await assertAdmin();
  const [accounts, whatsapp] = await Promise.all([
    loadPaymentAccounts(false),
    getSetting("tutor_whatsapp"),
  ]);
  return { accounts, whatsapp: whatsapp ?? "" };
}

export async function savePaymentAccount(
  id: number | null,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const method = text("method");
  const accountNumber = text("account_number");
  const iban = text("iban");
  const isActive = formData.get("is_active") === "on" || formData.get("is_active") === "true";
  const sortOrder = Number(formData.get("sort_order") || 0);
  if (!method) return { error: "Method is required (e.g. EasyPaisa, JazzCash, Bank)." };
  if (!accountNumber && !iban) return { error: "Add an account number or an IBAN." };

  if (id) {
    await sql`
      UPDATE payment_accounts
      SET method = ${method}, account_title = ${text("account_title")},
        account_number = ${accountNumber}, bank_name = ${text("bank_name")}, iban = ${iban},
        instructions = ${text("instructions")}, is_active = ${isActive},
        sort_order = ${Number.isNaN(sortOrder) ? 0 : sortOrder}
      WHERE id = ${id}
    `;
  } else {
    await sql`
      INSERT INTO payment_accounts (method, account_title, account_number, bank_name, iban,
        instructions, is_active, sort_order)
      VALUES (${method}, ${text("account_title")}, ${accountNumber}, ${text("bank_name")}, ${iban},
        ${text("instructions")}, ${isActive}, ${Number.isNaN(sortOrder) ? 0 : sortOrder})
    `;
  }
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function deletePaymentAccount(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM payment_accounts WHERE id = ${id}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

/** WhatsApp number for payment screenshots, stored as digits with country code. */
export async function saveTutorWhatsapp(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  let digits = String(formData.get("whatsapp") ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (digits.length < 10) return { error: "Enter a full WhatsApp number, e.g. 03001234567." };
  await sql`
    INSERT INTO app_settings (key, value) VALUES ('tutor_whatsapp', ${digits})
    ON CONFLICT (key) DO UPDATE SET value = ${digits}
  `;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}
