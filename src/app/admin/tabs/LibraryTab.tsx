"use client";

import { useRef, useState } from "react";
import {
  addLibraryVideo,
  deleteLibraryVideo,
  updateLibraryVideo,
  type LibraryVideo,
} from "@/actions/library";
import { Card, Modal, Msg, btn, fieldClass, useAction } from "../ui";

const GENERAL = "General";

/** Group by category, keeping the server's order (category, then sort order). */
function groupByCategory(videos: LibraryVideo[]): [string, LibraryVideo[]][] {
  const groups = new Map<string, LibraryVideo[]>();
  for (const v of videos) {
    const key = v.category?.trim() || GENERAL;
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  return [...groups.entries()];
}

export default function LibraryTab({ videos }: { videos: LibraryVideo[] }) {
  const add = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  const [editing, setEditing] = useState<LibraryVideo | null>(null);
  const categories = [...new Set(videos.map((v) => v.category?.trim()).filter(Boolean))] as string[];

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">Library</h2>
        <p className="text-slate-500 text-sm mb-3">
          General videos every student can watch, whatever their intake. They are not part of a weekend and
          don&apos;t count towards the progress score.
        </p>
        <form
          ref={formRef}
          action={(fd) =>
            add.run(() => addLibraryVideo(fd), {
              success: "Video added to the Library.",
              onDone: () => formRef.current?.reset(),
            })
          }
          className="space-y-2"
        >
          <LibraryFields categories={categories} />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input name="notify_email" type="checkbox" className="h-4 w-4 accent-brand-600" />
            Email all active students about this video
          </label>
          <button type="submit" disabled={add.pending} className={`w-full ${btn.primary}`}>
            Add to Library
          </button>
        </form>
        <Msg error={add.error} ok={add.ok} />
      </Card>

      {videos.length === 0 ? (
        <Card>
          <p className="text-slate-400 text-sm text-center py-4">No library videos yet.</p>
        </Card>
      ) : (
        groupByCategory(videos).map(([category, list]) => (
          <Card key={category}>
            <h3 className="font-semibold mb-1">
              {category} <span className="text-xs font-normal text-slate-400">({list.length})</span>
            </h3>
            <ul className="divide-y text-sm">
              {list.map((v) => (
                <LibraryItem key={v.id} video={v} onEdit={() => setEditing(v)} />
              ))}
            </ul>
          </Card>
        ))
      )}

      {editing && (
        <EditModal video={editing} categories={categories} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function LibraryFields({ video, categories }: { video?: LibraryVideo; categories: string[] }) {
  return (
    <>
      <input name="title" defaultValue={video?.title} placeholder="Video title" className={fieldClass()} />
      <input name="url" defaultValue={video?.url} placeholder="YouTube / Drive link" className={fieldClass()} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          name="category"
          list="library-categories"
          defaultValue={video?.category ?? ""}
          placeholder="Category (optional, e.g. Career, Tools)"
          className={fieldClass()}
        />
        <input
          name="sort_order"
          type="number"
          defaultValue={video?.sort_order ?? 0}
          title="Order inside the category (lower shows first)"
          className={`${fieldClass()} w-24`}
        />
      </div>
      <datalist id="library-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <textarea
        name="description"
        rows={2}
        defaultValue={video?.description ?? ""}
        placeholder="Short description (optional)"
        className={fieldClass()}
      />
    </>
  );
}

function LibraryItem({ video, onEdit }: { video: LibraryVideo; onEdit: () => void }) {
  const act = useAction();
  return (
    <li className="py-2 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <a href={video.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline break-words">
          {video.title}
        </a>
        {video.description && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{video.description}</p>}
        <Msg error={act.error} />
      </div>
      <div className="flex gap-1.5 shrink-0">
        <button onClick={onEdit} className={btn.small}>
          Edit
        </button>
        <button
          onClick={() => {
            if (confirm(`Remove "${video.title}" from the Library?`)) act.run(() => deleteLibraryVideo(video.id));
          }}
          disabled={act.pending}
          className={btn.smallDanger}
        >
          Remove
        </button>
      </div>
    </li>
  );
}

function EditModal({
  video,
  categories,
  onClose,
}: {
  video: LibraryVideo;
  categories: string[];
  onClose: () => void;
}) {
  const save = useAction();
  return (
    <Modal title="Edit library video" onClose={onClose}>
      <form action={(fd) => save.run(() => updateLibraryVideo(video.id, fd), { onDone: onClose })} className="space-y-2">
        <LibraryFields video={video} categories={categories} />
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save
        </button>
        <Msg error={save.error} />
      </form>
    </Modal>
  );
}
