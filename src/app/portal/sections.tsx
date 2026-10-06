"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setVideoWatched,
  submitHomework,
  type PortalData,
  type PortalWeekend,
} from "@/actions/student";
import type { LibraryData, LibraryVideo } from "@/actions/library";
import {
  CONTENT_KINDS,
  FEE_BANNER_DISMISS_PREFIX,
  FEE_BANNER_LEAD_DAYS,
  type ContentKind,
} from "@/lib/constants";

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
          Your tutor will add you to the next batch. Once you&apos;re enrolled, your videos, quizzes, homework and fees show up here.
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
  // Only these fields are read, so the login lock screen can pass its own data.
  data: {
    name: string;
    enrollment: { batchName: string } | null;
    fees: Pick<PortalData["fees"], "accounts" | "whatsapp">;
  };
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

/**
 * Shown on every portal tab while the student still owes a fee month.
 *
 * Two phases, because they need different things said:
 *
 *   * **before the due date** - informational. The student is not in trouble,
 *     but should know the bill exists and, more importantly, the exact date
 *     the account switches off if they ignore it.
 *   * **after the due date, inside the grace period** - urgent. This is the
 *     last window in which they can still get in and fix it.
 *
 * Once grace runs out, getAccountLock() blocks the portal entirely, so the
 * student never reaches a tab to read a banner. That is why this warns from
 * the moment money is owed rather than waiting for the due date, and why it
 * cannot be dismissed.
 */
/**
 * Forget every closed fee banner. Called on logout so signing back in on the
 * same device shows the reminder again.
 */
