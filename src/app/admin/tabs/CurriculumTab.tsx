"use client";

import { useState } from "react";
import {
  addVideo,
  deleteVideo,
  updateLevel,
  updateVideo,
  updateWeekend,
} from "@/actions/curriculum";
import type { Curriculum, VideoRow, WeekendRow } from "@/lib/curriculum";
import { CONTENT_KINDS, type ContentKind } from "@/lib/constants";
import { Card, Modal, Msg, btn, fieldClass, useAction } from "../ui";

const KIND_ICON: Record<ContentKind, string> = {
  topic: "▶",
  hands_on: "▶",
  extra: "▶",
  slides: "📊",
  code: "</>",
  doc: "📄",
};

/** The type picker: videos first, then the link kinds. */
function KindSelect({ defaultValue }: { defaultValue: ContentKind }) {
  return (
    <select name="kind" defaultValue={defaultValue} className={fieldClass()}>
      <optgroup label="Videos">
        {(["topic", "hands_on", "extra"] as const).map((k) => (
          <option key={k} value={k}>
            {CONTENT_KINDS[k].label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Other content">
        {(["slides", "code", "doc"] as const).map((k) => (
          <option key={k} value={k}>
            {CONTENT_KINDS[k].label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export default function CurriculumTab({
  curriculum,
  initialLevel,
}: {
  curriculum: Curriculum;
  initialLevel: 1 | 2;
}) {
  const [level, setLevel] = useState<1 | 2>(initialLevel);
  const [editing, setEditing] = useState<WeekendRow | null>(null);
  const [editingLevel, setEditingLevel] = useState(false);
  const info = curriculum.levels.find((l) => l.level === level);
  const weekends = curriculum.weekends.filter((w) => w.level === level);

  return (
    <>
      <div className="flex gap-1.5 mb-4">
        {([1, 2] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`text-sm rounded-full px-4 py-2 font-semibold border ${
              level === l ? "bg-brand-600 border-brand-600 text-white" : "bg-white border-slate-200 text-slate-600"
            }`}
          >
            Batch {l}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-bold">
              Batch {level} — {info?.title}
            </h2>
            <p className="text-slate-500 text-sm mt-1">{info?.promise}</p>
          </div>
          <button onClick={() => setEditingLevel(true)} className={btn.small}>
            Edit
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Shared by every intake of Batch {level}: add a weekend&apos;s content once and all intakes get them.
          Pick the right type for each item: videos get a play button and a &ldquo;watched&rdquo; tick; slides,
          code and notes get their own icon and just open.
        </p>
      </Card>

      {weekends.map((w) => {
        const main = w.videos.filter((v) => v.kind === "topic" || v.kind === "hands_on").length;
        return (
          <Card key={w.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-400 font-mono">
                  Weekend {w.weekend_no}
                  {w.ng_skill && ` · Ng ${w.ng_skill}`}
                </p>
                <h3 className="font-semibold flex flex-wrap items-center gap-2">
                  {w.title}
                  {w.tag && (
                    <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">{w.tag}</span>
                  )}
                </h3>
              </div>
              <button onClick={() => setEditing(w)} className={btn.small}>
                Edit
              </button>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              <b>Homework:</b> {w.homework || <span className="text-amber-600">none set</span>}
            </p>
            <div className="mt-3">
              <p className="text-xs font-medium text-slate-500 mb-1">
                Content{" "}
                <span className={main >= 2 ? "text-emerald-600" : "text-amber-600"}>({main} of 2 main videos)</span>
              </p>
              <ul className="divide-y text-sm">
                {w.videos.map((v) => (
                  <VideoItem key={v.id} video={v} />
                ))}
              </ul>
              <AddVideoForm weekendId={w.id} nextKind={main === 0 ? "topic" : main === 1 ? "hands_on" : "extra"} />
            </div>
          </Card>
        );
      })}

      {editing && <WeekendModal weekend={editing} onClose={() => setEditing(null)} />}
      {editingLevel && info && (
        <Modal title={`Batch ${level}`} onClose={() => setEditingLevel(false)}>
          <LevelForm level={level} title={info.title} promise={info.promise} outcomes={info.outcomes} onDone={() => setEditingLevel(false)} />
        </Modal>
      )}
    </>
  );
}

function LevelForm({
  level,
  title,
  promise,
  outcomes,
  onDone,
}: {
  level: number;
  title: string;
  promise: string | null;
  outcomes: string | null;
  onDone: () => void;
}) {
  const save = useAction();
  return (
    <form action={(fd) => save.run(() => updateLevel(level, fd), { onDone })} className="space-y-2">
      <input name="title" defaultValue={title} className={fieldClass()} />
      <textarea name="promise" rows={3} defaultValue={promise ?? ""} placeholder="Promise" className={fieldClass()} />
      <label className="block">
        <span className="block text-xs font-medium text-slate-500 mb-1">After this batch you will have (one per line)</span>
        <textarea name="outcomes" rows={5} defaultValue={outcomes ?? ""} className={fieldClass()} />
      </label>
      <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
        Save
      </button>
      <Msg error={save.error} />
    </form>
  );
}

function VideoItem({ video }: { video: VideoRow }) {
  const act = useAction();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="py-2">
        <form
          action={(fd) => act.run(() => updateVideo(video.id, fd), { onDone: () => setEditing(false) })}
          className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2"
        >
          <input name="title" defaultValue={video.title} className={fieldClass()} />
          <input name="url" defaultValue={video.url} className={fieldClass()} />
          <KindSelect defaultValue={video.kind} />
          <button type="submit" disabled={act.pending} className={btn.dark}>
            Save
          </button>
        </form>
        <Msg error={act.error} />
      </li>
    );
  }
  return (
    <li className="py-1.5 flex items-center justify-between gap-2">
      <div className="min-w-0 flex items-center gap-2">
        <span className="w-6 shrink-0 text-center text-xs text-slate-500">{KIND_ICON[video.kind]}</span>
        <div className="min-w-0">
          <a href={video.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline truncate block">
            {video.title}
          </a>
          <span className="text-xs text-slate-400">{CONTENT_KINDS[video.kind].label}</span>
        </div>
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button onClick={() => setEditing(true)} className={btn.small}>
          Edit
        </button>
        <button
          onClick={() => {
            if (confirm(`Remove "${video.title}"? Students' watched ticks for it are removed too.`))
              act.run(() => deleteVideo(video.id));
          }}
          className={btn.smallDanger}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function AddVideoForm({ weekendId, nextKind }: { weekendId: number; nextKind: ContentKind }) {
  const act = useAction();
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`${btn.small} mt-2`}>
        + Add content
      </button>
    );
  }
  return (
    <form
      action={(fd) => act.run(() => addVideo(weekendId, fd), { onDone: () => setOpen(false) })}
      className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2 mt-2"
    >
      <input name="title" placeholder="Title" className={fieldClass()} />
      <input name="url" placeholder="YouTube / Slides / GitHub / Drive link" className={fieldClass()} />
      <KindSelect defaultValue={nextKind} />
      <button type="submit" disabled={act.pending} className={btn.primary}>
        Add
      </button>
      <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-4">
        <input name="notify_email" type="checkbox" defaultChecked className="h-4 w-4 accent-brand-600" />
        Email students about this
      </label>
      <Msg error={act.error} />
    </form>
  );
}

function WeekendModal({ weekend, onClose }: { weekend: WeekendRow; onClose: () => void }) {
  const save = useAction();
  const label = "block text-xs font-medium text-slate-500 mb-1";
  return (
    <Modal title={`Weekend ${weekend.weekend_no}`} onClose={onClose} wide>
      <form action={(fd) => save.run(() => updateWeekend(weekend.id, fd), { onDone: onClose })} className="space-y-2">
        <label className="block">
          <span className={label}>Title</span>
          <input name="title" defaultValue={weekend.title} className={fieldClass()} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className={label}>Ng skill</span>
            <input name="ng_skill" defaultValue={weekend.ng_skill ?? ""} placeholder="3.1, 3.2" className={fieldClass()} />
          </label>
          <label>
            <span className={label}>Badge</span>
            <input name="tag" defaultValue={weekend.tag ?? ""} placeholder="PROJECT A" className={fieldClass()} />
          </label>
        </div>
        <label className="block">
          <span className={label}>Topics (one per line)</span>
          <textarea name="topics" rows={6} defaultValue={weekend.topics ?? ""} className={fieldClass()} />
        </label>
        <label className="block">
          <span className={label}>You build</span>
          <input name="you_build" defaultValue={weekend.you_build ?? ""} className={fieldClass()} />
        </label>
        <label className="block">
          <span className={label}>Homework (empty = no homework this weekend)</span>
          <textarea name="homework" rows={2} defaultValue={weekend.homework ?? ""} className={fieldClass()} />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="notify_email" type="checkbox" defaultChecked className="h-4 w-4 accent-brand-600" />
          Email students if the homework changed
        </label>
        <label className="block">
          <span className={label}>Slides &amp; extra links (one per line, “Label | https://…”)</span>
          <textarea name="slides" rows={3} defaultValue={weekend.slides ?? ""} className={`${fieldClass()} font-mono text-sm`} />
        </label>
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save weekend
        </button>
        <Msg error={save.error} />
      </form>
    </Modal>
  );
}
