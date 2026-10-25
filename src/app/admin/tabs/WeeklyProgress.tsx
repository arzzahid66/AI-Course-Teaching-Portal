"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { HomeworkCell, WeeklyBoard } from "@/actions/progress";
import { Card, ChartTooltip, EmailStudentButton } from "../ui";

// Reserved status colors: each always ships with its icon + label, never color alone.
const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  none: "#cbd5e1",
};

const HW_META: Record<Exclude<HomeworkCell, "upcoming">, { label: string; icon: string; color: string; cell: string }> = {
  approved: { label: "Marked", icon: "✓", color: STATUS.good, cell: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  awaiting: { label: "To mark", icon: "…", color: STATUS.warning, cell: "bg-amber-50 text-amber-800 ring-amber-200" },
  needs_changes: { label: "Needs changes", icon: "↺", color: STATUS.serious, cell: "bg-orange-50 text-orange-800 ring-orange-200" },
  missing: { label: "Missing", icon: "✕", color: STATUS.critical, cell: "bg-rose-50 text-rose-700 ring-rose-200" },
  open: { label: "Not yet", icon: "·", color: STATUS.none, cell: "bg-white text-slate-400 ring-slate-200" },
};
const HW_ORDER = ["approved", "awaiting", "needs_changes", "missing", "open"] as const;

const QUIZ_META = {
  passed: { label: "Passed", icon: "✓", color: STATUS.good, cell: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  failed: { label: "Below pass", icon: "✕", color: STATUS.critical, cell: "bg-rose-50 text-rose-700 ring-rose-200" },
  none: { label: "Not attempted", icon: "—", color: STATUS.none, cell: "bg-white text-slate-400 ring-slate-200" },
};
const QUIZ_ORDER = ["passed", "failed", "none"] as const;

const AXIS = { fontSize: 11, fill: "#64748b" };

export default function WeeklyProgress({ board }: { board: WeeklyBoard }) {
  const { weeks, quizzes, students } = board;

  // Each student's homework state per weekend, derived once.
  const hwCell = useMemo(() => {
    const out = new Map<string, HomeworkCell>();
    for (const w of weeks) {
      for (const s of students) {
        const sub = board.homework[`${s.enrollment_id}:${w.weekend_id}`];
        out.set(
          `${s.enrollment_id}:${w.weekend_id}`,
          sub ? sub.status : w.phase === "due" ? "missing" : w.phase === "open" ? "open" : "upcoming"
        );
      }
    }
    return out;
  }, [board, weeks, students]);

  const hwWeeks = weeks.filter((w) => w.hasHomework);
  const hwData = hwWeeks.map((w) => {
    const row: Record<string, string | number> = { name: `W${w.weekend_no}` };
    for (const k of HW_ORDER) row[HW_META[k].label] = 0;
    for (const s of students) {
      const c = hwCell.get(`${s.enrollment_id}:${w.weekend_id}`);
      if (c && c !== "upcoming") row[HW_META[c].label] = (row[HW_META[c].label] as number) + 1;
    }
    return row;
  });

  const quizState = (quizId: number, studentId: number) => {
    const r = board.quiz[`${quizId}:${studentId}`];
    return r ? (r.passed ? "passed" : "failed") : "none";
  };
  const quizData = quizzes.map((q, i) => {
    const row: Record<string, string | number> = { name: `Q${i + 1}` };
    for (const k of QUIZ_ORDER) row[QUIZ_META[k].label] = 0;
    for (const s of students) row[QUIZ_META[quizState(q.id, s.student_id)].label] = (row[QUIZ_META[quizState(q.id, s.student_id)].label] as number) + 1;
    return row;
  });

  // What the detail panel shows: the picked week or quiz, else the latest week that has opened.
  const latestOpen = [...hwWeeks].reverse().find((w) => w.phase !== "upcoming") ?? hwWeeks[0];
  const [picked, setPicked] = useState<Selection | null>(null);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const sel: Selection | null =
    picked ?? (latestOpen ? { kind: "week", id: latestOpen.weekend_id } : quizzes[0] ? { kind: "quiz", id: quizzes[0].id } : null);
  const week = sel?.kind === "week" ? hwWeeks.find((w) => w.weekend_id === sel.id) : undefined;
  const quizIndex = sel?.kind === "quiz" ? quizzes.findIndex((q) => q.id === sel.id) : -1;
  const pickWeek = (name: string) => {
    const w = hwWeeks.find((x) => `W${x.weekend_no}` === name);
    if (w) setPicked({ kind: "week", id: w.weekend_id });
  };
  const pickQuiz = (name: string) => {
    const q = quizzes[Number(name.slice(1)) - 1];
    if (q) setPicked({ kind: "quiz", id: q.id });
  };

  // Headline numbers: submission rate across due weeks, and quiz attempt rate.
  const dueWeeks = hwWeeks.filter((w) => w.phase === "due");
  const dueSlots = dueWeeks.length * students.length;
  const submitted = dueWeeks.reduce(
    (n, w) => n + students.filter((s) => hwCell.get(`${s.enrollment_id}:${w.weekend_id}`) !== "missing").length,
    0
  );
  const quizSlots = quizzes.length * students.length;
  const attempted = Object.keys(board.quiz).length;

  if (students.length === 0) return null;

  return (
    <>
      <Insights board={board} hwCell={hwCell} hwWeeks={hwWeeks} quizState={quizState} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Homework by week"
          headline={dueSlots > 0 ? `${Math.round((submitted / dueSlots) * 100)}%` : "—"}
          sub={dueSlots > 0 ? `submitted for weeks already due (${submitted}/${dueSlots})` : "No homework due yet"}
          data={hwData}
          series={HW_ORDER.map((k) => HW_META[k])}
          total={students.length}
          activeName={week ? `W${week.weekend_no}` : undefined}
          onPick={pickWeek}
          empty="No weekends with homework scheduled for this intake."
        />
        <ChartCard
          title="Quizzes"
          headline={quizSlots > 0 ? `${Math.round((attempted / quizSlots) * 100)}%` : "—"}
          sub={quizSlots > 0 ? `of quiz attempts made (${attempted}/${quizSlots})` : "No published quizzes"}
          data={quizData}
          series={QUIZ_ORDER.map((k) => QUIZ_META[k])}
          total={students.length}
          activeName={quizIndex >= 0 ? `Q${quizIndex + 1}` : undefined}
          onPick={pickQuiz}
          empty="No published quizzes for this level yet."
        />
      </div>

      {sel && (
        <Card>
          {/* Filter: one chip per week and per quiz. */}
          <div className="flex flex-wrap items-center gap-1 mb-4">
            <span className="text-xs text-slate-500 mr-1">Show</span>
            {hwWeeks.map((w) => (
              <Chip
                key={w.weekend_id}
                active={week?.weekend_id === w.weekend_id}
                disabled={w.phase === "upcoming"}
                onClick={() => setPicked({ kind: "week", id: w.weekend_id })}
                title={`Week ${w.weekend_no}: ${w.title}`}
              >
                W{w.weekend_no}
              </Chip>
            ))}
            {quizzes.length > 0 && <span className="w-px h-5 bg-slate-200 mx-1" />}
            {quizzes.map((q, i) => (
              <Chip key={q.id} active={quizIndex === i} onClick={() => setPicked({ kind: "quiz", id: q.id })} title={q.title}>
                Q{i + 1}
              </Chip>
            ))}
          </div>
          {week && <WeekDetail board={board} week={week} hwWeeks={hwWeeks} hwCell={hwCell} />}
          {quizIndex >= 0 && <QuizDetail board={board} index={quizIndex} quizState={quizState} />}
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold">Who did what</h2>
          <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {[false, true].map((only) => (
              <button
                key={String(only)}
                onClick={() => setAttentionOnly(only)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  attentionOnly === only ? "bg-white shadow-sm text-slate-800" : "text-slate-500"
                }`}
              >
                {only ? "Needs attention" : "All students"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          One row per student. Homework shows marks out of 10, quizzes show the best %.
          {attentionOnly && " Showing only students with missing homework or a quiz not passed."}
        </p>
        <Grid
          board={board}
          hwCell={hwCell}
          hwWeeks={hwWeeks}
          quizState={quizState}
          attentionOnly={attentionOnly}
          highlight={week ? `w${week.weekend_id}` : quizIndex >= 0 ? `q${quizzes[quizIndex].id}` : null}
        />
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[11px] text-slate-500">
          {HW_ORDER.map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded ring-1 ${HW_META[k].cell}`}>
                {HW_META[k].icon}
              </span>
              {HW_META[k].label}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className={`inline-flex h-4 w-4 items-center justify-center rounded ring-1 ${QUIZ_META.failed.cell}`}>✕</span>
            Quiz below pass
          </span>
        </div>
      </Card>
    </>
  );
}

function ChartCard({
  title,
  headline,
  sub,
  data,
  series,
  total,
  activeName,
  onPick,
  empty,
}: {
  title: string;
  headline: string;
  sub: string;
  data: Record<string, string | number>[];
  series: { label: string; icon: string; color: string }[];
  total: number;
  activeName?: string;
  onPick?: (name: string) => void;
  empty: string;
}) {
  return (
    <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-bold text-sm">{title}</h2>
        <p className="text-xl font-bold tabular-nums text-slate-800">{headline}</p>
      </div>
      <p className="text-xs text-slate-400 text-right -mt-0.5 mb-2">{sub}</p>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">{empty}</p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 4, right: 4, bottom: 0, left: -24 }}
              barCategoryGap="22%"
              onClick={(s) => {
                const label = (s as { activeLabel?: string | number } | null)?.activeLabel;
                if (onPick && label != null) onPick(String(label));
              }}
            >
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                interval={0}
                tick={({ x, y, payload }: { x: string | number; y: string | number; payload: { value: string } }) => (
                  <text
                    x={x}
                    y={Number(y) + 10}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={payload.value === activeName ? 700 : 400}
                    fill={payload.value === activeName ? "#0f172a" : "#64748b"}
                  >
                    {payload.value}
                  </text>
                )}
              />
              <YAxis allowDecimals={false} domain={[0, total]} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f1f5f9" }} />
              {series.map((s) => (
                <Bar
                  key={s.label}
                  dataKey={s.label}
                  stackId="a"
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={2}
                  cursor={onPick ? "pointer" : undefined}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
        {series.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.icon} {s.label}
          </span>
        ))}
      </div>
    </section>
  );
}

/**
 * Student × (weeks + quizzes) grid. Columns share the width with minmax(0, 1fr)
 * so the whole course fits the card at any screen size, with no sideways scroll.
 */
function Grid({
  board,
  hwCell,
  hwWeeks,
  quizState,
  attentionOnly,
  highlight,
}: {
  board: WeeklyBoard;
  hwCell: Map<string, HomeworkCell>;
  hwWeeks: WeeklyBoard["weeks"];
  quizState: QuizStateFn;
  attentionOnly: boolean;
  /** Column to emphasise: `w<weekend_id>` or `q<quiz_id>`. */
  highlight: string | null;
}) {
  const { quizzes } = board;
  const students = attentionOnly
    ? board.students.filter((s) => needsAttention(s, board, hwCell, hwWeeks, quizState))
    : board.students;
  const hl = (key: string) => (highlight === key ? "outline outline-2 outline-offset-1 outline-slate-400" : "");
  const cols = `minmax(64px, 1.8fr) repeat(${hwWeeks.length}, minmax(0, 1fr))${
    quizzes.length ? ` 6px repeat(${quizzes.length}, minmax(0, 1fr))` : ""
  } minmax(34px, 0.8fr)`;
  const cellBase = "h-7 flex items-center justify-center rounded-md ring-1 text-[11px] font-semibold tabular-nums";

  return (
    <div className="grid gap-1 items-center" style={{ gridTemplateColumns: cols }}>
      {/* Header */}
      <span className="text-[11px] text-slate-400">Student</span>
      {hwWeeks.map((w) => (
        <span
          key={w.weekend_id}
          title={`Week ${w.weekend_no}: ${w.title}`}
          className={`text-center text-[11px] font-semibold ${highlight === `w${w.weekend_id}` ? "text-slate-900" : "text-slate-500"}`}
        >
          W{w.weekend_no}
        </span>
      ))}
      {quizzes.length > 0 && <span />}
      {quizzes.map((q, i) => (
        <span
          key={q.id}
          title={q.title}
          className={`text-center text-[11px] font-semibold ${highlight === `q${q.id}` ? "text-slate-900" : "text-brand-700"}`}
        >
          Q{i + 1}
        </span>
      ))}
      <span className="text-center text-[11px] text-slate-400" title="Homework submitted out of the weeks due">
        Done
      </span>

      {students.map((s) => {
        const due = hwWeeks.filter((w) => w.phase === "due");
        const done = due.filter((w) => hwCell.get(`${s.enrollment_id}:${w.weekend_id}`) !== "missing").length;
        return (
          <Row key={s.enrollment_id}>
            <span className="truncate text-xs font-medium text-slate-700" title={s.name}>
              {s.name}
            </span>
            {hwWeeks.map((w) => {
              const c = hwCell.get(`${s.enrollment_id}:${w.weekend_id}`) ?? "upcoming";
              if (c === "upcoming") return <span key={w.weekend_id} className="h-7 rounded-md bg-slate-50" />;
              const marks = board.homework[`${s.enrollment_id}:${w.weekend_id}`]?.marks;
              return (
                <span
                  key={w.weekend_id}
                  title={`${s.name} · W${w.weekend_no}: ${HW_META[c].label}${marks != null ? ` (${marks}/10)` : ""}`}
                  className={`${cellBase} ${HW_META[c].cell} ${hl(`w${w.weekend_id}`)}`}
                >
                  {c === "approved" && marks != null ? marks : HW_META[c].icon}
                </span>
              );
            })}
            {quizzes.length > 0 && <span />}
            {quizzes.map((q, i) => {
              const st = quizState(q.id, s.student_id);
              const best = board.quiz[`${q.id}:${s.student_id}`]?.best;
              return (
                <span
                  key={q.id}
                  title={`${s.name} · Q${i + 1} ${q.title}: ${best != null ? `${best}%` : "not attempted"}`}
                  className={`${cellBase} ${QUIZ_META[st].cell} ${hl(`q${q.id}`)}`}
                >
                  {best != null ? best : QUIZ_META[st].icon}
                </span>
              );
            })}
            <span
              className={`text-center text-[11px] font-semibold tabular-nums ${
                due.length === 0 ? "text-slate-300" : done === due.length ? "text-emerald-700" : "text-rose-600"
              }`}
            >
              {due.length === 0 ? "—" : `${done}/${due.length}`}
            </span>
          </Row>
        );
      })}
      {students.length === 0 && (
        <p className="col-span-full py-4 text-center text-sm text-emerald-700">✓ Nobody needs attention right now.</p>
      )}
    </div>
  );
}

/** A grid row is just its cells; `display: contents` keeps them on the parent grid. */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}

// ---------------------------------------------------------------------------
// Filter, insights and the week / quiz detail panel
// ---------------------------------------------------------------------------

type Selection = { kind: "week" | "quiz"; id: number };
type QuizStateFn = (quizId: number, studentId: number) => "passed" | "failed" | "none";
type Student = WeeklyBoard["students"][number];
type Week = WeeklyBoard["weeks"][number];

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listNames = (names: string[], max = 6) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} +${names.length - max} more`;
const SUBMITTED: HomeworkCell[] = ["approved", "awaiting", "needs_changes"];

/** Missing homework, homework sent back, or a published quiz not passed. */
function needsAttention(
  s: Student,
  board: WeeklyBoard,
  hwCell: Map<string, HomeworkCell>,
  hwWeeks: Week[],
  quizState: QuizStateFn
) {
  return followUpReasons(s, board, hwCell, hwWeeks, quizState).length > 0;
}

/** Why a tutor should get in touch with this student, in short phrases. */
function followUpReasons(
  s: Student,
  board: WeeklyBoard,
  hwCell: Map<string, HomeworkCell>,
  hwWeeks: Week[],
  quizState: QuizStateFn
): string[] {
  const at = (w: Week) => hwCell.get(`${s.enrollment_id}:${w.weekend_id}`);
  const missing = hwWeeks.filter((w) => at(w) === "missing").map((w) => `W${w.weekend_no}`);
  const redo = hwWeeks.filter((w) => at(w) === "needs_changes").map((w) => `W${w.weekend_no}`);
  const failed = board.quizzes.flatMap((q, i) => (quizState(q.id, s.student_id) === "failed" ? [`Q${i + 1}`] : []));
  const skipped = board.quizzes.flatMap((q, i) => (quizState(q.id, s.student_id) === "none" ? [`Q${i + 1}`] : []));
  const out: string[] = [];
  if (missing.length) out.push(`missing homework ${missing.join(", ")}`);
  if (redo.length) out.push(`to fix ${redo.join(", ")}`);
  if (failed.length) out.push(`below pass in ${failed.join(", ")}`);
  if (skipped.length) out.push(`no attempt at ${skipped.join(", ")}`);
  return out;
}

function Chip({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `${title} (not open yet)` : title}
      className={`min-w-[2.5rem] rounded-lg px-2 py-1 text-xs font-semibold transition disabled:opacity-30 ${
        active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, hint, tone = "text-slate-800" }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 min-w-0">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold tabular-nums leading-tight ${tone}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 truncate">{hint}</p>}
    </div>
  );
}

function NameGroup({
  meta,
  people,
}: {
  meta: { label: string; icon: string; color: string };
  people: { key: number; name: string; extra?: string }[];
}) {
  if (people.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: meta.color }} />
        {meta.icon} {meta.label} · {people.length}
      </p>
      <div className="flex flex-wrap gap-1">
        {people.map((p) => (
          <span key={p.key} className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">
            {p.name}
            {p.extra && <b className="ml-1 tabular-nums">{p.extra}</b>}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * The tutor's weekly read-out: how the class is doing, in plain sentences with
 * names, then who to contact and why (with an Email button on each).
 */
function Insights({
  board,
  hwCell,
  hwWeeks,
  quizState,
}: {
  board: WeeklyBoard;
  hwCell: Map<string, HomeworkCell>;
  hwWeeks: Week[];
  quizState: QuizStateFn;
}) {
  const { students, quizzes } = board;
  const due = hwWeeks.filter((w) => w.phase === "due");
  const items: { icon: string; tone: string; text: string }[] = [];
  const cell = (s: Student, w: Week) => hwCell.get(`${s.enrollment_id}:${w.weekend_id}`);

  if (due.length > 0) {
    const rates = due.map((w) => ({
      w,
      rate: pct(students.filter((s) => cell(s, w) !== "missing").length, students.length),
    }));
    const overall = Math.round(rates.reduce((s, r) => s + r.rate, 0) / rates.length);
    let text = `Homework: on average ${overall}% of students submitted across ${plural(due.length, "due week")}.`;
    if (rates.length > 1) {
      const best = rates.reduce((a, b) => (b.rate > a.rate ? b : a));
      const worst = rates.reduce((a, b) => (b.rate < a.rate ? b : a));
      if (best.w !== worst.w) text += ` Best W${best.w.weekend_no} (${best.rate}%), weakest W${worst.w.weekend_no} (${worst.rate}%).`;
      const change = rates[rates.length - 1].rate - rates[rates.length - 2].rate;
      if (change !== 0) text += ` Latest week ${change > 0 ? "up" : "down"} ${Math.abs(change)} points.`;
    }
    items.push({ icon: "📊", tone: "text-slate-700", text });

    const perfect = students.filter((s) => due.every((w) => cell(s, w) !== "missing"));
    if (perfect.length > 0 && perfect.length < students.length) {
      items.push({
        icon: "✅",
        tone: "text-emerald-700",
        text: `${plural(perfect.length, "student")} submitted every due week: ${listNames(perfect.map((s) => s.name))}.`,
      });
    } else if (perfect.length === students.length) {
      items.push({ icon: "✅", tone: "text-emerald-700", text: "Every student has submitted every due homework." });
    }
  }

  const marked = Object.values(board.homework).filter((h) => h.marks != null);
  if (marked.length > 0) {
    const avg = marked.reduce((s, h) => s + (h.marks ?? 0), 0) / marked.length;
    const ranked = students
      .map((s) => {
        const m = hwWeeks
          .map((w) => board.homework[`${s.enrollment_id}:${w.weekend_id}`]?.marks)
          .filter((x): x is number => x != null);
        return { s, n: m.length, avg: m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0 };
      })
      .filter((x) => x.n > 0)
      .sort((a, b) => b.avg - a.avg);
    items.push({
      icon: "🏆",
      tone: "text-slate-700",
      text: `Average homework mark ${avg.toFixed(1)}/10. Top: ${listNames(
        ranked.slice(0, 3).map((x) => `${x.s.name} (${x.avg.toFixed(1)})`)
      )}.`,
    });
  }

  const toMark = Object.values(board.homework).filter((h) => h.status === "awaiting").length;
  if (toMark > 0) {
    items.push({ icon: "📝", tone: "text-amber-700", text: `${plural(toMark, "homework submission")} waiting for your marks (Homework tab).` });
  }

  if (quizzes.length > 0) {
    const rates = quizzes.map((q, i) => ({
      i,
      pass: pct(students.filter((s) => quizState(q.id, s.student_id) === "passed").length, students.length),
    }));
    const worst = rates.reduce((a, b) => (b.pass < a.pass ? b : a));
    items.push({
      icon: "🧠",
      tone: "text-slate-700",
      text: `Quizzes: ${Math.round(rates.reduce((s, r) => s + r.pass, 0) / rates.length)}% of students pass on average.${
        rates.length > 1 ? ` Hardest so far: Q${worst.i + 1} ${quizzes[worst.i].title} (${worst.pass}% passed) — worth revising in class.` : ""
      }`,
    });
  }

  // Most behind first: each missing homework counts double, each other issue once.
  const behind = (s: Student) =>
    hwWeeks.reduce((n, w) => n + (cell(s, w) === "missing" ? 2 : cell(s, w) === "needs_changes" ? 1 : 0), 0) +
    quizzes.filter((q) => quizState(q.id, s.student_id) !== "passed").length;
  const followUp = students
    .map((s) => ({ s, reasons: followUpReasons(s, board, hwCell, hwWeeks, quizState), weight: behind(s) }))
    .filter((x) => x.reasons.length > 0)
    .sort((a, b) => b.weight - a.weight);

  const [showAll, setShowAll] = useState(false);
  const FOLLOW_UP_SHOWN = 5;
  const shown = showAll ? followUp : followUp.slice(0, FOLLOW_UP_SHOWN);

  if (items.length === 0 && followUp.length === 0) return null;
  return (
    <Card>
      <h2 className="font-bold mb-2">Key insights</h2>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.text} className={`flex gap-2 text-sm ${it.tone}`}>
            <span aria-hidden>{it.icon}</span>
            <span>{it.text}</span>
          </li>
        ))}
      </ul>

      {followUp.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-rose-700 mb-1">
            Follow up with {plural(followUp.length, "student")}
          </h3>
          <ul className="divide-y rounded-xl ring-1 ring-rose-100 bg-rose-50/40">
            {shown.map(({ s, reasons }) => (
              <li key={s.enrollment_id} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">{reasons.join(" · ")}</p>
                </div>
                <EmailStudentButton
                  studentId={s.student_id}
                  name={s.name}
                  defaultSubject="Checking in on your homework and quizzes"
                />
              </li>
            ))}
          </ul>
          {followUp.length > FOLLOW_UP_SHOWN && (
            <button onClick={() => setShowAll(!showAll)} className="mt-2 text-xs text-brand-700">
              {showAll ? "Show fewer" : `Show all ${followUp.length}`}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function WeekDetail({
  board,
  week,
  hwWeeks,
  hwCell,
}: {
  board: WeeklyBoard;
  week: Week;
  hwWeeks: Week[];
  hwCell: Map<string, HomeworkCell>;
}) {
  const { students } = board;
  const state = (s: Student, w = week) => hwCell.get(`${s.enrollment_id}:${w.weekend_id}`);
  const marksOf = (s: Student) => board.homework[`${s.enrollment_id}:${week.weekend_id}`]?.marks ?? null;
  const submittedIn = (w: Week) => students.filter((s) => SUBMITTED.includes(state(s, w) ?? "upcoming")).length;
  const marks = students.map(marksOf).filter((m): m is number => m != null);
  const top = marks.length ? Math.max(...marks) : null;
  const topNames = students.filter((s) => marksOf(s) === top).map((s) => s.name);

  const rate = pct(submittedIn(week), students.length);
  // Compare with the week before, when it has opened too.
  const prev = hwWeeks[hwWeeks.findIndex((w) => w.weekend_id === week.weekend_id) - 1];
  const delta = prev && prev.phase !== "upcoming" ? rate - pct(submittedIn(prev), students.length) : null;

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-bold">
          Week {week.weekend_no} <span className="font-normal text-slate-500">· {week.title}</span>
        </h2>
        <span className="text-xs text-slate-400">
          {week.phase === "due" ? "Due date has passed" : "Open, not due yet"}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat
          label="Submitted"
          value={`${submittedIn(week)}/${students.length}`}
          hint={
            delta == null || !prev
              ? `${rate}%`
              : delta === 0
                ? `${rate}% · same as W${prev.weekend_no}`
                : `${rate}% · ${delta > 0 ? "▲" : "▼"}${Math.abs(delta)} vs W${prev.weekend_no}`
          }
          tone={rate >= 80 ? "text-emerald-700" : rate >= 50 ? "text-amber-700" : "text-rose-600"}
        />
        <Stat
          label="Average mark"
          value={marks.length ? (marks.reduce((a, b) => a + b, 0) / marks.length).toFixed(1) : "—"}
          hint={marks.length ? `out of 10 · ${marks.length} marked` : "nothing marked yet"}
        />
        <Stat label="Highest" value={top != null ? `${top}/10` : "—"} hint={topNames.length ? listNames(topNames, 2) : undefined} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {HW_ORDER.map((k) => (
          <NameGroup
            key={k}
            meta={HW_META[k]}
            people={students
              .filter((s) => state(s) === k)
              .sort((a, b) => (marksOf(b) ?? -1) - (marksOf(a) ?? -1))
              .map((s) => {
                const m = marksOf(s);
                return { key: s.enrollment_id, name: s.name, extra: m != null ? `${m}/10` : undefined };
              })}
          />
        ))}
      </div>
    </>
  );
}

function QuizDetail({ board, index, quizState }: { board: WeeklyBoard; index: number; quizState: QuizStateFn }) {
  const q = board.quizzes[index];
  const { students } = board;
  const best = (s: Student) => board.quiz[`${q.id}:${s.student_id}`]?.best ?? null;
  const scores = students.map(best).filter((b): b is number => b != null);
  const passed = students.filter((s) => quizState(q.id, s.student_id) === "passed").length;
  const top = scores.length ? Math.max(...scores) : null;
  const topNames = students.filter((s) => best(s) === top).map((s) => s.name);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="font-bold">
          Quiz {index + 1} <span className="font-normal text-slate-500">· {q.title}</span>
        </h2>
        <span className="text-xs text-slate-400">Pass mark {q.pass_percent}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Stat
          label="Passed"
          value={`${passed}/${students.length}`}
          hint={`${scores.length} attempted`}
          tone={pct(passed, students.length) >= 70 ? "text-emerald-700" : "text-rose-600"}
        />
        <Stat
          label="Average score"
          value={scores.length ? `${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)}%` : "—"}
          hint="of those who attempted"
        />
        <Stat label="Highest" value={top != null ? `${top}%` : "—"} hint={topNames.length ? listNames(topNames, 2) : undefined} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {QUIZ_ORDER.map((k) => (
          <NameGroup
            key={k}
            meta={QUIZ_META[k]}
            people={students
              .filter((s) => quizState(q.id, s.student_id) === k)
              .sort((a, b) => (best(b) ?? -1) - (best(a) ?? -1))
              .map((s) => {
                const b = best(s);
                return { key: s.student_id, name: s.name, extra: b != null ? `${b}%` : undefined };
              })}
          />
        ))}
      </div>
    </>
  );
}
