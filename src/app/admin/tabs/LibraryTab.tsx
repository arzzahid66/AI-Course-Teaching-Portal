"use client";

import { useRef, useState } from "react";
import {
  addLibraryVideo,
  createPlaylist,
  deleteLibraryVideo,
  deletePlaylist,
  setPlaylistPublished,
  updateLibraryVideo,
  updatePlaylist,
  type LibraryData,
  type LibraryPlaylist,
  type LibraryVideo,
} from "@/actions/library";
import { Card, Modal, Msg, btn, fieldClass, useAction } from "../ui";

export default function LibraryTab({ library }: { library: LibraryData }) {
  const { playlists, videos } = library;
  const [editingVideo, setEditingVideo] = useState<LibraryVideo | null>(null);
  const [editingPlaylist, setEditingPlaylist] = useState<LibraryPlaylist | null>(null);
  const general = videos.filter((v) => v.playlist_id == null);

  return (
    <>
      <Card>
        <h2 className="font-bold mb-1">Library</h2>
        <p className="text-slate-500 text-sm">
          Extra videos for every student, whatever their intake. Put a topic&apos;s videos in a{" "}
          <b>playlist</b> (e.g. &ldquo;GitHub complete guide&rdquo;) so they stay together and play in order;
          students first see only the playlist&apos;s title and open it. A video with no playlist shows as a
          general video. Nothing here counts towards the progress score.
        </p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <NewPlaylistCard />
        <AddVideoCard playlists={playlists} />
      </div>

      {playlists.map((p) => (
        <PlaylistCard
          key={p.id}
          playlist={p}
          videos={videos.filter((v) => v.playlist_id === p.id)}
          onEdit={() => setEditingPlaylist(p)}
          onEditVideo={setEditingVideo}
        />
      ))}

      <Card>
        <h3 className="font-semibold mb-1">
          General videos <span className="text-xs font-normal text-slate-400">({general.length})</span>
        </h3>
        {general.length === 0 ? (
          <p className="text-slate-400 text-sm">No general videos. Videos without a playlist show here.</p>
        ) : (
          <ul className="divide-y text-sm">
            {general.map((v) => (
              <VideoItem key={v.id} video={v} onEdit={() => setEditingVideo(v)} />
            ))}
          </ul>
        )}
      </Card>

      {editingPlaylist && <PlaylistModal playlist={editingPlaylist} onClose={() => setEditingPlaylist(null)} />}
      {editingVideo && (
        <VideoModal video={editingVideo} playlists={playlists} onClose={() => setEditingVideo(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------
function PlaylistFields({ playlist }: { playlist?: LibraryPlaylist }) {
  return (
    <>
      <input
        name="title"
        defaultValue={playlist?.title}
        placeholder="Playlist title (e.g. LangChain guide)"
        className={fieldClass()}
      />
      <textarea
        name="description"
        rows={2}
        defaultValue={playlist?.description ?? ""}
        placeholder="What students will learn (optional)"
        className={fieldClass()}
      />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            name="is_published"
            type="checkbox"
            defaultChecked={playlist?.is_published ?? true}
            className="h-4 w-4 accent-brand-600"
          />
          Visible to students
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-500">
          Position
          <input
            name="sort_order"
            type="number"
            defaultValue={playlist?.sort_order ?? 0}
            title="Lower shows first"
            className={`${fieldClass()} w-20`}
          />
        </label>
      </div>
    </>
  );
}

function NewPlaylistCard() {
  const act = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Card className="!mb-0">
      <h3 className="font-semibold mb-1">New playlist</h3>
      <p className="text-xs text-slate-400 mb-2">
        Still recording it? Untick &ldquo;Visible to students&rdquo; and switch it on when it&apos;s complete.
      </p>
      <form
        ref={formRef}
        action={(fd) =>
          act.run(() => createPlaylist(fd), {
            success: "Playlist created. Add videos to it on the right.",
            onDone: () => formRef.current?.reset(),
          })
        }
        className="space-y-2"
      >
        <PlaylistFields />
        <button type="submit" disabled={act.pending} className={`w-full ${btn.primary}`}>
          Create playlist
        </button>
      </form>
      <Msg error={act.error} ok={act.ok} />
    </Card>
  );
}

function VideoFields({ video, playlists }: { video?: LibraryVideo; playlists: LibraryPlaylist[] }) {
  return (
    <>
      <select name="playlist_id" defaultValue={video?.playlist_id ?? ""} className={fieldClass()}>
        <option value="">No playlist (general video)</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
            {p.is_published ? "" : " (hidden)"}
          </option>
        ))}
      </select>
      <input name="title" defaultValue={video?.title} placeholder="Video title" className={fieldClass()} />
      <input name="url" defaultValue={video?.url} placeholder="YouTube / Drive link" className={fieldClass()} />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <textarea
          name="description"
          rows={2}
          defaultValue={video?.description ?? ""}
          placeholder="Short description (optional)"
          className={fieldClass()}
        />
        <input
          name="sort_order"
          type="number"
          defaultValue={video?.sort_order ?? ""}
          placeholder="Part #"
          title="Order inside the playlist. Leave empty to add it at the end."
          className={`${fieldClass()} w-24`}
        />
      </div>
    </>
  );
}

function AddVideoCard({ playlists }: { playlists: LibraryPlaylist[] }) {
  const act = useAction();
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Card className="!mb-0">
      <h3 className="font-semibold mb-1">Add video</h3>
      <p className="text-xs text-slate-400 mb-2">Leave Part # empty to add it after the playlist&apos;s last video.</p>
      <form
        ref={formRef}
        action={(fd) =>
          act.run(() => addLibraryVideo(fd), {
            success: "Video added.",
            // Keep the chosen playlist selected, so adding part 2, 3… is quick.
            onDone: () => {
              const f = formRef.current;
              if (!f) return;
              for (const name of ["title", "url", "description", "sort_order"]) {
                const el = f.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
                if (el) el.value = "";
              }
            },
          })
        }
        className="space-y-2"
      >
        <VideoFields playlists={playlists} />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input name="notify_email" type="checkbox" className="h-4 w-4 accent-brand-600" />
          Email all active students (skipped for hidden playlists)
        </label>
        <button type="submit" disabled={act.pending} className={`w-full ${btn.primary}`}>
          Add video
        </button>
      </form>
      <Msg error={act.error} ok={act.ok} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------
function PlaylistCard({
  playlist: p,
  videos,
  onEdit,
  onEditVideo,
}: {
  playlist: LibraryPlaylist;
  videos: LibraryVideo[];
  onEdit: () => void;
  onEditVideo: (v: LibraryVideo) => void;
}) {
  const act = useAction();
  return (
    <Card className={p.is_published ? "" : "bg-slate-50"}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold flex flex-wrap items-center gap-2">
            🎞️ {p.title}
            <span
              className={`text-[10px] rounded-full px-2 py-0.5 ${
                p.is_published ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
              }`}
            >
              {p.is_published ? "visible" : "hidden"}
            </span>
          </h3>
          {p.description && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{p.description}</p>}
          <p className="text-xs text-slate-400 mt-0.5">
            {videos.length} video{videos.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex gap-1.5 shrink-0">
          <button
            onClick={() => act.run(() => setPlaylistPublished(p.id, !p.is_published))}
            disabled={act.pending}
            className={btn.small}
          >
            {p.is_published ? "Hide" : "Show to students"}
          </button>
          <button onClick={onEdit} className={btn.small}>
            Edit
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete the playlist "${p.title}"? Its ${videos.length} video(s) are kept as general videos.`))
                act.run(() => deletePlaylist(p.id));
            }}
            disabled={act.pending}
            className={btn.smallDanger}
          >
            Delete
          </button>
        </div>
      </div>
      <Msg error={act.error} />
      {videos.length === 0 ? (
        <p className="text-slate-400 text-sm mt-2">No videos yet. Pick this playlist in &ldquo;Add video&rdquo;.</p>
      ) : (
        <ol className="divide-y text-sm mt-2">
          {videos.map((v, i) => (
            <VideoItem key={v.id} video={v} number={i + 1} onEdit={() => onEditVideo(v)} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function VideoItem({ video, number, onEdit }: { video: LibraryVideo; number?: number; onEdit: () => void }) {
  const act = useAction();
  return (
    <li className="py-2 flex items-start justify-between gap-2">
      <div className="min-w-0 flex gap-2">
        {number != null && <span className="w-5 shrink-0 text-right text-slate-400 tabular-nums">{number}.</span>}
        <div className="min-w-0">
          <a href={video.url} target="_blank" rel="noreferrer" className="font-medium text-brand-700 underline break-words">
            {video.title}
          </a>
          {video.description && (
            <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line">{video.description}</p>
          )}
          <Msg error={act.error} />
        </div>
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

// ---------------------------------------------------------------------------
// Edit modals
// ---------------------------------------------------------------------------
function PlaylistModal({ playlist, onClose }: { playlist: LibraryPlaylist; onClose: () => void }) {
  const save = useAction();
  return (
    <Modal title="Edit playlist" onClose={onClose}>
      <form action={(fd) => save.run(() => updatePlaylist(playlist.id, fd), { onDone: onClose })} className="space-y-2">
        <PlaylistFields playlist={playlist} />
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save
        </button>
        <Msg error={save.error} />
      </form>
    </Modal>
  );
}

function VideoModal({
  video,
  playlists,
  onClose,
}: {
  video: LibraryVideo;
  playlists: LibraryPlaylist[];
  onClose: () => void;
}) {
  const save = useAction();
  return (
    <Modal title="Edit library video" onClose={onClose}>
      <form action={(fd) => save.run(() => updateLibraryVideo(video.id, fd), { onDone: onClose })} className="space-y-2">
        <VideoFields video={video} playlists={playlists} />
        <button type="submit" disabled={save.pending} className={`w-full ${btn.primary}`}>
          Save
        </button>
        <Msg error={save.error} />
      </form>
    </Modal>
  );
}
