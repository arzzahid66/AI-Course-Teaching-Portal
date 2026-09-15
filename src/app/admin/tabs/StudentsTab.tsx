"use client";

import { useEffect, useRef, useState } from "react";
import {
  addStudent,
  bulkAddStudents,
  deleteStudent,
  enrollStudent,
  getStudentDetail,
  moveEnrollment,
  setEnrollmentStatus,
  setStudentCredentials,
  setStudentStatus,
  updateStudent,
  type StudentDetail,
  type StudentRow,
} from "@/actions/admin";
import type { BatchRow } from "@/lib/course";
import {
  BandBadge,
  Card,
  EmptyRow,
  FeeBadge,
  Modal,
  Msg,
  btn,
  fieldClass,
  fmt,
  fmtDay,
  rs,
  useAction,
} from "../ui";

type Filter = "intake" | "all" | "none";

export default function StudentsTab({
  students,
  batches,
  batch,
}: {
  students: StudentRow[];
  batches: BatchRow[];
  batch: BatchRow | null;
}) {
  const add = useAction();
  const bulk = useAction();
  const toggle = useAction();
  const [filter, setFilter] = useState<Filter>(batch ? "intake" : "all");
  const [query, setQuery] = useState("");
  const [payNow, setPayNow] = useState("none");
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const addRef = useRef<HTMLFormElement>(null);
  const bulkRef = useRef<HTMLFormElement>(null);

  const inIntake = (s: StudentRow) =>
    !!batch && s.enrollments.some((e) => e.batch_id === batch.id && e.status !== "dropped");
  const q = query.trim().toLowerCase();
  const shown = students
    .filter((s) =>
      filter === "intake" ? inIntake(s) : filter === "none" ? !s.enrollments.some((e) => e.status === "active") : true
    )
    .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.email ?? "").includes(q));

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">Add student</h2>
        <p className="text-slate-500 text-sm mb-3">
          The student is enrolled in the selected intake and gets their monthly fee months straight away.
        </p>
        <form
          ref={addRef}
          action={(fd) =>
            add.run(() => addStudent(fd), {
              success: (res) =>
                res && "receiptNo" in res && res.receiptNo
                  ? `Student added. Payment recorded — receipt ${res.receiptNo}.`
                  : "Student added.",
              onDone: () => {
                addRef.current?.reset();
                setPayNow("none");
              },
            })
          }
          className="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          <input name="name" placeholder="Full name" className={fieldClass()} />
          <input name="whatsapp" placeholder="WhatsApp (03xx…)" className={fieldClass()} />
          <select name="gender" className={fieldClass()} defaultValue="">
            <option value="" disabled>
              Gender
            </option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
          <select name="batch_id" className={fieldClass()} defaultValue={batch?.id ?? ""}>
            <option value="" disabled>
              Intake
            </option>
            {batches
              .filter((b) => b.status !== "completed")
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
          <input name="email" type="email" placeholder="Login email" className={fieldClass()} />
          <input name="password" type="text" placeholder="Login password" className={fieldClass()} />
          <select
            name="pay_now"
            value={payNow}
            onChange={(e) => setPayNow(e.target.value)}
            className={fieldClass()}
          >
            <option value="none">No payment yet</option>
            <option value="month1">Paid Month 1 now</option>
            <option value="full">Paid full batch now</option>
          </select>
          {payNow !== "none" ? (
            <div className="grid grid-cols-2 gap-2">
              <select name="method" className={fieldClass()} defaultValue="EasyPaisa">
                <option>EasyPaisa</option>
                <option>JazzCash</option>
                <option>Bank</option>
                <option>Cash</option>
              </select>
              <input name="reference" placeholder="Transaction ID" className={fieldClass()} />
            </div>
          ) : (
            <div />
          )}
          <button type="submit" disabled={add.pending} className={`sm:col-span-2 ${btn.primary}`}>
            Add student
          </button>
        </form>
        <Msg error={add.error} ok={add.ok} />
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Bulk add to {batch?.name ?? "an intake"}</h2>
        <p className="text-slate-500 text-sm mb-2">
          One per line: <code>name, whatsapp, gender, email, password, paid</code>. Only name is
          required. <code>paid</code> is <code>full</code> or an amount like <code>2000</code>.
        </p>
        <form
          ref={bulkRef}
          action={(fd) => {
            if (batch) fd.set("batch_id", String(batch.id));
            bulk.run(() => bulkAddStudents(fd), {
              success: (res) =>
                res
                  ? `Created ${res.created} student(s).` +
                    (res.skipped.length ? ` Skipped (email already used?): ${res.skipped.join(", ")}` : "")
                  : "",
              onDone: () => bulkRef.current?.reset(),
            });
          }}
        >
          <textarea
            name="bulk"
            rows={4}
            placeholder={"Ayesha Khan, 03001234567, female, ayesha@mail.com, pass123, full\nBilal Ahmed, 03009876543, male, bilal@mail.com, pass456, 2000"}
            className={`${fieldClass()} font-mono text-sm`}
          />
          <button type="submit" disabled={bulk.pending || !batch} className={`mt-2 ${btn.dark}`}>
            Create all
          </button>
        </form>
        <Msg error={bulk.error} ok={bulk.ok} />
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">
            Students <span className="text-slate-400 font-normal">({shown.length})</span>
          </h2>
          <div className="flex gap-1.5">
            {(
              [
                ["intake", batch ? "This intake" : "Intake"],
                ["all", "Everyone"],
                ["none", "Not enrolled"],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                disabled={key === "intake" && !batch}
                className={`text-xs rounded-full px-3 py-1.5 font-medium border ${
                  filter === key ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email…"
          className={`${fieldClass()} mb-3`}
        />
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 px-2">Name</th>
                <th className="py-2 px-2">Intake</th>
                <th className="py-2 px-2">Login</th>
                <th className="py-2 px-2">Account</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const current = s.enrollments.find((e) => e.status === "active");
                return (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">{s.name}</td>
                    <td className="py-2 px-2 text-slate-600 text-xs">
                      {current?.batch_name ?? <span className="text-amber-600">not enrolled</span>}
                    </td>
                    <td className="py-2 px-2 text-xs text-slate-600">
                      {s.has_login ? s.email : <span className="text-amber-600">no login</span>}
                    </td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() =>
                          toggle.run(() => setStudentStatus(s.id, s.status === "active" ? "inactive" : "active"))
                        }
                        className={`text-xs rounded-full px-2 py-0.5 ${
                          s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                        }`}
                        title="Inactive students can't log in"
                      >
                        {s.status}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-right">
                      <button onClick={() => setSelected(s)} className={btn.small}>
                        View / Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <EmptyRow colSpan={5}>No students here yet.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && (
        <StudentDetailModal student={selected} batches={batches} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function StudentDetailModal({
  student,
  batches,
  onClose,
}: {
  student: StudentRow;
  batches: BatchRow[];
  onClose: () => void;
}) {
  const [data, setData] = useState<StudentDetail | null>(null);
  const [showPw, setShowPw] = useState(false);
  const edit = useAction();
  const creds = useAction();
  const enroll = useAction();
  const danger = useAction();

  async function load() {
    setData(await getStudentDetail(student.id));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student.id]);

  const reload = { onDone: () => void load() };
  const enrolledIds = new Set(data?.enrollments.map((e) => e.batch_id) ?? []);

  return (
    <Modal title={student.name} onClose={onClose} wide>
      <details className="rounded-xl border border-slate-200 p-3 mb-3">
        <summary className="font-semibold text-sm cursor-pointer">Details &amp; login</summary>
        <form
          action={(fd) => edit.run(() => updateStudent(student.id, fd), { success: "Saved." })}
          className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3"
        >
          <input name="name" defaultValue={student.name} className={fieldClass()} />
          <input name="whatsapp" defaultValue={student.whatsapp ?? ""} placeholder="WhatsApp" className={fieldClass()} />
          <select name="gender" defaultValue={student.gender ?? ""} className={fieldClass()}>
            <option value="">Gender</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" disabled={edit.pending} className={`sm:col-span-3 ${btn.dark}`}>
            Save details
          </button>
        </form>
        <Msg error={edit.error} ok={edit.ok} />

        <p className="text-sm text-slate-600 mt-3">
          Login: {data?.email ?? student.email ?? "none"}
          {data?.password && (
            <>
              {" · "}
              <button onClick={() => setShowPw((v) => !v)} className="text-brand-700 underline">
                {showPw ? data.password : "show password"}
              </button>
            </>
          )}
        </p>
        <form
          action={(fd) =>
            creds.run(
              () =>
                setStudentCredentials(student.id, String(fd.get("email") ?? ""), String(fd.get("password") ?? "")),
              { success: "Login saved.", ...reload }
            )
          }
          className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2"
        >
          <input name="email" type="email" defaultValue={student.email ?? ""} placeholder="Email" className={fieldClass()} />
          <input name="password" placeholder="New password" className={fieldClass()} />
          <button type="submit" disabled={creds.pending} className={btn.dark}>
            Set login
          </button>
        </form>
        <Msg error={creds.error} ok={creds.ok} />
      </details>

      {!data ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <>
          {data.enrollments.map((e) => (
            <section key={e.enrollment_id} className="rounded-xl border border-slate-200 p-3 mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="font-semibold">
                  {e.batch_name}{" "}
                  <span className="text-xs font-normal text-slate-500">({e.status})</span>
                </h3>
                {e.progress && (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-bold tabular-nums">{e.progress.score ?? "—"}/100</span>
                    <BandBadge band={e.progress.band} />
                  </span>
                )}
              </div>

              {e.progress && (
                <p className="text-xs text-slate-500 mb-2">
                  Attendance {e.progress.attendance.present}/{e.progress.attendance.held}
                  {e.progress.attendance.excused > 0 && ` (+${e.progress.attendance.excused} excused)`} ·{" "}
                  {e.progress.attendance.absent} absent · Homework {e.progress.homework.pct ?? "—"}% · Quiz{" "}
                  {e.progress.quiz.pct ?? "—"}% · Videos {e.progress.videos.watched}/{e.progress.videos.released}
                </p>
              )}

              <table className="w-full text-sm mb-2">
                <tbody>
                  {e.invoices.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="py-1.5">Month {i.month_no}</td>
                      <td className="py-1.5 text-slate-500">due {fmtDay(i.due_date)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {rs(i.paid)} / {rs(i.amount - i.discount)}
                      </td>
                      <td className="py-1.5 text-right">
                        <FeeBadge status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {e.payments.length > 0 && (
                <ul className="text-xs text-slate-500 space-y-0.5 mb-2">
                  {e.payments.map((p) => (
                    <li key={p.id}>
                      {p.receipt_no} · Month {p.month_no} · {rs(p.amount)} · {p.method}
                      {p.reference ? ` · ${p.reference}` : ""} · {fmt(p.paid_at)}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap gap-2 items-center">
                {e.status !== "completed" && (
                  <button
                    onClick={() => enroll.run(() => setEnrollmentStatus(e.enrollment_id, "completed"), reload)}
                    className={btn.small}
                  >
                    Mark completed
                  </button>
                )}
                {e.status !== "active" && (
                  <button
                    onClick={() => enroll.run(() => setEnrollmentStatus(e.enrollment_id, "active"), reload)}
                    className={btn.small}
                  >
                    Make active
                  </button>
                )}
                {e.status === "active" && (
                  <select
                    defaultValue=""
                    onChange={(ev) => {
                      const to = Number(ev.target.value);
                      if (!to) return;
                      const name = batches.find((b) => b.id === to)?.name;
                      if (!confirm(`Move ${student.name} to ${name}? New fee months are created there.`)) {
                        ev.target.value = "";
                        return;
                      }
                      enroll.run(() => moveEnrollment(e.enrollment_id, to), reload);
                    }}
                    className="text-xs rounded-lg border border-slate-200 px-2 py-1"
                  >
                    <option value="">Move to intake…</option>
                    {batches
                      .filter((b) => b.id !== e.batch_id && b.status !== "completed")
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </section>
          ))}

          <div className="flex flex-wrap gap-2 items-center mb-3">
            <select id="enroll-into" defaultValue="" className="text-sm rounded-lg border border-slate-200 px-2 py-1.5">
              <option value="">Enroll in another intake…</option>
              {batches
                .filter((b) => !enrolledIds.has(b.id) && b.status !== "completed")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
            <button
              onClick={() => {
                const el = document.getElementById("enroll-into") as HTMLSelectElement | null;
                const to = Number(el?.value);
                if (to) enroll.run(() => enrollStudent(student.id, to), reload);
              }}
              className={btn.small}
            >
              Enroll
            </button>
          </div>
          <Msg error={enroll.error} />

          <h3 className="font-semibold text-sm mb-1">Attendance</h3>
          {data.attendance.length === 0 ? (
            <p className="text-slate-400 text-sm mb-3">No classes yet.</p>
          ) : (
            <ul className="text-sm divide-y mb-3">
              {data.attendance.map((a, idx) => (
                <li key={idx} className="flex justify-between py-1">
                  <span className="truncate">{a.title}</span>
                  <span
                    className={
                      a.status === "present"
                        ? "text-emerald-600"
                        : a.status === "excused"
                          ? "text-violet-600"
                          : "text-rose-600"
                    }
                  >
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="font-semibold text-sm mb-1">Homework</h3>
          {data.homework.length === 0 ? (
            <p className="text-slate-400 text-sm mb-3">Nothing submitted yet.</p>
          ) : (
            <ul className="text-sm divide-y mb-3">
              {data.homework.map((h, idx) => (
                <li key={idx} className="flex justify-between gap-2 py-1">
                  <a href={h.link_url} target="_blank" rel="noreferrer" className="truncate text-brand-700 underline">
                    W{h.weekend_no} — {h.title}
                  </a>
                  <span className="text-slate-500 shrink-0">
                    {h.marks != null ? `${h.marks}/10` : h.status.replace("_", " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button
        onClick={() => {
          if (!confirm(`Delete ${student.name} permanently, with all fees, payments and attendance? This cannot be undone.`))
            return;
          danger.run(() => deleteStudent(student.id), { onDone: onClose });
        }}
        disabled={danger.pending}
        className="text-sm text-rose-600 underline"
      >
        Delete student
      </button>
      <Msg error={danger.error} />
    </Modal>
  );
}
