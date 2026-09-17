"use client";

import { useState } from "react";
import { deleteHomework, reviewHomework, type HomeworkBoard, type HomeworkRow } from "@/actions/curriculum";
import { Card, EmailStudentButton, Msg, btn, fieldClass, fmt, useAction } from "../ui";

const STATUS: Record<string, { label: string; className: string }> = {
  submitted: { label: "To mark", className: "bg-amber-100 text-amber-700" },
  needs_changes: { label: "Needs changes", className: "bg-rose-100 text-rose-700" },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-700" },
};

export default function HomeworkTab({ board }: { board: HomeworkBoard }) {
  const [filter, setFilter] = useState<"todo" | "all">("todo");
  const todo = board.submissions.filter((s) => s.status === "submitted" && s.marks == null);
  const shown = filter === "todo" ? todo : board.submissions;

  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">Homework</h2>
          <div className="flex gap-1.5">
            {(
              [
                ["todo", `To mark (${todo.length})`],
                ["all", `All (${board.submissions.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`text-xs rounded-full px-3 py-1.5 font-medium border ${
                  filter === key ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-3">
          Marks out of 10 count toward the student&apos;s progress score. Unmarked work is left out until marked.
        </p>
        <ul className="divide-y">
          {shown.map((s) => (
            <HomeworkItem key={s.id} row={s} />
          ))}
          {shown.length === 0 && (
            <li className="py-6 text-center text-slate-400 text-sm">
              {filter === "todo" ? "Nothing to mark." : "No homework submitted yet."}
            </li>
          )}
        </ul>
      </Card>

      <Card>
        <h2 className="font-bold mb-1">Not submitted (past due)</h2>
        <p className="text-xs text-slate-400 mb-2">Each missing homework counts as 0/10.</p>
        {board.missing.length === 0 ? (
          <p className="text-slate-400 text-sm">Everyone is up to date.</p>
        ) : (
          <ul className="divide-y text-sm">
            {board.missing.map((m) => (
              <li key={m.weekend_no} className="py-2">
                <p className="font-medium">
                  Weekend {m.weekend_no} — {m.title}
                </p>
                <p className="text-slate-500">{m.names.join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function HomeworkItem({ row }: { row: HomeworkRow }) {
  const act = useAction();
  const [status, setStatus] = useState<"approved" | "needs_changes">(
    row.status === "needs_changes" ? "needs_changes" : "approved"
  );
  const meta = STATUS[row.status];
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {row.name}{" "}
            <span className="text-slate-400 font-normal">
              · W{row.weekend_no} {row.weekend_title}
            </span>
          </p>
          <a href={row.link_url} target="_blank" rel="noreferrer" className="text-sm text-brand-700 underline break-all">
            {row.link_url}
          </a>
          {row.note && <p className="text-sm text-slate-600 mt-0.5">“{row.note}”</p>}
          <p className="text-xs text-slate-400">Submitted {fmt(row.submitted_at)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span className={`text-xs rounded-full px-2 py-0.5 ${meta.className}`}>
            {row.marks != null ? `${row.marks}/10 · ` : ""}
            {meta.label}
          </span>
          <EmailStudentButton
            studentId={row.student_id}
            name={row.name}
            defaultSubject={`About your Weekend ${row.weekend_no} homework`}
          />
        </div>
      </div>
      <form
        action={(fd) => act.run(() => reviewHomework(row.id, fd), { success: "Saved and student notified." })}
        className="grid grid-cols-[5rem_1fr] sm:grid-cols-[5rem_10rem_1fr_auto] gap-2 mt-2"
      >
        <input
          name="marks"
          type="number"
          min={0}
          max={10}
          defaultValue={row.marks ?? ""}
          placeholder="/10"
          aria-label="Marks out of 10"
          className={fieldClass()}
        />
        <select
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as "approved" | "needs_changes")}
          className={fieldClass()}
        >
          <option value="approved">Approve</option>
          <option value="needs_changes">Needs changes</option>
        </select>
        <input
          name="feedback"
          defaultValue={row.feedback ?? ""}
          placeholder="Feedback for the student"
          className={`${fieldClass()} col-span-2 sm:col-span-1`}
        />
        <button type="submit" disabled={act.pending} className={`col-span-2 sm:col-span-1 ${btn.dark}`}>
          Save
        </button>
      </form>
      <div className="flex justify-between items-center">
        <Msg error={act.error} ok={act.ok} />
        <button
          onClick={() => {
            if (confirm("Delete this submission? The student can submit again.")) act.run(() => deleteHomework(row.id));
          }}
          className="text-xs text-rose-600 underline mt-2 ml-auto"
        >
          Delete
        </button>
      </div>
    </li>
  );
}
