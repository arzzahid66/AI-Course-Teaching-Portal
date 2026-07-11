"use server";

import { sql } from "@/lib/db";
import { requireStudentId } from "@/lib/auth";
import {
  CHECKIN_WINDOW_MIN,
  normalizeMeetLink,
  parseResourceLinks,
  type ResourceLink,
} from "@/lib/constants";
import { notifyAdmin } from "@/lib/pushNotifications";
import { getStudentQuizzes, type StudentQuiz } from "@/actions/quiz";

// ---------------------------------------------------------------------------
// Types returned to the client. The session code and Meet link are NEVER
// included until a successful check-in.
// ---------------------------------------------------------------------------
export type CheckInState =
  | { kind: "blocked"; balance: number }
  | { kind: "no-session" }
  | { kind: "present"; sessionTitle: string; meetLink: string }
  | { kind: "can-checkin"; sessionTitle: string };

export type Topic = {
  id: number;
  title: string;
  description: string | null;
  planned_at: string | null;
};

export type CurriculumWeek = {
  id: number;
  title: string;
  part_a: string | null;
  part_b: string | null;
};

export type Outcome = {
  id: number;
  body: string;
};

export type Resource = {
  id: number;
  title: string;
  description: string | null;
  videos: ResourceLink[];
  slides: ResourceLink[];
};

export type AssignmentWithStatus = {
  id: number;
  title: string;
  description: string | null;
  due_at: string | null;
  status: "pending" | "done";
};

export type AttendanceEntry = {
  title: string;
  scheduled_at: string;
  status: string;
};

export type LedgerEntry = {
  type: "penalty" | "payment" | "waiver";
  amount: number;
  reason: string | null;
  created_at: string;
};

export type NextClass = {
  title: string;
  scheduled_at: string;
};

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

export type PortalData = {
  name: string;
  email: string | null;
  balance: number;
  checkin: CheckInState;
  nextClass: NextClass | null;
  attendance: AttendanceEntry[];
  topics: { upcoming: Topic[]; past: Topic[] };
  curriculum: CurriculumWeek[];
  outcomes: Outcome[];
  resources: Resource[];
  assignments: AssignmentWithStatus[];
  ledger: LedgerEntry[];
  questions: MyQuestion[];
  leaves: LeaveRequest[];
  quizzes: StudentQuiz[];
};

export type CheckInResult =
  | { ok: true; meetLink: string }
  | { ok: false; error: string };

