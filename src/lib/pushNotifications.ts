import "server-only";
import webpush from "web-push";
import { sql } from "@/lib/db";

webpush.setVapidDetails(
  process.env.VAPID_EMAIL!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

type PushPayload = {
  title: string;
  body: string;
  url?: string;
};

async function sendToSubscriptions(
  subs: { endpoint: string; p256dh: string; auth: string; id: number }[],
  payload: PushPayload
) {
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
