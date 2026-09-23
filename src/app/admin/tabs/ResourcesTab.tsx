"use client";

import { useEffect, useState } from "react";
import {
  deleteResource,
  deleteResourceRequest,
  dismissLoginCode,
  reviewResourceRequest,
  saveResource,
  saveToolsHelpVideo,
  sendLoginCode,
} from "@/actions/resources";
import type {
  RequestRow,
  ResourceBoard,
  ResourceRow,
  ToolsHelpVideo,
} from "@/lib/resources";
import {
  RESOURCE_DEFAULT_AHEAD_DAYS,
  RESOURCE_DEFAULT_COOLDOWN_H,
  RESOURCE_DEFAULT_CAPACITY,
  RESOURCE_DEFAULT_MAX_MIN,
  normalizeUrl,
  youtubeThumbUrl,
} from "@/lib/constants";
import {
  Card,
  EmailStudentButton,
  Modal,
  Msg,
  btn,
  fieldClass,
  fmt,
  useAction,
} from "../ui";

const STATUS_META: Record<RequestRow["status"], { label: string; chip: string }> = {
  pending: { label: "pending", chip: "bg-amber-100 text-amber-700" },
  approved: { label: "approved", chip: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "rejected", chip: "bg-rose-100 text-rose-700" },
  cancelled: { label: "cancelled", chip: "bg-slate-100 text-slate-500" },
};

function hours(minutes: number): string {
  if (minutes <= 0) return "no limit";
  const h = minutes / 60;
  return h === 1 ? "1 hour" : `${Number.isInteger(h) ? h : h.toFixed(1)} hours`;
}

/** "2:00 pm → 7:00 pm" for a booking window. */
function windowLabel(startAt: string, endAt: string): string {
  return `${fmt(startAt)} → ${fmt(endAt)}`;
}

/**
 * This tab is a CONTROLLED view of the board: the state and the polling both
 * live in AdminDashboard. Keeping them there is what lets the Tools badge
 * update while the tutor is sitting on a different tab - polling from in here
 * only ever ran while this tab was already open, which is exactly when the
 * tutor least needs to be told.
 */
