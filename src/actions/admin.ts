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
import { recordLoginLog } from "@/lib/loginLog";

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
  await assertAdmin();
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
  await assertAdmin();
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
  const passwordPlain = email && password ? password : null;
  try {
    await sql`
      INSERT INTO students (name, whatsapp, gender, token, email, password_hash, password_plain)
      VALUES (
        ${name}, ${whatsapp || null}, ${gender || null},
        ${generateStudentToken()}, ${email || null}, ${passwordHash}, ${passwordPlain}
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

/**
 * Bulk create from lines of "name, whatsapp, gender, email, password".
 * Only name is required; email+password together enable a login.
 */
export async function bulkAddStudents(formData: FormData): Promise<{ created: number; error?: string }> {
  await assertAdmin();
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
    const passwordPlain = email && password ? password : null;
    try {
      await sql`
        INSERT INTO students (name, whatsapp, gender, token, email, password_hash, password_plain)
        VALUES (${name}, ${whatsapp}, ${gender}, ${generateStudentToken()}, ${email}, ${passwordHash}, ${passwordPlain})
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

/**
 * Permanently delete a student AND all their records (attendance, ledger,
 * assignment statuses). Destructive — the UI confirms first. Children are
 * removed before the student to satisfy foreign keys.
 */
export async function deleteStudent(studentId: number): Promise<{ error?: string }> {
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
  return (await sql`
    SELECT id, title, scheduled_at, meet_link, code, is_open, closed_at
    FROM sessions
    ORDER BY created_at DESC
    LIMIT 20
  `) as SessionRow[];
}

export async function createSession(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
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
  await assertAdmin();

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
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
  return (await sql`
    SELECT id, title, description, planned_at, is_covered
    FROM topics
    ORDER BY COALESCE(planned_at, created_at) ASC
  `) as TopicRow[];
}

export async function createTopic(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
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

export async function updateTopic(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const plannedAt = String(formData.get("planned_at") ?? "").trim();
  if (!title) return { error: "Title is required." };

  await sql`
    UPDATE topics
    SET title = ${title},
        description = ${description || null},
        planned_at = ${plannedAt || null}
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
  return {};
}

export async function setTopicCovered(id: number, covered: boolean): Promise<void> {
  await assertAdmin();
  await sql`UPDATE topics SET is_covered = ${covered} WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function deleteTopic(id: number): Promise<void> {
  await assertAdmin();
  await sql`DELETE FROM topics WHERE id = ${id}`;
  revalidatePath("/admin");
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
  return (await sql`
    SELECT id, student_id, role, name, email, ip, user_agent, is_pwa, created_at
    FROM login_logs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as LoginLogRow[];
}

export async function clearLoginLogs(): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM login_logs`;
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Curriculum (course roadmap) — weeks with Part A / Part B + outcomes
// ---------------------------------------------------------------------------
export type CurriculumWeekRow = {
  id: number;
  sort_order: number;
  title: string;
  part_a: string | null;
  part_b: string | null;
};

export type OutcomeRow = {
  id: number;
  sort_order: number;
  body: string;
};

export async function getCurriculum(): Promise<CurriculumWeekRow[]> {
  await assertAdmin();
  return (await sql`
    SELECT id, sort_order, title, part_a, part_b
    FROM curriculum_weeks
    ORDER BY sort_order ASC, id ASC
  `) as CurriculumWeekRow[];
}

export async function createCurriculumWeek(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const partA = String(formData.get("part_a") ?? "").trim();
  const partB = String(formData.get("part_b") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order"));
  if (!title) return { error: "Title is required." };

  await sql`
    INSERT INTO curriculum_weeks (sort_order, title, part_a, part_b)
    VALUES (${Number.isNaN(sortOrder) ? 0 : sortOrder}, ${title}, ${partA || null}, ${partB || null})
  `;
  revalidatePath("/admin");
  return {};
}

export async function updateCurriculumWeek(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const partA = String(formData.get("part_a") ?? "").trim();
  const partB = String(formData.get("part_b") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order"));
  if (!title) return { error: "Title is required." };

  try {
    await sql`
      UPDATE curriculum_weeks
      SET sort_order = ${Number.isNaN(sortOrder) ? 0 : sortOrder},
          title = ${title}, part_a = ${partA || null}, part_b = ${partB || null}
      WHERE id = ${id}
    `;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save week.",
    };
  }
  revalidatePath("/admin");
  return {};
}

export async function deleteCurriculumWeek(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM curriculum_weeks WHERE id = ${id}`;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete week.",
    };
  }
  revalidatePath("/admin");
  return {};
}

export async function getOutcomes(): Promise<OutcomeRow[]> {
  await assertAdmin();
  return (await sql`
    SELECT id, sort_order, body
    FROM course_outcomes
    ORDER BY sort_order ASC, id ASC
  `) as OutcomeRow[];
}

export async function createOutcome(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const body = String(formData.get("body") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order"));
  if (!body) return { error: "Write the outcome first." };

  await sql`
    INSERT INTO course_outcomes (sort_order, body)
    VALUES (${Number.isNaN(sortOrder) ? 0 : sortOrder}, ${body})
  `;
  revalidatePath("/admin");
  return {};
}

export async function updateOutcome(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const body = String(formData.get("body") ?? "").trim();
  const sortOrder = Number(formData.get("sort_order"));
  if (!body) return { error: "Write the outcome first." };

  try {
    await sql`
      UPDATE course_outcomes
      SET sort_order = ${Number.isNaN(sortOrder) ? 0 : sortOrder}, body = ${body}
      WHERE id = ${id}
    `;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save outcome.",
    };
  }
  revalidatePath("/admin");
  return {};
}

export async function deleteOutcome(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM course_outcomes WHERE id = ${id}`;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete outcome.",
    };
  }
  revalidatePath("/admin");
  return {};
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
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
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
  await assertAdmin();
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
  password: string | null;
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
  await assertAdmin();
  const base = (await sql`
    SELECT s.id, s.name, s.email, s.password_plain,
      COALESCE(
        (SELECT SUM(CASE WHEN l.type = 'penalty' THEN l.amount ELSE -l.amount END)
         FROM ledger l WHERE l.student_id = s.id), 0
      ) AS balance
    FROM students s WHERE s.id = ${studentId} LIMIT 1
  `) as {
    id: number;
    name: string;
    email: string | null;
    password_plain: string | null;
    balance: string;
  }[];

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
    password: row?.password_plain ?? null,
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
  await assertAdmin();
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
  await assertAdmin();
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

// ---------------------------------------------------------------------------
// Dashboard stats (aggregates for the charts)
// ---------------------------------------------------------------------------
export type DashboardStats = {
  students: { total: number; active: number; inactive: number };
  money: { outstanding: number; penalties: number; payments: number };
  attendance: { title: string; scheduled_at: string; present: number; absent: number }[];
  assignments: { title: string; done: number; total: number }[];
  topDebtors: { name: string; balance: number }[];
};

/** A fully-zeroed stats object — what the dashboard falls back to on any error. */
function emptyDashboardStats(): DashboardStats {
  return {
    students: { total: 0, active: 0, inactive: 0 },
    money: { outstanding: 0, penalties: 0, payments: 0 },
    attendance: [],
    assignments: [],
    topDebtors: [],
  };
}

/**
 * Run a single dashboard query and never throw: on any error (e.g. a missing
 * table on a half-migrated database, or a transient connection drop) we log it
 * server-side and return `fallback` so one bad query can't take down the whole
 * dashboard render. This is what keeps the page from showing the opaque
 * "An error occurred in the Server Components render" message in production.
 */
async function safeQuery<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (e) {
    console.error(`[dashboard] ${label} query failed:`, e);
    return fallback;
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await assertAdmin();

  const studentRows = await safeQuery(
    "students",
    async () =>
      (await sql`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'active') AS active
        FROM students
      `) as { total: string; active: string }[],
    [] as { total: string; active: string }[]
  );
  const total = Number(studentRows[0]?.total ?? 0);
  const active = Number(studentRows[0]?.active ?? 0);

  const moneyRows = await safeQuery(
    "money",
    async () =>
      (await sql`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE type = 'penalty'), 0) AS penalties,
          COALESCE(SUM(amount) FILTER (WHERE type = 'payment'), 0) AS payments
        FROM ledger
      `) as { penalties: string; payments: string }[],
    [] as { penalties: string; payments: string }[]
  );

  const outstandingRows = await safeQuery(
    "outstanding",
    async () =>
      (await sql`
        SELECT COALESCE(SUM(CASE WHEN bal > 0 THEN bal ELSE 0 END), 0) AS outstanding
        FROM (
          SELECT student_id,
            SUM(CASE WHEN type = 'penalty' THEN amount ELSE -amount END) AS bal
          FROM ledger GROUP BY student_id
        ) t
      `) as { outstanding: string }[],
    [] as { outstanding: string }[]
  );

  const attendanceRows = await safeQuery(
    "attendance",
    async () =>
      (await sql`
        SELECT s.title, s.scheduled_at,
          COUNT(*) FILTER (WHERE a.status = 'present') AS present,
          COUNT(*) FILTER (WHERE a.status = 'absent') AS absent
        FROM sessions s
        LEFT JOIN attendance a ON a.session_id = s.id
        GROUP BY s.id, s.title, s.scheduled_at
        ORDER BY s.scheduled_at DESC
        LIMIT 10
      `) as { title: string; scheduled_at: string; present: string; absent: string }[],
    [] as { title: string; scheduled_at: string; present: string; absent: string }[]
  );

  const assignmentRows = await safeQuery(
    "assignments",
    async () =>
      (await sql`
        SELECT a.title,
          COUNT(st.id) FILTER (WHERE st.status = 'done') AS done
        FROM assignments a
        LEFT JOIN assignment_status st ON st.assignment_id = a.id
        GROUP BY a.id, a.title
        ORDER BY COALESCE(a.due_at, a.created_at) DESC
        LIMIT 15
      `) as { title: string; done: string }[],
    [] as { title: string; done: string }[]
  );

  const debtorRows = await safeQuery(
    "debtors",
    async () =>
      (await sql`
        SELECT s.name,
          SUM(CASE WHEN l.type = 'penalty' THEN l.amount ELSE -l.amount END) AS balance
        FROM students s JOIN ledger l ON l.student_id = s.id
        GROUP BY s.id, s.name
        HAVING SUM(CASE WHEN l.type = 'penalty' THEN l.amount ELSE -l.amount END) > 0
        ORDER BY balance DESC
        LIMIT 5
      `) as { name: string; balance: string }[],
    [] as { name: string; balance: string }[]
  );

  return {
    students: { total, active, inactive: Math.max(0, total - active) },
    money: {
      outstanding: Number(outstandingRows[0]?.outstanding ?? 0),
      penalties: Number(moneyRows[0]?.penalties ?? 0),
      payments: Number(moneyRows[0]?.payments ?? 0),
    },
    // Reverse to chronological order for the trend chart.
    attendance: attendanceRows
      .map((r) => ({
        title: r.title,
        scheduled_at: r.scheduled_at,
        present: Number(r.present),
        absent: Number(r.absent),
      }))
      .reverse(),
    assignments: assignmentRows.map((r) => ({
      title: r.title,
      done: Number(r.done),
      total: active,
    })),
    topDebtors: debtorRows.map((r) => ({ name: r.name, balance: Number(r.balance) })),
  };
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
  return (await sql`
    SELECT
      q.id, q.student_id,
      s.name  AS student_name,
      s.email AS student_email,
      q.subject, q.body, q.status, q.answer, q.created_at, q.answered_at
    FROM questions q
    JOIN students s ON s.id = q.student_id
    ORDER BY (q.status = 'open') DESC, q.created_at DESC
  `) as QuestionRow[];
}

export async function answerQuestion(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) return { error: "Write a reply first." };
  try {
    await sql`
      UPDATE questions
      SET answer = ${answer}, status = 'resolved', answered_at = now()
      WHERE id = ${id}
    `;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save reply.",
    };
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
    // Keep an existing answered_at, otherwise stamp it now.
    await sql`
      UPDATE questions
      SET status = 'resolved', answered_at = COALESCE(answered_at, now())
      WHERE id = ${id}
    `;
  } else {
    // Reopening drops the answered timestamp.
    await sql`UPDATE questions SET status = 'open', answered_at = NULL WHERE id = ${id}`;
  }
  revalidatePath("/admin");
}

export async function deleteQuestion(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM questions WHERE id = ${id}`;
  } catch (e) {
    return {
      error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete question.",
    };
  }
  revalidatePath("/admin");
  return {};
}