type SessionRow = {
  id: number;
  title: string;
  scheduled_at: string;
  meet_link: string;
  code: string;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function getBalance(studentId: number): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(
      SUM(CASE WHEN type = 'penalty' THEN amount WHEN type = 'payment' THEN -amount ELSE 0 END), 0
    ) AS balance
    FROM ledger WHERE student_id = ${studentId}
  `) as { balance: string }[];
  return Number(rows[0]?.balance ?? 0);
}

/**
 * The next scheduled-but-not-yet-started class (for the student countdown).
 * Only the title and time are exposed — never the code or Meet link.
 */
async function getNextClass(): Promise<NextClass | null> {
  const rows = (await sql`
    SELECT title, scheduled_at
    FROM sessions
    WHERE is_open = false AND closed_at IS NULL
    ORDER BY scheduled_at ASC
    LIMIT 1
  `) as NextClass[];
  return rows[0] ?? null;
}

/**
 * Like getNextClass but also returns the session id — used server-side to tie a
 * leave request to the upcoming class (and to block duplicate pending requests
 * for the same one). Never sent to the client.
 */
async function getNextClassForLeave(): Promise<{
  id: number;
  title: string;
  scheduled_at: string;
} | null> {
  const rows = (await sql`
    SELECT id, title, scheduled_at
    FROM sessions
    WHERE is_open = false AND closed_at IS NULL
    ORDER BY scheduled_at ASC
    LIMIT 1
  `) as { id: number; title: string; scheduled_at: string }[];
  return rows[0] ?? null;
}

async function getOpenSession(): Promise<SessionRow | null> {
  const rows = (await sql`
    SELECT id, title, scheduled_at, meet_link, code, created_at
    FROM sessions
    WHERE is_open = true
    ORDER BY created_at DESC
    LIMIT 1
  `) as SessionRow[];
  return rows[0] ?? null;
}

async function hasCheckedIn(studentId: number, sessionId: number): Promise<boolean> {
  const rows = (await sql`
    SELECT 1 FROM attendance
    WHERE student_id = ${studentId} AND session_id = ${sessionId} AND status = 'present'
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

async function getCheckInState(studentId: number, balance: number): Promise<CheckInState> {
  if (balance > 0) return { kind: "blocked", balance };

  const session = await getOpenSession();
  if (!session) return { kind: "no-session" };

  if (await hasCheckedIn(studentId, session.id)) {
    return {
      kind: "present",
      sessionTitle: session.title,
      meetLink: normalizeMeetLink(session.meet_link),
    };
  }
  return { kind: "can-checkin", sessionTitle: session.title };
}

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

  const balance = await getBalance(studentId);
  const checkin = await getCheckInState(studentId, balance);
  const nextClass = await getNextClass();

  const attendance = (await sql`
    SELECT s.title, s.scheduled_at, a.status
    FROM attendance a
    JOIN sessions s ON s.id = a.session_id
    WHERE a.student_id = ${studentId}
    ORDER BY s.scheduled_at DESC
    LIMIT 50
  `) as AttendanceEntry[];

  const allTopics = (await sql`
    SELECT id, title, description, planned_at, is_covered
    FROM topics
    ORDER BY COALESCE(planned_at, created_at) ASC
  `) as (Topic & { is_covered: boolean })[];
  const upcoming = allTopics.filter((t) => !t.is_covered);
  const past = allTopics.filter((t) => t.is_covered);

  // Curriculum + outcomes are non-fatal: if migration_v5 hasn't run yet the
  // tables won't exist, but that must not break the rest of the portal.
  let curriculum: CurriculumWeek[] = [];
  let outcomes: Outcome[] = [];
  try {
    curriculum = (await sql`
      SELECT id, title, part_a, part_b
      FROM curriculum_weeks
      ORDER BY sort_order ASC, id ASC
    `) as CurriculumWeek[];
    outcomes = (await sql`
      SELECT id, body
      FROM course_outcomes
      ORDER BY sort_order ASC, id ASC
    `) as Outcome[];
  } catch (e) {
    console.error("[portal] curriculum/outcomes load failed:", e);
  }

  // Library (recorded lectures + slides) is also non-fatal: the `resources`
  // table only exists once its migration has run. Each item can hold several
  // recording / slides links, stored one-per-line — parse them into arrays.
  let resources: Resource[] = [];
  try {
    const rows = (await sql`
      SELECT id, title, description, video_url, slides_url
      FROM resources
      ORDER BY sort_order ASC, id DESC
    `) as {
      id: number;
      title: string;
      description: string | null;
      video_url: string | null;
      slides_url: string | null;
    }[];
    resources = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      videos: parseResourceLinks(r.video_url),
      slides: parseResourceLinks(r.slides_url),
    }));
  } catch (e) {
    console.error("[portal] resources load failed:", e);
  }

  const assignmentsRaw = (await sql`
    SELECT
      a.id, a.title, a.description, a.due_at,
      COALESCE(st.status, 'pending') AS status
    FROM assignments a
    LEFT JOIN assignment_status st
      ON st.assignment_id = a.id AND st.student_id = ${studentId}
    ORDER BY COALESCE(a.due_at, a.created_at) ASC
  `) as AssignmentWithStatus[];

  const ledger = (await sql`
    SELECT type, amount, reason, created_at
    FROM ledger
    WHERE student_id = ${studentId}
    ORDER BY created_at DESC
    LIMIT 50
  `) as (Omit<LedgerEntry, "amount"> & { amount: string })[];

  const questions = (await sql`
    SELECT id, subject, body, status, answer, created_at, answered_at
    FROM questions
    WHERE student_id = ${studentId}
    ORDER BY created_at DESC
    LIMIT 50
  `) as MyQuestion[];

  // Leave requests are non-fatal: the `leave_requests` table only exists once
  // its migration (v10) has run — a missing table must not break the portal.
  let leaves: LeaveRequest[] = [];
  try {
    leaves = (await sql`
      SELECT id, lesson_title, lesson_at, reason, status, feedback, created_at, reviewed_at
      FROM leave_requests
      WHERE student_id = ${studentId}
      ORDER BY created_at DESC
      LIMIT 50
    `) as LeaveRequest[];
  } catch (e) {
    console.error("[portal] leaves load failed:", e);
  }

  // Quizzes are non-fatal too: the quiz_* tables only exist once migration v11
  // has run. A missing table must not break the portal.
  let quizzes: StudentQuiz[] = [];
  try {
    quizzes = await getStudentQuizzes();
  } catch (e) {
    console.error("[portal] quizzes load failed:", e);
  }

  return {
    name,
    email,
    balance,
    checkin,
    nextClass,
    attendance,
    topics: { upcoming, past },
    curriculum,
    outcomes,
    resources,
    assignments: assignmentsRaw,
    ledger: ledger.map((l) => ({ ...l, amount: Number(l.amount) })),
    questions,
    leaves,
    quizzes,
  };
}

