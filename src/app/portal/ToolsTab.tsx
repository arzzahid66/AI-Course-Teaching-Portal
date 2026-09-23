"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  askForLoginCode,
  cancelLoginCode,
  cancelResourceRequest,
  getMyLoginCode,
  getStudentResources,
  markLoginCodeUsed,
  requestResource,
} from "@/actions/resources";
import type {
  LoginCodeRow,
  StudentResourceData,
  StudentResourceView,
} from "@/lib/resources";
import {
  CLAUDE_LOGIN_EMAIL,
  LOGIN_CODE_POLL_MS,
  RESOURCE_DURATIONS,
  normalizeUrl,
  youtubeEmbedUrl,
} from "@/lib/constants";
import { usePolling } from "@/lib/usePolling";
import { Card, fmtWhen } from "./sections";

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  if (h >= 24 && Number.isInteger(h / 24)) {
    const d = h / 24;
    return d === 1 ? "1 day" : `${d} days`;
  }
  return h === 1 ? "1 hour" : `${Number.isInteger(h) ? h : h.toFixed(1)} hours`;
}

/**
 * "2d 4h" / "4h 37m" / "18m 48s" - a countdown to `target`.
 *
 * Units are always spelled out. A bare "18:48" reads as a clock time, and a
 * student glancing at "starts in 18:48" will think 6:48 pm rather than in
 * eighteen minutes.
 */
