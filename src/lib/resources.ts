import "server-only";
import { sql } from "@/lib/db";
import { iso, isoOrNull } from "@/lib/course";

// ---------------------------------------------------------------------------
// Shared tools (the Claude Code Pro plan, the OpenAI API key) that students
// take turns on. This file holds the rules; `src/actions/resources.ts` holds
// the server actions that call them.
//
// Two things worth knowing:
//   * "only one student at a time" is a Postgres EXCLUDE constraint, not code
//     in here - see migrations/001_shared_resources.sql.
//   * a booking's live state (upcoming / active / finished) is derived from
//     now() on every read. There is no cron in this app, so nothing is stored
//     that would need a job to keep it true.
// ---------------------------------------------------------------------------

export type ResourceRow = {
  id: number;
  name: string;
  blurb: string | null;
  handover_note: string | null;
  max_minutes: number;
  cooldown_hours: number;
  book_ahead_days: number;
  is_active: boolean;
  sort_order: number;
};

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

/** Where an approved booking sits relative to right now. */
export type SlotState = "upcoming" | "active" | "finished";

export type RequestRow = {
  id: number;
  resource_id: number;
  resource_name: string;
  handover_note: string | null;
  student_id: number;
  student_name: string;
  student_email: string | null;
  reason: string;
  start_at: string;
  end_at: string;
  status: RequestStatus;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  /** Only meaningful when `status === "approved"`. */
  slot: SlotState;
};

export type LoginCodeRow = {
  id: number;
  request_id: number;
  asked_at: string;
  /** Withheld by the server unless the code is live and the caller owns it. */
  code: string | null;
  sent_at: string | null;
  expires_at: string | null;
  used_at: string | null;
};

export async function loadResources(activeOnly: boolean): Promise<ResourceRow[]> {
  const rows = (await sql`
    SELECT id, name, blurb, handover_note, max_minutes, cooldown_hours,
           book_ahead_days, is_active, sort_order
    FROM shared_resources
    WHERE (${!activeOnly} OR is_active = true)
    ORDER BY sort_order ASC, id ASC
  `) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    blurb: (r.blurb as string | null) ?? null,
    handover_note: (r.handover_note as string | null) ?? null,
    max_minutes: Number(r.max_minutes),
    cooldown_hours: Number(r.cooldown_hours),
    book_ahead_days: Number(r.book_ahead_days),
    is_active: Boolean(r.is_active),
    sort_order: Number(r.sort_order),
  }));
}

export async function loadResource(id: number): Promise<ResourceRow | null> {
  return (await loadResources(false)).find((r) => r.id === id) ?? null;
}

/**
 * Bookings with pending always on top - the same ordering the leave and quiz
 * boards use, so the tutor's eye lands in the same place on every board.
 */
export async function loadRequests(opts: {
  studentId?: number;
  sinceDays?: number;
}): Promise<RequestRow[]> {
  const studentId = opts.studentId ?? null;
  const sinceDays = opts.sinceDays ?? null;
  const rows = (await sql`
    SELECT r.id, r.resource_id, sr.name AS resource_name, sr.handover_note,
           r.student_id, s.name AS student_name, s.email AS student_email,
           r.reason, r.start_at, r.end_at, r.status, r.feedback,
           r.created_at, r.reviewed_at,
           (r.start_at > now())                       AS is_upcoming,
           (r.start_at <= now() AND now() < r.end_at) AS is_active
    FROM resource_requests r
    JOIN shared_resources sr ON sr.id = r.resource_id
    JOIN students s ON s.id = r.student_id
    WHERE (${studentId}::int IS NULL OR r.student_id = ${studentId})
      AND (${sinceDays}::int IS NULL
           OR r.end_at > now() - make_interval(days => ${sinceDays}::int))
    ORDER BY (r.status = 'pending') DESC, r.start_at DESC
  `) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: Number(r.id),
    resource_id: Number(r.resource_id),
    resource_name: String(r.resource_name),
    handover_note: (r.handover_note as string | null) ?? null,
    student_id: Number(r.student_id),
    student_name: String(r.student_name),
    student_email: (r.student_email as string | null) ?? null,
    reason: String(r.reason),
    start_at: iso(r.start_at),
    end_at: iso(r.end_at),
    status: r.status as RequestStatus,
    feedback: (r.feedback as string | null) ?? null,
    created_at: iso(r.created_at),
    reviewed_at: isoOrNull(r.reviewed_at),
    slot: r.is_active ? "active" : r.is_upcoming ? "upcoming" : "finished",
  }));
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/**
 * True when every fee month of the student's active enrollments is settled -
 * paid, or fully waived (a free seat counts as paid, since `amount - discount`
 * is then 0). A student with no enrollment at all is not eligible.
 *
 * Deliberately stricter than the rule that blocks check-in: an overdue student
 * cannot even reach the portal (see getAccountLock), so gating on "not
 * overdue" would let in everyone who can log in.
 */
