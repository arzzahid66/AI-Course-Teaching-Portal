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
import { MISSED_CLASS_PENALTY, MISSED_CLASS_REASON } from "@/lib/constants";

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
  setAdminCookie();
  revalidatePath("/admin");
  return {};
}

export async function adminLogout(): Promise<void> {
  clearAdminCookie();
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
export type StudentRow = {
  id: number;
  name: string;
  whatsapp: string | null;
  gender: string | null;
  email: string | null;
  has_login: boolean;
  status: string;
  balance: number;
};

export async function getStudents(): Promise<StudentRow[]> {
  assertAdmin();
  const rows = (await sql`
    SELECT
      s.id, s.name, s.whatsapp, s.gender, s.email,
      (s.password_hash IS NOT NULL) AS has_login,
      s.status,
      COALESCE(
        (SELECT SUM(CASE WHEN l.type = 'penalty' THEN l.amount ELSE -l.amount END)
         FROM ledger l WHERE l.student_id = s.id), 0
      ) AS balance
    FROM students s
    ORDER BY s.created_at DESC, s.id DESC
  `) as (Omit<StudentRow, "balance"> & { balance: string })[];
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

export async function addStudent(formData: FormData): Promise<{ error?: string }> {
  assertAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name) return { error: "Name is required." };
  if (email && password.length < 4) {
    return { error: "Password must be at least 4 characters." };
  }

  const passwordHash = email && password ? hashPassword(password) : null;
  try {
    await sql`
      INSERT INTO students (name, whatsapp, gender, token, email, password_hash)
      VALUES (
        ${name}, ${whatsapp || null}, ${gender || null},
        ${generateStudentToken()}, ${email || null}, ${passwordHash}
      )
    `;
  } catch {
    return { error: "Could not add student. Is that email already used?" };
  }
  revalidatePath("/admin");
  return {};
}

/** Give an existing student (or change) a login email + password. */
export async function setStudentCredentials(
  studentId: number,
  email: string,
  password: string
): Promise<{ error?: string }> {
  assertAdmin();
  const e = email.trim().toLowerCase();
  if (!e) return { error: "Email is required." };
  if (password.length < 4) return { error: "Password must be at least 4 characters." };
  try {
    await sql`
      UPDATE students
      SET email = ${e}, password_hash = ${hashPassword(password)}
      WHERE id = ${studentId}
    `;
  } catch {
    return { error: "Could not save. Is that email already used by another student?" };
  }
  revalidatePath("/admin");
  return {};
}

/**
 * Bulk create from lines of "name, whatsapp, gender, email, password".
 * Only name is required; email+password together enable a login.
 */
export async function bulkAddStudents(formData: FormData): Promise<{ created: number; error?: string }> {
  assertAdmin();
  const raw = String(formData.get("bulk") ?? "");
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let created = 0;
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const name = parts[0];
    if (!name) continue;
    const whatsapp = parts[1] || null;
    const gender = parts[2] || null;
    const email = (parts[3] || "").toLowerCase() || null;
    const password = parts[4] || "";
    const passwordHash = email && password ? hashPassword(password) : null;
    try {
      await sql`
        INSERT INTO students (name, whatsapp, gender, token, email, password_hash)
        VALUES (${name}, ${whatsapp}, ${gender}, ${generateStudentToken()}, ${email}, ${passwordHash})
      `;
      created += 1;
    } catch {
      // skip duplicates / bad rows, keep going
    }
  }
  revalidatePath("/admin");
  return { created };
}

export async function setStudentStatus(
  studentId: number,
  status: "active" | "inactive"
): Promise<void> {
  assertAdmin();
  await sql`UPDATE students SET status = ${status} WHERE id = ${studentId}`;
  revalidatePath("/admin");
}