// ---------------------------------------------------------------------------
// Request leave from the next class (student → tutor)
// ---------------------------------------------------------------------------

/**
 * Self-heal the `leave_requests` table. Migrations (v10) are applied manually in
 * Neon, so a production DB may not have this table yet — that must never crash
 * the leave flow. Creating it here (idempotent) makes the feature work even if
 * the migration was never run. Mirrors migration_v10.sql.
 */
async function ensureLeaveRequestsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS leave_requests (
      id           serial PRIMARY KEY,
      student_id   int  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      session_id   int  REFERENCES sessions(id) ON DELETE SET NULL,
      lesson_title text,
      lesson_at    timestamptz,
      reason       text NOT NULL,
      status       text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
      feedback     text,
      created_at   timestamptz NOT NULL DEFAULT now(),
      reviewed_at  timestamptz
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_leave_student ON leave_requests(student_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leave_status  ON leave_requests(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_leave_created ON leave_requests(created_at DESC)`;
}

export async function submitLeaveRequest(
  formData: FormData
): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!reason) return { error: "Please tell your tutor why you need leave." };
  if (reason.length > 1000) {
    return { error: "Reason is too long (max 1000 characters)." };
  }

  // Make sure the table exists before we touch it — a missing table would
  // otherwise throw an uncaught error and break the whole page.
  try {
    await ensureLeaveRequestsTable();
  } catch (e) {
    console.error("[portal] ensure leave_requests table failed:", e);
    return { error: "Could not send your leave request. Please try again." };
  }

  // Tie the request to the next scheduled class (if one exists) and snapshot its
  // title + time so the record stays meaningful even if the session changes.
  const next = await getNextClassForLeave();

  // Only one pending request per upcoming class — don't let a student spam it.
  if (next) {
    const dupe = (await sql`
      SELECT 1 FROM leave_requests
      WHERE student_id = ${studentId}
        AND session_id = ${next.id}
        AND status = 'pending'
      LIMIT 1
    `) as unknown[];
    if (dupe.length > 0) {
      return { error: "You already have a pending leave request for the next class." };
    }
  }

  try {
    await sql`
      INSERT INTO leave_requests (student_id, session_id, lesson_title, lesson_at, reason)
      VALUES (
        ${studentId}, ${next?.id ?? null}, ${next?.title ?? null},
        ${next?.scheduled_at ?? null}, ${reason}
      )
    `;
  } catch {
    return { error: "Could not send your leave request. Please try again." };
  }

  // Notify admin — best effort, never blocks the response.
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

  // Notify admin — best effort, never blocks the response
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

  const students = (await sql`
    SELECT status FROM students WHERE id = ${studentId} LIMIT 1
  `) as { status: string }[];
  if (!students[0]) return { ok: false, error: "Account not found." };
  if (students[0].status !== "active") {
    return { ok: false, error: "Your account is not active. Contact your tutor." };
  }

  const balance = await getBalance(studentId);
  if (balance > 0) {
    return { ok: false, error: `You owe Rs ${balance}. Please pay your tutor to rejoin.` };
  }

  const session = await getOpenSession();
  if (!session) {
    return { ok: false, error: "No class is live right now." };
  }

  // Check-in window: opens when the tutor opens the session (created_at) and
  // stays open for CHECKIN_WINDOW_MIN minutes. This is anchored to class start,
  // not the scheduled time, so opening late doesn't lock students out early.
  const closesAt =
    new Date(session.created_at).getTime() + CHECKIN_WINDOW_MIN * 60 * 1000;
  if (Date.now() > closesAt) {
    return {
      ok: false,
      error: `Check-in closed (only open for ${CHECKIN_WINDOW_MIN} min after class starts).`,
    };
  }

  // Code check (case-insensitive, trimmed)
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
