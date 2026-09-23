import "server-only";
import { sql } from "@/lib/db";
import { loadInvoices } from "@/lib/course";
import { queueStudentEmail } from "@/lib/email";

const rs = (n: number) => `Rs ${n.toLocaleString("en-PK")}`;

/** "2026-10-27" -> "Tue, 27 Oct 2026". Date-only, so no timezone shift. */
function day(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Confirm a payment to the student: what was received, which months it covers,
 * and whether anything is still left. Sent from every place a payment is
 * recorded — the Fees tab, a new student added as paid, and the bulk import —
 * so "paid" always reaches the student the same way.
 *
 * What is still owed is stated exactly ONCE, in the closing section. An
 * earlier version repeated it three times - in the greeting, in the receipt
 * box and again at the end - which turned a thank-you into a chase. A receipt
 * is confirmation first; the reminder belongs at the bottom.
 *
 * The number of fee months is spelled out for the same reason: a student who
 * has just paid "the fee" needs to know the intake runs for more than one
 * month, or a second invoice looks like a mistake.
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

  const totalMonths = invoices.length;
  const monthsLabel =
    totalMonths > 0
      ? `Month${months.length > 1 ? "s" : ""} paid: ${months.join(", ")} of ${totalMonths}`
      : `Month${months.length > 1 ? "s" : ""} paid: ${months.join(", ")}`;

  queueStudentEmail(row.student_id, {
    subject: `Payment confirmed — receipt ${receiptNo}`,
    heading: "Payment verified ✅",
    lines: [
      `We have checked and confirmed your payment of ${rs(amount)} by ${row.method}. Thank you!`,
      remaining === 0
        ? "Your fees are fully cleared. Your account stays active for the whole course."
        : "Your account is active.",
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
          monthsLabel,
        ],
        tone: "success",
      },
      // The one and only mention of what is still owed.
      ...(nextDue
        ? [
            {
              title: "Still to pay",
              lines: [
                totalMonths > 1
                  ? `This course runs for ${totalMonths} months, so the fee is charged ${totalMonths} times.`
                  : "",
                `Month ${nextDue.month_no}: ${rs(nextDue.remaining)}`,
                `Due: ${day(nextDue.due_date)}`,
                `Please pay by ${day(nextDue.grace_until)} to keep your account active.`,
                remaining > nextDue.remaining
                  ? `Left after that: ${rs(remaining - nextDue.remaining)}.`
                  : "",
              ].filter(Boolean),
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
