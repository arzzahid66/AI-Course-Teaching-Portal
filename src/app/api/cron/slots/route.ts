import { sql } from "@/lib/db";
import { iso } from "@/lib/course";
import { fmtClassTime, sendAdminEmail } from "@/lib/email";
import { CLAUDE_LOGIN_EMAIL } from "@/lib/constants";

// The app's only route handler. Everything else is a server action — this
// exists because a tool slot ending is the one event with nobody in the app to
// trigger it, and killing a claude.ai session is manual: there is no API for
// consumer-account sessions, so the tutor has to do it in Settings → Account →
// Active sessions. This route's whole job is to tell them exactly which
// session to revoke, at the moment it matters.
//
// There is no scheduler in this app and Vercel's Hobby cron only fires once a
// day, so point a free external cron (cron-job.org, GitHub Actions) at it
// every ~10 minutes:
//
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/slots
//
// `revoke_notified_at` makes it idempotent: a slot is reported once, however
// often the cron fires.

export const dynamic = "force-dynamic";

type EndedSlot = {
  id: number;
  student_name: string;
  resource_name: string;
  start_at: unknown;
  end_at: unknown;
  code_times: unknown[] | null;
};

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Claim the rows and read them back in one statement, so two overlapping
  // cron runs can never both email the same slot.
  const ended = (await sql`
    UPDATE resource_requests r
    SET revoke_notified_at = now()
    FROM students s, shared_resources sr
    WHERE s.id = r.student_id AND sr.id = r.resource_id
      AND r.status = 'approved'
      AND r.end_at <= now()
      AND r.revoke_notified_at IS NULL
      -- Ignore anything ancient, e.g. the first run after deploying this.
      AND r.end_at > now() - interval '2 days'
    RETURNING r.id, s.name AS student_name, sr.name AS resource_name,
              r.start_at, r.end_at,
              ARRAY(
                SELECT c.sent_at FROM resource_login_codes c
                WHERE c.request_id = r.id AND c.sent_at IS NOT NULL
                ORDER BY c.sent_at
              ) AS code_times
  `) as EndedSlot[];

  let sent = 0;
  for (const slot of ended) {
    const window = `${fmtClassTime(iso(slot.start_at))} → ${fmtClassTime(iso(slot.end_at))}`;
    const codes = (slot.code_times ?? []).map((t) => fmtClassTime(iso(t)));

    const res = await sendAdminEmail({
      subject: `${slot.student_name} — ${slot.resource_name} slot ended`,
      heading: "Revoke the session",
      lines: [
        `${slot.student_name}'s ${slot.resource_name} slot has finished.`,
        `Slot: ${window} (Pakistan time)`,
        codes.length > 0
          ? `Sign-in codes were sent at: ${codes.join(", ")} — the session was created within a minute or two of one of those.`
          : "No sign-in code was relayed during this slot, so there may be no session to revoke.",
      ],
      sections: [
        {
          title: "What to do",
          tone: "warning",
          lines: [
            `Open claude.ai (signed in as ${CLAUDE_LOGIN_EMAIL})`,
            "Settings → Account → Active sessions",
            "Revoke any session whose Created time falls inside the slot window above.",
          ],
        },
      ],
    });

    if (res.error) {
      console.error(`[cron] slot ${slot.id} email failed:`, res.error);
    } else {
      sent += 1;
    }
  }

  return Response.json({ ended: ended.length, emailed: sent });
}
