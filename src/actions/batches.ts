"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin } from "@/lib/auth";
import {
  computeBatchProgress,
  iso,
  loadBatches,
  loadInvoices,
  type BatchRow,
  type ProgressRow,
} from "@/lib/course";

export async function getBatches(): Promise<BatchRow[]> {
  await assertAdmin();
  return loadBatches();
}

function readBatchForm(formData: FormData) {
  const num = (key: string, fallback: number) => {
    const raw = String(formData.get(key) ?? "").trim();
    const v = Number(raw);
    return raw === "" || Number.isNaN(v) ? fallback : Math.round(v);
  };
  return {
    name: String(formData.get("name") ?? "").trim(),
    level: num("level", 1),
    startDate: String(formData.get("start_date") ?? "").trim(),
    classTime: String(formData.get("class_time") ?? "10:00").trim() || "10:00",
    weekends: num("weekends", 8),
    months: num("months", 2),
    monthlyFee: num("monthly_fee", 2000),
    graceDays: num("grace_days", 7),
    status: String(formData.get("status") ?? "upcoming"),
    wAttendance: num("w_attendance", 30),
    wHomework: num("w_homework", 35),
    wQuiz: num("w_quiz", 25),
    wVideos: num("w_videos", 10),
  };
}

function validateBatch(f: ReturnType<typeof readBatchForm>): string | null {
  if (!f.name) return "Give the intake a name, e.g. “Batch 1 — Sep 2026”.";
  if (f.level !== 1 && f.level !== 2) return "Level must be Batch 1 or Batch 2.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate)) return "Pick the date of the first class.";
  if (!/^\d{2}:\d{2}$/.test(f.classTime)) return "Class time must look like 10:00.";
  if (f.weekends < 1 || f.weekends > 52) return "Weekends must be between 1 and 52.";
  if (f.months < 1 || f.months > 24) return "Months must be between 1 and 24.";
  if (f.monthlyFee < 0) return "Monthly fee can't be negative.";
  if (f.graceDays < 0) return "Grace days can't be negative.";
  if (!["upcoming", "active", "completed"].includes(f.status)) return "Pick a status.";
  if ([f.wAttendance, f.wHomework, f.wQuiz, f.wVideos].some((w) => w < 0)) {
    return "Score weights can't be negative.";
  }
  if (f.wAttendance + f.wHomework + f.wQuiz + f.wVideos === 0) {
    return "At least one score weight must be above 0.";
  }
  return null;
}

/**
 * Create an intake and auto-schedule its weekly classes: one per weekend, every
 * 7 days from the start date at the class time (Pakistan time), each linked to
 * that weekend of the level's curriculum. Meet link + code are added later.
 */
export async function createBatch(formData: FormData): Promise<{ error?: string; id?: number }> {
  await assertAdmin();
  const f = readBatchForm(formData);
  const err = validateBatch(f);
  if (err) return { error: err };

  const rows = (await sql`
    INSERT INTO batches (name, level, start_date, class_time, weekends, months, monthly_fee,
      grace_days, status, w_attendance, w_homework, w_quiz, w_videos)
    VALUES (${f.name}, ${f.level}, ${f.startDate}, ${f.classTime}, ${f.weekends}, ${f.months},
      ${f.monthlyFee}, ${f.graceDays}, ${f.status}, ${f.wAttendance}, ${f.wHomework}, ${f.wQuiz},
      ${f.wVideos})
    RETURNING id
  `) as { id: number }[];
  const id = rows[0].id;

  await sql`
    INSERT INTO sessions (batch_id, weekend_id, title, scheduled_at)
    SELECT b.id, w.id,
      'Weekend ' || g.n || COALESCE(' — ' || w.title, ''),
      ((b.start_date + (g.n - 1) * 7) + b.class_time) AT TIME ZONE 'Asia/Karachi'
    FROM batches b
    CROSS JOIN LATERAL generate_series(1, b.weekends) AS g(n)
    LEFT JOIN weekends w ON w.level = b.level AND w.weekend_no = g.n
    WHERE b.id = ${id}
  `;
  revalidatePath("/admin");
  return { id };
}

/**
 * Edit an intake. Changing the fee or months only affects students enrolled
 * afterwards; existing fee months are edited per student in the Fees tab.
 * Dates of already-scheduled classes are edited in the Classes tab.
 */
