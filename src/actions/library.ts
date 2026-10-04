"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin, requireStudentId } from "@/lib/auth";
import { normalizeUrl } from "@/lib/constants";
import { queueBroadcastEmail } from "@/lib/email";

// ---------------------------------------------------------------------------
// Library — general videos every student can watch. Not tied to a weekend,
// level or intake, and not counted in the progress score.
// ---------------------------------------------------------------------------
export type LibraryVideo = {
  id: number;
  title: string;
  url: string;
  description: string | null;
  /** Free-text heading the portal groups by; null shows as "General". */
  category: string | null;
  sort_order: number;
};

async function loadLibrary(): Promise<LibraryVideo[]> {
  return (await sql`
    SELECT id, title, url, description, category, sort_order
    FROM library_videos
    ORDER BY lower(COALESCE(category, '')) ASC, sort_order ASC, id ASC
  `) as LibraryVideo[];
}

export async function getLibraryAdmin(): Promise<LibraryVideo[]> {
  await assertAdmin();
  return loadLibrary();
}

/** Every library video, for any signed-in student (enrolled or not). */
export async function getStudentLibrary(): Promise<LibraryVideo[]> {
  await requireStudentId();
  return loadLibrary();
}

function readForm(formData: FormData) {
  const text = (k: string) => String(formData.get(k) ?? "").trim();
  return {
    title: text("title"),
    url: normalizeUrl(text("url")),
    description: text("description") || null,
    category: text("category") || null,
    sortOrder: Number(formData.get("sort_order") || 0) || 0,
  };
}

function validate(v: ReturnType<typeof readForm>): string | null {
  if (!v.title || !v.url) return "Video title and link are required.";
  if (v.title.length > 200) return "Title is too long (max 200 characters).";
  if (v.description && v.description.length > 2000) return "Description is too long (max 2000 characters).";
  if (v.category && v.category.length > 60) return "Category is too long (max 60 characters).";
  return null;
}

export async function addLibraryVideo(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const v = readForm(formData);
  const err = validate(v);
  if (err) return { error: err };
  await sql`
    INSERT INTO library_videos (title, url, description, category, sort_order)
    VALUES (${v.title}, ${v.url}, ${v.description}, ${v.category}, ${v.sortOrder})
  `;
  if (formData.get("notify_email") === "on") {
    queueBroadcastEmail(
      { level: null },
      {
        subject: `New in the Library: ${v.title}`,
        heading: "A new video is in the Library",
        lines: [
          `"${v.title}" was added to the Library${v.category ? ` under ${v.category}` : ""}.`,
          v.description,
        ],
        link: { label: "Watch the video", url: v.url },
      }
    );
  }
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function updateLibraryVideo(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const v = readForm(formData);
  const err = validate(v);
  if (err) return { error: err };
  await sql`
    UPDATE library_videos
    SET title = ${v.title}, url = ${v.url}, description = ${v.description},
      category = ${v.category}, sort_order = ${v.sortOrder}
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function deleteLibraryVideo(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM library_videos WHERE id = ${id}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}
