import "server-only";
import { sql } from "@/lib/db";
import { loadInvoices } from "@/lib/course";
import { queueStudentEmail } from "@/lib/email";

const rs = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

/**
 * Confirm a payment to the student: what was received, which months it covers,
 * and whether anything is still left. Sent from every place a payment is
 * recorded — the Fees tab, a new student added as paid, and the bulk import —
 * so "paid" always reaches the student the same way.
 */
export async function queuePaymentReceiptEmail(receiptNo: string): Promise<void> {
  const rows = (await sql`
    SELECT p.student_id, i.enrollment_id,
      array_agg(i.month_no ORDER BY i.month_no) AS months,
      SUM(p.amount) AS amount,
      MIN(p.method) AS method,
      MIN(p.reference) AS reference
    FROM payments p JOIN fee_invoices i ON i.id = p.invoice_id
    WHERE p.receipt_no = ${receiptNo}
    GROUP BY p.student_id, i.enrollment_id
  `) as {
    student_id: number;
    enrollment_id: number;
    months: (number | string)[];
    amount: string;
    method: string;
    reference: string | null;
  }[];
  const row = rows[0];
  if (!row) return;

  const months = row.months.map(Number);
  const amount = Number(row.amount);
  const invoices = await loadInvoices({ enrollmentId: row.enrollment_id });
  const remaining = invoices.reduce((s, i) => s + i.remaining, 0);
  const nextDue = invoices.find((i) => i.remaining > 0) ?? null;

  queueStudentEmail(row.student_id, {
    subject: `Payment confirmed — receipt ${receiptNo}`,
    heading: "Payment verified ✅",
    lines: [
      `We have checked and confirmed your payment of ${rs(amount)} by ${row.method}. Thank you!`,
      remaining === 0
        ? "Your fees are fully cleared. Your account stays active for the whole course."
        : `Your account is active. ${rs(remaining)} is still left to pay.`,
      "You can see every receipt any time in the Fees section of the portal.",
    ],
    sections: [
      {
        title: "Receipt",
        lines: [
          `Receipt no: ${receiptNo}`,
          `Amount: ${rs(amount)}`,
          `Method: ${row.method}`,
          ...(row.reference ? [`Transaction ID: ${row.reference}`] : []),
          `Month${months.length > 1 ? "s" : ""} paid: ${months.join(", ")}`,
          `Status: ${remaining === 0 ? "Fully paid" : `${rs(remaining)} remaining`}`,
        ],
        tone: "success",
      },
      ...(nextDue
        ? [
            {
              title: "Next payment",
              lines: [
                `Month ${nextDue.month_no}: ${rs(nextDue.remaining)}`,
                `Due: ${nextDue.due_date}`,
                `Please pay by ${nextDue.grace_until} to keep your account active.`,
              ],
              tone: "neutral" as const,
            },
          ]
        : []),
    ],
  });
}

/**
 * A month cleared without money changing hands — a discount or a waiver. The
 * student sees "Paid" in the portal, so tell them why.
 */
export async function queueFeeWaivedEmail(
  studentId: number,
  monthNo: number,
  discount: number
): Promise<void> {
  queueStudentEmail(studentId, {
    subject: `Month ${monthNo} fee cleared`,
    heading: "Your fee has been cleared ✅",
    lines: [
      `Your tutor has cleared Month ${monthNo} of your fee with a discount of ${rs(discount)}.`,
      "Nothing is left to pay for this month and your account stays active.",
      "You can check this any time in the Fees section of the portal.",
    ],
  });
}
