"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import {
  assertAdmin,
  checkAdminPassword,
  checkAdminEmail,
  setAdminCookie,
  clearAdminCookie,
  generateStudentToken,
  hashPassword,
} from "@/lib/auth";
import { normalizeMeetLink } from "@/lib/constants";
import {
  createInvoicesForEnrollment,
  insertPayment,
  iso,
  isoOrNull,
  loadInvoices,
  computeBatchProgress,
  type InvoiceView,
  type ProgressRow,
} from "@/lib/course";
import { recordLoginLog } from "@/lib/loginLog";
import { notifyStudent } from "@/lib/pushNotifications";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export async function adminLogin(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!checkAdminEmail(email) || !checkAdminPassword(password)) {
    return { error: "Wrong email or password." };
  }
  await setAdminCookie();
  await recordLoginLog({
    studentId: null,
    role: "admin",
    name: "Admin",
    email: email.trim() || process.env.ADMIN_EMAIL || null,
    isPwa: formData.get("is_pwa") === "true",
  });
  revalidatePath("/admin");
  return {};
}

export async function adminLogout(): Promise<void> {
  await clearAdminCookie();
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
export type StudentEnrollment = {
  enrollment_id: number;
  batch_id: number;
  batch_name: string;
  status: "active" | "completed" | "dropped";
};

export type StudentRow = {
  id: number;
  name: string;
  whatsapp: string | null;
  gender: string | null;
  email: string | null;
  has_login: boolean;
  status: string;
  enrollments: StudentEnrollment[];
};

export async function getStudents(): Promise<StudentRow[]> {
  await assertAdmin();
  const students = (await sql`
    SELECT id, name, whatsapp, gender, email, (password_hash IS NOT NULL) AS has_login, status
    FROM students
    ORDER BY created_at DESC, id DESC
  `) as Omit<StudentRow, "enrollments">[];
  const enrollments = (await sql`
    SELECT e.id AS enrollment_id, e.student_id, e.batch_id, b.name AS batch_name, e.status
    FROM enrollments e JOIN batches b ON b.id = e.batch_id
    ORDER BY b.start_date DESC
  `) as (StudentEnrollment & { student_id: number })[];
  return students.map((s) => ({
    ...s,
    enrollments: enrollments
      .filter((e) => e.student_id === s.id)
      .map(({ student_id: _ignored, ...e }) => e),
  }));
}

/** Create a student row; returns the new id or an error message. */
async function insertStudent(input: {
  name: string;
  whatsapp: string | null;
  gender: string | null;
  email: string | null;
  password: string;
}): Promise<{ id?: number; error?: string }> {
  const passwordHash = input.email && input.password ? hashPassword(input.password) : null;
  const passwordPlain = input.email && input.password ? input.password : null;
  try {
    const rows = (await sql`
      INSERT INTO students (name, whatsapp, gender, token, email, password_hash, password_plain)
      VALUES (${input.name}, ${input.whatsapp}, ${input.gender}, ${generateStudentToken()},
        ${input.email}, ${passwordHash}, ${passwordPlain})
      RETURNING id
    `) as { id: number }[];
    return { id: rows[0].id };
  } catch {
    return { error: "Could not add student. Is that email already used?" };
  }
}

/** Enroll a student into a batch and create that enrollment's monthly fees. */
async function enroll(studentId: number, batchId: number): Promise<number> {
  const rows = (await sql`
    INSERT INTO enrollments (student_id, batch_id)
    VALUES (${studentId}, ${batchId})
    ON CONFLICT (student_id, batch_id) DO UPDATE SET status = 'active'
    RETURNING id
  `) as { id: number }[];
  await createInvoicesForEnrollment(rows[0].id);
  return rows[0].id;
}

/**
 * Add a student, enroll them in the chosen intake, and (optionally) record a
 * payment straight away — "full" pays every month, a number pays that amount
 * oldest-month-first.
 */
export async function addStudent(formData: FormData): Promise<{ error?: string; receiptNo?: string }> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const batchId = Number(formData.get("batch_id"));
  const payNow = String(formData.get("pay_now") ?? "none");
  const method = String(formData.get("method") ?? "EasyPaisa").trim() || "EasyPaisa";
  const reference = String(formData.get("reference") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!batchId) return { error: "Pick the intake this student is joining." };
  if (email && password.length < 4) return { error: "Password must be at least 4 characters." };

  const created = await insertStudent({
    name,
    whatsapp: whatsapp || null,
    gender: gender || null,
    email: email || null,
    password,
  });
  if (created.error || !created.id) return { error: created.error };

  const enrollmentId = await enroll(created.id, batchId);

  let receiptNo: string | undefined;
  if (payNow === "month1" || payNow === "full") {
    const invoices = await loadInvoices({ enrollmentId });
    const amount =
      payNow === "full"
        ? invoices.reduce((s, i) => s + i.remaining, 0)
        : invoices.find((i) => i.month_no === 1)?.remaining ?? 0;
    if (amount > 0) {
      const res = await insertPayment({
        enrollmentId,
        amount,
        target: payNow === "full" ? "auto" : 1,
        method,
        reference: reference || null,
        note: payNow === "full" ? "Full batch paid at enrollment" : null,
        paidAt: null,
      });
      if (res.error) return { error: `Student added, but payment failed: ${res.error}` };
      receiptNo = res.receiptNo;
    }
  }
  revalidatePath("/admin");
  return { receiptNo };
}

