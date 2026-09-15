"use client";

import { useEffect, useRef, useState } from "react";
import {
  closeSession,
  createSession,
  deleteSession,
  getSessionAttendees,
  openSession,
  scheduleSession,
  setAttendance,
  updateSession,
  type AttendeeRow,
  type SessionRow,
} from "@/actions/admin";
import type { BatchRow } from "@/lib/course";
import { Card, Modal, Msg, btn, fieldClass, fmt, localToIso, toDatetimeLocal, useAction } from "../ui";

export default function ClassesTab({
  batch,
  openSession: live,
  attendees,
  sessions,
}: {
  batch: BatchRow;
  openSession: SessionRow | null;
  attendees: AttendeeRow[];
  sessions: SessionRow[];
}) {
  const act = useAction();
  const extra = useAction();
  const [editing, setEditing] = useState<SessionRow | null>(null);
  const [viewing, setViewing] = useState<SessionRow | null>(null);
  const [copied, setCopied] = useState(false);
  const extraRef = useRef<HTMLFormElement>(null);

  const liveHere = live && live.batch_id === batch.id ? live : null;
  const allowed = attendees.filter((a) => a.status === "present");
  const waiting = attendees.filter((a) => a.status !== "present");

  async function copyAllowed() {
    const emails = allowed.map((a) => a.email).filter(Boolean).join(", ");
    try {
      await navigator.clipboard.writeText(emails);
    } catch {
      window.prompt("Allowed emails:", emails);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      {live && !liveHere && (
        <Card className="bg-amber-50 ring-amber-200">
          <p className="text-sm text-amber-800">
            A class from <b>{live.batch_name}</b> is live right now ({live.title}). Switch intake to manage it.
          </p>
        </Card>
      )}

      <Card>
        <h2 className="font-bold mb-1">Live class</h2>
        {!liveHere ? (
          <p className="text-slate-500 text-sm">
            No class is open. Press <b>Start</b> on a class below at class time.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div>
                <p className="font-semibold">{liveHere.title}</p>
                <p className="text-slate-500 text-sm">
                  Code: <span className="font-mono">{liveHere.code}</span> · {fmt(liveHere.scheduled_at)}
                </p>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">open</span>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-sm text-emerald-800">Checked in — admit in Meet ({allowed.length})</h3>
                <button onClick={copyAllowed} disabled={allowed.length === 0} className={btn.small}>
                  {copied ? "Copied!" : "Copy emails"}
                </button>
              </div>
              {allowed.length === 0 ? (
                <p className="text-slate-400 text-sm">Nobody has checked in yet.</p>
              ) : (
                <ul className="divide-y divide-emerald-100 text-sm">
                  {allowed.map((a) => (
                    <li key={a.student_id} className="py-1.5">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-slate-500"> — {a.email ?? "no email"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-3 mb-4">
              <h3 className="font-semibold text-sm text-slate-600 mb-2">Not checked in ({waiting.length})</h3>
              {waiting.length === 0 ? (
                <p className="text-slate-400 text-sm">Everyone is in.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {waiting.map((a) => (
                    <li key={a.student_id} className="flex items-center justify-between py-1.5 gap-2">
                      <span>
                        {a.name}
                        {a.status === "excused" && <span className="text-violet-600 text-xs"> · on leave</span>}
                      </span>
                      <button
                        onClick={() => act.run(() => setAttendance(liveHere.id, a.student_id, "present"))}
                        className={btn.small}
                        title="Let a late student in"
                      >
                        Mark present
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={() => {
                if (!confirm("Close this class? Everyone who hasn't checked in is marked absent (no fine).")) return;
                act.run(() => closeSession(liveHere.id));
              }}
              disabled={act.pending}
              className={`w-full ${btn.dark}`}
            >
              Close class &amp; mark absentees
            </button>
          </>
        )}
        <Msg error={act.error} />
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Classes — {batch.name}</h2>
        <p className="text-slate-500 text-sm mb-3">
          Add each class&apos;s Meet link and spoken code with <b>Edit</b>, then press <b>Start</b> at class time.
        </p>
        <ul className="divide-y text-sm">
          {sessions.map((s) => {
            const upcoming = !s.is_open && !s.closed_at;
            const ready = s.meet_link && s.code;
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-slate-500 text-xs">
                    {fmt(s.scheduled_at)}
                    {s.closed_at && ` · ${s.present} present · ${s.absent} absent · ${s.excused} excused`}
                    {upcoming && !ready && <span className="text-amber-600"> · needs Meet link + code</span>}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {s.is_open && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-emerald-100 text-emerald-700">live</span>
                  )}
                  {upcoming && (
                    <button
                      onClick={() => {
                        if (!confirm(`Start "${s.title}" now? Students can check in for 30 minutes.`)) return;
                        act.run(() => openSession(s.id));
                      }}
                      disabled={act.pending}
                      className="text-xs rounded-lg bg-emerald-600 text-white px-2 py-1 disabled:opacity-50"
                    >
                      Start
                    </button>
                  )}
                  {s.closed_at && (
                    <button onClick={() => setViewing(s)} className={btn.small}>
                      Attendance
                    </button>
                  )}
                  <button onClick={() => setEditing(s)} className={btn.small}>
                    Edit
                  </button>
                </div>
              </li>
            );
          })}
          {sessions.length === 0 && <li className="py-6 text-center text-slate-400">No classes in this intake.</li>}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Extra class</h2>
        <p className="text-slate-500 text-sm mb-3">For a make-up or bonus class outside the weekly schedule.</p>
        <form ref={extraRef} className="space-y-2">
          <input name="title" placeholder="Title (e.g. Doubt session)" className={fieldClass()} />
          <input name="scheduled_at" type="datetime-local" className={fieldClass()} />
          <input name="meet_link" placeholder="https://meet.google.com/xxx-xxxx-xxx" className={fieldClass()} />
          <input name="code" placeholder="Spoken code word" className={fieldClass()} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={extra.pending}
              onClick={() => {
                const fd = new FormData(extraRef.current!);
                fd.set("batch_id", String(batch.id));
                localToIso(fd);
                extra.run(() => scheduleSession(fd), { onDone: () => extraRef.current?.reset() });
              }}
              className={btn.dark}
            >
              Schedule
            </button>
            <button
              type="button"
              disabled={extra.pending}
              onClick={() => {
                const fd = new FormData(extraRef.current!);
                fd.set("batch_id", String(batch.id));
                localToIso(fd);
                extra.run(() => createSession(fd), { onDone: () => extraRef.current?.reset() });
              }}
              className={btn.primary}
            >
              Start now
            </button>
          </div>
        </form>
        <Msg error={extra.error} />
      </Card>

      {editing && <EditClassModal session={editing} onClose={() => setEditing(null)} />}
      {viewing && <AttendanceModal session={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function EditClassModal({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  const save = useAction();
  const del = useAction();
  return (
    <Modal title="Edit class" onClose={onClose}>
      <form
        action={(fd) => {
          localToIso(fd);
          save.run(() => updateSession(session.id, fd), { onDone: onClose });
        }}
        className="space-y-2"
      >
        <input name="title" defaultValue={session.title} className={fieldClass()} />
        <input
          name="scheduled_at"
          type="datetime-local"
          defaultValue={toDatetimeLocal(session.scheduled_at)}
          className={fieldClass()}
        />
        <input
          name="meet_link"
          defaultValue={session.meet_link}
          placeholder="https://meet.google.com/xxx-xxxx-xxx"
          className={fieldClass()}
        />
        <input name="code" defaultValue={session.code} placeholder="Spoken code word" className={fieldClass()} />
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save
        </button>
      </form>
      <Msg error={save.error} />
      <button
        onClick={() => {
          if (!confirm(`Delete "${session.title}" and its attendance? This cannot be undone.`)) return;
          del.run(() => deleteSession(session.id), { onDone: onClose });
        }}
        className="mt-4 text-sm text-rose-600 underline"
      >
        Delete class
      </button>
      <Msg error={del.error} />
    </Modal>
  );
}

function AttendanceModal({ session, onClose }: { session: SessionRow; onClose: () => void }) {
  const [rows, setRows] = useState<AttendeeRow[] | null>(null);
  const act = useAction();

  async function load() {
    setRows(await getSessionAttendees(session.id));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  return (
    <Modal title={session.title} onClose={onClose}>
      {!rows ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.student_id} className="flex items-center justify-between py-1.5 gap-2">
              <span>{r.name}</span>
              <select
                value={r.status ?? "none"}
                onChange={(e) =>
                  act.run(
                    () =>
                      setAttendance(session.id, r.student_id, e.target.value as "present" | "absent" | "excused" | "none"),
                    { onDone: () => void load() }
                  )
                }
                className="text-xs rounded-lg border border-slate-200 px-2 py-1"
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="excused">Excused</option>
                <option value="none">Not marked</option>
              </select>
            </li>
          ))}
          {rows.length === 0 && <li className="py-4 text-center text-slate-400">No students enrolled.</li>}
        </ul>
      )}
      <Msg error={act.error} />
    </Modal>
  );
}
