"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  askForLoginCode,
  cancelLoginCode,
  cancelResourceRequest,
  getMyLoginCode,
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
} from "@/lib/constants";
import { Card, fmtWhen } from "./sections";

const STATUS_CHIP: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function hoursLabel(minutes: number): string {
  const h = minutes / 60;
  return h === 1 ? "1 hour" : `${Number.isInteger(h) ? h : h.toFixed(1)} hours`;
}

/** "4h 37m" / "9:58" — a plain countdown to `target`. */
function countdown(target: string, now: number): string {
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** A clock that ticks once a second, so countdowns stay honest. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function ToolsTab({ data }: { data: StudentResourceData }) {
  return (
    <>
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
          up to {hoursLabel(resource.max_minutes)}
        </span>
      </div>
      {resource.blurb && <p className="text-sm text-slate-600 mt-1">{resource.blurb}</p>}

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
          <p className="text-xs font-semibold text-slate-500 mb-1">Already booked</p>
          <ul className="text-xs text-slate-500 space-y-0.5">
            {busy.slice(0, 6).map((b) => (
              <li key={b.start_at}>
                {fmtWhen(b.start_at)} {"→"} {fmtWhen(b.end_at)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
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
  now: number;
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
  now: number;
}) {
  const [code, setCode] = useState<LoginCodeRow | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const waiting = code !== null && code.code === null;
  const ready = code?.code != null;
  const endingSoon = new Date(request.end_at).getTime() - now < 10 * 60_000;

  const poll = useCallback(async () => {
    try {
      setCode(await getMyLoginCode(request.id));
    } catch {
      /* a failed poll is not worth surfacing; the next one will tell us */
    }
  }, [request.id]);

  // Only poll while something is actually outstanding, and stop the moment the
  // code lands. No background chatter once the student is signed in.
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(poll, LOGIN_CODE_POLL_MS);
    return () => clearInterval(id);
  }, [waiting, poll]);

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
      setError("Copy nahi hua — haath se likh lein.");
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
          Slot khatam hone wala hai — apna kaam save karein aur log out kar dein.
        </p>
      )}

      {ready && code ? (
        <div className="mt-3">
          <p className="text-xs text-emerald-900 mb-1">
            Ye code us claude.ai screen par lagayein jo pehle se khuli hai:
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
            Jaldi lagayein — {code.expires_at ? countdown(code.expires_at, now) : "thori der"} baqi.
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
          <p className="text-sm font-semibold text-slate-700">Tutor ko bata diya</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Code aa raha hai — ye page khula rakhein.
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
          <ol className="text-sm text-emerald-900 space-y-1.5">
            <li>
              <b>1.</b> claude.ai/login kholein
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span>
                <b>2.</b> Ye email daalein:
              </span>
              <code className="rounded-lg bg-white px-2 py-1 text-xs">{CLAUDE_LOGIN_EMAIL}</code>
              <button
                onClick={() => copy(CLAUDE_LOGIN_EMAIL, "email")}
                className="text-xs rounded-lg border border-emerald-300 px-2 py-1"
              >
                {copied === "email" ? "Copied" : "Copy"}
              </button>
            </li>
            <li>
              <b>3.</b> &quot;enter code&quot; screen aayega —{" "}
              <b className="text-rose-700">usi screen par rukein</b>, band na karein.
            </li>
          </ol>

          {/* Anthropic's sign-in link dies 10 minutes after it is sent, so a
              student who asks first and fumbles step 1 burns the code. */}
          <label className="flex items-start gap-2 mt-3 text-sm text-emerald-900">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span>Main &quot;enter code&quot; screen par hoon</span>
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

  const durations = RESOURCE_DURATIONS.filter((m) => m <= resource.max_minutes);

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
          Aap ise kis kaam ke liye use karenge?
        </span>
        <textarea
          name="reason"
          rows={2}
          required
          placeholder="e.g. Project B ka RAG chatbot banana hai"
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
          <span className="block text-xs font-medium text-slate-500 mb-1">Kitni der</span>
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
        {busy ? "Bhej rahe hain…" : "Request this slot"}
      </button>
      <p className="text-xs text-slate-400">
        Tutor approve karega. Ek waqt mein sirf ek student ko milta hai.
      </p>
    </form>
  );
}
