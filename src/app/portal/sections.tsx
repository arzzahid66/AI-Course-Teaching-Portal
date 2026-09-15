"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setVideoWatched,
  submitHomework,
  type PortalData,
  type PortalWeekend,
} from "@/actions/student";

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-5 mb-4 ${className}`}>
      {children}
    </section>
  );
}

export function rs(n: number): string {
  return `Rs ${Math.round(n).toLocaleString("en-PK")}`;
}

/** "2026-09-20" → "Sun 20 Sep" (date-only, no timezone shift). */
export function fmtDay(ymd: string | null, withYear = false): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

export function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-PK", {
        timeZone: "Asia/Karachi",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });
}

const FEE_BADGE: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-700" },
  partial: { label: "Partly paid", className: "bg-amber-100 text-amber-700" },
  unpaid: { label: "Due", className: "bg-slate-100 text-slate-600" },
  overdue: { label: "Overdue", className: "bg-rose-100 text-rose-700" },
  waived: { label: "Waived", className: "bg-violet-100 text-violet-700" },
};

const BAND: Record<string, { label: string; className: string; bar: string }> = {
  excellent: { label: "Excellent", className: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500" },
  good: { label: "Good", className: "bg-brand-50 text-brand-700", bar: "bg-brand-500" },
  needs_work: { label: "Needs work", className: "bg-amber-100 text-amber-700", bar: "bg-amber-500" },
  at_risk: { label: "At risk", className: "bg-rose-100 text-rose-700", bar: "bg-rose-500" },
  not_started: { label: "Not started", className: "bg-slate-100 text-slate-500", bar: "bg-slate-300" },
};

function Bar({ pct, tone = "bg-brand-500" }: { pct: number; tone?: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this:", text);
    }
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }
  return { copied, copy };
}

export function NotEnrolledCard() {
  return (
    <Card>
      <div className="text-center">
        <div className="text-5xl mb-3">📋</div>
        <h2 className="text-lg font-bold mb-1">You&apos;re not in a batch yet</h2>
        <p className="text-slate-600 text-sm">
          Your tutor will add you to the next batch. Once you&apos;re enrolled, your classes, videos, homework and fees show up here.
        </p>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// How to pay — every active payment account from the admin, plus WhatsApp
// ---------------------------------------------------------------------------
export function HowToPay({
  data,
  amount,
  monthLabel,
}: {
  data: PortalData;
  amount: number;
  monthLabel: string;
}) {
  const { copied, copy } = useCopy();
  const { accounts, whatsapp } = data.fees;
  const waText = encodeURIComponent(
    `Hi! I'm ${data.name}${data.enrollment ? ` (${data.enrollment.batchName})` : ""}. I've paid ${rs(amount)} for ${monthLabel}. Here is my payment screenshot.`
  );

  return (
    <div className="rounded-xl border border-slate-200 divide-y">
      <div className="p-3">
        <p className="text-sm font-semibold mb-2">1. Send {rs(amount)} to any of these</p>
        {accounts.length === 0 ? (
          <p className="text-slate-500 text-sm">Ask your tutor for the payment details.</p>
        ) : (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {a.method}
                  {a.bank_name ? ` · ${a.bank_name}` : ""}
                </p>
                {a.account_title && <p className="text-sm text-slate-700">{a.account_title}</p>}
                {[a.account_number, a.iban].filter(Boolean).map((value) => (
                  <div key={value} className="flex items-center justify-between gap-2 mt-1">
                    <p className="font-mono font-bold tracking-wide break-all">{value}</p>
                    <button
                      onClick={() => copy(value!)}
                      className="shrink-0 text-xs rounded-lg border border-slate-300 bg-white px-2 py-1"
                    >
                      {copied === value ? "Copied!" : "Copy"}
                    </button>
                  </div>
                ))}
                {a.instructions && <p className="text-xs text-slate-500 mt-1">{a.instructions}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold mb-2">2. Send the payment screenshot</p>
        {whatsapp ? (
          <a
            href={`https://wa.me/${whatsapp}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center rounded-xl bg-green-600 px-4 py-2.5 text-white font-semibold active:scale-[0.98] transition"
          >
            Send screenshot on WhatsApp
          </a>
        ) : (
          <p className="text-slate-500 text-sm">Send it to your tutor.</p>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold mb-1">3. Your tutor confirms it</p>
        <p className="text-slate-500 text-xs">
          The month shows as paid here once it&apos;s recorded, and you get a receipt number.
        </p>
      </div>
    </div>
  );
}

