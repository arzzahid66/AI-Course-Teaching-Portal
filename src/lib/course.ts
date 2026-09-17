import "server-only";
import { sql } from "@/lib/db";

// ---------------------------------------------------------------------------
// Shared course logic: current enrollment, fee status / blocking, progress.
// Used by both admin and student server actions. Dates (`date` columns) are
// always read as 'YYYY-MM-DD' text so a server in UTC never shifts the day.
// ---------------------------------------------------------------------------

/** Timestamps come back from Neon as Date objects; hand the client ISO strings. */
export function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  return v == null ? "" : String(v);
}
export function isoOrNull(v: unknown): string | null {
  return v == null ? null : iso(v);
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------
export type BatchRow = {
  id: number;
  name: string;
  level: 1 | 2;
  start_date: string;
  class_time: string; // "HH:MM"
  weekends: number;
  months: number;
  monthly_fee: number;
  grace_days: number;
  status: "upcoming" | "active" | "completed";
  w_attendance: number;
  w_homework: number;
  w_quiz: number;
  w_videos: number;
  enrolled: number;
};

export async function loadBatches(): Promise<BatchRow[]> {
  const rows = (await sql`
    SELECT b.id, b.name, b.level, to_char(b.start_date, 'YYYY-MM-DD') AS start_date,
      to_char(b.class_time, 'HH24:MI') AS class_time, b.weekends, b.months, b.monthly_fee,
      b.grace_days, b.status, b.w_attendance, b.w_homework, b.w_quiz, b.w_videos,
      (SELECT COUNT(*) FROM enrollments e WHERE e.batch_id = b.id AND e.status <> 'dropped') AS enrolled
    FROM batches b
    ORDER BY (b.status = 'completed') ASC, b.start_date DESC, b.id DESC
  `) as (Omit<BatchRow, "enrolled"> & { enrolled: string })[];
  return rows.map((r) => ({ ...r, level: Number(r.level) as 1 | 2, enrolled: Number(r.enrolled) }));
}

/** The student's current enrollment: latest active one (by batch start date). */
export async function getCurrentEnrollment(
  studentId: number
): Promise<{ enrollmentId: number; batch: BatchRow } | null> {
  const rows = (await sql`
    SELECT e.id AS enrollment_id, b.id
    FROM enrollments e JOIN batches b ON b.id = e.batch_id
    WHERE e.student_id = ${studentId} AND e.status = 'active'
    ORDER BY b.start_date DESC, e.id DESC
    LIMIT 1
  `) as { enrollment_id: number; id: number }[];
  if (!rows[0]) return null;
  const batch = (await loadBatches()).find((b) => b.id === rows[0].id);
  return batch ? { enrollmentId: rows[0].enrollment_id, batch } : null;
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------
export type FeeStatus = "paid" | "partial" | "unpaid" | "overdue" | "waived";

export type InvoiceView = {
  id: number;
  enrollment_id: number;
  student_id: number;
  month_no: number;
  due_date: string; // YYYY-MM-DD
  grace_until: string; // YYYY-MM-DD — last day before check-in is blocked
  amount: number;
  discount: number;
  paid: number;
  remaining: number;
  status: FeeStatus;
  /** Unpaid past the grace period — blocks check-in. */
  blocks: boolean;
  note: string | null;
};

type InvoiceSqlRow = {
  id: number;
  enrollment_id: number;
  student_id: number;
  month_no: number;
  due_date: string;
  grace_until: string;
  amount: number;
  discount: number;
  paid: string;
  past_due: boolean;
  past_grace: boolean;
  note: string | null;
};

function toInvoiceView(r: InvoiceSqlRow): InvoiceView {
  const net = Math.max(0, Number(r.amount) - Number(r.discount));
  const paid = Number(r.paid);
  const remaining = Math.max(0, net - paid);
  let status: FeeStatus;
  if (net === 0) status = "waived";
  else if (remaining === 0) status = "paid";
  else if (r.past_due && r.past_grace) status = "overdue";
  else if (paid > 0) status = "partial";
  else status = "unpaid";
  return {
    id: r.id,
    enrollment_id: r.enrollment_id,
    student_id: r.student_id,
    month_no: Number(r.month_no),
    due_date: r.due_date,
    grace_until: r.grace_until,
    amount: Number(r.amount),
    discount: Number(r.discount),
    paid,
    remaining,
    status,
    blocks: remaining > 0 && r.past_grace,
    note: r.note,
  };
}

/** Every invoice of a batch (or of one enrollment when enrollmentId is given). */
export async function loadInvoices(opts: {
  batchId?: number;
  enrollmentId?: number;
}): Promise<InvoiceView[]> {
  const batchId = opts.batchId ?? null;
  const enrollmentId = opts.enrollmentId ?? null;
  const rows = (await sql`
    SELECT i.id, i.enrollment_id, e.student_id, i.month_no,
      to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
      to_char(GREATEST(i.due_date, (e.joined_at AT TIME ZONE 'Asia/Karachi')::date) + b.grace_days, 'YYYY-MM-DD') AS grace_until,
      i.amount, i.discount, i.note,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid,
      (i.due_date <= (now() AT TIME ZONE 'Asia/Karachi')::date) AS past_due,
      ((GREATEST(i.due_date, (e.joined_at AT TIME ZONE 'Asia/Karachi')::date) + b.grace_days)
        < (now() AT TIME ZONE 'Asia/Karachi')::date) AS past_grace
    FROM fee_invoices i
    JOIN enrollments e ON e.id = i.enrollment_id
    JOIN batches b ON b.id = e.batch_id
    WHERE (${batchId}::int IS NULL OR e.batch_id = ${batchId})
      AND (${enrollmentId}::int IS NULL OR i.enrollment_id = ${enrollmentId})
    ORDER BY i.enrollment_id, i.month_no
  `) as InvoiceSqlRow[];
  return rows.map(toInvoiceView);
}

/**
 * First invoice that blocks this student, across active enrollments: unpaid
 * `grace_days` after the later of its due date and the day they joined (so a
 * late joiner still gets the full grace period). Blocks check-in and locks the
 * account (see getAccountLock).
 */
export async function getBlockingInvoice(studentId: number): Promise<InvoiceView | null> {
  const rows = (await sql`
    SELECT i.id, i.enrollment_id, e.student_id, i.month_no,
      to_char(i.due_date, 'YYYY-MM-DD') AS due_date,
      to_char(GREATEST(i.due_date, (e.joined_at AT TIME ZONE 'Asia/Karachi')::date) + b.grace_days, 'YYYY-MM-DD') AS grace_until,
      i.amount, i.discount, i.note,
      COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0) AS paid,
      true AS past_due,
      true AS past_grace
    FROM fee_invoices i
    JOIN enrollments e ON e.id = i.enrollment_id
    JOIN batches b ON b.id = e.batch_id
    WHERE e.student_id = ${studentId} AND e.status = 'active'
      AND (GREATEST(i.due_date, (e.joined_at AT TIME ZONE 'Asia/Karachi')::date) + b.grace_days)
        < (now() AT TIME ZONE 'Asia/Karachi')::date
    ORDER BY i.due_date ASC
  `) as InvoiceSqlRow[];
  return rows.map(toInvoiceView).find((i) => i.blocks) ?? null;
}

/** Ids of students whose account is locked by an unpaid fee month (same rule as getBlockingInvoice). */
export async function loadFeeLockedStudentIds(): Promise<Set<number>> {
  const rows = (await sql`
    SELECT DISTINCT e.student_id
    FROM fee_invoices i
    JOIN enrollments e ON e.id = i.enrollment_id
    JOIN batches b ON b.id = e.batch_id
    WHERE e.status = 'active'
      AND (GREATEST(i.due_date, (e.joined_at AT TIME ZONE 'Asia/Karachi')::date) + b.grace_days)
        < (now() AT TIME ZONE 'Asia/Karachi')::date
      AND GREATEST(0, i.amount - i.discount)
        > COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)
  `) as { student_id: number }[];
  return new Set(rows.map((r) => Number(r.student_id)));
}

/** Ids of students on a free seat: every invoice of their active enrollments is fully waived. */
export async function loadFreeSeatStudentIds(): Promise<Set<number>> {
  const rows = (await sql`
    SELECT e.student_id
    FROM fee_invoices i
    JOIN enrollments e ON e.id = i.enrollment_id
    WHERE e.status = 'active'
    GROUP BY e.student_id
    HAVING bool_and(i.amount - i.discount <= 0)
  `) as { student_id: number }[];
  return new Set(rows.map((r) => Number(r.student_id)));
}

/** Waive every fee month of an enrollment (a free seat). */
export async function waiveEnrollmentFees(enrollmentId: number): Promise<void> {
  await sql`
    UPDATE fee_invoices SET discount = amount, note = 'Free seat'
    WHERE enrollment_id = ${enrollmentId}
  `;
}

/** Why a student may not use the portal, or null when they can. */
export type AccountLock =
  | { kind: "inactive"; name: string; whatsapp: string }
  | {
      kind: "fee";
      name: string;
      batchName: string | null;
      monthNo: number;
      remaining: number;
      dueDate: string;
      graceUntil: string;
      graceDays: number;
      accounts: PaymentAccount[];
      whatsapp: string;
    };

export async function getAccountLock(studentId: number): Promise<AccountLock | null> {
  const rows = (await sql`SELECT name, status FROM students WHERE id = ${studentId} LIMIT 1`) as {
    name: string;
    status: string;
  }[];
  if (!rows[0]) return null;
  const name = rows[0].name;
  if (rows[0].status !== "active") {
    return { kind: "inactive", name, whatsapp: (await getSetting("tutor_whatsapp")) ?? "" };
  }
  const inv = await getBlockingInvoice(studentId);
  if (!inv) return null;
  const [accounts, whatsapp, batch] = await Promise.all([
    loadPaymentAccounts(true),
    getSetting("tutor_whatsapp"),
    sql`
      SELECT b.name, b.grace_days FROM enrollments e JOIN batches b ON b.id = e.batch_id
      WHERE e.id = ${inv.enrollment_id}
    ` as unknown as Promise<{ name: string; grace_days: number }[]>,
  ]);
  return {
    kind: "fee",
    name,
    batchName: batch[0]?.name ?? null,
    monthNo: inv.month_no,
    remaining: inv.remaining,
    dueDate: inv.due_date,
    graceUntil: inv.grace_until,
    graceDays: Number(batch[0]?.grace_days ?? 7),
    accounts,
    whatsapp: whatsapp ?? "",
  };
}

/** Create the monthly invoices for an enrollment (idempotent). */
export async function createInvoicesForEnrollment(enrollmentId: number): Promise<void> {
  await sql`
    INSERT INTO fee_invoices (enrollment_id, month_no, due_date, amount)
    SELECT e.id, g.m, (b.start_date + make_interval(months => g.m - 1))::date, b.monthly_fee
    FROM enrollments e
    JOIN batches b ON b.id = e.batch_id
    CROSS JOIN LATERAL generate_series(1, b.months) AS g(m)
    WHERE e.id = ${enrollmentId}
    ON CONFLICT (enrollment_id, month_no) DO NOTHING
  `;
}

/**
 * Record a payment against an enrollment. `target` is a month number, or "auto"
 * to fill unpaid months oldest-first (a Rs 4,000 payment covers both months).
 * All rows share one receipt number and are inserted in a single statement.
 */
export async function insertPayment(input: {
  enrollmentId: number;
  amount: number;
  target: number | "auto";
  method: string;
  reference: string | null;
  note: string | null;
  paidAt: string | null; // YYYY-MM-DD, null = now
}): Promise<{ receiptNo?: string; error?: string }> {
  const invoices = await loadInvoices({ enrollmentId: input.enrollmentId });
  if (invoices.length === 0) return { error: "This enrollment has no fee months." };

  const allocation: { invoiceId: number; amount: number }[] = [];
  if (input.target === "auto") {
    let left = input.amount;
    for (const inv of invoices) {
      if (left <= 0) break;
      if (inv.remaining <= 0) continue;
      const take = Math.min(inv.remaining, left);
      allocation.push({ invoiceId: inv.id, amount: take });
      left -= take;
    }
    if (left > 0) {
      if (allocation.length === 0) return { error: "All months are already paid." };
      return {
        error: `That is Rs ${input.amount - left} more than what is due. Enter Rs ${input.amount - left} or less.`,
      };
    }
  } else {
    const inv = invoices.find((i) => i.month_no === input.target);
    if (!inv) return { error: "That month does not exist for this student." };
    if (input.amount > inv.remaining) {
      return {
        error:
          inv.remaining === 0
            ? `Month ${inv.month_no} is already paid.`
            : `Month ${inv.month_no} only has Rs ${inv.remaining} left to pay.`,
      };
    }
    allocation.push({ invoiceId: inv.id, amount: input.amount });
  }

  const seq = (await sql`SELECT nextval('receipt_seq') AS n`) as { n: string }[];
  const year = new Date().getFullYear();
  const receiptNo = `CG-${year}-${String(seq[0].n).padStart(4, "0")}`;
  const studentId = invoices[0].student_id;

  await sql`
    INSERT INTO payments (invoice_id, student_id, amount, method, reference, receipt_no, note, paid_at)
    SELECT a.invoice_id, ${studentId}, a.amount, ${input.method}, ${input.reference},
      ${receiptNo}, ${input.note},
      COALESCE((${input.paidAt}::date + time '12:00') AT TIME ZONE 'Asia/Karachi', now())
    FROM unnest(${allocation.map((a) => a.invoiceId)}::int[], ${allocation.map((a) => a.amount)}::int[])
      AS a(invoice_id, amount)
  `;
  return { receiptNo };
}

// ---------------------------------------------------------------------------
// Progress score
// ---------------------------------------------------------------------------
export type Band = "excellent" | "good" | "needs_work" | "at_risk" | "not_started";

export type ProgressPart = {
  /** 0–100, or null when nothing in this part is due yet. */
  pct: number | null;
  weight: number;
};

export type ProgressRow = {
  enrollment_id: number;
  student_id: number;
  name: string;
  email: string | null;
  score: number | null;
  band: Band;
  attendance: ProgressPart & { held: number; present: number; excused: number; absent: number };
  homework: ProgressPart & { due: number; graded: number; missing: number; awaiting: number; marks: number };
  quiz: ProgressPart & { total: number; attempted: number };
  videos: ProgressPart & { released: number; watched: number };
};

export function bandFor(score: number | null): Band {
  if (score == null) return "not_started";
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "needs_work";
  return "at_risk";
}

type ProgressSqlRow = {
  enrollment_id: number;
  student_id: number;
  name: string;
  email: string | null;
  held: string;
  present: string;
  excused: string;
  hw_due: string;
  hw_graded: string;
  hw_missing: string;
  hw_awaiting: string;
  hw_marks: string;
  quiz_total: string;
  quiz_attempted: string;
  quiz_sum: string;
  vid_released: string;
  vid_watched: string;
};

/**
 * Progress for every (non-dropped) enrollment of a batch. Only items that are
 * already due count; a part with nothing due is left out and the remaining
 * weights are re-normalised, so a new intake does not start at 0.
 *   attendance: present ÷ (closed sessions − excused)
 *   homework:   marks/10 averaged over due weekends; missing = 0; submitted but
 *               not yet marked is left out until marked
 *   quiz:       best submitted % per published quiz for the level; none = 0
 *   videos:     watched ÷ videos of weekends whose class time has passed
 */
export async function computeBatchProgress(batchId: number): Promise<ProgressRow[]> {
  const batch = (await loadBatches()).find((b) => b.id === batchId);
  if (!batch) return [];

  const rows = (await sql`
    WITH enr AS (
      SELECT e.id, e.student_id, s.name, s.email
      FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE e.batch_id = ${batchId} AND e.status <> 'dropped'
    ),
    held AS (
      SELECT id FROM sessions
      WHERE batch_id = ${batchId} AND closed_at IS NOT NULL AND is_open = false
    ),
    att AS (
      SELECT e.id AS enrollment_id,
        COUNT(h.id) AS held,
        COUNT(a.id) FILTER (WHERE a.status = 'present') AS present,
        COUNT(a.id) FILTER (WHERE a.status = 'excused') AS excused
      FROM enr e CROSS JOIN held h
      LEFT JOIN attendance a ON a.session_id = h.id AND a.student_id = e.student_id
      GROUP BY e.id
    ),
    hw_due AS (
      SELECT DISTINCT s.weekend_id
      FROM sessions s JOIN weekends w ON w.id = s.weekend_id
      WHERE s.batch_id = ${batchId}
        AND s.scheduled_at + interval '7 days' <= now()
        AND COALESCE(btrim(w.homework), '') <> ''
    ),
    hw AS (
      SELECT e.id AS enrollment_id,
        COUNT(d.weekend_id) AS due,
        COUNT(hs.id) FILTER (WHERE hs.marks IS NOT NULL) AS graded,
        COUNT(d.weekend_id) FILTER (WHERE hs.id IS NULL) AS missing,
        COUNT(hs.id) FILTER (WHERE hs.marks IS NULL) AS awaiting,
        COALESCE(SUM(hs.marks), 0) AS marks
      FROM enr e CROSS JOIN hw_due d
      LEFT JOIN homework_submissions hs ON hs.enrollment_id = e.id AND hs.weekend_id = d.weekend_id
      GROUP BY e.id
    ),
    qz AS (
      SELECT id FROM quizzes
      WHERE is_published = true AND (level IS NULL OR level = ${batch.level})
    ),
    quiz AS (
      SELECT e.id AS enrollment_id,
        COUNT(q.id) AS total,
        COUNT(best.pct) AS attempted,
        COALESCE(SUM(best.pct), 0) AS sum_best
      FROM enr e CROSS JOIN qz q
      LEFT JOIN LATERAL (
        SELECT MAX(qa.percent) AS pct FROM quiz_attempts qa
        WHERE qa.quiz_id = q.id AND qa.student_id = e.student_id AND qa.status = 'submitted'
      ) best ON true
      GROUP BY e.id
    ),
    vids AS (
      SELECT DISTINCT v.id
      FROM weekend_videos v
      JOIN sessions s ON s.weekend_id = v.weekend_id AND s.batch_id = ${batchId}
      WHERE s.scheduled_at <= now() AND v.kind <> 'extra'
    ),
    vid AS (
      SELECT e.id AS enrollment_id,
        COUNT(v.id) AS released,
        COUNT(vp.video_id) AS watched
      FROM enr e CROSS JOIN vids v
      LEFT JOIN video_progress vp ON vp.video_id = v.id AND vp.student_id = e.student_id
      GROUP BY e.id
    )
    SELECT e.id AS enrollment_id, e.student_id, e.name, e.email,
      COALESCE(att.held, 0) AS held, COALESCE(att.present, 0) AS present,
      COALESCE(att.excused, 0) AS excused,
      COALESCE(hw.due, 0) AS hw_due, COALESCE(hw.graded, 0) AS hw_graded,
      COALESCE(hw.missing, 0) AS hw_missing, COALESCE(hw.awaiting, 0) AS hw_awaiting,
      COALESCE(hw.marks, 0) AS hw_marks,
      COALESCE(quiz.total, 0) AS quiz_total, COALESCE(quiz.attempted, 0) AS quiz_attempted,
      COALESCE(quiz.sum_best, 0) AS quiz_sum,
      COALESCE(vid.released, 0) AS vid_released, COALESCE(vid.watched, 0) AS vid_watched
    FROM enr e
    LEFT JOIN att ON att.enrollment_id = e.id
    LEFT JOIN hw ON hw.enrollment_id = e.id
    LEFT JOIN quiz ON quiz.enrollment_id = e.id
    LEFT JOIN vid ON vid.enrollment_id = e.id
    ORDER BY e.name ASC
  `) as ProgressSqlRow[];

  return rows.map((r) => {
    const held = Number(r.held);
    const present = Number(r.present);
    const excused = Number(r.excused);
    const counted = held - excused;
    const attendancePct = counted > 0 ? (present / counted) * 100 : null;

    const graded = Number(r.hw_graded);
    const missing = Number(r.hw_missing);
    const hwCount = graded + missing;
    const homeworkPct = hwCount > 0 ? (Number(r.hw_marks) / (hwCount * 10)) * 100 : null;

    const quizTotal = Number(r.quiz_total);
    const quizPct = quizTotal > 0 ? Number(r.quiz_sum) / quizTotal : null;

    const released = Number(r.vid_released);
    const watched = Number(r.vid_watched);
    const videoPct = released > 0 ? (watched / released) * 100 : null;

    const parts: [number | null, number][] = [
      [attendancePct, batch.w_attendance],
      [homeworkPct, batch.w_homework],
      [quizPct, batch.w_quiz],
      [videoPct, batch.w_videos],
    ];
    const applicable = parts.filter(([p, w]) => p != null && w > 0) as [number, number][];
    const weightSum = applicable.reduce((s, [, w]) => s + w, 0);
    const score =
      weightSum > 0
        ? Math.round(applicable.reduce((s, [p, w]) => s + p * w, 0) / weightSum)
        : null;

    const round = (v: number | null) => (v == null ? null : Math.round(v));
    return {
      enrollment_id: r.enrollment_id,
      student_id: r.student_id,
      name: r.name,
      email: r.email,
      score,
      band: bandFor(score),
      attendance: {
        pct: round(attendancePct),
        weight: batch.w_attendance,
        held,
        present,
        excused,
        absent: Math.max(0, held - present - excused),
      },
      homework: {
        pct: round(homeworkPct),
        weight: batch.w_homework,
        due: Number(r.hw_due),
        graded,
        missing,
        awaiting: Number(r.hw_awaiting),
        marks: Number(r.hw_marks),
      },
      quiz: {
        pct: round(quizPct),
        weight: batch.w_quiz,
        total: quizTotal,
        attempted: Number(r.quiz_attempted),
      },
      videos: { pct: round(videoPct), weight: batch.w_videos, released, watched },
    };
  });
}

// ---------------------------------------------------------------------------
// Payment accounts + settings
// ---------------------------------------------------------------------------
export type PaymentAccount = {
  id: number;
  method: string;
  account_title: string | null;
  account_number: string | null;
  bank_name: string | null;
  iban: string | null;
  instructions: string | null;
  is_active: boolean;
  sort_order: number;
};

export async function loadPaymentAccounts(activeOnly: boolean): Promise<PaymentAccount[]> {
  return (await sql`
    SELECT id, method, account_title, account_number, bank_name, iban, instructions,
      is_active, sort_order
    FROM payment_accounts
    WHERE (${!activeOnly} OR is_active = true)
    ORDER BY sort_order ASC, id ASC
  `) as PaymentAccount[];
}

export async function getSetting(key: string): Promise<string | null> {
  const rows = (await sql`SELECT value FROM app_settings WHERE key = ${key}`) as {
    value: string | null;
  }[];
  return rows[0]?.value ?? null;
}