function countdown(target: string, now: number | null): string {
  // Before mount there is no honest answer: the server's clock and the
  // browser's differ, and rendering either one causes a hydration mismatch.
  if (now === null) return "…";
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "0m 0s";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${sec}s`;
}

/**
 * A clock that ticks once a second, so countdowns stay honest.
 *
 * Starts as `null` and only takes a reading after mount. Server-rendered HTML
 * and the browser's first render therefore agree (both show a placeholder),
 * which is what keeps React from throwing a hydration mismatch on a page whose
 * whole point is a live timer.
 */
function useNow(active: boolean): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function ToolsTab({ data: initialData }: { data: StudentResourceData }) {
  // Keeps the card in step with the tutor: a booking approved or rejected while
  // the student is looking at this tab updates in place.
  const [data, setData] = useState(initialData);
  useEffect(() => setData(initialData), [initialData]);

  const refresh = useCallback(async () => {
    setData(await getStudentResources());
  }, []);
  usePolling(refresh, 15000);

  return (
    <>
      {data.helpVideo && (
        <Card className="ring-brand-200 bg-brand-50/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 mb-1">
            Start here
          </p>
          <HelpVideo
            url={data.helpVideo.url}
            title={data.helpVideo.title}
            subtitle="Watch this first - it shows the whole thing end to end."
          />
        </Card>
      )}

      {data.tools.map((tool) => (
        <ToolCard key={tool.resource.id} tool={tool} />
      ))}

      {data.tools.length === 0 && (
        <Card>
          <p className="text-slate-500 text-sm">
            No shared tools are set up yet. Your tutor will add them here.
          </p>
        </Card>
      )}

      {data.history.length > 0 && (
        <Card>
          <h2 className="font-bold mb-2">Your past bookings</h2>
          <ul className="divide-y text-sm">
            {data.history.map((h) => (
              <li key={h.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{h.resource_name}</span>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                      STATUS_CHIP[h.status] ?? STATUS_CHIP.cancelled
                    }`}
                  >
                    {h.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  {fmtWhen(h.start_at)} {"→"} {fmtWhen(h.end_at)}
                </p>
                {h.feedback && (
                  <p className="text-xs mt-1 rounded-lg bg-slate-50 px-2 py-1 text-slate-600">
                    Tutor&apos;s note: {h.feedback}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function ToolCard({ tool }: { tool: StudentResourceView }) {
  const { resource, mine, blockedReason, busy } = tool;
  const isLive = mine?.status === "approved" && mine.slot === "active";
  const now = useNow(isLive || mine?.slot === "upcoming");

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">{resource.name}</h2>
        <span className="text-xs text-slate-500">
          {resource.max_minutes > 0 ? `up to ${hoursLabel(resource.max_minutes)}` : "no time limit"}
          {resource.capacity > 1 && ` · ${resource.capacity} at a time`}
        </span>
      </div>
      {resource.blurb && <p className="text-sm text-slate-600 mt-1">{resource.blurb}</p>}

      {resource.help_video_url && (
        <div className="mt-3">
          <HelpVideo
            url={resource.help_video_url}
            title={`How to get and use ${resource.name}`}
          />
        </div>
      )}

      {isLive && mine ? (
        <LiveSlot request={mine} resource={resource} now={now} />
      ) : mine?.status === "approved" ? (
        <UpcomingSlot request={mine} resource={resource} now={now} />
      ) : mine?.status === "pending" ? (
        <PendingSlot request={mine} />
      ) : blockedReason ? (
        <p className="mt-3 rounded-xl bg-amber-50 text-amber-800 text-sm px-3 py-2">
          {blockedReason}
        </p>
      ) : (
        <BookingForm resource={resource} />
      )}

      {busy.length > 0 && !isLive && (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs font-semibold text-slate-500 mb-1">
            {resource.capacity > 1 ? "Booked by others" : "Already booked"}
          </p>
          <ul className="text-xs text-slate-500 space-y-0.5">
            {/* Two students can share a start time once capacity > 1, so the
                key has to include the position, not just the window. */}
            {busy.slice(0, 6).map((b, i) => (
              <li key={`${b.start_at}-${b.end_at}-${i}`}>
                {fmtWhen(b.start_at)} {"→"} {fmtWhen(b.end_at)}
              </li>
            ))}
          </ul>
          {resource.capacity > 1 && (
            <p className="text-xs text-slate-400 mt-1">
              {resource.capacity} students can use it at once, so these times may
              still have room.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * The tutor's "how to get and use this" clip, sitting on the tool card.
 *
 * Collapsed until it is asked for, for two reasons: an always-open iframe per
 * tool would pull YouTube's player into every portal visit whether or not
 * anyone wants it, and a student who already knows the drill should not have
 * to scroll past a video every time they book.
 *
 * A link that is not YouTube (a Drive or Loom recording, say) cannot be
 * embedded, so it degrades to the same card as an outward link rather than
 * disappearing.
 */
function HelpVideo({
  url,
  title,
  subtitle = "New to this? Watch the short video first.",
}: {
  url: string;
  title: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const embed = youtubeEmbedUrl(url);
  const link = normalizeUrl(url);

  const chrome =
    "flex w-full items-center gap-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3 py-2.5 text-left active:scale-[0.99] transition";
  const play = (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-600 text-white">
      {"\u25B6"}
    </span>
  );
  const caption = (
    <span className="min-w-0">
      <span className="block text-sm font-semibold text-slate-800">{title}</span>
      <span className="block text-xs text-slate-500">{subtitle}</span>
    </span>
  );

  if (!embed) {
    return (
      <a href={link} target="_blank" rel="noopener noreferrer" className={chrome}>
        {play}
        {caption}
      </a>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={chrome}>
        {play}
        {caption}
      </button>
    );
  }

  return (
    <div>
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black ring-1 ring-slate-200">
        <iframe
          src={embed}
          title={title}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-xs">
        <button type="button" onClick={() => setOpen(false)} className="text-slate-500 underline">
          Hide video
        </button>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-500 underline"
        >
          Open on YouTube
        </a>
      </div>
    </div>
  );
}

/**
 * The three things a student must do on claude.ai, in order. Shown live during
 * a slot, and as a greyed-out preview beforehand so nothing is a surprise when
 * the clock starts - the ordering is the whole ballgame, because Anthropic's
 * sign-in link dies 10 minutes after it is sent.
 */
function SignInSteps({
  onCopyEmail,
  copiedEmail,
  muted = false,
}: {
  onCopyEmail?: () => void;
  copiedEmail?: boolean;
  muted?: boolean;
}) {
  return (
    <ol className={`text-sm space-y-1.5 ${muted ? "text-slate-600" : "text-emerald-900"}`}>
      <li>
        <b>1.</b> Open claude.ai/login
      </li>
      <li className="flex flex-wrap items-center gap-2">
        <span>
          <b>2.</b> Enter this email:
        </span>
        <code className="rounded-lg bg-white px-2 py-1 text-xs">{CLAUDE_LOGIN_EMAIL}</code>
        {onCopyEmail && (
          <button
            onClick={onCopyEmail}
            className="text-xs rounded-lg border border-emerald-300 px-2 py-1"
          >
            {copiedEmail ? "Copied" : "Copy"}
          </button>
        )}
      </li>
      <li>
        <b>3.</b> You will see an &quot;enter code&quot; screen —{" "}
        <b className={muted ? "text-slate-700" : "text-rose-700"}>stay on it</b>, do not close
        it.
      </li>
      <li>
        <b>4.</b> Come back here and ask for the code.
      </li>
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Waiting states
// ---------------------------------------------------------------------------
function PendingSlot({ request }: { request: StudentResourceView["mine"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!request) return null;

  return (
    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5">
      <p className="text-sm text-amber-900 font-semibold">Waiting for your tutor</p>
      <p className="text-xs text-amber-800 mt-0.5">
        {fmtWhen(request.start_at)} {"→"} {fmtWhen(request.end_at)}
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          if (!confirm("Cancel this request?")) return;
          setBusy(true);
          await cancelResourceRequest(request.id);
          router.refresh();
        }}
        className="mt-2 text-xs text-amber-900 underline"
      >
        Cancel request
      </button>
    </div>
  );
}

function UpcomingSlot({
  request,
  resource,
  now,
}: {
  request: NonNullable<StudentResourceView["mine"]>;
  resource: StudentResourceView["resource"];
  now: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5">
      <p className="text-sm text-emerald-900 font-semibold">
        Booked {"·"} starts in {countdown(request.start_at, now)}
      </p>
      <p className="text-xs text-emerald-800 mt-0.5">
        {fmtWhen(request.start_at)} {"→"} {fmtWhen(request.end_at)}
      </p>

      {/* Without this the card is a dead end: the student is told they are
          booked and nothing about what to do with that. */}
      <div className="mt-2.5 rounded-lg bg-white px-3 py-2.5">
        <p className="text-sm font-semibold text-slate-800">What to do now</p>
        <p className="text-xs text-slate-600 mt-0.5">
          Nothing yet. Open this page again at <b>{fmtWhen(request.start_at)}</b> — that is
          when you can ask for the sign-in code.
        </p>
        <details className="mt-2">
          <summary className="text-xs text-brand-700 cursor-pointer select-none">
            See what you will need to do
          </summary>
          <div className="mt-2">
            <SignInSteps muted />
          </div>
        </details>
      </div>

      {resource.handover_note && (
        <p className="text-xs text-emerald-900 mt-2">{resource.handover_note}</p>
      )}
      <button
        disabled={busy}
        onClick={async () => {
          if (!confirm("Give up this slot?")) return;
          setBusy(true);
          await cancelResourceRequest(request.id);
          router.refresh();
        }}
        className="mt-2 text-xs text-emerald-900 underline"
      >
        Give up this slot
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The live slot — the sign-in code relay
// ---------------------------------------------------------------------------
function LiveSlot({
  request,
  resource,
  now,
}: {
  request: NonNullable<StudentResourceView["mine"]>;
  resource: StudentResourceView["resource"];
  now: number | null;
}) {
  const [code, setCode] = useState<LoginCodeRow | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const waiting = code !== null && code.code === null;
  const ready = code?.code != null;
  const endingSoon = now !== null && new Date(request.end_at).getTime() - now < 10 * 60_000;

  const poll = useCallback(async () => {
    try {
      setCode(await getMyLoginCode(request.id));
    } catch {
      /* a failed poll is not worth surfacing; the next one will tell us */
    }
  }, [request.id]);

  // Only poll while something is actually outstanding, and stop the moment the
  // code lands. No background chatter once the student is signed in.
  usePolling(poll, LOGIN_CODE_POLL_MS, waiting);

  // One read on mount, so a reopened tab picks up a code already sent.
  useEffect(() => {
    void poll();
  }, [poll]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy — please type it by hand.");
    }
  }

  return (
    <div className="mt-3 rounded-2xl ring-2 ring-emerald-300 bg-emerald-50/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-bold text-emerald-900">Your slot is running</p>
        <span
          className={`text-sm font-bold tabular-nums ${
            endingSoon ? "text-rose-600" : "text-emerald-800"
          }`}
        >
          {countdown(request.end_at, now)} left
        </span>
      </div>

      {endingSoon && (
        <p className="mt-2 rounded-lg bg-rose-100 text-rose-800 text-xs px-2 py-1.5">
          Your slot is almost over — save your work and log out.
        </p>
      )}

      {ready && code ? (
        <div className="mt-3">
          <p className="text-xs text-emerald-900 mb-1">
            Enter this code on the claude.ai screen you already have open:
          </p>
          <div className="flex items-center gap-2">
            <p className="flex-1 rounded-xl bg-white px-3 py-2.5 text-2xl font-bold tracking-widest tabular-nums text-center">
              {code.code}
            </p>
            <button
              onClick={() => copy(code.code as string, "code")}
              className="rounded-xl bg-emerald-600 text-white text-sm font-semibold px-3 py-2.5"
            >
              {copied === "code" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-rose-700 mt-1.5">
            Use it quickly — {code.expires_at ? countdown(code.expires_at, now) : "a little time"} left.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await markLoginCodeUsed(code.id);
              setCode(null);
              setConfirmed(false);
              setBusy(false);
            }}
            className="mt-2 w-full rounded-xl bg-emerald-700 text-white font-semibold py-2.5"
          >
            {"✓"} I&apos;m logged in
          </button>
        </div>
      ) : waiting && code ? (
        <div className="mt-3 rounded-xl bg-white px-3 py-3 text-center">
          <p className="text-sm font-semibold text-slate-700">Your tutor has been told</p>
          <p className="text-xs text-slate-500 mt-0.5">
            The code is on its way — keep this page open.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await cancelLoginCode(code.id);
              setCode(null);
              setBusy(false);
            }}
            className="mt-2 text-xs text-slate-500 underline"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <SignInSteps
            onCopyEmail={() => copy(CLAUDE_LOGIN_EMAIL, "email")}
            copiedEmail={copied === "email"}
          />

          {/* Anthropic's sign-in link dies 10 minutes after it is sent, so a
              student who asks first and fumbles step 1 burns the code. */}
          <label className="flex items-start gap-2 mt-3 text-sm text-emerald-900">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>I am on the &quot;enter code&quot; screen</span>
          </label>

          <button
            disabled={!confirmed || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await askForLoginCode(request.id);
              if (res.error) setError(res.error);
              else await poll();
              setBusy(false);
            }}
            className="mt-2 w-full rounded-xl bg-emerald-600 text-white font-semibold py-2.5 disabled:opacity-40"
          >
            Ask for code
          </button>
        </div>
      )}

      {resource.handover_note && !ready && (
        <p className="text-xs text-emerald-800 mt-2">{resource.handover_note}</p>
      )}
      {error && <p className="text-sm text-rose-600 mt-2">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking form
// ---------------------------------------------------------------------------
function BookingForm({ resource }: { resource: StudentResourceView["resource"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // max_minutes = 0 means no cap, so every offered length is allowed.
  const durations =
    resource.max_minutes > 0
      ? RESOURCE_DURATIONS.filter((m) => m <= resource.max_minutes)
      : RESOURCE_DURATIONS;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const local = String(fd.get("start_local") ?? "");
        if (!local) {
          setError("Pick a start time.");
          return;
        }
        // datetime-local is the student's wall clock; send an absolute instant
        // so a server running in UTC does not shift the booking.
        fd.set("start_at", new Date(local).toISOString());
        fd.set("resource_id", String(resource.id));
        setBusy(true);
        setError(null);
        const res = await requestResource(fd);
        setBusy(false);
        if (res.error) setError(res.error);
        else {
          form.reset();
          router.refresh();
        }
      }}
      className="mt-3 space-y-2"
    >
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">
          What will you use it for?
        </span>
        <textarea
          name="reason"
          rows={2}
          required
          placeholder="e.g. Building the RAG chatbot for Project B"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">Start</span>
          <input
            name="start_local"
            type="datetime-local"
            required
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-slate-500 mb-1">How long</span>
          <select
            name="minutes"
            defaultValue={String(durations[durations.length - 1] ?? 60)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white outline-none focus:border-brand-500"
          >
            {durations.map((m) => (
              <option key={m} value={m}>
                {hoursLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-brand-600 text-white font-semibold py-2.5 disabled:opacity-50"
      >
        {busy ? "Sending…" : "Request this slot"}
      </button>
      <p className="text-xs text-slate-400">
        Your tutor approves it.{" "}
        {resource.capacity > 1
          ? `${resource.capacity} students can use it at the same time.`
          : "Only one student can use it at a time."}
      </p>
    </form>
  );
}
