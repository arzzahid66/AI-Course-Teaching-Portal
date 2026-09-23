"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { assertAdmin, requireStudentId } from "@/lib/auth";
import { iso, isoOrNull } from "@/lib/course";
import {
  checkEligibility,
  hasStartedPaying,
  isOverlapViolation,
  loadRequests,
  loadResource,
  loadResources,
  validateWindow,
  type LoginCodeRow,
  type ResourceBoard,
  type StudentResourceData,
  type StudentResourceView,
} from "@/lib/resources";
import { notifyAdmin, notifyStudent } from "@/lib/pushNotifications";
import { adminUrl, fmtClassTime, queueAdminEmail, queueStudentEmail } from "@/lib/email";
import {
  LOGIN_CODE_MAX_PER_SLOT,
  LOGIN_CODE_TTL_MIN,
  RESOURCE_DEFAULT_AHEAD_DAYS,
  RESOURCE_DEFAULT_COOLDOWN_H,
  RESOURCE_DEFAULT_MAX_MIN,
} from "@/lib/constants";

/**
 * Null out codes that have run past their window. There is no cron in this
 * app, so this runs at the top of the read paths instead - the same
 * lazy-sweep approach `finalizeExpiredAttempts` uses for quiz attempts.
 */
async function scrubExpiredCodes(): Promise<void> {
  await sql`
    UPDATE resource_login_codes
    SET code = NULL
    WHERE code IS NOT NULL AND expires_at IS NOT NULL AND expires_at <= now()
  `;
}

// ===========================================================================
// STUDENT
// ===========================================================================

export async function getStudentResources(): Promise<StudentResourceData> {
  const studentId = await requireStudentId();
  await scrubExpiredCodes();

  const [resources, mine] = await Promise.all([
    loadResources(true),
    loadRequests({ studentId }),
  ]);

  // Other people's approved windows for the next week. The student's own
  // booking is excluded: it already has its own card above, and listing it
  // again under "Already booked" reads like someone else took the slot.
  const busy = (await sql`
    SELECT resource_id, start_at, end_at
    FROM resource_requests
    WHERE status = 'approved'
      AND student_id <> ${studentId}
      AND end_at > now()
      AND start_at < now() + make_interval(days => 7)
    ORDER BY start_at ASC
  `) as Record<string, unknown>[];

  const tools: StudentResourceView[] = [];
  for (const resource of resources) {
    const eligibility = await checkEligibility(studentId, resource);
    const live =
      mine.find(
        (r) =>
          r.resource_id === resource.id &&
          (r.status === "pending" || (r.status === "approved" && r.slot !== "finished"))
      ) ?? null;
    tools.push({
      resource,
      // A student holding a live booking is "blocked" from booking again, but
      // that is not a problem to show them - their booking is the answer.
      blockedReason: live || eligibility.ok ? null : eligibility.reason,
      mine: live,
      busy: busy
        .filter((b) => Number(b.resource_id) === resource.id)
        .map((b) => ({ start_at: iso(b.start_at), end_at: iso(b.end_at) })),
    });
  }

  return {
    tools,
    history: mine.filter((r) => !tools.some((t) => t.mine?.id === r.id)).slice(0, 20),
  };
}

export async function requestResource(formData: FormData): Promise<{ error?: string }> {
  const studentId = await requireStudentId();

  const resourceId = Number(formData.get("resource_id"));
  const resource = await loadResource(resourceId);
  if (!resource) return { error: "That tool no longer exists." };

  const eligibility = await checkEligibility(studentId, resource);
  if (!eligibility.ok) return { error: eligibility.reason };

  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 10) {
    return { error: "Tell your tutor what you will use it for (at least a sentence)." };
  }

  const startAt = new Date(String(formData.get("start_at") ?? ""));
  const window = validateWindow(resource, startAt, Number(formData.get("minutes")));
  if (!window.ok) return { error: window.reason };

  const startIso = startAt.toISOString();
  const endIso = window.endAt.toISOString();

  // Friendly pre-check so the student is not left waiting for a slot the tutor
  // can never approve. The real guarantee is the EXCLUDE constraint, which
  // only covers approved rows - two students may both *ask* for the same
  // window, and the tutor picks one.
  const clash = (await sql`
    SELECT 1 FROM resource_requests
    WHERE resource_id = ${resourceId} AND status = 'approved'
      AND tstzrange(start_at, end_at) && tstzrange(${startIso}::timestamptz, ${endIso}::timestamptz)
    LIMIT 1
  `) as unknown[];
  if (clash.length > 0) {
    return { error: "Someone already has that slot. Pick another time." };
  }

  await sql`
    INSERT INTO resource_requests (resource_id, student_id, reason, start_at, end_at)
    VALUES (${resourceId}, ${studentId}, ${reason}, ${startIso}, ${endIso})
  `;

  notifyAdmin({
    title: "Tool request",
    body: `A student asked for ${resource.name}.`,
    url: "/admin",
  }).catch(() => {});

  revalidatePath("/portal");
  revalidatePath("/admin");
  return {};
}

