"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireStudentId } from "@/lib/auth";
import { assertAdmin } from "@/lib/auth";
import {
  QUIZ_DEFAULT_MAX_ATTEMPTS,
  QUIZ_REATTEMPT_GRANT,
} from "@/lib/constants";
import { notifyAdmin, notifyStudent } from "@/lib/pushNotifications";

// ===========================================================================
// Shared helpers
// ===========================================================================

/** Fisher–Yates shuffle — returns a new array, leaves the input untouched. */
function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Finalize any of this student's attempts whose timer has run out but were never
 * submitted (student closed the tab, lost connection, etc.). They become a
 * submitted, failed attempt scored 0 — so an abandoned "Start" still correctly
 * counts against the 2-attempt limit and can never be reused to peek at the
 * questions. Called before we read attempt state anywhere.
 */
async function finalizeExpiredAttempts(studentId: number, quizId?: number): Promise<void> {
  if (quizId) {
    await sql`
      UPDATE quiz_attempts qa
      SET status = 'submitted',
          score = COALESCE(qa.score, 0),
          total = COALESCE(qa.total, array_length(qa.question_ids, 1),
                           (SELECT COUNT(*) FROM quiz_questions q WHERE q.quiz_id = qa.quiz_id)),
          percent = COALESCE(qa.percent, 0),
          passed = COALESCE(qa.passed, false),
          submitted_at = COALESCE(qa.submitted_at, qa.expires_at)
      WHERE qa.student_id = ${studentId}
        AND qa.quiz_id = ${quizId}
        AND qa.status = 'in_progress'
        AND qa.expires_at < now()
    `;
  } else {
    await sql`
      UPDATE quiz_attempts qa
      SET status = 'submitted',
          score = COALESCE(qa.score, 0),
          total = COALESCE(qa.total, array_length(qa.question_ids, 1),
                           (SELECT COUNT(*) FROM quiz_questions q WHERE q.quiz_id = qa.quiz_id)),
          percent = COALESCE(qa.percent, 0),
          passed = COALESCE(qa.passed, false),
          submitted_at = COALESCE(qa.submitted_at, qa.expires_at)
      WHERE qa.student_id = ${studentId}
        AND qa.status = 'in_progress'
        AND qa.expires_at < now()
    `;
  }
}

type AttemptStatRow = {
  id: number;
  status: "in_progress" | "submitted";
  passed: boolean | null;
  expires_at: string;
};

/**
 * The attempt bookkeeping for one student + quiz: how many attempts they've
 * used, how many they're allowed (base + approved re-attempt grants), whether
 * they've already passed, and any still-running attempt they can resume.
 * Assumes finalizeExpiredAttempts has already run.
 */
async function getAttemptStats(
  studentId: number,
  quizId: number
): Promise<{ used: number; allowed: number; passed: boolean; active: AttemptStatRow | null }> {
  const attempts = (await sql`
    SELECT id, status, passed, expires_at
    FROM quiz_attempts
    WHERE student_id = ${studentId} AND quiz_id = ${quizId}
    ORDER BY started_at ASC
  `) as AttemptStatRow[];

  const grantRows = (await sql`
    SELECT COALESCE(SUM(grant_attempts), 0) AS granted
    FROM quiz_reattempt_requests
    WHERE student_id = ${studentId} AND quiz_id = ${quizId} AND status = 'approved'
  `) as { granted: string }[];

  const quizRow = (await sql`
    SELECT max_attempts FROM quizzes WHERE id = ${quizId} LIMIT 1
  `) as { max_attempts: number }[];

  const maxA = Number(quizRow[0]?.max_attempts ?? QUIZ_DEFAULT_MAX_ATTEMPTS);
  const granted = Number(grantRows[0]?.granted ?? 0);
  const used = attempts.length;
  const allowed = maxA + granted;
  const passed = attempts.some((a) => a.passed === true);
  const active = attempts.find((a) => a.status === "in_progress") ?? null;
  return { used, allowed, passed, active };
}

// ===========================================================================
// STUDENT — list quizzes, attempt, submit, request a re-attempt
// ===========================================================================

export type StudentQuizAttempt = {
  percent: number;
  passed: boolean;
  submitted_at: string | null;
};

export type StudentQuiz = {
  id: number;
  title: string;
  description: string | null;
  timeLimitSec: number;
  passPercent: number;
  questionCount: number;
  attemptsUsed: number;
  attemptsAllowed: number;
  passed: boolean;
  lastPercent: number | null;
  canAttempt: boolean;
  blocked: boolean;
  hasPendingRequest: boolean;
  canRequest: boolean;
  activeAttemptId: number | null; // resume a running (non-expired) attempt
  attempts: StudentQuizAttempt[]; // submitted attempts, newest first
};