export default function ResourcesTab({
  board,
  onRefresh,
  syncedAt,
  pollMs,
}: {
  board: ResourceBoard;
  onRefresh: () => Promise<void>;
  /** When the board was last re-fetched; null until the first poll lands. */
  syncedAt: number | null;
  /** Current auto-refresh interval, shown so the tutor knows it is live. */
  pollMs: number;
}) {
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [adding, setAdding] = useState(false);

  const pending = board.requests.filter((r) => r.status === "pending");
  const decided = board.requests.filter((r) => r.status !== "pending");
  const running = board.requests.filter((r) => r.status === "approved" && r.slot === "active");
  const next = board.requests
    .filter((r) => r.status === "approved" && r.slot === "upcoming")
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  return (
    <>
      <SyncBar onRefresh={onRefresh} syncedAt={syncedAt} pollMs={pollMs} />

      <HelpVideoCard video={board.helpVideo} />

      {/* The most time-sensitive thing on the page: a student is sitting on the
          claude.ai code screen right now, waiting. It goes above everything. */}
      {board.codeRequests.length > 0 && (
        <Card className="ring-2 ring-amber-300 bg-amber-50/60">
          <h2 className="font-bold text-amber-900 mb-1">
            {"\u{1F511}"} Sign-in code needed ({board.codeRequests.length})
          </h2>
          <p className="text-sm text-amber-800 mb-3">
            Open Gmail {"→"} click <b>Sign in</b> in the Anthropic email {"→"} paste the
            code claude.ai shows you here.
          </p>
          <ul className="divide-y divide-amber-200">
            {board.codeRequests.map((c) => (
              <CodeRequestItem key={c.id} req={c} />
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-bold mb-2">Right now</h2>
        {running.length === 0 && next.length === 0 ? (
          <p className="text-slate-400 text-sm">Nobody has a tool booked.</p>
        ) : (
          <ul className="text-sm divide-y">
            {running.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap justify-between gap-2">
                <span>
                  <b>{r.resource_name}</b> {"—"} {r.student_name}
                </span>
                <span className="text-emerald-700 font-semibold">
                  running until {fmt(r.end_at)}
                </span>
              </li>
            ))}
            {next.slice(0, 5).map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap justify-between gap-2 text-slate-600">
                <span>
                  {r.resource_name} {"—"} {r.student_name}
                </span>
                <span>{windowLabel(r.start_at, r.end_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="font-bold mb-3">
          {"\u{1F553}"} Waiting for a decision ({pending.length})
        </h2>
        <ul className="divide-y">
          {pending.map((r) => (
            <RequestItem key={r.id} req={r} />
          ))}
          {pending.length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">
              Nothing waiting {"—"} you&apos;re all caught up. {"\u{1F389}"}
            </li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-3">{"✅"} Reviewed ({decided.length})</h2>
        <ul className="divide-y">
          {decided.map((r) => (
            <RequestItem key={r.id} req={r} />
          ))}
          {decided.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">Nothing reviewed yet.</li>
          )}
        </ul>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Tools</h2>
          <button onClick={() => setAdding(true)} className={btn.small}>
            Add tool
          </button>
        </div>
        <ul className="divide-y">
          {board.resources.map((r) => (
            <li key={r.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">
                  {r.name}
                  {!r.is_active && (
                    <span className="ml-2 text-xs rounded-full bg-slate-100 text-slate-500 px-2 py-0.5">
                      off
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {r.capacity} at a time {"·"} max {hours(r.max_minutes)} {"·"} {r.cooldown_hours}h cooldown {"·"}{" "}
                  {r.book_ahead_days}d ahead
                </p>
                {r.help_video_url && (
                  <p className="text-xs text-slate-400 mt-0.5">
                    {"\u{1F3AC}"} help video added
                  </p>
                )}
              </div>
              <button onClick={() => setEditing(r)} className={btn.small}>
                Edit
              </button>
            </li>
          ))}
          {board.resources.length === 0 && (
            <li className="py-4 text-center text-slate-400 text-sm">
              No tools yet. Add the Claude Code plan and your OpenAI key.
            </li>
          )}
        </ul>
      </Card>

      {(editing || adding) && (
        <ResourceModal
          resource={editing}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The one walkthrough video students see
// ---------------------------------------------------------------------------

/**
 * Sits in plain sight near the top of the Tools tab, not inside a modal.
 *
 * The first version of this was a field inside each tool's Edit dialog, and
 * the tutor could not find it - reasonably, since it is a setting for the
 * whole section rather than a property of one tool. One video covers the whole
 * flow anyway: book a slot, ask for the sign-in code, hand the tool back.
 */
function HelpVideoCard({ video }: { video: ToolsHelpVideo | null }) {
  const save = useAction();
  const thumb = video ? youtubeThumbUrl(video.url) : null;
  const labelClass = "block text-xs font-medium text-slate-500 mb-1";

  return (
    <Card>
      <h2 className="font-bold mb-1">{"\u{1F3AC}"} Student help video</h2>
      <p className="text-sm text-slate-500 mb-3">
        Shown at the top of every student&apos;s Tools tab, so someone who has never
        done this can watch before booking. Leave the link empty to remove it.
      </p>

      {video && (
        <div className="flex items-center gap-3 mb-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-2">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb}
              alt=""
              className="h-14 w-24 shrink-0 rounded-lg object-cover bg-slate-200"
            />
          ) : (
            <span className="grid h-14 w-24 shrink-0 place-items-center rounded-lg bg-slate-200 text-slate-500 text-xs">
              link
            </span>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{video.title}</p>
            <a
              href={normalizeUrl(video.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 underline break-all"
            >
              {video.url}
            </a>
          </div>
        </div>
      )}

      <form
        action={(fd) => save.run(() => saveToolsHelpVideo(fd), { success: "Saved." })}
        className="space-y-2"
      >
        <label className="block">
          <span className={labelClass}>YouTube link</span>
          <input
            name="url"
            type="text"
            inputMode="url"
            defaultValue={video?.url ?? ""}
            placeholder="https://www.youtube.com/watch?v=..."
            className={fieldClass()}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Title students see</span>
          <input
            name="title"
            defaultValue={video?.title ?? ""}
            placeholder="How to get Free Tools Access in ClassGate portal"
            className={fieldClass()}
          />
        </label>
        <Msg error={save.error} ok={save.ok} />
        <button disabled={save.pending} className={btn.primary}>
          {save.pending ? "Saving\u2026" : "Save video"}
        </button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Live-ness strip
// ---------------------------------------------------------------------------

/** "12s" / "3m" / "1h" - how long ago the board was last checked. */
function agoLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h`;
}

/**
 * Auto-refresh is invisible by nature, so this toolbar says it out loud: how
 * often the board re-checks itself, how long ago it last did, and a button to
 * do it right now.
 *
 * It is a solid, full-size button on a tinted bar on purpose. The first
 * version was a small outline button inside a thin grey line of text and the
 * tutor did not see it at all - they kept reaching for F5, which is the exact
 * thing this is here to replace.
 */
function SyncBar({
  onRefresh,
  syncedAt,
  pollMs,
}: {
  onRefresh: () => Promise<void>;
  syncedAt: number | null;
  pollMs: number;
}) {
  const [busy, setBusy] = useState(false);

  // Same hydration rule as everywhere else here: no clock before mount.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ago =
    syncedAt === null || nowMs === null
      ? null
      : Math.max(0, Math.round((nowMs - syncedAt) / 1000));

  async function manual() {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200 px-4 py-2.5">
      <span className="text-xs text-slate-500">
        <span className="text-emerald-500">{"●"}</span> Updates on its own every{" "}
        {Math.round(pollMs / 1000)}s
        {ago !== null && ` · checked ${ago < 5 ? "just now" : agoLabel(ago) + " ago"}`}
      </span>
      <button
        onClick={manual}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white active:scale-[0.97] transition disabled:opacity-60"
      >
        <span className={`inline-block ${busy ? "animate-spin" : ""}`}>{"↻"}</span>
        {busy ? "Refreshing…" : "Refresh now"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One student waiting for a sign-in code
// ---------------------------------------------------------------------------
function CodeRequestItem({ req }: { req: ResourceBoard["codeRequests"][number] }) {
  const send = useAction();
  const drop = useAction();
  const [code, setCode] = useState("");

  // Same hydration trap as the portal countdown: read the clock after mount,
  // and re-read it as the board polls so "waiting 26s" keeps climbing.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const waitingSec =
    nowMs === null ? null : Math.max(0, Math.round((nowMs - new Date(req.asked_at).getTime()) / 1000));

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="font-semibold">
          {req.student_name}{" "}
          <span className="font-normal text-slate-500">{"·"} {req.resource_name}</span>
        </p>
        <span className="text-xs text-amber-700">
          {waitingSec === null
            ? "waiting…"
            : `waiting ${waitingSec < 90 ? `${waitingSec}s` : `${Math.round(waitingSec / 60)} min`}`}
        </span>
      </div>
      <p className="text-xs text-slate-500 mb-2">
        Slot: {windowLabel(req.start_at, req.end_at)}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData();
          fd.set("code", code);
          send.run(() => sendLoginCode(req.id, fd), { onDone: () => setCode("") });
        }}
        className="flex flex-wrap gap-2"
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Paste the code claude.ai showed you"
          autoFocus
          className={`${fieldClass()} flex-1 min-w-[12rem] tabular-nums`}
        />
        <button type="submit" disabled={send.pending || !code.trim()} className={btn.primary}>
          {send.pending ? "Sending…" : "Send"}
        </button>
        <button
          type="button"
          disabled={drop.pending}
          onClick={() => {
            if (!confirm(`Dismiss ${req.student_name}'s code request?`)) return;
            drop.run(() => dismissLoginCode(req.id));
          }}
          className={btn.smallDanger}
        >
          Dismiss
        </button>
      </form>
      <Msg error={send.error || drop.error} ok={send.ok} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// One booking request
// ---------------------------------------------------------------------------
function RequestItem({ req }: { req: RequestRow }) {
  const review = useAction();
  const remove = useAction();
  const [feedback, setFeedback] = useState(req.feedback ?? "");
  const isReviewed = req.status !== "pending";
  const [editing, setEditing] = useState(false);

  const meta = STATUS_META[req.status];

  function decide(status: "approved" | "rejected" | "pending") {
    const fd = new FormData();
    fd.set("status", status);
    fd.set("feedback", feedback);
    review.run(() => reviewResourceRequest(req.id, fd), { onDone: () => setEditing(false) });
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">
            {req.student_name}{" "}
            <span className="font-normal text-slate-500">{"·"} {req.resource_name}</span>
          </p>
          <p className="text-xs text-slate-500">{req.student_email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${meta.chip}`}>
            {meta.label}
          </span>
          <EmailStudentButton
            studentId={req.student_id}
            name={req.student_name}
            defaultSubject={`${req.resource_name} booking`}
          />
        </div>
      </div>

      <p className="text-sm mt-2">
        <b>{windowLabel(req.start_at, req.end_at)}</b>
        {req.status === "approved" && req.slot === "active" && (
          <span className="ml-2 text-emerald-700 font-semibold">running now</span>
        )}
      </p>
      <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{req.reason}</p>

      {isReviewed && !editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {req.feedback && (
            <p className="text-xs text-slate-500 flex-1">
              Your note: <span className="text-slate-700">{req.feedback}</span>
            </p>
          )}
          <button onClick={() => setEditing(true)} className="text-xs text-brand-700 underline">
            Edit decision
          </button>
          <button
            disabled={remove.pending}
            onClick={() => {
              if (!confirm(`Delete ${req.student_name}'s ${req.resource_name} booking?`)) return;
              remove.run(() => deleteResourceRequest(req.id));
            }}
            className="text-xs text-rose-700 underline"
          >
            Delete
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="Note for the student (optional)"
            className={fieldClass()}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              disabled={review.pending}
              onClick={() => decide("approved")}
              className={btn.green}
            >
              Approve
            </button>
            <button
              disabled={review.pending}
              onClick={() => decide("rejected")}
              className={btn.dark}
            >
              Reject
            </button>
            {isReviewed && (
              <button
                disabled={review.pending}
                onClick={() => decide("pending")}
                className={btn.small}
              >
                Re-open
              </button>
            )}
          </div>
        </div>
      )}
      <Msg error={review.error || remove.error} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Add / edit a tool
// ---------------------------------------------------------------------------
function ResourceModal({
  resource,
  onClose,
}: {
  resource: ResourceRow | null;
  onClose: () => void;
}) {
  const save = useAction();
  const remove = useAction();
  const label = "block text-xs font-medium text-slate-500 mb-1";

  return (
    <Modal title={resource ? `Edit ${resource.name}` : "Add tool"} onClose={onClose}>
      <form
        action={(fd) => save.run(() => saveResource(resource?.id ?? null, fd), { onDone: onClose })}
        className="space-y-3"
      >
        <label className="block">
          <span className={label}>Name</span>
          <input name="name" defaultValue={resource?.name ?? ""} required className={fieldClass()} />
        </label>

        <label className="block">
          <span className={label}>What students see</span>
          <textarea
            name="blurb"
            rows={2}
            defaultValue={resource?.blurb ?? ""}
            className={fieldClass()}
          />
        </label>

        <label className="block">
          <span className={label}>How they will get access</span>
          <textarea
            name="handover_note"
            rows={2}
            defaultValue={resource?.handover_note ?? ""}
            placeholder="e.g. Ask for the sign-in code from the portal during your slot."
            className={fieldClass()}
          />
        </label>

        {/* type is text, not url: tutors paste "youtu.be/xyz" with no scheme
            and the browser would block the form before the server could
            normalise it. */}
        <label className="block">
          <span className={label}>Help video (optional)</span>
          <input
            name="help_video_url"
            type="text"
            inputMode="url"
            defaultValue={resource?.help_video_url ?? ""}
            placeholder="https://youtu.be/..."
            className={fieldClass()}
          />
          <span className="block text-xs text-slate-400 mt-1">
            Students get a player on the tool card - show them how to get and use it.
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={label}>Max minutes</span>
            <input
              name="max_minutes"
              type="number"
              min={0}
              defaultValue={resource?.max_minutes ?? RESOURCE_DEFAULT_MAX_MIN}
              title="0 means no limit"
              className={fieldClass()}
            />
          </label>
          <label className="block">
            <span className={label}>At a time</span>
            <input
              name="capacity"
              type="number"
              min={1}
              defaultValue={resource?.capacity ?? RESOURCE_DEFAULT_CAPACITY}
              title="How many students may hold this tool at once"
              className={fieldClass()}
            />
          </label>
          <label className="block">
            <span className={label}>Cooldown (h)</span>
            <input
              name="cooldown_hours"
              type="number"
              min={0}
              defaultValue={resource?.cooldown_hours ?? RESOURCE_DEFAULT_COOLDOWN_H}
              className={fieldClass()}
            />
          </label>
          <label className="block">
            <span className={label}>Book ahead (d)</span>
            <input
              name="book_ahead_days"
              type="number"
              min={1}
              defaultValue={resource?.book_ahead_days ?? RESOURCE_DEFAULT_AHEAD_DAYS}
              className={fieldClass()}
            />
          </label>
        </div>
        <p className="text-xs text-slate-400">
          Max minutes 0 = no limit. {'"'}At a time{'"'} is how many students can hold
          this tool together.
        </p>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              name="is_active"
              type="checkbox"
              defaultChecked={resource?.is_active ?? true}
              className="h-4 w-4"
            />
            Students can book it
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Order</span>
            <input
              name="sort_order"
              type="number"
              defaultValue={resource?.sort_order ?? 0}
              className="w-16 rounded-lg border border-slate-300 px-2 py-1"
            />
          </label>
        </div>

        <Msg error={save.error || remove.error} />

        <div className="flex justify-between gap-2 pt-1">
          {resource ? (
            <button
              type="button"
              disabled={remove.pending}
              onClick={() => {
                if (!confirm(`Delete ${resource.name}? Its bookings go too.`)) return;
                remove.run(() => deleteResource(resource.id), { onDone: onClose });
              }}
              className={btn.smallDanger}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <button type="submit" disabled={save.pending} className={btn.primary}>
            {save.pending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
