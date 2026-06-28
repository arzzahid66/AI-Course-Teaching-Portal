import { isAdmin } from "@/lib/auth";
import {
  getStudents,
  getOpenSessionWithAttendance,
  getRecentSessions,
  getTopics,
  getAssignmentMatrix,
  getDashboardStats,
  getQuestions,
  type DashboardStats,
} from "@/actions/admin";
import LoginForm from "./LoginForm";
import AdminDashboard from "./AdminDashboard";

export const dynamic = "force-dynamic";

/** Fully-zeroed dashboard stats — the fallback if the stats query fails. */
const EMPTY_STATS: DashboardStats = {
  students: { total: 0, active: 0, inactive: 0 },
  money: { outstanding: 0, penalties: 0, payments: 0 },
  attendance: [],
  assignments: [],
  topDebtors: [],
};

/**
 * Await a data-loading promise but never throw: on failure, log it and return
 * `fallback`. The DB layer already retries transient Neon "fetch failed" errors
 * (see lib/db.ts); this is a second layer of defense so that a single section's
 * query failing can't take down the entire admin page render.
 */
async function settle<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    console.error("[admin] data load failed:", e);
    return fallback;
  }
}

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return <LoginForm />;
  }

  // Fetch everything on the server, in parallel. Each query degrades to a safe
  // empty value on failure so a flaky connection can't blank the whole page.
  const [
    students,
    openSession,
    sessions,
    topics,
    assignmentMatrix,
    dashboardStats,
    questions,
  ] = await Promise.all([
    settle(getStudents(), []),
    settle(getOpenSessionWithAttendance(), { session: null, attendees: [] }),
    settle(getRecentSessions(), []),
    settle(getTopics(), []),
    settle(getAssignmentMatrix(), { assignments: [], students: [], done: {} }),
    settle(getDashboardStats(), EMPTY_STATS),
    settle(getQuestions(), []),
  ]);

  return (
    <AdminDashboard
      students={students}
      openSession={openSession.session}
      attendees={openSession.attendees}
      sessions={sessions}
      topics={topics}
      assignmentMatrix={assignmentMatrix}
      dashboardStats={dashboardStats}
      questions={questions}
    />
  );
}