export async function updateBatch(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const f = readBatchForm(formData);
  const err = validateBatch(f);
  if (err) return { error: err };
  await sql`
    UPDATE batches SET name = ${f.name}, class_time = ${f.classTime}, months = ${f.months},
      monthly_fee = ${f.monthlyFee}, grace_days = ${f.graceDays}, status = ${f.status},
      w_attendance = ${f.wAttendance}, w_homework = ${f.wHomework}, w_quiz = ${f.wQuiz},
      w_videos = ${f.wVideos}
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
  return {};
}

/** Delete an intake — refused once any payment has been recorded against it. */
export async function deleteBatch(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  const paid = (await sql`
    SELECT 1 FROM payments p
    JOIN fee_invoices i ON i.id = p.invoice_id
    JOIN enrollments e ON e.id = i.enrollment_id
    WHERE e.batch_id = ${id} LIMIT 1
  `) as unknown[];
  if (paid.length > 0) {
    return { error: "This intake has payments recorded. Mark it completed instead of deleting." };
  }
  await sql`DELETE FROM batches WHERE id = ${id}`;
  revalidatePath("/admin");
  return {};
}

export async function getBatchProgress(batchId: number): Promise<ProgressRow[]> {
  await assertAdmin();
  return computeBatchProgress(batchId);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export type DashboardStats = {
  enrolled: number;
  fees: {
    expected: number;
    collected: number;
    collectedThisMonth: number;
    outstanding: number; // due already (past due date), not yet paid
    overdueStudents: { name: string; remaining: number; months: number[] }[];
  };
  attendance: { title: string; scheduled_at: string; present: number; absent: number; excused: number }[];
  homeworkAwaiting: number;
  progress: { average: number | null; atRisk: { name: string; score: number }[] };
  nextClass: { title: string; scheduled_at: string } | null;
};

export async function getDashboardStats(batchId: number): Promise<DashboardStats> {
  await assertAdmin();
  return buildDashboardStats(batchId, await computeBatchProgress(batchId));
}

/** Dashboard stats + progress rows in one go (progress is computed once). */
export async function getBatchOverview(
  batchId: number
): Promise<{ stats: DashboardStats; progress: ProgressRow[] }> {
  await assertAdmin();
  const progress = await computeBatchProgress(batchId);
  return { stats: await buildDashboardStats(batchId, progress), progress };
}

async function buildDashboardStats(batchId: number, progress: ProgressRow[]): Promise<DashboardStats> {
  const [invoices, attendanceRows, hwRows, thisMonthRows, nextRows, names] =
    await Promise.all([
      loadInvoices({ batchId }),
      sql`
        SELECT s.title, s.scheduled_at,
          COUNT(a.id) FILTER (WHERE a.status = 'present') AS present,
          COUNT(a.id) FILTER (WHERE a.status = 'absent') AS absent,
          COUNT(a.id) FILTER (WHERE a.status = 'excused') AS excused
        FROM sessions s LEFT JOIN attendance a ON a.session_id = s.id
        WHERE s.batch_id = ${batchId} AND s.closed_at IS NOT NULL
        GROUP BY s.id ORDER BY s.scheduled_at ASC
      ` as unknown as Promise<{ title: string; scheduled_at: Date; present: string; absent: string; excused: string }[]>,
      sql`
        SELECT COUNT(*) AS n FROM homework_submissions h
        JOIN enrollments e ON e.id = h.enrollment_id
        WHERE e.batch_id = ${batchId} AND h.marks IS NULL AND h.status = 'submitted'
      ` as unknown as Promise<{ n: string }[]>,
      sql`
        SELECT COALESCE(SUM(p.amount), 0) AS total
        FROM payments p
        JOIN fee_invoices i ON i.id = p.invoice_id
        JOIN enrollments e ON e.id = i.enrollment_id
        WHERE e.batch_id = ${batchId}
          AND date_trunc('month', p.paid_at AT TIME ZONE 'Asia/Karachi')
            = date_trunc('month', now() AT TIME ZONE 'Asia/Karachi')
      ` as unknown as Promise<{ total: string }[]>,
      sql`
        SELECT title, scheduled_at FROM sessions
        WHERE batch_id = ${batchId} AND closed_at IS NULL AND is_open = false
          AND scheduled_at > now() - interval '12 hours'
        ORDER BY scheduled_at ASC LIMIT 1
      ` as unknown as Promise<{ title: string; scheduled_at: Date }[]>,
      sql`
        SELECT e.id, s.name FROM enrollments e JOIN students s ON s.id = e.student_id
        WHERE e.batch_id = ${batchId}
      ` as unknown as Promise<{ id: number; name: string }[]>,
    ]);

  const nameByEnrollment = new Map(names.map((n) => [n.id, n.name]));
  const overdue = new Map<number, { name: string; remaining: number; months: number[] }>();
  for (const inv of invoices) {
    if (inv.status !== "overdue") continue;
    const cur = overdue.get(inv.enrollment_id) ?? {
      name: nameByEnrollment.get(inv.enrollment_id) ?? "Student",
      remaining: 0,
      months: [],
    };
    cur.remaining += inv.remaining;
    cur.months.push(inv.month_no);
    overdue.set(inv.enrollment_id, cur);
  }

  const scored = progress.filter((p) => p.score != null) as (ProgressRow & { score: number })[];
  return {
    enrolled: progress.length,
    fees: {
      expected: invoices.reduce((s, i) => s + Math.max(0, i.amount - i.discount), 0),
      collected: invoices.reduce((s, i) => s + i.paid, 0),
      collectedThisMonth: Number(thisMonthRows[0]?.total ?? 0),
      outstanding: invoices
        .filter((i) => i.status === "overdue" || ((i.status === "unpaid" || i.status === "partial") && i.due_date <= todayKarachi()))
        .reduce((s, i) => s + i.remaining, 0),
      overdueStudents: [...overdue.values()].sort((a, b) => b.remaining - a.remaining),
    },
    attendance: attendanceRows.map((r) => ({
      title: r.title,
      scheduled_at: iso(r.scheduled_at),
      present: Number(r.present),
      absent: Number(r.absent),
      excused: Number(r.excused),
    })),
    homeworkAwaiting: Number(hwRows[0]?.n ?? 0),
    progress: {
      average: scored.length
        ? Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length)
        : null,
      atRisk: scored
        .filter((p) => p.band === "at_risk")
        .sort((a, b) => a.score - b.score)
        .map((p) => ({ name: p.name, score: p.score })),
    },
    nextClass: nextRows[0]
      ? { title: nextRows[0].title, scheduled_at: iso(nextRows[0].scheduled_at) }
      : null,
  };
}

function todayKarachi(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}
