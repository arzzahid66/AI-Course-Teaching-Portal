"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  checkIn,
  submitQuestion,
  submitLeaveRequest,
  type PortalData,
  type NextClass,
} from "@/actions/student";
import {
  startQuizAttempt,
  submitQuizAttempt,
  requestQuizReattempt,
  type StudentQuiz,
  type QuizAttemptQuestion,
  type StartQuizResult,
  type SubmitQuizResult,
} from "@/actions/quiz";
import { studentLogout } from "@/actions/studentAuth";
import { saveStudentSubscription } from "@/actions/push";
import { usePushSubscription } from "@/lib/usePushSubscription";
import { COURSE_NAME, INSTRUCTORS, type Instructor } from "@/lib/constants";
import {
  Card,
  CourseTab,
  FeeBlockedCard,
  FeesTab,
  HomeworkTab,
  NotEnrolledCard,
  ProgressTab,
  VideosTab,
  WeekChecklist,
} from "./sections";
import ToolsTab from "./ToolsTab";
import type { StudentResourceData } from "@/lib/resources";

type Tab =
  | "class"
  | "course"
  | "videos"
  | "homework"
  | "progress"
  | "fees"
  | "quiz"
  | "tools"
  | "leave"
  | "ask";

function fmt(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-PK", {
        timeZone: "Asia/Karachi",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
}
function fmtDate(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" });
}

