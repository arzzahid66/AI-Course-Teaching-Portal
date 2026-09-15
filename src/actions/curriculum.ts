"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin } from "@/lib/auth";
import { iso, isoOrNull } from "@/lib/course";
import { normalizeUrl } from "@/lib/constants";
import { notifyStudent } from "@/lib/pushNotifications";
import { loadCurriculum, type Curriculum } from "@/lib/curriculum";

export async function getCurriculumAdmin(): Promise<Curriculum> {
  await assertAdmin();
  return loadCurriculum();
}

export async function updateLevel(level: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };
  await sql`
    UPDATE course_levels
    SET title = ${title},
      promise = ${String(formData.get("promise") ?? "").trim() || null},
      outcomes = ${String(formData.get("outcomes") ?? "").trim() || null}
    WHERE level = ${level}
  `;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function updateWeekend(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const text = (k: string) => String(formData.get(k) ?? "").trim() || null;
  const title = text("title");
  if (!title) return { error: "Title is required." };
  await sql`
    UPDATE weekends
    SET title = ${title}, ng_skill = ${text("ng_skill")}, tag = ${text("tag")},
      topics = ${text("topics")}, you_build = ${text("you_build")},
      homework = ${text("homework")}, slides = ${text("slides")}
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

function readVideoForm(formData: FormData) {
  const kind = String(formData.get("kind") ?? "topic");
  return {
    title: String(formData.get("title") ?? "").trim(),
    url: normalizeUrl(String(formData.get("url") ?? "")),
    kind: kind === "hands_on" || kind === "extra" ? kind : "topic",
    sortOrder: Number(formData.get("sort_order") || 0) || 0,
  };
}

export async function addVideo(weekendId: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const v = readVideoForm(formData);
  if (!v.title || !v.url) return { error: "Video title and link are required." };
  await sql`
    INSERT INTO weekend_videos (weekend_id, title, url, kind, sort_order)
    VALUES (${weekendId}, ${v.title}, ${v.url}, ${v.kind}, ${v.sortOrder})
  `;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function updateVideo(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const v = readVideoForm(formData);
  if (!v.title || !v.url) return { error: "Video title and link are required." };
  await sql`
    UPDATE weekend_videos
    SET title = ${v.title}, url = ${v.url}, kind = ${v.kind}, sort_order = ${v.sortOrder}
    WHERE id = ${id}
  `;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function deleteVideo(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM weekend_videos WHERE id = ${id}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

// ---------------------------------------------------------------------------
// Homework review
// ---------------------------------------------------------------------------
export type HomeworkRow = {
  id: number;
  enrollment_id: number;
  student_id: number;
  name: string;
  weekend_id: number;
  weekend_no: number;
  weekend_title: string;
  link_url: string;
  note: string | null;
  status: "submitted" | "needs_changes" | "approved";
  marks: number | null;
  feedback: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

export type HomeworkBoard = {
  submissions: HomeworkRow[];
  /** Per weekend whose homework is due: who has not submitted. */
  missing: { weekend_no: number; title: string; names: string[] }[];
};

export async function getHomeworkBoard(batchId: number): Promise<HomeworkBoard> {
  await assertAdmin();
  const [rows, missing] = await Promise.all([
    sql`
      SELECT h.id, h.enrollment_id, e.student_id, s.name, h.weekend_id, w.weekend_no,
        w.title AS weekend_title, h.link_url, h.note, h.status, h.marks, h.feedback,
        h.submitted_at, h.reviewed_at
      FROM homework_submissions h
      JOIN enrollments e ON e.id = h.enrollment_id
      JOIN students s ON s.id = e.student_id
      JOIN weekends w ON w.id = h.weekend_id
      WHERE e.batch_id = ${batchId}
      ORDER BY (h.marks IS NULL AND h.status = 'submitted') DESC, h.submitted_at DESC
    ` as unknown as Promise<(Omit<HomeworkRow, "submitted_at" | "reviewed_at"> & { submitted_at: Date; reviewed_at: Date | null })[]>,
    sql`
      SELECT w.weekend_no, w.title, array_agg(st.name ORDER BY st.name) AS names
      FROM sessions se
      JOIN weekends w ON w.id = se.weekend_id
      JOIN enrollments e ON e.batch_id = se.batch_id AND e.status = 'active'
      JOIN students st ON st.id = e.student_id
      WHERE se.batch_id = ${batchId}
        AND se.scheduled_at + interval '7 days' <= now()
        AND COALESCE(btrim(w.homework), '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM homework_submissions h
          WHERE h.enrollment_id = e.id AND h.weekend_id = w.id
        )
      GROUP BY w.weekend_no, w.title
      ORDER BY w.weekend_no
    ` as unknown as Promise<{ weekend_no: number; title: string; names: string[] }[]>,
  ]);
  return {
    submissions: rows.map((r) => ({
      ...r,
      submitted_at: iso(r.submitted_at),
      reviewed_at: isoOrNull(r.reviewed_at),
    })),
    missing,
  };
}

/** Mark a submission out of 10 and approve it or ask for changes; notifies the student. */
export async function reviewHomework(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const status = String(formData.get("status") ?? "");
  const marksRaw = String(formData.get("marks") ?? "").trim();
  const feedback = String(formData.get("feedback") ?? "").trim();
  if (status !== "approved" && status !== "needs_changes") return { error: "Pick approve or needs changes." };
  const marks = marksRaw === "" ? null : Math.round(Number(marksRaw));
  if (marks != null && (Number.isNaN(marks) || marks < 0 || marks > 10)) {
    return { error: "Marks must be between 0 and 10." };
  }
  if (status === "approved" && marks == null) return { error: "Give marks out of 10 to approve." };

  const rows = (await sql`
    UPDATE homework_submissions h
    SET status = ${status}, marks = ${marks}, feedback = ${feedback || null}, reviewed_at = now()
    FROM enrollments e, weekends w
    WHERE h.id = ${id} AND e.id = h.enrollment_id AND w.id = h.weekend_id
    RETURNING e.student_id, w.weekend_no
  `) as { student_id: number; weekend_no: number }[];

  const r = rows[0];
  if (r) {
    notifyStudent(r.student_id, {
      title:
        status === "approved"
          ? `Weekend ${r.weekend_no} homework: ${marks}/10`
          : `Weekend ${r.weekend_no} homework needs changes`,
      body: feedback ? feedback.slice(0, 100) : "Open the Homework tab to see the details.",
      url: "/portal",
    }).catch(() => {});
  }
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function deleteHomework(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM homework_submissions WHERE id = ${id}`;
  revalidatePath("/admin");
  return {};
}
