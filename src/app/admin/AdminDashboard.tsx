"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAdminSubscription } from "@/actions/push";
import { usePushSubscription } from "@/lib/usePushSubscription";
import {
  addStudent,
  bulkAddStudents,
  setStudentStatus,
  setStudentCredentials,
  updateStudent,
  deleteStudent,
  createSession,
  closeSession,
  scheduleSession,
  openSession as startSession,
  updateSession,
  deleteSession,
  recordPayment,
  createTopic,
  updateTopic,
  setTopicCovered,
  deleteTopic,
  createCurriculumWeek,
  updateCurriculumWeek,
  deleteCurriculumWeek,
  createOutcome,
  updateOutcome,
  deleteOutcome,
  createResource,
  updateResource,
  deleteResource,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  setAssignmentStatus,
  getStudentDetail,
  updateLedgerEntry,
  deleteLedgerEntry,
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
  type TopicRow,
  type CurriculumWeekRow,
  type OutcomeRow,
  type ResourceRow,
  type AssignmentMatrix,
  type AssignmentRow,
  type AssignmentStudent,
  type StudentDetail,
  type DashboardStats,
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
  type QuizResultRow,
} from "@/actions/quiz";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  parseResourceLinks,
  QUIZ_DEFAULT_TIME_MIN,
  QUIZ_DEFAULT_PASS_PERCENT,
  QUIZ_DEFAULT_MAX_ATTEMPTS,
} from "@/lib/constants";

type Tab =
  | "dashboard"
  | "students"
  | "sessions"
  | "payments"
  | "topics"
  | "curriculum"
  | "library"
  | "assignments"
  | "quiz"
  | "questions"
  | "leave"
  | "logs";

