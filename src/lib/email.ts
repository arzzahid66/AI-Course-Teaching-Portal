import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { after } from "next/server";
import { sql } from "@/lib/db";

/**
 * Student emails over SMTP (Gmail). Mirrors pushNotifications.ts: the transport
 * is configured lazily on first send, and a missing/invalid config only logs a
 * warning — an email problem must never break the admin action that caused it.
 */

let transport: Transporter | null = null;
let warned = false;

function getTransport(): Transporter | null {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (process.env.EMAIL_ENABLED !== "true" || !host || !user || !pass) {
    if (!warned) console.warn("[email] EMAIL_ENABLED is off or SMTP env vars are missing — skipping emails.");
    warned = true;
    return null;
  }
  const port = Number(process.env.SMTP_PORT || 587);
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: process.env.SMTP_USE_TLS === "true" && port !== 465,
    auth: { user, pass },
    // Reuse a few connections for broadcasts instead of one login per email;
    // the pool queues the rest, which keeps Gmail from throttling us.
    pool: true,
    maxConnections: 3,
  });
  return transport;
}

export function emailEnabled(): boolean {
  return getTransport() != null;
}

/** Absolute link into the student portal, or null when APP_URL is not set. */
export function portalUrl(): string | null {
  const base = (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return /\/portal$/.test(base) ? base : `${base}/portal`;
}

export type EmailMessage = {
  subject: string;
  heading: string;
  /** Paragraphs of plain text. Escaped; line breaks are kept. Falsy entries are skipped. */
  lines: (string | null | undefined | false)[];
  /** Optional outbound link (e.g. a Meet link). The portal button is always added when APP_URL is set. */
  link?: { label: string; url: string };
  replyTo?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function button(label: string, url: string, primary: boolean): string {
  const style = primary
    ? "background:#4f46e5;color:#ffffff;"
    : "background:#ffffff;color:#4f46e5;border:1px solid #c7d2fe;";
  return `<a href="${escapeHtml(url)}" style="${style}display:inline-block;padding:10px 18px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;margin:4px 8px 4px 0">${escapeHtml(label)}</a>`;
}

function renderEmail(name: string | null, msg: EmailMessage): { html: string; text: string } {
  const lines = msg.lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
  const greeting = name ? `Hi ${name.split(/\s+/)[0]},` : "Hi,";
  const portal = portalUrl();

  const paragraphs = [greeting, ...lines]
    .map(
      (l) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155">${escapeHtml(l).replace(/\r?\n/g, "<br>")}</p>`
    )
    .join("");
  const buttons = [
    msg.link ? button(msg.link.label, msg.link.url, true) : "",
    portal ? button("Open the portal", portal, !msg.link) : "",
  ].join("");

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
<tr><td>
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6366f1;font-weight:700">AI Engineering Course</p>
<h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:#0f172a">${escapeHtml(msg.heading)}</h1>
${paragraphs}
${buttons ? `<div style="margin-top:8px">${buttons}</div>` : ""}
</td></tr></table>
<p style="font-size:12px;color:#94a3b8;margin:14px 0 0">You are receiving this because you are enrolled in the AI Engineering Course.</p>
</td></tr></table></body></html>`;

  const text = [
    greeting,
    ...lines,
    msg.link ? `${msg.link.label}: ${msg.link.url}` : "",
    portal ? `Open the portal: ${portal}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { html, text };
}

type Recipient = { id: number; name: string; email: string };

/** Send one email now. Never throws; returns the SMTP error message on failure. */
async function deliver(to: Recipient, msg: EmailMessage): Promise<{ error?: string }> {
  const t = getTransport();
  if (!t) return { error: "Email is turned off (EMAIL_ENABLED / SMTP settings)." };
  const { html, text } = renderEmail(to.name, msg);
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: `"${to.name.replace(/"/g, "")}" <${to.email}>`,
      // Student replies go to the sending mailbox unless EMAIL_REPLY_TO points elsewhere.
      replyTo: msg.replyTo || process.env.EMAIL_REPLY_TO || undefined,
      subject: msg.subject,
      html,
      text,
    });
    return {};
  } catch (e) {
    console.error(`[email] send to student ${to.id} failed:`, e);
    return { error: e instanceof Error ? e.message : "Could not send the email." };
  }
}

async function loadStudent(studentId: number): Promise<Recipient | null> {
  const rows = (await sql`
    SELECT id, name, email FROM students
    WHERE id = ${studentId} AND email IS NOT NULL AND btrim(email) <> ''
    LIMIT 1
  `) as Recipient[];
  return rows[0] ?? null;
}

/**
 * Who a broadcast reaches: active students with an email and an active
 * enrollment — in one intake (`batchId`), or in any upcoming/active intake of a
 * course level (`level: null` = every level).
 */
export type Audience = { batchId: number } | { level: number | null };

async function loadAudience(audience: Audience): Promise<Recipient[]> {
  if ("batchId" in audience) {
    return (await sql`
      SELECT DISTINCT s.id, s.name, s.email
      FROM enrollments e
      JOIN students s ON s.id = e.student_id
      WHERE e.batch_id = ${audience.batchId} AND e.status = 'active'
        AND s.status = 'active' AND s.email IS NOT NULL AND btrim(s.email) <> ''
    `) as Recipient[];
  }
  return (await sql`
    SELECT DISTINCT s.id, s.name, s.email
    FROM enrollments e
    JOIN batches b ON b.id = e.batch_id
    JOIN students s ON s.id = e.student_id
    WHERE e.status = 'active' AND b.status IN ('upcoming', 'active')
      AND (${audience.level}::int IS NULL OR b.level = ${audience.level}::int)
      AND s.status = 'active' AND s.email IS NOT NULL AND btrim(s.email) <> ''
  `) as Recipient[];
}

/** Email one student and wait for the result (used by the admin "Email" button). */
export async function sendStudentEmailNow(
  studentId: number,
  msg: EmailMessage
): Promise<{ error?: string; name?: string }> {
  if (!emailEnabled()) return { error: "Email is turned off (EMAIL_ENABLED / SMTP settings)." };
  const student = await loadStudent(studentId);
  if (!student) return { error: "This student has no email address." };
  const res = await deliver(student, msg);
  return res.error ? res : { name: student.name };
}

/** Email one student after the response is sent. Silent when they have no email. */
export function queueStudentEmail(studentId: number, msg: EmailMessage): void {
  if (!emailEnabled()) return;
  after(async () => {
    try {
      const student = await loadStudent(studentId);
      if (student) await deliver(student, msg);
    } catch (e) {
      console.error("[email] queued student email failed:", e);
    }
  });
}

/** Email every student in the audience (one message each) after the response is sent. */
export function queueBroadcastEmail(audience: Audience, msg: EmailMessage): void {
  if (!emailEnabled()) return;
  after(async () => {
    try {
      const recipients = await loadAudience(audience);
      await Promise.allSettled(recipients.map((r) => deliver(r, msg)));
      console.log(`[email] "${msg.subject}" sent to ${recipients.length} student(s).`);
    } catch (e) {
      console.error("[email] broadcast failed:", e);
    }
  });
}

/** "Sat, 20 Sep, 10:00 am" in the course's timezone. */
export function fmtClassTime(d: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(d));
}
