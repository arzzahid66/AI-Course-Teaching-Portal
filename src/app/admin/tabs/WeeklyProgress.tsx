"use client";

import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { HomeworkCell, WeeklyBoard } from "@/actions/progress";
import { Card, ChartTooltip } from "../ui";

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

  // The week whose names list is shown: the clicked one, else the latest that has opened.
  const latestOpen = [...hwWeeks].reverse().find((w) => w.phase !== "upcoming") ?? hwWeeks[0];
  const [picked, setPicked] = useState<number | null>(null);
  const week = hwWeeks.find((w) => w.weekend_id === picked) ?? latestOpen;

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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <ChartCard
          title="Homework by week"
          headline={dueSlots > 0 ? `${Math.round((submitted / dueSlots) * 100)}%` : "—"}
          sub={dueSlots > 0 ? `submitted for weeks already due (${submitted}/${dueSlots})` : "No homework due yet"}
          data={hwData}
          series={HW_ORDER.map((k) => HW_META[k])}
          total={students.length}
          activeName={week ? `W${week.weekend_no}` : undefined}
          onPick={(name) => setPicked(hwWeeks.find((w) => `W${w.weekend_no}` === name)?.weekend_id ?? null)}
          empty="No weekends with homework scheduled for this intake."
        />
        <ChartCard
          title="Quizzes"
          headline={quizSlots > 0 ? `${Math.round((attempted / quizSlots) * 100)}%` : "—"}
          sub={quizSlots > 0 ? `of quiz attempts made (${attempted}/${quizSlots})` : "No published quizzes"}
          data={quizData}
          series={QUIZ_ORDER.map((k) => QUIZ_META[k])}
          total={students.length}
          empty="No published quizzes for this level yet."
        />
      </div>

      {week && (
        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="font-bold">
              Week {week.weekend_no} <span className="font-normal text-slate-500">· {week.title}</span>
            </h2>
            <span className="text-xs text-slate-400">
              {week.phase === "due" ? "Homework is due" : week.phase === "open" ? "Homework is open" : "Not open yet"} · tap a
              bar to switch week
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {HW_ORDER.map((k) => {
              const names = students.filter((s) => hwCell.get(`${s.enrollment_id}:${week.weekend_id}`) === k);
              if (names.length === 0) return null;
              return (
                <div key={k}>
                  <p className="text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: HW_META[k].color }} />
                    {HW_META[k].icon} {HW_META[k].label} · {names.length}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {names.map((s) => {
                      const marks = board.homework[`${s.enrollment_id}:${week.weekend_id}`]?.marks;
                      return (
                        <span key={s.enrollment_id} className="text-xs rounded-full bg-slate-100 text-slate-700 px-2 py-0.5">
                          {s.name}
                          {marks != null && <b className="ml-1 tabular-nums">{marks}/10</b>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="font-bold">Who did what</h2>
        <p className="text-xs text-slate-500 mb-3">
          One row per student. Homework shows marks out of 10, quizzes show the best %.
        </p>
        <Grid board={board} hwCell={hwCell} hwWeeks={hwWeeks} quizState={quizState} />
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
}: {
  board: WeeklyBoard;
  hwCell: Map<string, HomeworkCell>;
  hwWeeks: WeeklyBoard["weeks"];
  quizState: (quizId: number, studentId: number) => "passed" | "failed" | "none";
}) {
  const { students, quizzes } = board;
  const cols = `minmax(64px, 1.8fr) repeat(${hwWeeks.length}, minmax(0, 1fr))${
    quizzes.length ? ` 6px repeat(${quizzes.length}, minmax(0, 1fr))` : ""
  } minmax(34px, 0.8fr)`;
  const cellBase = "h-7 flex items-center justify-center rounded-md ring-1 text-[11px] font-semibold tabular-nums";

  return (
    <div className="grid gap-1 items-center" style={{ gridTemplateColumns: cols }}>
      {/* Header */}
      <span className="text-[11px] text-slate-400">Student</span>
      {hwWeeks.map((w) => (
        <span key={w.weekend_id} title={`Week ${w.weekend_no}: ${w.title}`} className="text-center text-[11px] font-semibold text-slate-500">
          W{w.weekend_no}
        </span>
      ))}
      {quizzes.length > 0 && <span />}
      {quizzes.map((q, i) => (
        <span key={q.id} title={q.title} className="text-center text-[11px] font-semibold text-brand-700">
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
                  className={`${cellBase} ${HW_META[c].cell}`}
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
                  className={`${cellBase} ${QUIZ_META[st].cell}`}
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
    </div>
  );
}

/** A grid row is just its cells; `display: contents` keeps them on the parent grid. */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}