export default function AdminDashboard({
  students,
  openSession,
  attendees,
  sessions,
  topics,
  curriculum,
  outcomes,
  resources,
  assignmentMatrix,
  dashboardStats,
  questions,
  leaves,
  quizzes,
  quizRequests,
  quizScoreboard,
  loginLogs,
}: {
  students: StudentRow[];
  openSession: SessionRow | null;
  attendees: AttendeeRow[];
  sessions: SessionRow[];
  topics: TopicRow[];
  curriculum: CurriculumWeekRow[];
  outcomes: OutcomeRow[];
  resources: ResourceRow[];
  assignmentMatrix: AssignmentMatrix;
  dashboardStats: DashboardStats;
  questions: QuestionRow[];
  leaves: LeaveRow[];
  quizzes: AdminQuizRow[];
  quizRequests: QuizReattemptRow[];
  quizScoreboard: QuizScoreboard;
  loginLogs: LoginLogRow[];
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const router = useRouter();
  const saveSub = useCallback(saveAdminSubscription, []);
  usePushSubscription(saveSub);

  const openQuestions = questions.filter((q) => q.status === "open").length;
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const pendingQuizReqs = quizRequests.filter((r) => r.status === "pending").length;

  const tabs: [Tab, string][] = [
    ["dashboard", "Dashboard"],
    ["students", "Students"],
    ["sessions", "Sessions"],
    ["payments", "Payments"],
    ["topics", "Topics"],
    ["curriculum", "Course"],
    ["library", "Library"],
    ["assignments", "Tasks"],
    ["quiz", "Quiz"],
    ["questions", "Questions"],
    ["leave", "Leave"],
    ["logs", "Logs"],
  ];

  return (
    <main className="min-h-screen max-w-3xl mx-auto p-4 sm:p-6">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">ClassGate Admin</h1>
        <button
          onClick={() => adminLogout().then(() => router.refresh())}
          className="text-sm text-slate-500 underline"
        >
          Log out
        </button>
      </header>

      <nav className="flex gap-1 bg-slate-200/60 p-1 rounded-2xl mb-5 overflow-x-auto">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              tab === t ? "bg-white shadow-sm text-brand-700" : "text-slate-600"
            }`}
          >
            {label}
            {t === "questions" && openQuestions > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 align-middle">
                {openQuestions}
              </span>
            )}
            {t === "leave" && pendingLeaves > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 align-middle">
                {pendingLeaves}
              </span>
            )}
            {t === "quiz" && pendingQuizReqs > 0 && (
              <span className="ml-1 inline-flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 align-middle">
                {pendingQuizReqs}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <DashboardTab stats={dashboardStats} students={students} />}
      {tab === "students" && <StudentsTab students={students} />}
      {tab === "sessions" && (
        <SessionsTab openSession={openSession} attendees={attendees} sessions={sessions} />
      )}
      {tab === "payments" && <PaymentsTab students={students} />}
      {tab === "topics" && <TopicsTab topics={topics} />}
      {tab === "curriculum" && <CourseTab weeks={curriculum} outcomes={outcomes} />}
      {tab === "library" && <LibraryTab resources={resources} />}
      {tab === "assignments" && <AssignmentsTab matrix={assignmentMatrix} />}
      {tab === "quiz" && (
        <QuizTab quizzes={quizzes} requests={quizRequests} scoreboard={quizScoreboard} />
      )}
      {tab === "questions" && <QuestionsTab questions={questions} />}
      {tab === "leave" && <LeaveTab leaves={leaves} />}
      {tab === "logs" && <LogsTab logs={loginLogs} />}
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5 mb-4">
      {children}
    </section>
  );
}

function fieldClass() {
  return "w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none";
}

function fmt(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

/** Format an ISO timestamp for a <input type="datetime-local"> default value. */
function toDatetimeLocal(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  hint,
  tone = "slate",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "rose" | "emerald" | "brand" | "slate" | "amber";
  icon?: string;
}) {
  const tones: Record<string, { value: string; chip: string }> = {
    rose: { value: "text-rose-600", chip: "bg-rose-50 text-rose-600" },
    emerald: { value: "text-emerald-600", chip: "bg-emerald-50 text-emerald-600" },
    brand: { value: "text-brand-700", chip: "bg-brand-50 text-brand-700" },
    amber: { value: "text-amber-600", chip: "bg-amber-50 text-amber-600" },
    slate: { value: "text-slate-800", chip: "bg-slate-100 text-slate-600" },
  };
  const t = tones[tone];
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-slate-500 text-xs font-medium">{label}</p>
        {icon && (
          <span className={`h-7 w-7 grid place-items-center rounded-lg text-sm ${t.chip}`}>
            {icon}
          </span>
        )}
      </div>
      <p className={`text-xl sm:text-2xl font-bold leading-tight ${t.value}`}>{value}</p>
      {hint && <p className="text-slate-400 text-xs">{hint}</p>}
    </div>
  );
}

/** Small horizontal "X of Y" progress bar used in the Top dues / tasks lists. */
function MiniBar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full rounded-full ${tone}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl bg-white shadow-lg ring-1 ring-slate-200 px-3 py-2 text-xs">
      {label && <p className="font-semibold text-slate-700 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Normalize a free-text gender value into one of our known buckets. */
function genderBucket(g: string | null): "female" | "male" | "other" | "unspecified" {
  const v = (g ?? "").trim().toLowerCase();
  if (v === "female" || v === "f") return "female";
  if (v === "male" || v === "m") return "male";
  if (v === "other") return "other";
  return "unspecified";
}

const GENDER_META: Record<string, { label: string; color: string }> = {
  female: { label: "Female", color: "#ec4899" },
  male: { label: "Male", color: "#3b82f6" },
  other: { label: "Other", color: "#a78bfa" },
  unspecified: { label: "Unspecified", color: "#cbd5e1" },
};

function DashboardTab({ stats, students }: { stats: DashboardStats; students: StudentRow[] }) {
  const statusData = [
    { name: "Active", value: stats.students.active },
    { name: "Inactive", value: stats.students.inactive },
  ];
  const STATUS_COLORS = ["#10b981", "#cbd5e1"];

  // Gender breakdown computed from the live student list (no DB change needed).
  const genderCounts = students.reduce(
    (acc, s) => {
      acc[genderBucket(s.gender)]++;
      return acc;
    },
    { female: 0, male: 0, other: 0, unspecified: 0 }
  );
  const genderData = (["female", "male", "other", "unspecified"] as const)
    .map((k) => ({ name: GENDER_META[k].label, value: genderCounts[k], color: GENDER_META[k].color }))
    .filter((d) => d.value > 0);

  const attendanceData = stats.attendance.map((s) => {
    const d = new Date(s.scheduled_at);
    return {
      name: Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      Present: s.present,
      Absent: s.absent,
    };
  });

  // Overall attendance rate across the recent classes shown.
  const totalPresent = stats.attendance.reduce((n, s) => n + s.present, 0);
  const totalMarked = stats.attendance.reduce((n, s) => n + s.present + s.absent, 0);
  const attendanceRate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : null;

  const assignmentData = stats.assignments.map((a) => ({
    name: a.title.length > 14 ? a.title.slice(0, 13) + "…" : a.title,
    Done: a.done,
    Pending: Math.max(0, a.total - a.done),
  }));

  const maxDebt = Math.max(1, ...stats.topDebtors.map((d) => d.balance));

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Students"
          value={String(stats.students.total)}
          hint={`${stats.students.active} active · ${stats.students.inactive} inactive`}
          tone="brand"
          icon="👥"
        />
        <StatCard
          label="Attendance"
          value={attendanceRate === null ? "—" : `${attendanceRate}%`}
          hint={
            attendanceRate === null
              ? "No classes marked yet"
              : `${totalPresent} present of ${totalMarked}`
          }
          tone="emerald"
          icon="📈"
        />
        <StatCard
          label="Outstanding"
          value={`Rs ${stats.money.outstanding.toLocaleString()}`}
          hint="Dues not yet paid"
          tone="rose"
          icon="⏳"
        />
        <StatCard
          label="Collected"
          value={`Rs ${stats.money.payments.toLocaleString()}`}
          hint={`Rs ${stats.money.penalties.toLocaleString()} charged`}
          tone="slate"
          icon="💰"
        />
      </div>

      {/* Attendance trend */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Attendance — recent classes</h2>
          {attendanceRate !== null && (
            <span className="text-xs rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 font-semibold">
              {attendanceRate}% present
            </span>
          )}
        </div>
        {attendanceData.length === 0 ? (
          <EmptyChart label="No sessions yet." />
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={attendanceData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Present" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={48} />
              <Bar dataKey="Absent" stackId="a" fill="#f43f5e" radius={[6, 6, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Student status donut */}
        <Card>
          <h2 className="font-bold mb-3">Student status</h2>
          {stats.students.total === 0 ? (
            <EmptyChart label="No students yet." />
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={STATUS_COLORS[i]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center -translate-y-3">
                <span className="text-2xl font-bold text-slate-800">{stats.students.total}</span>
                <span className="text-xs text-slate-400">students</span>
              </div>
            </div>
          )}
        </Card>

        {/* Top dues */}
        <Card>
          <h2 className="font-bold mb-3">Top dues</h2>
          {stats.topDebtors.length === 0 ? (
            <div className="grid place-items-center h-[200px] text-center">
              <div>
                <p className="text-3xl mb-1">🎉</p>
                <p className="text-slate-400 text-sm">Everyone is clear.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {stats.topDebtors.map((d, i) => (
                <li key={i} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="truncate font-medium text-slate-700">{d.name}</span>
                    <span className="text-rose-600 font-semibold shrink-0">
                      Rs {d.balance.toLocaleString()}
                    </span>
                  </div>
                  <MiniBar pct={(d.balance / maxDebt) * 100} tone="bg-rose-500" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Students by gender */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Students by gender</h2>
          <span className="text-xs text-slate-400">Filter the full list in the Students tab</span>
        </div>
        {genderData.length === 0 ? (
          <EmptyChart label="No students yet." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="relative">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={genderData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={84}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {genderData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-slate-800">{students.length}</span>
                <span className="text-xs text-slate-400">students</span>
              </div>
            </div>
            <ul className="space-y-2">
              {genderData.map((d) => {
                const pct = students.length ? Math.round((d.value / students.length) * 100) : 0;
                return (
                  <li key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="font-medium text-slate-700">{d.name}</span>
                    <span className="ml-auto font-semibold text-slate-800">{d.value}</span>
                    <span className="text-slate-400 text-xs w-10 text-right">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      {/* Task completion */}
      <Card>
        <h2 className="font-bold mb-3">Task completion</h2>
        {assignmentData.length === 0 ? (
          <EmptyChart label="No assignments yet." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, assignmentData.length * 46)}>
            <BarChart
              data={assignmentData}
              layout="vertical"
              margin={{ top: 0, left: 8, right: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
              <XAxis type="number" allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={100} fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Done" stackId="b" fill="#10b981" maxBarSize={26} />
              <Bar dataKey="Pending" stackId="b" fill="#e2e8f0" radius={[0, 6, 6, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}

/** Centered placeholder shown in a chart card when there is nothing to plot. */
function EmptyChart({ label }: { label: string }) {
  return (
    <div className="grid place-items-center h-[200px] rounded-xl bg-slate-50 text-slate-400 text-sm">
      {label}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------
function StudentsTab({ students }: { students: StudentRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [genderFilter, setGenderFilter] = useState<
    "all" | "female" | "male" | "other" | "unspecified"
  >("all");
  const [copied, setCopied] = useState(false);
  const addRef = useRef<HTMLFormElement>(null);
  const bulkRef = useRef<HTMLFormElement>(null);

  // Counts per gender bucket (for the filter chips) + the filtered list.
  const counts = { all: students.length, female: 0, male: 0, other: 0, unspecified: 0 };
  for (const s of students) counts[genderBucket(s.gender)]++;
  const filtered =
    genderFilter === "all"
      ? students
      : students.filter((s) => genderBucket(s.gender) === genderFilter);

  async function copyEmails() {
    const emails = filtered.map((s) => s.email).filter(Boolean).join(", ");
    if (!emails) return;
    try {
      await navigator.clipboard.writeText(emails);
    } catch {
      window.prompt("Emails:", emails);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const filterChips: [typeof genderFilter, string][] = [
    ["all", `All (${counts.all})`],
    ["female", `Female (${counts.female})`],
    ["male", `Male (${counts.male})`],
    ["other", `Other (${counts.other})`],
    ["unspecified", `Unspecified (${counts.unspecified})`],
  ];

  function onAdd(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await addStudent(formData);
      if (res.error) setError(res.error);
      else addRef.current?.reset();
      router.refresh();
    });
  }

  function onBulk(formData: FormData) {
    setBulkMsg(null);
    start(async () => {
      const res = await bulkAddStudents(formData);
      if (res.error) setBulkMsg(res.error);
      else {
        setBulkMsg(`Created ${res.created} student(s).`);
        bulkRef.current?.reset();
      }
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">Add student</h2>
        <form ref={addRef} action={onAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input name="name" placeholder="Name" className={fieldClass()} />
          <input name="whatsapp" placeholder="WhatsApp" className={fieldClass()} />
          <select name="gender" className={fieldClass()} defaultValue="">
            <option value="" disabled>
              Gender
            </option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
          <div />
          <input name="email" type="email" placeholder="Login email" className={fieldClass()} />
          <input name="password" type="text" placeholder="Login password" className={fieldClass()} />
          <button
            type="submit"
            disabled={pending}
            className="sm:col-span-2 rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Add student
          </button>
        </form>
        <p className="text-slate-400 text-xs mt-2">
          Email + password give the student a portal login. Leave blank to add later.
        </p>
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Bulk add</h2>
        <p className="text-slate-500 text-sm mb-2">
          One per line: <code>name, whatsapp, gender, email, password</code> (only name required)
        </p>
        <form ref={bulkRef} action={onBulk}>
          <textarea
            name="bulk"
            rows={4}
            placeholder={"Ayesha, +923001234567, female, ayesha@mail.com, pass123\nBilal, +923009876543, male"}
            className={fieldClass() + " font-mono text-sm"}
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-xl bg-slate-800 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Create all
          </button>
        </form>
        {bulkMsg && <p className="text-emerald-600 text-sm mt-2">{bulkMsg}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3 gap-2">
          <h2 className="font-bold">
            Students{" "}
            <span className="text-slate-400 font-normal">
              ({filtered.length}
              {genderFilter !== "all" ? ` of ${students.length}` : ""})
            </span>
          </h2>
          <button
            onClick={copyEmails}
            disabled={filtered.every((s) => !s.email)}
            className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1 disabled:opacity-40"
            title="Copy the email of every student shown"
          >
            {copied ? "Copied!" : "Copy emails"}
          </button>
        </div>

        {/* Gender filter */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {filterChips.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setGenderFilter(key)}
              className={`text-xs rounded-full px-3 py-1.5 font-medium border transition ${
                genderFilter === key
                  ? "bg-brand-600 border-brand-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Gender</th>
                <th className="py-2 px-2">Login</th>
                <th className="py-2 px-2 text-right">Balance</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 px-2 font-medium">{s.name}</td>
                  <td className="py-2 px-2 capitalize text-slate-600">
                    {s.gender ? (
                      s.gender
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-slate-600">
                    {s.has_login ? (
                      <span className="text-xs">{s.email}</span>
                    ) : (
                      <span className="text-xs text-amber-600">no login</span>
                    )}
                  </td>
                  <td
                    className={`py-2 px-2 text-right font-semibold ${
                      s.balance > 0 ? "text-rose-600" : "text-slate-700"
                    }`}
                  >
                    {s.balance > 0 ? `Rs ${s.balance}` : "—"}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() =>
                        start(async () => {
                          await setStudentStatus(
                            s.id,
                            s.status === "active" ? "inactive" : "active"
                          );
                          router.refresh();
                        })
                      }
                      className={`text-xs rounded-full px-2 py-0.5 ${
                        s.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                      title="Click to toggle"
                    >
                      {s.status}
                    </button>
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => setSelected(s)}
                      className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
                    >
                      View / Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    {students.length === 0 ? "No students yet." : "No students match this filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <StudentDetailModal student={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function StudentDetailModal({
  student,
  onClose,
}: {
  student: StudentRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const studentId = student.id;
  const [data, setData] = useState<StudentDetail | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [copiedPw, setCopiedPw] = useState(false);
  // Locally track the editable fields so the form + title reflect saved edits
  // immediately (the `student` prop stays stale until the page re-renders).
  const [details, setDetails] = useState({
    name: student.name,
    whatsapp: student.whatsapp ?? "",
    gender: student.gender ?? "",
  });
  const credRef = useRef<HTMLFormElement>(null);

  async function load() {
    setData(await getStudentDetail(studentId));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  function onCreds(formData: FormData) {
    setMsg(null);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    start(async () => {
      const res = await setStudentCredentials(studentId, email, password);
      if (res.error) setMsg(res.error);
      else {
        setMsg("Login saved.");
        credRef.current?.reset();
        await load();
        router.refresh();
      }
    });
  }

  function onEdit(formData: FormData) {
    setEditMsg(null);
    // Capture the submitted values before the async call so we can reflect
    // them in the UI right after a successful save.
    const next = {
      name: String(formData.get("name") ?? "").trim(),
      whatsapp: String(formData.get("whatsapp") ?? "").trim(),
      gender: String(formData.get("gender") ?? "").trim(),
    };
    start(async () => {
      try {
        const res = await updateStudent(studentId, formData);
        if (res.error) {
          setEditMsg(res.error);
          return;
        }
        setDetails(next);
        setEditMsg("Saved.");
        router.refresh();
      } catch (e) {
        setEditMsg(e instanceof Error ? e.message : "Could not save details.");
      }
    });
  }

  function onDelete() {
    if (
      !confirm(
        `Delete ${details.name} permanently? This also removes their attendance, fees and assignment records. This cannot be undone.`
      )
    )
      return;
    setEditMsg(null);
    start(async () => {
      try {
        const res = await deleteStudent(studentId);
        if (res.error) {
          setEditMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setEditMsg(e instanceof Error ? e.message : "Could not delete student.");
      }
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
          <h2 className="text-lg font-bold">{details.name}</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Edit + Delete depend only on the student row, so keep them
            available even while (or if) the detail panel fails to load. */}
        <div className="rounded-xl bg-slate-50 p-3 mb-4">
          <h3 className="font-semibold text-sm mb-2">Edit details</h3>
          <form action={onEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              key={`name-${details.name}`}
              name="name"
              defaultValue={details.name}
              placeholder="Name"
              className={fieldClass()}
            />
            <input
              key={`wa-${details.whatsapp}`}
              name="whatsapp"
              defaultValue={details.whatsapp}
              placeholder="WhatsApp"
              className={fieldClass()}
            />
            <select
              key={`g-${details.gender}`}
              name="gender"
              defaultValue={details.gender}
              className={fieldClass()}
            >
              <option value="">Gender</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
            <button
              type="submit"
              disabled={pending}
              className="rounded-xl bg-slate-800 px-4 py-2 text-white font-semibold disabled:opacity-50"
            >
              Save details
            </button>
          </form>
          {editMsg && <p className="text-sm mt-2 text-slate-600">{editMsg}</p>}
        </div>

        {!data ? (
          <p className="text-slate-400 text-sm">Loading…</p>
        ) : (
          <>
            <p className="text-sm mb-4">
              Balance:{" "}
              <span className={data.balance > 0 ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                {data.balance > 0 ? `Rs ${data.balance} due` : "clear"}
              </span>
            </p>

            {data.email && (
              <div className="rounded-xl border border-slate-200 p-3 mb-3">
                <h3 className="font-semibold text-sm mb-2">Login details</h3>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Email</span>
                    <span className="font-medium break-all text-right">{data.email}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Password</span>
                    {data.password ? (
                      <span className="flex items-center gap-2">
                        <span className="font-mono">
                          {showPw ? data.password : "•".repeat(Math.max(6, data.password.length))}
                        </span>
                        <button
                          onClick={() => setShowPw((v) => !v)}
                          className="text-xs rounded-lg border border-slate-300 px-2 py-0.5"
                        >
                          {showPw ? "Hide" : "Show"}
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(data.password!);
                            } catch {
                              window.prompt("Password:", data.password!);
                            }
                            setCopiedPw(true);
                            setTimeout(() => setCopiedPw(false), 1500);
                          }}
                          className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-0.5"
                        >
                          {copiedPw ? "Copied!" : "Copy"}
                        </button>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs text-right">
                        Not viewable — set a new one below
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-3 mb-4">
              <h3 className="font-semibold text-sm mb-2">
                {data.email ? "Change login" : "Set login"}
              </h3>
              <form ref={credRef} action={onCreds} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  name="email"
                  type="email"
                  defaultValue={data.email ?? ""}
                  placeholder="Email"
                  className={fieldClass()}
                />
                <input
                  name="password"
                  type="text"
                  placeholder="New password"
                  className={fieldClass()}
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="sm:col-span-2 rounded-xl bg-brand-600 px-4 py-2 text-white font-semibold disabled:opacity-50"
                >
                  Save login
                </button>
              </form>
              {msg && <p className="text-sm mt-2 text-slate-600">{msg}</p>}
            </div>

            <h3 className="font-semibold text-sm mb-1">Assignments</h3>
            <ul className="text-sm mb-4 divide-y">
              {data.assignments.length === 0 && (
                <li className="text-slate-400 py-1">None</li>
              )}
              {data.assignments.map((a, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span>{a.title}</span>
                  <span className={a.status === "done" ? "text-emerald-600" : "text-amber-600"}>
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>

            <h3 className="font-semibold text-sm mb-1">Attendance</h3>
            <ul className="text-sm mb-4 divide-y">
              {data.attendance.length === 0 && (
                <li className="text-slate-400 py-1">None</li>
              )}
              {data.attendance.map((a, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span>
                    {a.title}
                    <span className="text-slate-400 text-xs"> · {fmt(a.scheduled_at)}</span>
                  </span>
                  <span className={a.status === "present" ? "text-emerald-600" : "text-rose-600"}>
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-sm">Fee history</h3>
              <span className="text-slate-400 text-xs">Edit fees in the Payments tab</span>
            </div>
            <ul className="text-sm divide-y">
              {data.ledger.length === 0 && <li className="text-slate-400 py-1">None</li>}
              {data.ledger.map((l) => (
                <li key={l.id} className="flex justify-between py-1.5">
                  <span>
                    {l.reason || l.type}
                    <span className="text-slate-400 text-xs"> · {fmt(l.created_at)}</span>
                  </span>
                  <span className={l.type === "penalty" ? "text-rose-600" : "text-emerald-600"}>
                    {l.type === "penalty" ? "+" : "−"}Rs {l.amount}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="border-t mt-5 pt-4">
          <button
            onClick={onDelete}
            disabled={pending}
            className="w-full rounded-xl border border-rose-300 text-rose-700 px-4 py-2.5 font-semibold disabled:opacity-50"
          >
            Delete student permanently
          </button>
          <p className="text-slate-400 text-xs mt-2 text-center">
            Removes the student and all their attendance, fees and assignment records.
          </p>
        </div>
      </div>
    </div>
  );
}

function LedgerRow({
  entry,
  onChanged,
}: {
  entry: StudentDetail["ledger"][number];
  onChanged: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setErr(null);
    start(async () => {
      const res = await updateLedgerEntry(entry.id, formData);
      if (res.error) {
        setErr(res.error);
        return;
      }
      setEditing(false);
      await onChanged();
    });
  }

  function onDelete() {
    if (!confirm("Delete this fee entry? This changes the student's balance.")) return;
    setErr(null);
    start(async () => {
      const res = await deleteLedgerEntry(entry.id);
      if (res.error) {
        setErr(res.error);
        return;
      }
      await onChanged();
    });
  }

  if (editing) {
    return (
      <li className="py-2">
        <form action={onSave} className="grid grid-cols-2 gap-2">
          <select name="type" defaultValue={entry.type} className={fieldClass()}>
            <option value="penalty">Fee (penalty)</option>
            <option value="payment">Payment</option>
          </select>
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            defaultValue={entry.amount}
            placeholder="Amount"
            className={fieldClass()}
          />
          <input
            name="reason"
            defaultValue={entry.reason ?? ""}
            placeholder="Reason"
            className={fieldClass() + " col-span-2"}
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-xl bg-brand-600 px-3 py-2 text-white font-semibold disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setErr(null);
            }}
            disabled={pending}
            className="rounded-xl border border-slate-300 px-3 py-2 font-semibold"
          >
            Cancel
          </button>
        </form>
        {err && <p className="text-rose-600 text-xs mt-1">{err}</p>}
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {entry.session_title || entry.reason || entry.type}
        </span>
        <span className="text-slate-400 text-xs block">
          {entry.session_title && entry.reason ? `${entry.reason} · ` : ""}
          {fmt(entry.session_scheduled_at || entry.created_at)}
        </span>
      </span>
      <div className="flex items-center gap-2 shrink-0">
        <span className={entry.type === "penalty" ? "text-rose-600" : "text-emerald-600"}>
          {entry.type === "penalty" ? "+" : "−"}Rs {entry.amount}
        </span>
        <button
          onClick={() => setEditing(true)}
          className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-0.5"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          disabled={pending}
          className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-0.5 disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
function SessionsTab({
  openSession,
  attendees,
  sessions,
}: {
  openSession: SessionRow | null;
  attendees: AttendeeRow[];
  sessions: SessionRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const scheduleRef = useRef<HTMLFormElement>(null);

  function onSchedule(formData: FormData) {
    setError(null);
    const local = String(formData.get("scheduled_at") ?? "");
    if (local) {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) formData.set("scheduled_at", d.toISOString());
    }
    start(async () => {
      const res = await scheduleSession(formData);
      if (res.error) setError(res.error);
      else scheduleRef.current?.reset();
      router.refresh();
    });
  }

  function onStart(s: SessionRow) {
    if (!confirm(`Start "${s.title}" now? Students will be able to check in.`)) return;
    setError(null);
    start(async () => {
      try {
        const res = await startSession(s.id);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not start session.");
      }
    });
  }

  function onDelete(s: SessionRow) {
    if (
      !confirm(
        `Delete "${s.title}"? This removes its attendance and any absence penalties charged for it. This cannot be undone.`
      )
    )
      return;
    setError(null);
    start(async () => {
      try {
        const res = await deleteSession(s.id);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete session.");
      }
    });
  }

  function onCreate(formData: FormData) {
    setError(null);
    // Convert the timezone-less datetime-local value (interpreted in the
    // admin's local time) into an absolute UTC ISO timestamp, so the server's
    // check-in window math is correct regardless of server timezone.
    const local = String(formData.get("scheduled_at") ?? "");
    if (local) {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) formData.set("scheduled_at", d.toISOString());
    }
    start(async () => {
      const res = await createSession(formData);
      if (res.error) setError(res.error);
      else formRef.current?.reset();
      router.refresh();
    });
  }

  const presentCount = attendees.filter((a) => a.present).length;
  const allowed = attendees.filter((a) => a.present);
  const waiting = attendees.filter((a) => !a.present);
  const [copied, setCopied] = useState(false);

  async function copyAllowedEmails() {
    const emails = allowed.map((a) => a.email).filter(Boolean).join(", ");
    try {
      await navigator.clipboard.writeText(emails);
    } catch {
      window.prompt("Allowed emails:", emails);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">Start class now</h2>
        <p className="text-slate-500 text-sm mb-3">
          Opens check-in immediately and closes any session that is still open.
        </p>
        <form ref={formRef} action={onCreate} className="space-y-2">
          <input name="title" placeholder="Title (e.g. Algebra — Lesson 5)" className={fieldClass()} />
          <input name="scheduled_at" type="datetime-local" className={fieldClass()} />
          <input name="meet_link" placeholder="https://meet.google.com/xxx-xxxx-xxx" className={fieldClass()} />
          <input name="code" placeholder="Spoken code word" className={fieldClass()} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Create &amp; open session
          </button>
        </form>
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Schedule next class</h2>
        <p className="text-slate-500 text-sm mb-3">
          Adds an upcoming class. Students see a countdown to it but can&apos;t check in
          until you press <span className="font-semibold">Start</span> at class time.
        </p>
        <form ref={scheduleRef} action={onSchedule} className="space-y-2">
          <input name="title" placeholder="Title (e.g. Algebra — Lesson 6)" className={fieldClass()} />
          <input name="scheduled_at" type="datetime-local" className={fieldClass()} />
          <input name="meet_link" placeholder="https://meet.google.com/xxx-xxxx-xxx" className={fieldClass()} />
          <input name="code" placeholder="Spoken code word" className={fieldClass()} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Schedule class
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Live session</h2>
        {!openSession ? (
          <p className="text-slate-500 text-sm">No session is open right now.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold">{openSession.title}</p>
                <p className="text-slate-500 text-sm">
                  Code: <span className="font-mono">{openSession.code}</span> ·{" "}
                  {fmt(openSession.scheduled_at)}
                </p>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
                open
              </span>
            </div>

            <p className="text-sm text-slate-600 mb-3">
              Present {presentCount} / {attendees.length}
            </p>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-emerald-800">
                  ✅ Allowed in Meet ({allowed.length})
                </h3>
                <button
                  onClick={copyAllowedEmails}
                  disabled={allowed.length === 0}
                  className="text-xs rounded-lg border border-emerald-300 text-emerald-700 px-2 py-1 disabled:opacity-40"
                >
                  {copied ? "Copied!" : "Copy emails"}
                </button>
              </div>
              <p className="text-emerald-700/80 text-xs mb-2">
                In Google Meet, admit ONLY these emails. Deny anyone else.
              </p>
              {allowed.length === 0 ? (
                <p className="text-slate-400 text-sm">Nobody has checked in yet.</p>
              ) : (
                <ul className="divide-y divide-emerald-100 text-sm">
                  {allowed.map((a) => (
                    <li key={a.student_id} className="py-1.5">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-slate-500">
                        {" "}
                        — {a.email ?? <span className="text-amber-600">no email on file</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3 mb-4">
              <h3 className="font-semibold text-sm text-slate-600 mb-1">
                ⛔ Not checked in yet ({waiting.length})
              </h3>
              <p className="text-slate-400 text-xs mb-2">Do not admit these emails.</p>
              {waiting.length === 0 ? (
                <p className="text-slate-400 text-sm">Everyone is in.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {waiting.map((a) => (
                    <li key={a.student_id} className="flex items-center justify-between py-1.5">
                      <span>{a.name}</span>
                      <span className="text-slate-400">not yet</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={() =>
                start(async () => {
                  if (
                    !confirm(
                      "Close this session? Every active student who hasn't checked in will be marked absent and charged Rs 200."
                    )
                  )
                    return;
                  const res = await closeSession(openSession.id);
                  if (res.error) setError(res.error);
                  router.refresh();
                })
              }
              disabled={pending}
              className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
            >
              Close session &amp; charge absentees
            </button>
          </>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Recent sessions</h2>
        {error && <p className="text-rose-600 text-sm mb-2">{error}</p>}
        <ul className="divide-y text-sm">
          {sessions.map((s) => {
            const upcoming = !s.is_open && !s.closed_at;
            const status = s.is_open ? "open" : upcoming ? "upcoming" : "closed";
            const statusClass = s.is_open
              ? "bg-emerald-100 text-emerald-700"
              : upcoming
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-200 text-slate-600";
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-slate-500">{fmt(s.scheduled_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs rounded-full px-2 py-0.5 ${statusClass}`}>
                    {status}
                  </span>
                  {upcoming && (
                    <button
                      onClick={() => onStart(s)}
                      disabled={pending}
                      className="text-xs rounded-lg bg-emerald-600 text-white px-2 py-1 disabled:opacity-50"
                    >
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(s)}
                    className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDelete(s)}
                    disabled={pending}
                    className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
          {sessions.length === 0 && (
            <li className="py-6 text-center text-slate-400">No sessions yet.</li>
          )}
        </ul>
      </Card>

      {editing && (
        <SessionEditModal session={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function SessionEditModal({
  session,
  onClose,
}: {
  session: SessionRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setMsg(null);
    // Convert the local datetime-local value to an absolute UTC ISO timestamp.
    const local = String(formData.get("scheduled_at") ?? "");
    if (local) {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) formData.set("scheduled_at", d.toISOString());
    }
    start(async () => {
      try {
        const res = await updateSession(session.id, formData);
        if (res.error) {
          setMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not save session.");
      }
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
          <h2 className="text-lg font-bold">Edit session</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        <form action={onSave} className="space-y-2">
          <input
            name="title"
            defaultValue={session.title}
            placeholder="Title"
            className={fieldClass()}
          />
          <input
            name="scheduled_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(session.scheduled_at)}
            className={fieldClass()}
          />
          <input
            name="meet_link"
            defaultValue={session.meet_link}
            placeholder="https://meet.google.com/xxx-xxxx-xxx"
            className={fieldClass()}
          />
          <input
            name="code"
            defaultValue={session.code}
            placeholder="Spoken code word"
            className={fieldClass()}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Save changes
          </button>
        </form>
        {msg && <p className="text-sm mt-2 text-slate-600">{msg}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
function PaymentsTab({ students }: { students: StudentRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q)
      )
    : students;

  function onPay(formData: FormData) {
    setError(null);
    setOk(null);
    start(async () => {
      const res = await recordPayment(formData);
      if (res.error) setError(res.error);
      else {
        setOk("Payment recorded.");
        formRef.current?.reset();
      }
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">Record payment</h2>
        <form ref={formRef} action={onPay} className="space-y-2">
          <select name="student_id" className={fieldClass()} defaultValue="">
            <option value="" disabled>
              Pick a student
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.balance > 0 ? ` — owes Rs ${s.balance}` : ""}
              </option>
            ))}
          </select>
          <input
            name="amount"
            type="number"
            min="1"
            step="1"
            placeholder="Amount (Rs)"
            className={fieldClass()}
          />
          <input name="reason" placeholder="Reason (optional)" className={fieldClass()} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Record payment
          </button>
        </form>
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
        {ok && <p className="text-emerald-600 text-sm mt-2">{ok}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Balances &amp; fees</h2>
        <p className="text-slate-500 text-sm mb-3">
          Tap a student to view, edit or remove their fee &amp; payment entries.
        </p>

        <div className="relative mb-3">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            🔍
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-xl border border-slate-300 pl-9 pr-9 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xl leading-none px-1"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
        {q && (
          <p className="text-xs text-slate-400 mb-2">
            Showing {filtered.length} of {students.length}
          </p>
        )}

        <ul className="divide-y text-sm">
          {filtered.map((s) => (
            <StudentBalanceRow key={s.id} student={s} />
          ))}
          {students.length === 0 ? (
            <li className="py-6 text-center text-slate-400">No students yet.</li>
          ) : (
            filtered.length === 0 && (
              <li className="py-6 text-center text-slate-400">No student matches “{query}”.</li>
            )
          )}
        </ul>
      </Card>
    </>
  );
}

function StudentBalanceRow({ student }: { student: StudentRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setDetail(await getStudentDetail(student.id));
    setLoading(false);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !detail) load();
  }

  return (
    <li className="py-2">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>
            ▶
          </span>
          <span className="truncate font-medium">{student.name}</span>
        </span>
        <span
          className={student.balance > 0 ? "text-rose-600 font-semibold" : "text-slate-400"}
        >
          {student.balance > 0 ? `Rs ${student.balance}` : "clear"}
        </span>
      </button>

      {open && (
        <div className="mt-2 ml-6 rounded-xl bg-slate-50 p-2">
          {loading && !detail ? (
            <p className="text-slate-400 text-sm py-1 px-1">Loading…</p>
          ) : !detail || detail.ledger.length === 0 ? (
            <p className="text-slate-400 text-sm py-1 px-1">No fees or payments yet.</p>
          ) : (
            <ul className="text-sm divide-y">
              {detail.ledger.map((l) => (
                <LedgerRow
                  key={l.id}
                  entry={l}
                  onChanged={async () => {
                    await load();
                    router.refresh();
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------
function TopicsTab({ topics }: { topics: TopicRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TopicRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onCreate(formData: FormData) {
    setError(null);
    const local = String(formData.get("planned_at") ?? "");
    if (local) {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) formData.set("planned_at", d.toISOString());
    }
    start(async () => {
      const res = await createTopic(formData);
      if (res.error) setError(res.error);
      else formRef.current?.reset();
      router.refresh();
    });
  }

  const upcoming = topics.filter((t) => !t.is_covered);
  const past = topics.filter((t) => t.is_covered);

  function row(t: TopicRow) {
    return (
      <li key={t.id} className="flex items-start justify-between gap-2 py-2">
        <div>
          <p className="font-medium">{t.title}</p>
          {t.description && <p className="text-slate-600 text-sm">{t.description}</p>}
          {t.planned_at && (
            <p className="text-slate-400 text-xs">{fmt(t.planned_at)}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() =>
              start(async () => {
                await setTopicCovered(t.id, !t.is_covered);
                router.refresh();
              })
            }
            className={`text-xs rounded-full px-2 py-0.5 ${
              t.is_covered ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {t.is_covered ? "covered" : "mark covered"}
          </button>
          <button
            onClick={() => setEditing(t)}
            className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
          >
            Edit
          </button>
          <button
            onClick={() =>
              start(async () => {
                if (!confirm("Delete this topic?")) return;
                await deleteTopic(t.id);
                router.refresh();
              })
            }
            className="text-xs text-slate-400"
          >
            ✕
          </button>
        </div>
      </li>
    );
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">Add topic</h2>
        <form ref={formRef} action={onCreate} className="space-y-2">
          <input name="title" placeholder="Topic title" className={fieldClass()} />
          <input name="description" placeholder="Short description (optional)" className={fieldClass()} />
          <input name="planned_at" type="datetime-local" className={fieldClass()} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Add to roadmap
          </button>
        </form>
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-2">📌 Coming up</h2>
        <ul className="divide-y">
          {upcoming.map(row)}
          {upcoming.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">Nothing scheduled.</li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-2">✅ Covered</h2>
        <ul className="divide-y">
          {past.map(row)}
          {past.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">Nothing yet.</li>
          )}
        </ul>
      </Card>

      {editing && (
        <TopicEditModal topic={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function TopicEditModal({
  topic,
  onClose,
}: {
  topic: TopicRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setMsg(null);
    // Convert the local datetime-local value to an absolute UTC ISO timestamp.
    const local = String(formData.get("planned_at") ?? "");
    if (local) {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) formData.set("planned_at", d.toISOString());
    }
    start(async () => {
      try {
        const res = await updateTopic(topic.id, formData);
        if (res.error) {
          setMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not save topic.");
      }
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
          <h2 className="text-lg font-bold">Edit topic</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        <form action={onSave} className="space-y-2">
          <input
            name="title"
            defaultValue={topic.title}
            placeholder="Topic title"
            className={fieldClass()}
          />
          <input
            name="description"
            defaultValue={topic.description ?? ""}
            placeholder="Short description (optional)"
            className={fieldClass()}
          />
          <input
            name="planned_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(topic.planned_at)}
            className={fieldClass()}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Save changes
          </button>
        </form>
        {msg && <p className="text-sm mt-2 text-slate-600">{msg}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Library (recorded lectures + slides / materials)
// ---------------------------------------------------------------------------
function LibraryTab({ resources }: { resources: ResourceRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onCreate(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await createResource(formData);
      if (res.error) setError(res.error);
      else formRef.current?.reset();
      router.refresh();
    });
  }

  function onDelete(r: ResourceRow) {
    if (!confirm(`Delete "${r.title}" from the library? This cannot be undone.`)) return;
    setError(null);
    start(async () => {
      const res = await deleteResource(r.id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">Add to library</h2>
        <p className="text-slate-500 text-sm mb-3">
          Add recorded lectures (YouTube) and/or slides &amp; materials (Google Drive) for a
          class. You can add <span className="font-semibold">several links</span> — one per
          line. Every student sees these on their{" "}
          <span className="font-semibold">Library</span> tab.
        </p>
        <form ref={formRef} action={onCreate} className="space-y-2">
          <input name="title" placeholder="Title (e.g. Week 2 — How the Internet Works)" className={fieldClass()} />
          <input name="description" placeholder="Short note (optional)" className={fieldClass()} />
          <div>
            <textarea
              name="video_url"
              rows={3}
              placeholder={"Recording links — YouTube (one per line)\nPart 1 | https://youtu.be/xxxx\nhttps://youtu.be/yyyy"}
              className={fieldClass() + " font-mono text-sm"}
            />
            <p className="text-slate-400 text-xs mt-1">
              One link per line. To name a link, put the name before a “|”, e.g.{" "}
              <span className="font-mono">Part 1 | https://youtu.be/…</span>
            </p>
          </div>
          <textarea
            name="slides_url"
            rows={3}
            placeholder={"Slides / materials links — Google Drive (one per line)\nSlides | https://drive.google.com/…\nWorksheet | https://drive.google.com/…"}
            className={fieldClass() + " font-mono text-sm"}
          />
          <input
            name="sort_order"
            type="number"
            step="1"
            placeholder="Order (0 = top; lower shows first)"
            className={fieldClass()}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Add to library
          </button>
        </form>
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-2">
          Library{" "}
          <span className="text-slate-400 font-normal">({resources.length})</span>
        </h2>
        <ul className="divide-y">
          {resources.map((r) => {
            const vids = parseResourceLinks(r.video_url);
            const slds = parseResourceLinks(r.slides_url);
            return (
            <li key={r.id} className="flex items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.title}</p>
                {r.description && (
                  <p className="text-slate-600 text-sm">{r.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {vids.map((v, i) => (
                    <a
                      key={`v-${i}`}
                      href={v.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs rounded-full bg-rose-50 text-rose-700 px-2 py-0.5"
                    >
                      ▶ {v.label || (vids.length > 1 ? `Recording ${i + 1}` : "Recording")}
                    </a>
                  ))}
                  {slds.map((s, i) => (
                    <a
                      key={`s-${i}`}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs rounded-full bg-brand-50 text-brand-700 px-2 py-0.5"
                    >
                      📄 {s.label || (slds.length > 1 ? `Slides ${i + 1}` : "Slides")}
                    </a>
                  ))}
                  <span className="text-xs text-slate-400">order {r.sort_order}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setEditing(r)}
                  className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(r)}
                  disabled={pending}
                  className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
            );
          })}
          {resources.length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">
              Nothing in the library yet.
            </li>
          )}
        </ul>
      </Card>

      {editing && (
        <ResourceEditModal resource={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function ResourceEditModal({
  resource,
  onClose,
}: {
  resource: ResourceRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setMsg(null);
    start(async () => {
      try {
        const res = await updateResource(resource.id, formData);
        if (res.error) {
          setMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not save resource.");
      }
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
          <h2 className="text-lg font-bold">Edit resource</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        <form action={onSave} className="space-y-2">
          <input
            name="title"
            defaultValue={resource.title}
            placeholder="Title"
            className={fieldClass()}
          />
          <input
            name="description"
            defaultValue={resource.description ?? ""}
            placeholder="Short note (optional)"
            className={fieldClass()}
          />
          <div>
            <textarea
              name="video_url"
              rows={3}
              defaultValue={resource.video_url ?? ""}
              placeholder="Recording links — YouTube (one per line)"
              className={fieldClass() + " font-mono text-sm"}
            />
            <p className="text-slate-400 text-xs mt-1">
              One link per line. Optional name before a “|”, e.g.{" "}
              <span className="font-mono">Part 1 | https://youtu.be/…</span>
            </p>
          </div>
          <textarea
            name="slides_url"
            rows={3}
            defaultValue={resource.slides_url ?? ""}
            placeholder="Slides / materials links — Google Drive (one per line)"
            className={fieldClass() + " font-mono text-sm"}
          />
          <input
            name="sort_order"
            type="number"
            step="1"
            defaultValue={resource.sort_order}
            placeholder="Order"
            className={fieldClass()}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Save changes
          </button>
        </form>
        {msg && <p className="text-sm mt-2 text-slate-600">{msg}</p>}
      </div>
    </div>
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
// Assignments (matrix: students × assignments)
// ---------------------------------------------------------------------------
function AssignmentManageItem({
  assignment,
  students,
  done,
  pending,
  onToggleStudent,
  onEdit,
  onDelete,
}: {
  assignment: AssignmentRow;
  students: AssignmentStudent[];
  done: Record<string, boolean>;
  pending: boolean;
  onToggleStudent: (assignmentId: number, studentId: number, isDone: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const a = assignment;

  const doneCount = students.filter((s) => done[`${a.id}:${s.id}`]).length;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? students.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || (s.email ?? "").toLowerCase().includes(q)
      )
    : students;

  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-start gap-2 min-w-0 text-left"
        >
          <span
            className={`mt-0.5 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          <span className="min-w-0">
            <span className="font-medium block truncate">{a.title}</span>
            <span className="text-slate-400 text-xs">
              {doneCount}/{students.length} done
              {a.due_at ? ` · Due ${fmt(a.due_at)}` : ""}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onEdit}
            className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
          >
            View / Edit
          </button>
          <button
            onClick={onDelete}
            disabled={pending}
            className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-2 ml-6 rounded-xl bg-slate-50 p-2">
          {students.length === 0 ? (
            <p className="text-slate-400 py-1 px-1">No active students.</p>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email…"
                className="w-full mb-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
              />
              {q && (
                <p className="text-xs text-slate-400 mb-1 px-0.5">
                  Showing {filtered.length} of {students.length}
                </p>
              )}
              {filtered.length === 0 ? (
                <p className="text-slate-400 text-sm py-1 px-1">No match.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {filtered.map((s) => {
                    const isDone = !!done[`${a.id}:${s.id}`];
                    return (
                      <label
                        key={s.id}
                        className={`flex items-start gap-2 cursor-pointer rounded-lg px-2 py-1.5 border ${
                          isDone ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isDone}
                          disabled={pending}
                          onChange={() => onToggleStudent(a.id, s.id, isDone)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="min-w-0">
                          <span
                            className={`block font-medium truncate ${
                              isDone ? "text-slate-900" : "text-slate-700"
                            }`}
                          >
                            {s.name}
                          </span>
                          <span className="block text-xs text-slate-400 truncate">
                            {s.email || "no email"}
                            {" · "}
                            {s.whatsapp || "no WhatsApp"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function AssignmentsTab({ matrix }: { matrix: AssignmentMatrix }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AssignmentRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function onToggleStudent(assignmentId: number, studentId: number, isDone: boolean) {
    start(async () => {
      await setAssignmentStatus(assignmentId, studentId, isDone ? "pending" : "done");
      router.refresh();
    });
  }

  function onCreate(formData: FormData) {
    setError(null);
    const local = String(formData.get("due_at") ?? "");
    if (local) {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) formData.set("due_at", d.toISOString());
    }
    start(async () => {
      const res = await createAssignment(formData);
      if (res.error) setError(res.error);
      else formRef.current?.reset();
      router.refresh();
    });
  }

  function onDelete(a: AssignmentRow) {
    if (!confirm(`Delete assignment "${a.title}"? This removes everyone's progress for it.`))
      return;
    setError(null);
    start(async () => {
      try {
        const res = await deleteAssignment(a.id);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete assignment.");
      }
    });
  }

  const { assignments, students, done } = matrix;

  return (
    <>
      <Card>
        <h2 className="font-bold mb-3">Add assignment</h2>
        <form ref={formRef} action={onCreate} className="space-y-2">
          <input name="title" placeholder="Assignment title" className={fieldClass()} />
          <textarea
            name="description"
            rows={4}
            placeholder="Details (optional) — press Enter for a new line"
            className={fieldClass()}
          />
          <input name="due_at" type="datetime-local" className={fieldClass()} />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Add assignment
          </button>
        </form>
        {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Assignments ({assignments.length})</h2>
        <ul className="divide-y text-sm">
          {assignments.map((a) => (
            <AssignmentManageItem
              key={a.id}
              assignment={a}
              students={students}
              done={done}
              pending={pending}
              onToggleStudent={onToggleStudent}
              onEdit={() => setEditing(a)}
              onDelete={() => onDelete(a)}
            />
          ))}
          {assignments.length === 0 && (
            <li className="py-4 text-center text-slate-400">No assignments yet.</li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Progress grid</h2>
        <p className="text-slate-500 text-sm mb-3">Tap a cell to toggle done / pending.</p>
        {assignments.length === 0 ? (
          <p className="text-slate-400 text-sm">No assignments yet.</p>
        ) : students.length === 0 ? (
          <p className="text-slate-400 text-sm">No active students.</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white text-left py-2 px-2 z-10">Student</th>
                  {assignments.map((a) => (
                    <th key={a.id} className="py-2 px-2 align-bottom">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditing(a)}
                          className="whitespace-nowrap max-w-[120px] truncate underline decoration-dotted text-brand-700"
                          title={`Edit "${a.title}"`}
                        >
                          {a.title}
                        </button>
                        <button
                          onClick={() => onDelete(a)}
                          className="text-slate-300"
                          title="Delete assignment"
                        >
                          ✕
                        </button>
                      </div>
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
                    {assignments.map((a) => {
                      const isDone = !!done[`${a.id}:${s.id}`];
                      return (
                        <td key={a.id} className="py-1.5 px-2 text-center">
                          <button
                            disabled={pending}
                            onClick={() =>
                              start(async () => {
                                await setAssignmentStatus(
                                  a.id,
                                  s.id,
                                  isDone ? "pending" : "done"
                                );
                                router.refresh();
                              })
                            }
                            className={`w-7 h-7 rounded-lg text-sm font-bold ${
                              isDone
                                ? "bg-emerald-500 text-white"
                                : "bg-slate-100 text-slate-400"
                            }`}
                            title={isDone ? "Done — tap to undo" : "Pending — tap to mark done"}
                          >
                            {isDone ? "✓" : ""}
                          </button>
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

      {editing && (
        <AssignmentEditModal assignment={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function AssignmentEditModal({
  assignment,
  onClose,
}: {
  assignment: AssignmentRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setMsg(null);
    const local = String(formData.get("due_at") ?? "");
    if (local) {
      const d = new Date(local);
      if (!Number.isNaN(d.getTime())) formData.set("due_at", d.toISOString());
    } else {
      formData.set("due_at", "");
    }
    start(async () => {
      try {
        const res = await updateAssignment(assignment.id, formData);
        if (res.error) {
          setMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not save assignment.");
      }
    });
  }

  function onDelete() {
    if (!confirm(`Delete assignment "${assignment.title}"? This removes everyone's progress for it.`))
      return;
    setMsg(null);
    start(async () => {
      try {
        const res = await deleteAssignment(assignment.id);
        if (res.error) {
          setMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not delete assignment.");
      }
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
          <h2 className="text-lg font-bold">Edit assignment</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        <form action={onSave} className="space-y-2">
          <input
            name="title"
            defaultValue={assignment.title}
            placeholder="Assignment title"
            className={fieldClass()}
          />
          <textarea
            name="description"
            defaultValue={assignment.description ?? ""}
            rows={5}
            placeholder="Details (optional) — press Enter for a new line"
            className={fieldClass()}
          />
          <input
            name="due_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(assignment.due_at)}
            className={fieldClass()}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Save changes
          </button>
        </form>
        {msg && <p className="text-sm mt-2 text-slate-600">{msg}</p>}

        <div className="border-t mt-5 pt-4">
          <button
            onClick={onDelete}
            disabled={pending}
            className="w-full rounded-xl border border-rose-300 text-rose-700 px-4 py-2.5 font-semibold disabled:opacity-50"
          >
            Delete assignment
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course (curriculum roadmap: weeks with Part A / Part B + outcomes)
// ---------------------------------------------------------------------------
function CourseTab({
  weeks,
  outcomes,
}: {
  weeks: CurriculumWeekRow[];
  outcomes: OutcomeRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingWeek, setEditingWeek] = useState<CurriculumWeekRow | null>(null);
  const [editingOutcome, setEditingOutcome] = useState<OutcomeRow | null>(null);
  const weekRef = useRef<HTMLFormElement>(null);
  const outcomeRef = useRef<HTMLFormElement>(null);

  function onAddWeek(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await createCurriculumWeek(formData);
      if (res.error) setError(res.error);
      else weekRef.current?.reset();
      router.refresh();
    });
  }

  function onDeleteWeek(w: CurriculumWeekRow) {
    if (!confirm(`Delete "${w.title}"? This removes it from every student's course view.`)) return;
    setError(null);
    start(async () => {
      try {
        const res = await deleteCurriculumWeek(w.id);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete week.");
      }
    });
  }

  function onAddOutcome(formData: FormData) {
    setError(null);
    start(async () => {
      const res = await createOutcome(formData);
      if (res.error) setError(res.error);
      else outcomeRef.current?.reset();
      router.refresh();
    });
  }

  function onDeleteOutcome(o: OutcomeRow) {
    if (!confirm("Delete this outcome?")) return;
    setError(null);
    start(async () => {
      try {
        const res = await deleteOutcome(o.id);
        if (res.error) setError(res.error);
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not delete outcome.");
      }
    });
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">Course roadmap</h2>
        <p className="text-slate-500 text-sm mb-3">
          What every student sees in their <span className="font-semibold">Course</span> tab. Each
          week has a <span className="font-semibold">Part A</span> (everyone / no laptop) and a{" "}
          <span className="font-semibold">Part B</span> (bring laptop).
        </p>
        {error && <p className="text-rose-600 text-sm">{error}</p>}
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Add week</h2>
        <form ref={weekRef} action={onAddWeek} className="space-y-2">
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <input
              name="sort_order"
              type="number"
              step="1"
              defaultValue={weeks.length}
              placeholder="Order"
              className={fieldClass()}
              title="Display order (0, 1, 2…)"
            />
            <input name="title" placeholder="Title (e.g. Week 1 — Prompting)" className={fieldClass()} />
          </div>
          <textarea
            name="part_a"
            rows={3}
            placeholder="Part A — Everyone (no laptop): concepts & AI tools"
            className={fieldClass()}
          />
          <textarea
            name="part_b"
            rows={3}
            placeholder="Part B — Bring your laptop: hands-on building"
            className={fieldClass()}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Add week
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Weeks ({weeks.length})</h2>
        <ul className="divide-y">
          {weeks.map((w) => (
            <li key={w.id} className="py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    <span className="text-slate-400 font-normal mr-1">#{w.sort_order}</span>
                    {w.title}
                  </p>
                  {w.part_a && (
                    <p className="text-slate-600 text-sm mt-1 whitespace-pre-line">
                      <span className="font-semibold text-brand-700">Part A:</span> {w.part_a}
                    </p>
                  )}
                  {w.part_b && (
                    <p className="text-slate-600 text-sm mt-1 whitespace-pre-line">
                      <span className="font-semibold text-emerald-700">Part B:</span> {w.part_b}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingWeek(w)}
                    className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDeleteWeek(w)}
                    disabled={pending}
                    className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
          {weeks.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">No weeks yet.</li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-1">After-course outcomes</h2>
        <p className="text-slate-500 text-sm mb-3">
          Shown under <span className="font-semibold">&ldquo;After this course you can…&rdquo;</span>.
        </p>
        <form ref={outcomeRef} action={onAddOutcome} className="space-y-2 mb-4">
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <input
              name="sort_order"
              type="number"
              step="1"
              defaultValue={outcomes.length}
              placeholder="Order"
              className={fieldClass()}
            />
            <input name="body" placeholder="e.g. Build a working AI chatbot" className={fieldClass()} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-slate-800 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Add outcome
          </button>
        </form>
        <ul className="divide-y">
          {outcomes.map((o) => (
            <li key={o.id} className="flex items-start justify-between gap-2 py-2">
              <p className="text-sm">
                <span className="text-slate-400 mr-1">#{o.sort_order}</span>
                {o.body}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setEditingOutcome(o)}
                  className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDeleteOutcome(o)}
                  disabled={pending}
                  className="text-xs rounded-lg border border-rose-200 text-rose-700 px-2 py-1 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {outcomes.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">No outcomes yet.</li>
          )}
        </ul>
      </Card>

      {editingWeek && (
        <CurriculumWeekEditModal week={editingWeek} onClose={() => setEditingWeek(null)} />
      )}
      {editingOutcome && (
        <OutcomeEditModal outcome={editingOutcome} onClose={() => setEditingOutcome(null)} />
      )}
    </>
  );
}

function CurriculumWeekEditModal({
  week,
  onClose,
}: {
  week: CurriculumWeekRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setMsg(null);
    start(async () => {
      try {
        const res = await updateCurriculumWeek(week.id, formData);
        if (res.error) {
          setMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not save week.");
      }
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
          <h2 className="text-lg font-bold">Edit week</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        <form action={onSave} className="space-y-2">
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <input
              name="sort_order"
              type="number"
              step="1"
              defaultValue={week.sort_order}
              className={fieldClass()}
            />
            <input name="title" defaultValue={week.title} placeholder="Title" className={fieldClass()} />
          </div>
          <textarea
            name="part_a"
            rows={4}
            defaultValue={week.part_a ?? ""}
            placeholder="Part A — Everyone (no laptop)"
            className={fieldClass()}
          />
          <textarea
            name="part_b"
            rows={4}
            defaultValue={week.part_b ?? ""}
            placeholder="Part B — Bring your laptop"
            className={fieldClass()}
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Save changes
          </button>
        </form>
        {msg && <p className="text-sm mt-2 text-slate-600">{msg}</p>}
      </div>
    </div>
  );
}

function OutcomeEditModal({
  outcome,
  onClose,
}: {
  outcome: OutcomeRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function onSave(formData: FormData) {
    setMsg(null);
    start(async () => {
      try {
        const res = await updateOutcome(outcome.id, formData);
        if (res.error) {
          setMsg(res.error);
          return;
        }
        router.refresh();
        onClose();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not save outcome.");
      }
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
          <h2 className="text-lg font-bold">Edit outcome</h2>
          <button onClick={onClose} className="text-slate-400 text-2xl leading-none">
            ×
          </button>
        </div>

        <form action={onSave} className="space-y-2">
          <div className="grid grid-cols-[5rem_1fr] gap-2">
            <input
              name="sort_order"
              type="number"
              step="1"
              defaultValue={outcome.sort_order}
              className={fieldClass()}
            />
            <input name="body" defaultValue={outcome.body} placeholder="Outcome" className={fieldClass()} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            Save changes
          </button>
        </form>
        {msg && <p className="text-sm mt-2 text-slate-600">{msg}</p>}
      </div>
    </div>
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

// ---------------------------------------------------------------------------
// Quiz (MCQ modules) — authoring, gradebook + re-attempt requests
// ---------------------------------------------------------------------------
function QuizTab({
  quizzes,
  requests,
  scoreboard,
}: {
  quizzes: AdminQuizRow[];
  requests: QuizReattemptRow[];
  scoreboard: QuizScoreboard;
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
          <label className="flex items-center gap-2 text-sm">
            <input name="is_published" type="checkbox" className="h-4 w-4 accent-brand-600" />
            Publish now (students can see &amp; attempt it)
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
                  {q.question_count} Qs · {Math.round(q.time_limit_sec / 60)} min · pass{" "}
                  {q.pass_percent}% · {q.attempt_count} attempts
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
  const [feedback, setFeedback] = useState(req.feedback ?? "");
  const [error, setError] = useState<string | null>(null);

  const meta: Record<QuizReattemptRow["status"], { label: string; chip: string }> = {
    pending: { label: "pending", chip: "bg-amber-100 text-amber-700" },
    approved: { label: "approved", chip: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "rejected", chip: "bg-rose-100 text-rose-700" },
  };
  const m = meta[req.status];

  function review(status: "approved" | "rejected" | "pending") {
    setError(null);
    const fd = new FormData();
    fd.set("status", status);
    fd.set("feedback", feedback);
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
        </div>
        <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${m.chip}`}>
          {m.label}
        </span>
      </div>
      <p className="mt-2 text-xs font-semibold text-brand-700">{req.quiz_title}</p>

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
          onClick={() => review("pending")}
          disabled={pending}
          className="text-xs rounded-lg border border-slate-300 text-slate-600 px-2 py-1.5 disabled:opacity-50"
          title="Save the note without approving or rejecting yet"
        >
          Save note only
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
                <label className="flex items-center gap-2 text-sm">
                  <input
                    name="is_published"
                    type="checkbox"
                    defaultChecked={detail.is_published}
                    className="h-4 w-4 accent-brand-600"
                  />
                  Published
                </label>
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
              <QuizResultsPanel quizId={quizId} />
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
        Options — tick every correct one (more than one allowed).
      </p>
      <div className="space-y-1.5">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={o.correct}
              onChange={(e) => setOption(i, { correct: e.target.checked })}
              className="h-4 w-4 accent-emerald-600 shrink-0"
              title="Correct?"
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
function QuizResultsPanel({ quizId }: { quizId: number }) {
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