export async function isFullyPaid(studentId: number): Promise<boolean> {
  const rows = (await sql`
    SELECT bool_and(
             GREATEST(0, i.amount - i.discount)
             <= COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id = i.id), 0)
           ) AS settled
    FROM fee_invoices i
    JOIN enrollments e ON e.id = i.enrollment_id
    WHERE e.student_id = ${studentId} AND e.status = 'active'
  `) as { settled: boolean | null }[];
  return rows[0]?.settled === true;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/**
 * Everything that must be true before a student may book this tool, checked in
 * the order that produces the most useful message. Re-run at approve time: a
 * student's fee status can change between asking and being approved.
 */
export async function checkEligibility(
  studentId: number,
  resource: ResourceRow
): Promise<Eligibility> {
  if (!resource.is_active) {
    return { ok: false, reason: `${resource.name} is not available right now.` };
  }

  if (!(await isFullyPaid(studentId))) {
    return { ok: false, reason: "Clear your remaining fee to unlock the shared tools." };
  }

  // One live booking per tool: a pending request, or one that has not ended yet.
  const held = (await sql`
    SELECT 1 FROM resource_requests
    WHERE student_id = ${studentId} AND resource_id = ${resource.id}
      AND status IN ('pending', 'approved') AND end_at > now()
    LIMIT 1
  `) as unknown[];
  if (held.length > 0) {
    return {
      ok: false,
      reason: `You already have a ${resource.name} booking waiting or running.`,
    };
  }

  // Cooldown, measured from the end of their last finished booking.
  const cool = (await sql`
    SELECT (MAX(end_at) + make_interval(hours => ${resource.cooldown_hours}::int)) > now()
             AS waiting,
           to_char(
             (MAX(end_at) + make_interval(hours => ${resource.cooldown_hours}::int))
               AT TIME ZONE 'Asia/Karachi',
             'Dy DD Mon, HH12:MI am'
           ) AS next_at
    FROM resource_requests
    WHERE student_id = ${studentId} AND resource_id = ${resource.id}
      AND status = 'approved' AND end_at <= now()
  `) as { waiting: boolean | null; next_at: string | null }[];
  if (cool[0]?.waiting === true) {
    return {
      ok: false,
      reason: `You can book ${resource.name} again after ${cool[0].next_at}.`,
    };
  }

  return { ok: true };
}

/**
 * Shape check on the requested window. The overlap rule is deliberately NOT
 * here - that is the database's job, so two approvals racing each other cannot
 * both win.
 */
export function validateWindow(
  resource: ResourceRow,
  startAt: Date,
  minutes: number
): { ok: true; endAt: Date } | { ok: false; reason: string } {
  if (Number.isNaN(startAt.getTime())) {
    return { ok: false, reason: "Pick a start time." };
  }
  // One minute of slack so "start now" does not fail on clock skew.
  if (startAt.getTime() < Date.now() - 60_000) {
    return { ok: false, reason: "Pick a start time in the future." };
  }
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { ok: false, reason: "Pick how long you need it for." };
  }
  if (minutes > resource.max_minutes) {
    const hours = resource.max_minutes / 60;
    return {
      ok: false,
      reason: `${resource.name} can be booked for at most ${hours} hours at a time.`,
    };
  }
  const daysAhead = (startAt.getTime() - Date.now()) / 86_400_000;
  if (daysAhead > resource.book_ahead_days) {
    return {
      ok: false,
      reason: `You can only book up to ${resource.book_ahead_days} days ahead.`,
    };
  }
  return { ok: true, endAt: new Date(startAt.getTime() + minutes * 60_000) };
}

/** True when a Postgres error is our no-overlap exclusion constraint firing. */
export function isOverlapViolation(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  return err?.code === "23P01" || (err?.message ?? "").includes("resource_no_overlap");
}

// ---------------------------------------------------------------------------
// View models
//
// These live here rather than in `src/actions/resources.ts` because a
// "use server" module may only export async functions - Next's action
// transform trips over anything else, including re-exported types.
// ---------------------------------------------------------------------------

/** One tool as the student's Tools tab sees it. */
export type StudentResourceView = {
  resource: ResourceRow;
  /** Why they cannot book right now, or null when they can. */
  blockedReason: string | null;
  /** Their own pending / upcoming / running booking for this tool. */
  mine: RequestRow | null;
  /** Busy windows for the next week, with no names attached. */
  busy: { start_at: string; end_at: string }[];
};

export type StudentResourceData = {
  tools: StudentResourceView[];
  history: RequestRow[];
};

/** Everything the admin Tools tab needs. */
export type ResourceBoard = {
  resources: ResourceRow[];
  requests: RequestRow[];
  /** Code requests still waiting on the tutor. */
  codeRequests: {
    id: number;
    request_id: number;
    asked_at: string;
    student_name: string;
    resource_name: string;
    start_at: string;
    end_at: string;
  }[];
};