/**
 * All published quizzes with this student's per-quiz state (attempts used /
 * allowed, pass status, last score, whether they can start / are blocked / can
 * request a re-attempt) plus their submitted-attempt history. Answer keys are
 * never touched here. Imported by getPortalData.
 */
export async function getStudentQuizzes(): Promise<StudentQuiz[]> {
  const studentId = await requireStudentId();
  await finalizeExpiredAttempts(studentId);

  const quizzes = (await sql`
    SELECT
      q.id, q.title, q.description, q.time_limit_sec, q.pass_percent, q.max_attempts,
      q.questions_per_attempt,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count
    FROM quizzes q
    WHERE q.is_published = true
    ORDER BY q.sort_order ASC, q.id ASC
  `) as {
    id: number;
    title: string;
    description: string | null;
    time_limit_sec: number;
    pass_percent: number;
    max_attempts: number;
    questions_per_attempt: number;
    question_count: string;
  }[];

  if (quizzes.length === 0) return [];

  const attempts = (await sql`
    SELECT id, quiz_id, status, percent, passed, started_at, expires_at, submitted_at
    FROM quiz_attempts
    WHERE student_id = ${studentId}
    ORDER BY started_at ASC
  `) as {
    id: number;
    quiz_id: number;
    status: "in_progress" | "submitted";
    percent: number | null;
    passed: boolean | null;
    started_at: string;
    expires_at: string;
    submitted_at: string | null;
  }[];

  const grantRows = (await sql`
    SELECT quiz_id, COALESCE(SUM(grant_attempts), 0) AS granted
    FROM quiz_reattempt_requests
    WHERE student_id = ${studentId} AND status = 'approved'
    GROUP BY quiz_id
  `) as { quiz_id: number; granted: string }[];
  const grantMap = new Map(grantRows.map((r) => [r.quiz_id, Number(r.granted)]));

  const pendingRows = (await sql`
    SELECT DISTINCT quiz_id
    FROM quiz_reattempt_requests
    WHERE student_id = ${studentId} AND status = 'pending'
  `) as { quiz_id: number }[];
  const pendingSet = new Set(pendingRows.map((r) => r.quiz_id));

  return quizzes.map((q) => {
    const mine = attempts.filter((a) => a.quiz_id === q.id);
    const submitted = mine.filter((a) => a.status === "submitted");
    const poolCount = Number(q.question_count);
    const perAttempt = Number(q.questions_per_attempt);
    // How many questions the student actually gets: a random subset when the
    // tutor set a limit, otherwise the whole pool.
    const questionCount =
      perAttempt > 0 ? Math.min(perAttempt, poolCount) : poolCount;
    const used = mine.length;
    const allowed = Number(q.max_attempts) + (grantMap.get(q.id) ?? 0);
    const passed = submitted.some((a) => a.passed === true);
    const active = mine.find((a) => a.status === "in_progress") ?? null;
    const lastSubmitted = submitted[submitted.length - 1] ?? null;
    const blocked = !passed && used >= allowed;
    const hasPendingRequest = pendingSet.has(q.id);

    return {
      id: q.id,
      title: q.title,
      description: q.description,
      timeLimitSec: Number(q.time_limit_sec),
      passPercent: Number(q.pass_percent),
      questionCount,
      attemptsUsed: used,
      attemptsAllowed: allowed,
      passed,
      lastPercent: lastSubmitted?.percent != null ? Number(lastSubmitted.percent) : null,
      canAttempt: !passed && used < allowed && !active && questionCount > 0,
      blocked,
      hasPendingRequest,
      canRequest: blocked && !hasPendingRequest,
      activeAttemptId: active?.id ?? null,
      attempts: submitted
        .map((a) => ({
          percent: a.percent != null ? Number(a.percent) : 0,
          passed: a.passed === true,
          submitted_at: a.submitted_at,
        }))
        .reverse(),
    };
  });
}

export type QuizAttemptQuestion = {
  id: number;
  body: string;
  options: { id: number; body: string }[];
};

export type StartQuizResult =
  | {
      ok: true;
      attemptId: number;
      expiresAt: string;
      timeLimitSec: number;
      passPercent: number;
      title: string;
      questions: QuizAttemptQuestion[];
    }
  | { ok: false; error: string };

/**
 * Begin (or resume) an attempt. Starting consumes an attempt immediately. The
 * questions + options returned to the client NEVER include is_correct — scoring
 * happens only in submitQuizAttempt on the server.
 */
