import "server-only";
import { after } from "next/server";
import { sql } from "@/lib/db";
import {
  getCurrentEnrollment,
  getSetting,
  loadInvoices,
  loadPaymentAccounts,
} from "@/lib/course";
import { emailEnabled, loginUrl, sendStudentEmailNow, type EmailMessage } from "@/lib/email";

/**
 * The welcome email: login details, what is already on the portal for the
 * student's level, and their fee status (free seat / payment verified / how to
 * pay before the account is locked). Built fresh at send time, so a resend
 * always reflects the current videos, quizzes and payments.
 */

const rs = (n: number) => `Rs ${Math.round(n).toLocaleString("en-PK")}`;

/** "2026-09-20" → "Sun, 20 Sep 2026" (date-only, no timezone shift). */
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

/** "14:00" → "2:00 pm". */
function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/** "923487356003" → "+92 348 7356003". */
function phone(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.startsWith("92") && d.length === 12 ? `+92 ${d.slice(2, 5)} ${d.slice(5)}` : `+${d}`;
}

export async function buildWelcomeEmail(studentId: number): Promise<{ msg: EmailMessage } | { error: string }> {
  const students = (await sql`
    SELECT name, email, password_plain FROM students WHERE id = ${studentId} LIMIT 1
  `) as { name: string; email: string | null; password_plain: string | null }[];
  const student = students[0];
  if (!student) return { error: "Student not found." };
  if (!student.email?.trim()) return { error: "This student has no login email." };
  if (!student.password_plain) return { error: "This student has no password set. Set their login in View / Edit first." };

  const [current, whatsappRaw] = await Promise.all([getCurrentEnrollment(studentId), getSetting("tutor_whatsapp")]);
  const whatsapp = whatsappRaw ? phone(whatsappRaw) : null;
  const portal = loginUrl();

  const lines: string[] = [];
  const sections: NonNullable<EmailMessage["sections"]> = [];

  const loginLines = [
    portal ? `Portal: ${portal}` : "",
    `Email: ${student.email}`,
    `Password: ${student.password_plain}`,
    "Keep these details private — please don't share your login.",
  ];

  if (!current) {
    lines.push("Your student account for the AI Engineering Course is ready. Your tutor will add you to an intake shortly.");
    sections.push({ title: "Your login", lines: loginLines });
  } else {
    const { batch, enrollmentId } = current;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());

    const [levelRows, videoRows, quizRows, invoices, receipts, accounts] = await Promise.all([
      sql`SELECT title FROM course_levels WHERE level = ${batch.level}` as unknown as Promise<{ title: string }[]>,
      sql`
        SELECT w.weekend_no, w.title AS weekend_title, v.title
        FROM weekend_videos v JOIN weekends w ON w.id = v.weekend_id
        WHERE w.level = ${batch.level} AND w.weekend_no <= ${batch.weekends}
        ORDER BY w.weekend_no, v.sort_order, v.id
      ` as unknown as Promise<{ weekend_no: number; weekend_title: string; title: string }[]>,
      sql`
        SELECT title FROM quizzes
        WHERE is_published = true AND (level IS NULL OR level = ${batch.level})
        ORDER BY sort_order, id
      ` as unknown as Promise<{ title: string }[]>,
      loadInvoices({ enrollmentId }),
      sql`
        SELECT p.receipt_no, SUM(p.amount) AS amount, MIN(p.method) AS method,
          array_agg(i.month_no ORDER BY i.month_no) AS months
        FROM payments p JOIN fee_invoices i ON i.id = p.invoice_id
        WHERE i.enrollment_id = ${enrollmentId}
        GROUP BY p.receipt_no
        ORDER BY MIN(p.paid_at)
      ` as unknown as Promise<{ receipt_no: string; amount: string; method: string; months: number[] }[]>,
      loadPaymentAccounts(true),
    ]);

    // --- Intro -------------------------------------------------------------
    const levelTitle = levelRows[0]?.title;
    lines.push(
      `Welcome to the AI Engineering Course! You're enrolled in ${batch.name}` +
        (levelTitle ? ` — Level ${batch.level}: ${levelTitle}.` : ".")
    );
    lines.push(
      batch.start_date >= today
        ? `Classes start on ${day(batch.start_date)} at ${clock(batch.class_time)} (Pakistan time). Your class schedule, videos, homework and quizzes are all on the student portal.`
        : `Classes are at ${clock(batch.class_time)} (Pakistan time). Your class schedule, videos, homework and quizzes are all on the student portal.`
    );

    sections.push({ title: "Your login", lines: loginLines });

    // --- What's already on the portal ---------------------------------------
    const portalLines: string[] = [];
    const byWeekend = new Map<number, { title: string; videos: string[] }>();
    for (const v of videoRows) {
      const w = byWeekend.get(v.weekend_no) ?? { title: v.weekend_title, videos: [] };
      w.videos.push(v.title);
      byWeekend.set(v.weekend_no, w);
    }
    if (byWeekend.size > 0) {
      portalLines.push(`🎬 ${videoRows.length} video${videoRows.length === 1 ? "" : "s"} uploaded so far:`);
      for (const [no, w] of byWeekend) {
        portalLines.push(`Weekend ${no} — ${w.title}\n${w.videos.map((t) => `• ${t}`).join("\n")}`);
      }
      portalLines.push("Each weekend's videos unlock one week before its class.");
    }
    if (quizRows.length > 0) {
      portalLines.push(`📝 Quizzes open now:\n${quizRows.map((q) => `• ${q.title}`).join("\n")}`);
    }
    if (portalLines.length === 0) {
      portalLines.push("Videos and quizzes are added as the course goes on — you'll get an email each time something new is posted.");
    } else {
      portalLines.push("You'll also get an email whenever a new video or quiz is posted.");
    }
    sections.push({ title: "Already on your portal", lines: portalLines });

    // --- Fees ---------------------------------------------------------------
    const net = invoices.reduce((s, i) => s + Math.max(0, i.amount - i.discount), 0);
    const paid = invoices.reduce((s, i) => s + i.paid, 0);
    const next = invoices.find((i) => i.remaining > 0) ?? null;
    const receiptLines = receipts.map(
      (r) =>
        `Receipt ${r.receipt_no}: ${rs(Number(r.amount))} by ${r.method} — Month${r.months.length > 1 ? "s" : ""} ${r.months.map(Number).join(", ")}`
    );

    if (invoices.length > 0 && net === 0) {
      sections.push({
        title: "🎁 Free seat",
        tone: "success",
        lines: ["Your seat in this course is free — there are no fees for you to pay."],
      });
    } else if (invoices.length > 0 && !next) {
      sections.push({
        title: "✅ Payment verified",
        tone: "success",
        lines: [`We've received your full course fee of ${rs(paid)}. Thank you!`, ...receiptLines, "All months are paid — nothing more to pay."],
      });
    } else if (next && paid > 0) {
      sections.push({
        title: "✅ Payment verified",
        tone: "success",
        lines: [
          `We've received ${rs(paid)}. Thank you!`,
          ...receiptLines,
          `Next payment: Month ${next.month_no} — ${rs(next.remaining)}, due ${day(next.due_date)}. Please pay by ${day(next.grace_until)} to keep your account active.`,
        ],
      });
    } else if (next) {
      const accountLines = accounts.map((a) =>
        [
          `${a.method}${a.bank_name ? ` (${a.bank_name})` : ""}`,
          a.account_title ? `Account name: ${a.account_title}` : "",
          a.account_number ? `Account number: ${a.account_number}` : "",
          a.iban ? `IBAN: ${a.iban}` : "",
          a.instructions ?? "",
        ]
          .filter(Boolean)
          .join("\n")
      );
      sections.push({
        title: "⏳ Fee payment pending",
        tone: "warning",
        lines: [
          `Month ${next.month_no} fee: ${rs(next.remaining)} (due ${day(next.due_date)}).`,
          `Please pay by ${day(next.grace_until)}. If it isn't paid by then, your portal account becomes inactive automatically until the payment is recorded.`,
          ...(accountLines.length ? ["Pay to:", ...accountLines] : ["Ask your tutor for the payment details."]),
          whatsapp
            ? `After paying, send the payment screenshot on WhatsApp to ${whatsapp}. Your tutor will confirm it and you'll get a receipt by email.`
            : "After paying, send the payment screenshot to your tutor. You'll get a receipt by email once it's confirmed.",
        ],
      });
    }
  }

  sections.push({
    title: "Need help?",
    lines: [
      whatsapp
        ? `Message your tutor on WhatsApp at ${whatsapp}, or use the Questions section on the portal.`
        : "Use the Questions section on the portal, or reply to this email.",
      "See you in class!",
    ],
  });

  return {
    msg: {
      subject: "Welcome to the AI Engineering Course — your login details",
      heading: "Welcome to the AI Engineering Course 🎓",
      lines,
      sections,
    },
  };
}

/** Build + send now and report the outcome (admin buttons). */
export async function sendWelcomeEmailNow(studentId: number): Promise<{ error?: string }> {
  if (!emailEnabled()) return { error: "Email is turned off (EMAIL_ENABLED / SMTP settings)." };
  const built = await buildWelcomeEmail(studentId);
  if ("error" in built) return { error: built.error };
  const res = await sendStudentEmailNow(studentId, built.msg);
  return res.error ? { error: res.error } : {};
}

/** Send after the response (adding a student). Failures are only logged. */
export function queueWelcomeEmail(studentId: number): void {
  if (!emailEnabled()) return;
  after(async () => {
    try {
      const res = await sendWelcomeEmailNow(studentId);
      if (res.error) console.error(`[email] welcome email for student ${studentId} not sent:`, res.error);
    } catch (e) {
      console.error("[email] welcome email failed:", e);
    }
  });
}