export function FeeBlockedCard({
  data,
  monthNo,
  remaining,
  dueDate,
}: {
  data: PortalData;
  monthNo: number;
  remaining: number;
  dueDate: string;
}) {
  return (
    <Card>
      <div className="text-center mb-4">
        <div className="text-5xl mb-3">⛔️</div>
        <p className="text-lg font-semibold text-rose-600 mb-1">
          Month {monthNo} fee is unpaid — {rs(remaining)}
        </p>
        <p className="text-slate-600 text-sm">
          It was due on {fmtDay(dueDate)}. Pay it to check in to class again.
        </p>
      </div>
      <HowToPay data={data} amount={remaining} monthLabel={`Month ${monthNo}`} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// This week's checklist (Class tab)
// ---------------------------------------------------------------------------
export function WeekChecklist({ data, onOpen }: { data: PortalData; onOpen: (tab: "videos" | "homework") => void }) {
  const week = data.weekends.find((w) => w.is_current) ?? null;
  if (!week) return null;
  if (!week.is_open) {
    const opens = week.class_at ? new Date(new Date(week.class_at).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString() : null;
    return (
      <Card>
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">Next up · Weekend {week.weekend_no}</p>
        <h2 className="font-bold">{week.title}</h2>
        <p className="text-sm text-slate-500 mt-1">Videos and homework open {fmtWhen(opens)}.</p>
      </Card>
    );
  }
  const main = week.videos.filter((v) => v.kind !== "extra");
  const sub = week.submission;
  const hwDone = sub && sub.status !== "needs_changes";

  const item = (done: boolean, label: string, hint: string, tab: "videos" | "homework") => (
    <li>
      <button onClick={() => onOpen(tab)} className="w-full flex items-center gap-3 py-2 text-left">
        <span
          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-sm ${
            done ? "bg-emerald-500 text-white" : "border-2 border-slate-300"
          }`}
        >
          {done ? "✓" : ""}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium ${done ? "text-slate-400 line-through" : ""}`}>{label}</span>
          <span className="block text-xs text-slate-400">{hint}</span>
        </span>
        <span className="text-slate-300">›</span>
      </button>
    </li>
  );

  return (
    <Card>
      <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">This week · Weekend {week.weekend_no}</p>
      <h2 className="font-bold mb-2">{week.title}</h2>
      <ul className="divide-y">
        {main.length === 0
          ? item(false, "Recorded videos", "Your tutor hasn't added this week's videos yet", "videos")
          : main.map((v, i) =>
              item(v.watched, `Watch video ${i + 1}: ${v.title}`, "Before Sunday's class", "videos")
            )}
        {week.homework &&
          item(
            !!hwDone,
            "Submit homework",
            sub?.status === "needs_changes"
              ? "Your tutor asked for changes"
              : sub
                ? sub.marks != null
                  ? `Marked ${sub.marks}/10`
                  : "Submitted — waiting for marks"
                : `Due ${fmtWhen(week.homework_due_at)}`,
            "homework"
          )}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Course — the batch's weekends
// ---------------------------------------------------------------------------
export function CourseTab({ data }: { data: PortalData }) {
  const e = data.enrollment;
  if (!e) return <NotEnrolledCard />;
  return (
    <>
      <Card>
        <p className="text-xs font-semibold text-brand-600 uppercase tracking-wide">
          {e.batchName} · Batch {e.level}
        </p>
        <h2 className="text-lg font-bold">{e.levelTitle}</h2>
        {e.promise && <p className="text-slate-600 text-sm mt-1">{e.promise}</p>}
        <p className="text-xs text-slate-400 mt-2">Live class every Sunday · 2 recorded videos every week</p>
      </Card>

      {data.weekends.map((w) => (
        <WeekendCard key={w.id} w={w} />
      ))}

      {e.outcomes.length > 0 && (
        <Card className="bg-brand-50/60 ring-brand-100">
          <h3 className="font-bold mb-2">After Batch {e.level} you will have</h3>
          <ul className="space-y-1.5 text-sm text-slate-700">
            {e.outcomes.map((o) => (
              <li key={o} className="flex gap-2">
                <span className="text-emerald-600">✓</span>
                {o}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function WeekendCard({ w }: { w: PortalWeekend }) {
  const [open, setOpen] = useState(w.is_current);
  return (
    <section
      className={`rounded-2xl bg-white shadow-sm p-4 mb-3 ring-1 ${w.is_current ? "ring-2 ring-brand-400" : "ring-slate-100"}`}
    >
      <button onClick={() => setOpen((v) => !v)} className="w-full text-left" aria-expanded={open}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-400 font-medium">
            Weekend {w.weekend_no}
            {w.class_at && ` · ${fmtWhen(w.class_at)}`}
          </p>
          <span className="flex gap-1">
            {w.is_current && (
              <span className="text-[10px] rounded-full bg-brand-600 text-white px-2 py-0.5">This week</span>
            )}
            {w.tag && <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">{w.tag}</span>}
          </span>
        </div>
        <h3 className="font-semibold mt-0.5">{w.title}</h3>
        {w.ng_skill && <p className="text-[11px] text-violet-600 font-medium">Ng Skill {w.ng_skill}</p>}
      </button>
      {open && (
        <div className="mt-3 text-sm">
          <ul className="space-y-1 text-slate-700 list-disc pl-5">
            {w.topics.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          {w.you_build && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
              <b>You build:</b> {w.you_build}
            </p>
          )}
          {w.homework && (
            <p className="mt-2 text-slate-600">
              <b>Homework:</b> {w.homework}
            </p>
          )}
          {w.slides.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {w.slides.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1">
                  📎 {s.label || "Slides"}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------
export function VideosTab({ data }: { data: PortalData }) {
  if (!data.enrollment) return <NotEnrolledCard />;
  const open = data.weekends.filter((w) => w.is_open);
  const current = open.find((w) => w.is_current);
  const ordered = [...(current ? [current] : []), ...open.filter((w) => w !== current).reverse()];

  if (ordered.length === 0) {
    return (
      <Card>
        <p className="text-slate-600 text-center">
          Videos open a week before each class. The first ones appear 7 days before your first Sunday.
        </p>
      </Card>
    );
  }
  return (
    <>
      {ordered.map((w) => (
        <Card key={w.id}>
          <p className="text-xs text-slate-400 font-medium">
            Weekend {w.weekend_no}
            {w.is_current && <span className="text-brand-600"> · this week</span>}
          </p>
          <h2 className="font-bold mb-2">{w.title}</h2>
          {w.videos.length === 0 ? (
            <p className="text-slate-400 text-sm">Videos for this weekend are coming soon.</p>
          ) : (
            <ul className="divide-y">
              {w.videos.map((v) => (
                <VideoRow key={v.id} video={v} />
              ))}
            </ul>
          )}
        </Card>
      ))}
    </>
  );
}

function VideoRow({ video }: { video: PortalWeekend["videos"][number] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [watched, setWatched] = useState(video.watched);
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !watched;
    setWatched(next);
    setError(null);
    start(async () => {
      const res = await setVideoWatched(video.id, next);
      if (res.error) {
        setWatched(!next);
        setError(res.error);
      } else router.refresh();
    });
  }

  const kind = video.kind === "topic" ? "Video 1 · Main topic" : video.kind === "hands_on" ? "Video 2 · Hands-on build" : "Extra";
  return (
    <li className="py-2.5">
      <div className="flex items-center gap-3">
        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-600 text-white"
          aria-label={`Play ${video.title}`}
        >
          ▶
        </a>
        <a href={video.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1">
          <span className="block font-medium text-sm">{video.title}</span>
          <span className="block text-xs text-slate-400">{kind}</span>
        </a>
        <button
          onClick={toggle}
          disabled={pending}
          className={`shrink-0 text-xs rounded-full px-3 py-1.5 font-semibold border ${
            watched ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 text-slate-600"
          }`}
        >
          {watched ? "✓ Watched" : "Mark watched"}
        </button>
      </div>
      {error && <p className="text-rose-600 text-xs mt-1">{error}</p>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Homework
// ---------------------------------------------------------------------------
export function HomeworkTab({ data }: { data: PortalData }) {
  if (!data.enrollment) return <NotEnrolledCard />;
  const withHomework = data.weekends.filter((w) => w.is_open && w.homework);
  if (withHomework.length === 0) {
    return (
      <Card>
        <p className="text-slate-600 text-center">No homework yet. It opens with each weekend&apos;s videos.</p>
      </Card>
    );
  }
  const current = withHomework.find((w) => w.is_current);
  const ordered = [...(current ? [current] : []), ...withHomework.filter((w) => w !== current).reverse()];
  return (
    <>
      {ordered.map((w) => (
        <HomeworkCard key={w.id} w={w} />
      ))}
    </>
  );
}

function HomeworkCard({ w }: { w: PortalWeekend }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const sub = w.submission;
  const [editing, setEditing] = useState(!sub);
  const late = !sub && w.homework_due_at != null && new Date(w.homework_due_at).getTime() < Date.now();

  const status = !sub
    ? late
      ? { label: "Missing — counts as 0", className: "bg-rose-100 text-rose-700" }
      : { label: "Not submitted", className: "bg-slate-100 text-slate-600" }
    : sub.status === "approved"
      ? { label: `Approved · ${sub.marks}/10`, className: "bg-emerald-100 text-emerald-700" }
      : sub.status === "needs_changes"
        ? { label: "Needs changes", className: "bg-amber-100 text-amber-700" }
        : { label: "Submitted", className: "bg-brand-50 text-brand-700" };

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-slate-400 font-medium">
            Weekend {w.weekend_no} · due {fmtWhen(w.homework_due_at)}
          </p>
          <h2 className="font-bold">{w.title}</h2>
        </div>
        <span className={`text-xs rounded-full px-2 py-0.5 shrink-0 ${status.className}`}>{status.label}</span>
      </div>
      <p className="text-sm text-slate-700 mt-2">{w.homework}</p>

      {sub && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
          <a href={sub.link_url} target="_blank" rel="noreferrer" className="text-brand-700 underline break-all">
            {sub.link_url}
          </a>
          {sub.note && <p className="text-slate-600 mt-1">“{sub.note}”</p>}
          <p className="text-xs text-slate-400 mt-1">Submitted {fmtWhen(sub.submitted_at)}</p>
          {sub.feedback && (
            <p className="mt-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <b>Tutor:</b> {sub.feedback}
            </p>
          )}
        </div>
      )}

      {sub && sub.status !== "approved" && !editing && (
        <button onClick={() => setEditing(true)} className="mt-3 text-sm text-brand-700 underline">
          {sub.status === "needs_changes" ? "Submit the updated work" : "Change my link"}
        </button>
      )}

      {editing && sub?.status !== "approved" && (
        <form
          action={(fd) => {
            setError(null);
            start(async () => {
              const res = await submitHomework(w.id, fd);
              if (res.error) setError(res.error);
              else {
                setEditing(false);
                router.refresh();
              }
            });
          }}
          className="mt-3 space-y-2"
        >
          <input
            name="link_url"
            defaultValue={sub?.link_url ?? ""}
            placeholder="Link to your work (GitHub, live site, Drive…)"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
          <textarea
            name="note"
            rows={2}
            defaultValue={sub?.note ?? ""}
            placeholder="Anything your tutor should know? (optional)"
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-brand-600 px-4 py-2.5 text-white font-semibold disabled:opacity-50"
          >
            {pending ? "Sending…" : sub ? "Submit again" : "Submit homework"}
          </button>
          {error && <p className="text-rose-600 text-sm">{error}</p>}
        </form>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------
export function ProgressTab({ data }: { data: PortalData }) {
  if (!data.enrollment) return <NotEnrolledCard />;
  const p = data.progress.mine;
  if (!p) return <NotEnrolledCard />;
  const band = BAND[p.band];

  const missed: string[] = [];
  if (p.attendance.absent > 0) missed.push(`${p.attendance.absent} class${p.attendance.absent > 1 ? "es" : ""} missed`);
  if (p.homework.missing > 0) missed.push(`${p.homework.missing} homework not submitted`);
  if (p.quiz.total - p.quiz.attempted > 0) missed.push(`${p.quiz.total - p.quiz.attempted} quiz not attempted`);
  if (p.videos.released - p.videos.watched > 0) missed.push(`${p.videos.released - p.videos.watched} video not marked watched`);

  const parts = [
    { label: "Attendance", part: p.attendance, detail: `${p.attendance.present} of ${p.attendance.held - p.attendance.excused} classes${p.attendance.excused ? ` · ${p.attendance.excused} on leave` : ""}` },
    { label: "Homework", part: p.homework, detail: `${p.homework.marks} marks · ${p.homework.missing} missing${p.homework.awaiting ? ` · ${p.homework.awaiting} waiting for marks` : ""}` },
    { label: "Quiz", part: p.quiz, detail: `${p.quiz.attempted} of ${p.quiz.total} quizzes attempted (best score counts)` },
    { label: "Videos", part: p.videos, detail: `${p.videos.watched} of ${p.videos.released} watched` },
  ];

  return (
    <>
      <Card>
        <p className="text-sm text-slate-500">Your progress score</p>
        <div className="flex items-end justify-between gap-2">
          <p className="text-5xl font-bold tabular-nums leading-none">
            {p.score ?? "—"}
            <span className="text-lg text-slate-400 font-medium">/100</span>
          </p>
          <span className={`text-sm rounded-full px-3 py-1 font-semibold ${band.className}`}>{band.label}</span>
        </div>
        <div className="mt-3">
          <Bar pct={p.score ?? 0} tone={band.bar} />
        </div>
        {data.progress.classAverage != null && (
          <p className="text-xs text-slate-500 mt-2">Class average: {data.progress.classAverage}/100</p>
        )}
        {p.score == null && (
          <p className="text-sm text-slate-500 mt-2">Your score starts after your first class.</p>
        )}
      </Card>

      {missed.length > 0 && (
        <Card className="bg-amber-50 ring-amber-200">
          <h3 className="font-semibold text-amber-900 mb-1">What&apos;s pulling your score down</h3>
          <ul className="text-sm text-amber-900/80 list-disc pl-5 space-y-0.5">
            {missed.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h3 className="font-bold mb-3">How it&apos;s worked out</h3>
        <ul className="space-y-4">
          {parts.map(({ label, part, detail }) => (
            <li key={label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">
                  {label} <span className="text-xs text-slate-400">· {part.weight}% of score</span>
                </span>
                <span className="tabular-nums">{part.pct == null ? "not due yet" : `${part.pct}%`}</span>
              </div>
              <Bar pct={part.pct ?? 0} />
              <p className="text-xs text-slate-500 mt-1">{detail}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-400 mt-4">
          Only work that is already due counts. There are no fines — missing class or homework only lowers your score.
        </p>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------
export function FeesTab({ data }: { data: PortalData }) {
  if (!data.enrollment) return <NotEnrolledCard />;
  const { invoices, payments, total, paid, remaining } = data.fees;
  const nextDue = invoices.find((i) => i.remaining > 0) ?? null;
  const absent = data.attendance.filter((a) => a.status === "absent").length;

  return (
    <>
      <Card>
        <p className="text-sm text-slate-500">{data.enrollment.batchName}</p>
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-3xl font-bold tabular-nums">{rs(paid)}</p>
            <p className="text-sm text-slate-500">paid of {rs(total)}</p>
          </div>
          {remaining > 0 ? (
            <span className="text-sm rounded-full px-3 py-1 font-semibold bg-amber-100 text-amber-700">{rs(remaining)} left</span>
          ) : (
            <span className="text-sm rounded-full px-3 py-1 font-semibold bg-emerald-100 text-emerald-700">All paid</span>
          )}
        </div>
        <div className="mt-3">
          <Bar pct={total > 0 ? (paid / total) * 100 : 100} tone="bg-emerald-500" />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {invoices.map((i) => {
          const b = FEE_BADGE[i.status];
          return (
            <div key={i.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 p-4">
              <div className="flex items-center justify-between gap-1">
                <p className="font-semibold">Month {i.month_no}</p>
                <span className={`text-[11px] rounded-full px-2 py-0.5 ${b.className}`}>{b.label}</span>
              </div>
              <p className="text-lg font-bold tabular-nums mt-1">{rs(i.amount - i.discount)}</p>
              <p className="text-xs text-slate-500">Due {fmtDay(i.due_date)}</p>
              {i.remaining > 0 && i.status !== "overdue" && (
                <p className="text-[11px] text-slate-400">Pay by {fmtDay(i.grace_until)} to keep joining class</p>
              )}
              {i.remaining > 0 && i.paid > 0 && <p className="text-[11px] text-amber-700">{rs(i.remaining)} left</p>}
              {i.note && <p className="text-[11px] text-violet-600">{i.note}</p>}
            </div>
          );
        })}
      </div>

      {nextDue && (
        <Card>
          <h3 className="font-bold mb-1">How to pay</h3>
          <p className="text-sm text-slate-500 mb-3">
            {remaining > nextDue.remaining
              ? `Pay Month ${nextDue.month_no} (${rs(nextDue.remaining)}) or everything left (${rs(remaining)}) at once.`
              : `Pay ${rs(nextDue.remaining)} for Month ${nextDue.month_no}.`}
          </p>
          <HowToPay data={data} amount={nextDue.remaining} monthLabel={`Month ${nextDue.month_no}`} />
        </Card>
      )}

      <Card>
        <h3 className="font-bold mb-2">Receipts</h3>
        {payments.length === 0 ? (
          <p className="text-slate-400 text-sm">No payments recorded yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {payments.map((p) => (
              <li key={p.receipt_no} className="py-2 flex justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {rs(p.amount)} · Month {p.months.join(" + ")}
                  </p>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{p.receipt_no}</span> · {p.method} · {fmtWhen(p.paid_at)}
                  </p>
                </div>
                <span className="text-emerald-600 text-lg">✓</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="font-bold">Attendance</h3>
          <span className={`text-sm ${absent ? "text-rose-600" : "text-slate-500"}`}>
            {absent} absent
          </span>
        </div>
        {data.attendance.length === 0 ? (
          <p className="text-slate-400 text-sm">No classes yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.attendance.map((a, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5">
                <span className="truncate">{a.title}</span>
                <span
                  className={
                    a.status === "present" ? "text-emerald-600" : a.status === "excused" ? "text-violet-600" : "text-rose-600"
                  }
                >
                  {a.status === "excused" ? "on leave" : a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-400 mt-2">No fines — absences only lower your progress score.</p>
      </Card>
    </>
  );
}