/**
 * Bulk create from lines of "name, whatsapp, gender, email, password, paid".
 * Everyone is enrolled into the chosen intake. The optional 6th column is
 * "full" (pays every month) or an amount in Rs (paid oldest month first).
 */
export async function bulkAddStudents(
  formData: FormData
): Promise<{ created: number; error?: string; skipped: string[] }> {
  await assertAdmin();
  const batchId = Number(formData.get("batch_id"));
  if (!batchId) return { created: 0, skipped: [], error: "Pick the intake first." };
  const lines = String(formData.get("bulk") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let created = 0;
  const skipped: string[] = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    const email = (parts[3] || "").toLowerCase() || null;
    const res = await insertStudent({
      name,
      whatsapp: parts[1] || null,
      gender: parts[2] || null,
      email,
      password: parts[4] || "",
    });
    if (!res.id) {
      skipped.push(name);
      continue;
    }
    const enrollmentId = await enroll(res.id, batchId);
    const paid = (parts[5] || "").toLowerCase();
    if (paid) {
      const invoices = await loadInvoices({ enrollmentId });
      const due = invoices.reduce((s, i) => s + i.remaining, 0);
      const amount = paid === "full" ? due : Number(paid);
      if (amount > 0 && !Number.isNaN(amount)) {
        await insertPayment({
          enrollmentId,
          amount: Math.min(amount, due),
          target: "auto",
          method: "EasyPaisa",
          reference: null,
          note: "Recorded in bulk import",
          paidAt: null,
        });
      }
    }
    created += 1;
  }
  revalidatePath("/admin");
  return { created, skipped };
}

/** Give an existing student (or change) a login email + password. */
export async function setStudentCredentials(
  studentId: number,
  email: string,
  password: string
): Promise<{ error?: string }> {
  await assertAdmin();
  const e = email.trim().toLowerCase();
  if (!e) return { error: "Email is required." };
  if (password.length < 4) return { error: "Password must be at least 4 characters." };
  try {
    await sql`
      UPDATE students
      SET email = ${e}, password_hash = ${hashPassword(password)}, password_plain = ${password}
      WHERE id = ${studentId}
    `;
  } catch {
    return { error: "Could not save. Is that email already used by another student?" };
  }
  revalidatePath("/admin");
  return {};
}

export async function setStudentStatus(
  studentId: number,
  status: "active" | "inactive"
): Promise<void> {
  await assertAdmin();
  await sql`UPDATE students SET status = ${status} WHERE id = ${studentId}`;
  revalidatePath("/admin");
}

/** Update a student's basic details (name, whatsapp, gender). */
export async function updateStudent(
  studentId: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  if (!name) return { error: "Name is required." };
  await sql`
    UPDATE students
    SET name = ${name}, whatsapp = ${whatsapp || null}, gender = ${gender || null}
    WHERE id = ${studentId}
  `;
  revalidatePath("/admin");
  return {};
}