export function clearFeeBannerDismissals(): void {
  try {
    for (const k of Object.keys(sessionStorage)) {
      if (k.startsWith(FEE_BANNER_DISMISS_PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // Storage blocked (private mode). Nothing was saved, so nothing to clear.
  }
}

/**
 * Fee reminder pinned above every portal tab.
 *
 * Three rules decide whether it shows at all:
 *
 *   * **Not more than FEE_BANNER_LEAD_DAYS before the due date.** Without this
 *     the banner announced next month the instant the current month was paid
 *     off - a student who had just paid saw "Month 2 fee is due" a month
 *     early, which reads as a demand rather than a reminder.
 *   * **Not for a month that already blocks the account** - by then
 *     getAccountLock() has taken the whole portal over and says it far more
 *     plainly than a banner could.
 *   * **Not if the student closed it this visit.** Closing is session-scoped
 *     on purpose: the fee can be set aside for now, but the next sign-in
 *     brings it back. It is never dismissed for good.
 */
export function FeeDueBanner({ data, onPay }: { data: PortalData; onPay: () => void }) {
  // The soonest month they still owe on: the one that will lock them out first.
  const next =
    data.fees.invoices
      .filter((i) => i.remaining > 0 && !i.blocks && i.days_to_due <= FEE_BANNER_LEAD_DAYS)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null;

  const key = next === null ? null : `${FEE_BANNER_DISMISS_PREFIX}${next.id}`;

  // sessionStorage does not exist while this renders on the server, so for one
  // frame we do not know whether it was closed. Show nothing rather than flash
  // a banner the student has already dismissed.
  const [closed, setClosed] = useState<boolean | null>(null);
  useEffect(() => {
    if (key === null) return;
    try {
      setClosed(sessionStorage.getItem(key) === "1");
    } catch {
      setClosed(false); // Storage blocked - better to show it than to hide it.
    }
  }, [key]);

  function close() {
    try {
      if (key) sessionStorage.setItem(key, "1");
    } catch {
      // Cannot remember it; it simply comes back on the next page load.
    }
    setClosed(true);
  }

  if (next === null || closed !== false) return null;

  const urgent = next.past_due;
  // A partly paid month never locks the account, so don't threaten it.
  const partlyPaid = next.paid > 0;

  return (
    <div
      className={`mb-4 rounded-2xl px-4 py-3 ring-1 ${
        urgent ? "bg-amber-50 ring-amber-300" : "bg-brand-50 ring-brand-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm font-bold ${urgent ? "text-amber-900" : "text-brand-800"}`}>
          {partlyPaid
            ? "\u{1F4B3} Balance pending"
            : urgent
              ? "\u23F3 Grace period \u2014 fee pending"
              : "\u{1F4B3} Fee due"}
        </p>
        <button
          onClick={close}
          aria-label="Close"
          title="Close - it shows again next time you sign in"
          className={`-mr-1 -mt-0.5 shrink-0 rounded-lg px-2 py-0.5 text-lg leading-none active:scale-90 transition ${
            urgent ? "text-amber-700 hover:bg-amber-100" : "text-brand-700 hover:bg-brand-100"
          }`}
        >
          {"\u00D7"}
        </button>
      </div>
      {partlyPaid ? (
        <p className={`text-sm mt-1 ${urgent ? "text-amber-900" : "text-slate-700"}`}>
          Month {next.month_no}: you&apos;ve paid {rs(next.paid)}, <b>{rs(next.remaining)}</b> is still left
          {urgent ? "" : ` (due ${fmtDay(next.due_date, true)})`}. Your account stays active {"\u2014"} please
          clear the balance as soon as you can.
        </p>
      ) : (
        <p className={`text-sm mt-1 ${urgent ? "text-amber-900" : "text-slate-700"}`}>
          Month {next.month_no} fee {"\u2014"} <b>{rs(next.remaining)}</b>{" "}
          {urgent
            ? `is unpaid. It was due on ${fmtDay(next.due_date, true)}.`
            : `is due on ${fmtDay(next.due_date, true)}.`}{" "}
          Pay by <b>{fmtDay(next.grace_until, true)}</b>, otherwise your account is deactivated and
          you lose access to videos, quizzes and homework.
        </p>
      )}
      <button
        onClick={onPay}
        className={`mt-2.5 rounded-xl text-white text-sm font-semibold px-4 py-2 active:scale-[0.97] transition ${
          urgent ? "bg-amber-600" : "bg-brand-600"
        }`}
      >
        Pay now
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// This week's checklist (top of the Course tab)
// ---------------------------------------------------------------------------
export function WeekChecklist({ data, onOpen }: { data: PortalData; onOpen: (tab: "videos" | "homework") => void }) {
  const week = data.weekends.find((w) => w.is_current) ?? null;
  if (!week) return null;
  const main = week.videos.filter((v) => v.kind === "topic" || v.kind === "hands_on");
  const sub = week.submission;
  const hwDone = sub && sub.status !== "needs_changes";

  const item = (done: boolean, label: string, hint: string, tab: "videos" | "homework") => (
    <li key={label}>
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
              item(v.watched, `Watch video ${i + 1}: ${v.title}`, "This week's lesson", "videos")
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
        <p className="text-xs text-slate-400 mt-2">2 recorded videos every week · quizzes · homework</p>
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
          {w.slides.length > 0 && <SlideLinks slides={w.slides} />}
        </div>
      )}
    </section>
  );
}

/** Slides and extra links for a weekend — always available, like a library. */
function SlideLinks({ slides }: { slides: PortalWeekend["slides"] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {slides.map((s) => (
        <a
          key={s.url}
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs rounded-lg border border-brand-200 text-brand-700 px-2 py-1"
        >
          📎 {s.label || "Slides"}
        </a>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lessons — each weekend's videos, slides, code and notes
// ---------------------------------------------------------------------------
export function VideosTab({ data }: { data: PortalData }) {
  if (!data.enrollment) return <NotEnrolledCard />;
  // The whole course: every weekend's content, available from day one.
  const withVideos = data.weekends.filter((w) => w.videos.length > 0);
  const current = withVideos.find((w) => w.is_current);
  const ordered = [...(current ? [current] : []), ...withVideos.filter((w) => w !== current)];

  if (ordered.length === 0) {
    return (
      <Card>
        <p className="text-slate-600 text-center">
          Your tutor hasn&apos;t added any lessons yet. They appear here as soon as they do.
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
            {w.class_at && ` · ${fmtWhen(w.class_at)}`}
            {w.is_current && <span className="text-brand-600"> · this week</span>}
          </p>
          <h2 className="font-bold mb-2">{w.title}</h2>
          <ul className="divide-y">
            {w.videos.map((v) =>
              CONTENT_KINDS[v.kind]?.isVideo ? <VideoRow key={v.id} video={v} /> : <LinkRow key={v.id} item={v} />
            )}
          </ul>
          {w.slides.length > 0 && <SlideLinks slides={w.slides} />}
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

  const kind = CONTENT_KINDS[video.kind]?.label ?? "Video";
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

/** Icon tile per non-video kind, so slides never look like something to play. */
const LINK_STYLE: Partial<Record<ContentKind, { icon: string; tile: string }>> = {
  slides: { icon: "📊", tile: "bg-amber-100 text-amber-700" },
  code: { icon: "</>", tile: "bg-slate-800 text-white text-xs font-bold" },
  doc: { icon: "📄", tile: "bg-brand-50 text-brand-700" },
};

/** Slides, code or notes: opens the link; nothing to tick off. */
function LinkRow({ item }: { item: PortalWeekend["videos"][number] }) {
  const style = LINK_STYLE[item.kind] ?? LINK_STYLE.doc!;
  return (
    <li className="py-2.5">
      <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.tile}`} aria-hidden>
          {style.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm">{item.title}</span>
          <span className="block text-xs text-slate-400">{CONTENT_KINDS[item.kind]?.label}</span>
        </span>
        <span className="shrink-0 text-xs rounded-full px-3 py-1.5 font-semibold border border-slate-300 text-slate-600">
          Open ↗
        </span>
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Library — topic playlists (closed until opened) + general videos
// ---------------------------------------------------------------------------
export function LibraryTab({ library }: { library: LibraryData }) {
  const { videos } = library;
  // A playlist with nothing in it yet has nothing to show a student.
  const playlists = library.playlists
    .map((p) => ({ ...p, videos: videos.filter((v) => v.playlist_id === p.id) }))
    .filter((p) => p.videos.length > 0);
  const general = videos.filter((v) => v.playlist_id == null);

  if (playlists.length === 0 && general.length === 0) {
    return (
      <Card>
        <div className="text-center py-4">
          <div className="text-4xl mb-2">📚</div>
          <h2 className="text-lg font-bold mb-1">The Library is empty</h2>
          <p className="text-slate-500 text-sm">
            Your tutor hasn&apos;t added any extra videos yet. Check back soon.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">📚 Library</h2>
        <p className="text-slate-500 text-sm">
          Extra lessons from your tutor, open to every student. Open a playlist to see its videos in order.
        </p>
      </Card>

      {playlists.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">Playlists</p>
          {playlists.map((p) => (
            <PlaylistCard key={p.id} title={p.title} description={p.description} videos={p.videos} />
          ))}
        </>
      )}

      {general.length > 0 && (
        <Card>
          <h2 className="font-bold mb-2">More videos</h2>
          <ul className="divide-y">
            {general.map((v) => (
              <LibraryVideoRow key={v.id} video={v} />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function PlaylistCard({
  title,
  description,
  videos,
}: {
  title: string;
  description: string | null;
  videos: LibraryVideo[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`rounded-2xl bg-white shadow-sm p-4 mb-3 ring-1 ${open ? "ring-2 ring-brand-400" : "ring-slate-100"}`}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 text-left" aria-expanded={open}>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white text-lg" aria-hidden>
          🎞️
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-xs text-slate-400">
            {videos.length} video{videos.length === 1 ? "" : "s"} · playlist
          </span>
        </span>
        <span className={`text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open && (
        <div className="mt-3">
          {description && <p className="text-sm text-slate-600 mb-2 whitespace-pre-line">{description}</p>}
          <ol className="divide-y">
            {videos.map((v, i) => (
              <LibraryVideoRow key={v.id} video={v} number={i + 1} />
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function LibraryVideoRow({ video, number }: { video: LibraryVideo; number?: number }) {
  return (
    <li className="py-2.5">
      <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3">
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-600 text-white" aria-hidden>
          ▶
          {number != null && (
            <span className="absolute -top-1.5 -left-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-slate-800 px-1 text-[10px] font-bold">
              {number}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-sm">{video.title}</span>
          {video.description && (
            <span className="block text-xs text-slate-500 whitespace-pre-line">{video.description}</span>
          )}
        </span>
      </a>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Homework
// ---------------------------------------------------------------------------
export function HomeworkTab({ data }: { data: PortalData }) {
  if (!data.enrollment) return <NotEnrolledCard />;
  const withHomework = data.weekends.filter((w) => w.homework);
  if (withHomework.length === 0) {
    return (
      <Card>
        <p className="text-slate-600 text-center">Your tutor hasn&apos;t added any homework yet.</p>
      </Card>
    );
  }
  const current = withHomework.find((w) => w.is_current);
  const ordered = [...(current ? [current] : []), ...withHomework.filter((w) => w !== current)];
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
  if (p.homework.missing > 0) missed.push(`${p.homework.missing} homework not submitted`);
  if (p.quiz.total - p.quiz.attempted > 0) missed.push(`${p.quiz.total - p.quiz.attempted} quiz not attempted`);
  if (p.videos.released - p.videos.watched > 0) missed.push(`${p.videos.released - p.videos.watched} video not marked watched`);

  const parts = [
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
          <p className="text-sm text-slate-500 mt-2">Your score starts once your first video, quiz or homework is due.</p>
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
          Only work that is already due counts. There are no fines — missing homework, quizzes or videos only lowers your score.
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
              {i.remaining > 0 && i.paid === 0 && i.status !== "overdue" && (
                <p className="text-[11px] text-slate-400">Pay by {fmtDay(i.grace_until)} to keep your account active</p>
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
    </>
  );
}
