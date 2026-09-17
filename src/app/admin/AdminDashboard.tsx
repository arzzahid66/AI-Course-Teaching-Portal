"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { useRouter } from "next/navigation";
import { saveAdminSubscription } from "@/actions/push";
import { usePushSubscription } from "@/lib/usePushSubscription";
import {
  answerQuestion,
  setQuestionStatus,
  deleteQuestion,
  reviewLeaveRequest,
  deleteLeaveRequest,
  clearLoginLogs,
  adminLogout,
  type StudentRow,
  type SessionRow,
  type AttendeeRow,
  type QuestionRow,
  type LeaveRow,
  type LoginLogRow,
} from "@/actions/admin";
import {
  createQuiz,
  updateQuiz,
  setQuizPublished,
  deleteQuiz,
  saveQuestion,
  deleteQuizQuestion,
  getQuizDetail,
  getQuizResults,
  reviewQuizReattemptRequest,
  deleteQuizReattemptRequest,
  type AdminQuizRow,
  type QuizDetail,
  type AdminQuizQuestion,
  type QuizReattemptRow,
  type QuizScoreboard,
  type QuizLeaderboard,
  type QuizResultRow,
} from "@/actions/quiz";
import type { DashboardStats } from "@/actions/batches";
import type { FeeBoard } from "@/actions/fees";
import type { HomeworkBoard } from "@/actions/curriculum";
import type { BatchRow, PaymentAccount, ProgressRow } from "@/lib/course";
import type { Curriculum } from "@/lib/curriculum";
import {
  QUIZ_DEFAULT_TIME_MIN,
  QUIZ_DEFAULT_PASS_PERCENT,
  QUIZ_DEFAULT_MAX_ATTEMPTS,
  COURSE_NAME,
} from "@/lib/constants";
import { Card, EmailStudentButton, fieldClass, fmt, genderBucket, GENDER_META } from "./ui";
import DashboardTab from "./tabs/DashboardTab";
import IntakesTab from "./tabs/IntakesTab";
import StudentsTab from "./tabs/StudentsTab";
import ClassesTab from "./tabs/ClassesTab";
import FeesTab from "./tabs/FeesTab";
import CurriculumTab from "./tabs/CurriculumTab";
import HomeworkTab from "./tabs/HomeworkTab";
import ProgressTab from "./tabs/ProgressTab";

type Tab =
  | "dashboard"
  | "intakes"
  | "students"
  | "classes"
  | "fees"
  | "curriculum"
  | "homework"
  | "progress"
  | "quiz"
  | "questions"
  | "leave"
  | "logs";

/** Everything the admin page loads for the selected intake (null when there is none yet). */
export type BatchData = {
  batch: BatchRow;
  stats: DashboardStats;
  sessions: SessionRow[];
  feeBoard: FeeBoard;
  homework: HomeworkBoard;
  progress: ProgressRow[];
};

