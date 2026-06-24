"use server";

import { sql } from "@/lib/db";
import { requireStudentId } from "@/lib/auth";
import { CHECKIN_WINDOW_MIN } from "@/lib/constants";

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
  type: "penalty" | "payment";
  amount: number;
  reason: string | null;
  created_at: string;
};

export type NextClass = {
  title: string;
  scheduled_at: string;
};

export type PortalData = {
  name: string;
  email: string | null;
  balance: number;
  checkin: CheckInState;
  nextClass: NextClass | null;
  attendance: AttendanceEntry[];
  topics: { upcoming: Topic[]; past: Topic[] };
  assignments: AssignmentWithStatus[];
  ledger: LedgerEntry[];
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
      SUM(CASE WHEN type = 'penalty' THEN amount ELSE -amount END), 0
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
    return { kind: "present", sessionTitle: session.title, meetLink: session.meet_link };
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

  const assignmentsRaw = (await sql`
    SELECT
      a.id, a.title, a.description, a.due_at,
      COALESCE(st.status, 'pending') AS status
    FROM assignments a
    LEFT JOIN assignment_status st
      ON st.assignment_id = a.id AND st.student_id = ${studentId}
    ORDER BY COALESCE(a.due_at, a.created_at) DESC
  `) as AssignmentWithStatus[];

  const ledger = (await sql`
    SELECT type, amount, reason, created_at
    FROM ledger
    WHERE student_id = ${studentId}
    ORDER BY created_at DESC
    LIMIT 50
  `) as (Omit<LedgerEntry, "amount"> & { amount: string })[];

  return {
    name,
    email,
    balance,
    checkin,
    nextClass,
    attendance,
    topics: { upcoming, past },
    assignments: assignmentsRaw,
    ledger: ledger.map((l) => ({ ...l, amount: Number(l.amount) })),
  };
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

  return { ok: true, meetLink: session.meet_link };
}
