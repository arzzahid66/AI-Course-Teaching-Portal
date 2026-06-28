"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  setTopicCovered,
  deleteTopic,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  setAssignmentStatus,
  getStudentDetail,
  updateLedgerEntry,
  deleteLedgerEntry,
  adminLogout,
  type StudentRow,
  type SessionRow,
  type AttendeeRow,
  type TopicRow,
  type AssignmentMatrix,
  type AssignmentRow,
  type AssignmentStudent,
  type StudentDetail,
  type DashboardStats,
} from "@/actions/admin";
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

type Tab = "dashboard" | "students" | "sessions" | "payments" | "topics" | "assignments";

export default function AdminDashboard({
  students,
  openSession,
  attendees,
  sessions,
  topics,
  assignmentMatrix,
  dashboardStats,
}: {
  students: StudentRow[];
  openSession: SessionRow | null;
  attendees: AttendeeRow[];
  sessions: SessionRow[];
  topics: TopicRow[];
  assignmentMatrix: AssignmentMatrix;
  dashboardStats: DashboardStats;
}) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const router = useRouter();

  const tabs: [Tab, string][] = [
    ["dashboard", "Dashboard"],
    ["students", "Students"],
    ["sessions", "Sessions"],
    ["payments", "Payments"],
    ["topics", "Topics"],
    ["assignments", "Tasks"],
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
            className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              tab === t ? "bg-white shadow-sm text-brand-700" : "text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "dashboard" && <DashboardTab stats={dashboardStats} />}
      {tab === "students" && <StudentsTab students={students} />}
      {tab === "sessions" && (
        <SessionsTab openSession={openSession} attendees={attendees} sessions={sessions} />
      )}
      {tab === "payments" && <PaymentsTab students={students} />}
      {tab === "topics" && <TopicsTab topics={topics} />}
      {tab === "assignments" && <AssignmentsTab matrix={assignmentMatrix} />}
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

function DashboardTab({ stats }: { stats: DashboardStats }) {
  const statusData = [
    { name: "Active", value: stats.students.active },
    { name: "Inactive", value: stats.students.inactive },
  ];
  const STATUS_COLORS = ["#10b981", "#cbd5e1"];

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
  const addRef = useRef<HTMLFormElement>(null);
  const bulkRef = useRef<HTMLFormElement>(null);

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
        <h2 className="font-bold mb-3">Students ({students.length})</h2>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Login</th>
                <th className="py-2 px-2 text-right">Balance</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="py-2 px-2 font-medium">{s.name}</td>
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
              {students.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    No students yet.
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
  const formRef = useRef<HTMLFormElement>(null);

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
        <ul className="divide-y text-sm">
          {students.map((s) => (
            <StudentBalanceRow key={s.id} student={s} />
          ))}
          {students.length === 0 && (
            <li className="py-6 text-center text-slate-400">No students yet.</li>
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