export async function cancelResourceRequest(id: number): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  const rows = (await sql`
    UPDATE resource_requests
    SET status = 'cancelled'
    WHERE id = ${id} AND student_id = ${studentId}
      AND status IN ('pending', 'approved') AND start_at > now()
    RETURNING id
  `) as unknown[];
  if (rows.length === 0) {
    return { error: "This booking has already started or been decided." };
  }
  revalidatePath("/portal");
  revalidatePath("/admin");
  return {};
}

// --- login-code relay ------------------------------------------------------

/** The student's own request row, but only while its slot is running. */
async function activeSlot(studentId: number, requestId: number) {
  const rows = (await sql`
    SELECT r.id, r.start_at, r.end_at, sr.name AS resource_name, s.name AS student_name
    FROM resource_requests r
    JOIN shared_resources sr ON sr.id = r.resource_id
    JOIN students s ON s.id = r.student_id
    WHERE r.id = ${requestId} AND r.student_id = ${studentId}
      AND r.status = 'approved'
      AND r.start_at <= now() AND now() < r.end_at
    LIMIT 1
  `) as {
    id: number;
    start_at: unknown;
    end_at: unknown;
    resource_name: string;
    student_name: string;
  }[];
  return rows[0] ?? null;
}

export async function askForLoginCode(requestId: number): Promise<{ error?: string }> {
  const studentId = await requireStudentId();

  const slot = await activeSlot(studentId, requestId);
  if (!slot) return { error: "You can only ask for a code while your slot is running." };

  const counts = (await sql`
    SELECT count(*) AS total,
           count(*) FILTER (
             WHERE used_at IS NULL AND cancelled_at IS NULL
               AND (expires_at IS NULL OR expires_at > now())
           ) AS open
    FROM resource_login_codes
    WHERE request_id = ${requestId}
  `) as { total: string; open: string }[];

  if (Number(counts[0]?.open ?? 0) > 0) {
    return { error: "You already asked - the code is on its way." };
  }
  if (Number(counts[0]?.total ?? 0) >= LOGIN_CODE_MAX_PER_SLOT) {
    return { error: "You have asked for too many codes this slot. Message your tutor." };
  }

  await sql`INSERT INTO resource_login_codes (request_id) VALUES (${requestId})`;

  // The student is sitting on the claude.ai code screen right now, so this is
  // the one alert that has to reach the tutor wherever they are: push for the
  // phone, email as the channel that survives a closed browser.
  notifyAdmin({
    title: "Login code needed",
    body: `${slot.student_name} is waiting for a ${slot.resource_name} sign-in code.`,
    url: "/admin",
  }).catch(() => {});

  const link = adminUrl();
  queueAdminEmail({
    subject: `${slot.student_name} needs a ${slot.resource_name} sign-in code`,
    heading: "Sign-in code needed",
    lines: [
      `${slot.student_name} is waiting on the claude.ai code screen right now.`,
      `Slot: ${fmtClassTime(iso(slot.start_at))} → ${fmtClassTime(iso(slot.end_at))}`,
    ],
    sections: [
      {
        title: "What to do",
        tone: "warning",
        lines: [
          'Open the "Sign in to Claude.ai" email from Anthropic.',
          "Click Sign in - claude.ai then shows you a code.",
          "Paste that code into Admin → Tools.",
          "The link expires 10 minutes after Anthropic sent it, so be quick.",
        ],
      },
    ],
    ...(link ? { link: { label: "Open the admin Tools tab", url: link } } : {}),
  });

  revalidatePath("/admin");
  return {};
}

/**
 * Polled by the student's portal every few seconds while they wait. Returns
 * the code ONLY while it is live and their slot is running - an expired or
 * used code is withheld by the server, not merely hidden in the UI.
 */