export async function startQuizAttempt(quizId: number): Promise<StartQuizResult> {
  const studentId = await requireStudentId();
  await finalizeExpiredAttempts(studentId, quizId);

  const quizRows = (await sql`
    SELECT id, title, time_limit_sec, pass_percent, questions_per_attempt, is_published
    FROM quizzes WHERE id = ${quizId} LIMIT 1
  `) as {
    id: number;
    title: string;
    time_limit_sec: number;
    pass_percent: number;
    questions_per_attempt: number;
    is_published: boolean;
  }[];
  const quiz = quizRows[0];
  if (!quiz || !quiz.is_published) {
    return { ok: false, error: "This quiz is not available." };
  }

  const timeLimitSec = Number(quiz.time_limit_sec);
  const stats = await getAttemptStats(studentId, quizId);

  // Resume an already-running attempt instead of burning another one — reload
  // the exact same question set (stored on the attempt) so nothing changes.
  if (stats.active) {
    const storedRows = (await sql`
      SELECT question_ids FROM quiz_attempts WHERE id = ${stats.active.id} LIMIT 1
    `) as { question_ids: number[] | null }[];
    const storedIds = storedRows[0]?.question_ids ?? [];
    const ids = storedIds.length > 0 ? storedIds : await getQuizQuestionIds(quizId);
    return {
      ok: true,
      attemptId: stats.active.id,
      expiresAt: stats.active.expires_at,
      timeLimitSec,
      passPercent: Number(quiz.pass_percent),
      title: quiz.title,
      questions: await loadQuestionsByIds(ids),
    };
  }

  if (stats.passed) {
    return { ok: false, error: "You've already passed this quiz." };
  }
  if (stats.used >= stats.allowed) {
    return {
      ok: false,
      error: "You've used all your attempts. Request a re-attempt from your tutor.",
    };
  }

  // Pick this attempt's questions: shuffle the whole pool, then take the first
  // N when the tutor capped it (questions_per_attempt > 0). Random every time.
  const poolIds = await getQuizQuestionIds(quizId);
  if (poolIds.length === 0) {
    return { ok: false, error: "This quiz has no questions yet." };
  }
  const perAttempt = Number(quiz.questions_per_attempt);
  let servedIds = shuffle(poolIds);
  if (perAttempt > 0 && perAttempt < servedIds.length) {
    servedIds = servedIds.slice(0, perAttempt);
  }

  const expiresAt = new Date(Date.now() + timeLimitSec * 1000).toISOString();
  const inserted = (await sql`
    INSERT INTO quiz_attempts (quiz_id, student_id, status, expires_at, question_ids)
    VALUES (${quizId}, ${studentId}, 'in_progress', ${expiresAt}, ${servedIds}::int[])
    RETURNING id
  `) as { id: number }[];

  return {
    ok: true,
    attemptId: inserted[0].id,
    expiresAt,
    timeLimitSec,
    passPercent: Number(quiz.pass_percent),
    title: quiz.title,
    questions: await loadQuestionsByIds(servedIds),
  };
}

/** All question ids for a quiz, in author order. */
async function getQuizQuestionIds(quizId: number): Promise<number[]> {
  const rows = (await sql`
    SELECT id FROM quiz_questions WHERE quiz_id = ${quizId} ORDER BY sort_order ASC, id ASC
  `) as { id: number }[];
  return rows.map((r) => r.id);
}

/**
 * Load the given questions (in the given order) with their options for a student
 * — WITHOUT the answer key. Options are shuffled so their position varies too.
 */
async function loadQuestionsByIds(ids: number[]): Promise<QuizAttemptQuestion[]> {
  if (ids.length === 0) return [];

  const questions = (await sql`
    SELECT id, body FROM quiz_questions WHERE id = ANY(${ids}::int[])
  `) as { id: number; body: string }[];
  const options = (await sql`
    SELECT id, question_id, body FROM quiz_options
    WHERE question_id = ANY(${ids}::int[])
    ORDER BY sort_order ASC, id ASC
  `) as { id: number; question_id: number; body: string }[];

  const byId = new Map(questions.map((q) => [q.id, q]));
  // Preserve the requested order; drop any ids that no longer exist.
  return ids
    .filter((id) => byId.has(id))
    .map((id) => ({
      id,
      body: byId.get(id)!.body,
      options: shuffle(
        options.filter((o) => o.question_id === id).map((o) => ({ id: o.id, body: o.body }))
      ),
    }));
}

/** One option as shown on the post-submit review screen. */
export type QuizReviewOption = {
  id: number;
  body: string;
  isCorrect: boolean; // part of the answer key
  selected: boolean; // the student picked this one
};