/** Permanently delete a student. Enrollments, fees, payments, attendance cascade. */
export async function deleteStudent(studentId: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM students WHERE id = ${studentId}`;
  } catch (e) {
    return { error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete student." };
  }
  revalidatePath("/admin");
  return {};
}

/** Enroll an existing student into another intake (e.g. Batch 1 → Batch 2). */
export async function enrollStudent(studentId: number, batchId: number): Promise<{ error?: string }> {
  await assertAdmin();
  if (!studentId || !batchId) return { error: "Pick a student and an intake." };
  try {
    await enroll(studentId, batchId);
  } catch (e) {
    return { error: e instanceof Error ? `Could not enroll: ${e.message}` : "Could not enroll." };
  }
  revalidatePath("/admin");
  return {};
}

export async function setEnrollmentStatus(
  enrollmentId: number,
  status: "active" | "completed" | "dropped"
): Promise<void> {
  await assertAdmin();
  await sql`UPDATE enrollments SET status = ${status} WHERE id = ${enrollmentId}`;
  revalidatePath("/admin");
}

/**
 * Move a student to another intake: the old enrollment is marked dropped (its
 * fee history stays), and a new enrollment with fresh fee months is created.
 */
export async function moveEnrollment(
  enrollmentId: number,
  toBatchId: number
): Promise<{ error?: string }> {
  await assertAdmin();
  const rows = (await sql`
    SELECT student_id, batch_id FROM enrollments WHERE id = ${enrollmentId}
  `) as { student_id: number; batch_id: number }[];
  if (!rows[0]) return { error: "Enrollment not found." };
  if (rows[0].batch_id === toBatchId) return { error: "The student is already in that intake." };
  await enroll(rows[0].student_id, toBatchId);
  await sql`UPDATE enrollments SET status = 'dropped' WHERE id = ${enrollmentId}`;
  revalidatePath("/admin");
  return {};
}

export type StudentDetail = {
  id: number;
  name: string;
  email: string | null;
  password: string | null;
  enrollments: (StudentEnrollment & {
    invoices: InvoiceView[];
    payments: PaymentRow[];
    progress: ProgressRow | null;
  })[];
  attendance: { title: string; scheduled_at: string; status: string; batch_name: string }[];
  homework: {
    weekend_no: number;
    title: string;
    status: string;
    marks: number | null;
    link_url: string;
    batch_name: string;
  }[];
};

export type PaymentRow = {
  id: number;
  receipt_no: string;
  month_no: number;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  paid_at: string;
};

export async function getStudentDetail(studentId: number): Promise<StudentDetail> {
  await assertAdmin();
  const base = (await sql`
    SELECT id, name, email, password_plain FROM students WHERE id = ${studentId} LIMIT 1
  `) as { id: number; name: string; email: string | null; password_plain: string | null }[];

  const enrollments = (await sql`
    SELECT e.id AS enrollment_id, e.batch_id, b.name AS batch_name, e.status
    FROM enrollments e JOIN batches b ON b.id = e.batch_id
    WHERE e.student_id = ${studentId}
    ORDER BY b.start_date DESC
  `) as StudentEnrollment[];

  const payments = (await sql`
    SELECT p.id, p.receipt_no, i.month_no, i.enrollment_id, p.amount, p.method, p.reference,
      p.note, p.paid_at
    FROM payments p JOIN fee_invoices i ON i.id = p.invoice_id
    WHERE p.student_id = ${studentId}
    ORDER BY p.paid_at DESC, p.id DESC
  `) as (Omit<PaymentRow, "paid_at"> & { enrollment_id: number; paid_at: Date })[];

  const detailed = await Promise.all(
    enrollments.map(async (e) => {
      const progress = (await computeBatchProgress(e.batch_id)).find(
        (p) => p.enrollment_id === e.enrollment_id
      );
      return {
        ...e,
        invoices: await loadInvoices({ enrollmentId: e.enrollment_id }),
        payments: payments
          .filter((p) => p.enrollment_id === e.enrollment_id)
          .map(({ enrollment_id: _e, ...p }) => ({ ...p, paid_at: iso(p.paid_at) })),
        progress: progress ?? null,
      };
    })
  );

  const attendance = (await sql`
    SELECT s.title, s.scheduled_at, a.status, b.name AS batch_name
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    JOIN batches b ON b.id = s.batch_id
    WHERE a.student_id = ${studentId}
    ORDER BY s.scheduled_at DESC LIMIT 50
  `) as { title: string; scheduled_at: Date; status: string; batch_name: string }[];

  const homework = (await sql`
    SELECT w.weekend_no, w.title, h.status, h.marks, h.link_url, b.name AS batch_name
    FROM homework_submissions h
    JOIN enrollments e ON e.id = h.enrollment_id
    JOIN batches b ON b.id = e.batch_id
    JOIN weekends w ON w.id = h.weekend_id
    WHERE e.student_id = ${studentId}
    ORDER BY b.start_date DESC, w.weekend_no ASC
  `) as StudentDetail["homework"];

  const row = base[0];
  return {
    id: row?.id ?? studentId,
    name: row?.name ?? "",
    email: row?.email ?? null,
    password: row?.password_plain ?? null,
    enrollments: detailed,
    attendance: attendance.map((a) => ({ ...a, scheduled_at: iso(a.scheduled_at) })),
    homework,
  };
}

// ---------------------------------------------------------------------------
// Sessions (classes) — every class belongs to an intake
// ---------------------------------------------------------------------------
export type SessionRow = {
  id: number;
  batch_id: number;
  batch_name: string;
  weekend_id: number | null;
  weekend_no: number | null;
  title: string;
  scheduled_at: string;
  meet_link: string;
  code: string;
  is_open: boolean;
  closed_at: string | null;
  present: number;
  absent: number;
  excused: number;
};

export type AttendeeRow = {
  student_id: number;
  name: string;
  email: string | null;
  status: "present" | "absent" | "excused" | null;
};

type SessionSqlRow = Omit<SessionRow, "scheduled_at" | "closed_at" | "present" | "absent" | "excused"> & {
  scheduled_at: Date;
  closed_at: Date | null;
  present: string;
  absent: string;
  excused: string;
};

function toSessionRow(r: SessionSqlRow): SessionRow {
  return {
    ...r,
    scheduled_at: iso(r.scheduled_at),
    closed_at: isoOrNull(r.closed_at),
    present: Number(r.present),
    absent: Number(r.absent),
    excused: Number(r.excused),
  };
}

export async function getOpenSessionWithAttendance(): Promise<{
  session: SessionRow | null;
  attendees: AttendeeRow[];
}> {
  await assertAdmin();
  const sessions = (await sql`
    SELECT s.id, s.batch_id, b.name AS batch_name, s.weekend_id, w.weekend_no, s.title,
      s.scheduled_at, s.meet_link, s.code, s.is_open, s.closed_at,
      0 AS present, 0 AS absent, 0 AS excused
    FROM sessions s
    JOIN batches b ON b.id = s.batch_id
    LEFT JOIN weekends w ON w.id = s.weekend_id
    WHERE s.is_open = true
    ORDER BY s.created_at DESC LIMIT 1
  `) as SessionSqlRow[];
  const session = sessions[0] ? toSessionRow(sessions[0]) : null;
  if (!session) return { session: null, attendees: [] };
  return { session, attendees: await getSessionAttendees(session.id) };
}

/** Everyone actively enrolled in the session's intake, with their status for it. */
export async function getSessionAttendees(sessionId: number): Promise<AttendeeRow[]> {
  await assertAdmin();
  return (await sql`
    SELECT st.id AS student_id, st.name, st.email, a.status
    FROM sessions s
    JOIN enrollments e ON e.batch_id = s.batch_id AND e.status = 'active'
    JOIN students st ON st.id = e.student_id
    LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = st.id
    WHERE s.id = ${sessionId}
    ORDER BY (a.status = 'present') DESC NULLS LAST, st.name ASC
  `) as AttendeeRow[];
}

export async function getBatchSessions(batchId: number): Promise<SessionRow[]> {
  await assertAdmin();
  const rows = (await sql`
    SELECT s.id, s.batch_id, b.name AS batch_name, s.weekend_id, w.weekend_no, s.title,
      s.scheduled_at, s.meet_link, s.code, s.is_open, s.closed_at,
      COUNT(a.id) FILTER (WHERE a.status = 'present') AS present,
      COUNT(a.id) FILTER (WHERE a.status = 'absent') AS absent,
      COUNT(a.id) FILTER (WHERE a.status = 'excused') AS excused
    FROM sessions s
    JOIN batches b ON b.id = s.batch_id
    LEFT JOIN weekends w ON w.id = s.weekend_id
    LEFT JOIN attendance a ON a.session_id = s.id
    WHERE s.batch_id = ${batchId}
    GROUP BY s.id, b.name, w.weekend_no
    ORDER BY s.scheduled_at ASC
  `) as SessionSqlRow[];
  return rows.map(toSessionRow);
}

function readSessionForm(formData: FormData) {
  return {
    batchId: Number(formData.get("batch_id")),
    title: String(formData.get("title") ?? "").trim(),
    scheduledAt: String(formData.get("scheduled_at") ?? "").trim(),
    meetLink: normalizeMeetLink(String(formData.get("meet_link") ?? "")),
    code: String(formData.get("code") ?? "").trim(),
  };
}

/** Start a brand-new (extra) class right now for an intake. */
export async function createSession(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const f = readSessionForm(formData);
  if (!f.batchId) return { error: "Pick an intake first." };
  if (!f.title || !f.scheduledAt || !f.meetLink || !f.code) {
    return { error: "Title, time, Meet link and code are all required." };
  }
  await sql`UPDATE sessions SET is_open = false, closed_at = now() WHERE is_open = true`;
  await sql`
    INSERT INTO sessions (batch_id, title, scheduled_at, meet_link, code, is_open)
    VALUES (${f.batchId}, ${f.title}, ${f.scheduledAt}, ${f.meetLink}, ${f.code}, true)
  `;
  revalidatePath("/admin");
  return {};
}

/** Schedule an extra class without opening it. Meet link + code can come later. */
export async function scheduleSession(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const f = readSessionForm(formData);
  if (!f.batchId) return { error: "Pick an intake first." };
  if (!f.title || !f.scheduledAt) return { error: "Title and time are required." };
  await sql`
    INSERT INTO sessions (batch_id, title, scheduled_at, meet_link, code, is_open)
    VALUES (${f.batchId}, ${f.title}, ${f.scheduledAt}, ${f.meetLink}, ${f.code}, false)
  `;
  revalidatePath("/admin");
  return {};
}

/**
 * Close the open session. Every actively enrolled student of its intake with no
 * attendance row is marked absent. No fine — absences only lower the progress score.
 */
export async function closeSession(sessionId: number): Promise<{ error?: string }> {
  await assertAdmin();
  const open = (await sql`
    SELECT id FROM sessions WHERE id = ${sessionId} AND is_open = true LIMIT 1
  `) as { id: number }[];
  if (!open[0]) return { error: "Session is not open." };

  await sql`
    INSERT INTO attendance (student_id, session_id, status)
    SELECT e.student_id, s.id, 'absent'
    FROM sessions s
    JOIN enrollments e ON e.batch_id = s.batch_id AND e.status = 'active'
    WHERE s.id = ${sessionId}
    ON CONFLICT (student_id, session_id) DO NOTHING
  `;
  await sql`UPDATE sessions SET is_open = false, closed_at = now() WHERE id = ${sessionId}`;
  revalidatePath("/admin");
  return {};
}

/**
 * Start a scheduled session so students can check in. It needs a Meet link and
 * code first. Closes any other open session and restarts the check-in window.
 */
export async function openSession(sessionId: number): Promise<{ error?: string }> {
  await assertAdmin();
  const rows = (await sql`
    SELECT meet_link, code FROM sessions WHERE id = ${sessionId}
  `) as { meet_link: string; code: string }[];
  if (!rows[0]) return { error: "Class not found." };
  if (!rows[0].meet_link.trim() || !rows[0].code.trim()) {
    return { error: "Add the Meet link and today's code (Edit) before starting this class." };
  }
  await sql`UPDATE sessions SET is_open = false, closed_at = now() WHERE is_open = true`;
  await sql`
    UPDATE sessions SET is_open = true, closed_at = NULL, created_at = now()
    WHERE id = ${sessionId}
  `;
  revalidatePath("/admin");
  return {};
}

/** Edit a session's details (title, time, meet link, code). */
export async function updateSession(
  sessionId: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const f = readSessionForm(formData);
  if (!f.title || !f.scheduledAt) return { error: "Title and time are required." };
  try {
    await sql`
      UPDATE sessions
      SET title = ${f.title}, scheduled_at = ${f.scheduledAt}, meet_link = ${f.meetLink}, code = ${f.code}
      WHERE id = ${sessionId}
    `;
  } catch (e) {
    return { error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save session." };
  }
  revalidatePath("/admin");
  return {};
}

/** Delete a session; its attendance rows cascade. */
export async function deleteSession(sessionId: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
  } catch (e) {
    return { error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete session." };
  }
  revalidatePath("/admin");
  return {};
}

/** Manually set (or clear) one student's attendance for a class. */
export async function setAttendance(
  sessionId: number,
  studentId: number,
  status: "present" | "absent" | "excused" | "none"
): Promise<{ error?: string }> {
  await assertAdmin();
  if (status === "none") {
    await sql`DELETE FROM attendance WHERE session_id = ${sessionId} AND student_id = ${studentId}`;
  } else {
    await sql`
      INSERT INTO attendance (student_id, session_id, status)
      VALUES (${studentId}, ${sessionId}, ${status})
      ON CONFLICT (student_id, session_id) DO UPDATE SET status = ${status}
    `;
  }
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Login logs (user activity tracking)
// ---------------------------------------------------------------------------
export type LoginLogRow = {
  id: number;
  student_id: number | null;
  role: string;
  name: string | null;
  email: string | null;
  ip: string | null;
  user_agent: string | null;
  is_pwa: boolean;
  created_at: string;
};

export async function getLoginLogs(limit = 200): Promise<LoginLogRow[]> {
  await assertAdmin();
  const rows = (await sql`
    SELECT id, student_id, role, name, email, ip, user_agent, is_pwa, created_at
    FROM login_logs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as (Omit<LoginLogRow, "created_at"> & { created_at: Date })[];
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at) }));
}

