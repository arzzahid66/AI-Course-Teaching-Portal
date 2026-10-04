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
import {
  createInvoicesForEnrollment,
  insertPayment,
  iso,
  isoOrNull,
  loadFeeLockedStudentIds,
  loadFreeSeatStudentIds,
  loadInvoices,
  computeBatchProgress,
  waiveEnrollmentFees,
  type InvoiceView,
  type ProgressRow,
} from "@/lib/course";
import { recordLoginLog } from "@/lib/loginLog";
import { notifyStudent } from "@/lib/pushNotifications";
import { queueStudentEmail, sendStudentEmailNow } from "@/lib/email";
import { queueWelcomeEmail, sendWelcomeEmailNow } from "@/lib/welcomeEmail";
import { queuePaymentReceiptEmail } from "@/lib/receiptEmail";

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
  /** "free" = every fee month waived; "locked" = an unpaid month past its grace period. */
  fee_state: "free" | "locked" | null;
  enrollments: StudentEnrollment[];
};

export async function getStudents(): Promise<StudentRow[]> {
  await assertAdmin();
  const students = (await sql`
    SELECT id, name, whatsapp, gender, email, (password_hash IS NOT NULL) AS has_login, status
    FROM students
    ORDER BY created_at DESC, id DESC
  `) as Omit<StudentRow, "enrollments" | "fee_state">[];
  const [locked, free] = await Promise.all([loadFeeLockedStudentIds(), loadFreeSeatStudentIds()]);
  const enrollments = (await sql`
    SELECT e.id AS enrollment_id, e.student_id, e.batch_id, b.name AS batch_name, e.status
    FROM enrollments e JOIN batches b ON b.id = e.batch_id
    ORDER BY b.start_date DESC
  `) as (StudentEnrollment & { student_id: number })[];
  return students.map((s) => ({
    ...s,
    fee_state: free.has(s.id) ? "free" : locked.has(s.id) ? "locked" : null,
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
 * Add a student, enroll them in the chosen intake, and apply their fee category:
 * "month1" / "full" record a payment straight away, "free" waives every month,
 * "none" leaves the fees unpaid. Optionally emails them a welcome message.
 */
/** Methods the receipt email may name. Kept in step with the Add student form. */
const PAYMENT_METHODS = ["EasyPaisa", "JazzCash", "Bank", "Cash"];

export async function addStudent(formData: FormData): Promise<{ error?: string; receiptNo?: string }> {
  await assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const batchId = Number(formData.get("batch_id"));
  const payNow = String(formData.get("pay_now") ?? "none");
  const method = String(formData.get("method") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (!batchId) return { error: "Pick the intake this student is joining." };
  // The method is printed in the student's receipt email, so it has to be the
  // one they actually used. It used to default to EasyPaisa silently, which
  // told bank payers the wrong thing.
  if ((payNow === "month1" || payNow === "full") && !PAYMENT_METHODS.includes(method)) {
    return { error: "Pick how the student paid." };
  }
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
  if (payNow === "free") {
    await waiveEnrollmentFees(enrollmentId);
  } else if (payNow === "month1" || payNow === "full") {
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
      if (receiptNo) await queuePaymentReceiptEmail(receiptNo);
    }
  }
  if (email && password && formData.get("send_welcome") === "on") queueWelcomeEmail(created.id);
  revalidatePath("/admin");
  return { receiptNo };
}

/**
 * Bulk create from lines of "name, whatsapp, gender, email, password, paid".
 * Everyone is enrolled into the chosen intake. The optional 6th column is
 * "full" (pays every month), "free" (every month waived) or an amount in Rs
 * (paid oldest month first).
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
    if (paid === "free") {
      await waiveEnrollmentFees(enrollmentId);
    } else if (paid) {
      const invoices = await loadInvoices({ enrollmentId });
      const due = invoices.reduce((s, i) => s + i.remaining, 0);
      const amount = paid === "full" ? due : Number(paid);
      if (amount > 0 && !Number.isNaN(amount)) {
        const payRes = await insertPayment({
          enrollmentId,
          amount: Math.min(amount, due),
          target: "auto",
          method: "EasyPaisa",
          reference: null,
          note: "Recorded in bulk import",
          paidAt: null,
        });
        if (payRes.receiptNo) await queuePaymentReceiptEmail(payRes.receiptNo);
      }
    }
    if (email && parts[4] && formData.get("send_welcome") === "on") queueWelcomeEmail(res.id);
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

/** Permanently delete a student. Enrollments, fees, payments and their other records cascade. */
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
  const free = (await sql`
    SELECT COUNT(*) > 0 AND bool_and(amount - discount <= 0) AS free
    FROM fee_invoices WHERE enrollment_id = ${enrollmentId}
  `) as { free: boolean | null }[];
  const newEnrollmentId = await enroll(rows[0].student_id, toBatchId);
  // A free seat stays free in the new intake.
  if (free[0]?.free) await waiveEnrollmentFees(newEnrollmentId);
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
    homework,
  };
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
      queueStudentEmail(q.student_id, {
        subject: q.subject ? `Re: ${q.subject}` : "Your question was answered",
        heading: "Your question was answered",
        lines: [`You asked:\n${q.subject ? `${q.subject}\n` : ""}${q.body}`, `Reply:\n${answer}`],
      });
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
// Direct email to one student (the "Email" button on student rows)
// ---------------------------------------------------------------------------
export async function sendStudentEmail(
  studentId: number,
  formData: FormData
): Promise<{ error?: string; name?: string }> {
  await assertAdmin();
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject) return { error: "Write a subject." };
  if (!message) return { error: "Write a message." };
  if (subject.length > 200) return { error: "Subject is too long." };
  if (message.length > 5000) return { error: "Message is too long (5000 characters max)." };
  return sendStudentEmailNow(studentId, { subject, heading: subject, lines: [message] });
}

// ---------------------------------------------------------------------------
// Welcome email (login details, what's on the portal, fee status)
// ---------------------------------------------------------------------------
export async function sendWelcomeEmail(studentId: number): Promise<{ error?: string }> {
  await assertAdmin();
  return sendWelcomeEmailNow(studentId);
}

/** Welcome every active student of an intake who has a login email + password. */
export async function sendWelcomeEmailToIntake(
  batchId: number
): Promise<{ error?: string; sent: number; skipped: number; failed: string[] }> {
  await assertAdmin();
  const rows = (await sql`
    SELECT s.id, s.name,
      (s.email IS NOT NULL AND btrim(s.email) <> '' AND s.password_plain IS NOT NULL) AS has_login
    FROM enrollments e JOIN students s ON s.id = e.student_id
    WHERE e.batch_id = ${batchId} AND e.status = 'active' AND s.status = 'active'
  `) as { id: number; name: string; has_login: boolean }[];
  const withLogin = rows.filter((r) => r.has_login);
  if (withLogin.length === 0) {
    return { error: "No active student in this intake has a login email and password.", sent: 0, skipped: rows.length, failed: [] };
  }
  const results = await Promise.all(withLogin.map(async (r) => ({ r, res: await sendWelcomeEmailNow(r.id) })));
  const failed = results.filter((x) => x.res.error).map((x) => `${x.r.name} (${x.res.error})`);
  return { sent: withLogin.length - failed.length, skipped: rows.length - withLogin.length, failed };
}