/** One question on the post-submit review screen. */
export type QuizReviewQuestion = {
  id: number;
  body: string;
  correct: boolean; // did the student get this question right
  options: QuizReviewOption[];
};

export type SubmitQuizResult =
  | {
      ok: true;
      score: number;
      total: number;
      percent: number;
      passed: boolean;
      passPercent: number;
      review: QuizReviewQuestion[];
    }
  | { ok: false; error: string };

/**
 * Score and finalize an attempt. `answers` maps each question to the option ids
 * the student selected. A question is correct only when the selected set matches
 * the correct set EXACTLY (all correct chosen, nothing wrong chosen).
 */
export async function submitQuizAttempt(
  attemptId: number,
  answers: { questionId: number; optionIds: number[] }[]
): Promise<SubmitQuizResult> {
  const studentId = await requireStudentId();

  const attemptRows = (await sql`
    SELECT a.id, a.quiz_id, a.status, a.score, a.total, a.percent, a.passed,
           a.question_ids, q.pass_percent
    FROM quiz_attempts a
    JOIN quizzes q ON q.id = a.quiz_id
    WHERE a.id = ${attemptId} AND a.student_id = ${studentId}
    LIMIT 1
  `) as {
    id: number;
    quiz_id: number;
    status: "in_progress" | "submitted";
    score: number | null;
    total: number | null;
    percent: number | null;
    passed: boolean | null;
    question_ids: number[] | null;
    pass_percent: number;
  }[];
  const attempt = attemptRows[0];
  if (!attempt) return { ok: false, error: "Attempt not found." };

  // Score ONLY the questions actually served for this attempt. Fall back to the
  // whole pool for older attempts saved before question_ids existed.
  const servedIds =
    attempt.question_ids && attempt.question_ids.length > 0
      ? attempt.question_ids
      : await getQuizQuestionIds(attempt.quiz_id);
  const total = servedIds.length;

  // Load the served questions + ALL their options (with the answer key) so we
  // can both score the attempt and build a review the student can learn from.
  const questionRows = (await sql`
    SELECT id, body FROM quiz_questions WHERE id = ANY(${servedIds}::int[])
  `) as { id: number; body: string }[];
  const questionById = new Map(questionRows.map((q) => [q.id, q.body]));

  const optionRows = (await sql`
    SELECT id, question_id, body, is_correct FROM quiz_options
    WHERE question_id = ANY(${servedIds}::int[])
    ORDER BY sort_order ASC, id ASC
  `) as { id: number; question_id: number; body: string; is_correct: boolean }[];

  const correctByQuestion = new Map<number, Set<number>>();
  for (const o of optionRows) {
    if (!o.is_correct) continue;
    if (!correctByQuestion.has(o.question_id)) correctByQuestion.set(o.question_id, new Set());
    correctByQuestion.get(o.question_id)!.add(o.id);
  }

  const answerByQuestion = new Map<number, Set<number>>();
  for (const a of answers) {
    answerByQuestion.set(a.questionId, new Set(a.optionIds));
  }

  // A question is correct only when the chosen set matches the correct set
  // EXACTLY (all correct chosen, nothing wrong chosen).
  const isQuestionCorrect = (qid: number): boolean => {
    const correct = correctByQuestion.get(qid);
    if (!correct || correct.size === 0) return false; // misconfigured question
    const chosen = answerByQuestion.get(qid) ?? new Set<number>();
    if (chosen.size !== correct.size) return false;
    for (const id of chosen) if (!correct.has(id)) return false;
    return true;
  };

  // Review, in the same order the student saw the questions.
  const review: QuizReviewQuestion[] = servedIds
    .filter((qid) => questionById.has(qid))
    .map((qid) => {
      const chosen = answerByQuestion.get(qid) ?? new Set<number>();
      return {
        id: qid,
        body: questionById.get(qid)!,
        correct: isQuestionCorrect(qid),
        options: optionRows
          .filter((o) => o.question_id === qid)
          .map((o) => ({
            id: o.id,
            body: o.body,
            isCorrect: o.is_correct,
            selected: chosen.has(o.id),
          })),
      };
    });

  // Idempotent: if it was already finalized (e.g. auto-submitted on timeout),
  // return the stored score — but still include the review to learn from.
  if (attempt.status === "submitted") {
    return {
      ok: true,
      score: Number(attempt.score ?? 0),
      total: Number(attempt.total ?? 0),
      percent: Number(attempt.percent ?? 0),
      passed: attempt.passed === true,
      passPercent: Number(attempt.pass_percent),
      review,
    };
  }

  let score = 0;
  for (const qid of servedIds) {
    if (isQuestionCorrect(qid)) score += 1;
  }

  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const passed = percent >= Number(attempt.pass_percent);

  try {
    await sql`
      UPDATE quiz_attempts
      SET status = 'submitted', score = ${score}, total = ${total},
          percent = ${percent}, passed = ${passed}, submitted_at = now()
      WHERE id = ${attemptId}
    `;
  } catch {
    return { ok: false, error: "Could not save your attempt. Please try again." };
  }

  return { ok: true, score, total, percent, passed, passPercent: Number(attempt.pass_percent), review };
}

