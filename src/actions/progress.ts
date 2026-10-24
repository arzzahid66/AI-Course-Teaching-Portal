"use server";

import { sql } from "@/lib/db";
import { assertAdmin } from "@/lib/auth";

/** Where one weekend's homework stands for the whole intake. */
export type WeekPhase = "upcoming" | "open" | "due";

/** One student's homework for one weekend. "missing" only once the homework is due. */
export type HomeworkCell = "approved" | "awaiting" | "needs_changes" | "missing" | "open" | "upcoming";

export type WeeklyBoard = {
  weeks: { weekend_id: number; weekend_no: number; title: string; phase: WeekPhase; hasHomework: boolean }[];
  quizzes: { id: number; title: string; pass_percent: number }[];
  students: { enrollment_id: number; student_id: number; name: string }[];
  /** key `${enrollment_id}:${weekend_id}` → the student's submission (absent = not submitted). */
  homework: Record<string, { status: "approved" | "awaiting" | "needs_changes"; marks: number | null }>;
  /** key `${quiz_id}:${student_id}` → best submitted percent (absent = not attempted). */
  quiz: Record<string, { best: number; passed: boolean }>;
};

/**
 * Week-by-week view of one intake: every student's homework per weekend and
 * best result per quiz, for the Progress tab's charts and grid. Homework opens
 * 7 days before its class and is due 7 days after it (same rule as the score).
 */
export async function getWeeklyBoard(batchId: number): Promise<WeeklyBoard> {
  await assertAdmin();
  const [weeks, quizzes, students, hw, qz] = await Promise.all([
    sql`
      SELECT w.id AS weekend_id, w.weekend_no, w.title,
        COALESCE(btrim(w.homework), '') <> '' AS "hasHomework",
        CASE
          WHEN MIN(s.scheduled_at) + interval '7 days' <= now() THEN 'due'
          WHEN MIN(s.scheduled_at) - interval '7 days' <= now() THEN 'open'
          ELSE 'upcoming'
        END AS phase
      FROM sessions s JOIN weekends w ON w.id = s.weekend_id
      WHERE s.batch_id = ${batchId}
      GROUP BY w.id
      ORDER BY w.weekend_no
    `,
    sql`
      SELECT q.id, q.title, q.pass_percent
      FROM quizzes q JOIN batches b ON b.id = ${batchId}
      WHERE q.is_published AND (q.level IS NULL OR q.level = b.level)
      ORDER BY q.sort_order, q.id
    `,
    sql`
      SELECT e.id AS enrollment_id, e.student_id, s.name
      FROM enrollments e JOIN students s ON s.id = e.student_id
      WHERE e.batch_id = ${batchId} AND e.status <> 'dropped'
      ORDER BY s.name
    `,
    sql`
      SELECT h.enrollment_id, h.weekend_id, h.status, h.marks
      FROM homework_submissions h JOIN enrollments e ON e.id = h.enrollment_id
      WHERE e.batch_id = ${batchId}
    `,
    sql`
      SELECT qa.quiz_id, qa.student_id, MAX(qa.percent)::int AS best
      FROM quiz_attempts qa JOIN enrollments e ON e.student_id = qa.student_id
      WHERE e.batch_id = ${batchId} AND qa.status = 'submitted'
      GROUP BY qa.quiz_id, qa.student_id
    `,
  ]);

  const quizList = quizzes as WeeklyBoard["quizzes"];
  const passMark = new Map(quizList.map((q) => [q.id, q.pass_percent]));

  const homework: WeeklyBoard["homework"] = {};
  for (const r of hw as { enrollment_id: number; weekend_id: number; status: string; marks: number | null }[]) {
    // Submitted but not marked yet is waiting on the tutor, whatever its status says.
    const status = r.status === "needs_changes" ? "needs_changes" : r.marks == null ? "awaiting" : "approved";
    homework[`${r.enrollment_id}:${r.weekend_id}`] = { status, marks: r.marks };
  }

  const quiz: WeeklyBoard["quiz"] = {};
  for (const r of qz as { quiz_id: number; student_id: number; best: number }[]) {
    if (!passMark.has(r.quiz_id)) continue;
    quiz[`${r.quiz_id}:${r.student_id}`] = { best: r.best, passed: r.best >= (passMark.get(r.quiz_id) ?? 0) };
  }

  return {
    weeks: weeks as WeeklyBoard["weeks"],
    quizzes: quizList,
    students: students as WeeklyBoard["students"],
    homework,
    quiz,
  };
}
