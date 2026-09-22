"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBatch, deleteBatch, updateBatch } from "@/actions/batches";
import type { BatchRow } from "@/lib/course";
import {
  DEFAULT_CLASS_TIME,
  DEFAULT_GRACE_DAYS,
  DEFAULT_MONTHLY_FEE,
  DEFAULT_MONTHS,
  DEFAULT_WEEKENDS,
} from "@/lib/constants";
import { Card, Modal, Msg, btn, fieldClass, fmtDay, useAction, useAmountInputType, useRs } from "../ui";

const STATUS_CLASS: Record<string, string> = {
  upcoming: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-slate-200 text-slate-600",
};

function BatchFields({ batch }: { batch?: BatchRow }) {
  const amountType = useAmountInputType();
  const label = "block text-xs font-medium text-slate-500 mb-1";
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="col-span-2">
        <span className={label}>Name</span>
        <input
          name="name"
          defaultValue={batch?.name}
          placeholder="Batch 1 — Sep 2026"
          className={fieldClass()}
        />
      </label>
      <label>
        <span className={label}>Level</span>
        <select name="level" defaultValue={batch?.level ?? 1} disabled={!!batch} className={fieldClass()}>
          <option value={1}>Batch 1 — Foundations</option>
          <option value={2}>Batch 2 — Production</option>
        </select>
      </label>
      <label>
        <span className={label}>Status</span>
        <select name="status" defaultValue={batch?.status ?? "upcoming"} className={fieldClass()}>
          <option value="upcoming">Upcoming</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </label>
      <label>
        <span className={label}>First class (date)</span>
        <input
          name="start_date"
          type="date"
          defaultValue={batch?.start_date}
          disabled={!!batch}
          className={fieldClass()}
        />
      </label>
      <label>
        <span className={label}>Class time (Pakistan)</span>
        <input
          name="class_time"
          type="time"
          defaultValue={batch?.class_time ?? DEFAULT_CLASS_TIME}
          className={fieldClass()}
        />
      </label>
      <label>
        <span className={label}>Weekends (classes)</span>
        <input
          name="weekends"
          type="number"
          min={1}
          defaultValue={batch?.weekends ?? DEFAULT_WEEKENDS}
          disabled={!!batch}
          className={fieldClass()}
        />
      </label>
      <label>
        <span className={label}>Paid months</span>
        <input name="months" type="number" min={1} defaultValue={batch?.months ?? DEFAULT_MONTHS} className={fieldClass()} />
      </label>
      <label>
        <span className={label}>Monthly fee (Rs)</span>
        <input
          name="monthly_fee"
          type={amountType}
          min={0}
          defaultValue={batch?.monthly_fee ?? DEFAULT_MONTHLY_FEE}
          className={fieldClass()}
        />
      </label>
      <label>
        <span className={label}>Grace days before blocking</span>
        <input
          name="grace_days"
          type="number"
          min={0}
          defaultValue={batch?.grace_days ?? DEFAULT_GRACE_DAYS}
          className={fieldClass()}
        />
      </label>
      <fieldset className="col-span-2 mt-1">
        <legend className={label}>Progress score weights</legend>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["w_attendance", "Attendance", batch?.w_attendance ?? 30],
              ["w_homework", "Homework", batch?.w_homework ?? 35],
              ["w_quiz", "Quiz", batch?.w_quiz ?? 25],
              ["w_videos", "Videos", batch?.w_videos ?? 10],
            ] as const
          ).map(([name, text, value]) => (
            <label key={name}>
              <span className="block text-[11px] text-slate-400">{text}</span>
              <input name={name} type="number" min={0} defaultValue={value} className={fieldClass()} />
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

export default function IntakesTab({
  batches,
  selectedId,
}: {
  batches: BatchRow[];
  selectedId: number | null;
}) {
  const rs = useRs();
  const router = useRouter();
  const create = useAction();
  const [editing, setEditing] = useState<BatchRow | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">Create intake</h2>
        <p className="text-slate-500 text-sm mb-3">
          One weekly class is scheduled automatically for every weekend, starting on the first class
          date, each linked to that weekend of the course. Add the Meet link and code in Classes.
        </p>
        <form
          ref={formRef}
          action={(fd) =>
            create.run(() => createBatch(fd), {
              success: "Intake created and classes scheduled.",
              onDone: (res) => {
                formRef.current?.reset();
                if (res.id) router.push(`/admin?batch=${res.id}`);
              },
            })
          }
          className="space-y-3"
        >
          <BatchFields />
          <button type="submit" disabled={create.pending} className={`w-full ${btn.primary}`}>
            Create intake
          </button>
        </form>
        <Msg error={create.error} ok={create.ok} />
      </Card>

      <Card>
        <h2 className="font-bold mb-3">All intakes</h2>
        <ul className="divide-y text-sm">
          {batches.map((b) => (
            <li key={b.id} className="py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold flex items-center gap-2 flex-wrap">
                  {b.name}
                  <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_CLASS[b.status]}`}>{b.status}</span>
                  {b.id === selectedId && <span className="text-xs text-brand-600">selected</span>}
                </p>
                <p className="text-slate-500">
                  Batch {b.level} · starts {fmtDay(b.start_date)} {b.class_time} · {b.enrolled} students ·{" "}
                  {rs(b.monthly_fee)} × {b.months}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {b.id !== selectedId && (
                  <button onClick={() => router.push(`/admin?batch=${b.id}`)} className={btn.small}>
                    Open
                  </button>
                )}
                <button onClick={() => setEditing(b)} className={btn.small}>
                  Edit
                </button>
              </div>
            </li>
          ))}
          {batches.length === 0 && (
            <li className="py-6 text-center text-slate-400">No intakes yet. Create the first one above.</li>
          )}
        </ul>
      </Card>

      {editing && <EditIntakeModal batch={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditIntakeModal({ batch, onClose }: { batch: BatchRow; onClose: () => void }) {
  const router = useRouter();
  const save = useAction();
  const del = useAction();
  return (
    <Modal title={`Edit ${batch.name}`} onClose={onClose}>
      <form
        action={(fd) => {
          // Disabled fields are not submitted; send the fixed values back.
          fd.set("level", String(batch.level));
          fd.set("start_date", batch.start_date);
          fd.set("weekends", String(batch.weekends));
          save.run(() => updateBatch(batch.id, fd), { onDone: onClose });
        }}
        className="space-y-3"
      >
        <BatchFields batch={batch} />
        <p className="text-xs text-slate-400">
          Level, first date and number of weekends are fixed once classes are scheduled. A new fee
          or month count applies to students enrolled after this change; edit existing students&apos;
          months in Fees.
        </p>
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save changes
        </button>
      </form>
      <Msg error={save.error} />
      <button
        onClick={() => {
          if (!confirm(`Delete ${batch.name} and all its classes and enrollments? This cannot be undone.`)) return;
          del.run(() => deleteBatch(batch.id), {
            onDone: () => {
              onClose();
              router.push("/admin");
            },
          });
        }}
        disabled={del.pending}
        className="mt-4 text-sm text-rose-600 underline"
      >
        Delete intake
      </button>
      <Msg error={del.error} />
    </Modal>
  );
}
