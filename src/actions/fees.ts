"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin } from "@/lib/auth";
import {
  getSetting,
  setSetting,
  insertPayment,
  iso,
  rebalancePayments,
  loadInvoices,
  loadPaymentAccounts,
  type InvoiceView,
  type PaymentAccount,
} from "@/lib/course";
import { notifyStudent } from "@/lib/pushNotifications";
import { queueStudentEmail } from "@/lib/email";
import { queueFeeWaivedEmail, queuePaymentReceiptEmail } from "@/lib/receiptEmail";
import { PRIVACY_MODE_KEY } from "@/lib/constants";

const rsText = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

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

/** One payment row: the part of a receipt that paid a single month. */
export type FeePaymentRow = {
  id: number;
  invoice_id: number;
  enrollment_id: number;
  month_no: number;
  receipt_no: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  paid_at: string;
};

export type FeeBoard = { rows: FeeBoardRow[]; payments: FeePayment[]; paymentRows: FeePaymentRow[] };

/** Student × month grid plus the payment history (one line per receipt) for an intake. */
export async function getFeeBoard(batchId: number): Promise<FeeBoard> {
  await assertAdmin();
  const [invoices, enrollments, paymentRows, singleRows] = await Promise.all([
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
    sql`
      SELECT p.id, p.invoice_id, i.enrollment_id, i.month_no, p.receipt_no, p.amount,
        p.method, p.reference, p.note, p.paid_at
      FROM payments p
      JOIN fee_invoices i ON i.id = p.invoice_id
      JOIN enrollments e ON e.id = i.enrollment_id
      WHERE e.batch_id = ${batchId}
      ORDER BY p.paid_at DESC, p.id DESC
    ` as unknown as Promise<(Omit<FeePaymentRow, "amount" | "paid_at"> & { amount: string; paid_at: Date })[]>,
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
  return {
    rows,
    payments,
    paymentRows: singleRows.map((p) => ({ ...p, amount: Number(p.amount), paid_at: iso(p.paid_at) })),
  };
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
  if (res.receiptNo) await queuePaymentReceiptEmail(res.receiptNo);
  revalidatePath("/admin");
  revalidatePath("/portal");
  return res;
}

/** Undo one month of a payment (one row of a receipt); the rest of the receipt stays. */
export async function deletePaymentRow(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM payments WHERE id = ${id}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

/** Remove a whole receipt (all month rows it paid). */
export async function deletePayment(receiptNo: string): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM payments WHERE receipt_no = ${receiptNo}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

/**
 * Edit one line of a receipt: which month it pays and how much. Method,
 * transaction ID, date and note are shared by the whole receipt, so they
 * change on every line of it.
 */
export async function updatePaymentRow(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const monthNo = Number(formData.get("month_no"));
  const amount = Math.round(Number(formData.get("amount")));
  const method = String(formData.get("method") ?? "").trim() || "EasyPaisa";
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;
  const paidOn = String(formData.get("paid_on") ?? "").trim();
  if (!amount || Number.isNaN(amount) || amount <= 0) return { error: "Enter an amount above 0." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Pick the date it was paid." };

  const found = (await sql`
    SELECT p.id, p.receipt_no, p.amount, p.invoice_id, i.enrollment_id
    FROM payments p JOIN fee_invoices i ON i.id = p.invoice_id WHERE p.id = ${id}
  `) as { id: number; receipt_no: string; amount: number; invoice_id: number; enrollment_id: number }[];
  const row = found[0];
  if (!row) return { error: "That payment no longer exists." };

  const invoices = await loadInvoices({ enrollmentId: row.enrollment_id });
  const target = invoices.find((i) => i.month_no === monthNo);
  if (!target) return { error: "Pick which month this pays." };
  // Room on the target month, not counting this line itself.
  const room = target.remaining + (target.id === row.invoice_id ? row.amount : 0);
  if (amount > room) {
    return {
      error:
        room <= 0
          ? `Month ${monthNo} is already fully paid. Pick another month.`
          : `Month ${monthNo} only has ${rsText(room)} left to pay. Enter ${rsText(room)} or less.`,
    };
  }

  // If the same receipt already has a line on the target month, merge into it.
  const twin = (await sql`
    SELECT id FROM payments WHERE receipt_no = ${row.receipt_no} AND invoice_id = ${target.id} AND id <> ${id}
  `) as { id: number }[];
  if (twin[0]) {
    await sql`
      WITH del AS (DELETE FROM payments WHERE id = ${id})
      UPDATE payments SET amount = amount + ${amount} WHERE id = ${twin[0].id}
    `;
  } else {
    await sql`UPDATE payments SET invoice_id = ${target.id}, amount = ${amount} WHERE id = ${id}`;
  }
  await sql`
    UPDATE payments
    SET method = ${method}, reference = ${reference}, note = ${note},
        paid_at = CASE
          WHEN (paid_at AT TIME ZONE 'Asia/Karachi')::date = ${paidOn}::date THEN paid_at
          ELSE (${paidOn}::date + time '12:00') AT TIME ZONE 'Asia/Karachi'
        END
    WHERE receipt_no = ${row.receipt_no}
  `;
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
  const before = (await sql`
    SELECT i.enrollment_id, i.month_no, i.amount, i.discount, e.student_id,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid
    FROM fee_invoices i JOIN enrollments e ON e.id = i.enrollment_id
    WHERE i.id = ${id}
  `) as { enrollment_id: number; month_no: number; amount: number; discount: number; student_id: number; paid: string }[];
  const row = before[0];
  if (!row) return { error: "Fee month not found." };
  const paidSoFar = Number(row.paid);
  if (paidSoFar > amount - discount) {
    // The extra will move to the next unpaid months — only refuse if there is nowhere for it to go.
    const all = await loadInvoices({ enrollmentId: row.enrollment_id });
    const otherRoom = all.filter((i) => i.id !== id).reduce((s, i) => s + i.remaining, 0);
    if (paidSoFar - (amount - discount) > otherRoom) {
      return { error: "More than that has been paid and no other month has room for the extra. Undo a payment first." };
    }
  }
  await sql`
    UPDATE fee_invoices
    SET due_date = ${dueDate}, amount = ${amount}, discount = ${discount}, note = ${note || null}
    WHERE id = ${id}
  `;
  await rebalancePayments(row.enrollment_id);
  // A discount or waiver can clear a month with no money changing hands — the
  // student just sees "Paid", so tell them why.
  const clearedBefore = paidSoFar >= row.amount - row.discount;
  const clearedNow = paidSoFar >= amount - discount;
  if (clearedNow && !clearedBefore && discount > 0) {
    await queueFeeWaivedEmail(row.student_id, row.month_no, discount);
  }
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

// ---------------------------------------------------------------------------
// Fee plan — set every month of an enrollment at once
// ---------------------------------------------------------------------------
export type FeePlan = "full" | "partial" | "free";

/** Notes this action writes, so switching plan can replace them without touching a tutor's own note. */
const FREE_NOTE = "Free seat";
const PARTIAL_NOTE_PREFIX = "Reduced fee:";

/**
 * Put a student on a fee plan for one intake. Each month's discount (and a
 * plan note) changes. Receipts are kept; if a month now holds more paid than it
 * charges, the extra moves to the next unpaid month (see rebalancePayments):
 *   full    — discount 0, the normal monthly fee
 *   partial — the student pays `monthly` Rs a month (capped at the month's fee)
 *   free    — every month waived (never locks the account)
 * Refused only if more has been paid than the whole new plan charges.
 */
export async function setFeePlan(enrollmentId: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const plan = String(formData.get("plan") ?? "") as FeePlan;
  if (plan !== "full" && plan !== "partial" && plan !== "free") return { error: "Pick a fee plan." };
  const monthly = Math.round(Number(formData.get("monthly") || 0));
  if (plan === "partial" && (Number.isNaN(monthly) || monthly <= 0)) {
    return { error: "Enter how much the student pays per month (above Rs 0)." };
  }

  const invoices = await loadInvoices({ enrollmentId });
  if (invoices.length === 0) return { error: "This enrollment has no fee months." };
  // What each month will charge under the new plan.
  const netFor = (amount: number) => (plan === "free" ? 0 : plan === "partial" ? Math.min(monthly, amount) : amount);

  const paidAll = invoices.reduce((s, i) => s + i.paid, 0);
  const newTotal = invoices.reduce((s, i) => s + netFor(i.amount), 0);
  if (paidAll > newTotal) {
    return {
      error: `${rsText(paidAll)} has already been paid — more than the whole new plan (${rsText(newTotal)}). Undo a receipt first, or pick a higher amount.`,
    };
  }

  const planNote = plan === "free" ? FREE_NOTE : plan === "partial" ? `${PARTIAL_NOTE_PREFIX} ${rsText(monthly)}/month` : null;
  await sql`
    UPDATE fee_invoices
    SET discount = CASE
          WHEN ${plan} = 'free' THEN amount
          WHEN ${plan} = 'partial' THEN GREATEST(0, amount - ${monthly}::int)
          ELSE 0
        END,
        -- Keep a note the tutor wrote by hand; only replace notes a plan wrote.
        note = CASE
          WHEN note IS NULL OR note = ${FREE_NOTE} OR note LIKE ${PARTIAL_NOTE_PREFIX + "%"} THEN ${planNote}
          ELSE note
        END
    WHERE enrollment_id = ${enrollmentId}
  `;
  await rebalancePayments(enrollmentId);

  if (formData.get("notify_email") === "on") {
    const total = invoices.reduce((s, i) => s + netFor(i.amount), 0);
    const paid = invoices.reduce((s, i) => s + i.paid, 0);
    queueStudentEmail(invoices[0].student_id, {
      subject: plan === "free" ? "Your course is now free" : "Your fee plan has been updated",
      heading: plan === "free" ? "You're on a free seat" : "Your fee plan was updated",
      lines: [
        plan === "free"
          ? "Your tutor has made your course free. There is nothing to pay."
          : plan === "partial"
            ? `Your fee is now ${rsText(monthly)} per month.`
            : "You're on the standard monthly fee.",
        plan === "free" ? null : `Total course fee: ${rsText(total)} · paid so far: ${rsText(paid)} · left: ${rsText(Math.max(0, total - paid))}.`,
        "You can see every month in the Fees section of the portal.",
      ],
    });
  }
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
  for (const [studentId, remaining] of byStudent) {
    const months = due.filter((i) => i.student_id === studentId);
    queueStudentEmail(studentId, {
      subject: `Fee reminder: ${rsText(remaining)} due`,
      heading: "Friendly fee reminder",
      lines: [
        `${rsText(remaining)} is due for your course fee.`,
        months.map((i) => `Month ${i.month_no}: ${rsText(i.remaining)} (due ${i.due_date})`).join("\n"),
        "Unpaid fees past the grace period lock your portal account. Open the Fees section of the portal to see how to pay.",
      ],
    });
  }
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

// ---------------------------------------------------------------------------
// Privacy Mode (admin-side only)
// ---------------------------------------------------------------------------

/**
 * True when the tutor has hidden every rupee amount on the admin dashboard.
 * Read on the admin page load only — the student portal never consults this.
 */
export async function getPrivacyMode(): Promise<boolean> {
  return (await getSetting(PRIVACY_MODE_KEY)) === "on";
}

/**
 * Flip Privacy Mode. The admin UI flips its own state optimistically and calls
 * this in the background, so masking is instant even before the write lands.
 */
export async function setPrivacyMode(on: boolean): Promise<{ error?: string }> {
  await assertAdmin();
  await setSetting(PRIVACY_MODE_KEY, on ? "on" : "off");
  revalidatePath("/admin");
  return {};
}