/** Ask the tutor for another 2 attempts after failing all of them. */
export async function requestQuizReattempt(quizId: number): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  await finalizeExpiredAttempts(studentId, quizId);

  const stats = await getAttemptStats(studentId, quizId);
  if (stats.passed) return { error: "You've already passed this quiz." };
  if (stats.used < stats.allowed) {
    return { error: "You still have attempts left — no request needed." };
  }

  const pending = (await sql`
    SELECT 1 FROM quiz_reattempt_requests
    WHERE student_id = ${studentId} AND quiz_id = ${quizId} AND status = 'pending'
    LIMIT 1
  `) as unknown[];
  if (pending.length > 0) {
    return { error: "You already have a re-attempt request waiting." };
  }

  const quizRows = (await sql`SELECT title FROM quizzes WHERE id = ${quizId} LIMIT 1`) as {
    title: string;
  }[];

  try {
    await sql`
      INSERT INTO quiz_reattempt_requests (quiz_id, student_id, grant_attempts)
      VALUES (${quizId}, ${studentId}, ${QUIZ_REATTEMPT_GRANT})
    `;
  } catch {
    return { error: "Could not send your request. Please try again." };
  }

  notifyAdmin({
    title: "Quiz re-attempt request",
    body: quizRows[0]?.title
      ? `A student wants to re-attempt "${quizRows[0].title}".`
      : "A student wants to re-attempt a quiz.",
    url: "/admin",
  }).catch(() => {});

  return {};
}

// ===========================================================================
// ADMIN — author quizzes, review re-attempt requests, view scores
// ===========================================================================

export type AdminQuizRow = {
  id: number;
  title: string;
  description: string | null;
  time_limit_sec: number;
  pass_percent: number;
  max_attempts: number;
  questions_per_attempt: number;
  is_published: boolean;
  sort_order: number;
  question_count: number;
  attempt_count: number;
};

export async function getQuizzesAdmin(): Promise<AdminQuizRow[]> {
  await assertAdmin();
  const rows = (await sql`
    SELECT
      q.id, q.title, q.description, q.time_limit_sec, q.pass_percent, q.max_attempts,
      q.questions_per_attempt, q.is_published, q.sort_order,
      (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
      (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.status = 'submitted') AS attempt_count
    FROM quizzes q
    ORDER BY q.sort_order ASC, q.id ASC
  `) as (Omit<AdminQuizRow, "question_count" | "attempt_count"> & {
    question_count: string;
    attempt_count: string;
  })[];
  return rows.map((r) => ({
    ...r,
    question_count: Number(r.question_count),
    attempt_count: Number(r.attempt_count),
  }));
}

export type AdminQuizOption = { id: number; body: string; is_correct: boolean };
export type AdminQuizQuestion = { id: number; body: string; options: AdminQuizOption[] };
export type QuizDetail = {
  id: number;
  title: string;
  description: string | null;
  time_limit_sec: number;
  pass_percent: number;
  max_attempts: number;
  questions_per_attempt: number;
  is_published: boolean;
  sort_order: number;
  questions: AdminQuizQuestion[];
};

export async function getQuizDetail(quizId: number): Promise<QuizDetail | null> {
  await assertAdmin();
  const quizRows = (await sql`
    SELECT id, title, description, time_limit_sec, pass_percent, max_attempts,
           questions_per_attempt, is_published, sort_order
    FROM quizzes WHERE id = ${quizId} LIMIT 1
  `) as Omit<QuizDetail, "questions">[];
  const quiz = quizRows[0];
  if (!quiz) return null;

  const questions = (await sql`
    SELECT id, body FROM quiz_questions
    WHERE quiz_id = ${quizId}
    ORDER BY sort_order ASC, id ASC
  `) as { id: number; body: string }[];

  let options: { id: number; question_id: number; body: string; is_correct: boolean }[] = [];
  if (questions.length > 0) {
    const qIds = questions.map((q) => q.id);
    options = (await sql`
      SELECT id, question_id, body, is_correct FROM quiz_options
      WHERE question_id = ANY(${qIds})
      ORDER BY sort_order ASC, id ASC
    `) as { id: number; question_id: number; body: string; is_correct: boolean }[];
  }

  return {
    ...quiz,
    questions: questions.map((q) => ({
      id: q.id,
      body: q.body,
      options: options
        .filter((o) => o.question_id === q.id)
        .map((o) => ({ id: o.id, body: o.body, is_correct: o.is_correct })),
    })),
  };
}

