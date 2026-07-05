import "server-only";
import webpush from "web-push";
import { sql } from "@/lib/db";

/**
 * web-push requires the VAPID "subject" to be a URL — either a `mailto:` address
 * or an https URL. A bare email ("you@example.com") is rejected with
 * "Vapid subject is not a valid URL". Normalize a plain email into `mailto:`.
 */
function vapidSubject(raw: string | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^(mailto:|https?:\/\/)/i.test(s)) return s;
  return `mailto:${s}`;
}

let vapidConfigured = false;

/**
 * Configure web-push once, lazily, right before the first send. Doing this at
 * module load previously broke the production build ("Failed to collect
 * configuration for /admin"): setVapidDetails throws when the subject/keys are
 * missing or malformed, and this module is imported by the admin actions.
 * Returns false when the config is unusable so callers skip sending instead of
 * crashing the request/route.
 */
function ensureVapidConfigured(): boolean {
  if (vapidConfigured) return true;
  const subject = vapidSubject(process.env.VAPID_EMAIL);
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    console.warn("[push] VAPID env vars missing — skipping push notifications.");
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (e) {
    console.error("[push] setVapidDetails failed — skipping push notifications:", e);
    return false;
  }
}

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

async function sendToSubscriptions(
  subs: { endpoint: string; p256dh: string; auth: string; id: number }[],
  payload: PushPayload
) {
  // Skip silently if VAPID isn't configured — a missing/invalid key must never
  // break the surrounding action (asking a question, answering one, etc.).
  if (!ensureVapidConfigured()) return;

  const stale: number[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (e: unknown) {
        // 410 Gone = subscription expired, remove it
        if (e && typeof e === "object" && "statusCode" in e && (e as { statusCode: number }).statusCode === 410) {
          stale.push(sub.id);
        }
      }
    })
  );
  if (stale.length > 0) {
    await sql`DELETE FROM push_subscriptions WHERE id = ANY(${stale})`;
  }
}

export async function notifyAdmin(payload: PushPayload) {
  const subs = (await sql`
    SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE role = 'admin'
  `) as { endpoint: string; p256dh: string; auth: string; id: number }[];
  await sendToSubscriptions(subs, payload);
}

export async function notifyStudent(studentId: number, payload: PushPayload) {
  const subs = (await sql`
    SELECT id, endpoint, p256dh, auth FROM push_subscriptions
    WHERE role = 'student' AND student_id = ${studentId}
  `) as { endpoint: string; p256dh: string; auth: string; id: number }[];
  await sendToSubscriptions(subs, payload);
}
