"use client";

import { useState } from "react";
import type { BatchRow, ProgressRow } from "@/lib/course";
import { BAND_META, BandBadge, Card, EmptyRow, MiniBar, btn, downloadCsv } from "../ui";

type SortKey = "score" | "name" | "attendance" | "homework" | "quiz" | "videos";

const pctText = (p: number | null) => (p == null ? "—" : `${p}%`);

export default function ProgressTab({ batch, rows }: { batch: BatchRow; rows: ProgressRow[] }) {
  const [sort, setSort] = useState<SortKey>("score");
  const [open, setOpen] = useState<number | null>(null);

  const val = (r: ProgressRow): number | string =>
    sort === "name"
      ? r.name.toLowerCase()
      : sort === "score"
        ? r.score ?? -1
        : (r[sort].pct ?? -1);
  const sorted = [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb);
    return (vb as number) - (va as number);
  });
  const scored = rows.filter((r) => r.score != null);
  const average = scored.length ? Math.round(scored.reduce((s, r) => s + (r.score ?? 0), 0) / scored.length) : null;
  const bandCounts = rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.band]: (m[r.band] ?? 0) + 1 }), {});

  function exportCsv() {
    downloadCsv(`progress-${batch.name.replace(/\W+/g, "-")}.csv`, [
      ["Rank", "Student", "Email", "Score", "Band", "Attendance %", "Present", "Absent", "Excused", "Homework %", "Homework missing", "Quiz %", "Videos watched", "Videos released"],
      ...sorted.map((r, i) => [
        i + 1,
        r.name,
        r.email,
        r.score,
        BAND_META[r.band].label,
        r.attendance.pct,
        r.attendance.present,
        r.attendance.absent,
        r.attendance.excused,
        r.homework.pct,
        r.homework.missing,
        r.quiz.pct,
        r.videos.watched,
        r.videos.released,
      ]),
    ]);
  }

  const header = (key: SortKey, label: string, className = "") => (
    <th className={`py-2 px-2 ${className}`}>
      <button onClick={() => setSort(key)} className={sort === key ? "text-brand-700 font-semibold" : ""}>
        {label}
        {sort === key && " ↓"}
      </button>
    </th>
  );

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="font-bold">Progress — {batch.name}</h2>
            <p className="text-sm text-slate-500">
              Class average <b className="tabular-nums">{average ?? "—"}</b> · weights: attendance {batch.w_attendance}, homework{" "}
              {batch.w_homework}, quiz {batch.w_quiz}, videos {batch.w_videos}
            </p>
          </div>
          <button onClick={exportCsv} disabled={rows.length === 0} className={btn.small}>
            Export CSV
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {Object.entries(BAND_META).map(([band, m]) =>
            bandCounts[band] ? (
              <span key={band} className={`text-xs rounded-full px-2 py-0.5 ${m.className}`}>
                {m.label}: {bandCounts[band]}
              </span>
            ) : null
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Only work that is already due counts. Missed classes, missing homework and unattempted quizzes lower the score.
        </p>
      </Card>

      <Card>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 px-2">#</th>
                {header("name", "Student")}
                {header("score", "Score")}
                {header("attendance", "Attend.", "hidden sm:table-cell")}
                {header("homework", "Homework", "hidden sm:table-cell")}
                {header("quiz", "Quiz", "hidden sm:table-cell")}
                {header("videos", "Videos", "hidden sm:table-cell")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <FragmentRow key={r.enrollment_id} rank={i + 1} row={r} open={open === r.enrollment_id} onToggle={() => setOpen(open === r.enrollment_id ? null : r.enrollment_id)} />
              ))}
              {rows.length === 0 && <EmptyRow colSpan={7}>No students enrolled in this intake.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function FragmentRow({
  rank,
  row: r,
  open,
  onToggle,
}: {
  rank: number;
  row: ProgressRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b last:border-0 cursor-pointer hover:bg-slate-50" onClick={onToggle}>
        <td className="py-2 px-2 text-slate-400 tabular-nums">{rank}</td>
        <td className="py-2 px-2 font-medium">
          {r.name}
          {r.attendance.absent > 0 && (
            <span className="text-xs text-rose-600 font-normal"> · {r.attendance.absent} absent</span>
          )}
        </td>
        <td className="py-2 px-2">
          <span className="font-bold tabular-nums mr-1.5">{r.score ?? "—"}</span>
          <BandBadge band={r.band} />
        </td>
        <td className="py-2 px-2 hidden sm:table-cell tabular-nums">{pctText(r.attendance.pct)}</td>
        <td className="py-2 px-2 hidden sm:table-cell tabular-nums">{pctText(r.homework.pct)}</td>
        <td className="py-2 px-2 hidden sm:table-cell tabular-nums">{pctText(r.quiz.pct)}</td>
        <td className="py-2 px-2 hidden sm:table-cell tabular-nums">{pctText(r.videos.pct)}</td>
      </tr>
      {open && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-3 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <Part
                label="Attendance"
                pct={r.attendance.pct}
                weight={r.attendance.weight}
                detail={`${r.attendance.present} present of ${r.attendance.held} held · ${r.attendance.absent} absent · ${r.attendance.excused} excused`}
              />
              <Part
                label="Homework"
                pct={r.homework.pct}
                weight={r.homework.weight}
                detail={`${r.homework.marks} marks over ${r.homework.graded + r.homework.missing} counted · ${r.homework.missing} missing · ${r.homework.awaiting} awaiting marks`}
              />
              <Part
                label="Quiz"
                pct={r.quiz.pct}
                weight={r.quiz.weight}
                detail={`${r.quiz.attempted} of ${r.quiz.total} quizzes attempted`}
              />
              <Part
                label="Videos"
                pct={r.videos.pct}
                weight={r.videos.weight}
                detail={`${r.videos.watched} of ${r.videos.released} watched`}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Part({ label, pct, weight, detail }: { label: string; pct: number | null; weight: number; detail: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="font-medium">
          {label} <span className="text-xs text-slate-400">({weight}%)</span>
        </span>
        <span className="tabular-nums">{pct == null ? "not due yet" : `${pct}%`}</span>
      </div>
      <MiniBar pct={pct ?? 0} />
      <p className="text-xs text-slate-500 mt-1">{detail}</p>
    </div>
  );
}