/** Read + validate the shared quiz-settings fields from a submitted form. */
function readQuizForm(formData: FormData): {
  title: string;
  description: string | null;
  timeLimitSec: number;
  passPercent: number;
  maxAttempts: number;
  questionsPerAttempt: number;
  isPublished: boolean;
  sortOrder: number;
  error?: string;
} {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const minutes = Number(formData.get("time_limit_min"));
  const passPercent = Number(formData.get("pass_percent"));
  const maxAttempts = Number(formData.get("max_attempts"));
  const perAttemptRaw = Number(formData.get("questions_per_attempt"));
  const sortOrder = Number(formData.get("sort_order"));
  const isPublished = formData.get("is_published") === "on" || formData.get("is_published") === "true";

  let error: string | undefined;
  if (!title) error = "Title is required.";
  else if (!minutes || Number.isNaN(minutes) || minutes <= 0) error = "Enter a time limit in minutes.";
  else if (Number.isNaN(passPercent) || passPercent < 0 || passPercent > 100)
    error = "Pass mark must be between 0 and 100.";
  else if (!maxAttempts || Number.isNaN(maxAttempts) || maxAttempts < 1)
    error = "Attempts must be at least 1.";
  else if (!Number.isNaN(perAttemptRaw) && perAttemptRaw < 0)
    error = "Questions per attempt can't be negative (use 0 for all).";

  return {
    title,
    description: description || null,
    timeLimitSec: Math.round((Number.isNaN(minutes) ? 0 : minutes) * 60),
    passPercent: Number.isNaN(passPercent) ? 0 : passPercent,
    maxAttempts: Number.isNaN(maxAttempts) ? QUIZ_DEFAULT_MAX_ATTEMPTS : maxAttempts,
    questionsPerAttempt: Number.isNaN(perAttemptRaw) || perAttemptRaw < 0 ? 0 : Math.floor(perAttemptRaw),
    isPublished,
    sortOrder: Number.isNaN(sortOrder) ? 0 : sortOrder,
    error,
  };
}

export async function createQuiz(formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const f = readQuizForm(formData);
  if (f.error) return { error: f.error };
  try {
    await sql`
      INSERT INTO quizzes (title, description, time_limit_sec, pass_percent, max_attempts, questions_per_attempt, is_published, sort_order)
      VALUES (${f.title}, ${f.description}, ${f.timeLimitSec}, ${f.passPercent}, ${f.maxAttempts}, ${f.questionsPerAttempt}, ${f.isPublished}, ${f.sortOrder})
    `;
  } catch (e) {
    return { error: e instanceof Error ? `Could not create: ${e.message}` : "Could not create quiz." };
  }
  revalidatePath("/admin");
  return {};
}

