import { isAdmin } from "@/lib/auth";
import {
  getStudents,
  getOpenSessionWithAttendance,
  getBatchSessions,
  getQuestions,
  getLeaveRequests,
  getLoginLogs,
} from "@/actions/admin";
import { getBatches, getBatchOverview } from "@/actions/batches";
import { getFeeBoard, getPaymentSettings } from "@/actions/fees";
import { getCurriculumAdmin, getHomeworkBoard } from "@/actions/curriculum";
import {
  getQuizzesAdmin,
  getQuizReattemptRequests,
  getQuizScoreboard,
  getQuizLeaderboard,
} from "@/actions/quiz";
import LoginForm from "./LoginForm";
import AdminDashboard, { type BatchData } from "./AdminDashboard";

export const dynamic = "force-dynamic";

/**
 * Await a data-loading promise but never throw: on failure, log it and return
 * `fallback`, so one section's query failing can't take down the whole page.
 */
async function settle<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    console.error("[admin] data load failed:", e);
    return fallback;
  }
}

async function loadBatchData(batchId: number, batches: Awaited<ReturnType<typeof getBatches>>): Promise<BatchData | null> {
  const batch = batches.find((b) => b.id === batchId);
  if (!batch) return null;
  const [{ stats, progress }, sessions, feeBoard, homework] = await Promise.all([
    getBatchOverview(batchId),
    settle(getBatchSessions(batchId), []),
    settle(getFeeBoard(batchId), { rows: [], payments: [] }),
    settle(getHomeworkBoard(batchId), { submissions: [], missing: [] }),
  ]);
  return { batch, stats, sessions, feeBoard, homework, progress };
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>;
}) {
  if (!(await isAdmin())) {
    return <LoginForm />;
  }

  const batches = await settle(getBatches(), []);
  const requested = Number((await searchParams).batch);
  // Default: the requested intake, else the newest one that isn't completed, else the newest.
  const selected =
    batches.find((b) => b.id === requested) ??
    batches.find((b) => b.status !== "completed") ??
    batches[0] ??
    null;

  const [
    batchData,
    students,
    openSession,
    curriculum,
    paymentSettings,
    questions,
    leaves,
    quizzes,
    quizRequests,
    quizScoreboard,
    quizLeaderboard,
    loginLogs,
  ] = await Promise.all([
    selected ? settle(loadBatchData(selected.id, batches), null) : Promise.resolve(null),
    settle(getStudents(), []),
    settle(getOpenSessionWithAttendance(), { session: null, attendees: [] }),
    settle(getCurriculumAdmin(), { levels: [], weekends: [] }),
    settle(getPaymentSettings(), { accounts: [], whatsapp: "" }),
    settle(getQuestions(), []),
    settle(getLeaveRequests(), []),
    settle(getQuizzesAdmin(), []),
    settle(getQuizReattemptRequests(), []),
    settle(getQuizScoreboard(), { quizzes: [], students: [], scores: {} }),
    settle(getQuizLeaderboard(), { quizzes: [], byQuiz: {} }),
    settle(getLoginLogs(), []),
  ]);

  return (
    <AdminDashboard
      batches={batches}
      batchData={batchData}
      students={students}
      openSession={openSession.session}
      attendees={openSession.attendees}
      curriculum={curriculum}
      paymentAccounts={paymentSettings.accounts}
      whatsapp={paymentSettings.whatsapp}
      questions={questions}
      leaves={leaves}
      quizzes={quizzes}
      quizRequests={quizRequests}
      quizScoreboard={quizScoreboard}
      quizLeaderboard={quizLeaderboard}
      loginLogs={loginLogs}
    />
  );
}