export default function PortalClient({
  data,
  resources,
}: {
  data: PortalData;
  resources: StudentResourceData;
}) {
  const [tab, setTab] = useState<Tab>("class");
  const [showBio, setShowBio] = useState(false);
  const saveSub = useCallback(saveStudentSubscription, []);
  usePushSubscription(saveSub);

  const hwDue = data.weekends.filter(
    (w) => w.is_open && w.homework && (!w.submission || w.submission.status === "needs_changes")
  ).length;
  const feeAlert = data.fees.invoices.some((i) => i.status === "overdue");
  // Red dot while a tool slot is actually running, so a student mid-session
  // can find their sign-in code from any tab.
  const toolLive = resources.tools.some(
    (t) => t.mine?.status === "approved" && t.mine.slot === "active"
  );

  const tabs: [Tab, string, string, boolean][] = [
    ["class", "Class", "🏫", false],
    ["course", "Course", "🎓", false],
    ["videos", "Videos", "🎬", false],
    ["homework", "Homework", "📝", hwDue > 0],
    ["progress", "Progress", "📈", false],
    ["fees", "Fees", "💳", feeAlert],
    ["quiz", "Quiz", "🧠", false],
    ["tools", "Tools", "🔑", toolLive],
    ["leave", "Leave", "🌴", false],
    ["ask", "Ask", "💬", false],
  ];

  return (
    <main className="min-h-screen max-w-md mx-auto p-4 pb-24">
      <header className="flex items-center justify-between mb-4">
        <div className="min-w-0">
          <p className="text-slate-500 text-xs truncate">
            {data.enrollment ? data.enrollment.batchName : COURSE_NAME}
          </p>
          <h1 className="text-xl font-bold truncate">{data.name}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowBio(true)}
            className="flex items-center gap-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-semibold px-3 py-1.5 active:scale-[0.97] transition"
          >
            👤 Teachers
          </button>
          <button onClick={() => studentLogout()} className="text-sm text-slate-500 underline">
            Log out
          </button>
        </div>
      </header>

      {showBio && <TutorBioModal onClose={() => setShowBio(false)} />}

      {tab === "class" && (
        <>
          <ClassTab data={data} />
          {data.enrollment && <WeekChecklist data={data} onOpen={setTab} />}
        </>
      )}
      {tab === "course" && <CourseTab data={data} />}
      {tab === "videos" && <VideosTab data={data} />}
      {tab === "homework" && <HomeworkTab data={data} />}
      {tab === "progress" && <ProgressTab data={data} />}
      {tab === "fees" && <FeesTab data={data} />}
      {tab === "quiz" && <QuizTab data={data} />}
      {tab === "tools" && <ToolsTab data={resources} />}
      {tab === "leave" && <LeaveTab data={data} />}
      {tab === "ask" && <AskTab data={data} />}

      {/* Bottom tab bar (mobile-first). 9 tabs scroll horizontally. */}
      <nav
        className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t border-slate-200 flex overflow-x-auto no-scrollbar"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {tabs.map(([t, label, icon, dot]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative shrink-0 w-[60px] py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium ${
              tab === t ? "text-brand-700" : "text-slate-400"
            }`}
          >
            <span className="text-lg leading-none">{icon}</span>
            {label}
            {dot && <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-rose-500" />}
          </button>
        ))}
      </nav>
    </main>
  );
}

// ---------------------------------------------------------------------------
// About the instructors — opened from the Teachers button in the header
// ---------------------------------------------------------------------------
function TutorBioModal({ onClose }: { onClose: () => void }) {
  // Close on Escape key for convenience.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-lg leading-none active:scale-95 transition"
        >
          ✕
        </button>
        <TutorBioCard />
      </div>
    </div>
  );
}

function TutorBioCard() {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
      <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
          👤 About the instructors
        </p>
        <h2 className="text-lg font-bold text-white mt-0.5">Who teaches you</h2>
      </div>

      <ul className="divide-y divide-slate-100">
        {INSTRUCTORS.map((person) => (
          <InstructorRow key={person.name} person={person} />
        ))}
      </ul>
    </section>
  );
}

function InstructorRow({ person }: { person: Instructor }) {
  const initials = person.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <li className="flex gap-3 px-5 py-4">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-100 text-base font-bold text-brand-700">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold leading-tight text-slate-900">{person.name}</h3>
        <p className="text-xs text-brand-700 font-medium mt-0.5">{person.role}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{person.bio}</p>
        {person.linkedin && (
          <a
            href={person.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-2.5 py-1 text-xs font-semibold text-brand-700 active:scale-[0.97] transition"
          >
            in · LinkedIn profile
          </a>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Next-class countdown
// ---------------------------------------------------------------------------
function NextClassCard({ next }: { next: NextClass }) {
  const target = new Date(next.scheduled_at).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const diff = target - now;
  const started = diff <= 0;

  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, "0");
  const units: [number, string][] = [
    [days, "days"],
    [hours, "hrs"],
    [minutes, "min"],
    [seconds, "sec"],
  ];

  return (
    <Card>
      <div className="text-center">
        <p className="text-slate-500 text-sm mb-1">Next class</p>
        <h2 className="text-lg font-bold mb-1">{next.title}</h2>
        <p className="text-slate-600 text-sm mb-4">{fmt(next.scheduled_at)}</p>

        {started ? (
          <p className="text-emerald-600 font-semibold">
            Starting any moment — refresh for the code.
          </p>
        ) : (
          <div className="flex justify-center gap-2">
            {units.map(([value, label]) => (
              <div
                key={label}
                className="rounded-xl bg-brand-50 px-3 py-2 min-w-[58px]"
              >
                <div className="text-2xl font-bold text-brand-700 tabular-nums">
                  {pad(value)}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">
                  {label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Class / check-in
// ---------------------------------------------------------------------------
function ClassTab({ data }: { data: PortalData }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meetLink, setMeetLink] = useState<string | null>(null);

  const c = data.checkin;

  const emailNote = data.email ? (
    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-left">
      ⚠️ Join Google Meet signed in as{" "}
      <span className="font-semibold break-all">{data.email}</span>. Joining with a
      different email will not be let in.
    </p>
  ) : (
    <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 mb-4 text-left">
      Ask your tutor which email to use for Google Meet — joining with the wrong email
      won&apos;t be let in.
    </p>
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await checkIn(code);
    setLoading(false);
    if (res.ok) {
      setMeetLink(res.meetLink);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  if (c.kind === "no-enrollment") {
    return <NotEnrolledCard />;
  }

  if (c.kind === "blocked") {
    return <FeeBlockedCard data={data} monthNo={c.monthNo} remaining={c.remaining} dueDate={c.dueDate} />;
  }

  if (c.kind === "no-session") {
    return (
      <>
        {data.nextClass && <NextClassCard next={data.nextClass} />}
        <Card>
          <div className="text-center">
            <div className="text-5xl mb-3">😴</div>
            <h2 className="text-lg font-bold mb-1">No class live right now</h2>
            <p className="text-slate-600">
              {data.nextClass
                ? "Come back at class time and refresh to check in."
                : "Come back at class time and refresh."}
            </p>
          </div>
        </Card>
      </>
    );
  }

  const link = meetLink ?? (c.kind === "present" ? c.meetLink : null);
  if (link) {
    return (
      <Card>
        <div className="text-center">
          <div className="text-5xl mb-3">✅</div>
          <h2 className="text-lg font-bold mb-1">You&apos;re marked present</h2>
          <p className="text-slate-600 mb-4">
            {c.kind === "present" ? c.sessionTitle : "See you in class!"}
          </p>
          {emailNote}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-2xl bg-green-600 px-5 py-4 text-white text-lg font-bold shadow-sm active:scale-[0.98] transition"
          >
            Join the class →
          </a>
        </div>
      </Card>
    );
  }

  // can-checkin
  return (
    <Card>
      <div className="text-center mb-4">
        <div className="text-4xl mb-2">👋</div>
        <h2 className="text-lg font-bold">{c.sessionTitle}</h2>
        <p className="text-slate-500 text-sm">Enter the code your tutor said</p>
      </div>
      {emailNote}
      <form onSubmit={submit} className="space-y-4">
        <input
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Today's code"
          className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-lg text-center tracking-wide focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
        />
        {error && (
          <p className="text-center text-rose-600 text-sm font-medium">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || code.trim().length === 0}
          className="w-full rounded-2xl bg-brand-600 px-5 py-4 text-white text-lg font-bold shadow-sm active:scale-[0.98] transition disabled:opacity-50"
        >
          {loading ? "Checking…" : "Mark me present"}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Quiz — pick a published quiz, attempt it against a timer, see your scores
// ---------------------------------------------------------------------------
type ActiveAttempt = {
  quizId: number;
  attemptId: number;
  expiresAt: string;
  timeLimitSec: number;
  passPercent: number;
  title: string;
  questions: QuizAttemptQuestion[];
};

function QuizTab({ data }: { data: PortalData }) {
  const router = useRouter();
  const [active, setActive] = useState<ActiveAttempt | null>(null);
  const [result, setResult] = useState<{ title: string; res: Extract<SubmitQuizResult, { ok: true }> } | null>(
    null
  );

  // Attempt view — replaces the list while a quiz is running.
  if (active) {
    return (
      <QuizRunner
        attempt={active}
        onDone={(res) => {
          setResult({ title: active.title, res });
          setActive(null);
        }}
      />
    );
  }

  // Result view — shown right after submitting.
  if (result) {
    return (
      <QuizResultCard
        title={result.title}
        res={result.res}
        onBack={() => {
          setResult(null);
          router.refresh();
        }}
      />
    );
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">🧠 Quizzes</h2>
        <p className="text-slate-500 text-sm">
          Pick a quiz and attempt it. A timer starts the moment you press{" "}
          <span className="font-semibold">Start</span>, so be ready. You get{" "}
          <span className="font-semibold">2 tries</span> per quiz — if you use both without
          passing, you can request another go from your tutor.
        </p>
      </Card>

      {data.quizzes.length === 0 ? (
        <Card>
          <div className="text-center py-6">
            <div className="text-4xl mb-2">🧠</div>
            <h2 className="text-lg font-bold mb-1">No quizzes yet</h2>
            <p className="text-slate-500 text-sm">
              Your tutor hasn&apos;t published any quizzes yet. Check back soon.
            </p>
          </div>
        </Card>
      ) : (
        data.quizzes.map((q) => (
          <QuizCard key={q.id} quiz={q} onStarted={(a) => setActive(a)} />
        ))
      )}
    </>
  );
}

function QuizCard({
  quiz,
  onStarted,
}: {
  quiz: StudentQuiz;
  onStarted: (a: ActiveAttempt) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const minutes = Math.round(quiz.timeLimitSec / 60);
  const resuming = quiz.activeAttemptId != null;

  function onStart() {
    setError(null);
    start(async () => {
      const res: StartQuizResult = await startQuizAttempt(quiz.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onStarted({
        quizId: quiz.id,
        attemptId: res.attemptId,
        expiresAt: res.expiresAt,
        timeLimitSec: res.timeLimitSec,
        passPercent: res.passPercent,
        title: res.title,
        questions: res.questions,
      });
    });
  }

  function onRequest() {
    setError(null);
    start(async () => {
      const res = await requestQuizReattempt(quiz.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  // Status chip
  let chip: { label: string; cls: string };
  if (quiz.passed) {
    chip = { label: `passed ✅ ${quiz.lastPercent ?? 0}%`, cls: "bg-emerald-100 text-emerald-700" };
  } else if (quiz.blocked) {
    chip = { label: "blocked", cls: "bg-rose-100 text-rose-700" };
  } else if (quiz.attemptsUsed > 0) {
    chip = { label: `${quiz.lastPercent ?? 0}% · try ${quiz.attemptsUsed}/${quiz.attemptsAllowed}`, cls: "bg-amber-100 text-amber-700" };
  } else {
    chip = { label: "not attempted", cls: "bg-slate-100 text-slate-600" };
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold">{quiz.title}</h3>
          {quiz.description && (
            <p className="text-slate-600 text-sm mt-0.5 whitespace-pre-line">{quiz.description}</p>
          )}
        </div>
        <span className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${chip.cls}`}>
          {chip.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-2">
        <span>⏱ {minutes} min</span>
        <span>🎯 pass {quiz.passPercent}%</span>
        <span>❓ {quiz.questionCount} questions</span>
        <span>🔁 {quiz.attemptsUsed}/{quiz.attemptsAllowed} attempts</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {quiz.canAttempt || resuming ? (
          <button
            onClick={onStart}
            disabled={pending}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold active:scale-[0.98] transition disabled:opacity-50"
          >
            {pending ? "Starting…" : resuming ? "Resume attempt" : "Start quiz"}
          </button>
        ) : quiz.passed ? (
          <span className="text-emerald-600 text-sm font-medium">
            You&apos;ve passed this quiz 🎉
          </span>
        ) : quiz.canRequest ? (
          <button
            onClick={onRequest}
            disabled={pending}
            className="rounded-xl border border-brand-300 text-brand-700 px-4 py-2.5 font-semibold disabled:opacity-50"
          >
            {pending ? "Sending…" : "Request re-attempt"}
          </button>
        ) : quiz.hasPendingRequest ? (
          <span className="text-amber-600 text-sm font-medium">
            Re-attempt request waiting for tutor…
          </span>
        ) : quiz.questionCount === 0 ? (
          <span className="text-slate-400 text-sm">No questions yet.</span>
        ) : null}

        {quiz.attempts.length > 0 && (
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs rounded-lg border border-slate-300 text-slate-600 px-2 py-1"
          >
            {showHistory ? "Hide scores" : "My scores"}
          </button>
        )}
      </div>

      {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}

      {showHistory && quiz.attempts.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 divide-y">
          {quiz.attempts.map((a, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-slate-500">
                {a.submitted_at ? fmt(a.submitted_at) : "—"}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-semibold tabular-nums">{a.percent}%</span>
                <span
                  className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                    a.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {a.passed ? "pass" : "fail"}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function QuizRunner({
  attempt,
  onDone,
}: {
  attempt: ActiveAttempt;
  onDone: (res: Extract<SubmitQuizResult, { ok: true }>) => void;
}) {
  const target = new Date(attempt.expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [selections, setSelections] = useState<Map<number, Set<number>>>(new Map());
  const [current, setCurrent] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const remainingMs = Math.max(0, target - now);
  const remainingSec = Math.floor(remainingMs / 1000);
  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");
  const lowTime = remainingSec <= 30;

  const doSubmit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    const answers = attempt.questions.map((q) => ({
      questionId: q.id,
      optionIds: Array.from(selections.get(q.id) ?? []),
    }));
    const res = await submitQuizAttempt(attempt.attemptId, answers);
    if (!res.ok) {
      setError(res.error);
      setSubmitting(false);
      submittedRef.current = false; // allow retry on a transient error
      return;
    }
    onDone(res);
  }, [attempt.attemptId, attempt.questions, selections, onDone]);

  // Tick the clock every second; auto-submit when it hits zero.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (remainingMs <= 0 && !submittedRef.current) {
      doSubmit();
    }
  }, [remainingMs, doSubmit]);

  // Single choice per question: picking an option replaces any previous pick.
  function select(questionId: number, optionId: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(questionId, new Set([optionId]));
      return next;
    });
  }

  const total = attempt.questions.length;
  const answeredCount = attempt.questions.filter(
    (q) => (selections.get(q.id)?.size ?? 0) > 0
  ).length;

  // Clamp the page index in case the question set is ever shorter than expected.
  const idx = Math.min(current, Math.max(0, total - 1));
  const q = attempt.questions[idx];
  const isFirst = idx === 0;
  const isLast = idx >= total - 1;

  // Block copy / cut / right-click on the question area (deterrent, not DRM).
  const blockCopy = (e: React.SyntheticEvent) => e.preventDefault();

  return (
    <div className="select-none" onCopy={blockCopy} onCut={blockCopy} onContextMenu={blockCopy}>
      {/* Sticky timer header */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-white/95 backdrop-blur border-b border-slate-200 mb-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">Quiz in progress</p>
            <p className="font-bold truncate">{attempt.title}</p>
          </div>
          <div
            className={`shrink-0 rounded-xl px-3 py-1.5 font-bold tabular-nums text-lg ${
              lowTime ? "bg-rose-100 text-rose-700" : "bg-brand-50 text-brand-700"
            }`}
          >
            {mm}:{ss}
          </div>
        </div>
        {/* Progress bar + counters */}
        <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${total > 0 ? ((idx + 1) / total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Question {idx + 1} of {total} · answered {answeredCount}/{total} · pass{" "}
          {attempt.passPercent}%
        </p>
      </div>

      {q && (
        <Card key={q.id}>
          <p className="font-semibold mb-1">
            <span className="text-slate-400 mr-1">Q{idx + 1}.</span>
            {q.body}
          </p>
          <p className="text-slate-400 text-xs mb-3">Select one option.</p>
          <div className="space-y-2">
            {q.options.map((o) => {
              const checked = selections.get(q.id)?.has(o.id) ?? false;
              return (
                <label
                  key={o.id}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition ${
                    checked
                      ? "border-brand-500 bg-brand-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={checked}
                    onChange={() => select(q.id, o.id)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  <span className="text-sm">{o.body}</span>
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {error && (
        <Card>
          <p className="text-rose-600 text-sm">{error}</p>
        </Card>
      )}

      {/* Back / Next (or Submit on the last question) */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setCurrent((c) => Math.max(0, c - 1))}
          disabled={isFirst || submitting}
          className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-700 disabled:opacity-40"
        >
          ← Back
        </button>

        {isLast ? (
          <button
            onClick={() => {
              if (confirm("Submit your quiz now? You can't change answers after this.")) doSubmit();
            }}
            disabled={submitting}
            className="flex-1 rounded-xl bg-brand-600 px-5 py-3 text-white text-lg font-bold shadow-sm active:scale-[0.98] transition disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit quiz"}
          </button>
        ) : (
          <button
            onClick={() => setCurrent((c) => Math.min(total - 1, c + 1))}
            disabled={submitting}
            className="flex-1 rounded-xl bg-brand-600 px-5 py-3 text-white font-bold shadow-sm active:scale-[0.98] transition disabled:opacity-50"
          >
            Next →
          </button>
        )}
      </div>

      <p className="text-slate-400 text-xs text-center mb-2">
        The timer keeps running — the quiz auto-submits when it reaches 0:00.
      </p>
    </div>
  );
}

function QuizResultCard({
  title,
  res,
  onBack,
}: {
  title: string;
  res: Extract<SubmitQuizResult, { ok: true }>;
  onBack: () => void;
}) {
  return (
    <Card>
      <div className="text-center py-4">
        <div className="text-5xl mb-3">{res.passed ? "🎉" : "😔"}</div>
        <h2 className="text-lg font-bold mb-1">{title}</h2>
        <p className={`text-3xl font-bold tabular-nums ${res.passed ? "text-emerald-600" : "text-rose-600"}`}>
          {res.percent}%
        </p>
        <p className="text-slate-500 text-sm mt-1">
          {res.score} of {res.total} correct · pass mark {res.passPercent}%
        </p>
        <p className={`mt-3 font-semibold ${res.passed ? "text-emerald-600" : "text-rose-600"}`}>
          {res.passed ? "You passed! ✅" : "You didn't pass this time."}
        </p>
      </div>

      {res.review.length > 0 && (
        <div className="border-t border-slate-200 pt-4 mt-1">
          <h3 className="font-bold mb-1">Review</h3>
          <p className="text-slate-500 text-xs mb-4">
            Green is the correct answer. Red is where your pick was wrong.
          </p>
          <div className="space-y-4">
            {res.review.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-semibold text-sm">
                    <span className="text-slate-400 mr-1">Q{i + 1}.</span>
                    {q.body}
                  </p>
                  <span
                    className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${
                      q.correct
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-700"
                    }`}
                  >
                    {q.correct ? "correct" : "wrong"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {q.options.map((o) => {
                    // Right answer = green. Your wrong pick = red. Otherwise plain.
                    const cls = o.isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                      : o.selected
                        ? "border-rose-300 bg-rose-50 text-rose-800"
                        : "border-slate-200 text-slate-600";
                    return (
                      <div
                        key={o.id}
                        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}
                      >
                        <span>{o.body}</span>
                        <span className="shrink-0 text-xs font-medium">
                          {o.isCorrect ? "✓ correct" : o.selected ? "✗ your pick" : ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onBack}
        className="mt-5 w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold active:scale-[0.98] transition"
      >
        Back to quizzes
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Leave — appeal for an absence from the next class (before it starts)
// ---------------------------------------------------------------------------
function LeaveTab({ data }: { data: PortalData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState("");

  // A student can only appeal while there is an upcoming class to appeal from.
  const hasUpcoming = !!data.nextClass;
  // Block a second request for the same upcoming class (matches the server rule).
  const alreadyPending =
    hasUpcoming && data.leaves.some((l) => l.status === "pending");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (reason.trim().length === 0) {
      setError("Please tell your tutor why you need leave.");
      return;
    }
    const fd = new FormData();
    fd.set("reason", reason);
    start(async () => {
      const res = await submitLeaveRequest(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setReason("");
      setSent(true);
      router.refresh();
    });
  }

  const statusMeta: Record<
    PortalData["leaves"][number]["status"],
    { label: string; chip: string }
  > = {
    pending: { label: "waiting", chip: "bg-amber-100 text-amber-700" },
    approved: { label: "approved ✅", chip: "bg-emerald-100 text-emerald-700" },
    rejected: { label: "rejected ❌", chip: "bg-rose-100 text-rose-700" },
  };

  return (
    <>
      {/* Countdown to the class you'd be missing */}
      {data.nextClass ? (
        <NextClassCard next={data.nextClass} />
      ) : (
        <Card>
          <div className="text-center py-4">
            <div className="text-4xl mb-2">🗓️</div>
            <h2 className="text-lg font-bold mb-1">No upcoming class scheduled</h2>
            <p className="text-slate-500 text-sm">
              You can still send a leave note below — your tutor will see it.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-bold mb-1">🌴 Request leave</h2>
        <p className="text-slate-500 text-sm mb-3">
          Can&apos;t attend the next class? Appeal here{" "}
          <span className="font-semibold">before it starts</span>. Your tutor will
          approve or reject it and can leave you a note. We record the exact time
          you send this.
        </p>

        {alreadyPending ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            You already have a leave request waiting for a decision. You&apos;ll see
            the reply below.
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-2">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="Why do you need leave? (e.g. family event, sick, exam)"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
            />
            {error && <p className="text-rose-600 text-sm">{error}</p>}
            {sent && (
              <p className="text-emerald-600 text-sm">
                Leave request sent! Your tutor will review it.
              </p>
            )}
            <button
              type="submit"
              disabled={pending || reason.trim().length === 0}
              className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold active:scale-[0.98] transition disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send leave request"}
            </button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Your leave requests</h2>
        {data.leaves.length === 0 ? (
          <p className="text-slate-400 text-sm">
            You haven&apos;t requested any leave yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.leaves.map((l) => {
              const meta = statusMeta[l.status];
              return (
                <li key={l.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {l.lesson_title ? (
                        <p className="text-xs font-semibold text-brand-700">
                          {l.lesson_title}
                          {l.lesson_at && (
                            <span className="text-slate-400 font-normal">
                              {" "}
                              · {fmt(l.lesson_at)}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-slate-400">
                          General leave
                        </p>
                      )}
                      <p className="text-sm whitespace-pre-line mt-0.5">{l.reason}</p>
                      <p className="text-slate-400 text-xs mt-1">
                        Sent {fmt(l.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${meta.chip}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                  {l.feedback && (
                    <div className="mt-2 rounded-lg bg-brand-50 border border-brand-100 p-2.5">
                      <p className="text-xs font-semibold text-brand-700 mb-0.5">
                        Tutor&apos;s note
                      </p>
                      <p className="text-sm whitespace-pre-line text-slate-700">
                        {l.feedback}
                      </p>
                      {l.reviewed_at && (
                        <p className="text-slate-400 text-xs mt-1">{fmt(l.reviewed_at)}</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ask (send a question to the tutor + see replies)
// ---------------------------------------------------------------------------
function AskTab({ data }: { data: PortalData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (body.trim().length === 0) {
      setError("Please type your question.");
      return;
    }
    const fd = new FormData();
    fd.set("subject", subject);
    fd.set("body", body);
    start(async () => {
      const res = await submitQuestion(fd);
      if (res.error) {
        setError(res.error);
        return;
      }
      setBody("");
      setSubject("");
      setSent(true);
      router.refresh();
    });
  }

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">💬 Ask your tutor</h2>
        <p className="text-slate-500 text-sm mb-3">
          Facing a problem or have a question? Send it here. Your tutor will see it and
          reply — you&apos;ll find their answer below.
        </p>
        <form onSubmit={onSubmit} className="space-y-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Topic (optional) — e.g. Fees, Lesson 5"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Describe your question or problem…"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
          {error && <p className="text-rose-600 text-sm">{error}</p>}
          {sent && (
            <p className="text-emerald-600 text-sm">Sent! Your tutor will get back to you.</p>
          )}
          <button
            type="submit"
            disabled={pending || body.trim().length === 0}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold active:scale-[0.98] transition disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send question"}
          </button>
        </form>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">Your questions</h2>
        {data.questions.length === 0 ? (
          <p className="text-slate-400 text-sm">You haven&apos;t asked anything yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.questions.map((q) => (
              <li key={q.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {q.subject && (
                      <p className="text-xs font-semibold text-brand-700">{q.subject}</p>
                    )}
                    <p className="text-sm whitespace-pre-line">{q.body}</p>
                    <p className="text-slate-400 text-xs mt-1">{fmt(q.created_at)}</p>
                  </div>
                  <span
                    className={`shrink-0 text-xs rounded-full px-2 py-0.5 font-medium ${
                      q.status === "resolved"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {q.status === "resolved" ? "answered" : "waiting"}
                  </span>
                </div>
                {q.answer && (
                  <div className="mt-2 rounded-lg bg-brand-50 border border-brand-100 p-2.5">
                    <p className="text-xs font-semibold text-brand-700 mb-0.5">
                      Tutor&apos;s reply
                    </p>
                    <p className="text-sm whitespace-pre-line text-slate-700">{q.answer}</p>
                    {q.answered_at && (
                      <p className="text-slate-400 text-xs mt-1">{fmt(q.answered_at)}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