export async function clearLoginLogs(): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM login_logs`;
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Student questions (Q&A)
// ---------------------------------------------------------------------------
export type QuestionRow = {
  id: number;
  student_id: number;
  student_name: string;
  student_email: string | null;
  subject: string | null;
  body: string;
  status: "open" | "resolved";
  answer: string | null;
  created_at: string;
  answered_at: string | null;
};

export async function getQuestions(): Promise<QuestionRow[]> {
  await assertAdmin();
  const rows = (await sql`
    SELECT
      q.id, q.student_id,
      s.name  AS student_name,
      s.email AS student_email,
      q.subject, q.body, q.status, q.answer, q.created_at, q.answered_at
    FROM questions q
    JOIN students s ON s.id = q.student_id
    ORDER BY (q.status = 'open') DESC, q.created_at DESC
  `) as (Omit<QuestionRow, "created_at" | "answered_at"> & { created_at: Date; answered_at: Date | null })[];
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at), answered_at: isoOrNull(r.answered_at) }));
}

export async function answerQuestion(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) return { error: "Write a reply first." };
  try {
    const rows = (await sql`
      UPDATE questions
      SET answer = ${answer}, status = 'resolved', answered_at = now()
      WHERE id = ${id}
      RETURNING student_id, subject, body
    `) as { student_id: number; subject: string | null; body: string }[];

    const q = rows[0];
    if (q?.student_id) {
      notifyStudent(q.student_id, {
        title: "Your question was answered!",
        body: q.subject ? `Re: ${q.subject} — ${answer.slice(0, 80)}` : answer.slice(0, 100),
        url: "/portal",
      }).catch(() => {});
    }
  } catch (e) {
    return { error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save reply." };
  }
  revalidatePath("/admin");
  return {};
}

export async function setQuestionStatus(
  id: number,
  status: "open" | "resolved"
): Promise<void> {
  await assertAdmin();
  if (status === "resolved") {
    await sql`
      UPDATE questions
      SET status = 'resolved', answered_at = COALESCE(answered_at, now())
      WHERE id = ${id}
    `;
  } else {
    await sql`UPDATE questions SET status = 'open', answered_at = NULL WHERE id = ${id}`;
  }
  revalidatePath("/admin");
}

export async function deleteQuestion(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM questions WHERE id = ${id}`;
  } catch (e) {
    return { error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete question." };
  }
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Leave requests (students ask for leave from a class; approved = excused)
// ---------------------------------------------------------------------------
export type LeaveRow = {
  id: number;
  student_id: number;
  student_name: string;
  student_email: string | null;
  lesson_title: string | null;
  lesson_at: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function getLeaveRequests(): Promise<LeaveRow[]> {
  await assertAdmin();
  const rows = (await sql`
    SELECT
      l.id, l.student_id,
      s.name  AS student_name,
      s.email AS student_email,
      l.lesson_title, l.lesson_at, l.reason, l.status, l.feedback,
      l.created_at, l.reviewed_at
    FROM leave_requests l
    JOIN students s ON s.id = l.student_id
    ORDER BY (l.status = 'pending') DESC, l.created_at DESC
  `) as (Omit<LeaveRow, "lesson_at" | "created_at" | "reviewed_at"> & {
    lesson_at: Date | null;
    created_at: Date;
    reviewed_at: Date | null;
  })[];
  return rows.map((r) => ({
    ...r,
    lesson_at: isoOrNull(r.lesson_at),
    created_at: iso(r.created_at),
    reviewed_at: isoOrNull(r.reviewed_at),
  }));
}

/**
 * Approve / reject a leave request (or keep it pending with feedback). An
 * approved leave marks the student "excused" for that class so it does not
 * count against their attendance; undoing the approval removes the excuse.
 */
export async function reviewLeaveRequest(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const status = String(formData.get("status") ?? "").trim();
  const feedback = String(formData.get("feedback") ?? "").trim();

  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return { error: "Pick approve or reject." };
  }

  try {
    const rows = (await sql`
      UPDATE leave_requests
      SET status = ${status},
          feedback = ${feedback || null},
          reviewed_at = CASE WHEN ${status} = 'pending' THEN NULL ELSE now() END
      WHERE id = ${id}
      RETURNING student_id, session_id, lesson_title
    `) as { student_id: number; session_id: number | null; lesson_title: string | null }[];

    const l = rows[0];
    if (l?.session_id) {
      if (status === "approved") {
        await sql`
          INSERT INTO attendance (student_id, session_id, status)
          VALUES (${l.student_id}, ${l.session_id}, 'excused')
          ON CONFLICT (student_id, session_id)
          DO UPDATE SET status = 'excused' WHERE attendance.status <> 'present'
        `;
      } else {
        // Undo an earlier excuse: back to absent if the class already happened.
        await sql`
          UPDATE attendance a SET status = 'absent'
          FROM sessions s
          WHERE a.session_id = s.id AND s.id = ${l.session_id}
            AND a.student_id = ${l.student_id} AND a.status = 'excused'
            AND s.closed_at IS NOT NULL
        `;
        await sql`
          DELETE FROM attendance
          WHERE session_id = ${l.session_id} AND student_id = ${l.student_id} AND status = 'excused'
        `;
      }
    }

    if (l?.student_id && status !== "pending") {
      const lesson = l.lesson_title ? ` for ${l.lesson_title}` : "";
      notifyStudent(l.student_id, {
        title: status === "approved" ? "Leave approved ✅" : "Leave rejected ❌",
        body:
          `Your leave request${lesson} was ${status}.` +
          (feedback ? ` Note: ${feedback.slice(0, 80)}` : ""),
        url: "/portal",
      }).catch(() => {});
    }
  } catch (e) {
    return { error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save review." };
  }
  revalidatePath("/admin");
  return {};
}

export async function deleteLeaveRequest(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM leave_requests WHERE id = ${id}`;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete leave request.",
    };
  }
  revalidatePath("/admin");
  return {};
}
