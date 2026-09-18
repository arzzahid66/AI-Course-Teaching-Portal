"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireStudentId } from "@/lib/auth";
import {
  CHECKIN_WINDOW_MIN,
  normalizeMeetLink,
  normalizeUrl,
  parseResourceLinks,
  type ResourceLink,
} from "@/lib/constants";
import {
  computeBatchProgress,
  getBlockingInvoice,
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
// Types returned to the client. The session code and Meet link are NEVER
// included until a successful check-in.
// ---------------------------------------------------------------------------
export type CheckInState =
  | { kind: "no-enrollment" }
  | { kind: "blocked"; monthNo: number; remaining: number; dueDate: string }
  | { kind: "no-session" }
  | { kind: "present"; sessionTitle: string; meetLink: string }
  | { kind: "can-checkin"; sessionTitle: string };

export type AttendanceEntry = { title: string; scheduled_at: string; status: string };

export type NextClass = { title: string; scheduled_at: string };

export type MyQuestion = {
  id: number;
  subject: string | null;
  body: string;
  status: "open" | "resolved";
  answer: string | null;
  created_at: string;
  answered_at: string | null;
};

export type LeaveRequest = {
  id: number;
  lesson_title: string | null;
  lesson_at: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type PortalVideo = {
  id: number;
  title: string;
  /** Empty until the weekend opens. */
  url: string;
  kind: "topic" | "hands_on" | "extra";
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
  checkin: CheckInState;
  nextClass: NextClass | null;
  attendance: AttendanceEntry[];
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
  leaves: LeaveRequest[];
  quizzes: StudentQuiz[];
};

export type CheckInResult = { ok: true; meetLink: string } | { ok: false; error: string };

type OpenSession = { id: number; title: string; meet_link: string; code: string; created_at: Date };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getNextClass(batchId: number): Promise<{ id: number; title: string; scheduled_at: string } | null> {
  const rows = (await sql`
    SELECT id, title, scheduled_at
    FROM sessions
    WHERE batch_id = ${batchId} AND is_open = false AND closed_at IS NULL
      AND scheduled_at > now() - interval '12 hours'
    ORDER BY scheduled_at ASC
    LIMIT 1
  `) as { id: number; title: string; scheduled_at: Date }[];
  return rows[0] ? { ...rows[0], scheduled_at: iso(rows[0].scheduled_at) } : null;
}

async function getOpenSession(batchId: number): Promise<OpenSession | null> {
  const rows = (await sql`
    SELECT id, title, meet_link, code, created_at
    FROM sessions
    WHERE is_open = true AND batch_id = ${batchId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as OpenSession[];
  return rows[0] ?? null;
}

async function getCheckInState(studentId: number, batchId: number | null): Promise<CheckInState> {
  if (!batchId) return { kind: "no-enrollment" };
  const blocking = await getBlockingInvoice(studentId);
  if (blocking) {
    return {
      kind: "blocked",
      monthNo: blocking.month_no,
      remaining: blocking.remaining,
      dueDate: blocking.due_date,
    };
  }
  const session = await getOpenSession(batchId);
  if (!session) return { kind: "no-session" };
  const present = (await sql`
    SELECT 1 FROM attendance
    WHERE student_id = ${studentId} AND session_id = ${session.id} AND status = 'present'
    LIMIT 1
  `) as unknown[];
  if (present.length > 0) {
    return { kind: "present", sessionTitle: session.title, meetLink: normalizeMeetLink(session.meet_link) };
  }
  return { kind: "can-checkin", sessionTitle: session.title };
}

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

  const [checkin, questionsRaw, leavesRaw, accounts, whatsapp, quizzes] = await Promise.all([
    getCheckInState(studentId, batch?.id ?? null),
    sql`
      SELECT id, subject, body, status, answer, created_at, answered_at
      FROM questions WHERE student_id = ${studentId}
      ORDER BY created_at DESC LIMIT 50
    ` as unknown as Promise<(Omit<MyQuestion, "created_at" | "answered_at"> & { created_at: Date; answered_at: Date | null })[]>,
    sql`
      SELECT id, lesson_title, lesson_at, reason, status, feedback, created_at, reviewed_at
      FROM leave_requests WHERE student_id = ${studentId}
      ORDER BY created_at DESC LIMIT 50
    ` as unknown as Promise<(Omit<LeaveRequest, "lesson_at" | "created_at" | "reviewed_at"> & {
      lesson_at: Date | null;
      created_at: Date;
      reviewed_at: Date | null;
    })[]>,
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
  const leaves = leavesRaw.map((l) => ({
    ...l,
    lesson_at: isoOrNull(l.lesson_at),
    created_at: iso(l.created_at),
    reviewed_at: isoOrNull(l.reviewed_at),
  }));

  const emptyFees = { invoices: [], payments: [], accounts, whatsapp: whatsapp ?? "", total: 0, paid: 0, remaining: 0 };

  if (!current || !batch) {
    return {
      name,
      email,
      enrollment: null,
      checkin,
      nextClass: null,
      attendance: [],
      weekends: [],
      fees: emptyFees,
      progress: { mine: null, classAverage: null },
      questions,
      leaves,
      quizzes,
    };
  }

  const [nextClass, attendanceRaw, curriculum, sessionsRaw, watchedRaw, homeworkRaw, invoices, paymentsRaw, progressRows] =
    await Promise.all([
      getNextClass(batch.id),
      sql`
        SELECT s.title, s.scheduled_at, a.status
        FROM attendance a JOIN sessions s ON s.id = a.session_id
        WHERE a.student_id = ${studentId} AND s.batch_id = ${batch.id}
        ORDER BY s.scheduled_at DESC
      ` as unknown as Promise<{ title: string; scheduled_at: Date; status: string }[]>,
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
    checkin,
    nextClass: nextClass ? { title: nextClass.title, scheduled_at: nextClass.scheduled_at } : null,
    attendance: attendanceRaw.map((a) => ({ ...a, scheduled_at: iso(a.scheduled_at) })),
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
    leaves,
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
  const video = (await sql`SELECT weekend_id FROM weekend_videos WHERE id = ${videoId}`) as {
    weekend_id: number;
  }[];
  if (!video[0]) return { error: "Video not found." };
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
// Request leave from the next class (student → tutor)
// ---------------------------------------------------------------------------
export async function submitLeaveRequest(formData: FormData): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "Please tell your tutor why you need leave." };
  if (reason.length > 1000) return { error: "Reason is too long (max 1000 characters)." };

  const current = await getCurrentEnrollment(studentId);
  const next = current ? await getNextClass(current.batch.id) : null;

  if (next) {
    const dupe = (await sql`
      SELECT 1 FROM leave_requests
      WHERE student_id = ${studentId} AND session_id = ${next.id} AND status = 'pending'
      LIMIT 1
    `) as unknown[];
    if (dupe.length > 0) return { error: "You already have a pending leave request for the next class." };
  }

  try {
    await sql`
      INSERT INTO leave_requests (student_id, session_id, lesson_title, lesson_at, reason)
      VALUES (${studentId}, ${next?.id ?? null}, ${next?.title ?? null}, ${next?.scheduled_at ?? null}, ${reason})
    `;
  } catch {
    return { error: "Could not send your leave request. Please try again." };
  }

  notifyAdmin({
    title: "New Leave Request",
    body: next?.title ? `${next.title}: ${reason.slice(0, 80)}` : reason.slice(0, 100),
    url: "/admin",
  }).catch(() => {});
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

// ---------------------------------------------------------------------------
// Check-in (verified entirely server-side; resolves student from the cookie)
// ---------------------------------------------------------------------------
export async function checkIn(codeInput: string): Promise<CheckInResult> {
  const studentId = await requireStudentId();

  const students = (await sql`SELECT status FROM students WHERE id = ${studentId} LIMIT 1`) as {
    status: string;
  }[];
  if (!students[0]) return { ok: false, error: "Account not found." };
  if (students[0].status !== "active") {
    return { ok: false, error: "Your account is not active. Contact your tutor." };
  }

  const current = await getCurrentEnrollment(studentId);
  if (!current) return { ok: false, error: "You are not enrolled in an active batch. Contact your tutor." };

  const blocking = await getBlockingInvoice(studentId);
  if (blocking) {
    return {
      ok: false,
      error: `Month ${blocking.month_no} fee (Rs ${blocking.remaining.toLocaleString("en-PK")}) is unpaid. Open the Fees tab to pay, then you can join.`,
    };
  }

  const session = await getOpenSession(current.batch.id);
  if (!session) return { ok: false, error: "No class is live right now." };

  // Check-in window: opens when the tutor opens the session (created_at) and
  // stays open for CHECKIN_WINDOW_MIN minutes.
  const closesAt = new Date(session.created_at).getTime() + CHECKIN_WINDOW_MIN * 60 * 1000;
  if (Date.now() > closesAt) {
    return { ok: false, error: `Check-in closed (only open for ${CHECKIN_WINDOW_MIN} min after class starts).` };
  }

  const expected = (session.code ?? "").trim().toLowerCase();
  const given = (codeInput ?? "").trim().toLowerCase();
  if (!given || given !== expected) {
    return { ok: false, error: "That code is not correct. Listen for today's code word." };
  }

  try {
    await sql`
      INSERT INTO attendance (student_id, session_id, status)
      VALUES (${studentId}, ${session.id}, 'present')
      ON CONFLICT (student_id, session_id)
      DO UPDATE SET status = 'present', checked_in_at = now()
    `;
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  return { ok: true, meetLink: normalizeMeetLink(session.meet_link) };
}
