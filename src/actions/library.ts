"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin, requireStudentId } from "@/lib/auth";
import { normalizeUrl } from "@/lib/constants";
import { queueBroadcastEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// Library — videos every student can watch. Not tied to a weekend, level or
// intake, and not counted in the progress score.
//
// A playlist is a topic guide (e.g. "GitHub complete guide") whose videos play
// in order. A video with no playlist is a general video. A hidden playlist is
// still being built: neither it nor its videos reach students.
// ---------------------------------------------------------------------------
export type LibraryPlaylist = {
  id: number;
  title: string;
  description: string | null;
  sort_order: number;
  is_published: boolean;
};

export type LibraryVideo = {
  id: number;
  /** null = a general video, not part of any playlist. */
  playlist_id: number | null;
  title: string;
  url: string;
  description: string | null;
  sort_order: number;
};

export type LibraryData = { playlists: LibraryPlaylist[]; videos: LibraryVideo[] };

async function loadLibrary(publishedOnly: boolean): Promise<LibraryData> {
  const [playlists, videos] = await Promise.all([
    sql`
      SELECT id, title, description, sort_order, is_published
      FROM library_playlists
      WHERE (${!publishedOnly} OR is_published = true)
      ORDER BY sort_order ASC, lower(title) ASC, id ASC
    ` as unknown as Promise<LibraryPlaylist[]>,
    sql`
      SELECT v.id, v.playlist_id, v.title, v.url, v.description, v.sort_order
      FROM library_videos v
      LEFT JOIN library_playlists p ON p.id = v.playlist_id
      WHERE (${!publishedOnly} OR v.playlist_id IS NULL OR p.is_published = true)
      ORDER BY v.sort_order ASC, v.id ASC
    ` as unknown as Promise<LibraryVideo[]>,
  ]);
  return { playlists, videos };
}

export async function getLibraryAdmin(): Promise<LibraryData> {
  await assertAdmin();
  return loadLibrary(false);
}

/** The published Library, for any signed-in student (enrolled or not). */
export async function getStudentLibrary(): Promise<LibraryData> {
  await requireStudentId();
  return loadLibrary(true);
}

function revalidate() {
  revalidatePath("/admin");
  revalidatePath("/portal");
}

// ---------------------------------------------------------------------------
// Playlists
// ---------------------------------------------------------------------------
function readPlaylistForm(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    title: text("title"),
    description: text("description") || null,
    sortOrder: Number(formData.get("sort_order") || 0) || 0,
    isPublished: formData.get("is_published") === "on",
  };
}

function validatePlaylist(p: ReturnType<typeof readPlaylistForm>): string | null {
  if (!p.title) return "Give the playlist a title, e.g. “GitHub complete guide”.";
  if (p.title.length > 120) return "Title is too long (max 120 characters).";
  if (p.description && p.description.length > 1000) return "Description is too long (max 1000 characters).";
  return null;
}

const DUPLICATE = "A playlist with that title already exists.";

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
}

export async function createPlaylist(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const p = readPlaylistForm(formData);
  const err = validatePlaylist(p);
  if (err) return { error: err };
  try {
    await sql`
      INSERT INTO library_playlists (title, description, sort_order, is_published)
      VALUES (${p.title}, ${p.description}, ${p.sortOrder}, ${p.isPublished})
    `;
  } catch (e) {
    if (isUniqueViolation(e)) return { error: DUPLICATE };
    throw e;
  }
  revalidate();
  return {};
}

export async function updatePlaylist(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const p = readPlaylistForm(formData);
  const err = validatePlaylist(p);
  if (err) return { error: err };
  try {
    await sql`
      UPDATE library_playlists
      SET title = ${p.title}, description = ${p.description}, sort_order = ${p.sortOrder},
        is_published = ${p.isPublished}
      WHERE id = ${id}
    `;
  } catch (e) {
    if (isUniqueViolation(e)) return { error: DUPLICATE };
    throw e;
  }
  revalidate();
  return {};
}

/** Show / hide a playlist (and its videos) for students. */
export async function setPlaylistPublished(id: number, published: boolean): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`UPDATE library_playlists SET is_published = ${published} WHERE id = ${id}`;
  revalidate();
  return {};
}

/** Delete a playlist. Its videos are kept and become general videos. */
export async function deletePlaylist(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM library_playlists WHERE id = ${id}`;
  revalidate();
  return {};
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------
function readVideoForm(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  const playlistId = Number(formData.get("playlist_id") || 0);
  const order = text("sort_order");
  return {
    title: text("title"),
    url: normalizeUrl(text("url")),
    description: text("description") || null,
    playlistId: playlistId > 0 ? playlistId : null,
    /** null = blank: put it at the end of its playlist. */
    sortOrder: order === "" || Number.isNaN(Number(order)) ? null : Math.round(Number(order)),
  };
}

function validateVideo(v: ReturnType<typeof readVideoForm>): string | null {
  if (!v.title || !v.url) return "Video title and link are required.";
  if (v.title.length > 200) return "Title is too long (max 200 characters).";
  if (v.description && v.description.length > 2000) return "Description is too long (max 2000 characters).";
  return null;
}

/** Next position at the end of a playlist (or of the general videos). */
async function nextOrder(playlistId: number | null): Promise<number> {
  const rows = (await sql`
    SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM library_videos
    WHERE playlist_id IS NOT DISTINCT FROM ${playlistId}::int
  `) as { n: number }[];
  return Number(rows[0]?.n ?? 1);
}

export async function addLibraryVideo(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const v = readVideoForm(formData);
  const err = validateVideo(v);
  if (err) return { error: err };

  const playlist = v.playlistId
    ? ((await sql`
        SELECT title, is_published FROM library_playlists WHERE id = ${v.playlistId}
      `) as { title: string; is_published: boolean }[])[0]
    : null;
  if (v.playlistId && !playlist) return { error: "That playlist no longer exists." };

  const order = v.sortOrder ?? (await nextOrder(v.playlistId));
  await sql`
    INSERT INTO library_videos (playlist_id, title, url, description, sort_order)
    VALUES (${v.playlistId}, ${v.title}, ${v.url}, ${v.description}, ${order})
  `;

  // Never announce a video students cannot see yet.
  if (formData.get("notify_email") === "on" && (!playlist || playlist.is_published)) {
    queueBroadcastEmail(
      { level: null },
      {
        subject: `New in the Library: ${v.title}`,
        heading: "A new video is in the Library",
        lines: [
          `"${v.title}" was added to the Library${playlist ? ` in the "${playlist.title}" playlist` : ""}.`,
          v.description,
        ],
        link: { label: "Watch the video", url: v.url },
      }
    );
  }
  revalidate();
  return {};
}

export async function updateLibraryVideo(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const v = readVideoForm(formData);
  const err = validateVideo(v);
  if (err) return { error: err };
  const current = (await sql`
    SELECT playlist_id, sort_order FROM library_videos WHERE id = ${id}
  `) as { playlist_id: number | null; sort_order: number }[];
  if (!current[0]) return { error: "Video not found." };
  // Blank order: keep it when staying put, go to the end when moving playlist.
  const order =
    v.sortOrder ??
    (current[0].playlist_id === v.playlistId ? current[0].sort_order : await nextOrder(v.playlistId));
  await sql`
    UPDATE library_videos
    SET playlist_id = ${v.playlistId}, title = ${v.title}, url = ${v.url},
      description = ${v.description}, sort_order = ${order}
    WHERE id = ${id}
  `;
  revalidate();
  return {};
}

export async function deleteLibraryVideo(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM library_videos WHERE id = ${id}`;
  revalidate();
  return {};
}