/** Update a student's basic details (name, whatsapp, gender). */
export async function updateStudent(
  studentId: number,
  formData: FormData
): Promise<{ error?: string }> {
  assertAdmin();
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

/**
 * Permanently delete a student AND all their records (attendance, ledger,
 * assignment statuses). Destructive — the UI confirms first. Children are
 * removed before the student to satisfy foreign keys.
 */
export async function deleteStudent(studentId: number): Promise<{ error?: string }> {
  assertAdmin();
  try {
    await sql`DELETE FROM assignment_status WHERE student_id = ${studentId}`;
    await sql`DELETE FROM attendance WHERE student_id = ${studentId}`;
    await sql`DELETE FROM ledger WHERE student_id = ${studentId}`;
    await sql`DELETE FROM students WHERE id = ${studentId}`;
  } catch (e) {
    return {
      error:
        e instanceof Error
          ? `Could not delete: ${e.message}`
          : "Could not delete student.",
    };
  }
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export type SessionRow = {
  id: number;
  title: string;
  scheduled_at: string;
  meet_link: string;
  code: string;
  is_open: boolean;
  closed_at: string | null;
};

export type AttendeeRow = {
  student_id: number;
  name: string;
  email: string | null;
  present: boolean;
};

export async function getOpenSessionWithAttendance(): Promise<{
  session: SessionRow | null;
  attendees: AttendeeRow[];
}> {
  assertAdmin();
  const sessions = (await sql`
    SELECT id, title, scheduled_at, meet_link, code, is_open, closed_at
    FROM sessions WHERE is_open = true
    ORDER BY created_at DESC LIMIT 1
  `) as SessionRow[];
  const session = sessions[0] ?? null;
  if (!session) return { session: null, attendees: [] };

  const attendees = (await sql`
    SELECT
      s.id AS student_id,
      s.name,
      s.email,
      (a.id IS NOT NULL AND a.status = 'present') AS present
    FROM students s
    LEFT JOIN attendance a
      ON a.student_id = s.id AND a.session_id = ${session.id}
    WHERE s.status = 'active'
    ORDER BY present DESC, s.name ASC
  `) as AttendeeRow[];

  return { session, attendees };
}

export async function getRecentSessions(): Promise<SessionRow[]> {
  assertAdmin();
  return (await sql`
    SELECT id, title, scheduled_at, meet_link, code, is_open, closed_at
    FROM sessions
    ORDER BY created_at DESC
    LIMIT 20
  `) as SessionRow[];
}

export async function createSession(formData: FormData): Promise<{ error?: string }> {
  assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const scheduledAt = String(formData.get("scheduled_at") ?? "").trim();
  const meetLink = String(formData.get("meet_link") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!title || !scheduledAt || !meetLink || !code) {
    return { error: "All fields are required." };
  }

  // Only one open session at a time: close any existing open one first.
  await sql`UPDATE sessions SET is_open = false, closed_at = now() WHERE is_open = true`;

  await sql`
    INSERT INTO sessions (title, scheduled_at, meet_link, code, is_open)
    VALUES (${title}, ${scheduledAt}, ${meetLink}, ${code}, true)
  `;
  revalidatePath("/admin");
  return {};
}

/**
 * Close the open session and penalize every active student who has no
 * attendance row for it: insert an 'absent' attendance row + a Rs 200 penalty.
 */
export async function closeSession(sessionId: number): Promise<{ error?: string }> {
  assertAdmin();

  const open = (await sql`
    SELECT id FROM sessions WHERE id = ${sessionId} AND is_open = true LIMIT 1
  `) as { id: number }[];
  if (!open[0]) return { error: "Session is not open." };

  // Mark every active student without an attendance row as 'absent'.
  await sql`
    INSERT INTO attendance (student_id, session_id, status)
    SELECT s.id, ${sessionId}, 'absent'
    FROM students s
    WHERE s.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.student_id = s.id AND a.session_id = ${sessionId}
      )
  `;

  // Add a penalty for each newly-absent student (those with status 'absent'
  // for this session who don't already have a penalty for it).
  await sql`
    INSERT INTO ledger (student_id, type, amount, reason, session_id)
    SELECT a.student_id, 'penalty', ${MISSED_CLASS_PENALTY}, ${MISSED_CLASS_REASON}, ${sessionId}
    FROM attendance a
    WHERE a.session_id = ${sessionId}
      AND a.status = 'absent'
      AND NOT EXISTS (
        SELECT 1 FROM ledger l
        WHERE l.student_id = a.student_id
          AND l.session_id = ${sessionId}
          AND l.type = 'penalty'
      )
  `;

  await sql`UPDATE sessions SET is_open = false, closed_at = now() WHERE id = ${sessionId}`;
  revalidatePath("/admin");
  return {};
}

/**
 * Schedule a future class WITHOUT opening it. Students see a countdown to it
 * but can't check in until the tutor starts it. Does not touch the live
 * session (you can schedule next week's class while today's is still open).
 */
export async function scheduleSession(formData: FormData): Promise<{ error?: string }> {
  assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const scheduledAt = String(formData.get("scheduled_at") ?? "").trim();
  const meetLink = String(formData.get("meet_link") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!title || !scheduledAt || !meetLink || !code) {
    return { error: "All fields are required." };
  }

  await sql`
    INSERT INTO sessions (title, scheduled_at, meet_link, code, is_open)
    VALUES (${title}, ${scheduledAt}, ${meetLink}, ${code}, false)
  `;
  revalidatePath("/admin");
  return {};
}

/**
 * Start (open) a previously scheduled session so students can check in.
 * Closes any other open session first (only one live class at a time) and
 * resets created_at to now() so the check-in window starts at the real start.
 */
export async function openSession(sessionId: number): Promise<{ error?: string }> {
  assertAdmin();
  await sql`UPDATE sessions SET is_open = false, closed_at = now() WHERE is_open = true`;
  await sql`
    UPDATE sessions
    SET is_open = true, closed_at = NULL, created_at = now()
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
  assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const scheduledAt = String(formData.get("scheduled_at") ?? "").trim();
  const meetLink = String(formData.get("meet_link") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  if (!title || !scheduledAt || !meetLink || !code) {
    return { error: "All fields are required." };
  }

  try {
    await sql`
      UPDATE sessions
      SET title = ${title}, scheduled_at = ${scheduledAt}, meet_link = ${meetLink}, code = ${code}
      WHERE id = ${sessionId}
    `;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save session.",
    };
  }
  revalidatePath("/admin");
  return {};
}

/**
 * Permanently delete a session AND its attendance rows + any penalties that
 * were charged for it (so balances stay correct). Destructive — UI confirms.
 */
export async function deleteSession(sessionId: number): Promise<{ error?: string }> {
  assertAdmin();
  try {
    await sql`DELETE FROM ledger WHERE session_id = ${sessionId}`;
    await sql`DELETE FROM attendance WHERE session_id = ${sessionId}`;
    await sql`DELETE FROM sessions WHERE id = ${sessionId}`;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete session.",
    };
  }
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export async function recordPayment(formData: FormData): Promise<{ error?: string }> {
  assertAdmin();
  const studentId = Number(formData.get("student_id"));
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "Payment received").trim();

  if (!studentId || Number.isNaN(studentId)) return { error: "Pick a student." };
  if (!amount || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter a positive amount." };
  }

  await sql`
    INSERT INTO ledger (student_id, type, amount, reason)
    VALUES (${studentId}, 'payment', ${amount}, ${reason || "Payment received"})
  `;
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Topics (curriculum roadmap)
// ---------------------------------------------------------------------------
export type TopicRow = {
  id: number;
  title: string;
  description: string | null;
  planned_at: string | null;
  is_covered: boolean;
};

export async function getTopics(): Promise<TopicRow[]> {
  assertAdmin();
  return (await sql`
    SELECT id, title, description, planned_at, is_covered
    FROM topics
    ORDER BY COALESCE(planned_at, created_at) ASC
  `) as TopicRow[];
}

export async function createTopic(formData: FormData): Promise<{ error?: string }> {
  assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const plannedAt = String(formData.get("planned_at") ?? "").trim();
  if (!title) return { error: "Title is required." };

  await sql`
    INSERT INTO topics (title, description, planned_at)
    VALUES (${title}, ${description || null}, ${plannedAt || null})
  `;
  revalidatePath("/admin");
  return {};
}

export async function setTopicCovered(id: number, covered: boolean): Promise<void> {
  assertAdmin();
  await sql`UPDATE topics SET is_covered = ${covered} WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function deleteTopic(id: number): Promise<void> {
  assertAdmin();
  await sql`DELETE FROM topics WHERE id = ${id}`;
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------
export type AssignmentRow = {
  id: number;
  title: string;
  description: string | null;
  due_at: string | null;
};

export type AssignmentStudent = {
  id: number;
  name: string;
  email: string | null;
  whatsapp: string | null;
};

export type AssignmentMatrix = {
  assignments: AssignmentRow[];
  students: AssignmentStudent[];
  // doneMap[`${assignmentId}:${studentId}`] === true when done
  done: Record<string, boolean>;
};

export async function createAssignment(formData: FormData): Promise<{ error?: string }> {
  assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueAt = String(formData.get("due_at") ?? "").trim();
  if (!title) return { error: "Title is required." };

  await sql`
    INSERT INTO assignments (title, description, due_at)
    VALUES (${title}, ${description || null}, ${dueAt || null})
  `;
  revalidatePath("/admin");
  return {};
}

export async function updateAssignment(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const dueAt = String(formData.get("due_at") ?? "").trim();
  if (!title) return { error: "Title is required." };

  try {
    await sql`
      UPDATE assignments
      SET title = ${title}, description = ${description || null}, due_at = ${dueAt || null}
      WHERE id = ${id}
    `;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save assignment.",
    };
  }
  revalidatePath("/admin");
  return {};
}

export async function deleteAssignment(id: number): Promise<{ error?: string }> {
  assertAdmin();
  try {
    // assignment_status rows cascade on delete (see schema), so removing the
    // assignment is enough.
    await sql`DELETE FROM assignments WHERE id = ${id}`;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete assignment.",
    };
  }
  revalidatePath("/admin");
  return {};
}

export async function getAssignmentMatrix(): Promise<AssignmentMatrix> {
  assertAdmin();
  const assignments = (await sql`
    SELECT id, title, description, due_at
    FROM assignments
    ORDER BY COALESCE(due_at, created_at) DESC
  `) as AssignmentRow[];

  const students = (await sql`
    SELECT id, name, email, whatsapp FROM students WHERE status = 'active' ORDER BY name ASC
  `) as AssignmentStudent[];

  const statuses = (await sql`
    SELECT assignment_id, student_id, status FROM assignment_status WHERE status = 'done'
  `) as { assignment_id: number; student_id: number; status: string }[];

  const done: Record<string, boolean> = {};
  for (const s of statuses) {
    done[`${s.assignment_id}:${s.student_id}`] = true;
  }

  return { assignments, students, done };
}

export async function setAssignmentStatus(
  assignmentId: number,
  studentId: number,
  status: "done" | "pending"
): Promise<void> {
  assertAdmin();
  await sql`
    INSERT INTO assignment_status (assignment_id, student_id, status, updated_at)
    VALUES (${assignmentId}, ${studentId}, ${status}, now())
    ON CONFLICT (assignment_id, student_id)
    DO UPDATE SET status = ${status}, updated_at = now()
  `;
  revalidatePath("/admin");
}

// ---------------------------------------------------------------------------
// Per-student detail (admin progress view)
// ---------------------------------------------------------------------------
export type StudentDetail = {
  id: number;
  name: string;
  email: string | null;
  balance: number;
  attendance: { title: string; scheduled_at: string; status: string }[];
  ledger: {
    id: number;
    type: string;
    amount: number;
    reason: string | null;
    created_at: string;
    session_title: string | null;
    session_scheduled_at: string | null;
  }[];
  assignments: { title: string; status: "pending" | "done" }[];
};

export async function getStudentDetail(studentId: number): Promise<StudentDetail> {
  assertAdmin();
  const base = (await sql`
    SELECT s.id, s.name, s.email,
      COALESCE(
        (SELECT SUM(CASE WHEN l.type = 'penalty' THEN l.amount ELSE -l.amount END)
         FROM ledger l WHERE l.student_id = s.id), 0
      ) AS balance
    FROM students s WHERE s.id = ${studentId} LIMIT 1
  `) as { id: number; name: string; email: string | null; balance: string }[];

  const attendance = (await sql`
    SELECT s.title, s.scheduled_at, a.status
    FROM attendance a JOIN sessions s ON s.id = a.session_id
    WHERE a.student_id = ${studentId}
    ORDER BY s.scheduled_at DESC LIMIT 50
  `) as { title: string; scheduled_at: string; status: string }[];

  const ledger = (await sql`
    SELECT
      l.id, l.type, l.amount, l.reason, l.created_at,
      s.title AS session_title,
      s.scheduled_at AS session_scheduled_at
    FROM ledger l
    LEFT JOIN sessions s ON s.id = l.session_id
    WHERE l.student_id = ${studentId}
    ORDER BY l.created_at DESC LIMIT 50
  `) as {
    id: number;
    type: string;
    amount: string;
    reason: string | null;
    created_at: string;
    session_title: string | null;
    session_scheduled_at: string | null;
  }[];

  const assignments = (await sql`
    SELECT a.title, COALESCE(st.status, 'pending') AS status
    FROM assignments a
    LEFT JOIN assignment_status st
      ON st.assignment_id = a.id AND st.student_id = ${studentId}
    ORDER BY COALESCE(a.due_at, a.created_at) DESC
  `) as { title: string; status: "pending" | "done" }[];

  const row = base[0];
  return {
    id: row?.id ?? studentId,
    name: row?.name ?? "",
    email: row?.email ?? null,
    balance: Number(row?.balance ?? 0),
    attendance,
    ledger: ledger.map((l) => ({ ...l, amount: Number(l.amount) })),
    assignments,
  };
}

/** Edit a single fee/payment ledger entry (type, amount, reason). */
export async function updateLedgerEntry(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  assertAdmin();
  const type = String(formData.get("type") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const reason = String(formData.get("reason") ?? "").trim();

  if (type !== "penalty" && type !== "payment") {
    return { error: "Type must be a fee or a payment." };
  }
  if (!amount || Number.isNaN(amount) || amount <= 0) {
    return { error: "Enter a positive amount." };
  }

  try {
    await sql`
      UPDATE ledger
      SET type = ${type}, amount = ${amount}, reason = ${reason || null}
      WHERE id = ${id}
    `;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save entry.",
    };
  }
  revalidatePath("/admin");
  return {};
}

/** Permanently delete a single fee/payment ledger entry. */
export async function deleteLedgerEntry(id: number): Promise<{ error?: string }> {
  assertAdmin();
  try {
    await sql`DELETE FROM ledger WHERE id = ${id}`;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete entry.",
    };
  }
  revalidatePath("/admin");
  return {};
}
