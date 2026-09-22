"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { DashboardStats } from "@/actions/batches";
import type { BatchRow } from "@/lib/course";
import { Card, ChartTooltip, MiniBar, StatCard, fmt, fmtDay, usePrivacy, useRs } from "../ui";

export default function DashboardTab({
  batch,
  stats,
}: {
  batch: BatchRow;
  stats: DashboardStats;
}) {
  const rs = useRs();
  const privacy = usePrivacy();
  // The bar's width is itself a number — leave it empty while amounts are hidden.
  const collectedPct =
    privacy || stats.fees.expected <= 0 ? 0 : (stats.fees.collected / stats.fees.expected) * 100;
  const chartData = stats.attendance.map((a, i) => ({
    name: `W${i + 1}`,
    Present: a.present,
    Excused: a.excused,
    Absent: a.absent,
  }));

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Students" value={String(stats.enrolled)} hint={batch.name} tone="brand" />
        <StatCard
          label="Collected"
          value={rs(stats.fees.collected)}
          hint={`${rs(stats.fees.collectedThisMonth)} this month`}
          tone="emerald"
        />
        <StatCard
          label="Due now"
          value={rs(stats.fees.outstanding)}
          hint={`${stats.fees.overdueStudents.length} past grace`}
          tone={stats.fees.outstanding > 0 ? "rose" : "slate"}
        />
        <StatCard
          label="Class average"
          value={stats.progress.average == null ? "—" : `${stats.progress.average}/100`}
          hint={`${stats.homeworkAwaiting} homework to mark`}
          tone="amber"
        />
      </div>

      <Card>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <h2 className="font-bold">Fees for this intake</h2>
          <span className="text-sm text-slate-500 tabular-nums">
            {rs(stats.fees.collected)} of {rs(stats.fees.expected)}
          </span>
        </div>
        <MiniBar pct={collectedPct} tone="bg-emerald-500" />
        <p className="text-xs text-slate-400 mt-1">
          Starts {fmtDay(batch.start_date)} · {rs(batch.monthly_fee)}/month × {batch.months} · blocked{" "}
          {batch.grace_days} days after a due date
        </p>
        {/* Naming who has not paid is as sensitive as the amount, so the whole
            list goes away in Privacy Mode rather than just its numbers. */}
        {privacy && stats.fees.overdueStudents.length > 0 && (
          <p className="mt-4 text-sm text-slate-400">
            Blocked-student list hidden — privacy mode is on.
          </p>
        )}
        {!privacy && stats.fees.overdueStudents.length > 0 && (
          <>
            <h3 className="font-semibold text-sm mt-4 mb-1 text-rose-700">Blocked for unpaid fees</h3>
            <ul className="divide-y text-sm">
              {stats.fees.overdueStudents.map((s) => (
                <li key={s.name + s.months.join()} className="flex justify-between py-1.5 gap-2">
                  <span>
                    {s.name}{" "}
                    <span className="text-slate-400">· Month {s.months.join(", ")}</span>
                  </span>
                  <span className="font-semibold text-rose-600 tabular-nums">{rs(s.remaining)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <h2 className="font-bold">Attendance by class</h2>
          {stats.nextClass && (
            <span className="text-xs text-slate-500">
              Next: {stats.nextClass.title.split(" — ")[0]} · {fmt(stats.nextClass.scheduled_at)}
            </span>
          )}
        </div>
        {chartData.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center">
            Attendance shows here after the first class is closed.
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Present" stackId="a" fill="#10b981" />
                <Bar dataKey="Excused" stackId="a" fill="#a78bfa" />
                <Bar dataKey="Absent" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-2">Students at risk</h2>
        {stats.progress.atRisk.length === 0 ? (
          <p className="text-slate-400 text-sm">Nobody is below 50 right now.</p>
        ) : (
          <ul className="divide-y text-sm">
            {stats.progress.atRisk.map((s) => (
              <li key={s.name} className="flex justify-between py-1.5">
                <span>{s.name}</span>
                <span className="font-semibold text-rose-600 tabular-nums">{s.score}/100</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