export default function AdminDashboard({
  batches,
  batchData,
  students,
  openSession,
  attendees,
  curriculum,
  paymentAccounts,
  whatsapp,
  questions,
  leaves,
  quizzes,
  quizRequests,
  quizScoreboard,
  quizLeaderboard,
  loginLogs,
}: {
  batches: BatchRow[];
  batchData: BatchData | null;
  students: StudentRow[];
  openSession: SessionRow | null;
  attendees: AttendeeRow[];
  curriculum: Curriculum;
  paymentAccounts: PaymentAccount[];
  whatsapp: string;
  questions: QuestionRow[];
  leaves: LeaveRow[];
  quizzes: AdminQuizRow[];
  quizRequests: QuizReattemptRow[];
  quizScoreboard: QuizScoreboard;
  quizLeaderboard: QuizLeaderboard;
  loginLogs: LoginLogRow[];
}) {
  const [tab, setTab] = useState<Tab>(batchData ? "dashboard" : "intakes");
  const router = useRouter();
  const saveSub = useCallback(saveAdminSubscription, []);
  usePushSubscription(saveSub);

  const batch = batchData?.batch ?? null;
  const openQuestions = questions.filter((q) => q.status === "open").length;
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const pendingQuizReqs = quizRequests.filter((r) => r.status === "pending").length;
  const toMark =
    batchData?.homework.submissions.filter((s) => s.status === "submitted" && s.marks == null).length ?? 0;

  const tabs: [Tab, string, number][] = [
    ["dashboard", "Dashboard", 0],
    ["intakes", "Intakes", 0],
    ["students", "Students", 0],
    ["classes", "Classes", 0],
    ["fees", "Fees", 0],
    ["curriculum", "Curriculum", 0],
    ["homework", "Homework", toMark],
    ["progress", "Progress", 0],
    ["quiz", "Quiz", pendingQuizReqs],
    ["questions", "Questions", openQuestions],
    ["leave", "Leave", pendingLeaves],
    ["logs", "Logs", 0],
  ];
  const needsBatch: Tab[] = ["dashboard", "classes", "fees", "homework", "progress"];

  return (
    <main className="min-h-screen max-w-3xl mx-auto p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-2xl font-bold">ClassGate Admin</h1>
          <p className="text-xs text-slate-500">{COURSE_NAME}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Intake</span>
            <select
              value={batch?.id ?? ""}
              onChange={(e) => router.push(`/admin?batch=${e.target.value}`)}
              className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm bg-white"
              disabled={batches.length === 0}
            >
              {batches.length === 0 && <option value="">No intakes yet</option>}
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.status === "completed" ? " (completed)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => adminLogout().then(() => router.refresh())}
            className="text-sm text-slate-500 underline"
          >
            Log out
          </button>
        </div>
      </header>

      <nav className="flex gap-1 bg-slate-200/60 p-1 rounded-2xl mb-5 overflow-x-auto">
        {tabs.map(([t, label, badge]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              tab === t ? "bg-white shadow-sm text-brand-700" : "text-slate-600"
            }`}
          >
            {label}
            {badge > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 align-middle">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {needsBatch.includes(tab) && !batchData ? (
        <Card>
          <p className="text-slate-600">
            Create your first intake in the <b>Intakes</b> tab to see this section.
          </p>
          <button onClick={() => setTab("intakes")} className="mt-3 text-sm text-brand-700 underline">
            Go to Intakes
          </button>
        </Card>
      ) : (
        <>
          {tab === "dashboard" && batchData && <DashboardTab batch={batchData.batch} stats={batchData.stats} />}
          {tab === "intakes" && <IntakesTab batches={batches} selectedId={batch?.id ?? null} />}
          {tab === "students" && <StudentsTab students={students} batches={batches} batch={batch} />}
          {tab === "classes" && batchData && (
            <ClassesTab
              batch={batchData.batch}
              openSession={openSession}
              attendees={attendees}
              sessions={batchData.sessions}
            />
          )}
          {tab === "fees" && batchData && (
            <FeesTab
              batch={batchData.batch}
              board={batchData.feeBoard}
              accounts={paymentAccounts}
              whatsapp={whatsapp}
            />
          )}
          {tab === "curriculum" && <CurriculumTab curriculum={curriculum} initialLevel={batch?.level ?? 1} />}
          {tab === "homework" && batchData && <HomeworkTab board={batchData.homework} />}
          {tab === "progress" && batchData && <ProgressTab batch={batchData.batch} rows={batchData.progress} />}
          {tab === "quiz" && (
            <QuizTab
              quizzes={quizzes}
              requests={quizRequests}
              scoreboard={quizScoreboard}
              leaderboard={quizLeaderboard}
            />
          )}
          {tab === "questions" && <QuestionsTab questions={questions} />}
          {tab === "leave" && <LeaveTab leaves={leaves} />}
          {tab === "logs" && <LogsTab logs={loginLogs} />}
        </>
      )}
    </main>
  );
}


// ---------------------------------------------------------------------------
// Logs (login activity tracking)
// ---------------------------------------------------------------------------
/** Boil a raw user-agent string down to a short, friendly device label. */
function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /iPhone|iPad|iOS/i.test(ua)
    ? "iOS"
    : /Android/i.test(ua)
    ? "Android"
    : /Mac OS X|Macintosh/i.test(ua)
    ? "macOS"
    : /Linux/i.test(ua)
    ? "Linux"
    : "";
  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
    ? "Opera"
    : /Chrome\//i.test(ua)
    ? "Chrome"
    : /Firefox\//i.test(ua)
    ? "Firefox"
    : /Safari\//i.test(ua)
    ? "Safari"
    : "";
  return [browser, os].filter(Boolean).join(" · ") || "Unknown device";
}

function LogsTab({ logs }: { logs: LoginLogRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "student" | "admin">("all");

  const q = query.trim().toLowerCase();
  const filtered = logs.filter((l) => {
    if (roleFilter !== "all" && l.role !== roleFilter) return false;
    if (!q) return true;
    return (
      (l.name ?? "").toLowerCase().includes(q) ||
      (l.email ?? "").toLowerCase().includes(q)
    );
  });

  // The single most recent login (across all roles) — answers "who logged in last".
  const last = logs[0] ?? null;

  // Most recent login per distinct person (keyed by email, else name).
  const seen = new Set<string>();
  const lastPerUser = logs.filter((l) => {
    const key = (l.email ?? l.name ?? String(l.id)).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  function onClear() {
    if (!confirm("Clear all login logs? This permanently deletes the history.")) return;
    start(async () => {
      await clearLoginLogs();
      router.refresh();
    });
  }

  const roleChips: [typeof roleFilter, string][] = [
    ["all", "All"],
    ["student", "Students"],
    ["admin", "Admin"],
  ];

  function RoleBadge({ role }: { role: string }) {
    return (
      <span
        className={`text-xs rounded-full px-2 py-0.5 font-medium ${
          role === "admin"
            ? "bg-violet-100 text-violet-700"
            : "bg-brand-50 text-brand-700"
        }`}
      >
        {role}
      </span>
    );
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">Last login</h2>
        {!last ? (
          <p className="text-slate-500 text-sm">No logins recorded yet.</p>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">
                {last.name || "—"} <RoleBadge role={last.role} />
              </p>
              <p className="text-slate-500 text-sm truncate">{last.email || "no email"}</p>
              <p className="text-slate-400 text-xs flex items-center gap-1.5 flex-wrap">
                {fmt(last.created_at)} · {deviceLabel(last.user_agent)}
                {last.ip ? ` · ${last.ip}` : ""}
                {last.is_pwa ? (
                  <span className="inline-flex items-center gap-1 text-xs rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 font-medium">
                    📱 App
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-medium">
                    🌐 Browser
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="font-bold">
            Login activity{" "}
            <span className="text-slate-400 font-normal">({filtered.length})</span>
          </h2>
          <button
            onClick={onClear}
            disabled={pending || logs.length === 0}
            className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-40"
          >
            Clear logs
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {roleChips.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setRoleFilter(key)}
              className={`text-xs rounded-full px-3 py-1.5 font-medium border transition ${
                roleFilter === key
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email…"
            className="ml-auto min-w-0 flex-1 sm:flex-none sm:w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Email</th>
                <th className="py-2 px-2">Role</th>
                <th className="py-2 px-2">When</th>
                <th className="py-2 px-2">Device</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b last:border-0 align-top">
                  <td className="py-2 px-2 font-medium">{l.name || "—"}</td>
                  <td className="py-2 px-2 text-slate-600 break-all">
                    {l.email || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-2 px-2">
                    <RoleBadge role={l.role} />
                  </td>
                  <td className="py-2 px-2 text-slate-600 whitespace-nowrap">
                    {fmt(l.created_at)}
                  </td>
                  <td className="py-2 px-2 text-slate-500" title={l.user_agent ?? ""}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {l.is_pwa ? (
                        <span className="inline-flex items-center gap-1 text-xs rounded-full bg-indigo-100 text-indigo-700 px-2 py-0.5 font-medium">
                          📱 App
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-medium">
                          🌐 Browser
                        </span>
                      )}
                      <span>{deviceLabel(l.user_agent)}</span>
                    </div>
                    {l.ip && <span className="block text-xs text-slate-400">{l.ip}</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    {logs.length === 0 ? "No logins recorded yet." : "No logins match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="font-bold mb-2">Each user&apos;s last login</h2>
        <ul className="divide-y text-sm">
          {lastPerUser.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {l.name || l.email || "—"} <RoleBadge role={l.role} />
                </p>
                <p className="text-slate-400 text-xs truncate">{l.email || "no email"}</p>
              </div>
              <span className="text-slate-500 text-xs shrink-0 whitespace-nowrap">
                {fmt(l.created_at)}
              </span>
            </li>
          ))}
          {lastPerUser.length === 0 && (
            <li className="py-4 text-center text-slate-400">No logins recorded yet.</li>
          )}
        </ul>
      </Card>
    </>
  );
}


// ---------------------------------------------------------------------------
// Questions (students ask, tutor replies)
// ---------------------------------------------------------------------------
function QuestionsTab({ questions }: { questions: QuestionRow[] }) {
  const open = questions.filter((q) => q.status === "open");
  const resolved = questions.filter((q) => q.status === "resolved");

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Student questions</h2>
          <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 font-semibold">
            {open.length} waiting
          </span>
        </div>
        <p className="text-slate-500 text-sm mt-1">
          Questions students sent from their portal. Reply and they&apos;ll see your answer.
        </p>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">📨 Waiting for reply ({open.length})</h2>
        <ul className="divide-y">
          {open.map((q) => (
            <QuestionItem key={q.id} q={q} />
          ))}
          {open.length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">
              Nothing waiting — you&apos;re all caught up. 🎉
            </li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">✅ Answered ({resolved.length})</h2>
        <ul className="divide-y">
          {resolved.map((q) => (
            <QuestionItem key={q.id} q={q} />
          ))}
          {resolved.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">Nothing answered yet.</li>
          )}
        </ul>
      </Card>
    </>
  );
}

function QuestionItem({ q }: { q: QuestionRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onReply(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await answerQuestion(q.id, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      setReplying(false);
      router.refresh();
    });
  }

  function onToggleStatus() {
    start(async () => {
      await setQuestionStatus(q.id, q.status === "open" ? "resolved" : "open");
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("Delete this question permanently?")) return;
    setError(null);
    start(async () => {
      const res = await deleteQuestion(q.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{q.student_name}</p>
          <p className="text-slate-400 text-xs break-all">
            {q.student_email || "no email on file"} · {fmt(q.created_at)}
          </p>
          {q.student_email && (
            <div className="mt-1">
              <EmailStudentButton
                studentId={q.student_id}
                name={q.student_name}
                defaultSubject={q.subject ? `Re: ${q.subject}` : "About your question"}
              />
            </div>
          )}
        </div>
        <span
          className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${
            q.status === "resolved"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {q.status}
        </span>
      </div>

      {q.subject && (
        <p className="mt-2 text-xs font-semibold text-brand-700">{q.subject}</p>
      )}
      <p className="mt-1 text-sm whitespace-pre-line">{q.body}</p>

      {q.answer && (
        <div className="mt-2 rounded-lg bg-brand-50 border border-brand-100 p-2.5">
          <p className="text-xs font-semibold text-brand-700 mb-0.5">Your reply</p>
          <p className="text-sm whitespace-pre-line text-slate-700">{q.answer}</p>
        </div>
      )}

      {replying ? (
        <form action={onReply} className="mt-2 space-y-2">
          <textarea
            name="answer"
            rows={3}
            defaultValue={q.answer ?? ""}
            placeholder="Write your reply…"
            className={fieldClass()}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-brand-600 px-3 py-2 text-white text-sm font-semibold disabled:opacity-50"
            >
              Send reply
            </button>
            <button
              type="button"
              onClick={() => {
                setReplying(false);
                setError(null);
              }}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setReplying(true)}
            className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
          >
            {q.answer ? "Edit reply" : "Reply"}
          </button>
          <button
            onClick={onToggleStatus}
            disabled={pending}
            className="text-xs rounded-lg border border-slate-300 text-slate-600 px-2 py-1 disabled:opacity-50"
          >
            {q.status === "open" ? "Mark resolved" : "Reopen"}
          </button>
          <button
            onClick={onDelete}
            disabled={pending}
            className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      )}
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Leave (students appeal for an absence; tutor approves / rejects + feedback)
// ---------------------------------------------------------------------------
function LeaveTab({ leaves }: { leaves: LeaveRow[] }) {
  const pending = leaves.filter((l) => l.status === "pending");
  const decided = leaves.filter((l) => l.status !== "pending");

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Leave requests</h2>
          <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 font-semibold">
            {pending.length} waiting
          </span>
        </div>
        <p className="text-slate-500 text-sm mt-1">
          Absence appeals students sent before a class. Approve or reject each one
          and leave a note — the student sees your decision on their Leave tab.
        </p>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">🌴 Waiting for a decision ({pending.length})</h2>
        <ul className="divide-y">
          {pending.map((l) => (
            <LeaveItem key={l.id} leave={l} />
          ))}
          {pending.length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">
              Nothing waiting — you&apos;re all caught up. 🎉
            </li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">✅ Reviewed ({decided.length})</h2>
        <ul className="divide-y">
          {decided.map((l) => (
            <LeaveItem key={l.id} leave={l} />
          ))}
          {decided.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">
              Nothing reviewed yet.
            </li>
          )}
        </ul>
      </Card>
    </>
  );
}

function LeaveItem({ leave }: { leave: LeaveRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState(leave.feedback ?? "");
  const [error, setError] = useState<string | null>(null);
  // Reviewed requests show a clean read-only summary by default (like the
  // student sees). "Edit decision" reopens the controls to change it.
  const isReviewed = leave.status !== "pending";
  const [editing, setEditing] = useState(false);

  const statusMeta: Record<LeaveRow["status"], { label: string; chip: string }> = {
    pending: { label: "pending", chip: "bg-amber-100 text-amber-700" },
    approved: { label: "approved", chip: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "rejected", chip: "bg-rose-100 text-rose-700" },
  };
  const meta = statusMeta[leave.status];

  function review(status: "approved" | "rejected" | "pending") {
    setError(null);
    const fd = new FormData();
    fd.set("status", status);
    fd.set("feedback", feedback);
    start(async () => {
      const res = await reviewLeaveRequest(leave.id, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("Delete this leave request permanently?")) return;
    setError(null);
    start(async () => {
      const res = await deleteLeaveRequest(leave.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{leave.student_name}</p>
          <p className="text-slate-400 text-xs break-all">
            {leave.student_email || "no email on file"} · sent {fmt(leave.created_at)}
          </p>
          {leave.student_email && (
            <div className="mt-1">
              <EmailStudentButton
                studentId={leave.student_id}
                name={leave.student_name}
                defaultSubject={`About your leave request${leave.lesson_title ? `: ${leave.lesson_title}` : ""}`}
              />
            </div>
          )}
        </div>
        <span
          className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${meta.chip}`}
        >
          {meta.label}
        </span>
      </div>

      <p className="mt-2 text-xs font-semibold text-brand-700">
        {leave.lesson_title ? (
          <>
            {leave.lesson_title}
            {leave.lesson_at && (
              <span className="text-slate-400 font-normal"> · {fmt(leave.lesson_at)}</span>
            )}
          </>
        ) : (
          <span className="text-slate-400">General leave (no class linked)</span>
        )}
      </p>
      <p className="mt-1 text-sm whitespace-pre-line">{leave.reason}</p>

      {isReviewed && !editing ? (
        <>
          {/* Reviewed: clean read-only summary (mirrors the student's view). */}
          {leave.feedback ? (
            <div className="mt-2 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2">
              <p className="text-xs font-semibold text-brand-700">Your note</p>
              <p className="text-sm whitespace-pre-line">{leave.feedback}</p>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400 italic">No note left for the student.</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              disabled={pending}
              className="text-xs rounded-lg border border-slate-300 text-slate-600 px-3 py-1.5 disabled:opacity-50"
            >
              Edit decision
            </button>
            <button
              onClick={onDelete}
              disabled={pending}
              className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1.5 disabled:opacity-50 ml-auto"
            >
              Delete
            </button>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="Feedback for the student (optional)"
            className={fieldClass() + " mt-2"}
          />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => review("approved")}
              disabled={pending}
              className="text-xs rounded-lg bg-emerald-600 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              Approve
            </button>
            <button
              onClick={() => review("rejected")}
              disabled={pending}
              className="text-xs rounded-lg bg-rose-600 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => review("pending")}
              disabled={pending}
              className="text-xs rounded-lg border border-slate-300 text-slate-600 px-2 py-1.5 disabled:opacity-50"
              title="Save the note without approving or rejecting yet"
            >
              Save note only
            </button>
            {isReviewed && (
              <button
                onClick={() => {
                  setFeedback(leave.feedback ?? "");
                  setEditing(false);
                  setError(null);
                }}
                disabled={pending}
                className="text-xs rounded-lg border border-slate-300 text-slate-600 px-2 py-1.5 disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={pending}
              className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1.5 disabled:opacity-50 ml-auto"
            >
              Delete
            </button>
          </div>
        </>
      )}
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Quiz (MCQ modules) — authoring, gradebook + re-attempt requests
// ---------------------------------------------------------------------------
function QuizTab({
  quizzes,
  requests,
  scoreboard,
  leaderboard,
}: {
  quizzes: AdminQuizRow[];
  requests: QuizReattemptRow[];
  scoreboard: QuizScoreboard;
  leaderboard: QuizLeaderboard;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const createRef = useRef<HTMLFormElement>(null);

  const pendingReqs = requests.filter((r) => r.status === "pending");
  const decidedReqs = requests.filter((r) => r.status !== "pending");

  function onCreate(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await createQuiz(formData);
      if (res.error) setError(res.error);
      else createRef.current?.reset();
      router.refresh();
    });
  }

  function onDelete(q: AdminQuizRow) {
    if (
      !confirm(
        `Delete quiz "${q.title}"? This removes its questions and every student's attempts. This cannot be undone.`
      )
    )
      return;
    setError(null);
    start(async () => {
      const res = await deleteQuiz(q.id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">Create quiz</h2>
        <form ref={createRef} action={onCreate} className="space-y-2">
          <input name="title" placeholder="Title (e.g. AI Basics)" className={fieldClass()} />
          <textarea
            name="description"
            rows={2}
            placeholder="Short description (optional)"
            className={fieldClass()}
          />
          <select name="level" defaultValue="" className={fieldClass()}>
            <option value="">For every batch</option>
            <option value="1">Batch 1 students only</option>
            <option value="2">Batch 2 students only</option>
          </select>
          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs text-slate-500">
              Time (min)
              <input
                name="time_limit_min"
                type="number"
                min="1"
                step="1"
                defaultValue={QUIZ_DEFAULT_TIME_MIN}
                className={fieldClass()}
              />
            </label>
            <label className="text-xs text-slate-500">
              Pass %
              <input
                name="pass_percent"
                type="number"
                min="0"
                max="100"
                step="1"
                defaultValue={QUIZ_DEFAULT_PASS_PERCENT}
                className={fieldClass()}
              />
            </label>
            <label className="text-xs text-slate-500">
              Attempts
              <input
                name="max_attempts"
                type="number"
                min="1"
                step="1"
                defaultValue={QUIZ_DEFAULT_MAX_ATTEMPTS}
                className={fieldClass()}
              />
            </label>
          </div>
          <label className="text-xs text-slate-500 block">
            Questions per attempt (0 = all)
            <input
              name="questions_per_attempt"
              type="number"
              min="0"
              step="1"
              defaultValue={0}
              className={fieldClass()}
            />
          </label>
          <p className="text-slate-400 text-xs -mt-1">
            Draw this many random questions from the pool each attempt. Leave 0 to show every
            question. Order is always randomised.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input name="is_published" type="checkbox" className="h-4 w-4 accent-brand-600" />
            Publish now (students can see &amp; attempt it)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input name="notify_email" type="checkbox" defaultChecked className="h-4 w-4 accent-brand-600" />
            Email students when published
          </label>
          <input name="sort_order" type="hidden" defaultValue={quizzes.length} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Create quiz
          </button>
        </form>
        <p className="text-slate-400 text-xs mt-2">
          Create it first, then open it to add questions. Publish once it&apos;s ready.
        </p>
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Quizzes ({quizzes.length})</h2>
        <ul className="divide-y">
          {quizzes.map((q) => (
            <li key={q.id} className="flex items-center justify-between gap-2 py-2.5">
              <div className="min-w-0">
                <p className="font-medium truncate">{q.title}</p>
                <p className="text-slate-400 text-xs">
                  {q.question_count} Qs
                  {q.questions_per_attempt > 0 && (
                    <> · shows {q.questions_per_attempt} random</>
                  )}{" "}
                  · {Math.round(q.time_limit_sec / 60)} min · pass {q.pass_percent}% ·{" "}
                  {q.attempt_count} attempts
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() =>
                    start(async () => {
                      await setQuizPublished(q.id, !q.is_published);
                      router.refresh();
                    })
                  }
                  className={`text-xs rounded-full px-2 py-0.5 ${
                    q.is_published
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-200 text-slate-600"
                  }`}
                  title="Click to toggle"
                >
                  {q.is_published ? "published" : "draft"}
                </button>
                <button
                  onClick={() => setEditingId(q.id)}
                  className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(q)}
                  disabled={pending}
                  className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {quizzes.length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">No quizzes yet.</li>
          )}
        </ul>
      </Card>

      <QuizLeaderboardCard leaderboard={leaderboard} />

      <QuizScoreboardCard scoreboard={scoreboard} />

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Re-attempt requests</h2>
          <span className="text-xs rounded-full bg-amber-100 text-amber-700 px-2.5 py-1 font-semibold">
            {pendingReqs.length} waiting
          </span>
        </div>
        <p className="text-slate-500 text-sm mt-1 mb-3">
          Students who used all their attempts and asked to try again. Approving grants
          them 2 fresh attempts.
        </p>
        <ul className="divide-y">
          {pendingReqs.map((r) => (
            <QuizRequestItem key={r.id} req={r} />
          ))}
          {pendingReqs.length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">
              Nothing waiting — all caught up. 🎉
            </li>
          )}
        </ul>
        {decidedReqs.length > 0 && (
          <>
            <h3 className="font-semibold text-sm mt-4 mb-2 text-slate-600">
              Reviewed ({decidedReqs.length})
            </h3>
            <ul className="divide-y">
              {decidedReqs.map((r) => (
                <QuizRequestItem key={r.id} req={r} />
              ))}
            </ul>
          </>
        )}
      </Card>

      {editingId != null && (
        <QuizEditModal quizId={editingId} onClose={() => setEditingId(null)} />
      )}
    </>
  );
}

/**
 * Competition leaderboard: a bar chart ranking students by their BEST score on
 * a chosen quiz, filterable by gender (Girls / Boys). Only base-attempt scores
 * count — students who used a granted re-attempt are excluded by default so the
 * ranking reflects real winners (those who scored within their given attempts).
 */
function QuizLeaderboardCard({ leaderboard }: { leaderboard: QuizLeaderboard }) {
  const { quizzes, byQuiz } = leaderboard;
  type GenderKey = "all" | "female" | "male" | "other" | "unspecified";

  const [quizId, setQuizId] = useState<number | null>(quizzes[0]?.id ?? null);
  const [gender, setGender] = useState<GenderKey>("all");
  const [includeReattempts, setIncludeReattempts] = useState(false);

  if (quizzes.length === 0) {
    return (
      <Card>
        <h2 className="font-bold mb-1">🏆 Leaderboard</h2>
        <p className="text-slate-400 text-sm">No quizzes yet.</p>
      </Card>
    );
  }

  const activeQuizId = quizId != null && byQuiz[quizId] ? quizId : quizzes[0].id;
  const allEntries = byQuiz[activeQuizId] ?? [];

  // Pool = everyone who scored, minus re-attempt users unless the admin opts in.
  const pool = allEntries.filter((e) => includeReattempts || !e.usedReattempt);

  // Counts per gender bucket, for the filter chips.
  const bucketCounts = { all: pool.length, female: 0, male: 0, other: 0, unspecified: 0 };
  for (const e of pool) bucketCounts[genderBucket(e.gender)]++;

  const ranked = (gender === "all" ? pool : pool.filter((e) => genderBucket(e.gender) === gender))
    .slice()
    .sort((a, b) => b.bestPercent - a.bestPercent || a.name.localeCompare(b.name));

  const chartData = ranked.map((e) => ({
    name: e.name,
    score: e.bestPercent,
    fill: GENDER_META[genderBucket(e.gender)].color,
  }));

  const chips: [GenderKey, string][] = [
    ["all", `All (${bucketCounts.all})`],
    ["female", `Girls (${bucketCounts.female})`],
    ["male", `Boys (${bucketCounts.male})`],
  ];
  if (bucketCounts.other) chips.push(["other", `Other (${bucketCounts.other})`]);
  if (bucketCounts.unspecified)
    chips.push(["unspecified", `Unspecified (${bucketCounts.unspecified})`]);

  const excludedCount = allEntries.filter((e) => e.usedReattempt).length;
  const medals = ["🥇", "🥈", "🥉"];
  // Give each bar room to breathe; cap the chart so long classes still fit.
  const chartHeight = Math.min(560, Math.max(140, ranked.length * 34));

  return (
    <Card>
      <h2 className="font-bold mb-1">🏆 Leaderboard</h2>
      <p className="text-slate-500 text-sm mb-3">
        Best score per student — winners are those who scored within their given attempts,
        without requesting extra ones.
      </p>

      {/* Quiz picker */}
      <label className="text-xs text-slate-500 block mb-3">
        Quiz
        <select
          value={activeQuizId}
          onChange={(e) => setQuizId(Number(e.target.value))}
          className={fieldClass()}
        >
          {quizzes.map((q, i) => (
            <option key={q.id} value={q.id}>
              Quiz {i + 1} — {q.title}
            </option>
          ))}
        </select>
      </label>

      {/* Gender filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {chips.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setGender(key)}
            className={`text-xs rounded-full px-3 py-1 font-medium ${
              gender === key
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Include re-attempt users toggle */}
      <label className="flex items-center gap-2 text-sm mb-4 text-slate-600">
        <input
          type="checkbox"
          checked={includeReattempts}
          onChange={(e) => setIncludeReattempts(e.target.checked)}
          className="h-4 w-4 accent-brand-600"
        />
        Include students who used a re-attempt
        {excludedCount > 0 && !includeReattempts && (
          <span className="text-slate-400">({excludedCount} hidden)</span>
        )}
      </label>

      {ranked.length === 0 ? (
        <p className="text-slate-400 text-sm py-6 text-center">
          No scores to show for this filter yet.
        </p>
      ) : (
        <>
          <div style={{ height: chartHeight }} className="-mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  fontSize={11}
                  interval={0}
                  tick={{ fill: "#475569" }}
                />
                <Tooltip formatter={(value) => [`${value}%`, "Best score"]} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Ranked list with medals for the top three. */}
          <ol className="mt-3 divide-y">
            {ranked.map((e, i) => (
              <li key={e.studentId} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="w-6 text-center shrink-0">
                  {medals[i] ?? <span className="text-slate-400">{i + 1}</span>}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ background: GENDER_META[genderBucket(e.gender)].color }}
                />
                <span className="font-medium truncate flex-1">
                  {e.name}
                  {e.usedReattempt && (
                    <span className="ml-1.5 text-[10px] rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5 align-middle">
                      re-attempt
                    </span>
                  )}
                </span>
                <span
                  className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                    e.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {e.bestPercent}%
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  );
}

/** Gradebook grid: every active student × every quiz, showing their last %. */
function QuizScoreboardCard({ scoreboard }: { scoreboard: QuizScoreboard }) {
  const { quizzes, students, scores } = scoreboard;

  return (
    <Card>
      <h2 className="font-bold mb-1">Scores</h2>
      <p className="text-slate-500 text-sm mb-3">
        Each student&apos;s last score per topic. Green = passed, red = failed, — = not
        attempted.
      </p>
      {quizzes.length === 0 || students.length === 0 ? (
        <p className="text-slate-400 text-sm">
          {quizzes.length === 0 ? "No quizzes yet." : "No active students."}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="text-sm border-collapse">
            <thead>
              <tr>
                <th className="sticky left-0 bg-white text-left py-2 px-2 z-10">Student</th>
                {quizzes.map((q) => (
                  <th key={q.id} className="py-2 px-2 align-bottom">
                    <span className="whitespace-nowrap max-w-[120px] truncate block">
                      {q.title}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="sticky left-0 bg-white py-1.5 px-2 font-medium whitespace-nowrap z-10">
                    {s.name}
                  </td>
                  {quizzes.map((q) => {
                    const cell = scores[`${q.id}:${s.id}`];
                    if (!cell || cell.attemptsUsed === 0) {
                      return (
                        <td key={q.id} className="py-1.5 px-2 text-center text-slate-300">
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={q.id} className="py-1.5 px-2 text-center">
                        <span
                          className={`inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${
                            cell.passed
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                          title={`${cell.attemptsUsed} attempt(s)`}
                        >
                          {cell.lastPercent}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function QuizRequestItem({ req }: { req: QuizReattemptRow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const meta: Record<QuizReattemptRow["status"], { label: string; chip: string }> = {
    pending: { label: "pending", chip: "bg-amber-100 text-amber-700" },
    approved: { label: "approved", chip: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "rejected", chip: "bg-rose-100 text-rose-700" },
  };
  const m = meta[req.status];

  function review(status: "approved" | "rejected") {
    setError(null);
    const fd = new FormData();
    fd.set("status", status);
    start(async () => {
      const res = await reviewQuizReattemptRequest(req.id, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function onDelete() {
    if (!confirm("Delete this request permanently?")) return;
    setError(null);
    start(async () => {
      const res = await deleteQuizReattemptRequest(req.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{req.student_name}</p>
          <p className="text-slate-400 text-xs break-all">
            {req.student_email || "no email on file"} · {fmt(req.created_at)}
          </p>
          {req.student_email && (
            <div className="mt-1">
              <EmailStudentButton
                studentId={req.student_id}
                name={req.student_name}
                defaultSubject={`About quiz: ${req.quiz_title}`}
              />
            </div>
          )}
        </div>
        <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${m.chip}`}>
          {m.label}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold text-brand-700">{req.quiz_title}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => review("approved")}
          disabled={pending}
          className="text-xs rounded-lg bg-emerald-600 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
        >
          Approve (+2)
        </button>
        <button
          onClick={() => review("rejected")}
          disabled={pending}
          className="text-xs rounded-lg bg-rose-600 text-white px-3 py-1.5 font-semibold disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1.5 disabled:opacity-50 ml-auto"
        >
          Delete
        </button>
      </div>
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </li>
  );
}

function QuizEditModal({ quizId, onClose }: { quizId: number; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<QuizDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, start] = useTransition();
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await getQuizDetail(quizId);
      if (d) setDetail(d);
      else setLoadFailed(true);
    } catch {
      setLoadFailed(true);
    }
  }, [quizId]);

  useEffect(() => {
    reload();
  }, [reload]);

  function onSaveSettings(formData: FormData) {
    setSettingsMsg(null);
    start(async () => {
      const res = await updateQuiz(quizId, formData);
      if (res.error) setSettingsMsg(res.error);
      else {
        setSettingsMsg("Saved.");
        await reload();
        router.refresh();
      }
    });
  }

  function onDeleteQuestion(qid: number) {
    if (!confirm("Delete this question?")) return;
    start(async () => {
      await deleteQuizQuestion(qid);
      await reload();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Edit quiz</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        {loadFailed ? (
          <p className="text-rose-600 text-sm">Could not load this quiz.</p>
        ) : !detail ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : (
          <>
            {/* Settings */}
            <div className="rounded-xl bg-slate-50 p-3 mb-4">
              <h3 className="font-semibold text-sm mb-2">Settings</h3>
              <form action={onSaveSettings} className="space-y-2">
                <input
                  name="title"
                  defaultValue={detail.title}
                  placeholder="Title"
                  className={fieldClass()}
                />
                <textarea
                  name="description"
                  defaultValue={detail.description ?? ""}
                  rows={2}
                  placeholder="Description"
                  className={fieldClass()}
                />
                <select name="level" defaultValue={detail.level ?? ""} className={fieldClass()}>
                  <option value="">For every batch</option>
                  <option value="1">Batch 1 students only</option>
                  <option value="2">Batch 2 students only</option>
                </select>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-xs text-slate-500">
                    Time (min)
                    <input
                      name="time_limit_min"
                      type="number"
                      min="1"
                      defaultValue={Math.round(detail.time_limit_sec / 60)}
                      className={fieldClass()}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Pass %
                    <input
                      name="pass_percent"
                      type="number"
                      min="0"
                      max="100"
                      defaultValue={detail.pass_percent}
                      className={fieldClass()}
                    />
                  </label>
                  <label className="text-xs text-slate-500">
                    Attempts
                    <input
                      name="max_attempts"
                      type="number"
                      min="1"
                      defaultValue={detail.max_attempts}
                      className={fieldClass()}
                    />
                  </label>
                </div>
                <label className="text-xs text-slate-500 block">
                  Questions per attempt (0 = all, {detail.questions.length} in pool)
                  <input
                    name="questions_per_attempt"
                    type="number"
                    min="0"
                    defaultValue={detail.questions_per_attempt}
                    className={fieldClass()}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="is_published"
                    type="checkbox"
                    defaultChecked={detail.is_published}
                    className="h-4 w-4 accent-brand-600"
                  />
                  Published
                </label>
                {!detail.is_published && (
                  <label className="flex items-center gap-2 text-sm">
                    <input name="notify_email" type="checkbox" defaultChecked className="h-4 w-4 accent-brand-600" />
                    Email students when published
                  </label>
                )}
                <input name="sort_order" type="hidden" defaultValue={detail.sort_order} />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-white font-semibold disabled:opacity-50"
                >
                  Save settings
                </button>
                {settingsMsg && <p className="text-sm mt-1 text-slate-600">{settingsMsg}</p>}
              </form>
            </div>

            {/* Questions */}
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Questions ({detail.questions.length})</h3>
              {!addingQuestion && editingQuestionId == null && (
                <button
                  onClick={() => setAddingQuestion(true)}
                  className="text-xs rounded-lg bg-brand-600 text-white px-3 py-1.5 font-semibold"
                >
                  + Add question
                </button>
              )}
            </div>

            {addingQuestion && (
              <QuestionForm
                quizId={quizId}
                question={null}
                onDone={async (saved) => {
                  setAddingQuestion(false);
                  if (saved) {
                    await reload();
                    router.refresh();
                  }
                }}
              />
            )}

            <ul className="space-y-2">
              {detail.questions.map((q, i) => (
                <li key={q.id} className="rounded-xl border border-slate-200 p-3">
                  {editingQuestionId === q.id ? (
                    <QuestionForm
                      quizId={quizId}
                      question={q}
                      onDone={async (saved) => {
                        setEditingQuestionId(null);
                        if (saved) {
                          await reload();
                          router.refresh();
                        }
                      }}
                    />
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">
                          <span className="text-slate-400 mr-1">Q{i + 1}.</span>
                          {q.body}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => setEditingQuestionId(q.id)}
                            className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-0.5"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => onDeleteQuestion(q.id)}
                            className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-0.5"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {q.options.map((o) => (
                          <li
                            key={o.id}
                            className={`text-sm flex items-center gap-2 ${
                              o.is_correct ? "text-emerald-700 font-medium" : "text-slate-600"
                            }`}
                          >
                            <span>{o.is_correct ? "✅" : "▫️"}</span>
                            {o.body}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              ))}
              {detail.questions.length === 0 && !addingQuestion && (
                <li className="py-4 text-center text-slate-400 text-sm">
                  No questions yet. Add the first one above.
                </li>
              )}
            </ul>

            {/* Results */}
            <div className="mt-5">
              <QuizResultsPanel quizId={quizId} quizTitle={detail.title} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Add/edit a question with its options (each has a "correct" checkbox). */
function QuestionForm({
  quizId,
  question,
  onDone,
}: {
  quizId: number;
  question: AdminQuizQuestion | null;
  onDone: (saved: boolean) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState(question?.body ?? "");
  const [options, setOptions] = useState<{ body: string; correct: boolean }[]>(
    question
      ? question.options.map((o) => ({ body: o.body, correct: o.is_correct }))
      : [
          { body: "", correct: false },
          { body: "", correct: false },
        ]
  );

  function setOption(i: number, patch: Partial<{ body: string; correct: boolean }>) {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  }

  // Exactly one correct answer — picking one clears the rest (students select one).
  function setCorrect(i: number) {
    setOptions((prev) => prev.map((o, idx) => ({ ...o, correct: idx === i })));
  }

  function onSave() {
    setError(null);
    const cleaned = options.map((o) => ({ body: o.body.trim(), correct: o.correct })).filter((o) => o.body);
    if (!body.trim()) {
      setError("Write the question first.");
      return;
    }
    if (cleaned.length < 2) {
      setError("Add at least two options.");
      return;
    }
    if (!cleaned.some((o) => o.correct)) {
      setError("Mark at least one option correct.");
      return;
    }
    const fd = new FormData();
    fd.set("body", body);
    fd.set("options_json", JSON.stringify(cleaned));
    start(async () => {
      const res = await saveQuestion(quizId, question?.id ?? null, fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone(true);
    });
  }

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 mb-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Question"
        className={fieldClass()}
      />
      <p className="text-xs text-slate-500 mt-2 mb-1">
        Options — pick the one correct answer.
      </p>
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="radio"
              name="correct-option"
              checked={o.correct}
              onChange={() => setCorrect(i)}
              className="h-4 w-4 accent-emerald-600 shrink-0"
              title="Correct answer?"
            />
            <input
              value={o.body}
              onChange={(e) => setOption(i, { body: e.target.value })}
              placeholder={`Option ${i + 1}`}
              className={fieldClass()}
            />
            <button
              type="button"
              onClick={() => setOptions((prev) => prev.filter((_, idx) => idx !== i))}
              disabled={options.length <= 2}
              className="text-slate-400 disabled:opacity-30 shrink-0"
              title="Remove option"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOptions((prev) => [...prev, { body: "", correct: false }])}
        className="text-xs text-brand-700 mt-2"
      >
        + Add option
      </button>

      {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}

      <div className="flex gap-2 mt-3">
        <button
          onClick={onSave}
          disabled={pending}
          className="rounded-xl bg-brand-600 px-4 py-2 text-white text-sm font-semibold disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save question"}
        </button>
        <button
          onClick={() => onDone(false)}
          disabled={pending}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Per-student results for one quiz, loaded lazily inside the editor modal. */
function QuizResultsPanel({ quizId, quizTitle }: { quizId: number; quizTitle: string }) {
  const [rows, setRows] = useState<QuizResultRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    getQuizResults(quizId)
      .then((r) => {
        if (alive) setRows(r);
      })
      .catch(() => {
        if (alive) setRows([]);
      });
    return () => {
      alive = false;
    };
  }, [quizId]);

  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <h3 className="font-semibold text-sm mb-2">Student results</h3>
      {rows == null ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-slate-400 text-sm">No active students.</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.student_id} className="flex items-center justify-between py-1.5 gap-2">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className="flex items-center gap-2 shrink-0">
                {r.email && (
                  <EmailStudentButton studentId={r.student_id} name={r.name} defaultSubject={`About quiz: ${quizTitle}`} />
                )}
                <span className="text-slate-400 text-xs">
                  {r.attemptsUsed}/{r.attemptsAllowed}
                </span>
                {r.lastPercent == null ? (
                  <span className="text-slate-300">—</span>
                ) : (
                  <span
                    className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${
                      r.passed
                        ? "bg-emerald-100 text-emerald-700"
                        : r.blocked
                        ? "bg-rose-100 text-rose-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {r.lastPercent}%{r.passed ? " ✅" : r.blocked ? " ⛔" : ""}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