export async function getMyLoginCode(requestId: number): Promise<LoginCodeRow | null> {
  const studentId = await requireStudentId();
  await scrubExpiredCodes();

  const rows = (await sql`
    SELECT c.id, c.request_id, c.asked_at, c.sent_at, c.expires_at, c.used_at,
           CASE
             WHEN c.used_at IS NULL
              AND c.cancelled_at IS NULL
              AND (c.expires_at IS NULL OR c.expires_at > now())
              AND r.start_at <= now() AND now() < r.end_at
             THEN c.code
             ELSE NULL
           END AS code
    FROM resource_login_codes c
    JOIN resource_requests r ON r.id = c.request_id
    WHERE c.request_id = ${requestId}
      AND r.student_id = ${studentId}
      AND c.used_at IS NULL AND c.cancelled_at IS NULL
    ORDER BY c.asked_at DESC
    LIMIT 1
  `) as Record<string, unknown>[];

  const r = rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    request_id: Number(r.request_id),
    asked_at: iso(r.asked_at),
    code: (r.code as string | null) ?? null,
    sent_at: isoOrNull(r.sent_at),
    expires_at: isoOrNull(r.expires_at),
    used_at: isoOrNull(r.used_at),
  };
}

/** Student confirms they are in. The code is wiped, not just hidden. */
export async function markLoginCodeUsed(codeId: number): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  await sql`
    UPDATE resource_login_codes c
    SET used_at = now(), code = NULL
    FROM resource_requests r
    WHERE c.id = ${codeId} AND r.id = c.request_id AND r.student_id = ${studentId}
  `;
  revalidatePath("/admin");
  return {};
}

export async function cancelLoginCode(codeId: number): Promise<{ error?: string }> {
  const studentId = await requireStudentId();
  await sql`
    UPDATE resource_login_codes c
    SET cancelled_at = now(), code = NULL
    FROM resource_requests r
    WHERE c.id = ${codeId} AND r.id = c.request_id AND r.student_id = ${studentId}
      AND c.used_at IS NULL
  `;
  revalidatePath("/admin");
  return {};
}

// ===========================================================================
// ADMIN — review bookings, relay codes, manage the tool list
// ===========================================================================

export async function getResourceBoard(): Promise<ResourceBoard> {
  await assertAdmin();
  await scrubExpiredCodes();

  const [resources, requests] = await Promise.all([
    loadResources(false),
    loadRequests({ sinceDays: 60 }),
  ]);

  const codes = (await sql`
    SELECT c.id, c.request_id, c.asked_at, s.name AS student_name,
           sr.name AS resource_name, r.start_at, r.end_at
    FROM resource_login_codes c
    JOIN resource_requests r ON r.id = c.request_id
    JOIN students s ON s.id = r.student_id
    JOIN shared_resources sr ON sr.id = r.resource_id
    WHERE c.used_at IS NULL AND c.cancelled_at IS NULL AND c.sent_at IS NULL
      AND r.start_at <= now() AND now() < r.end_at
    ORDER BY c.asked_at ASC
  `) as Record<string, unknown>[];

  return {
    resources,
    requests,
    codeRequests: codes.map((c) => ({
      id: Number(c.id),
      request_id: Number(c.request_id),
      asked_at: iso(c.asked_at),
      student_name: String(c.student_name),
      resource_name: String(c.resource_name),
      start_at: iso(c.start_at),
      end_at: iso(c.end_at),
    })),
  };
}