export async function updateQuiz(id: number, formData: FormData): Promise<{ error?: string }> {
  await assertAdmin();
  const f = readQuizForm(formData);
  if (f.error) return { error: f.error };
  try {
    await sql`
      UPDATE quizzes
      SET title = ${f.title}, description = ${f.description}, time_limit_sec = ${f.timeLimitSec},
          pass_percent = ${f.passPercent}, max_attempts = ${f.maxAttempts},
          questions_per_attempt = ${f.questionsPerAttempt},
          is_published = ${f.isPublished}, sort_order = ${f.sortOrder}
      WHERE id = ${id}
    `;
  } catch (e) {
    return { error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save quiz." };
  }
  revalidatePath("/admin");
  return {};
}

/** Toggle publish without opening the full editor. */
export async function setQuizPublished(id: number, published: boolean): Promise<void> {
  await assertAdmin();
  await sql`UPDATE quizzes SET is_published = ${published} WHERE id = ${id}`;
  revalidatePath("/admin");
}

export async function deleteQuiz(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    // Questions, options, attempts and re-attempt requests all cascade on the
    // quizzes FK, so removing the quiz row is enough.
    await sql`DELETE FROM quizzes WHERE id = ${id}`;
  } catch (e) {
    return { error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete quiz." };
  }
  revalidatePath("/admin");
  return {};
}

/**
 * Create or update a question AND (re)set its options in one call. The client
 * sends the option list as JSON in `options_json`: [{ body, correct }]. On an
 * update we delete the old options and re-insert, so editing is atomic from the
 * admin's point of view (no per-option CRUD).
 */
export async function saveQuestion(
  quizId: number,
  questionId: number | null,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write the question first." };

  let options: { body: string; correct: boolean }[];
  try {
    const raw = JSON.parse(String(formData.get("options_json") ?? "[]"));
    options = (Array.isArray(raw) ? raw : [])
      .map((o: { body?: unknown; correct?: unknown }) => ({
        body: String(o?.body ?? "").trim(),
        correct: o?.correct === true,
      }))
      .filter((o) => o.body.length > 0);
  } catch {
    return { error: "Could not read the options." };
  }

  if (options.length < 2) return { error: "Add at least two options." };
  if (!options.some((o) => o.correct)) return { error: "Mark at least one option correct." };

  try {
    let qId = questionId;
    if (qId == null) {
      const orderRows = (await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM quiz_questions WHERE quiz_id = ${quizId}
      `) as { next: number }[];
      const nextOrder = Number(orderRows[0]?.next ?? 0);
      const inserted = (await sql`
        INSERT INTO quiz_questions (quiz_id, body, sort_order)
        VALUES (${quizId}, ${body}, ${nextOrder})
        RETURNING id
      `) as { id: number }[];
      qId = inserted[0].id;
    } else {
      await sql`UPDATE quiz_questions SET body = ${body} WHERE id = ${qId} AND quiz_id = ${quizId}`;
      await sql`DELETE FROM quiz_options WHERE question_id = ${qId}`;
    }

    for (let i = 0; i < options.length; i++) {
      const o = options[i];
      await sql`
        INSERT INTO quiz_options (question_id, body, is_correct, sort_order)
        VALUES (${qId}, ${o.body}, ${o.correct}, ${i})
      `;
    }
  } catch (e) {
    return { error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save question." };
  }
  revalidatePath("/admin");
  return {};
}

export async function deleteQuizQuestion(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM quiz_questions WHERE id = ${id}`;
  } catch (e) {
    return { error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete question." };
  }
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Re-attempt requests (mirror of the Leave review actions)
// ---------------------------------------------------------------------------
export type QuizReattemptRow = {
  id: number;
  quiz_id: number;
  quiz_title: string;
  student_id: number;
  student_name: string;
  student_email: string | null;
  status: "pending" | "approved" | "rejected";
  grant_attempts: number;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export async function getQuizReattemptRequests(): Promise<QuizReattemptRow[]> {
  await assertAdmin();
  return (await sql`
    SELECT
      r.id, r.quiz_id, q.title AS quiz_title,
      r.student_id, s.name AS student_name, s.email AS student_email,
      r.status, r.grant_attempts, r.feedback, r.created_at, r.reviewed_at
    FROM quiz_reattempt_requests r
    JOIN students s ON s.id = r.student_id
    JOIN quizzes  q ON q.id = r.quiz_id
    ORDER BY (r.status = 'pending') DESC, r.created_at DESC
  `) as QuizReattemptRow[];
}

export async function reviewQuizReattemptRequest(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();
  const status = String(formData.get("status") ?? "").trim();
  const feedback = String(formData.get("feedback") ?? "").trim();

  if (status !== "approved" && status !== "rejected" && status !== "pending") {
    return { error: "Pick approve or reject." };
  }

  try {
    const rows = (await sql`
      UPDATE quiz_reattempt_requests
      SET status = ${status},
          feedback = ${feedback || null},
          reviewed_at = CASE WHEN ${status} = 'pending' THEN NULL ELSE now() END
      WHERE id = ${id}
      RETURNING student_id, quiz_id
    `) as { student_id: number; quiz_id: number }[];

    const r = rows[0];
    if (r?.student_id && status !== "pending") {
      const titleRows = (await sql`SELECT title FROM quizzes WHERE id = ${r.quiz_id} LIMIT 1`) as {
        title: string;
      }[];
      const quizTitle = titleRows[0]?.title ?? "the quiz";
      notifyStudent(r.student_id, {
        title: status === "approved" ? "Re-attempt approved ✅" : "Re-attempt rejected ❌",
        body:
          status === "approved"
            ? `You can attempt "${quizTitle}" again.` + (feedback ? ` Note: ${feedback.slice(0, 80)}` : "")
            : `Your re-attempt for "${quizTitle}" was declined.` +
              (feedback ? ` Note: ${feedback.slice(0, 80)}` : ""),
        url: "/portal",
      }).catch(() => {});
    }
  } catch (e) {
    return { error: e instanceof Error ? `Could not save: ${e.message}` : "Could not save review." };
  }
  revalidatePath("/admin");
  return {};
}

export async function deleteQuizReattemptRequest(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  try {
    await sql`DELETE FROM quiz_reattempt_requests WHERE id = ${id}`;
  } catch (e) {
    return { error: e instanceof Error ? `Could not delete: ${e.message}` : "Could not delete request." };
  }
  revalidatePath("/admin");
  return {};
}

// ---------------------------------------------------------------------------
// Scores — the gradebook grid + a per-quiz drill-down
// ---------------------------------------------------------------------------
export type QuizScoreboard = {
  quizzes: { id: number; title: string }[];
  students: { id: number; name: string }[];
  // key `${quizId}:${studentId}`
  scores: Record<string, { lastPercent: number; passed: boolean; attemptsUsed: number }>;
};

export async function getQuizScoreboard(): Promise<QuizScoreboard> {
  await assertAdmin();

  const quizzes = (await sql`
    SELECT id, title FROM quizzes ORDER BY sort_order ASC, id ASC
  `) as { id: number; title: string }[];

  const students = (await sql`
    SELECT id, name FROM students WHERE status = 'active' ORDER BY name ASC
  `) as { id: number; name: string }[];

  // All attempts (any status) — we derive the latest submitted score and the
  // total attempts used per (quiz, student) in one pass.
  const attempts = (await sql`
    SELECT quiz_id, student_id, status, percent, passed, started_at
    FROM quiz_attempts
    ORDER BY started_at ASC
  `) as {
    quiz_id: number;
    student_id: number;
    status: "in_progress" | "submitted";
    percent: number | null;
    passed: boolean | null;
    started_at: string;
  }[];

  const scores: QuizScoreboard["scores"] = {};
  for (const a of attempts) {
    const key = `${a.quiz_id}:${a.student_id}`;
    const cur = scores[key] ?? { lastPercent: 0, passed: false, attemptsUsed: 0 };
    cur.attemptsUsed += 1;
    if (a.status === "submitted") {
      // attempts are ordered by started_at ASC, so the last one seen wins.
      cur.lastPercent = a.percent != null ? Number(a.percent) : 0;
      if (a.passed === true) cur.passed = true;
    }
    scores[key] = cur;
  }

  return { quizzes, students, scores };
}

export type QuizResultRow = {
  student_id: number;
  name: string;
  email: string | null;
  lastPercent: number | null;
  attemptsUsed: number;
  attemptsAllowed: number;
  passed: boolean;
  blocked: boolean;
};

/** Per-student results for ONE quiz (shown inside the quiz editor). */
export async function getQuizResults(quizId: number): Promise<QuizResultRow[]> {
  await assertAdmin();

  const quizRows = (await sql`SELECT max_attempts FROM quizzes WHERE id = ${quizId} LIMIT 1`) as {
    max_attempts: number;
  }[];
  const maxA = Number(quizRows[0]?.max_attempts ?? QUIZ_DEFAULT_MAX_ATTEMPTS);

  const students = (await sql`
    SELECT id, name, email FROM students WHERE status = 'active' ORDER BY name ASC
  `) as { id: number; name: string; email: string | null }[];

  const attempts = (await sql`
    SELECT student_id, status, percent, passed, started_at
    FROM quiz_attempts WHERE quiz_id = ${quizId}
    ORDER BY started_at ASC
  `) as {
    student_id: number;
    status: "in_progress" | "submitted";
    percent: number | null;
    passed: boolean | null;
    started_at: string;
  }[];

  const grants = (await sql`
    SELECT student_id, COALESCE(SUM(grant_attempts), 0) AS granted
    FROM quiz_reattempt_requests
    WHERE quiz_id = ${quizId} AND status = 'approved'
    GROUP BY student_id
  `) as { student_id: number; granted: string }[];
  const grantMap = new Map(grants.map((g) => [g.student_id, Number(g.granted)]));

  return students.map((s) => {
    const mine = attempts.filter((a) => a.student_id === s.id);
    const submitted = mine.filter((a) => a.status === "submitted");
    const used = mine.length;
    const allowed = maxA + (grantMap.get(s.id) ?? 0);
    const passed = submitted.some((a) => a.passed === true);
    const last = submitted[submitted.length - 1] ?? null;
    return {
      student_id: s.id,
      name: s.name,
      email: s.email,
      lastPercent: last?.percent != null ? Number(last.percent) : null,
      attemptsUsed: used,
      attemptsAllowed: allowed,
      passed,
      blocked: !passed && used >= allowed,
    };
  });
}
