"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireStudentId } from "@/lib/auth";
import {
  CONTENT_KINDS,
  normalizeUrl,
  parseResourceLinks,
  type ContentKind,
  type ResourceLink,
} from "@/lib/constants";
import {
  computeBatchProgress,
  getCurrentEnrollment,
  getSetting,
  iso,
  isoOrNull,
  loadInvoices,
  loadPaymentAccounts,
  type InvoiceView,
  type PaymentAccount,
  type ProgressRow,
} from "@/lib/course";
import { loadCurriculum } from "@/lib/curriculum";
import { notifyAdmin } from "@/lib/pushNotifications";
import { getStudentQuizzes, type StudentQuiz } from "@/actions/quiz";

// ---------------------------------------------------------------------------
// Types returned to the client
// ---------------------------------------------------------------------------
export type MyQuestion = {
  id: number;
  subject: string | null;
  body: string;
  status: "open" | "resolved";
  answer: string | null;
  created_at: string;
  answered_at: string | null;
};

export type PortalVideo = {
  id: number;
  title: string;
  /** Empty until the weekend opens. */
  url: string;
  kind: ContentKind;
  watched: boolean;
};

export type MyHomework = {
  id: number;
  link_url: string;
  note: string | null;
  status: "submitted" | "needs_changes" | "approved";
  marks: number | null;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

export type PortalWeekend = {
  id: number;
  weekend_no: number;
  title: string;
  ng_skill: string | null;
  tag: string | null;
  topics: string[];
  you_build: string | null;
  homework: string | null;
  slides: ResourceLink[];
  /** This intake's class for the weekend (null if none scheduled). */
  class_at: string | null;
  /**
   * True once the weekend has begun (from 7 days before its class). Videos,
   * slides and homework are always readable — this only drives "this week"
   * labels and the homework reminder badge.
   */
  is_open: boolean;
  is_current: boolean;
  homework_due_at: string | null;
  videos: PortalVideo[];
  submission: MyHomework | null;
};

export type PaymentView = {
  receipt_no: string;
  months: number[];
  amount: number;
  method: string;
  reference: string | null;
  paid_at: string;
};

export type PortalData = {
  name: string;
  email: string | null;
  enrollment: {
    batchName: string;
    level: 1 | 2;
    levelTitle: string;
    promise: string | null;
    outcomes: string[];
    startDate: string;
    graceDays: number;
  } | null;
  weekends: PortalWeekend[];
  fees: {
    invoices: InvoiceView[];
    payments: PaymentView[];
    accounts: PaymentAccount[];
    whatsapp: string;
    total: number;
    paid: number;
    remaining: number;
  };
  progress: { mine: ProgressRow | null; classAverage: number | null };
  questions: MyQuestion[];
  quizzes: StudentQuiz[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Portal data for the logged-in student
// ---------------------------------------------------------------------------
export async function getPortalData(): Promise<PortalData> {
  const studentId = await requireStudentId();

  const students = (await sql`
    SELECT name, email FROM students WHERE id = ${studentId} LIMIT 1
  `) as { name: string; email: string | null }[];
  const name = students[0]?.name ?? "Student";
  const email = students[0]?.email ?? null;

  const current = await getCurrentEnrollment(studentId);
  const batch = current?.batch ?? null;

  const [questionsRaw, accounts, whatsapp, quizzes] = await Promise.all([
    sql`
      SELECT id, subject, body, status, answer, created_at, answered_at
      FROM questions WHERE student_id = ${studentId}
      ORDER BY created_at DESC LIMIT 50
    ` as unknown as Promise<(Omit<MyQuestion, "created_at" | "answered_at"> & { created_at: Date; answered_at: Date | null })[]>,
    loadPaymentAccounts(true),
    getSetting("tutor_whatsapp"),
    getStudentQuizzes().catch((e) => {
      console.error("[portal] quizzes load failed:", e);
      return [] as StudentQuiz[];
    }),
  ]);

  const questions = questionsRaw.map((q) => ({
    ...q,
    created_at: iso(q.created_at),
    answered_at: isoOrNull(q.answered_at),
  }));

  const emptyFees = { invoices: [], payments: [], accounts, whatsapp: whatsapp ?? "", total: 0, paid: 0, remaining: 0 };

  if (!current || !batch) {
    return {
      name,
      email,
      enrollment: null,
      weekends: [],
      fees: emptyFees,
      progress: { mine: null, classAverage: null },
      questions,
      quizzes,
    };
  }

  const [curriculum, sessionsRaw, watchedRaw, homeworkRaw, invoices, paymentsRaw, progressRows] =
    await Promise.all([
      loadCurriculum(),
      sql`
        SELECT weekend_id, MIN(scheduled_at) AS scheduled_at
        FROM sessions WHERE batch_id = ${batch.id} AND weekend_id IS NOT NULL
        GROUP BY weekend_id
      ` as unknown as Promise<{ weekend_id: number; scheduled_at: Date }[]>,
      sql`SELECT video_id FROM video_progress WHERE student_id = ${studentId}` as unknown as Promise<{ video_id: number }[]>,
      sql`
        SELECT id, weekend_id, link_url, note, status, marks, feedback, submitted_at, reviewed_at
        FROM homework_submissions WHERE enrollment_id = ${current.enrollmentId}
      ` as unknown as Promise<(Omit<MyHomework, "submitted_at" | "reviewed_at"> & {
        weekend_id: number;
        submitted_at: Date;
        reviewed_at: Date | null;
      })[]>,
      loadInvoices({ enrollmentId: current.enrollmentId }),
      sql`
        SELECT p.receipt_no, array_agg(i.month_no ORDER BY i.month_no) AS months,
          SUM(p.amount) AS amount, MIN(p.method) AS method, MIN(p.reference) AS reference,
          MIN(p.paid_at) AS paid_at
        FROM payments p JOIN fee_invoices i ON i.id = p.invoice_id
        WHERE i.enrollment_id = ${current.enrollmentId}
        GROUP BY p.receipt_no
        ORDER BY MIN(p.paid_at) DESC
      ` as unknown as Promise<{ receipt_no: string; months: number[]; amount: string; method: string; reference: string | null; paid_at: Date }[]>,
      computeBatchProgress(batch.id),
    ]);

  const level = curriculum.levels.find((l) => l.level === batch.level);
  const classAt = new Map(sessionsRaw.map((s) => [s.weekend_id, (s.scheduled_at as Date).getTime()]));
  const watched = new Set(watchedRaw.map((w) => w.video_id));
  const now = Date.now();

  const levelWeekends = curriculum.weekends.filter(
    (w) => w.level === batch.level && w.weekend_no <= batch.weekends
  );
  // The current weekend is the first one whose class hasn't finished (class + 12h).
  const currentId =
    levelWeekends.find((w) => {
      const t = classAt.get(w.id);
      return t != null && t + DAY_MS / 2 > now;
    })?.id ?? null;

  const weekends: PortalWeekend[] = levelWeekends.map((w) => {
    const t = classAt.get(w.id) ?? null;
    const isOpen = t != null && now >= t - 7 * DAY_MS;
    const sub = homeworkRaw.find((h) => h.weekend_id === w.id);
    return {
      id: w.id,
      weekend_no: w.weekend_no,
      title: w.title,
      ng_skill: w.ng_skill,
      tag: w.tag,
      topics: (w.topics ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      you_build: w.you_build,
      homework: w.homework,
      slides: parseResourceLinks(w.slides),
      class_at: t != null ? new Date(t).toISOString() : null,
      is_open: isOpen,
      is_current: w.id === currentId,
      homework_due_at: t != null ? new Date(t + 7 * DAY_MS).toISOString() : null,
      videos: w.videos.map((v) => ({
        id: v.id,
        title: v.title,
        url: v.url,
        kind: v.kind,
        watched: watched.has(v.id),
      })),
      submission: sub
        ? {
            id: sub.id,
            link_url: sub.link_url,
            note: sub.note,
            status: sub.status,
            marks: sub.marks,
            feedback: sub.feedback,
            submitted_at: iso(sub.submitted_at),
            reviewed_at: isoOrNull(sub.reviewed_at),
          }
        : null,
    };
  });

  const mine = progressRows.find((p) => p.enrollment_id === current.enrollmentId) ?? null;
  const scored = progressRows.filter((p) => p.score != null) as (ProgressRow & { score: number })[];

  return {
    name,
    email,
    enrollment: {
      batchName: batch.name,
      level: batch.level,
      levelTitle: level?.title ?? `Batch ${batch.level}`,
      promise: level?.promise ?? null,
      outcomes: (level?.outcomes ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      startDate: batch.start_date,
      graceDays: batch.grace_days,
    },
    weekends,
    fees: {
      invoices,
      payments: paymentsRaw.map((p) => ({
        ...p,
        months: p.months.map(Number),
        amount: Number(p.amount),
        paid_at: iso(p.paid_at),
      })),
      accounts,
      whatsapp: whatsapp ?? "",
      total: invoices.reduce((s, i) => s + Math.max(0, i.amount - i.discount), 0),
      paid: invoices.reduce((s, i) => s + i.paid, 0),
      remaining: invoices.reduce((s, i) => s + i.remaining, 0),
    },
    progress: {
      mine,
      classAverage: scored.length
        ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length)
        : null,
    },
    questions,
    quizzes,
  };
}

// ---------------------------------------------------------------------------
// Videos + homework
// ---------------------------------------------------------------------------
/** Resolve a weekend of the student's current level that is already open. */
async function getOpenWeekendForStudent(
  studentId: number,
  weekendId: number
): Promise<{ enrollmentId: number } | { error: string }> {
  const current = await getCurrentEnrollment(studentId);
  if (!current) return { error: "You are not enrolled in an active batch." };
  const rows = (await sql`
    SELECT MIN(s.scheduled_at) AS class_at
    FROM weekends w
    JOIN sessions s ON s.weekend_id = w.id AND s.batch_id = ${current.batch.id}
    WHERE w.id = ${weekendId} AND w.level = ${current.batch.level}
  `) as { class_at: Date | null }[];
  const classAt = rows[0]?.class_at;
  if (!classAt) return { error: "That weekend is not part of your batch." };
  if (Date.now() < classAt.getTime() - 7 * DAY_MS) return { error: "That weekend has not opened yet." };
  return { enrollmentId: current.enrollmentId };
}

export async function setVideoWatched(videoId: number, watched: boolean): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  const video = (await sql`SELECT weekend_id, kind FROM weekend_videos WHERE id = ${videoId}`) as {
    weekend_id: number;
    kind: ContentKind;
  }[];
  if (!video[0]) return { error: "Video not found." };
  if (!CONTENT_KINDS[video[0].kind]?.isVideo) return { error: "Only videos can be marked watched." };
  const check = await getOpenWeekendForStudent(studentId, video[0].weekend_id);
  if ("error" in check) return { error: check.error };

  if (watched) {
    await sql`
      INSERT INTO video_progress (student_id, video_id) VALUES (${studentId}, ${videoId})
      ON CONFLICT DO NOTHING
    `;
  } else {
    await sql`DELETE FROM video_progress WHERE student_id = ${studentId} AND video_id = ${videoId}`;
  }
  revalidatePath("/portal");
  return {};
}

export async function submitHomework(weekendId: number, formData: FormData): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  const link = normalizeUrl(String(formData.get("link_url") ?? ""));
  const note = String(formData.get("note") ?? "").trim();
  if (!link) return { error: "Paste the link to your work (GitHub, live site, Google Drive…)." };
  if (note.length > 1000) return { error: "Note is too long (max 1000 characters)." };

  const check = await getOpenWeekendForStudent(studentId, weekendId);
  if ("error" in check) return { error: check.error };

  const existing = (await sql`
    SELECT status FROM homework_submissions
    WHERE enrollment_id = ${check.enrollmentId} AND weekend_id = ${weekendId}
  `) as { status: string }[];
  if (existing[0]?.status === "approved") {
    return { error: "This homework is already approved. Ask your tutor if you want to change it." };
  }

  await sql`
    INSERT INTO homework_submissions (enrollment_id, weekend_id, link_url, note)
    VALUES (${check.enrollmentId}, ${weekendId}, ${link}, ${note || null})
    ON CONFLICT (enrollment_id, weekend_id) DO UPDATE
    SET link_url = ${link}, note = ${note || null}, status = 'submitted', marks = NULL,
      submitted_at = now(), reviewed_at = NULL
  `;
  notifyAdmin({ title: "Homework submitted", body: link.slice(0, 100), url: "/admin" }).catch(() => {});
  revalidatePath("/portal");
  return {};
}

// ---------------------------------------------------------------------------
// Ask a question (student → tutor)
// ---------------------------------------------------------------------------
export async function submitQuestion(formData: FormData): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Please type your question." };
  if (body.length > 2000) return { error: "Question is too long (max 2000 characters)." };

  try {
    await sql`
      INSERT INTO questions (student_id, subject, body)
      VALUES (${studentId}, ${subject || null}, ${body})
    `;
  } catch {
    return { error: "Could not send your question. Please try again." };
  }
  notifyAdmin({
    title: "New Question",
    body: subject ? `${subject}: ${body.slice(0, 80)}` : body.slice(0, 100),
    url: "/admin",
  }).catch(() => {});
  return {};
}