export async function reviewResourceRequest(
  id: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();

  const status = String(formData.get("status") ?? "");
  if (!["approved", "rejected", "pending"].includes(status)) {
    return { error: "Pick approve or reject." };
  }
  const feedback = String(formData.get("feedback") ?? "").trim();

  const existing = (await sql`
    SELECT r.student_id, r.resource_id, r.start_at, r.end_at, sr.name AS resource_name,
           sr.handover_note
    FROM resource_requests r
    JOIN shared_resources sr ON sr.id = r.resource_id
    WHERE r.id = ${id}
    LIMIT 1
  `) as Record<string, unknown>[];
  const row = existing[0];
  if (!row) return { error: "That request no longer exists." };

  // Fee status can change between asking and being approved.
  if (status === "approved" && !(await hasStartedPaying(Number(row.student_id)))) {
    return { error: "This student has not paid any fee yet, so they cannot be approved." };
  }

  try {
    await sql`
      UPDATE resource_requests
      SET status = ${status},
          feedback = ${feedback || null},
          reviewed_at = CASE WHEN ${status} = 'pending' THEN NULL ELSE now() END
      WHERE id = ${id}
    `;
  } catch (e) {
    if (isOverlapViolation(e)) {
      return { error: "That slot now clashes with another approved booking." };
    }
    throw e;
  }

  if (status !== "pending") {
    const approved = status === "approved";
    const when = `${fmtClassTime(iso(row.start_at))} → ${fmtClassTime(iso(row.end_at))}`;
    notifyStudent(Number(row.student_id), {
      title: approved ? "Tool booking approved ✅" : "Tool booking rejected ❌",
      body: approved ? `${row.resource_name}: ${when}` : String(row.resource_name),
      url: "/portal",
    }).catch(() => {});
    queueStudentEmail(Number(row.student_id), {
      subject: approved
        ? `${row.resource_name} booking approved`
        : `${row.resource_name} booking not approved`,
      heading: approved ? "Your slot is booked" : "Your request was not approved",
      lines: [
        approved
          ? `You have ${row.resource_name} from ${when} (Pakistan time).`
          : `Your request for ${row.resource_name} was not approved this time.`,
        approved ? (row.handover_note as string | null) : null,
        feedback ? `Note from your tutor:\n${feedback}` : null,
      ],
    });
  }

  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function sendLoginCode(
  codeId: number,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();

  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Paste the code claude.ai showed you." };
  if (code.length > 32) return { error: "That does not look like a sign-in code." };

  const rows = (await sql`
    UPDATE resource_login_codes c
    SET code = ${code},
        sent_at = now(),
        expires_at = now() + make_interval(mins => ${LOGIN_CODE_TTL_MIN})
    FROM resource_requests r
    WHERE c.id = ${codeId} AND r.id = c.request_id
      AND c.used_at IS NULL AND c.cancelled_at IS NULL
      AND r.start_at <= now() AND now() < r.end_at
    RETURNING r.student_id
  `) as { student_id: number }[];

  if (rows.length === 0) {
    return { error: "That slot is over, or the student already used the code." };
  }
  const studentId = Number(rows[0].student_id);

  // The push deliberately carries no digits - push bodies render on a locked screen.
  notifyStudent(studentId, {
    title: "Your sign-in code is ready",
    body: "Open the portal - it expires in a few minutes.",
    url: "/portal",
  }).catch(() => {});

  // Backup copy in their own inbox, in case the portal tab is closed.
  queueStudentEmail(studentId, {
    subject: "Your Claude sign-in code",
    heading: "Sign-in code",
    lines: [
      `Code: ${code}`,
      "Use it straight away - it expires in a few minutes.",
      "Enter it on the claude.ai screen you already have open.",
    ],
  });

  revalidatePath("/admin");
  return {};
}

export async function dismissLoginCode(codeId: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`
    UPDATE resource_login_codes
    SET cancelled_at = now(), code = NULL
    WHERE id = ${codeId} AND used_at IS NULL
  `;
  revalidatePath("/admin");
  return {};
}

// --- tool CRUD -------------------------------------------------------------

export async function saveResource(
  id: number | null,
  formData: FormData
): Promise<{ error?: string }> {
  await assertAdmin();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the tool a name." };

  const blurb = String(formData.get("blurb") ?? "").trim() || null;
  const note = String(formData.get("handover_note") ?? "").trim() || null;
  const maxMinutes = Number(formData.get("max_minutes")) || RESOURCE_DEFAULT_MAX_MIN;
  const cooldown = Number(formData.get("cooldown_hours")) || RESOURCE_DEFAULT_COOLDOWN_H;
  const ahead = Number(formData.get("book_ahead_days")) || RESOURCE_DEFAULT_AHEAD_DAYS;
  const active = formData.get("is_active") === "on";
  const sort = Number(formData.get("sort_order")) || 0;

  if (maxMinutes < 15) return { error: "A booking needs at least 15 minutes." };

  try {
    if (id) {
      await sql`
        UPDATE shared_resources
        SET name = ${name}, blurb = ${blurb}, handover_note = ${note},
            max_minutes = ${maxMinutes}, cooldown_hours = ${cooldown},
            book_ahead_days = ${ahead}, is_active = ${active}, sort_order = ${sort}
        WHERE id = ${id}
      `;
    } else {
      await sql`
        INSERT INTO shared_resources
          (name, blurb, handover_note, max_minutes, cooldown_hours, book_ahead_days,
           is_active, sort_order)
        VALUES (${name}, ${blurb}, ${note}, ${maxMinutes}, ${cooldown}, ${ahead},
                ${active}, ${sort})
      `;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("idx_shared_resources_name")) {
      return { error: "A tool with that name already exists." };
    }
    throw e;
  }

  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function deleteResource(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM shared_resources WHERE id = ${id}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}

export async function deleteResourceRequest(id: number): Promise<{ error?: string }> {
  await assertAdmin();
  await sql`DELETE FROM resource_requests WHERE id = ${id}`;
  revalidatePath("/admin");
  revalidatePath("/portal");
  return {};
}
